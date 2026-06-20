import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { DB_PATH } from '../data/pipeline/lib';
import * as schema from '../db/schema';

export type Db = BetterSQLite3Database<typeof schema>;

/** Open a Drizzle handle on a SQLite file (defaults to the seeded hanzi.db). */
export function openDb(path: string = DB_PATH): Db {
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON'); // required for learner_chars ON DELETE CASCADE
  return drizzle(sqlite, { schema });
}

/** Shared connection to the project database. */
export const db = openDb();

export { schema };
