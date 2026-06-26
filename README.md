# MemoryForge

<p align="center">
  <b>Persistent memory engine for AI agents.</b><br>
  One command. Zero config. 8 MCP tools + 5 auto-engines.<br>
  Powered by <a href="https://docs.shelby.xyz">Shelby Protocol</a> — decentralized hot storage on Aptos.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/memory-forge"><img src="https://img.shields.io/npm/v/memory-forge" alt="npm version"></a>
  <a href="https://github.com/shelby-protocol/memory-forge/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/memory-forge" alt="license"></a>
  <a href="https://www.npmjs.com/package/memory-forge"><img src="https://img.shields.io/npm/dm/memory-forge" alt="downloads"></a>
</p>

---

## The Problem

**Your AI agent has amnesia.**

Every time you close Claude Code or Cursor, your AI agent forgets everything. You told it you prefer React 19 with TypeScript. You taught it your project's auth flow. You spent 20 minutes debugging a config issue together. Close the terminal — gone.

There are **25+ MCP memory servers** on the market. Most store memories in local files. Lose your machine, lose your agent's brain.

---

## What Makes MemoryForge Different

### 1. Local-First, Cloud-Optional

Free tier runs entirely on your machine. Zero network requests. Upgrade to Pro for Shelby decentralized cloud sync across devices.

### 2. Actually Automatic

5 background engines handle naming, deduplication, priority scoring, decay archiving, and context injection. You never run `memory_*` commands — your agent calls them automatically.

### 3. PreCompact Auto-Capture

Before context compaction, MemoryForge prompts your agent to save key learnings. Even if you force-close the terminal, your memories survive.

### 4. Zero External Dependencies

Embedding model (23MB Transformers.js) runs in-process. No API keys needed for Free tier. Works offline.

---

## Quick Start

```bash
npx memory-forge setup
```

Auto-installs hooks, imports your existing rules, preloads the embedding model. Works with Claude Code, Cursor, Windsurf, VS Code.

### Pro (Shelby Cloud Sync)

```bash
SHELBY_API_KEY="your-key" memory-forge pro
```

Cross-device memory sync via Shelby decentralized storage (currently on Shelbynet testnet).

---

## How to Use

### Install (one-time)

```bash
npx memory-forge setup
```

### Daily Use — Nothing Required

- Session start → context auto-injected
- During conversation → agent calls `memory_store` and `memory_search` automatically
- PreCompact → auto-capture instruction prompts agent to save key learnings
- Session end → autoPriority recalc + autoDecay archiving

### Talk to Your Agent Naturally

```
"Remember: our project uses pnpm, not npm"
"Search for memories about authentication"
"List all my memories"
"Share this memory with the frontend team"
"Export all memories as JSON backup"
```

Your agent calls the right MCP tool automatically.

---

## 8 MCP Tools

| Tool | Description |
|------|-------------|
| `memory_store` | Store with auto-embedding, auto-naming, auto-dedup |
| `memory_search` | Semantic search — vector first, keyword fallback |
| `memory_recall` | Exact retrieval by memory ID |
| `memory_list` | Browse with category/tag filters and pagination |
| `memory_forget` | Delete memory (local file + in-memory cache) |
| `memory_context` | Load session context — top-N by access + priority |
| `memory_export` | Export as JSON or Markdown |
| `memory_share` | Package for teammate import |

## 5 Auto-Engines

| Engine | Trigger | Effect |
|--------|---------|--------|
| Auto-Name | Every `memory_store` | Extracts descriptive names from content |
| Auto-Merge | Every `memory_store` | Merges >80% similar memories |
| Auto-Priority | Session Stop | Scores 1–10 from frequency × recency × age |
| Auto-Decay | Session Stop | Ebbinghaus curve: 7d→0.8, 30d→0.5, 90d→archive |
| Context Injection | SessionStart hook | Loads top-5 relevant memories each session |

---

## Pricing

| | Free | Pro |
|---|:---:|:---:|
| Price | $0 | Testnet (free) |
| Storage | Local Markdown | Shelby decentralized cloud |
| Memory limit | Unlimited | Unlimited |
| Cross-device sync | Manual export | Auto-sync |
| Tools | All 8 | All 8 |
| Auto-engines | All 5 | All 5 |

---

## Architecture

```
┌──────────────────────────────────────────────┐
│  Agent (Claude Code / Cursor / Windsurf)      │
└──────────────┬───────────────────────────────┘
               │  MCP (JSON-RPC over stdio)
               ▼
┌──────────────────────────────────────────────┐
│  MemoryForge MCP Server                       │
│  ┌──────────┐ ┌───────────┐ ┌────────────┐  │
│  │ 8 Tools  │ │ 5 Engines │ │ CLI (setup  │  │
│  │ store    │ │ auto-name │ │  pro hook) │  │
│  │ search   │ │ auto-merge│ │            │  │
│  │ recall   │ │ priority  │ │ memory-    │  │
│  │ list     │ │ decay     │ │ forge ...  │  │
│  │ forget   │ │ context   │ │            │  │
│  │ context  │ └───────────┘ └────────────┘  │
│  │ export   │                               │
│  │ share    │  TypeScript, Node 18+, ESM     │
│  └──────────┘                               │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │  Embedding Engine                    │    │
│  │  Transformers.js (23MB in-process)   │    │
│  │  all-MiniLM-L6-v2, 384-dim vectors   │    │
│  │  Fallback: keyword matching           │    │
│  └──────────────────────────────────────┘    │
└──────────┬───────────────┬───────────────────┘
           │               │
           ▼               ▼
┌──────────────────┐  ┌─────────────────────────┐
│  Free Storage    │  │  Pro Storage             │
│  ~/.memory-forge │  │  Shelby Protocol         │
│  memories/*.md   │  │  @shelby-protocol/sdk    │
│  (Markdown)      │  │  Shelbynet testnet       │
└──────────────────┘  └─────────────────────────┘
```

---

## Security

| Data | Location | Notes |
|------|----------|------|
| Memory content | `~/.memory-forge/memories/` (Free) or Shelby blob (Pro) | User-managed |
| API keys | Environment variable only | Never written to disk |
| Private keys | `~/.memory-forge/pro.json` (Pro) | User-local |
| Payment info | Not applicable | No payment system yet |

Free tier: zero network requests (except one-time 23MB model download). Pro tier: HTTPS transport, on-chain Aptos transactions.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Protocol | `@modelcontextprotocol/sdk` (MCP stdio) |
| Embeddings | `@huggingface/transformers` (Xenova/all-MiniLM-L6-v2, 23MB) |
| Validation | `zod` |
| Free Storage | Local Markdown (`~/.memory-forge/memories/*.md`) |
| Pro Storage | `@shelby-protocol/sdk` + `@aptos-labs/ts-sdk` |
| Runtime | Node.js 18+, TypeScript, ESM |

**Zero external SaaS. Zero API keys required for Free. Embedding model runs locally.**

---

## Competitive Landscape

| | MemoryForge | Mem0 | Zep | LangMem | Pinecone |
|---|:---:|:---:|:---:|:---:|:---:|
| Storage | Local + Decentralized | Cloud | Cloud | Local | Cloud |
| Protocol | **MCP** | REST | REST | SDK | gRPC |
| Cross-device | ✅ (Pro) | ✅ | ✅ | ❌ | ❌ |
| In-process embedding | ✅ (23MB) | ❌ | ❌ | ❌ | ❌ |
| Auto-engines | 5 | 2 | 1 | 0 | 0 |
| Zero API keys | ✅ (Free) | ❌ | ❌ | ✅ | ❌ |

MemoryForge is the only MCP memory server combining local-first privacy with optional decentralized cloud storage.

---

## Roadmap

```
v0.1.x ✅  Published — 8 tools + 5 auto-engines + local storage
v0.2.0 ✅  All-English docs, PreCompact auto-capture
v0.2.x ⬜  MCP directory listing (mcp.so, smithery.ai, glama.ai)
v0.3.0 ⬜  SettleGrid payment integration
v1.0.0 ⬜  Mainnet launch, web dashboard
```

---

## Documentation

| Document | Content |
|---|---|
| [TECHNICAL.md](agentvault/TECHNICAL.md) | API reference, data model, architecture, security |
| [TUTORIAL.md](agentvault/TUTORIAL.md) | Install guide, daily use, Pro setup, troubleshooting |
| [SPEC.md](agentvault/SPEC.md) | Product specification and roadmap |
| [ARCHITECTURE.md](agentvault/ARCHITECTURE.md) | System architecture and data flow |

## Links

- [npm](https://www.npmjs.com/package/memory-forge)
- [Issues](https://github.com/shelby-protocol/memory-forge/issues)
- [Shelby Protocol Docs](https://docs.shelby.xyz)

## License

MIT © [shelby-protocol](https://github.com/shelby-protocol)
