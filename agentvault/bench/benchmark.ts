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
import { autoName } from "../src/auto/index.js";
import { embed } from "../src/embedding.js";
import { expandQuery } from "../src/search/expand.js";

// ── Types ──────────────────────────────────────────────

interface Session {
  session_id: string;
  session_date: string;
  messages: { role: string; content: string }[];
}

interface LongMemEvalQuestion {
  question_id: string;
  question: string;
  answer: string;
  task: string;
  haystack_sessions: Session[];
  evidence_sessions?: string[];
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
    const evidenceIds = new Set(q.evidence_sessions ?? []);

    // Index all sessions as memories
    for (const session of q.haystack_sessions) {
      const content = session.messages.map((m) => `${m.role}: ${m.content}`).join("\n");
      const id = session.session_id;

      // Embed only if enabled (expensive)
      let vector: number[] = [];
      if (!opts.skipEmbed) {
        const vec = await embed(content);
        if (vec) vector = Array.from(vec);
      }

      store.add({
        id,
        name: autoName(content),
        content,
        category: "general",
        tags: [],
        priority: 5,
        vector,
        created_at: new Date().toISOString(),
        access_count: 0,
        last_accessed: null,
      });
    }

    // Search
    const expanded = expandQuery(q.question);
    const queryVec = !opts.skipEmbed ? await embed(q.question) : null;

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
    if (!taskResults[q.task]) {
      taskResults[q.task] = { total: 0, hits: {} };
      for (const k of kValues) taskResults[q.task].hits[k] = 0;
    }
    taskResults[q.task].total++;
    for (const k of kValues) {
      if (results.slice(0, k).some((r) => evidenceIds.has(r.id))) {
        taskResults[q.task].hits[k]++;
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
