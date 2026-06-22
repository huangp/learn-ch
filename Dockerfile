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
# better-sqlite3 is externalized (next.config serverExternalPackages); ensure the native
# addon is present in the runtime image even if output-tracing misses it.
COPY --from=build /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
# Migrations + the migrate runner, so the volume DB can be migrated on release (see ADMIN_GUIDE).
COPY --from=build /app/db ./db
# Prompt templates are read from disk at runtime (lib/generation/prompt.ts), not bundled.
COPY --from=build /app/prompts ./prompts

EXPOSE 3000
CMD ["node", "server.js"]
