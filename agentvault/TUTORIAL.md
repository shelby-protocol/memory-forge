# MemoryForge — Tutorial

> One command. Zero config. Your AI agent now has persistent memory.

## Table of Contents

1. [Quick Start](#quick-start)
2. [How It Works](#how-it-works)
3. [Daily Use](#daily-use)
4. [Pro Tier (Cloud Sync)](#pro-tier-cloud-sync)
5. [Managing Memories](#managing-memories)
6. [Best Practices](#best-practices)
7. [Troubleshooting](#troubleshooting)
8. [Uninstall](#uninstall)

---

## Quick Start

### Install

```bash
npx memory-forge setup
```

This single command:
- Installs Claude Code hooks (SessionStart / Stop / PreCompact)
- Auto-imports existing rules (CLAUDE.md / .cursor/rules / .gitconfig)
- Preloads the embedding model (23MB, one-time, offline thereafter)
- Globally installs the `memory-forge` command

**Supported platforms:** Claude Code (all platforms), Cursor (via MCP), Windsurf, VS Code.

### Verify

Restart Claude Code. You should see:

```
- [Git User Info] Git user email: xxx
- [Claude Code Rules] For independent parallel tasks...
```

This means the SessionStart hook is active and the agent has loaded your memories.

---

## How It Works

### Automated Memory Lifecycle

```
You open Claude Code
  → Agent auto-loads your preferences and project context

You work...
  → Agent automatically remembers your coding style, technical decisions, project preferences

Context window nearly full (PreCompact)
  → Agent auto-saves critical information to the memory store
  → Even if you force-close the terminal, memories survive

You close Claude Code (Stop)
  → Auto-update memory priorities (frequently-used memories get higher weight)
  → Auto-archive memories unused for 90+ days

Next session
  → Agent remembers everything ✅
```

### You Do Nothing

The agent automatically:
- **Stores**: you mention preferences, decisions, lessons → agent calls `memory_store`
- **Searches**: needs to recall something → agent calls `memory_search`
- **Maintains**: priority adjustment, expiry cleanup → fully automatic

---

## Daily Use

### Basic Interaction

```
You: "I prefer camelCase naming, single quotes, 2-space indent"

Agent auto-calls memory_store → memory saved ✅
Next time you write code, the agent follows your preferences automatically.

---

You: "How did we fix that token refresh bug?"

Agent calls memory_search → finds relevant memory
"On June 15, you fixed auth.ts — the token expiry check was using < instead of <="

---

You: "Help me refactor the auth module"

Agent calls memory_context → loads context
"Got it. Based on prior records, this project uses React 19 + JWT + refresh token pattern. Start from auth.ts?"
```

### Explicit Commands

You can also tell the agent explicitly:

```
"Store a memory: production database uses PostgreSQL 16, connection string in .env.production"
"Search for memories about deployment"
"List all my memories"
"Export all memories as Markdown"
"Forget the memory with ID xxx"
```

---

## Pro Tier (Cloud Sync)

### When You Need Pro

- You use multiple computers and want cross-device memory sync
- You're worried about disk failure losing your memories
- You want shared project memories with teammates

### Activating Pro

```bash
# 1. Get an API Key
# Visit https://docs.shelby.xyz/sdks/typescript/acquire-api-keys

# 2. Activate Pro
SHELBY_API_KEY="your-api-key" memory-forge pro

# 3. First time: fund your account with APT + ShelbyUSD (testnet faucet)
# The address will be printed. Go to the faucet:
#   APT:       https://docs.shelby.xyz/apis/faucet/aptos
#   ShelbyUSD: https://docs.shelby.xyz/apis/faucet/shelbyusd

# 4. After claiming tokens, sync again
SHELBY_API_KEY="your-api-key" memory-forge pro
```

### Cross-Device Sync

```
Device A: Activate Pro → work → memories auto-upload
Device B: Set SHELBY_API_KEY env var → install → memories auto-download
  → Agent on device B remembers everything ✅
```

### Environment Variable

Add to your shell config for permanent setup:

```bash
# ~/.bashrc or ~/.zshrc
export SHELBY_API_KEY="your-api-key"
```

The agent will auto-sync on every session start.

---

## Managing Memories

### Viewing Memories

```bash
# List memory files
ls ~/.memory-forge/memories/

# Read a specific memory
cat ~/.memory-forge/memories/{id}.md
```

Memory files are human-readable Markdown. You can edit them directly.

### Exporting

```
# Via agent
"Export all memories as JSON"
"Export auth-related memories as Markdown"
```

### Backup

```bash
# Local backup (Free tier)
cp -r ~/.memory-forge/memories/ ~/backup/

# Pro tier auto-backs up to Shelby cloud
```

### Cleanup

```bash
# Delete all local memories
rm -rf ~/.memory-forge/memories/*.md

# Delete a single memory
rm ~/.memory-forge/memories/{id}.md

# Reset Pro account
rm ~/.memory-forge/pro.json
```

---

## Best Practices

### What's Worth Remembering

| Worth It | Not Worth It |
|----------|--------------|
| Coding style preferences | One-off debug sessions |
| Project architecture decisions | Temporary experimental code |
| Team conventions | Outdated configuration |
| Frequently-used commands and workflows | Pure factual knowledge |
| Lessons learned and solutions found | One-time tasks |

### Memory Quality

```
✅ Good: "Project uses PostgreSQL 16 + Prisma ORM, connection pool limit 20"
❌ Bad:  "database is pg"

✅ Good: "User prefers camelCase, single quotes, 2-space indent, React 19 + TypeScript strict"
❌ Bad:  "uses camelCase"

✅ Good: "6/26 — decided to cache tokens in Redis because DB queries were >500ms"
❌ Bad:  "added Redis"
```

### Periodic Maintenance

Do a memory cleanup once a month:

```
"Review all my memories and flag anything outdated or no longer needed"
"Forget memories related to projects I no longer work on"
```

---

## Troubleshooting

### Hooks Not Working

**Symptom:** Opening Claude Code shows no memory loading.

```bash
# 1. Check hook configuration
memory-forge hook session-start

# 2. Reinstall hooks
memory-forge setup

# 3. Verify settings.json
cat ~/.claude/settings.json | grep memory-forge

# 4. Restart Claude Code
```

### Stop Hook Error

**Symptom:** "Stop hook error" on session close.

```bash
# Confirm global install
npm ls -g memory-forge

# If not latest
npm i -g memory-forge@latest

# Check hook command format
# settings.json should have "memory-forge hook stop", not "npx memory-forge hook stop"
```

### Inaccurate Search Results

**Symptom:** `memory_search` returns irrelevant results.

```bash
# Check if embedding model downloaded successfully
# If you see "[MemoryForge] Falling back to keyword matching"
# → Model download failed; keyword mode is active

# Solution: wait 5 minutes for auto-retry, or trigger a retry manually
# Model size is 23MB — ensure network is working
```

### Pro Sync Fails

**Symptom:** "Shelby upload failed: INSUFFICIENT_BALANCE_FOR_TRANSACTION_FEE"

```bash
# Check account balance
# Visit the faucet to claim APT + ShelbyUSD
# Then re-run pro

SHELBY_API_KEY="your-key" memory-forge pro
```

### Duplicate Memories

**Symptom:** `memory_list` shows repeated similar memories.

```bash
# 0.1.6+ has a root-cause fix. If you still see duplicates:
# 1. Upgrade to latest
npm i -g memory-forge@latest
memory-forge setup

# 2. Manual cleanup
# Delete duplicate .md files in ~/.memory-forge/memories/
```

### Full Reset

```bash
# 1. Delete memories
rm -rf ~/.memory-forge/memories/*.md

# 2. Delete Pro account (optional)
rm -f ~/.memory-forge/pro.json

# 3. Clear hooks
# Edit ~/.claude/settings.json, remove all entries containing "memory-forge"

# 4. Reinstall
memory-forge setup
```

---

## Uninstall

```bash
# Remove all local data
rm -rf ~/.memory-forge/

# Edit ~/.claude/settings.json
# Remove all hook entries containing "memory-forge"

# Uninstall global command
npm uninstall -g memory-forge
```
