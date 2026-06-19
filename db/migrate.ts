import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { existsSync } from 'node:fs';
import { DB_PATH, MIGRATIONS } from '../data/pipeline/lib.js';

// Apply pending migrations to the EXISTING seeded hanzi.db without reseeding.
// (data:build wipes + reseeds; this only runs the migrator's pending entries.)
function main() {
  if (!existsSync(DB_PATH)) {
    console.error(`✗ DB not found at ${DB_PATH} — run \`pnpm data:build\` first.`);
    process.exit(1);
  }
  const sqlite = new Database(DB_PATH);
  sqlite.pragma('journal_mode = WAL');
  migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS });
  sqlite.close();
  console.log('✓ migrations applied to', DB_PATH);
}

main();
