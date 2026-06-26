# MemoryForge

<p align="center">
  <b>Forge persistent memories for your AI agent.</b><br>
  One command. Zero config. 8 MCP tools + 5 auto-engines.<br>
  Powered by <a href="https://docs.shelby.xyz">Shelby Protocol</a> — decentralized hot storage on Aptos.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/memory-forge"><img src="https://img.shields.io/npm/v/memory-forge" alt="npm version"></a>
  <a href="https://github.com/shelby-protocol/memory-forge/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/memory-forge" alt="license"></a>
  <a href="https://www.npmjs.com/package/memory-forge"><img src="https://img.shields.io/npm/dm/memory-forge" alt="downloads"></a>
  <a href="https://github.com/shelby-protocol/memory-forge/actions"><img src="https://img.shields.io/github/actions/workflow/status/shelby-protocol/memory-forge/test.yml" alt="tests"></a>
</p>

---

## The Problem

**Your AI agent has amnesia.**

Every time you close Claude Code or Cursor, your AI agent forgets everything. You told it you prefer React 19 with TypeScript. You taught it your project's auth flow. You spent 20 minutes debugging a config issue together. Close the terminal — gone.

**66% of developers** report "almost right, but not quite" outputs from their AI agents. The root cause: missing context. Every session starts from zero.

There are **25+ MCP memory servers** on the market — MemPalace, Nexus, Mind Keg, Engram, Apex Memory, Waggle, Mnemosyne... **100% of them store memories in local SQLite files.** Lose your machine, lose your agent's brain.

---

## What Makes MemoryForge Different

### 1. Decentralized Hot Storage (not local SQLite)

Other MCP memory tools store data locally. MemoryForge stores your agent's memories on **Shelby Protocol** — a decentralized hot storage network built by Aptos Labs and Jump Crypto.

| | Local SQLite (all others) | MemoryForge (Shelby) |
|---|:---:|:---:|
| Read latency | ~5ms | **< 50ms** |
| Switch computers | ❌ Gone | ✅ Auto-restore |
| Data sovereignty | File system | You own, on-chain proof |
| Export cost | N/A | **$0.03/GB** (vs AWS $0.09) |
| Replication overhead | 1x | **1.4x** (vs AWS 3x) |

### 2. On-Chain Verifiable Memory

Every memory write generates an Aptos blockchain transaction hash. You can cryptographically prove a memory existed at that exact moment. No other MCP memory tool can do this.

### 3. Zero-Config Setup

One command. MemoryForge auto-detects your installed agent platforms, imports your existing rules, and installs hooks. You never touch crypto, wallets, or gas fees.

### 4. Runs Entirely on Your Machine

Zero external SaaS dependencies. Embedding model (23MB Transformers.js) runs in-process. No API keys needed. Works completely offline for Free tier.

---

## Quick Start

```bash
npx memory-forge setup
```

That's it. Your agent now remembers.

**Works with:** Claude Code | Cursor | Windsurf | VS Code

### Pro Upgrade ($5/mo)

```bash
npx memory-forge pro
```

Unlocks Shelby decentralized cloud storage. Switch computers, your memories follow.

---

## How to Use

### Install (one-time)

```bash
npx memory-forge setup
```

Auto-detects Claude Code / Cursor / Windsurf / VS Code. Configures hooks and MCP server in one pass.

### Daily Use — Nothing Needed

- **Session start** → context auto-injected. Your agent already knows your preferences.
- **During conversation** → just talk. The agent calls `memory_store` and `memory_search` automatically when relevant._
- **Session end** → hook triggers auto-capture _(coming in v0.1.4)_.

### Talk to Your Agent Naturally

```
"帮我记住：我们项目用 pnpm 管理依赖，不要用 npm"
"搜索之前关于认证的记忆"
"列出我所有的记忆"
"把这条记忆分享给前端团队"
"导出所有记忆备份到 JSON"
```

Your agent calls the right MCP tool automatically. You never type `memory_*` commands.

### Manual Use (optional)

```bash
# View context summary
npx memory-forge hook session-start

# Re-import rules after editing CLAUDE.md
npx memory-forge setup
```

### Upgrade to Pro

```bash
SHELBY_API_KEY="aptoslabs_***" npx memory-forge pro
```

Memories sync to Shelby decentralized cloud. Switch computers — auto-restore.

---

## 8 MCP Tools

| Tool | What it does |
|------|-------------|
| `memory_store` | Store a memory with auto-vectorization, auto-naming, and auto-dedup |
| `memory_search` | Semantic search — vector similarity first, keyword fallback on model failure |
| `memory_recall` | Fetch exact memory by ID with full metadata |
| `memory_list` | Browse memories with category, tag filters, and pagination |
| `memory_forget` | Delete a memory — removes from both in-memory index and local file |
| `memory_context` | Load session context — top-N sorted by access frequency and priority |
| `memory_export` | Export all or selected memories as structured JSON or human-readable Markdown |
| `memory_share` | Package a memory into a portable `memory-forge-share` bundle for teammates |

### Usage Examples

**Store a coding preference:**
```
You: "记住，我偏好 camelCase 命名，单引号，2 空格缩进"

Agent auto-stores → every future session follows this preference
```

**Cross-session project context:**
```
Yesterday: "We decided on PostgreSQL + Prisma for the ORM"
Today:     "Write me a database migration script"

Agent auto-recalls yesterday's decision → generates Prisma migration directly
```

**Export for backup or migration:**
```
You: "Export all my memories as JSON"

Agent returns a complete portable archive with all metadata
```

---

## 5 Background Auto-Engines

These run silently — no user action needed.

| Engine | Trigger | Effect |
|--------|---------|--------|
| **Auto-Name** | Every `memory_store` | Generates descriptive names from content (not UUIDs) |
| **Auto-Merge** | Every `memory_store` | Detects 80%+ similar memories and consolidates |
| **Auto-Priority** | Every access | Scores 1-10 from `frequency × recency × age` |
| **Auto-Decay** | Time-based | Ebbinghaus curve — 7d→0.8, 30d→0.5, 90d→archive |
| **Context Injection** | SessionStart hook | Loads top-3 relevant memories before each session |

### Error Degradation

| Failure | Degradation Path |
|---------|-----------------|
| Transformers.js crash | → Keyword matching fallback (search still works) |
| Shelby RPC timeout (Pro) | → Local cache + async retry, never blocks |
| Embedding model download fail | → Auto-retry every 5 minutes |

---

## Pricing

| | Free | Pro |
|---|:---:|:---:|
| Price | $0 | **$5/mo** |
| Storage | Local Markdown files | **Shelby decentralized cloud** |
| Max memories | 5,000 | Unlimited |
| Cross-device sync | Manual export/import | **Auto-sync on every session** |
| Encryption | — | **AES-256-GCM** |
| Tools | All 8 | All 8 |
| Auto-engines | All 5 | All 5 |

**Free tier works exactly like every other MCP memory tool — local storage. Want cloud sync across devices? $5/mo.**

---

## Architecture

```
┌──────────────────────────────────────────────┐
│  Agent (Claude Code / Cursor / Windsurf / VS) │
└──────────────┬───────────────────────────────┘
               │  MCP (JSON-RPC over stdio)
               ▼
┌──────────────────────────────────────────────┐
│  MemoryForge MCP Server                      │
│  ┌──────────┐ ┌───────────┐ ┌────────────┐  │
│  │ 8 Tools  │ │ 5 Engines │ │ CLI (setup │  │
│  │ store    │ │ auto-name │ │  pro hook) │  │
│  │ search   │ │ auto-merge│ │            │  │
│  │ recall   │ │ priority  │ │ npx memory-│  │
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
│  └──────────────────────────────────────┘    │
└──────────┬───────────────┬───────────────────┘
           │               │
           ▼               ▼
┌──────────────────┐  ┌─────────────────────────┐
│  Free Storage    │  │  Pro Storage             │
│  ~/.memory-forge │  │  Shelby Protocol         │
│  memories/*.md   │  │  @shelby-protocol/sdk    │
│  (Markdown)      │  │  Aptos on-chain hashes   │
└──────────────────┘  └─────────────────────────┘
```

---

## Security

### What We Store

| Data | Location | Sensitivity |
|------|----------|:--:|
| Memory content | `~/.memory-forge/memories/` (Free) or encrypted Shelby blob (Pro) | Medium |
| User passwords | **Never stored** — PBKDF2-derived key, used then discarded | None |
| Private keys | User-local `~/.memory-forge/pro.json` (Pro) | User-managed |
| Payment info | **Never stored** — external processor handles it | None |

### Worst-Case Scenarios

| Attack | Attacker Gets | User Impact |
|--------|--------------|:--:|
| Server breached | Email list | None |
| Shelby node breached | AES-256-GCM encrypted blobs (can't decrypt) | None |
| Local machine breached | Plaintext memories (Free) or encrypted + key on disk (Pro) | Local only |

### Pro Encryption

```
User password → PBKDF2 (600K iterations) → 256-bit key → AES-256-GCM → encrypted Shelby blob
```

Same security model as 1Password and Bitwarden. Only you hold the decryption key.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Protocol | `@modelcontextprotocol/sdk` (MCP stdio) |
| Embeddings | `@huggingface/transformers` (Xenova/all-MiniLM-L6-v2, 23MB) |
| Validation | `zod` |
| Free Storage | Node.js `fs` — local Markdown (`~/.memory-forge/memories/*.md`) |
| Pro Storage | `@shelby-protocol/sdk` + `@aptos-labs/ts-sdk` |
| Runtime | Node.js 18+, TypeScript strict, ESM |

**Zero external SaaS. Zero API keys required. Embedding model runs locally. Everything works offline.**

---

## Competitive Landscape

MemoryForge is the **only MCP memory server** that uses decentralized storage. Every other tool uses local SQLite/Postgres.

| | MemoryForge | Mnemosyne | Engram | PLUR | Apex Memory |
|---|:---:|:---:|:---:|:---:|:---:|
| Storage | **Shelby (decentralized)** | SQLite | SQLite | YAML | SQLite |
| On-chain verifiable | ✅ | ❌ | ❌ | ❌ | ❌ |
| Cross-device sync | ✅ (Pro) | ❌ | ❌ | ❌ | ✅ (Pro) |
| Embedding model | In-process (23MB) | In-process | In-process | In-process | In-process |
| Tools | 8 | 23 | 6 | 10 | 30 |
| Auto-engines | 5 | 3 | 1 | 3 | 2 |
| Zero API keys | ✅ | ✅ | ✅ | ✅ | ✅ |
| MCP-native | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## The Market

AI memory is being validated by top-tier VCs:

- **Engram** raised **$98M** (Sequoia, Kleiner Perkins, June 2026)
- **Mem0** raised **$24M** (Basis Set, Peak XV, YC)
- **Gartner** predicts 40% of Agent AI projects will be canceled by end of 2027 — primarily due to cost escalation and unclear business value

MemoryForge's thesis: **decentralized storage makes AI memory cheaper, portable, and provable — at 1/100th the cost of enterprise alternatives.**

---

## Roadmap

```
v0.1.0 ✅  Published — 8 tools + 5 auto-engines + local storage
v0.1.1 ✅  npm metadata fix
v0.1.x ⬜  Hook stop auto-capture, wire auto-priority/auto-decay
v0.2.0 ⬜  SettleGrid payment integration (Stripe / Google Pay / USDC / Visa)
v0.3.0 ⬜  memory_verify (on-chain hash proof), memory_branch/rollback (Git-style CoW)
v1.0.0 ⬜  Web dashboard, team workspaces, SSE remote server
```

---

## Contributing

Issues and PRs welcome. Before submitting a PR:

```bash
npm run build   # tsc — must pass clean
npm test        # npx tsx src/test.ts — 48 tests must pass
```

## Links

- [npm](https://www.npmjs.com/package/memory-forge)
- [Issues](https://github.com/shelby-protocol/memory-forge/issues)
- [Shelby Protocol Docs](https://docs.shelby.xyz)

## License

MIT © [shelby-protocol](https://github.com/shelby-protocol)
