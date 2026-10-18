import { HONESTY } from "../commands.js";
import { groupLine, groupPlan } from "../plan.js";
import type { Session } from "../types.js";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const STYLE = `
:root { color-scheme: light dark; --fg: #16181d; --dim: #6b7280; --line: #e4e4e7; --bg: #fff; --card: #fafafa; }
@media (prefers-color-scheme: dark) {
  :root { --fg: #ececf1; --dim: #9ca3af; --line: #2a2d34; --bg: #15171c; --card: #1c1f26; }
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 24px 18px 56px; background: var(--bg); color: var(--fg);
  font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  max-width: 560px; margin-inline: auto; overflow-wrap: break-word;
}
h1 { font-size: 21px; margin: 0 0 2px; letter-spacing: -0.01em; }
h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--dim); margin: 32px 0 10px; }
.sub { color: var(--dim); font-size: 14px; margin: 0 0 24px; }
img { width: 100%; height: auto; border-radius: 12px; border: 1px solid var(--line); display: block; }
figure { margin: 0 0 8px; }
figcaption { color: var(--dim); font-size: 13px; margin-top: 8px; }
ul { list-style: none; padding: 0; margin: 0; }
li {
  background: var(--card); border: 1px solid var(--line); border-radius: 10px;
  padding: 11px 13px; margin-bottom: 8px; font-size: 15px;
}
.where { font-weight: 600; }
.why { color: var(--dim); }
.note { color: var(--dim); font-size: 13px; border-top: 1px solid var(--line); margin-top: 32px; padding-top: 16px; }
.empty { color: var(--dim); }
`;

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body>
${body}
</body>
</html>`;
}

export function notFoundPage(): string {
  return layout("Not found", `<h1>No such plan</h1><p class="sub">That link has expired, or the session was reset.</p>`);
}

/** Splits "A storage bin — 1 charger, 2 cable (stored out of the way)" into its three parts. */
function splitLine(line: string): { where: string; what: string; why?: string } {
  const [head, ...rest] = line.split(" — ");
  const body = rest.join(" — ");
  const match = /^(.*?)\s*\(([^)]*)\)$/.exec(body);
  return match ? { where: head!, what: match[1]!, why: match[2]! } : { where: head!, what: body };
}

/**
 * The plan as a page you can tap from the message thread (FR-PLAN-03).
 *
 * Everything is rendered server-side from the stored session, with no scripts and no network
 * calls, so it loads instantly over a hotspot. Photos come from /s/:id/photo/... rather than a
 * filesystem path, so no part of the media directory is reachable by guessing a URL.
 */
export function planPage(session: Session, basePath: string): string {
  const zones = session.zones.map(({ id, label }) => ({ id, label }));
  const groups = groupPlan(session.items, zones);

  const parts: string[] = [
    `<h1>Your space</h1>`,
    `<p class="sub">${session.items.length} ${session.items.length === 1 ? "thing" : "things"}, ` +
      `${groups.length} ${groups.length === 1 ? "place" : "places"} for them to go.</p>`,
  ];

  if (session.beforePhoto) {
    parts.push(
      `<figure><img src="${escapeHtml(basePath)}/photo/before" alt="Your desk with every item numbered and every storage spot lettered">`,
      `<figcaption>Items numbered, storage spots lettered.</figcaption></figure>`,
    );
  }

  parts.push(`<h2>The plan</h2>`);
  if (groups.length === 0) {
    parts.push(`<p class="empty">No plan yet — answer the question in the message thread.</p>`);
  } else {
    const items = groups.map((group) => {
      const { where, why } = splitLine(groupLine(group));
      const what = group.items.map((item) => `${item.id} ${item.label}`).join(", ");
      return (
        `<li><span class="where">${escapeHtml(where)}</span> — ${escapeHtml(what)}` +
        (why ? `<br><span class="why">${escapeHtml(why)}</span>` : "") +
        `</li>`
      );
    });
    parts.push(`<ul>${items.join("")}</ul>`);
  }

  if (session.items.some((item) => item.evidence.some((e) => e.state === "claimed" || e.state !== "seen"))) {
    const photoStatus: Record<string, string> = {
      seen: "seen in the first photo", verified: "matches the plan", still_here: "needs attention",
      not_visible: "not visible; destination unconfirmed",
    };
    const progress = session.items.map((item) => {
      const claimed = session.steps.some((step) => step.itemId === item.id && step.done);
      const latestPhoto = item.evidence.findLast((e) => e.source === "photo");
      return `<li><strong>${item.id} ${escapeHtml(item.label)}</strong><br>` +
        `${claimed ? "You said: done · " : ""}Photo: ${escapeHtml(photoStatus[latestPhoto?.state ?? ""] ?? "not checked yet")}</li>`;
    });
    parts.push(`<h2>Progress</h2><ul>${progress.join("")}</ul>`);
  }

  if (session.afterPhotos.length > 0) {
    parts.push(
      `<h2>How it went</h2>`,
      `<figure><img src="${escapeHtml(basePath)}/photo/after" alt="Your desk after tidying, with each item marked green or red">`,
      `<figcaption>Green circles match the plan. Red squares still need attention.</figcaption></figure>`,
    );
  }

  if (session.verificationSummary) parts.push(`<p>${escapeHtml(session.verificationSummary)}</p>`);

  parts.push(`<p class="note">${escapeHtml(HONESTY)}</p>`);
  return layout("Your desk · ClutterBot", parts.join("\n"));
}
