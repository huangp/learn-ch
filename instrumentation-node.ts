// Node-only half of instrumentation.ts — kept in its own module so the Edge compile of
// instrumentation.ts never sees `process.once` (Next statically flags Node APIs there even behind a
// runtime guard). See instrumentation.ts for why we checkpoint/close SQLite on shutdown.
import { closeDb } from '@/lib/db';

let done = false;
const shutdown = () => {
  if (done) return; // guard against SIGTERM+SIGINT both firing
  done = true;
  closeDb();
  process.exit(0);
};
// Handle both: Fly's kill_signal may be SIGTERM or SIGINT, so we don't depend on which is sent.
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
