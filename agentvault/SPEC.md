# MemoryForge — Product Specification

## Positioning

An MCP-standard AI agent persistent memory engine. Free tier runs locally, Pro tier adds Shelby decentralized cloud sync.

## MCP Tools (8)

### Core Layer

| Tool | Description |
|---|---|
| `memory_store` | Store memory with auto-embedding, naming, and dedup merge |
| `memory_search` | Semantic search (vector-first, keyword fallback) |
| `memory_recall` | Exact retrieval by memory ID |
| `memory_list` | List memories with category/tag filtering |
| `memory_forget` | Delete memory (local + Shelby tombstone) |
| `memory_context` | Load top-N session context |

### Collaboration Layer

| Tool | Description |
|---|---|
| `memory_export` | Export as JSON or Markdown |
| `memory_share` | Package single memory for teammate import |

## Auto-Engines (5)

| Engine | Trigger | Description |
|---|---|---|
| autoName | memory_store | Extract first 40 chars as name |
| autoMerge | memory_store | Merge at >80% Jaccard overlap |
| autoPriority | hook stop | Score based on access frequency + recency + age (1–10) |
| autoDecay | hook stop | Ebbinghaus curve: 1d→1.0, 7d→0.8, 30d→0.5, 90d→0.2, >90d→archive |
| generateContextSummary | hook session-start / pre-compact | Top-N context summary + save instruction |

## Hook System (3)

| Hook | Command | Behavior |
|---|---|---|
| SessionStart | `memory-forge hook session-start` | Load top-5 memories into agent context |
| Stop | `memory-forge hook stop` | autoPriority + autoDecay maintenance |
| PreCompact | `memory-forge hook pre-compact` | Preserve top-8 memories + **auto-capture instruction** (prompts agent to save key info before compaction) |

## Pricing

| Tier | Description |
|---|---|
| Free | 8 tools, local storage, unlimited memories |
| Pro | + Shelby decentralized cloud sync, cross-device |

Pro currently operates on Shelbynet testnet.

## Technical Specs

- **Embedding model**: Transformers.js / Xenova all-MiniLM-L6-v2 (23MB)
- **Vector dimensions**: 384
- **Similarity algorithm**: Cosine similarity
- **Degradation**: Model load failure → keyword matching + 5min auto-retry
- **Storage format**: Local Markdown with YAML frontmatter; Shelby JSON blobs
- **LRU cap**: 5,000 entries in memory; lowest access evicted first
- **Dedup threshold**: Jaccard > 0.8

## Roadmap

- SettleGrid payment integration (Pro → paid)
- On-chain hash verification
- MCP directory listing (mcp.so / smithery.ai / glama.ai)
- Multi-language embedding model switching
