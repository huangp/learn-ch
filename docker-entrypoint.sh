#!/bin/sh
set -e

# Seed the persistent volume on first boot only. The reference tables (characters, words,
# char_components) live inside the DB file, which is baked into the image at /app/seed/hanzi.db.
# On redeploys /data/hanzi.db already exists, so learner state on the volume is preserved.
if [ ! -f /data/hanzi.db ]; then
  echo "Seeding /data/hanzi.db from baked image copy…"
  cp /app/seed/hanzi.db /data/hanzi.db
fi

exec node server.js
