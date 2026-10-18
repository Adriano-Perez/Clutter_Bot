import { cloud } from "spectrum-ts";
import { createGrpcClient } from "@photon-ai/advanced-imessage/grpc";

export interface RecoveryMessage { guid: string; dateCreated: Date; isFromMe: boolean; }

/** Page all new inbound messages; the router deduplicates them against live stream events. */
export async function recoverMessages<T extends RecoveryMessage>(
  list: (options: { after: Date; isFromMe: false; pageSize: number; pageToken?: string }) => Promise<{ messages: readonly T[]; nextPageToken?: string }>,
  since: Date,
  receive: (message: T) => Promise<void>,
): Promise<Date> {
  let pageToken: string | undefined;
  const messages: T[] = [];
  do {
    const page = await list({ after: since, isFromMe: false, pageSize: 100, ...(pageToken ? { pageToken } : {}) });
    messages.push(...page.messages.filter((m) => !m.isFromMe && m.dateCreated >= since));
    pageToken = page.nextPageToken;
  } while (pageToken);
  messages.sort((a, b) => a.dateCreated.getTime() - b.dateCreated.getTime() || a.guid.localeCompare(b.guid));
  for (const message of messages) await receive(message);
  // Overlap by one second to catch messages with equal timestamps or delayed indexing.
  const latest = messages.at(-1)?.dateCreated.getTime();
  return latest === undefined ? since : new Date(Math.max(since.getTime(), latest - 1000));
}

/** Shared-number projects can silently miss live events; read registered chats as a safety net. */
export async function startRecovery(
  projectId: string,
  projectSecret: string,
  receive: (chat: string, guid: string) => Promise<void>,
  since = new Date(),
): Promise<void> {
  const token = await cloud.issueImessageTokens(projectId, projectSecret);
  if (token.type !== "shared") return;
  let refreshAt = Date.now() + Math.max(30, token.expiresIn - 60) * 1000;
  let bearer = token.token;
  const client = createGrpcClient({
    address: process.env.SPECTRUM_IMESSAGE_ADDRESS ?? "imessage.spectrum.photon.codes:443",
    timeout: 10_000,
    token: async () => {
      if (Date.now() >= refreshAt) {
        const fresh = await cloud.issueImessageTokens(projectId, projectSecret);
        if (fresh.type !== "shared") throw new Error("Photon routing changed; restart the bot");
        bearer = fresh.token;
        refreshAt = Date.now() + Math.max(30, fresh.expiresIn - 60) * 1000;
      }
      return bearer;
    },
  });
  const auth = `Basic ${Buffer.from(`${projectId}:${projectSecret}`).toString("base64")}`;
  const cursors = new Map<string, Date>();
  const enqueued = new Map<string, number>();
  const retries = new Map<string, string>();
  const enqueue = (chat: string, guid: string) => {
    if (enqueued.has(guid)) return;
    enqueued.set(guid, Date.now());
    void receive(chat, guid).then(() => retries.delete(guid)).catch((error) => {
      enqueued.delete(guid);
      retries.set(guid, chat);
      console.error("photon: recovered message failed", (error as Error).message);
    });
  };
  let users: { phoneNumber: string }[] = [];
  let usersAt = 0;
  console.log("photon: shared-chat recovery enabled (5s poll)");
  for (;;) {
    try {
      for (const [guid, chat] of retries) enqueue(chat, guid);
      if (Date.now() - usersAt > 15_000) {
        const response = await fetch(`https://spectrum.photon.codes/projects/${projectId}/users/`, {
          headers: { Authorization: auth }, signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error(`Photon users lookup failed (${response.status})`);
        const body = await response.json() as { data: { users: { phoneNumber: string }[] } };
        users = body.data.users;
        usersAt = Date.now();
      }
      for (const [guid, at] of enqueued) if (Date.now() - at > 600_000) enqueued.delete(guid);
      await Promise.all(users.map(async (user) => {
        const chat = `any;-;${user.phoneNumber}`;
        try {
          const cursor = await recoverMessages(
            (options) => client.messages.listInChat(chat, options),
            cursors.get(chat) ?? since,
            async (message) => { enqueue(chat, message.guid); },
          );
          cursors.set(chat, cursor);
        } catch (error) {
          console.error("photon: chat recovery failed", (error as Error).message.replace(/\+\d{7,15}/g, "[phone]"));
        }
      }));
    } catch (error) {
      console.error("photon: recovery poll failed", (error as Error).message);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}
