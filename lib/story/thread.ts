import type { StoryRecord } from './persist';

// Branch continuations ("What happens next?") persist `parentStoryId` (see persist.ts /
// chooseBranchAction), so a learner's stories form a forest: each root (no parent) plus the
// tree of continuations under it. These pure helpers turn the flat `listStoriesForLearner`
// list into that structure for the UI — no DB query, no migration.
//
// Branching is a tree, not a line: a learner can revisit an older story and pick a different
// choice, producing two sequels from one parent (a fork). "Part N" = depth from the root
// (root = Part 1); forks are alternate continuations sharing a part number.

export interface ThreadNode {
  story: StoryRecord;
  /** 1-based depth from the root. Root = 1. */
  part: number;
  /** Direct sequels, ordered oldest-first. */
  children: ThreadNode[];
}

const byCreatedAtAsc = (a: StoryRecord, b: StoryRecord): number =>
  a.createdAt - b.createdAt || a.id - b.id;

/** Build a node and its subtree from the children index. */
function buildNode(story: StoryRecord, part: number, childrenOf: Map<number, StoryRecord[]>): ThreadNode {
  const kids = childrenOf.get(story.id) ?? [];
  return {
    story,
    part,
    children: kids.slice().sort(byCreatedAtAsc).map((c) => buildNode(c, part + 1, childrenOf)),
  };
}

/** Index stories by id and group children by parent id. */
function indexStories(stories: StoryRecord[]): {
  byId: Map<number, StoryRecord>;
  childrenOf: Map<number, StoryRecord[]>;
} {
  const byId = new Map<number, StoryRecord>();
  for (const s of stories) byId.set(s.id, s);
  const childrenOf = new Map<number, StoryRecord[]>();
  for (const s of stories) {
    // A story is a root when it has no parent, or its parent isn't in this learner's set
    // (defensive — shouldn't happen, but never orphan a story out of the list).
    if (s.parentStoryId != null && byId.has(s.parentStoryId)) {
      const list = childrenOf.get(s.parentStoryId) ?? [];
      list.push(s);
      childrenOf.set(s.parentStoryId, list);
    }
  }
  return { byId, childrenOf };
}

function isRoot(s: StoryRecord, byId: Map<number, StoryRecord>): boolean {
  return s.parentStoryId == null || !byId.has(s.parentStoryId);
}

/**
 * Split a learner's stories into multi-story threads (a root with ≥1 descendant) and
 * standalone singletons. Threads are ordered by their most-recent story (newest-first) to
 * match the flat list's current feel; singletons keep their incoming order.
 */
export function groupIntoThreads(stories: StoryRecord[]): {
  threads: ThreadNode[];
  singletons: StoryRecord[];
} {
  const { byId, childrenOf } = indexStories(stories);
  const threads: ThreadNode[] = [];
  const singletons: StoryRecord[] = [];
  for (const s of stories) {
    if (!isRoot(s, byId)) continue;
    if (childrenOf.has(s.id)) threads.push(buildNode(s, 1, childrenOf));
    else singletons.push(s);
  }
  threads.sort((a, b) => newestCreatedAt(b) - newestCreatedAt(a));
  return { threads, singletons };
}

/** The most recent createdAt anywhere in a thread (for newest-first thread ordering). */
function newestCreatedAt(node: ThreadNode): number {
  return node.children.reduce((max, c) => Math.max(max, newestCreatedAt(c)), node.story.createdAt);
}

/** Pre-order (depth-first) flatten of a thread, so a fork's subtree stays contiguous under it. */
export function flattenThread(node: ThreadNode): ThreadNode[] {
  return [node, ...node.children.flatMap(flattenThread)];
}

/**
 * Parent + direct sequels + part number for one story, for the reader page. Returns null if the
 * story isn't in the list. `parent`/`children` empty means a standalone story (no series UI).
 */
export function getThreadContext(
  stories: StoryRecord[],
  storyId: number,
): { parent: StoryRecord | null; children: StoryRecord[]; part: number } | null {
  const { byId, childrenOf } = indexStories(stories);
  const story = byId.get(storyId);
  if (!story) return null;

  const parent = story.parentStoryId != null ? byId.get(story.parentStoryId) ?? null : null;
  const children = (childrenOf.get(storyId) ?? []).slice().sort(byCreatedAtAsc);

  // Depth = walk up parent links until a root. Cycle-guarded defensively.
  let part = 1;
  const seen = new Set<number>([storyId]);
  let cur = parent;
  while (cur && !seen.has(cur.id)) {
    part += 1;
    seen.add(cur.id);
    cur = cur.parentStoryId != null ? byId.get(cur.parentStoryId) ?? null : null;
  }

  return { parent, children, part };
}
