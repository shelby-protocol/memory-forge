# We Benchmarked MemoryForge on LongMemEval — It's Now #2 of 25+ MCP Memory Tools

Your AI agent forgets everything between sessions. That problem is mostly solved. What's not solved is knowing *which* memory tool actually works.

So we ran LongMemEval — the ICLR 2025 standard benchmark for agent memory systems — against MemoryForge. Here's what we found.

## The Benchmark

LongMemEval tests 500 questions across 5 memory abilities: information extraction, multi-session reasoning, temporal reasoning, knowledge updates, and preference recall. Each question embeds the answer as a needle in 40-500 sessions of haystack conversation. It's brutal, and it's the only standardized metric the industry has.

## The Score

```
Recall@5: 95.6%
Rank: #2 of 25+ MCP memory tools
```

Only one tool scores higher.

## Full Breakdown

| Metric | Score |
|--------|-------|
| Recall@1 | 89.8% |
| Recall@3 | 93.2% |
| **Recall@5** | **95.6%** |
| Recall@10 | 98.0% |

By task type:

| Task | Recall@5 |
|------|---------|
| Single-session assistant | 100.0% |
| Knowledge update | 97.4% |
| Single-session user | 95.7% |
| Multi-session reasoning | 95.5% |
| Temporal reasoning | 94.7% |
| Preference recall | 90.0% |

## How It Compares

| Tool | Recall@5 |
|------|---------|
| ai-memory (Rust) | 97.8% |
| **MemoryForge** | **95.6%** |
| Mem0 Platform | 94.4% |
| agent-memory-store | 92.1% |
| YourMemory | 89.4% |
| mcp-memory-service | 80.4% |

## What's Under the Hood

The retrieval stack is a weighted hybrid of two rankers:

- **Semantic vector search** (MiniLM-L6-v2, 384-dim, in-process)
- **BM25 keyword search** (pure TypeScript, zero dependencies)

Scoring is `0.7 × vector + 0.3 × BM25` for general queries, with a dynamic alpha shift to `0.9 × vector` for preference/recommendation queries where semantic matching dominates.

The embedding model runs as a 23MB Transformers.js model inside the Node.js process. No API keys. No network calls after download. The benchmark was run on an RTX 3080 Ti via a Python embedding server (sentence-transformers + Flask) for GPU acceleration, but production defaults to CPU.

## What This Means

If you're picking an MCP memory tool and retrieval quality is your top priority, MemoryForge is the second-best choice on the market — and the best choice if you want local-first storage without sending your data to a cloud service.

## Try It

```bash
npx memory-forge setup
```

Nine tools. Five auto-engines. Free tier is fully local.

---

*Benchmark methodology: LongMemEval-S (cleaned), 500 questions, per-turn session splitting, hybrid BM25+vector. Full results at `results-hybrid-hybrid.json` in the repository.*
