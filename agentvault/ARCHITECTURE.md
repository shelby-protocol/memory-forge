# MemoryForge — Architecture

## System Layers

```
┌─────────────────────────────────────┐
│  AI Agent (Claude Code / Cursor)    │
│  via MCP stdio protocol              │
├─────────────────────────────────────┤
│  MCP Server (index.ts)              │
│  9 tools + CLI hook routing          │
├──────────┬──────────────────────────┤
│  Free    │  Pro                      │
│  local   │  Shelby cloud             │
│  .md     │  @shelby-protocol/sdk     │
├──────────┴──────────────────────────┤
│  MemoryStore (store.ts)              │
│  LRU cache + cosine similarity       │
│  + keyword fallback                  │
├─────────────────────────────────────┤
│  Embedding (embedding.ts)            │
│  Transformers.js / MiniLM-L6-v2      │
│  23MB local model                    │
├─────────────────────────────────────┤
│  Auto-Engines (auto/index.ts)        │
│  name / merge / priority / decay     │
│  + context summary                   │
└─────────────────────────────────────┘
```

## Source Tree

```
agentvault/src/
├── index.ts          # MCP Server + CLI routing (setup/pro/hook)
├── store.ts          # MemoryStore: LRU + cosine similarity + keyword fallback
├── embedding.ts      # Transformers.js engine (lazy load, auto-fallback)
├── setup.ts          # One-command install (hooks + import + preload)
├── pro.ts            # Pro activation + Shelby bidirectional sync
├── auto/
│   └── index.ts      # 5 auto-engines (autoName/Merge/Priority/Decay/Summary)
├── storage/
│   ├── local.ts      # Local Markdown (~/.memory-forge/memories/)
│   └── shelby.ts     # Shelby cloud: upload/download/list/delete
├── hooks/
│   └── install.ts    # Claude Code settings.json hook config
└── migrate/
    └── import.ts     # Rule import (CLAUDE.md/.cursor/.gitconfig) + dedup
```

## Data Flow

### Free Tier

```
Agent calls memory_store()
  → index.ts: receives tool invocation
  → embedding.ts: vectorize content (failure → null)
  → auto/index.ts: auto-name + dedup-merge
  → storage/local.ts: write ~/.memory-forge/memories/{id}.md
  → store.ts: update LRU cache
```

### Pro Tier

```
Agent session start
  → hook session-start: load local memories → generate context summary
  → MCP Server start: if SHELBY_API_KEY present, sync
  → pro.ts syncAll():
    ↓ Download remote memories from Shelby (merge, skip existing)
    ↑ Upload new local memories to Shelby
    → Bidirectional sync complete
```

### Hook Lifecycle

```
SessionStart → memory-forge hook session-start
  → Load all memories → generate top-5 context summary → inject into agent

Stop → memory-forge hook stop
  → Iterate all memories → autoPriority recalc → autoDecay check
  → decay=0 → delete (archive)
  → priority changed → save

PreCompact → memory-forge hook pre-compact
  → Generate top-8 context summary → inject save instruction
  → Agent prompted to save key decisions/preferences/learnings
  → Context compacts → memories already persisted → survive forced closes
```

## Dependencies

| Dependency | Purpose | Runtime Network |
|---|---|---|
| `@modelcontextprotocol/sdk` | MCP stdio protocol | None |
| `zod` | Tool parameter validation | None |
| `@huggingface/transformers` | Local embedding model | One-time 23MB download |
| `@shelby-protocol/sdk` (optional) | Pro cloud storage | Shelbynet API |
| `@aptos-labs/ts-sdk` (optional) | Pro on-chain account | Shelbynet fullnode |

## Security Model

- Free: fully local, no network (except one-time model download)
- Pro: API key via environment variable, private key stored locally
- Memory files: `~/.memory-forge/memories/{id}.md`, controlled by filesystem permissions
- Dedup: >80% content overlap triggers auto-merge, preventing duplicates
