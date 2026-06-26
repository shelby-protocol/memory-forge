# MemoryForge

> Persistent memory engine for AI agents. 8 MCP tools + 5 auto-engines. Free tier runs locally. Pro tier adds Shelby decentralized cloud sync.

## Install

```bash
npx memory-forge setup
```

Auto-configures Claude Code hooks (SessionStart / Stop / PreCompact) and imports existing rules as memories.

Free tier has no external service dependencies. Pro tier requires a `SHELBY_API_KEY` for Shelby cloud sync.

## Core Capabilities

**8 MCP Tools (invoked by agent directly):**

| Tool | Description |
|---|---|
| `memory_store` | Store memories with auto-embedding, naming, and dedup merge |
| `memory_search` | Semantic search (vector + keyword dual-mode) |
| `memory_recall` | Exact recall by memory ID |
| `memory_list` | List memories with category/tag filtering |
| `memory_forget` | Delete a memory (local + Shelby tombstone) |
| `memory_context` | Load current session context |
| `memory_export` | Export as JSON or Markdown |
| `memory_share` | Package a memory for teammate import |

**5 Auto-Engines (zero user awareness):**

| Engine | Description |
|---|---|
| autoName | Extract name from content automatically |
| autoMerge | Detect >80% overlap and merge duplicates |
| autoPriority | Priority scoring via access frequency + recency (Ebbinghaus curve) |
| autoDecay | Auto-archive at 90 days of inactivity |
| autoCapture | Session-end priority recalc + PreCompact save reminders |

## Pricing

| Tier | Description |
|---|---|
| **Free** | 8 tools, local storage, unlimited memories |
| **Pro** | + Shelby decentralized cloud sync, cross-device |

Pro is currently on Shelbynet testnet.

## Tech Stack

- **MCP Protocol**: `@modelcontextprotocol/sdk` (stdio transport)
- **Embeddings**: Transformers.js / Xenova all-MiniLM-L6-v2 (23MB, local, auto-fallback to keyword)
- **Cloud (Pro)**: `@shelby-protocol/sdk` (Shelbynet / Aptos)
- **Runtime**: Node.js 18+, TypeScript

## Docs

| Document | Content |
|---|---|
| [TECHNICAL.md](TECHNICAL.md) | API reference, data model, architecture, security |
| [TUTORIAL.md](TUTORIAL.md) | Install guide, daily use, Pro setup, troubleshooting |
| [SPEC.md](SPEC.md) | Product specification and roadmap |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture and data flow |
| [MARKET.md](MARKET.md) | Competitive analysis |

## Security

- Free tier is fully local — zero network requests (except one-time 23MB model download)
- Pro tier uploads to Shelby blockchain storage with Aptos transaction proofs
- API key via environment variable; secrets never stored in plaintext
- GDPR right-to-erasure via `memory_forget` (local + on-chain tombstone)

## Tests

```bash
npm test   # 52 tests, 100% pass
```
