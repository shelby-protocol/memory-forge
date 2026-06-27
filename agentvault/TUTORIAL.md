# MemoryForge — Complete User Guide

> v0.7.0 · One command. Zero config. Your AI agent remembers everything.

---

## Table of Contents

1. [What MemoryForge Does](#1-what-memoryforge-does)
2. [Installation](#2-installation)
3. [Your First Session](#3-your-first-session)
4. [How Agent Memory Works](#4-how-agent-memory-works)
5. [All 9 MCP Tools — With Examples](#5-all-9-mcp-tools--with-examples)
6. [5 Auto-Engines](#6-5-auto-engines)
7. [Session Handoff — Resume Instantly](#7-session-handoff--resume-instantly)
8. [Git Branch Awareness](#8-git-branch-awareness)
9. [Stale Detection](#9-stale-detection)
10. [Memory Relations (related_to)](#10-memory-relations-related_to)
11. [Stats — Memory Health Dashboard](#11-stats--memory-health-dashboard)
12. [Pro — Cross-Device Cloud Sync](#12-pro--cross-device-cloud-sync)
13. [Context Sorting — How Memories Are Ranked](#13-context-sorting--how-memories-are-ranked)
14. [Storage — What Files Are Created](#14-storage--what-files-are-created)
15. [CLI Commands Reference](#15-cli-commands-reference)
16. [Troubleshooting](#16-troubleshooting)
17. [Uninstall](#17-uninstall)
18. [Pro Tips](#18-pro-tips)

---

## 1. What MemoryForge Does

MemoryForge gives your AI coding agent **persistent memory across sessions, computers, and time.**

Without MemoryForge: Every time you open Claude Code (or Cursor, Windsurf, VS Code), your agent starts with a blank slate. It doesn't know your name, your project, your preferences, or what you were working on 10 minutes ago.

With MemoryForge: On session start, the agent instantly knows:

| What Agent Remembers | Example |
|---|---|
| Your coding preferences | "Uses `pnpm`, not `npm`. Prefers React 19 with TypeScript strict mode." |
| Project context | "Monorepo with Turborepo. PostgreSQL + Prisma. Deployed to Vercel." |
| Past decisions | "Chose Redis over Memcached for session store because of persistence needs." |
| What you were working on | "Last session: fixed auth middleware JWT refresh. Next: deploy to staging." |
| Debugging history | "Auth bug was caused by token expiry offset of 5 seconds. Fixed in middleware.ts." |
| Your team's conventions | "All API endpoints return RFC 9457 Problem Details JSON error bodies." |

All of this happens **automatically** after a one-time `npx memory-forge setup`.

---

## 2. Installation

### Step 1: Run Setup

```bash
npx memory-forge setup
```

**What happens:**

```
╔══════════════════════════╗
║   MemoryForge Setup       ║
╚══════════════════════════╝

📦 Installing memory-forge globally (background)…
   ✅ Global install complete

🪝  Installing Claude Code hooks…
   ✅ Hooks installed (SessionStart / Stop / PreCompact / PostToolUse)

📋 Scanning existing rules…
   Found 3 rules in CLAUDE.md / .cursor/rules / .gitconfig
   ✅ Imported 3 rules as memories

🧠 Preloading embedding model (background)…
   ℹ️  Model will download on first use (~23MB, one-time)

🔍 Verifying setup…
   SessionStart:  ✅
   Stop:          ✅
   PreCompact:    ✅
   PostToolUse:   ✅

┌──────────────────────────────────────┐
│  MemoryForge is ready!                │
│                                      │
│  Your AI Agent now has memory.       │
│  It will automatically:              │
│    • Remember your preferences       │
│    • Load context on session start   │
│    • Capture learnings each session  │
│                                      │
│  Try it now:                          │
│    • CLI:  memory-forge list         │
│    • CLI:  memory-forge search "react"│
│    • CLI:  memory-forge stats        │
│    • MCP:  memory_store "I prefer…"  │
│                                      │
│  No further setup needed.            │
└──────────────────────────────────────┘
```

### Step 2: Verify

```bash
memory-forge stats
```

```
Total: 3  |  Accesses: 0  |  Weekly new: 3  |  Oldest: Jun 27  |  Newest: Jun 27
Categories: claude-rules(2)  user-info(1)
Decay: active=3 fading=0 stale=0 archived=0
```

Your imported rules are already stored as memories.

### Requirements

- **Node.js 18+**
- **Claude Code / Cursor / Windsurf / VS Code** with MCP support
- **Git** (optional — for branch awareness feature)
- **Free tier**: No network needed (except one-time 23MB model download)
- **Pro tier**: Shelbynet testnet account (free faucet tokens)

---

## 3. Your First Session

Now open Claude Code (or your MCP-compatible IDE). You'll see something like:

```
MemoryForge: 3 memories loaded from previous sessions

[MemoryForge] 📋 Recent context from previous sessions:

- [Global Instructions] Jun 27, 05:30 PM | claude-rules
  # Global Instructions  ## Auto Context Management  - When context usage…

- [Git User Info] Jun 27, 05:30 PM | user-info
  Git user email: you@example.com Git user name: YourName
```

The agent already knows your imported rules. Now let's teach it something new.

### Tell the agent about your project

Just talk normally. The agent calls tools on its own:

**You:** "Our project uses React 19, TypeScript strict mode, Tailwind CSS v5, and pnpm as the package manager."

**Agent** *(internally calls memory_store)*:
```json
{
  "success": true,
  "memory_id": "a1b2c3d4-...",
  "name": "Our project uses React 19 TypeScript strict mode Tailwind",
  "preview": "Our project uses React 19, TypeScript strict mode, Tailwind CSS v5, and pnpm as the package manager."
}
```

**Agent** (to you): "I've saved that. Your project stack is React 19, TypeScript strict, Tailwind v5, and pnpm."

### Make a decision

**You:** "Let's use PostgreSQL with JSONB for the document store instead of MongoDB."

**Agent** *(internally calls memory_store)*:
```json
{
  "success": true,
  "memory_id": "b2c3d4e5-...",
  "name": "Use PostgreSQL with JSONB for document storage",
  "category": "decision-log",
  "priority": 7
}
```

### Search for a past decision

**You:** "What database did we decide to use?"

**Agent** *(internally calls memory_search)* → finds the PostgreSQL decision memory immediately.

---

## 4. How Agent Memory Works

### The 4-Phase Lifecycle

```
┌─────────────────────────────────────────────────────┐
│  SESSION START                                      │
│  Hook fires → loads top-5 memories → agent knows    │
│  context immediately                                │
├─────────────────────────────────────────────────────┤
│  DURING SESSION                                     │
│  Agent calls memory_store/search/recall/list/       │
│  update/forget as needed                            │
│  postToolUse hook nudges agent to save key changes  │
├─────────────────────────────────────────────────────┤
│  PRE-COMPACT                                        │
│  Context window nearly full → agent told to write   │
│  session handoff + save key learnings               │
│  Transcript captured as safety net                  │
├─────────────────────────────────────────────────────┤
│  SESSION STOP                                       │
│  Hook fires → autoPriority recalc → autoDecay       │
│  check → transcript saved → Pro sync to cloud       │
└─────────────────────────────────────────────────────┘
```

### Memory Categories

Each memory has a category that affects how long it's "remembered" in context:

| Category | Half-Life | Use For |
|---|---|---|
| `session-handoff` | **∞** (always shown) | Session summary, what you did last time |
| `decision-log` | 38 days | Architecture decisions, technology choices |
| `project-context` | 30 days | Tech stack, repo structure, conventions |
| `user-preference` | 24 days | Coding style, tool preferences, conventions |
| `code-pattern` | 20 days | Reusable patterns, boilerplate, templates |
| `general` | 14 days | Everything else |
| `session-transcript` | **0** (never in context) | Raw conversation logs |

---

## 5. All 9 MCP Tools — With Examples

### 5.1 `memory_store` — Save a Memory

The agent's primary tool. You don't call it directly — the agent does.

**Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `content` | string (1-100000 chars) | **required** | The memory content |
| `category` | string | `"general"` | See categories above |
| `tags` | string[] | `[]` | Searchable tags |
| `priority` | number (1-10) | `5` | Importance. 10 = evergreen |
| `name` | string (1-120) | auto-generated | Custom memory name |
| `branch` | string | auto-detected | Git branch for context scoping |
| `related_to` | string[] | `[]` | IDs of related memories |

**Example 1 — Simple preference:**
```
memory_store({
  content: "Always use tabs for indentation in Go files, spaces in TypeScript files.",
  category: "user-preference",
  tags: ["formatting", "indentation"],
  priority: 8
})
```

**Example 2 — Project decision:**
```
memory_store({
  content: "Chose Redis (v7.2) over Memcached for session store. Reasons: persistence support, richer data structures, existing team expertise. Memcached would be simpler but lacks persistence needed for our use case.",
  category: "decision-log",
  tags: ["redis", "architecture", "session-store"],
  priority: 9
})
```

**Example 3 — Code pattern:**
```
memory_store({
  content: "Repository pattern: all data access goes through interfaces in src/repositories/. Implementation classes in src/repositories/implementations/. Use dependency injection via constructor params.",
  category: "code-pattern",
  tags: ["architecture", "repository-pattern", "dependency-injection"],
  priority: 7
})
```

**Example 4 — With relations:**
```
memory_store({
  content: "PostgreSQL schema for users table: id UUID PK, email UNIQUE, name TEXT, created_at TIMESTAMPTZ, settings JSONB.",
  category: "decision-log",
  tags: ["database", "postgresql", "schema"],
  priority: 8,
  related_to: ["b2c3d4e5-..."]  // links to the "Chose PostgreSQL" memory
})
```

### 5.2 `memory_search` — Find Memories

Semantic search. Vector search when embedding model is available, falls back to keyword search.

**Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `query` | string | **required** | Natural language query |
| `limit` | number (1-20) | `5` | Max results |
| `min_similarity` | number (0-1) | `0.6` | Minimum relevance score |
| `category` | string | — | Filter by category |
| `tags` | string[] | — | Filter by tags (OR match) |

**Example 1 — Find past solutions:**
```
memory_search({
  query: "how did we fix the authentication token expiry bug",
  limit: 3
})
```

Response:
```json
{
  "query": "how did we fix the authentication token expiry bug",
  "count": 1,
  "results": [{
    "memory_id": "c3d4e5f6-...",
    "name": "JWT token expiry offset bug in auth middleware",
    "similarity": 0.85,
    "content": "Token expiry check used `<` instead of `<=` in src/auth/middleware.ts:42. This caused tokens to expire 5 seconds early. Fixed by changing to `<=`.",
    "_method": "keyword"
  }]
}
```

**Example 2 — Search within category:**
```
memory_search({
  query: "database schema",
  category: "decision-log",
  limit: 5
})
```

### 5.3 `memory_recall` — Get Full Details

Retrieve a specific memory by its ID. Returns full content, all metadata, and related memories.

```
memory_recall({
  memory_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
})
```

Response:
```json
{
  "memory_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "Our project uses React 19 TypeScript strict mode",
  "content": "Our project uses React 19, TypeScript strict mode, Tailwind CSS v5, and pnpm as the package manager.",
  "category": "user-preference",
  "tags": ["react", "typescript", "tailwind", "pnpm"],
  "priority": 8,
  "created_at": "2026-06-27T09:30:00.000Z",
  "access_count": 5,
  "branch": "main",
  "related_to": ["b2c3d4e5-..."],
  "related_memories": [{"id": "b2c3d4", "name": "Use PostgreSQL with JSONB"}]
}
```

### 5.4 `memory_list` — Browse All

**Parameters:**

| Param | Type | Default |
|---|---|---|
| `category` | string | — |
| `tags` | string[] | — |
| `limit` | number (1-100) | `20` |
| `offset` | number | `0` |

**Example — Browse all decisions:**
```
memory_list({
  category: "decision-log",
  limit: 10,
  offset: 0
})
```

### 5.5 `memory_update` — Edit a Memory

Partially update. Only provided fields are changed — unset fields stay untouched.

**Example — Increase priority of a decision:**
```
memory_update({
  memory_id: "b2c3d4e5-...",
  priority: 10,
  tags: ["redis", "architecture", "session-store", "critical"]
})
```

**Example — Update content:**
```
memory_update({
  memory_id: "a1b2c3d4-...",
  content: "Project stack updated: React 19, TypeScript 5.8 strict, Tailwind v5, pnpm v10, Node.js 22."
})
```

**Example — Link related memories:**
```
memory_update({
  memory_id: "b2c3d4e5-...",
  related_to: ["a1b2c3d4-...", "c3d4e5f6-..."]
})
```

### 5.6 `memory_forget` — Delete

```
memory_forget({
  memory_id: "old-memory-id-..."
})
```

Response: `{ "success": true, "memory_id": "...", "action": "deleted" }`

With Pro: also uploads a cloud tombstone so deletion propagates to other devices.

### 5.7 `memory_context` — Load Session Context

Returns the same top-N context that SessionStart injects.

```
memory_context({ limit: 3 })
```

### 5.8 `memory_export` — Backup/Portability

**JSON format:**
```
memory_export({ format: "json" })
```
Returns a complete JSON object with all memories. Can be imported on another machine.

**Markdown format:**
```
memory_export({ format: "markdown" })
```
Human-readable format, good for documentation or sharing.

**Export specific memories:**
```
memory_export({
  memory_ids: ["id1", "id2"],
  format: "json"
})
```

### 5.9 `memory_share` — Share with Teammates

Package a single memory for import by another agent.

```
memory_share({
  memory_id: "b2c3d4e5-...",
  recipient: "alice",
  note: "Here's the database decision we made last week."
})
```

Response:
```json
{
  "type": "memory-forge-share",
  "version": "1.0",
  "shared_at": "2026-06-27T10:00:00.000Z",
  "recipient": "alice",
  "note": "Here's the database decision we made last week.",
  "memory": {
    "name": "Use PostgreSQL with JSONB for document storage",
    "content": "Chose PostgreSQL (v17) with JSONB for document storage...",
    "category": "decision-log",
    "tags": ["postgresql", "architecture"]
  },
  "import_instruction": "Use memory_store with this content to import."
}
```

The recipient's agent can import it with one `memory_store` call.

---

## 6. 5 Auto-Engines

These run automatically. You never need to think about them.

### autoName

Extracts the first meaningful sentence from content as the memory name.

| Content | Generated Name |
|---|---|
| "Always use React 19 with TypeScript strict mode. We also use..." | "Always use React 19 with TypeScript strict mode." |
| "```\ncode block\n```" (code only) | "memory" (fallback) |

Override with `name` parameter in `memory_store`.

### autoMerge

When you store a new memory that's >80% similar to an existing one, it merges instead of duplicating.

```
[MemoryForge] Merged duplicate: "PostgreSQL schema v2" → "PostgreSQL schema" (80%+ overlap)
```

### autoPriority

At session end, recalculates priority (1-10) for every memory based on:
- **Access frequency** (40% weight) — how often it's been retrieved
- **Recency** (40% weight) — how recently it was accessed
- **Age** (20% weight) — how long ago it was created

### autoDecay

At session end, checks every memory against the Ebbinghaus forgetting curve:

| Last Access | Decay Score | Action |
|---|---|---|
| 0-1 days | 1.0 | Active |
| 1-7 days | 0.8 | Active |
| 7-30 days | 0.5 | Fading |
| 30-90 days | 0.2 | Stale |
| 90+ days | 0 | **Archived** (file deleted) |

### generateContextSummary

Builds the top-N context injection for SessionStart and PreCompact. See [Context Sorting](#13-context-sorting--how-memories-are-ranked).

---

## 7. Session Handoff — Resume Instantly

### The Problem

Without handoff, SessionStart gives you memory fragments:

```
- [React 19 rules] Jun 27 | code-pattern
- [PostgreSQL schema] Jun 26 | decision-log
- [User prefers pnpm] Jun 25 | user-preference
```

Agent sees preferences and decisions, but **doesn't know what you were actually doing** last session.

### How It Works

PreCompact (before context window fills up) tells the agent:

```
[MEMORYFORGE HANDOFF] Create a session handoff summary BEFORE the context compacts.
Use memory_store with category="session-handoff" and priority=10. Include:
1. What we worked on this session
2. Key decisions made and why
3. File paths modified (for git context)
4. What's blocked or pending for next time
5. Any user preferences or patterns observed
This handoff will appear FIRST on the next SessionStart so you can resume instantly.
```

### What the Agent Creates

```
memory_store({
  content: "## Work done\n- Fixed auth middleware JWT token refresh bug in middleware.ts:42\n- Added Redis (v7.2) session store for token blacklisting\n- Wrote 12 unit tests covering JWT refresh edge cases\n\n## Key decisions\n- Redis over Memcached: persistence needed for token blacklist\n- JWT refresh window: 15 minutes (was 5 minutes)\n\n## Next steps\n- [ ] Deploy to staging and run integration tests\n- [ ] Update frontend token refresh logic to match new window\n- [ ] Write migration docs for Redis session store\n\n## Files modified\n- src/auth/middleware.ts (line 42: changed `<` to `<=`)\n- src/auth/token.ts (JWT refresh window: 300000 → 900000)\n- src/cache/redis.ts (new file: session store implementation)\n- src/auth/__tests__/middleware.test.ts (12 new tests)\n\n## Preferences observed\n- User prefers `pnpm` over `npm`\n- User always runs tests before committing\n- User uses VS Code with the Tailwind CSS IntelliSense extension",
  category: "session-handoff",
  priority: 10
})
```

### Next Session

```
## 📋 Last session (Jun 27, 5:52 PM)

## Work done
- Fixed auth middleware JWT token refresh bug in middleware.ts:42
- Added Redis (v7.2) session store for token blacklisting
- Wrote 12 unit tests covering JWT refresh edge cases

## Key decisions
- Redis over Memcached: persistence needed for token blacklist
- JWT refresh window: 15 minutes (was 5 minutes)

## Next steps
- [ ] Deploy to staging and run integration tests
- [ ] Update frontend token refresh logic to match new window
- [ ] Write migration docs for Redis session store

---

Other recent memories:
- [React 19 rules] Jun 27 | code-pattern
- [PostgreSQL schema] Jun 26 | decision-log
```

Agent can immediately say: "Last session we fixed the JWT refresh bug and set up Redis for token blacklisting. The next step is deploying to staging. Want me to continue from there?"

---

## 8. Git Branch Awareness

### What It Does

When you switch branches, memories from your current branch get a **+50% score boost** in context. Memories from other branches are still visible but rank lower.

### How It Works (Automatic)

Every `memory_store` call auto-detects the current branch via `git branch --show-current` and stores it in the `branch` field.

### Manual Override

```
memory_store({
  content: "This decision applies to all branches.",
  branch: "*"  // Global memory, not branch-specific
})
```

### Effect on Context

On `feat/auth` branch:
```
📋 5 memories on feat/auth (boosted)
- [JWT refresh fix] feat/auth
- [OAuth2 integration plan] feat/auth
- [Middleware refactor] feat/auth

📋 Other memories
- [PostgreSQL schema] main
- [Deploy pipeline] main
```

On `main` branch:
```
📋 No branch-specific memories
- [PostgreSQL schema] main
- [Deploy pipeline] main
- [JWT refresh fix] feat/auth (normal weight)
```

### Stats

```
memory-forge stats

Branches: main(28)  feat/auth(5)  fix/billing(3)
```

---

## 9. Stale Detection

### What It Does

If a memory references file paths that no longer exist, it's flagged as potentially outdated.

### How It Works (Automatic)

SessionStart scans memory content for file path patterns (`src/...`, `lib/...`, `app/...`, `config/...`, `docs/...`) and checks if those files still exist on disk.

### Example

```
- [Fix auth middleware] Jun 20 | decision-log ⚠️ stale: src/auth/middleware.ts, src/auth/old-config.ts
  JWT token refresh bug fix — middleware.ts has been refactored since this memory was created
```

Agent sees `⚠️ stale` and knows the file references might be unreliable. It can then search for the current file location.

### What Gets Flagged

Only file-like paths containing `/` and a file extension — not generic words or URLs. The check uses `fs.existsSync` with a try/catch guard, so a broken reference won't crash anything.

---

## 10. Memory Relations (related_to)

### What It Does

Link related memories together. When you recall one, you see its neighbors.

### Creating Relations

```
# Store the root decision
memory_store({
  content: "Chose PostgreSQL for document storage.",
  name: "PostgreSQL decision"
})
→ memory_id: "abc-123"

# Store the schema design, linked to the decision
memory_store({
  content: "Users table schema: id UUID PK, email UNIQUE...",
  name: "Users table schema",
  related_to: ["abc-123"]
})
→ memory_id: "def-456"

# Store migration plan, linked to schema
memory_store({
  content: "Migration v3: add users table, create indexes...",
  name: "Migration v3 - users table",
  related_to: ["def-456", "abc-123"]
})
```

### Recalling with Relations

```
memory_recall({ memory_id: "def-456" })
```

Response includes:
```json
{
  "memory_id": "def-456",
  "name": "Users table schema",
  "related_to": ["abc-123"],
  "related_memories": [
    { "id": "abc-12", "name": "PostgreSQL decision" }
  ]
}
```

### Typical Use

Build a decision tree:
```
PostgreSQL decision (root)
  └── Users table schema
        ├── Migration v3
        └── API endpoints for users
  └── Index optimization
        └── Query performance benchmarks
```

### Adding Relations Later

```
memory_update({
  memory_id: "def-456",
  related_to: ["abc-123", "xyz-789"]  // replaces all existing relations
})
```

---

## 11. Stats — Memory Health Dashboard

### CLI

```bash
memory-forge stats
```

```
Total: 38  |  Accesses: 126  |  Weekly new: 5  |  Oldest: Jun 01  |  Newest: Jun 27
Categories: decision-log(12)  code-pattern(8)  user-preference(6)  session-transcript(5)  project-context(4)  general(3)
Top tags: postgresql(8)  react(6)  auth(5)  typescript(4)  redis(3)  deploy(3)  tailwind(2)
Decay: active=25  fading=8  stale=4  archived=1
Branches: main(28)  feat/auth(5)  fix/billing(3)
Relations: 8 memories linked
Top accessed: PostgreSQL schema(15)  React 19 rules(12)  Auth middleware(9)  Deploy config(7)  Redis session store(6)  API patterns(5)  Tailwind dark mode(4)  CI/CD pipeline(4)  pnpm workspace(3)  Testing conventions(3)
```

### Understanding the Numbers

| Metric | What It Tells You |
|---|---|
| `Weekly new: 5` | You've stored 5 memories this week — healthy usage |
| `active=25` | 25 memories accessed within 7 days — most are active |
| `fading=8` | 8 haven't been accessed in 1-4 weeks — still useful but fading |
| `stale=4` | 4 haven't been touched in 1-3 months — review needed |
| `archived=1` | 1 was deleted (90+ days unused) |
| `with_relations: 8` | 8 memories are part of a relationship chain |
| `Branches: feat/auth(5)` | Your auth branch has accumulated 5 memories — may want to merge back to main |

---

## 12. Pro — Cross-Device Cloud Sync

### Why Pro

Free tier stores memories locally in `~/.memory-forge/memories/`. Pro syncs them to the **Shelby blockchain** so all your devices share the same memory pool.

| Scenario | Free | Pro |
|---|---|---|
| Same computer, next day | ✅ | ✅ |
| Office computer → home laptop | ❌ | ✅ |
| Computer crashed, new machine | ❌ | ✅ |
| Share memories with teammate | Manual export | ✅ auto-sync |

### Activation

```bash
# Step 1: Get your free API key
# Visit: https://docs.shelby.xyz/sdks/typescript/acquire-api-keys

# Step 2: Activate
SHELBY_API_KEY="your-key" memory-forge pro
```

First activation creates an on-chain account and uploads all existing memories:

```
╔══════════════════════════╗
║   MemoryForge Pro Setup   ║
╚══════════════════════════╝

🔄 Initializing Shelby storage...
   ℹ️  Auto-generated Shelbynet account
   ℹ️  Address: 0xe1c4784a9ce...
   ⚠️  Fund this account with APT + ShelbyUSD:
      APT:       https://docs.shelby.xyz/apis/faucet/aptos
      ShelbyUSD: https://docs.shelby.xyz/apis/faucet/shelbyusd

📤 Uploading existing memories to Shelby...

┌──────────────────────────────────────┐
│  MemoryForge Pro is active!           │
│                                      │
│  ✅ 32 memories synced to Shelby     │
│  ✅ Auto-sync on every session       │
│  ✅ Memories survive across devices  │
└──────────────────────────────────────┘
```

### Get Faucet Tokens (Shelbynet Testnet — Free)

Visit these URLs to fund your account:
- **APT** (gas fees): https://docs.shelby.xyz/apis/faucet/aptos
- **ShelbyUSD** (storage fees): https://docs.shelby.xyz/apis/faucet/shelbyusd

Gas Station sponsors most transactions even with 0 balance. But for reliable operation, keep some tokens.

### Multi-Device Setup

**Computer A:**
```bash
SHELBY_API_KEY="your-key" memory-forge pro
```

**Computer B:**
```bash
# Set same environment variables
export SHELBY_API_KEY="your-key"
export APTOS_PRIVATE_KEY="your-private-key-from-pro.json"

npm i -g memory-forge@latest
memory-forge pro    # downloads all memories from Shelby
```

Now both computers share the same memory pool.

### Pro Status

```bash
memory-forge pro status
```

```
Pro: active ✅

  ── Account ──
  Address:            0xe1c4784a9ce...
  API key:            ✅ valid
  APT balance:        0.5000
  ShelbyUSD balance:  10.0000

  ── Storage ──
  Local memories:     38
  Shelby blobs:       45 (245.3 KB)

  ── Sync stats ──
  Total uploaded:     50
  Total downloaded:   12
  Total failed:       2
  Total conflicts:    3
  Last sync:          2026-06-27 10:00:30
  Recent syncs:
    2026-06-27 10:00  ↑5 ↓0
    2026-06-27 09:30  ↑0 ↓12
    2026-06-26 18:00  ↑3 ↓0
```

### Automatic Sync

Pro syncs happen automatically at:
- **SessionStart** — download new memories from cloud
- **SessionStop** — upload new/changed memories to cloud
- **PreCompact** — safety sync before context compaction

No manual commands needed after activation.

### Sync Conflict Resolution

If a memory was edited on two devices, the cloud version wins (timestamp comparison). Conflicts are logged:

```
[MemoryForge] Merge conflict on "React 19 rules": priority — remote won
```

---

## 13. Context Sorting — How Memories Are Ranked

When SessionStart builds the top-N context list, it uses this ranking algorithm:

### Layer 1: Category Filtering

`session-transcript` is excluded. `session-handoff` is force-included.

### Layer 2: Three Groups

```
1. HANDOFF (session-handoff)
   └── Most recent only. Displayed with full content under "📋 Last session".

2. EVERGREEN (priority=10, not handoff)
   └── Sorted by priority descending.

3. NORMAL (priority < 10)
   └── Sorted by the algorithm below.
```

### Layer 3: Normal Memory Sorting

```
Score = decay × priority × branch_boost

where:
  decay       = 0.5 ^ (days_since_access / category_half_life)
  priority    = 1-10 (user-assigned or auto-calculated)
  branch_boost= 1.5 if same branch, 1.0 otherwise
```

### Layer 4: Dedup

Any memory with >60% content overlap with an already-selected memory is skipped.

### Worked Example

Suppose these 3 normal memories have the same last-access time:

| Memory | Category | Priority | Branch | Decay | Branch Boost | Score |
|---|---|---|---|---|---|---|
| "Auth middleware fix" | decision-log | 7 | main | 0.982 | 1.5 | **10.3** ← 1st |
| "Tailwind config" | code-pattern | 8 | feat/ui | 0.966 | 1.0 | 7.7 |
| "CI pipeline" | project-context | 6 | main | 0.977 | 1.5 | **8.8** ← 2nd |

"Auth middleware fix" wins because: same branch (+50%), slow decay (decision-log), reasonable priority.

---

## 14. Storage — What Files Are Created

```
~/.memory-forge/
├── pro.json              # Pro account: address, private key, API key, sync stats
├── tombstones.json       # Deleted memory IDs (cross-device delete propagation)
└── memories/
    ├── abc123.md         # Single memory file
    ├── def456.md         # Another memory
    └── xyz789.md         # Transcript
```

### Memory File Format

```markdown
# React 19 TypeScript strict mode

> category: user-preference
> tags: ["react","typescript","strict-mode"]
> priority: 8
> created: 2026-06-27T09:30:00.000Z
> access_count: 5
> last_accessed: 2026-06-27T10:00:00.000Z
> branch: main

Always use React 19 with TypeScript strict mode and exactOptionalPropertyTypes enabled.
```

Human-readable Markdown. You can edit files directly. Changes are picked up on next load.

### Pro Profile

```json
{
  "version": 2,
  "activatedAt": "2026-06-27T09:00:00.000Z",
  "privateKey": "ed25519-priv-...",
  "address": "0xe1c4784a9ce...",
  "apiKey": "AG-...",
  "lastSync": "2026-06-27T10:00:30.697Z",
  "totalUploaded": 50,
  "totalDownloaded": 12,
  "totalFailed": 2,
  "totalConflicts": 3,
  "syncHistory": [...]
}
```

File permissions set to `0600` (owner read/write only) on Unix systems.

---

## 15. CLI Commands Reference

```bash
# Install & Setup
memory-forge setup              # One-time install: hooks + import rules

# Browse
memory-forge list               # List all memories
memory-forge list decision-log  # Filter by category
memory-forge list user-preference

# Search
memory-forge search "PostgreSQL database"
memory-forge search "JWT auth"

# Stats
memory-forge stats              # Health dashboard

# Pro
memory-forge pro                # Activate / re-sync
memory-forge pro status         # Account + storage + sync stats

# Maintenance
memory-forge capture-transcript # Manual transcript capture

# Check version
memory-forge --version          # e.g., 0.7.0

# MCP Server (Claude Code / Cursor auto-starts this)
memory-forge                    # Start MCP stdio server
```

### Environment Variables

| Variable | Purpose |
|---|---|
| `SHELBY_API_KEY` | Pro cloud sync API key |
| `APTOS_PRIVATE_KEY` | Pro account private key (optional — auto-generated if not set) |
| `MEMORYFORGE_HOME` | Override storage directory (default: `~/.memory-forge`) |

---

## 16. Troubleshooting

| Problem | Likely Cause | Fix |
|---|---|---|
| Agent doesn't seem to remember | Hooks not installed | `memory-forge setup` again |
| Agent says "no memories yet" | SessionStart hook not firing | Check `~/.claude/settings.json` has memory-forge hooks |
| Pro sync fails | API key invalid or expired | `SHELBY_API_KEY="new-key" memory-forge pro` |
| Balance shows 0 but Pro works | Gas Station sponsors fees | Normal — fund account for reliability |
| Search returns no results | Embedding model not downloaded | Wait 5min for auto-retry. Or check network to huggingface.co |
| Too many duplicate memories | autoMerge not triggered | Normal — >80% overlap required for merge |
| "Corrupted profile" error | pro.json is invalid JSON | Delete `~/.memory-forge/pro.json` and run `memory-forge pro` again |
| Transcript capture fails | No recent Claude Code session | Normal for fresh installs. Will work after next session. |
| Dist folder bloated old versions | npm cache | `npm cache clean --force && npm i -g memory-forge@latest` |
| Full reset | All data lost | `rm -rf ~/.memory-forge/` then remove hooks from settings.json |

---

## 17. Uninstall

```bash
# Remove all memory data
rm -rf ~/.memory-forge/

# Uninstall globally
npm uninstall -g memory-forge

# Remove hooks from Claude Code settings
# Edit ~/.claude/settings.json — remove "memory-forge" entries from all hook sections
# (SessionStart, Stop, PreCompact, PostToolUse)
```

---

## 18. Pro Tips

### Set environment variables permanently

Add to `~/.bashrc` or `~/.zshrc`:
```bash
export SHELBY_API_KEY="your-key"
export APTOS_PRIVATE_KEY="your-private-key"
```

### Check memory health regularly

```bash
memory-forge stats
```

Watch for:
- `archived` count increasing — memories aging out
- `stale` count > 5 — review old memories
- `weekly_new: 0` for weeks — agent not saving enough

### Use session-handoff consistently

The single most impactful habit: always let the session end normally (don't force-quit) so the PreCompact hook fires and the agent writes a handoff summary.

### Use branches to organize context

Working on a big feature? Create a branch. Memories created while on that branch get context priority. When you're done, merge the branch. Memories stay accessible but rank lower.

### Link related memories

When you make a decision that follows from a previous one, add `related_to`. Build decision trees. Future sessions can traverse the chain from root to leaves.

### Backup with export

Even with Pro sync, periodically:
```bash
# Agent: export all memories as JSON
memory_export({ format: "json" })

# Save the output to a file
```

---

**That's it. Your AI agent now has memory. It will only get smarter over time.**

---

*MemoryForge v0.7.0 · MIT License · [GitHub](https://github.com/shelby-protocol/memory-forge)*
