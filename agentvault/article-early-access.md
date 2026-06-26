# MemoryForge Early Access — Help Us Build AI That Remembers

**Your AI agent has amnesia. We fixed it. Now we need you to prove it works.**

---

## The Problem

Close Claude Code. Your agent forgets everything. Your coding preferences. Your project architecture. The 20-minute debugging session you just finished. Gone.

Every MCP memory tool on the market stores data in local SQLite files. That works until you switch computers, reformat your drive, or force-quit the terminal.

**66% of developers** report "almost right, but not quite" outputs from their AI agents. The root cause is missing context.

---

## What MemoryForge Does

MemoryForge is an **MCP-native persistent memory engine** for AI agents. One command installs it. After that, you do nothing — your agent remembers automatically.

### It Works Today (52 tests, 19 releases)

| Capability | Status |
|---|---|
| 8 MCP tools (store/search/recall/list/forget/context/export/share) | ✅ Production |
| 5 auto-engines (name/merge/priority/decay/context) | ✅ Production |
| Session auto-context (agent loads memories on start) | ✅ Production |
| PreCompact auto-capture (saves context before compression) | ✅ Production |
| Conversation transcript capture (full dialogue saved) | ✅ Production |
| Cross-device Pro sync (Shelby decentralized storage) | ✅ Testnet verified |
| Self-cleaning (auto-priority scoring + 90-day decay archiving) | ✅ Production |
| Stress tested (5000 memories, 150KB content, 200 rapid ops) | ✅ Production |

### It's Free

Free tier: 8 tools, unlimited memories, local storage, zero network requests. Pro tier: Shelby cloud sync (testnet, free during testing).

---

## What We're Looking For

We need **10-20 early adopters** who use Claude Code or Cursor daily and are willing to:

1. Install it (`npx memory-forge setup` — 30 seconds)
2. Use it for a week of real work
3. Tell us what breaks, what's missing, what you wish it did

That's it. No paperwork. No commitment.

### Ideal Tester Profile

- You use Claude Code or Cursor for actual development work
- You switch between projects and want context to carry over
- You've tried other memory tools and found them lacking
- You have opinions about how AI should remember things

Bonus points if you work across multiple computers.

---

## What You Get

- **First access** to Pro cross-device sync before public launch
- **Direct line** to the developer — your feedback shapes the roadmap
- **Free Pro** during the entire testing period
- **Your name** in the contributors list (if you want it)

---

## Install

```bash
npx memory-forge setup
```

30 seconds. Your agent has memory.

```bash
# Pro (cross-device sync) — testing keys available on request
export SHELBY_API_KEY="request-key"
export APTOS_PRIVATE_KEY="request-key"  
memory-forge pro
```

---

## What We Know Is Missing

Honesty: here's what's NOT built yet and on the roadmap:

- Web dashboard (currently CLI + agent only)
- MCP directory listing (waiting for mainnet)
- Paid Pro tiers (testnet only, SettleGrid payment not integrated)
- Multi-language embedding models (English only for now)

If any of these are dealbreakers, tell us — it changes our priorities.

---

## How to Give Feedback

- **GitHub Issues**: https://github.com/shelby-protocol/memory-forge/issues
- **Direct**: Comment on this post
- **Brutal honesty preferred**: "Search is slow for X" beats "Great job!"

We ship fast. Bugs reported this week get fixed this week. The 19-release changelog proves it.

---

## Links

- **npm**: https://www.npmjs.com/package/memory-forge
- **GitHub**: https://github.com/shelby-protocol/memory-forge
- **Full docs**: [TECHNICAL.md](https://github.com/shelby-protocol/memory-forge/blob/main/agentvault/TECHNICAL.md) | [TUTORIAL.md](https://github.com/shelby-protocol/memory-forge/blob/main/agentvault/TUTORIAL.md)

---

**Your agent should remember you. Help us make that happen.**
