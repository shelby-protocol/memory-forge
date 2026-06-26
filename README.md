# MemoryForge

<p align="center">
  <b>Forge persistent memories for your AI agent.</b><br>
  One command. Zero config. 8 MCP tools + 5 auto-engines.<br>
  Powered by <a href="https://docs.shelby.xyz">Shelby Protocol</a> — decentralized hot storage.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/memory-forge"><img src="https://img.shields.io/npm/v/memory-forge" alt="npm"></a>
  <a href="https://github.com/shelby-protocol/memory-forge/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/memory-forge" alt="license"></a>
  <a href="https://www.npmjs.com/package/memory-forge"><img src="https://img.shields.io/npm/dm/memory-forge" alt="downloads"></a>
</p>

---

## Why

Your AI agent forgets everything when you close the terminal. Preferences, project context, decisions — all gone. MemoryForge gives it persistent memory that works across sessions, across platforms, and across computers.

**66% of developers** report "almost right, but not quite" outputs from their AI agents. The root cause: missing context. Every session starts from zero.

## Quick Start

```bash
npx memory-forge setup
```

Done. Your agent now remembers.

Works with: **Claude Code** | **Cursor** | **Windsurf** | **VS Code**

## 8 MCP Tools

| Tool | What it does |
|------|-------------|
| `memory_store` | Store a memory with auto-vectorization, auto-naming, and auto-dedup |
| `memory_search` | Semantic search — vectors first, keyword fallback on failure |
| `memory_recall` | Fetch exact memory by ID |
| `memory_list` | Browse memories with category and tag filters |
| `memory_forget` | Delete a memory + cleanup |
| `memory_context` | Load session context — top-N by priority × access frequency |
| `memory_export` | Export all or selected memories as JSON or Markdown |
| `memory_share` | Package a memory for sharing with teammates or other agents |

## 5 Background Auto-Engines

| Engine | Trigger | What it does |
|--------|---------|-------------|
| Auto-Name | Every store | Generates human-readable names from content |
| Auto-Merge | Every store | Merges 80%+ similar memories to prevent duplicates |
| Auto-Priority | Every access | Scores 1-10 based on frequency × recency × age |
| Auto-Decay | Time-based | Ebbinghaus forgetting curve — 90 days → archive |
| Context Injection | Session start | Loads top-3 relevant memories into each session |

## Free vs Pro

| | Free | Pro ($5/mo) |
|---|:---:|:---:|
| Storage | Local Markdown | Shelby decentralized cloud |
| Memories | 5,000 | Unlimited |
| Cross-device | Manual export/import | Auto-sync |
| Encryption | — | AES-256-GCM |

## Architecture

```
Agent (Claude Code / Cursor / Windsurf / VS Code)
  ↕  MCP (JSON-RPC over stdio)
MemoryForge MCP Server (TypeScript, Node 18+)
  ↕
Storage layer:
  Free: ~/.memory-forge/memories/*.md
  Pro:  @shelby-protocol/sdk → Shelby Protocol (Aptos + DoubleZero)
Embeddings:
  Transformers.js (Xenova/all-MiniLM-L6-v2, 23MB, in-process)
```

## Tech Stack

- **MCP**: `@modelcontextprotocol/sdk`
- **Embeddings**: `@huggingface/transformers` (23MB, zero external API)
- **Free storage**: Local Markdown files
- **Pro storage**: `@shelby-protocol/sdk` + `@aptos-labs/ts-sdk`
- **Validation**: `zod`
- **Runtime**: Node.js 18+, TypeScript, ESM

## Zero External Dependencies

No API keys required. No cloud. No Docker. No Postgres. Embedding model runs in-process. Everything works offline.

## Links

- [npm](https://www.npmjs.com/package/memory-forge)
- [Issues](https://github.com/shelby-protocol/memory-forge/issues)
- [Shelby Protocol](https://docs.shelby.xyz)

## License

MIT — [shelby-protocol](https://github.com/shelby-protocol)
