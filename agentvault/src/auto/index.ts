/**
 * 后台自动化引擎: 全部用户无感知。
 */

import type { MemoryStore, Memory } from "../store.js";
import { saveMemory } from "../storage/local.js";
import { embed } from "../embedding.js";

/** 自动命名: 从内容中提取前几个字作为名称 */
export function autoName(content: string): string {
  // Strip code blocks, trim to ~30 chars
  const clean = content.replace(/```[\s\S]*?```/g, "").replace(/`/g, "").trim();
  const name = clean.slice(0, 40).replace(/\n/g, " ").trim();
  return name || "memory";
}

/** 自动合并: 检测相似内容并合并（异步，重新计算向量） */
export async function autoMerge(store: MemoryStore, newMemory: Memory): Promise<Memory | null> {
  const all = [...store.list({ limit: 100, offset: 0 })];
  if (all.length === 0) return null;

  for (const existing of all) {
    if (existing.id === newMemory.id) continue;
    const similarity = contentOverlap(existing.content, newMemory.content);
    if (similarity > 0.8) {
      // Merge: update existing with new content + fresh vector
      existing.content = newMemory.content;
      existing.access_count++;
      existing.last_accessed = new Date().toISOString();

      // Recompute vector for merged content
      const vec = await embed(existing.content);
      if (vec) existing.vector = Array.from(vec);

      saveMemory(existing);
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

/** 内容重叠度 (Jaccard 近似) */
function contentOverlap(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }
  return intersection / Math.min(setA.size, setB.size);
}

/** 生成上下文摘要给 Agent 注入 */
export function generateContextSummary(store: MemoryStore, limit: number = 5): string {
  const all = store.list({ limit: 100, offset: 0 });

  // Category boost: decision-log and project-context are more useful as quick context
  // than raw session transcripts or generic memories
  const CATEGORY_BOOST: Record<string, number> = {
    "decision-log": 2.0,
    "project-context": 1.8,
    "user-preference": 1.2,
    "code-pattern": 1.1,
    "session-transcript": 0, // excluded — raw transcripts are for deep recall, not quick context
    "general": 1.0,
  };

  // Filter + recency-first with category boost, priority as final tiebreaker
  const top = all
    .filter((m) => {
      const boost = CATEGORY_BOOST[m.category];
      return boost !== undefined ? boost > 0 : true; // exclude categories with boost=0
    })
    .sort((a, b) => {
      const aTime = a.last_accessed ? new Date(a.last_accessed).getTime() : new Date(a.created_at).getTime();
      const bTime = b.last_accessed ? new Date(b.last_accessed).getTime() : new Date(b.created_at).getTime();
      const aBoost = CATEGORY_BOOST[a.category] ?? 1.0;
      const bBoost = CATEGORY_BOOST[b.category] ?? 1.0;
      const aScore = aTime * aBoost;
      const bScore = bTime * bBoost;
      if (bScore !== aScore) return bScore - aScore;
      return (b.priority || 5) - (a.priority || 5);
    })
    .slice(0, limit);

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
    // Redact BEFORE flattening newlines (line-anchored regex needs real newlines)
    const sanitized = redactSecrets(m.content);
    const preview = sanitized.length > 300
      ? sanitized.slice(0, 300).replace(/\n/g, " ").trim() + "…"
      : sanitized;

    lines.push(`- [${m.name}] ${dateStr} | ${m.category}\n  ${preview}`);
  }

  // Agent instruction: actively reference this context
  lines.push(
    "",
    "[MemoryForge] When the user asks about previous work, \"what we were doing\", " +
    "\"continue yesterday\", or similar — reference the context above. " +
    "Briefly summarize what was happening last session before asking what to do next."
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
