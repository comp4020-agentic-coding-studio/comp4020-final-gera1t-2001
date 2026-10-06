import Database from "better-sqlite3";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

// In production fly.toml mounts a volume at /data — the only storage that
// survives a restart or redeploy. Locally there's no volume, so this falls
// back to a gitignored file under the repo.
export const dbPath = process.env.DB_PATH ?? "./data/dev.sqlite3";

mkdirSync(dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// No ORM (ADR 0001), so migrations are plain numbered .sql files applied in
// order on boot, tracked by name in schema_migrations.
const migrationsDir = resolve(import.meta.dirname, "..", "migrations");

function applyMigrations(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  const applied = new Set(
    (db.prepare("SELECT name FROM schema_migrations").all() as { name: string }[]).map((row) => row.name),
  );

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(resolve(migrationsDir, file), "utf8");
    db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (name) VALUES (?)").run(file);
    })();
  }
}

applyMigrations();
