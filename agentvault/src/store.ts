/**
 * 记忆索引层: LRU 缓存 + 余弦相似度 + 关键词 fallback。
 */

export interface Memory {
  id: string;
  name: string;
  content: string;
  category: string;
  tags: string[];
  priority: number;
  vector: number[];
  created_at: string;
  access_count: number;
  last_accessed: string | null;
  similarity?: number;
  _score?: number;
  _fallback?: string;
}

interface SearchOptions {
  limit: number;
  category?: string | null;
  tags?: string[] | null;
  minSimilarity?: number;
  queryVec?: Float32Array;
}

export class MemoryStore {
  private memories = new Map<string, Memory>();
  private vectorCache = new Map<string, Float32Array>();

  add(memory: Memory): void {
    this.memories.set(memory.id, memory);
    if (memory.vector?.length) {
      this.vectorCache.set(memory.id, new Float32Array(memory.vector));
    }
    // LRU: keep max 5000 in memory
    if (this.memories.size > 5000) {
      const oldest = [...this.memories.values()]
        .sort((a, b) => (a.access_count || 0) - (b.access_count || 0) || (a.priority || 5) - (b.priority || 5))
        .slice(0, 1000);
      for (const m of oldest) {
        this.memories.delete(m.id);
        this.vectorCache.delete(m.id);
      }
    }
  }

  get(id: string): Memory | null {
    return this.memories.get(id) ?? null;
  }

  remove(id: string): boolean {
    this.vectorCache.delete(id);
    return this.memories.delete(id);
  }

  touch(id: string): void {
    const m = this.memories.get(id);
    if (m) {
      m.access_count++;
      m.last_accessed = new Date().toISOString();
    }
  }

  size(): number {
    return this.memories.size;
  }

  list(opts: {
    category?: string | null;
    tags?: string[] | null;
    limit: number;
    offset: number;
  }): Memory[] {
    let results = [...this.memories.values()];

    if (opts.category) {
      results = results.filter((m) => m.category === opts.category);
    }
    if (opts.tags?.length) {
      results = results.filter((m) => opts.tags!.some((t) => m.tags.includes(t)));
    }

    return results
      .sort((a, b) => {
        const aTime = a.last_accessed ? new Date(a.last_accessed).getTime() : new Date(a.created_at).getTime();
        const bTime = b.last_accessed ? new Date(b.last_accessed).getTime() : new Date(b.created_at).getTime();
        return bTime - aTime;
      })
      .slice(opts.offset, opts.offset + opts.limit);
  }

  search(rawQuery: string, options: SearchOptions): Memory[] {
    const queryVec = options.queryVec;
    if (queryVec) {
      return this.vectorSearch(queryVec, options);
    }
    return this.keywordSearch(rawQuery, options);
  }

  /** 余弦相似度检索 */
  private vectorSearch(queryVec: Float32Array, options: SearchOptions): Memory[] {
    const { limit, category, tags, minSimilarity } = options;
    let candidates = [...this.memories.values()];

    if (category) candidates = candidates.filter((m) => m.category === category);
    if (tags?.length) candidates = candidates.filter((m) => tags.some((t) => m.tags.includes(t)));

    const scored = candidates.map((m) => {
      const mv = this.vectorCache.get(m.id);
      if (!mv) return { memory: m, similarity: 0, score: 0 }; // 无向量 → 不得分
      const sim = cosineSimilarity(queryVec, mv);
      const score = sim * ((m.priority || 5) / 5) * (1 + Math.min(m.access_count, 10) * 0.05);
      return { memory: m, similarity: sim, score };
    });

    return scored
      .filter((s) => s.score > 0 && s.similarity >= (minSimilarity ?? 0.6))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s): Memory => ({ ...s.memory, similarity: s.similarity, _score: s.score }));
  }

  /** 降级: 无向量时的关键词匹配 */
  keywordSearch(query: string, options: { limit: number; category?: string | null; tags?: string[] | null }): Memory[] {
    const tokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
    if (tokens.length === 0) return [];
    let candidates = [...this.memories.values()];

    if (options.category) {
      candidates = candidates.filter((m) => m.category === options.category);
    }
    if (options.tags?.length) {
      candidates = candidates.filter((m) => options.tags!.some((t) => m.tags.includes(t)));
    }

    return candidates
      .map((m) => {
        const content = m.content.toLowerCase();
        const hits = tokens.filter((t) => content.includes(t)).length;
        const nameHits = tokens.filter((t) => m.name.toLowerCase().includes(t)).length;
        const keywordScore = hits * 2 + nameHits * 3;
        if (keywordScore === 0) return { memory: m, score: 0 };
        return { memory: m, score: keywordScore + (m.priority || 5) };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, options.limit)
      .map((s): Memory => ({ ...s.memory, similarity: 0, _score: s.score, _fallback: "keyword" }));
  }

  stats() {
    const all = [...this.memories.values()];
    const categories: Record<string, number> = {};
    const tagCounts: Record<string, number> = {};
    for (const m of all) {
      categories[m.category] = (categories[m.category] || 0) + 1;
      for (const t of m.tags) tagCounts[t] = (tagCounts[t] || 0) + 1;
    }
    const sorted = all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return {
      total: all.length,
      categories,
      top_tags: Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 10),
      oldest: sorted[sorted.length - 1]?.created_at ?? null,
      newest: sorted[0]?.created_at ?? null,
      total_accesses: all.reduce((s, m) => s + m.access_count, 0),
    };
  }
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] ** 2;
    normB += b[i] ** 2;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** Character 3-gram Jaccard similarity.
 *  Captures short technical terms ("AI", "DB", "CI") naturally
 *  embedded in n-grams, unlike word-level Jaccard that filters ≤2 chars. */
export function contentOverlap(a: string, b: string): number {
  const ngramsA = charNgrams(a, 3);
  const ngramsB = charNgrams(b, 3);
  if (ngramsA.size === 0 || ngramsB.size === 0) return 0;
  let intersection = 0;
  for (const ng of ngramsA) {
    if (ngramsB.has(ng)) intersection++;
  }
  return intersection / Math.min(ngramsA.size, ngramsB.size);
}

function charNgrams(text: string, n: number): Set<string> {
  const normalized = text.toLowerCase().replace(/\s+/g, " ");
  const ngrams = new Set<string>();
  for (let i = 0; i <= normalized.length - n; i++) {
    ngrams.add(normalized.slice(i, i + n));
  }
  return ngrams;
}

/** Unicode-safe string truncation using Intl.Segmenter (grapheme clusters).
 *  Never splits surrogate pairs, ZWJ sequences, or combining marks. */
export function safeTruncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
  const segments = [...segmenter.segment(text)];
  if (segments.length <= maxLen) return text;
  return segments.slice(0, maxLen).map((s) => s.segment).join("");
}
