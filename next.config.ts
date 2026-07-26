import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Self-contained server bundle for the container image (Dockerfile copies .next/standalone).
  output: 'standalone',
  // better-sqlite3 is a native addon — keep it external so it is required at
  // runtime instead of being bundled (the Drizzle handle in lib/db.ts is server-only).
  // mammoth / pdfjs-dist parse uploaded documents server-side (lib/document/parse.ts);
  // keep them external too so Turbopack doesn't bundle their large dynamic requires.
  serverExternalPackages: ['better-sqlite3', 'mammoth', 'pdfjs-dist'],
};

export default nextConfig;
