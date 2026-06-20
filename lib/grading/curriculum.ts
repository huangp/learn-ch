import type { Db } from '../db';
import { characters, charComponents } from '../../db/schema';

// Component-aware curriculum (§6.2). A character is never ordered before its
// teachable components; ties are broken by frequency (most frequent first).
// This is the Phase 6 core that Phase 1 needs for the placement frontier;
// selectNewChars / selectDueChars build on top of it later.

const NO_FREQ = Number.POSITIVE_INFINITY; // unranked chars sort after ranked ones

interface Node {
  id: number;
  freqRank: number;
}

/** Min-heap on freqRank, tie-broken by id for deterministic order. */
class MinHeap {
  private heap: Node[] = [];

  get size(): number {
    return this.heap.length;
  }

  private less(a: Node, b: Node): boolean {
    return a.freqRank !== b.freqRank ? a.freqRank < b.freqRank : a.id < b.id;
  }

  push(n: Node): void {
    const h = this.heap;
    h.push(n);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(h[i], h[p])) break;
      [h[i], h[p]] = [h[p], h[i]];
      i = p;
    }
  }

  pop(): Node | undefined {
    const h = this.heap;
    if (h.length === 0) return undefined;
    const top = h[0];
    const last = h.pop()!;
    if (h.length > 0) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let s = i;
        if (l < h.length && this.less(h[l], h[s])) s = l;
        if (r < h.length && this.less(h[r], h[s])) s = r;
        if (s === i) break;
        [h[i], h[s]] = [h[s], h[i]];
        i = s;
      }
    }
    return top;
  }
}

export interface Curriculum {
  order: number[]; // all charIds in curriculum order (cycle members appended at tail)
  cycleCharIds: number[]; // chars never reaching indegree 0 (dependency cycles)
}

/**
 * Topological order over the component DAG (Kahn's algorithm, freq-tie-broken).
 * Characters with all prerequisites already available (leaves: 女, 马, 口 …) surface
 * immediately — this naturally covers the "base radicals available" rule (§6.1)
 * without a hardcoded Kangxi list.
 *
 * IDS data can rarely contain cycles; any char never reaching indegree 0 is
 * appended at the end in frequency order and reported in `cycleCharIds`.
 */
export function analyzeCurriculum(db: Db): Curriculum {
  const chars = db
    .select({ id: characters.id, freqRank: characters.freqRank })
    .from(characters)
    .all();
  const edges = db
    .select({ charId: charComponents.charId, componentId: charComponents.componentId })
    .from(charComponents)
    .all();

  const freq = new Map<number, number>();
  for (const c of chars) freq.set(c.id, c.freqRank ?? NO_FREQ);

  // prereqs (distinct components per char) + reverse adjacency (component -> dependents)
  const indegree = new Map<number, number>();
  const dependents = new Map<number, number[]>();
  for (const c of chars) indegree.set(c.id, 0);

  const seenPair = new Set<string>();
  for (const e of edges) {
    if (e.charId === e.componentId) continue;
    const key = `${e.charId}|${e.componentId}`;
    if (seenPair.has(key)) continue;
    seenPair.add(key);
    indegree.set(e.charId, (indegree.get(e.charId) ?? 0) + 1);
    const deps = dependents.get(e.componentId);
    if (deps) deps.push(e.charId);
    else dependents.set(e.componentId, [e.charId]);
  }

  const ready = new MinHeap();
  for (const c of chars) if ((indegree.get(c.id) ?? 0) === 0) ready.push({ id: c.id, freqRank: freq.get(c.id)! });

  const order: number[] = [];
  while (ready.size > 0) {
    const node = ready.pop()!;
    order.push(node.id);
    for (const child of dependents.get(node.id) ?? []) {
      const d = (indegree.get(child) ?? 0) - 1;
      indegree.set(child, d);
      if (d === 0) ready.push({ id: child, freqRank: freq.get(child)! });
    }
  }

  // cycle tail: anything still blocked is in a dependency cycle — append by frequency.
  const cycleCharIds: number[] = [];
  if (order.length < chars.length) {
    const emitted = new Set(order);
    const leftover = chars
      .filter((c) => !emitted.has(c.id))
      .sort((a, b) => (a.freqRank ?? NO_FREQ) - (b.freqRank ?? NO_FREQ) || a.id - b.id);
    for (const c of leftover) {
      cycleCharIds.push(c.id);
      order.push(c.id);
    }
  }

  return { order, cycleCharIds };
}

/** Curriculum order as a flat charId list (§16.2 frontier input). */
export function buildCurriculum(db: Db): number[] {
  return analyzeCurriculum(db).order;
}

/** First charId in curriculum order not in the known set (the placement frontier, §16.2). */
export function computeFrontier(order: number[], knownCharIds: Set<number>): number | null {
  for (const id of order) if (!knownCharIds.has(id)) return id;
  return null;
}
