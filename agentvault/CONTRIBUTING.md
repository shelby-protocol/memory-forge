# Contributing to MemoryForge

Thanks for helping build the first decentralized MCP memory engine.

## Quick Start

```bash
git clone https://github.com/shelby-protocol/memory-forge.git
cd memory-forge/agentvault
npm install
npm test          # 319 tests, all should pass
npx tsc --noEmit  # type check
```

## Project Structure

```
agentvault/
├── src/
│   ├── index.ts          # Entry point + CLI dispatch
│   ├── store.ts          # MemoryStore (LRU cache, search, stats)
│   ├── embedding.ts      # Transformers.js pipeline + config
│   ├── setup.ts          # One-click setup command
│   ├── pro.ts            # Shelby Pro cloud sync
│   ├── transcript.ts     # Session transcript capture
│   ├── storage/
│   │   ├── local.ts      # Local markdown file persistence
│   │   └── shelby.ts     # Shelby cloud blob storage
│   ├── tools/            # 10 MCP tool handlers
│   ├── auto/             # 5 auto-engines (name, merge, priority, decay, context)
│   ├── search/           # BM25 + query expansion
│   ├── hooks/            # Claude Code hook installation
│   ├── migrate/          # Rule import (CLAUDE.md → memories)
│   └── lib/              # Shared utilities (timezone, etc.)
├── tests/                # 31 test files, vitest
├── bench/                # LongMemEval benchmark
└── versions/             # Historical design docs
```

## Development Workflow

1. **Create a branch** — `git checkout -b feat/your-feature`
2. **Write tests first** — TDD: red → green → refactor
3. **Run the full suite** — `npm test`
4. **Check types** — `npx tsc --noEmit`
5. **Commit with conventional format** — `feat:`, `fix:`, `test:`, `docs:`, `chore:`

## PR Checklist

- [ ] Tests pass (`npm test`)
- [ ] Types check (`npx tsc --noEmit`)
- [ ] No new console.log in production code
- [ ] No hardcoded secrets or credentials
- [ ] Commit messages follow conventional format

## Running Locally

```bash
# CLI mode
npx tsx src/index.ts list
npx tsx src/index.ts stats
npx tsx src/index.ts search "react"

# Link globally for testing
npm link
memory-forge list
```

## Pro (Shelby) Testing

```bash
npm install @shelby-protocol/sdk @aptos-labs/ts-sdk
SHELBY_API_KEY=your-key npx tsx src/index.ts pro status
```

## Release Process

1. Bump version: `npm version patch`
2. Push tag: `git push --tags`
3. CI auto-publishes to npm with provenance
4. Create GitHub Release with release notes

## Questions?

Open an issue or discussion on GitHub.
