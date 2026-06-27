# Changelog

## v0.8.0 (2026-06-27)

### Features
- **vitest migration**: 14 test files, 197 tests, coverage thresholds (40%+)
- **CI matrix**: ubuntu/windows/macos + Node 18/20/22
- **tsconfig.build.json**: separated build config from test config
- **BM25 hybrid search**: `src/search/bm25.ts` (pure TS, zero deps) + hybrid scoring (α=0.7 vector, 0.3 BM25)
- **Query expansion**: `src/search/expand.ts` — static synonym map for broader recall
- **`memory_search` tool**: new `search_method` (hybrid/vector/bm25) and `alpha` parameters
- **Auto-tag engine**: `src/auto/tagger.ts` — rule-driven tag suggestion + category inference (20 tag patterns, 4 category heuristics)
- **`memory_store` / `memory_update`**: new `auto_tag` parameter (default: true), returns `suggested_tags` and `inferred_category`

### Removed
- 7 old `tsx` test files removed from `src/`

---

## v0.5.2 (2026-06-27)

### Bug Fixes
- **autoName**: return `"memory"` for code-block-only content (was returning `"."`)
- **keywordSearch**: substring fallback now works for CJK/non-Latin scripts (fixes Chinese, Japanese, Korean search returning no results)
- **getBalances**: use indexer GraphQL for FA balances on shelbynet (fixes APT/ShelbyUSD always showing 0.0000)
- **ShelbyUSD decimals**: corrected from 6 to 8 (matches on-chain FA metadata on shelbynet)

### Performance
- **LRU eviction**: O(n log n) → O(n) single-entry scan

### Internals
- **192 tests** (up from 72): 7 suites covering store, auto, shelby, setup, import, embed, transcript
- **CI/CD**: GitHub Actions with Node 18/20/22 matrix
- **Docs**: all references synced (8→9 tools, 52→76 tests, version 0.5.2)

---

## v0.4.2 (2026-06-26)

### Bug Fixes
- Vector cleanup: stale vector cache entries removed on memory delete
- Tombstone dedup: cloud tombstone IDs deduplicated before deletion
- Sync cooldown: 30s cooldown prevents double-sync from PreCompact + Stop back-to-back
- Grapheme count: `safeTruncate` uses `Intl.Segmenter` for Unicode-safe truncation
- Migrate path: import path resolution fixed for Windows

---

## v0.4.1 (2026-06-26)

### Bug Fixes
- Tag JSON serialization: special characters in tags preserved correctly
- Cloud blob cleanup: tombstoned blobs properly removed from cloud
- Duplicate comment: removed redundant debug output

---

## v0.4.0 (2026-06-26)

### Features
- `memory_update`: partial update by ID (content, category, tags, priority, name)
- `memory_share`: package single memory for teammate import
- `memory_export`: export as JSON or Markdown

---

## v0.3.0 (2026-06-26)

### Features
- Pro tier: Shelby decentralized cloud sync with bidirectional merge
- Cross-device deletion via cloud tombstones
- Transcript auto-capture on session end
- PreCompact hook: preserve top-8 memories before context compaction
- SessionStart hook: inject top-5 context summary into agent

---

## v0.2.0 (2026-06-25)

### Features
- 8 MCP tools: memory_store, memory_search, memory_recall, memory_list, memory_forget, memory_context, memory_export, memory_share
- 5 auto-engines: autoName, autoMerge, autoPriority, autoDecay, generateContextSummary
- Transformers.js / MiniLM-L6-v2 embedding (23MB, local)
- Local Markdown storage with YAML frontmatter
- LRU cache (5,000 entry cap)
- Dedup via Jaccard similarity (char 3-gram, threshold 0.8)
- Claude Code hook integration

---

## v0.1.0 (2026-06-25)

### Initial Release
- MCP Server with stdio transport
- MemoryStore with keyword search
- Local file storage
