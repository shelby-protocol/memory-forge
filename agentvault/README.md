# MemoryForge

> Persistent memory engine for AI agents. 10 MCP tools + 5 auto-engines. Free tier runs locally. Pro tier adds Shelby decentralized cloud sync.

<p>
  <a href="https://github.com/shelby-protocol/memory-forge/actions"><img src="https://img.shields.io/github/actions/workflow/status/shelby-protocol/memory-forge/test.yml?branch=main" alt="CI"></a>
  <a href="https://www.npmjs.com/package/memory-forge"><img src="https://img.shields.io/npm/v/memory-forge" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/memory-forge"><img src="https://img.shields.io/npm/dm/memory-forge" alt="downloads"></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/memory-forge" alt="license"></a>
  <br>
  <img src="https://img.shields.io/badge/LongMemEval-95.6%25-brightgreen" alt="LongMemEval Recall@5">
  <img src="https://img.shields.io/badge/rank-2%2F25+-blue" alt="Rank #2 of 25+ MCP memory tools">
  <img src="https://img.shields.io/badge/tests-319%20passed-green" alt="319 tests">
</p>

## Install

```bash
npx memory-forge setup
```

Auto-configures Claude Code hooks (SessionStart / Stop / PreCompact) and imports existing rules as memories.

Free tier has no external service dependencies. Pro tier requires a `SHELBY_API_KEY` for Shelby cloud sync.

## Core Capabilities

**10 MCP Tools (invoked by agent directly):**

| Tool                | Description                                                 |
| ------------------- | ----------------------------------------------------------- |
| `memory_store`      | Store memories with auto-embedding, naming, and dedup merge |
| `memory_search`     | Semantic search (vector + keyword dual-mode)                |
| `memory_recall`     | Exact recall by memory ID                                   |
| `memory_list`       | List memories with category/tag filtering + local timezone  |
| `memory_forget`     | Delete a memory (local + Shelby tombstone)                  |
| `memory_context`    | Load current session context                                |
| `memory_export`     | Export as JSON or Markdown                                  |
| `memory_share`      | Package a memory for teammate import                        |
| `memory_update`     | Update existing memory with re-embedding                    |
| `memory_model_info` | Show embedding model status, dims, and health               |

**5 Auto-Engines (zero user awareness):**

| Engine       | Description                                                        |
| ------------ | ------------------------------------------------------------------ |
| autoName     | Extract name from content automatically                            |
| autoMerge    | Detect >80% overlap and merge duplicates                           |
| autoPriority | Priority scoring via access frequency + recency (Ebbinghaus curve) |
| autoDecay    | Auto-archive at 90 days of inactivity                              |
| autoCapture  | Session-end priority recalc + PreCompact save reminders            |

## Pricing

| Tier     | Description                                     |
| -------- | ----------------------------------------------- |
| **Free** | 9 tools, local storage, unlimited memories      |
| **Pro**  | + Shelby decentralized cloud sync, cross-device |

Pro is currently on Shelbynet testnet.

## Tech Stack

- **MCP Protocol**: `@modelcontextprotocol/sdk` (stdio transport)
- **Embeddings**: Transformers.js / Xenova all-MiniLM-L6-v2 (23MB, local, auto-fallback to keyword)
- **Cloud (Pro)**: `@shelby-protocol/sdk` (Shelbynet / Aptos)
- **Runtime**: Node.js 18+, TypeScript

## Docs

| Document                           | Content                                              |
| ---------------------------------- | ---------------------------------------------------- |
| [TECHNICAL.md](TECHNICAL.md)       | API reference, data model, architecture, security    |
| [TUTORIAL.md](TUTORIAL.md)         | Install guide, daily use, Pro setup, troubleshooting |
| [SPEC.md](SPEC.md)                 | Product specification and roadmap                    |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture and data flow                    |
| [MARKET.md](MARKET.md)             | Competitive analysis                                 |

## Security

- Free tier is fully local — zero network requests (except one-time 23MB model download)
- Pro tier uploads to Shelby blockchain storage with Aptos transaction proofs
- API key via environment variable; secrets never stored in plaintext
- GDPR right-to-erasure via `memory_forget` (local + on-chain tombstone)

## Tests

```bash
npm test   # 319 tests, 31 files, 100% pass
```
