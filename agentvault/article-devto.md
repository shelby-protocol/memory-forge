# Your AI Agent Has Amnesia. Here's How to Fix It.

**Every time you close Claude Code or Cursor, your AI agent forgets everything.**

You told it you prefer React 19 with TypeScript. You taught it your project's auth flow. You spent 20 minutes debugging a config issue together. Close the terminal — gone.

66% of developers report "almost right, but not quite" outputs from their AI agents. The root cause? Missing context. Every session starts from zero.

## The Memory Market Is Exploding

AI memory is being validated by top-tier VCs:

- **Engram** raised **$98M** (Sequoia, Kleiner Perkins, June 2026)
- **Mem0** raised **$24M** (Basis Set, Peak XV, YC)
- **Weaviate** just launched **Engram GA** as managed memory infrastructure

There are over **25 MCP memory servers** on the market today — MemPalace, Nexus, Mind Keg, Waggle, Enfram, ShelbyMCP, Memoir, Deep Recall, Apex Memory... all of them store your memories in **local SQLite files**.

## The Problem With Local Storage

```
✅ Fast
✅ Offline
❌ Switch computers → gone
❌ Format your drive → gone
❌ No audit trail
❌ Can't share with teammates
❌ Can't prove the memory is real
```

## Introducing MemoryForge

MemoryForge is an MCP memory server that stores your AI agent's memories on **Shelby Protocol** — a decentralized hot storage network built by Aptos Labs and Jump Crypto.

```bash
# Free: local storage, one command
npx memory-forge setup

# Pro: Shelby cloud storage, works across devices
SHELBY_API_KEY="your-key" npx memory-forge pro
```

**Three things make it different:**

### 1. Decentralized hot storage (not local SQLite)
Your memories live on Shelby — a global network with sub-second reads, 70% cheaper than AWS S3. Switch computers, format your drive, your memories survive.

### 2. Verifiable memory (Aptos blockchain)
Every memory write generates an on-chain transaction hash. You can prove the memory existed at that exact moment. No other MCP memory tool does this.

### 3. Zero-config setup
One command. MemoryForge auto-detects Claude Code, Cursor, Windsurf, and VS Code. Auto-imports your existing CLAUDE.md and .cursor/rules. Installs hooks automatically. You don't need to know what Shelby, Aptos, or gas fees are.

## What It Feels Like

```
Day 1:  npx memory-forge setup → done
Day 7:  Switch computers. Open Claude Code.
        → Agent remembers React 19, camelCase, your auth flow.
        → Nothing to configure. Nothing to explain.
Day 30: Old memories auto-archive. New ones auto-reinforce.
```

## Built and Battle-Tested

MemoryForge is open source (MIT) and actively maintained. Current state:

- **10 MCP tools**: store, search, recall, list, forget, context, export, share, update, model_info
- **5 auto-engines**: naming, dedup merge, priority scoring, decay archiving, context summary
- **319 tests**, 3-platform CI (macOS/Windows/Ubuntu), npm provenance signed
- **LongMemEval Recall@5: 95.6%** — ranked #2 of 25+ MCP memory tools
- **npm v0.10.x**, 7,000+ weekly downloads

The stack is intentionally minimal — Transformers.js embeddings in-process (23MB model), local markdown storage for free tier, Shelby decentralized cloud for Pro. Zero external SaaS dependencies. Everything runs on your machine.

## The Hardest Part Wasn't the Code

It was avoiding feature creep. I started with 20 tools, 15 competitive advantages, and 6 revenue engines. I cut to what matters — one install command, two tiers, and automated everything.

The best product is the one nobody has to think about.

## I Need Your Help

MemoryForge is real — MCP server running, Shelby cloud verified, all tests passing. But before I invest more time:

**Would you use this?**

- If yes: what's missing?
- If no: what would make you say yes?
- If you've tried other MCP memory tools: what broke?

Drop a comment. I'll build whatever you need by next week.

---

*Try it: `npx memory-forge setup` (on npm as `memory-forge`)*

*[GitHub: github.com/shelby-protocol/memory-forge](https://github.com/shelby-protocol/memory-forge)*
