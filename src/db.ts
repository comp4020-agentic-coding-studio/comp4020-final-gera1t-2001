import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// In production fly.toml mounts a volume at /data — the only storage that
// survives a restart or redeploy. Locally there's no volume, so this falls
// back to a gitignored file under the repo.
export const dbPath = process.env.DB_PATH ?? "./data/dev.sqlite3";

mkdirSync(dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
