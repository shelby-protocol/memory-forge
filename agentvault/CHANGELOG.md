# Changelog

## v0.13.7 (2026-06-30)

### Fixes — Exit Status Visibility (for real this time)
- **Last exit status**: Stop hook now persists exit status to `~/.memory-forge/last-exit.json` (maintenance count, transcript status, sync result)
- **SessionStart displays previous exit**: SessionStart hook reads `last-exit.json` and surfaces the previous session's exit status in the system message (e.g. "Last exit (13m ago): 111 maintained, 4 saved, synced ✓")
- **MCP graceful shutdown**: SIGTERM/SIGINT handler also saves exit status for consistency
- **Root cause**: v0.13.6 correctly reformatted Stop hook output as `systemMessage` JSON, but Stop hook messages flash too briefly at session end for users to read. The fix persists the status so it's visible in the *next* SessionStart hook.

## v0.13.6 (2026-06-30)

### Fixes — Stop Hook Visibility
- **Stop hook output**: Messages now use `console.log` with `systemMessage` JSON field instead of `console.error`, making them visible to the user on exit (stderr was captured for debug logs only)

## v0.13.5 (2026-06-30)

### Fixes — Stop Hook Output Noise
- **Download error suppression**: 404 errors during sync download phase are now silently skipped (blob not existing in cloud is expected during bidirectional sync), eliminating 60+ lines of noise in Stop hook output
- **Download summary**: Sync summary now includes skipped download count (⊘) for full visibility

## v0.13.4 (2026-06-30)

### Fixes — Exit Safety & Upload Observability
- **Stop hook timeout**: Increased from 60s to 180s to accommodate slow sync operations
- **Graceful shutdown message**: MCP server SIGTERM/SIGINT path now prints "Safe to close" confirmation
- **Upload error logging**: Replaced single-shot `uploadWarned` flag with per-failure diagnostics (first 3 errors logged with memory ID + error message, then summary suppression)
- **Rate limit handling**: Explicit 429 detection with deferred-upload message instead of generic failure
- **Retry queue integration**: Failed uploads in main sync loop now enqueued to `SyncQueue` for automatic retry, preventing permanent failures due to transient network issues

## v0.13.3 (2026-06-30)

### Fixes — Pro Sync Reliability (28 issues)
- **Hook execution**: Remove Stop hook output redirect black hole, add timeout to all hooks
- **Cross-process cooldown**: Replace in-memory cooldown with file-based persistence (fixes PreCompact/Stop race)
- **Graceful shutdown**: SIGTERM/SIGINT handlers sync before exit (10s timeout)
- **VSCode fallback**: PostToolUse hook triggers sync as Stop hook substitute for VSCode/subagent sessions
- **Mid-session pull**: 5-minute periodic cloud sync keeps long sessions up-to-date
- **Retry queue**: Failed uploads and tombstones enqueued to `~/.memory-forge/sync-queue.json` for retry
- **Conflict visibility**: Merge conflicts persisted to `~/.memory-forge/conflicts.json` (50-record cap)
- **Profile validation**: Corrupted `pro.json` detected on startup with repair instructions
- **Key backup warning**: Prominent warning when new private key is generated
- **Sync checkpoint**: Atomic checkpoint saved before sync for crash recovery
- **Hybrid Logical Clock**: Monotonic timestamps across processes (replaces bare `Date.now()`)
- **Balance monitoring**: 30-minute periodic APT/ShelbyUSD balance check with low-balance warnings
- **Orphan cleanup**: Stale lock files from crashed processes cleaned on startup

### Added
- `memory_health` MCP tool — Pro sync health, queue depth, profile validity, balances
- `src/clock.ts` — Hybrid Logical Clock with file persistence
- `src/sync-queue.ts` — File-backed retry queue (48h TTL, 1000-entry cap)
- `src/tools/health.ts` — Health check MCP tool

### Changed
- `memory_store`, `memory_update`, `memory_forget` — Failed cloud ops enqueue for retry instead of fire-and-forget
- Stop hook output now visible in Claude Code UI (was redirected to `hook.log`)
- PreCompact sync errors now logged (was silently swallowed)

## v0.12.0 (2026-06-29)

### Features
- **Project isolation**: physical directory separation (`projects/{hash}/memories/` + `global/memories/`) for hard per-project memory isolation
- **Agent-driven project detection**: `project` parameter on `memory_store`/`memory_search`/`memory_list`/`memory_export`/`memory_context` — Agent declares the project, server auto-detects as fallback
- **11-layer fallback chain**: Claude Code (`CLAUDE_PROJECT_DIR`), Codex (`CODEX_WORKSPACE_ROOT`), Cursor (`WORKSPACE_FOLDER_PATHS`), Windsurf (`PWD`), VS Code (`VSCODE_CWD`), git remote, git root, cwd, `.project-id` marker file, plus user overrides (`MF_PROJECT`/`MF_PROJECT_HASH`)
- **ScopedMemoryStore**: decorator pattern wrapping `MemoryStore` with automatic project scope injection — all operations default to current project + global fallback
- **Mem0-style dual retrieval**: `memory_search` searches current project → falls back to global memories → hints about other-project matches
- **Quality floor**: `memory_store` rejects content shorter than 10 words (prevents low-signal noise)
- **`hasLegacyMemories()`**: auto-detects old flat-directory memories and prints migration hint
- **Global memories**: cross-project preferences survive project isolation, injected when project-specific memories are insufficient

### Changed
- **Memory interface**: added `project_id`, `project_name`, `scope`, `user_id` (reserved), `team_id` (reserved), `org_id` (reserved) fields
- **`generateContextSummary`**: accepts `projectHash`/`projectName` params; filters context to current project only
- **Shelby cloud storage**: blob namespace now `projects/{hash}/memories/` and `global/memories/` (old paths continue to work)
- **`syncAll`**: accepts optional `projectHash` for scoped sync
- **Tools**: `memory_store`, `memory_search`, `memory_list`, `memory_context`, `memory_export` accept `project` param (default: `"current"`)
- **Results**: all tool responses now include `project` and `scope` fields

### Added
- `src/project.ts` — project identity engine with `normalizeGitUrl`, `resolveProject`, `getGlobalModeHint`
- `src/scoped-store.ts` — `ScopedMemoryStore` decorator
- `tests/project.test.ts` — 12 tests for URL normalization + project detection
- `tests/scoped-store.test.ts` — 8 tests for scope filtering + delegation
- `makeToolOpts()` test helper for project-aware tool options

### Backward Compatible
- Old memories (no `project_id`) remain in legacy `~/.memory-forge/memories/` directory, treated as global
- All new MCP tool parameters are `.optional()` — existing calls continue to work
- `project` parameter auto-detected when not provided by the Agent

---

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
