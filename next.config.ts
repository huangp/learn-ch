import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Self-contained server bundle for the container image (Dockerfile copies .next/standalone).
  output: 'standalone',
  // better-sqlite3 is a native addon — keep it external so it is required at
  // runtime instead of being bundled (the Drizzle handle in lib/db.ts is server-only).
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
