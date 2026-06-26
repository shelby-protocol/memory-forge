# MemoryForge — Technical Documentation

> Version 0.3.0 | 8 MCP Tools + 5 Auto-Engines | Free (local) + Pro (Shelby cloud) | 52 tests

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Data Model](#data-model)
3. [MCP Tool API Reference](#mcp-tool-api-reference)
4. [Auto-Engines](#auto-engines)
5. [Hook System](#hook-system)
6. [Storage Layer](#storage-layer)
7. [Embedding Engine](#embedding-engine)
8. [Security Model](#security-model)
9. [Pro Tier (Shelby Cloud)](#pro-tier-shelby-cloud)
10. [Error Handling & Degradation](#error-handling--degradation)

---

## System Architecture

```
┌─────────────────────────────────────┐
│  AI Agent (Claude Code / Cursor)    │  MCP stdio protocol
├─────────────────────────────────────┤
│  CLI Router (index.ts)              │
│  setup / pro / hook / MCP Server    │
├─────────────────────────────────────┤
│  8 MCP Tools                        │
│  store / search / recall / list     │
│  forget / context / export / share  │
├──────────────┬──────────────────────┤
│  Free Tier   │  Pro Tier             │
│  MemoryStore │  ShelbyNodeClient     │
│  local .md   │  upload/download/list │
├──────────────┴──────────────────────┤
│  5 Auto-Engines                     │
│  name → merge → priority → decay    │
│  → contextSummary                   │
├─────────────────────────────────────┤
│  Embedding Engine                   │
│  Transformers.js / MiniLM-L6-v2     │
│  384-dim vectors, cosine similarity │
│  fallback: keyword matching         │
└─────────────────────────────────────┘
```

### Source File Structure

```
agentvault/src/
├── index.ts           # Entry: CLI routing + MCP Server
├── store.ts           # MemoryStore: in-memory index + search
├── embedding.ts       # Transformers.js lazy-load engine
├── setup.ts           # One-command install flow
├── pro.ts             # Pro activation + bidirectional sync
├── auto/index.ts      # 5 auto-engines
├── storage/
│   ├── local.ts       # Markdown file read/write
│   └── shelby.ts      # Shelby cloud API wrapper
├── hooks/install.ts   # Claude Code hooks configuration
└── migrate/import.ts  # Rule import + dedup
```

---

## Data Model

### Memory Interface

```typescript
interface Memory {
  id: string;              // UUID v4
  name: string;            // Human-readable name (autoName, max 40 chars)
  content: string;         // Raw content
  category: string;        // user-preference | project-context | decision-log | code-pattern
  tags: string[];          // Tag list
  priority: number;        // 1–10, dynamically adjusted by autoPriority
  vector: number[];        // 384-dim embedding vector
  created_at: string;      // ISO-8601 creation timestamp
  access_count: number;    // Touch count
  last_accessed: string | null;  // Last access timestamp
}
```

### Local Storage Format

Path: `~/.memory-forge/memories/{id}.md`

```markdown
# Memory Name
> category: user-preference
> tags: coding-style, javascript
> priority: 8
> created: 2026-06-26T10:00:00.000Z
> access_count: 5
> last_accessed: 2026-06-26T12:00:00.000Z

User prefers camelCase naming, single quotes, and 2-space indent.
```

### MemoryStore Index

- `Map<string, Memory>` primary store
- `Map<string, Float32Array>` vector cache
- LRU eviction: 5,000 entry cap, evicts lowest `access_count × priority`
- Dedup: Jaccard similarity > 0.8 triggers auto-merge

---

## MCP Tool API Reference

All tools are invoked via the MCP stdio protocol. The agent receives them automatically — no manual invocation required.

### memory_store

Store a memory. Auto-embeds, names, and dedup-merges.

```typescript
// Input
{
  content: string;        // required, min 1 char
  category?: string;      // "general" | "user-preference" | "project-context" | "decision-log" | "code-pattern"
  tags?: string[];        // default: []
  priority?: number;      // 1–10, default: 5
}

// Output (success)
{
  success: true;
  merged?: boolean;       // true if merged with existing (>80% overlap)
  memory_id: string;
  name: string;
  preview: string;        // first 200 chars
}
```

**Internal pipeline:**
1. `embed(content)` → 384-dim vector (null on failure)
2. `autoName(content)` → extract name from content
3. `autoMerge(store, memory)` → check existing, merge if Jaccard > 0.8
4. `saveMemory(memory)` → write local Markdown
5. `store.add(memory)` → update LRU cache
6. Pro: `uploadMemory(memory)` → Shelby cloud (async, fire-and-forget)

### memory_search

Semantic memory search. Vector-first, auto-fallback to keyword.

```typescript
// Input
{
  query: string;           // required, natural language
  limit?: number;          // 1–20, default: 5
  min_similarity?: number; // 0–1, default: 0.6
  category?: string;       // filter by category
  tags?: string[];         // filter by tags (OR match)
}

// Output
{
  query: string;
  count: number;
  results: [{
    memory_id: string;
    name: string;
    similarity: number;    // cosine similarity (0 if keyword fallback)
    content: string;
    _method: "vector" | "keyword";
  }];
  hint: string | null;     // "No relevant memories found." if empty
}
```

**Scoring formula (vector mode):**
```
score = cosineSimilarity(queryVec, memoryVec)
      × (priority / 5)
      × (1 + min(access_count, 10) × 0.05)
```

**Scoring formula (keyword mode):**
```
score = (contentHits × 2 + nameHits × 3) + priority
```

### memory_recall

Exact retrieval by memory ID.

```typescript
// Input
{ memory_id: string }

// Output (success)
{
  memory_id, name, content, category, tags,
  priority, created_at, access_count
}

// Output (not found)
{ error: "Not found", memory_id }
```

### memory_list

List memories with pagination and filtering.

```typescript
// Input
{
  category?: string;    // filter
  tags?: string[];      // filter (OR match)
  limit?: number;       // 1–100, default: 20
  offset?: number;      // default: 0
}

// Output
{
  total: number;        // total memory count
  count: number;        // current page count
  memories: [{
    memory_id, name, category,
    tags, priority,
    preview: string;    // first 100 chars
  }];
}
```

### memory_forget

Delete a memory (local file + in-memory cache).

```typescript
// Input
{ memory_id: string }

// Output
{
  success: boolean;
  memory_id: string;
  action: "deleted" | "not_found";
}
```

### memory_context

Load current session context — returns top recently-accessed, high-priority memory summaries.

```typescript
// Input
{ limit?: number;  // 1–20, default: 5 }

// Output
{
  context_loaded: true;
  memory_count: number;
  context: string;  // format: "- [name] preview..."
}
```

**Sort order:** `access_count` DESC, ties broken by `priority` DESC.

### memory_export

Export memories as JSON or Markdown.

```typescript
// Input
{
  memory_ids?: string[];  // omit to export all
  format?: "json" | "markdown";  // default: "json"
}

// Output (JSON)
{
  exported_at: string;
  version: "memory-forge-1.0";
  count: number;
  memories: [{ id, name, content, category, tags, priority, created_at }];
}

// Output (Markdown)
# Memory Name
> category: x | tags: a, b | priority: 7
...
---
```

### memory_share

Package a single memory for import by teammates.

```typescript
// Input
{
  memory_id: string;
  recipient?: string;
  note?: string;
}

// Output
{
  type: "memory-forge-share";
  version: "1.0";
  shared_at: string;
  recipient: string | null;
  note: string | null;
  memory: { name, content, category, tags };
  import_instruction: "Use memory_store with this content to import.";
}
```

---

## Auto-Engines

All engines are located in `src/auto/index.ts`.

### autoName

Extracts a human-readable name from content.

```
Algorithm:
1. Strip code blocks (```...```)
2. Take first 40 chars
3. Replace newlines with spaces
4. Empty content → "memory"
```

### autoMerge

Detects and merges duplicate memories.

```
Algorithm:
1. Jaccard similarity: |setA ∩ setB| / min(|setA|, |setB|)
2. Minimum word length: 3 chars
3. Threshold: > 0.8 → merge
4. Recompute embedding vector after merge
```

### autoPriority

Computes priority score (1–10) based on the Ebbinghaus forgetting curve.

```
Formula:
freqWeight    = min(access_count, 50) / 50
recencyWeight = 1 - (daysSinceLastAccess / 90)  // clamp 0–1
ageWeight     = 1 - min(ageDays, 365) / 365

priority = 1 + 9 × (freqWeight × 0.4 + recencyWeight × 0.4 + ageWeight × 0.2)
```

### autoDecay

Determines whether a memory should be archived.

```
| Days     | Decay Value | Status            |
|----------|-------------|-------------------|
| ≤1       | 1.0         | Active            |
| ≤7       | 0.8         | Recent            |
| ≤30      | 0.5         | Decaying          |
| ≤90      | 0.2         | Weak              |
| >90      | 0           | Archived (deleted) |
```

### generateContextSummary

Generates a context summary for agent injection.

```
Algorithm:
1. Sort all memories by access_count DESC, priority DESC
2. Truncate to top-N
3. Truncate each to 150 chars
4. Format: "- [name] content..."
```

---

## Hook System

Configuration location: `~/.claude/settings.json`

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{"type": "command", "command": "memory-forge hook session-start"}]
    }],
    "Stop": [{
      "hooks": [{"type": "command", "command": "memory-forge hook stop"}]
    }],
    "PreCompact": [{
      "hooks": [{"type": "command", "command": "memory-forge hook pre-compact"}]
    }]
  }
}
```

### Lifecycle

```
SessionStart  → Load top-5 memories → Inject into agent context (stdout)
   ↓
Agent works   → Calls memory_store / memory_search / etc.
   ↓
PreCompact    → Load top-8 memories + inject save instruction → Agent auto-saves
   ↓
Stop          → autoPriority recalc + autoDecay check + archive expired
   ↓
(next) SessionStart → Memories preserved ✅
```

### Key Design Decision

**Why PreCompact instead of Stop for auto-capture?**

The Stop hook only fires on graceful exit. `kill`, closing the terminal window, or crashes will skip it. PreCompact always fires when the context window approaches its limit — the process is still alive and the agent can execute the save instruction.

---

## Storage Layer

### Free Tier (Local Markdown)

- Path: `~/.memory-forge/memories/{id}.md`
- Format: YAML-like frontmatter + Markdown body
- Encoding: UTF-8
- Permissions: user filesystem control
- Network: zero

### Pro Tier (Shelby Cloud)

- SDK: `@shelby-protocol/sdk` ^0.3.1 (optionalDependency)
- Network: Shelbynet testnet
- Auth: API Key + Ed25519 on-chain account
- Blob format: `memories/{id}.json` (JSON)
- Expiry: 365 days
- Data flow: bidirectional sync (↓↑ on session start, ↑ on memory_store)

**Pro data flow:**
```
SessionStart:
  syncAll():
    ↓ listBlobs() → fetch remote memory list
    ↓ downloadMemory() → download anything not local (30s timeout)
    ↑ uploadMemory() → upload local-only memories
    → Bidirectional sync complete

memory_store:
  saveMemory() → local
  uploadMemory() → Shelby (fire-and-forget, failure is non-blocking)
```

---

## Embedding Engine

### Tech Stack

- Library: `@huggingface/transformers` ^3.0.0
- Model: Xenova/all-MiniLM-L6-v2
- Size: ~23MB (one-time download, cached thereafter)
- Dimensions: 384
- Pooling: mean pooling + L2 normalization

### Degradation Strategy

```
Load model
  → Success: cosine similarity search
  → Failure: keyword matching (Jaccard)
     + 5-minute auto-retry
     + sleep(300s) to prevent request storms
```

### Performance

- First load: 3–10s (depends on network; 23MB download)
- Subsequent inference: < 100ms
- Keyword fallback: < 10ms
- Model caching: Transformers.js built-in cache

---

## Security Model

### Free Tier

- All data in `~/.memory-forge/` directory
- Zero ongoing network requests
- Only network: one-time model download (HuggingFace CDN, 23MB)
- Model download failure → keyword fallback, zero functionality loss

### Pro Tier

- API Key: `SHELBY_API_KEY` environment variable only — never written to disk
- Private Key: `~/.memory-forge/pro.json`, Ed25519 format
- Transport: HTTPS (Shelbynet API)
- On-chain: each memory → Aptos blob upload transaction
- Deletion: tombstone blob (marks deletion; chain is immutable)

### Memory Permissions

- Filesystem permissions = memory permissions (Free)
- On-chain account signature = memory permissions (Pro)
- No built-in auth layer (agent is already authenticated by Claude Code)

---

## Error Handling & Degradation

| Scenario | Behavior | Impact |
|----------|----------|--------|
| Embedding model download fails | Keyword search, 5min retry | Lower search precision, functional |
| Embedding model inference fails | Return null, keyword fallback | Single query degraded |
| Shelby upload fails | console.error, non-blocking | Pro sync delayed, local intact |
| Shelby download timeout | 30s timeout, return null | That memory skipped, others OK |
| Shelby on-chain gas insufficient | Upload fails + error message | Pro unavailable, Free intact |
| parseMemoryFile corrupt | Skip file, return null | Corrupt file ignored |
| Disk write fails | Silent failure | Memory lost (extremely rare) |
| LRU at 5,000 limit | Evict lowest access_count × priority | Old memories evicted from cache, disk preserved |
