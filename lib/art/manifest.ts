import manifestJson from '../../public/art/manifest.json';

// Runtime read of the build-time art manifest (written by `art/build.ts` / `pnpm art:build`).
// Bundled at build via the JSON import — no file I/O. Maps a word → its prebuilt image asset.

export interface ArtEntry {
  id: number;
  path: string; // app URL, e.g. /art/words/234.webp
  bytes: number;
  sha256: string;
  sentence?: string; // short Chinese example sentence using the word
}
interface ArtManifestShape {
  version: number;
  images: Record<string, ArtEntry>;
}

const manifest = manifestJson as ArtManifestShape;

export function getArtEntry(word: string): ArtEntry | null {
  return manifest.images[word] ?? null;
}

export function wordHasArt(word: string): boolean {
  return word in manifest.images;
}

/** All words that have a prebuilt image. */
export function artWords(): string[] {
  return Object.keys(manifest.images);
}
