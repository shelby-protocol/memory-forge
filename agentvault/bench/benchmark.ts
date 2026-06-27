/**
 * LongMemEval retrieval benchmark for MemoryForge.
 *
 * Measures how well memory_search finds evidence memories across session histories.
 * Tests recall@k (k=1,3,5,10) with hybrid search (BM25 + vector).
 *
 * Usage:
 *   npx tsx bench/benchmark.ts --dataset bench/longmemeval_s_cleaned.json
 *   npx tsx bench/benchmark.ts --dataset bench/synthetic_dataset.json
 *   npx tsx bench/benchmark.ts --dataset bench/synthetic_dataset.json --method bm25
 *   npx tsx bench/benchmark.ts --dataset bench/synthetic_dataset.json --method vector
 *   npx tsx bench/benchmark.ts --dataset bench/synthetic_dataset.json --skip-embed
 */

import * as fs from "node:fs";
import { MemoryStore, type Memory } from "../src/store.js";
import { randomUUID } from "node:crypto";
import { autoName, inferCategory, suggestTags } from "../src/auto/index.js";
import { embed } from "../src/embedding.js";
import { expandQuery } from "../src/search/expand.js";

// ── GPU Embed Server ───────────────────────────────────

const GPU_EMBED_URL = process.env.GPU_EMBED_URL || "http://127.0.0.1:8765";
let gpuAvailable: boolean | null = null;

async function checkGpu(): Promise<boolean> {
  if (gpuAvailable !== null) return gpuAvailable;
  try {
    const res = await fetch(`${GPU_EMBED_URL}/health`);
    gpuAvailable = res.ok;
  } catch {
    gpuAvailable = false;
  }
  return gpuAvailable;
}

async function batchEmbed(texts: string[]): Promise<Float32Array[]> {
  if (!(await checkGpu())) return texts.map(() => new Float32Array(0));
  try {
    const res = await fetch(`${GPU_EMBED_URL}/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts }),
    });
    const data = (await res.json()) as { vectors: number[][] };
    return data.vectors.map((v) => new Float32Array(v));
  } catch {
    return texts.map(() => new Float32Array(0));
  }
}

// ── Types ──────────────────────────────────────────────

// LongMemEval format: sessions vary — some are 2-msg tuples, others are multi-turn arrays
type MsgObj = { role: string; content: string };
type SessionData = MsgObj[]; // array of message objects (numeric keys)

interface LongMemEvalQuestion {
  question_id: string;
  question: string;
  question_type: string;
  question_date: string;
  answer: string;
  answer_session_ids: string[];
  haystack_dates: string[];
  haystack_session_ids: string[];
  haystack_sessions: SessionData[];
}

// ── CLI args ───────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].replace("--", "");
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        opts[key] = next;
        i++; // consume value
      } else {
        opts[key] = "true"; // boolean flag
      }
    }
  }
  return {
    datasetPath: opts.dataset || "bench/synthetic_dataset.json",
    method: (opts.method || "hybrid") as "hybrid" | "vector" | "bm25",
    skipEmbed: opts["skip-embed"] === "true",
    questions: parseInt(opts.questions || "0") || 0, // 0 = all
    verbose: opts.verbose === "true",
  };
}

// ── Benchmark Logic ────────────────────────────────────

async function runBenchmark(opts: ReturnType<typeof parseArgs>) {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║  MemoryForge LongMemEval Benchmark   ║`);
  console.log(`╠══════════════════════════════════════╣`);
  console.log(`║  Dataset : ${opts.datasetPath.padEnd(28)}║`);
  console.log(`║  Method  : ${opts.method.padEnd(28)}║`);
  console.log(`║  Embed   : ${(opts.skipEmbed ? "skipped" : "enabled").padEnd(28)}║`);
  console.log(`╚══════════════════════════════════════╝\n`);

  // Load data
  const raw = JSON.parse(fs.readFileSync(opts.datasetPath, "utf-8")) as LongMemEvalQuestion[];
  const questions = opts.questions > 0 ? raw.slice(0, opts.questions) : raw;
  console.log(`Loaded ${raw.length} questions, running ${questions.length}\n`);

  // Results per k
  const kValues = [1, 3, 5, 10];
  const recall: Record<number, number> = {};
  const taskResults: Record<string, { total: number; hits: Record<number, number> }> = {};
  for (const k of kValues) recall[k] = 0;

  let processed = 0;
  const startTime = Date.now();

  for (const q of questions) {
    const store = new MemoryStore();
    const origEvidenceIds = new Set(q.answer_session_ids ?? []);
    const evidenceIds = new Set<string>();

    // Collect all content texts for batch embedding
    const contentTexts: string[] = [];
    const contentMeta: { sid: string; isEvidence: boolean }[] = [];

    for (let si = 0; si < q.haystack_sessions.length; si++) {
      const session = q.haystack_sessions[si];
      const baseSid = q.haystack_session_ids[si] ?? `s-${si}`;
      const isEvidence = origEvidenceIds.has(baseSid);

      if (session.length <= 2) {
        const content = session.map((m: MsgObj) => `${m.role}: ${m.content}`).join("\n");
        contentTexts.push(content);
        contentMeta.push({ sid: baseSid, isEvidence });
      } else {
        for (let mi = 0; mi < session.length - 1; mi++) {
          const pair = [session[mi], session[mi + 1]];
          const subSid = `${baseSid}-t${mi}`;
          const content = `${pair[0].role}: ${pair[0].content}\n${pair[1].role}: ${pair[1].content}`;
          contentTexts.push(content);
          contentMeta.push({ sid: subSid, isEvidence });
        }
      }
    }

    // Batch embed all session content + query via GPU server
    const embedTargets = opts.skipEmbed ? [] : [...contentTexts, q.question];
    let vectors: Float32Array[] = [];
    if (!opts.skipEmbed) {
      vectors = await batchEmbed(embedTargets);
    }
    const queryVec = !opts.skipEmbed && vectors.length > 0 ? vectors.pop()! : undefined;

    // Add all memories with their vectors
    for (let i = 0; i < contentMeta.length; i++) {
      const { sid, isEvidence } = contentMeta[i];
      const content = contentTexts[i];
      const vec = vectors[i] ?? new Float32Array(0);
      store.add({
        id: sid,
        name: autoName(content),
        content,
        category: "general",
        tags: [],
        priority: 5,
        vector: vec.length > 0 ? Array.from(vec) : [],
        created_at: new Date().toISOString(),
        access_count: 0,
        last_accessed: null,
      });
      if (isEvidence) evidenceIds.add(sid);
    }

    // Search
    const expanded = expandQuery(q.question);

    let results: Memory[];
    if (opts.method === "bm25") {
      results = store.keywordSearch(expanded.expanded, { limit: 10 });
    } else {
      results = store.search(expanded.expanded, {
        limit: 10,
        queryVec: queryVec ? new Float32Array(queryVec) : undefined,
        alpha: opts.method === "vector" ? 1 : 0.7,
      });
    }

    // Check recall per k
    let found = false;
    for (const k of kValues) {
      const topK = results.slice(0, k);
      const hit = topK.some((r) => evidenceIds.has(r.id));
      if (hit) {
        recall[k] = (recall[k] || 0) + 1;
      }
      if (hit && !found) found = true;
    }

    // Per-task stats
    const task = q.question_type;
    if (!taskResults[task]) {
      taskResults[task] = { total: 0, hits: {} };
      for (const k of kValues) taskResults[task].hits[k] = 0;
    }
    taskResults[task].total++;
    for (const k of kValues) {
      if (results.slice(0, k).some((r) => evidenceIds.has(r.id))) {
        taskResults[task].hits[k]++;
      }
    }

    processed++;
    if (opts.verbose || processed % 50 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const r5 = ((recall[5] / processed) * 100).toFixed(1);
      process.stderr.write(`\r  [${processed}/${questions.length}] elapsed=${elapsed}s  recall@5=${r5}%`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n\nCompleted in ${elapsed}s\n`);

  // ── Print Results ──────────────────────────────────────
  console.log("═".repeat(60));
  console.log("  Overall Recall");
  console.log("═".repeat(60));
  for (const k of kValues) {
    const pct = ((recall[k] / questions.length) * 100).toFixed(1);
    const bar = "█".repeat(Math.round(Number(pct) / 2));
    console.log(`  Recall@${String(k).padEnd(2)}  ${pct.padStart(6)}%  ${bar}`);
  }

  console.log("");
  console.log("═".repeat(60));
  console.log("  By Task Type (Recall@5)");
  console.log("═".repeat(60));
  for (const [task, data] of Object.entries(taskResults)) {
    const pct = ((data.hits[5] / data.total) * 100).toFixed(1);
    console.log(`  ${task.padEnd(28)} ${pct.padStart(6)}%  (${data.hits[5]}/${data.total})`);
  }

  // ── Summary JSON ────────────────────────────────────────
  const summary = {
    benchmark: "LongMemEval retrieval",
    tool: "memory-forge",
    method: opts.method,
    embed: !opts.skipEmbed,
    questions: questions.length,
    elapsed_seconds: parseFloat(elapsed),
    recall: kValues.reduce(
      (acc, k) => ({
        ...acc,
        [`@${k}`]: {
          count: recall[k],
          pct: parseFloat(((recall[k] / questions.length) * 100).toFixed(2)),
        },
      }),
      {} as Record<string, unknown>,
    ),
    by_task: Object.fromEntries(
      Object.entries(taskResults).map(([task, data]) => [
        task,
        {
          total: data.total,
          recall_at_5: {
            count: data.hits[5],
            pct: parseFloat(((data.hits[5] / data.total) * 100).toFixed(2)),
          },
        },
      ]),
    ),
  };

  const resultPath = `bench/results-${opts.method}-${opts.skipEmbed ? "keyword" : "hybrid"}.json`;
  fs.writeFileSync(resultPath, JSON.stringify(summary, null, 2));
  console.log(`\nResults saved to ${resultPath}`);

  return summary;
}

// ── Main ────────────────────────────────────────────────

const opts = parseArgs();
runBenchmark(opts).catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
