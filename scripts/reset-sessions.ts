// Demo helper: forget every user's session so the next message starts from scratch.
// Usage: npm run reset
import Database from "better-sqlite3";
import { existsSync } from "node:fs";

const DB_FILE = "data/clutterbot.db";

if (!existsSync(DB_FILE)) {
  console.log(`${DB_FILE} not found; nothing to reset`);
  process.exit(0);
}

const db = new Database(DB_FILE);
const hasTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sessions'").get();
const { changes } = hasTable ? db.prepare("DELETE FROM sessions").run() : { changes: 0 };
db.close();
console.log(`deleted ${changes} session(s) from ${DB_FILE}`);
