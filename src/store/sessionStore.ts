import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Session } from "../types.js";

export interface SessionStore {
  get(userHandle: string): Session | undefined;
  /** Looks a session up by its short slug, for the /s/:id page. */
  getById(id: string): Session | undefined;
  /**
   * Sessions whose phone number ends in these digits. Used by the voice tools when the call has
   * no caller ID; returns every match so an ambiguous one can be refused rather than guessed.
   */
  findByLast4(last4: string): Session[];
  save(session: Session): void;
  reset(userHandle: string): void;
  /** Records an event ID; returns false if it was already seen (NFR-GW-02). */
  markSeen(eventId: string): boolean;
}

export class SqliteSessionStore implements SessionStore {
  private db: Database.Database;

  constructor(file = "data/clutterbot.db") {
    if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (user_handle TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events_seen (event_id TEXT PRIMARY KEY, seen_at TEXT NOT NULL);
    `);
    // Rotate legacy 32-bit photo links before exposing this server through a public tunnel.
    const legacy = this.db.prepare("SELECT user_handle, json FROM sessions WHERE length(json_extract(json, '$.id')) = 8")
      .all() as { user_handle: string; json: string }[];
    for (const row of legacy) {
      const session = JSON.parse(row.json) as Session;
      session.id = randomUUID().replaceAll("-", "");
      this.save(session);
    }
    this.db.exec("CREATE INDEX IF NOT EXISTS sessions_id ON sessions (json_extract(json, '$.id'))");
  }

  get(userHandle: string) {
    const row = this.db.prepare("SELECT json FROM sessions WHERE user_handle = ?").get(userHandle) as { json: string } | undefined;
    return row && (JSON.parse(row.json) as Session);
  }

  findByLast4(last4: string) {
    const rows = this.db
      .prepare("SELECT json FROM sessions WHERE replace(replace(replace(user_handle, '+', ''), '-', ''), ' ', '') LIKE ?")
      .all(`%${last4}`) as { json: string }[];
    return rows.map((r) => JSON.parse(r.json) as Session);
  }

  getById(id: string) {
    const row = this.db
      .prepare("SELECT json FROM sessions WHERE json_extract(json, '$.id') = ?")
      .get(id) as { json: string } | undefined;
    return row && (JSON.parse(row.json) as Session);
  }

  save(session: Session) {
    session.updatedAt = new Date().toISOString();
    this.db
      .prepare("INSERT OR REPLACE INTO sessions (user_handle, json, updated_at) VALUES (?, ?, ?)")
      .run(session.userHandle, JSON.stringify(session), session.updatedAt);
  }

  reset(userHandle: string) {
    this.db.prepare("DELETE FROM sessions WHERE user_handle = ?").run(userHandle);
  }

  markSeen(eventId: string) {
    return this.db.prepare("INSERT OR IGNORE INTO events_seen (event_id, seen_at) VALUES (?, ?)").run(eventId, new Date().toISOString()).changes > 0;
  }
}
