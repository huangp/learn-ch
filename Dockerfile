# Multi-stage build for the Next.js app (standalone output). Single long-running container;
# the SQLite DB lives on a mounted volume (DB_PATH), NOT in the image.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# --- deps: install with build tools available for better-sqlite3's native addon ---
FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# --- build: produce .next/standalone ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# next build imports server modules (which open the DB at import) across parallel workers;
# give them a real, complete DB at the default path so page-data collection succeeds.
RUN mkdir -p data && cp seed/hanzi.db data/hanzi.db
RUN pnpm build

# --- run: minimal runtime image ---
FROM base AS run
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app

# Standalone server bundle + static assets.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# public/ is NOT included in Next's standalone output — copy it so committed static assets
# (the mnemonic art under public/art/words/*.webp) are served at runtime.
COPY --from=build /app/public ./public
# better-sqlite3 is externalized (next.config serverExternalPackages); ensure the native
# addon is present in the runtime image even if output-tracing misses it.
COPY --from=build /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
# Migrations + the migrate runner, so the volume DB can be migrated on release (see ADMIN_GUIDE).
COPY --from=build /app/db ./db
# Prompt templates are read from disk at runtime (lib/generation/prompt.ts), not bundled.
COPY --from=build /app/prompts ./prompts
# Prebuilt SQLite DB (reference tables + any seeded state). The entrypoint copies it onto the
# mounted volume on first boot only; on redeploys the existing volume DB is kept.
COPY --from=build /app/seed ./seed
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
