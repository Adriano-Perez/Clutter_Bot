import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Session } from "../types.js";

export interface SessionStore {
  get(userHandle: string): Session | undefined;
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
  }

  get(userHandle: string) {
    const row = this.db.prepare("SELECT json FROM sessions WHERE user_handle = ?").get(userHandle) as { json: string } | undefined;
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
