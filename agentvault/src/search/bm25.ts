/**
 * BM25 (Okapi BM25) — pure TypeScript, zero dependencies.
 * Used as the keyword-scoring component in hybrid search.
 *
 * k1=1.5, b=0.75 — standard values from TREC experiments.
 */

export interface Bm25Doc {
  id: string;
  tokens: string[];
}

export class Bm25 {
  private docs: Bm25Doc[] = [];
  private avgDocLen = 0;
  private idf = new Map<string, number>();
  private readonly k1: number;
  private readonly b: number;

  constructor(opts?: { k1?: number; b?: number }) {
    this.k1 = opts?.k1 ?? 1.5;
    this.b = opts?.b ?? 0.75;
  }

  /** Tokenize text: lowercase, split on whitespace/punctuation, keep tokens >=2 chars. */
  static tokenize(text: string): string[] {
    const cleaned = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ");
    return cleaned.split(/\s+/).filter((t) => t.length >= 2);
  }

  /** Add documents to the corpus and recompute IDF. */
  index(docs: Bm25Doc[]): void {
    this.docs = docs;
    this.avgDocLen =
      docs.length > 0 ? docs.reduce((s, d) => s + d.tokens.length, 0) / docs.length : 0;

    // IDF: log((N - df + 0.5) / (df + 0.5) + 1)
    const N = docs.length;
    const df = new Map<string, number>();
    const seen = new Set<string>();
    for (const d of docs) {
      seen.clear();
      for (const t of d.tokens) {
        if (!seen.has(t)) {
          seen.add(t);
          df.set(t, (df.get(t) ?? 0) + 1);
        }
      }
    }
    this.idf.clear();
    for (const [term, docFreq] of df) {
      this.idf.set(term, Math.log((N - docFreq + 0.5) / (docFreq + 0.5) + 1));
    }
  }

  /** Score a single document against query tokens. */
  score(doc: Bm25Doc, queryTokens: string[]): number {
    if (queryTokens.length === 0 || doc.tokens.length === 0) return 0;
    let total = 0;
    const docLenRatio = doc.tokens.length / Math.max(this.avgDocLen, 1);

    for (const qt of queryTokens) {
      const idfVal = this.idf.get(qt) ?? 0;
      if (idfVal === 0) continue;
      const tf = doc.tokens.filter((t) => t === qt).length;
      // BM25 TF saturation
      const numerator = (this.k1 + 1) * tf;
      const denominator = this.k1 * (1 - this.b + this.b * docLenRatio) + tf;
      total += idfVal * (numerator / denominator);
    }
    return total;
  }

  /** Search: score all docs against query, return top-N sorted results. */
  search(query: string, limit: number = 10): { id: string; score: number }[] {
    const queryTokens = Bm25.tokenize(query);
    if (queryTokens.length === 0) return [];

    return this.docs
      .map((d) => ({ id: d.id, score: this.score(d, queryTokens) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
