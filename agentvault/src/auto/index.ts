/**
 * 后台自动化引擎: 全部用户无感知。
 */

import type { MemoryStore, Memory } from "../store.js";
import { contentOverlap, safeTruncate } from "../store.js";
import { saveMemory } from "../storage/local.js";
import { embed } from "../embedding.js";

/** 自动命名: 首句提取 + 词边界截断。不切词，不停半截。
 *  用户可通过 memory_store({ name: "..." }) 覆盖。 */
export function autoName(content: string): string {
  // Strip code blocks and inline code
  const clean = content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`/g, "")
    .replace(/\n/g, ". ")     // newlines as sentence boundaries
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "memory";

  // Find first natural sentence boundary
  const endMarkers = [". ", "? ", "! ", ".\" ", ".\n"];
  let end = -1;
  for (const marker of endMarkers) {
    const idx = clean.indexOf(marker);
    if (idx > 0 && (end < 0 || idx < end)) end = idx + 1; // include the marker
  }

  // Take up to first boundary, capped at 60 chars
  const maxLen = 60;
  let name: string;
  if (end > 0 && end <= maxLen) {
    name = clean.slice(0, end).trim();
  } else if (clean.length <= maxLen) {
    name = clean;
  } else {
    // Truncate at last space before maxLen (word boundary)
    const truncated = clean.slice(0, maxLen);
    const lastSpace = truncated.lastIndexOf(" ");
    name = lastSpace > maxLen * 0.5 ? truncated.slice(0, lastSpace) : truncated;
  }

  return name || "memory";
}

/** 自动合并: 向量预筛 top-10 候选 + Jaccard 确认，避免全扫描。 */
export async function autoMerge(store: MemoryStore, newMemory: Memory): Promise<Memory | null> {
  // Vector pre-filter: find top-10 semantically similar candidates
  let candidates: Memory[];
  if (newMemory.vector.length > 0) {
    candidates = store.search("", {
      limit: 10, minSimilarity: 0.7,
      queryVec: new Float32Array(newMemory.vector),
    });
  } else {
    // No vector yet — fall back to most recent 20
    candidates = store.list({ limit: 20, offset: 0 });
  }
  if (candidates.length === 0) return null;

  for (const existing of candidates) {
    if (existing.id === newMemory.id) continue;
    const similarity = contentOverlap(existing.content, newMemory.content);
    if (similarity > 0.8) {
      existing.content = newMemory.content;
      existing.access_count++;
      existing.last_accessed = new Date().toISOString();

      saveMemory(existing); // persist before embed (survives embed failure)

      const vec = await embed(existing.content);
      if (vec) existing.vector = Array.from(vec);

      store.remove(existing.id);
      store.add(existing);
      return existing;
    }
  }
  return null;
}

/** 自动优先级: 基于访问频率 */
export function autoPriority(memory: Memory): number {
  const age = Date.now() - new Date(memory.created_at).getTime();
  const ageDays = age / 86400000;
  const freqWeight = Math.min(memory.access_count, 50) / 50;
  const recencyWeight = memory.last_accessed
    ? Math.max(0, 1 - (Date.now() - new Date(memory.last_accessed).getTime()) / (90 * 86400000))
    : 0.5;
  return Math.round(1 + 9 * (freqWeight * 0.4 + recencyWeight * 0.4 + (1 - Math.min(ageDays, 365) / 365) * 0.2));
}

/** 自动衰减: Ebbinghaus 遗忘曲线 */
export function autoDecay(memory: Memory): number {
  const daysSinceAccess = memory.last_accessed
    ? (Date.now() - new Date(memory.last_accessed).getTime()) / 86400000
    : (Date.now() - new Date(memory.created_at).getTime()) / 86400000;

  const d = Math.floor(daysSinceAccess);
  if (d <= 1) return 1.0;
  if (d <= 7) return 0.8;
  if (d <= 30) return 0.5;
  if (d <= 90) return 0.2;
  return 0; // archive
}

/** 生成上下文摘要给 Agent 注入。
 *  Recency 主导排序（最近使用的优先），分类衰减作 tiebreaker，priority=10 常青保护。 */
export function generateContextSummary(store: MemoryStore, limit: number = 5): string {
  // Category half-life (days) — YourMemory-style decay rates.
  // Strategic decisions decay slowly, casual notes decay fast.
  const CATEGORY_HALFLIFE: Record<string, number> = {
    "decision-log": 38,
    "project-context": 30,
    "user-preference": 24,
    "code-pattern": 20,
    "session-transcript": 0, // excluded from context injection
    "general": 14,
  };

  const now = Date.now();

  // Widen pool (3× limit) so recency reordering has room
  const pool = store.list({ limit: Math.max(limit * 3, 50), offset: 0 });

  // Filter out excluded categories
  const eligible = pool.filter((m) => {
    const hl = CATEGORY_HALFLIFE[m.category];
    return hl === undefined || hl > 0;
  });

  // Split: evergreen (priority=10, force-include) vs normal
  const evergreen = eligible.filter((m) => m.priority >= 10);
  const normal = eligible.filter((m) => m.priority < 10);

  // Sort normal: recency first (last_accessed > created_at), decay as tiebreaker
  normal.sort((a, b) => {
    const aTime = a.last_accessed ? new Date(a.last_accessed).getTime() : new Date(a.created_at).getTime();
    const bTime = b.last_accessed ? new Date(b.last_accessed).getTime() : new Date(b.created_at).getTime();
    // Recency primary: newer first
    if (bTime !== aTime) return bTime - aTime;

    // Same recency → category decay × priority decider
    const aDays = (now - aTime) / 86400000;
    const bDays = (now - bTime) / 86400000;
    const aHalf = CATEGORY_HALFLIFE[a.category] ?? 14;
    const bHalf = CATEGORY_HALFLIFE[b.category] ?? 14;
    const aDecay = Math.pow(0.5, aDays / aHalf);
    const bDecay = Math.pow(0.5, bDays / bHalf);
    const aScore = aDecay * (a.priority || 5);
    const bScore = bDecay * (b.priority || 5);
    return bScore - aScore;
  });

  // Merge: evergreen first (priority desc), then recency-sorted normal
  evergreen.sort((a, b) => (b.priority || 10) - (a.priority || 10));
  const ranked = [...evergreen, ...normal];

  // Dedup: skip entries too similar to ones already selected
  const top: typeof ranked = [];
  for (const m of ranked) {
    if (top.some((t) => contentOverlap(t.content, m.content) > 0.6)) continue;
    top.push(m);
    if (top.length >= limit) break;
  }

  if (top.length === 0) {
    return "[MemoryForge] 👋 Welcome! No memories yet.\n\n" +
      "Store your first memory with memory_store to build context across sessions.\n" +
      "Tips:\n" +
      "  • Save project decisions as 'decision-log'\n" +
      "  • Save user preferences as 'user-preference'\n" +
      "  • Session transcripts are auto-captured (excluded from context, searchable via memory_search)";
  }

  const lines: string[] = [
    "[MemoryForge] 📋 Recent context from previous sessions:",
  ];
  for (const m of top) {
    const time = m.last_accessed || m.created_at;
    const dateStr = new Date(time).toLocaleDateString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
    const preview = smartPreview(redactSecrets(m.content), 300);

    lines.push(`- [${m.name}] ${dateStr} | ${m.category}\n  ${preview}`);
  }

  // Token budget note: tell agent if context is truncated
  const eligibleTotal = eligible.length;
  if (eligibleTotal > limit) {
    lines.push(
      "",
      `[MemoryForge] Showing top ${limit} of ${eligibleTotal} eligible memories. ` +
      `Use memory_search or memory_recall to find more.`
    );
  }

  // Proactive greeting: agent acknowledges context in first response
  lines.push(
    "",
    "[MemoryForge] IMPORTANT — In your FIRST response to the user (even to a simple " +
    "\"hi\" or \"continue\"), acknowledge the context above. Summarize in 1-2 lines what " +
    "was happening last session. Example: \"Loaded context from last session: we were " +
    "working on [topic]. [N] memories available. What should we do next?\" " +
    "This makes the user aware their context was loaded successfully."
  );

  return lines.join("\n\n");
}

/** Redact sensitive patterns from context preview to prevent key leakage to LLM APIs */
function redactSecrets(text: string): string {
  return text
    // Private key hex strings (ed25519, secp256k1, etc.)
    .replace(/(?:ed25519|secp256k1|ecdsa)-priv-\S+/gi, "[REDACTED-KEY]")
    // PEM private key blocks
    .replace(/-----BEGIN\s.*PRIVATE\sKEY-----[\s\S]*?-----END\s.*PRIVATE\sKEY-----/gi, "[REDACTED-PEM]")
    // Lines with "Private Key:", "Secret:", "Password:", "API Key:" patterns
    .replace(/^(.*(?:Private\s*Key|Secret\s*Key|API\s*Key|Password|passwd)\s*[=:]\s*)\S+$/gim, "$1[REDACTED]")
    // Standalone API tokens like "AG-..." (Shelbynet format)
    .replace(/\bAG-[A-Z0-9]{20,}\b/g, "[REDACTED-TOKEN]")
    // BIP39 mnemonics: 12-24 word phrases
    .replace(/\b(?:\w+\s+){11,23}\w+\s*(?:mnemonic|seed phrase|recovery phrase)/gi, "[REDACTED-MNEMONIC]");
}

/** Extract a smart preview: first meaningful paragraph, not raw character truncation. */
function smartPreview(content: string, maxLen: number): string {
  // Split by double newline (paragraph)
  const paragraphs = content.split(/\n\n+/);
  const meaningful: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.replace(/\n/g, " ").trim();
    if (!trimmed) continue;
    // Skip markdown headings and divider lines as standalone previews
    if (/^(#+\s|[=-]{3,}|[-*_]{3,})/.test(trimmed)) continue;
    meaningful.push(trimmed);
  }

  if (meaningful.length === 0) {
    // No meaningful paragraphs found — raw truncation
    return content.length > maxLen
      ? safeTruncate(content, maxLen).replace(/\n/g, " ").trim() + "…"
      : content;
  }

  // Build preview from first meaningful paragraph(s)
  let preview = "";
  for (let i = 0; i < meaningful.length; i++) {
    const candidate = preview ? preview + " " + meaningful[i] : meaningful[i];
    if (candidate.length <= maxLen) {
      preview = candidate;
    } else if (!preview) {
      // First paragraph is too long — truncate at sentence boundary
      const cutoff = meaningful[i].slice(0, maxLen);
      const m = cutoff.match(/[.!?。！？]/g);
      const lastPunct = m ? cutoff.lastIndexOf(m[m.length - 1]) + 1 : 0;
      return (lastPunct > maxLen * 0.5 ? cutoff.slice(0, lastPunct) : cutoff.slice(0, maxLen)).trim() + "…";
    } else {
      return preview + "…";
    }
  }

  return preview;
}
