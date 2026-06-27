import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { DB_PATH } from '../data/pipeline/lib';
import * as schema from '../db/schema';

export type Db = BetterSQLite3Database<typeof schema>;

function applyPragmas(sqlite: Database.Database): void {
  sqlite.pragma('busy_timeout = 5000'); // wait, don't fail, when another opener holds the lock
  sqlite.pragma('journal_mode = WAL'); // single-writer file; WAL keeps reads non-blocking
  sqlite.pragma('foreign_keys = ON'); // required for learner_chars ON DELETE CASCADE
}

/** Open a Drizzle handle on a SQLite file (defaults to the seeded hanzi.db). */
export function openDb(path: string = DB_PATH): Db {
  const sqlite = new Database(path);
  applyPragmas(sqlite);
  return drizzle(sqlite, { schema });
}

// The shared runtime connection, opened at module load (server startup). It is reopened on every
// cold start / resume — we never assume this handle survives a Fly suspend or stop. Clean shutdown
// is wired in instrumentation.ts via closeDb() below.
const sharedSqlite = new Database(DB_PATH);
applyPragmas(sharedSqlite);
export const db: Db = drizzle(sharedSqlite, { schema });

/**
 * Clean shutdown for scale-to-zero: checkpoint the WAL back into the main DB file and close the
 * connection, so a Fly stop/suspend can never interrupt a half-written WAL. Idempotent; the
 * checkpoint is best-effort so a failure can't block process exit.
 */
export function closeDb(): void {
  if (!sharedSqlite.open) return;
  try {
    sharedSqlite.pragma('wal_checkpoint(TRUNCATE)');
  } catch {
    // best-effort — must not block shutdown
  }
  sharedSqlite.close();
}

export { schema };
