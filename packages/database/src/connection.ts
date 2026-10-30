import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS_DIR } from './paths.js';

export type { DatabaseSync };

/** Opens (and creates) a SQLite database. Use ':memory:' for tests. */
export function openSqlite(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  return db;
}

export interface MigrationFile {
  version: number;
  name: string;
  sql: string;
}

export function loadMigrations(dir: string = MIGRATIONS_DIR): MigrationFile[] {
  return readdirSync(dir)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort()
    .map((f) => ({ version: Number(f.split('_')[0]), name: f, sql: readFileSync(`${dir}/${f}`, 'utf8') }));
}

/** Applies pending numbered migrations, each in its own transaction. Returns applied file names. */
export function migrate(db: DatabaseSync, migrations: MigrationFile[] = loadMigrations()): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`);
  const done = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map((r) => r.version),
  );
  const applied: string[] = [];
  for (const m of migrations) {
    if (done.has(m.version)) continue;
    db.exec('BEGIN');
    try {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        m.version,
        m.name,
        new Date().toISOString(),
      );
      db.exec('COMMIT');
      applied.push(m.name);
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${m.name} failed: ${(err as Error).message}`);
    }
  }
  return applied;
}
