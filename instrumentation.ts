// Next.js instrumentation — runs once at server startup (Node runtime only). Wires a clean shutdown
// for Fly's scale-to-zero (auto_stop_machines = "suspend", min_machines_running = 0): on SIGTERM /
// SIGINT we checkpoint the SQLite WAL and close the connection BEFORE exit, so a stop can never
// interrupt a write. (A pure Fly "suspend" freezes the process without signalling and the open handle
// resumes intact; this covers the stop / deploy / host-migration paths, where the process is killed.)
// On the next request the machine cold-starts and lib/db reopens the DB at /data/hanzi.db.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { closeDb } = await import('@/lib/db');

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
}
