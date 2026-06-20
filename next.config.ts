import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // better-sqlite3 is a native addon — keep it external so it is required at
  // runtime instead of being bundled (the Drizzle handle in lib/db.ts is server-only).
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
