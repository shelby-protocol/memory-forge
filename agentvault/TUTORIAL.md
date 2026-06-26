# MemoryForge — User Guide

> v0.2.8 · One command. Zero config. Your AI agent remembers everything.

---

## What MemoryForge Does

MemoryForge gives your AI agent persistent memory. Close your terminal, switch computers, force-quit — your agent remembers your preferences, decisions, and conversation context.

| Capability | How |
|---|---|
| Remember preferences | Agent stores coding style, project conventions via `memory_store` |
| Resume sessions | SessionStart auto-loads top-5 memories into context |
| Cross-device sync | Pro tier syncs memories via Shelby blockchain |
| Never lose context | PreCompact + Stop hooks auto-capture transcripts |
| Self-cleaning | autoPriority scoring + autoDecay archiving on session end |

---

## Installation

```bash
npx memory-forge setup
```

This one command:
- Installs 3 Claude Code hooks (SessionStart / Stop / PreCompact)
- Imports existing rules as memories (CLAUDE.md, .cursor/rules, .gitconfig)
- Downloads embedding model (23MB, one-time, offline thereafter)
- Globally installs the `memory-forge` command

**Supported:** Claude Code (all platforms), Cursor, Windsurf, VS Code.

---

## How Memory Works — The Lifecycle

### 1. Session Start (automatic)

```
You open Claude Code
  → SessionStart hook runs
  → Top-5 most relevant memories loaded
  → Agent already knows your preferences
```

### 2. During the Session

**Agent handles everything.** You talk normally. The agent calls tools as needed:

| What You Say | What Agent Does |
|---|---|
| "I prefer camelCase, single quotes" | `memory_store` → preference saved |
| "How did we fix that auth bug?" | `memory_search` → finds past solution |
| "What were we working on?" | `memory_context` → loads session context |
| "Export all my memories" | `memory_export` → JSON or Markdown |
| "Share this with the team" | `memory_share` → portable package |

### 3. PreCompact (automatic)

```
Context window nearly full
  → PreCompact hook runs
  → Agent sees: "Save key learnings with memory_store!"
  → Agent auto-saves decisions, preferences, learnings
  → Transcript captured as safety backup
```

This fires even if you force-close the terminal.

### 4. Session End (automatic)

```
You close Claude Code
  → Stop hook runs
  → autoPriority: frequent/recent memories score higher
  → autoDecay: 90-day inactive memories archived
  → Final transcript captured to disk
```

### 5. Next Session

```
You open Claude Code again
  → Memories loaded from disk
  → Agent resumes with full context
  → If Pro enabled: syncs with Shelby (cross-device)
```

---

## Pro — Cross-Device Cloud Sync

### Activation

```bash
# One-time setup
export SHELBY_API_KEY="your-api-key"
memory-forge pro
```

This creates an on-chain account and uploads your memories to Shelby. Works on Shelbynet testnet (free).

### Multi-Device Setup

**Computer A:**
```bash
export SHELBY_API_KEY="your-key"
export APTOS_PRIVATE_KEY="your-private-key"
memory-forge pro    # activates + uploads
```

**Computer B:**
```bash
# Same environment variables
export SHELBY_API_KEY="your-key"
export APTOS_PRIVATE_KEY="your-private-key"
npm i -g memory-forge@latest
memory-forge pro    # downloads memories from Shelby
```

Now both computers share the same memory pool. Work on A, continue on B — agent remembers everything.

### Pro Tips

Add to `~/.bashrc` or `~/.zshrc`:
```bash
export SHELBY_API_KEY="your-key"
export APTOS_PRIVATE_KEY="your-private-key"
```

Pro sync runs automatically on every session start.

---

## Commands Reference

```bash
memory-forge setup              # Install hooks + import rules
memory-forge hook session-start # Load context (auto on session start)
memory-forge hook pre-compact   # Context summary + save prompt (auto)
memory-forge hook stop          # Priority update + decay + transcript
memory-forge pro                # Activate Pro / sync Shelby cloud
memory-forge capture-transcript # Manual transcript capture
memory-forge                    # Start MCP server (Claude Code manages this)
```

### With API Key

```bash
SHELBY_API_KEY="key" memory-forge pro
APTOS_PRIVATE_KEY="key" memory-forge pro
```

---

## 8 MCP Tools (Agent Calls These)

| Tool | Purpose | Example Trigger |
|---|---|---|
| `memory_store` | Save a memory | "Remember: we use pnpm, not npm" |
| `memory_search` | Semantic search | "How did we fix the auth bug?" |
| `memory_recall` | Get by ID | "Show me memory abc123" |
| `memory_list` | Browse all | "List my memories" |
| `memory_forget` | Delete | "Forget that old memory" |
| `memory_context` | Load top-N | "What were we working on?" |
| `memory_export` | Export as JSON/MD | "Export all memories" |
| `memory_share` | Package for sharing | "Share this with Alice" |

---

## 5 Auto-Engines (You Never See)

| Engine | Trigger | Effect |
|---|---|---|
| autoName | Every save | Extracts name from content |
| autoMerge | Every save | Merges >80% similar memories |
| autoPriority | Session end | Scores 1-10 from usage patterns |
| autoDecay | Session end | Archives memories unused 90+ days |
| contextSummary | Session start + PreCompact | Generates agent context injection |

---

## What Gets Saved Automatically

| Data | Trigger | Format |
|---|---|---|
| User preferences & decisions | Agent calls `memory_store` | Single memory, ~100-500 chars |
| Conversation transcript | Stop hook (every session end) | Full dialogue, ~30KB, capped at 100KB |
| Conversation transcript | PreCompact hook (safety net) | Same format, 30min dedup |
| Rule imports | `setup` (one-time) | CLAUDE.md, .gitconfig, etc. |

Only 1 transcript per session (newer replaces older). Transcript priority is 7 (lower than user memories at 8-10).

---

## Storage

```
~/.memory-forge/
├── pro.json          # Pro account (private key)
└── memories/
    ├── abc123.md     # "User prefers camelCase"
    ├── def456.md     # "Project uses PostgreSQL + Prisma"
    └── xyz789.md     # "Session 2026-06-26 14:30" (transcript)
```

Human-readable Markdown. You can edit, backup, or delete files directly.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Hooks not working | `memory-forge setup` reinstall |
| Stop hook error | `npm i -g memory-forge@latest` |
| Search inaccurate | Wait 5min for model auto-retry |
| Pro sync fails | Check network, `export SHELBY_API_KEY` |
| Duplicate memories | `memory-forge setup` re-run (0.2.7+ auto-dedup) |
| 27 files, too many | Upgrade to 0.2.7+, old dupes auto-cleaned |
| Full reset | `rm -rf ~/.memory-forge/` then remove hooks from settings.json |

---

## Uninstall

```bash
rm -rf ~/.memory-forge/
npm uninstall -g memory-forge
# Edit ~/.claude/settings.json — remove "memory-forge" hook entries
```
