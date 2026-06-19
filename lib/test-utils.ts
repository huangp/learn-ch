import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DB_PATH } from '../data/pipeline/lib.js';
import * as schema from '../db/schema.js';
import type { Db } from './db.js';

let counter = 0;

export interface TestDb {
  db: Db;
  cleanup: () => void;
}

/**
 * A writable, throwaway copy of the seeded hanzi.db so tests can create learners
 * and seed learner_chars without touching the real database.
 */
export function makeTestDb(): TestDb {
  const path = join(tmpdir(), `hanzi-test-${process.pid}-${++counter}.db`);
  copyFileSync(DB_PATH, path);
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  return {
    db,
    cleanup: () => {
      sqlite.close();
      for (const suffix of ['', '-wal', '-shm']) rmSync(path + suffix, { force: true });
    },
  };
}
