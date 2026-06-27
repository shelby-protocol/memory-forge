#!/usr/bin/env node
/**
 * MemoryForge — AI Agent 持久记忆引擎 (MVP)
 *
 * 9 MCP tools + 5 auto-engines + Pro Shelby cloud sync.
 * Embedding: Transformers.js (23MB, in-process).
 * Storage: Free = local Markdown; Pro = Shelby cloud.
 *
 * Quick start:
 *   npx memory-forge setup
 */

import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { MemoryStore, safeTruncate } from "./store.js";
import { embed, preload } from "./embedding.js";
import { saveMemory, loadAllMemories, deleteMemoryFile, cleanupTombstones } from "./storage/local.js";
import { uploadMemory, deleteBlob, getBlobName, getShelbyConfig } from "./storage/shelby.js";
import { autoName, autoMerge, autoPriority, autoDecay, generateContextSummary } from "./auto/index.js";
import { setup } from "./setup.js";
import { pro, syncAll, proStatus, proAutoActivate } from "./pro.js";
import { cliCaptureTranscript, captureTranscript } from "./transcript.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8")) as { version: string };

import * as fs from "node:fs";

/** Read stdin synchronously if piped (Claude Code hook), null if TTY (direct CLI). */
function readStdinSync(): string | null {
  try {
    if (process.stdin.isTTY) return null;
    return fs.readFileSync(0, "utf-8").trim() || null;
  } catch {
    return null;
  }
}

// ─── CLI 命令路由 ──────────────────────────────────────────
const cmd = process.argv[2];

if (cmd === "--version" || cmd === "-v") {
  console.log(pkg.version);
  process.exit(0);
} else if (cmd === "setup") {
  setup()
    .then(() => process.exit(0))
    .catch((err) => { console.error(err); process.exit(1); });
  // Don't start MCP server — rely on setup's process.exit
} else if (cmd === "pro") {
  const sub = process.argv[3];
  if (sub === "status") {
    (async () => {
      const { getBalances, getStorageUsage, initShelby, getShelbyConfig } = await import("./storage/shelby.js");
      const s = proStatus();
      if (!s.active) {
        console.log("Pro: not active");
        console.log("  Set SHELBY_API_KEY and restart your session to auto-activate.");
        console.log("  Or run: SHELBY_API_KEY=\"...\" memory-forge pro");
      } else {
        const cfg = getShelbyConfig();
        let balances = null;
        let storage = null;
        if (cfg.apiKey && cfg.accountAddress) {
          const { readFileSync } = await import("node:fs");
          const { join } = await import("node:path");
          const { homedir } = await import("node:os");
          let profile: any = null;
          try { profile = JSON.parse(readFileSync(join(homedir(), ".memory-forge", "pro.json"), "utf-8")); } catch {}
          if (profile?.privateKey) {
            initShelby(cfg.apiKey, profile.privateKey);
            balances = await getBalances();
            storage = await getStorageUsage();
          }
        }

        const keyStatus = s.apiKeyValid === false ? "❌ invalid"
          : s.apiKeyValid ? "✅ valid"
          : "⚠️  not set (sync paused)";
        console.log(`Pro: ${s.apiKeyValid ? "active ✅" : "paused ⚠️"}`);
        console.log("");
        console.log("  ── Account ──");
        console.log(`  Address:            ${s.address}`);
        console.log(`  API key:            ${keyStatus}`);
        if (balances) {
          const aptVal = parseFloat(balances.apt);
          const usdVal = parseFloat(balances.shelbyUsd);
          const aptWarn = aptVal < 0.01 ? " ⚠️  low (gas may fail)" : "";
          const usdWarn = usdVal < 1.0 ? " ⚠️  low (storage uploads may fail)" : "";
          console.log(`  APT balance:        ${balances.apt}${aptWarn}`);
          console.log(`  ShelbyUSD balance:  ${balances.shelbyUsd}${usdWarn}`);
        } else if (cfg.apiKey) {
          console.log(`  Balances:           (query failed — network or unfunded)`);
        }
        console.log("");
        console.log("  ── Storage ──");
        console.log(`  Local memories:     ${s.localCount}`);
        if (storage) {
          const kb = (storage.totalBytes / 1024).toFixed(1);
          console.log(`  Shelby blobs:       ${storage.blobCount} (${kb} KB)`);
        } else if (cfg.apiKey) {
          console.log(`  Shelby usage:       (query failed)`);
        }
        console.log("");
        console.log("  ── Sync stats ──");
        console.log(`  Total uploaded:     ${s.totalUploaded}`);
        console.log(`  Total downloaded:   ${s.totalDownloaded}`);
        console.log(`  Total failed:       ${s.totalFailed || "—"}`);
        console.log(`  Total conflicts:    ${s.totalConflicts || "—"}`);
        console.log(`  Last sync:          ${s.lastSync || "never"}`);
        if (s.syncHistory && s.syncHistory.length > 0) {
          console.log(`  Recent syncs:`);
          for (const entry of s.syncHistory.slice(-5).reverse()) {
            const parts: string[] = [];
            if (entry.up > 0) parts.push(`↑${entry.up}`);
            if (entry.down > 0) parts.push(`↓${entry.down}`);
            if (entry.failed > 0) parts.push(`✗${entry.failed}`);
            if (entry.conflicts && entry.conflicts > 0) parts.push(`⚡${entry.conflicts}`);
            console.log(`    ${entry.time.slice(0, 19).replace("T", " ")}  ${parts.join(" ") || "—"}`);
          }
        }
      }
      process.exit(0);
    })();
  } else {
    pro()
      .then(() => process.exit(process.exitCode ?? 0))
      .catch((err) => { console.error(err); process.exit(1); });
  }
} else if (cmd === "list") {
  // CLI: memory-forge list [category]
  const cat = process.argv[3];
  const s = new MemoryStore();
  for (const m of loadAllMemories()) s.add(m);
  let memories = s.list({ limit: 100, offset: 0 });
  if (cat) memories = memories.filter((m) => m.category === cat);
  if (memories.length === 0) {
    console.log(cat ? `No memories in category "${cat}".` : "No memories yet. Use memory_store to create one.");
  } else {
    console.log(`${memories.length} memories${cat ? ` (category: ${cat})` : ""}:`);
    for (const m of memories) {
      const date = new Date(m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      console.log(`  ${m.id.slice(0, 8)}  ${date}  [${m.category}]  ${m.name}`);
    }
  }
  process.exit(0);
} else if (cmd === "search") {
  // CLI: memory-forge search <query>
  const query = process.argv.slice(3).join(" ");
  if (!query) { console.log("Usage: memory-forge search <query>"); process.exit(1); }
  const s = new MemoryStore();
  for (const m of loadAllMemories()) s.add(m);
  const results = s.search(query, { limit: 10, minSimilarity: 0 });
  if (results.length === 0) {
    console.log(`No memories matching "${query}".`);
  } else {
    console.log(`${results.length} results for "${query}":`);
    for (const r of results) {
      console.log(`  ${r.id.slice(0, 8)}  [${r.category}]  ${r.name}`);
      console.log(`    ${safeTruncate(r.content, 120)}`);
    }
  }
  process.exit(0);
} else if (cmd === "stats") {
  // CLI: memory-forge stats
  const s = new MemoryStore();
  for (const m of loadAllMemories()) s.add(m);
  const st = s.stats();
  console.log(`Total: ${st.total}  |  Accesses: ${st.total_accesses}  |  Oldest: ${st.oldest ?? "—"}  |  Newest: ${st.newest ?? "—"}`);
  console.log("Categories:", Object.entries(st.categories).map(([k, v]) => `${k}(${v})`).join("  "));
  if (st.top_tags.length) console.log("Top tags:", st.top_tags.map(([t, n]) => `${t}(${n})`).join("  "));
  process.exit(0);
} else if (cmd === "capture-transcript") {
  cliCaptureTranscript();
  process.exit(0);
} else if (cmd === "hook") {
  const hookType = process.argv[3];
  if (hookType === "session-start") {
    // Read stdin for Claude Code hook metadata (cwd, source, session_id)
    let projectSlug = "";
    let projectContextNote = "";
    try {
      const stdinData = readStdinSync();
      if (stdinData) {
        const hookInput = JSON.parse(stdinData);
        if (hookInput.cwd) {
          projectSlug = basename(hookInput.cwd);
          // Only add project note if it differs from default (avoids noise for home dir)
          projectContextNote = `\nCurrent project: ${projectSlug}`;
        }
      }
    } catch {
      // stdin not available or not JSON — ignore (called from CLI directly)
    }

    const s = new MemoryStore();
    for (const m of loadAllMemories()) s.add(m);
    const summary = generateContextSummary(s, 5);
    const memoryCount = s.size();

    // Pro status for session-start visibility
    let proNote = "";
    const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? "/tmp";
    const profilePath = join(homeDir, ".memory-forge", "pro.json");
    if (fs.existsSync(profilePath) && (process.env.SHELBY_API_KEY || getShelbyConfig().apiKey)) {
      try {
        const profile = JSON.parse(fs.readFileSync(profilePath, "utf-8"));
        if (profile.address) {
          const localCount = loadAllMemories().length;
          const syncAge = profile.lastSync
            ? Math.round((Date.now() - new Date(profile.lastSync).getTime()) / 60000)
            : null;
          const ageStr = syncAge === null ? "" : syncAge < 1 ? " (just now)" : syncAge < 60 ? ` (${syncAge}m ago)` : ` (${Math.round(syncAge / 60)}h ago)`;
          proNote = ` | Pro: ${localCount} memories synced${ageStr}`;
        }
      } catch { /* corrupted — ignore */ }
    }

    const sessionTitle = projectSlug
      ? `${projectSlug} (${memoryCount} memories)`
      : `MemoryForge (${memoryCount} memories)`;

    const systemMsgBase = memoryCount > 0
      ? `MemoryForge: ${memoryCount} memories loaded from previous sessions`
      : "MemoryForge: No memories yet. Run `memory-forge setup` to get started.";

    // Output with user-visible session title + agent context
    const output = JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: (summary || "[MemoryForge] No memories yet.") + projectContextNote,
        sessionTitle: sessionTitle + proNote,
      },
      systemMessage: systemMsgBase + proNote,
    });
    console.log(output);
  } else if (hookType === "stop") {
    const all = loadAllMemories();
    let updated = 0, archived = 0;
    for (const m of all) {
      const newPriority = autoPriority(m);
      const decay = autoDecay(m);
      if (decay === 0) {
        try { deleteMemoryFile(m.id); } catch {}
        // Upload cloud tombstone for cross-device archive propagation
        if (process.env.SHELBY_API_KEY || getShelbyConfig().apiKey) {
          deleteBlob(getBlobName(m.id)).catch(() => {});
        }
        archived++;
      } else {
        let changed = false;
        if (newPriority !== m.priority) { m.priority = newPriority; changed = true; }
        if (changed) { try { saveMemory(m); updated++; } catch {} }
      }
    }
    console.error(`[MemoryForge] ${all.length} memories maintained, ${archived} archived`);
    try {
      const transcriptResult = captureTranscript();
      console.error(`[MemoryForge] ${transcriptResult}`);
    } catch (err) {
      console.error(`[MemoryForge] transcript capture failed: ${(err as Error).message}`);
    }
    try { cleanupTombstones(); } catch {}
    // Pro: push to cloud before exit so other devices get everything
    if (process.env.SHELBY_API_KEY || getShelbyConfig().apiKey) {
      try {
        const { proAutoActivate } = await import("./pro.js");
        await proAutoActivate();
        console.error("[MemoryForge] All memories synced to cloud. Safe to close.");
      } catch {
        console.error("[MemoryForge] Cloud sync skipped — will retry next session.");
      }
    }
  } else if (hookType === "pre-compact") {
    const s = new MemoryStore();
    for (const m of loadAllMemories()) s.add(m);
    const summary = generateContextSummary(s, 8);
    console.error(`[MemoryForge] pre-compact: preserving ${s.size()} memories`);

    const preCompactContext = summary +
      "\n\n[MEMORYFORGE AUTO-CAPTURE] Context window is about to compact. " +
      "Use memory_store to save key learnings, decisions, and preferences from this session " +
      "BEFORE continuing. What did you learn about the user? What decisions were made? " +
      "What preferences did you observe?" +
      "\n\n[MEMORYFORGE CROSS-DEVICE] If planning to continue on another machine, remind the user to:\n" +
      "1. git push (code)\n" +
      "2. Exit normally so Stop hook saves the transcript\n" +
      "3. On the other machine: git pull + memory-forge pro (memories)";

    // Silent context injection via hookSpecificOutput
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreCompact",
        additionalContext: preCompactContext,
      },
    }));

    // Safety net: capture transcript + sync to cloud (survives forced close / VS Code panel close)
    try {
      const preCompactTranscript = captureTranscript();
      if (!preCompactTranscript.includes("already captured")) {
        console.error(`[MemoryForge] ${preCompactTranscript}`);
      }
    } catch (err) {
      console.error(`[MemoryForge] pre-compact transcript capture failed: ${(err as Error).message}`);
    }
    // Pro: push to cloud now — VS Code panel close may skip Stop hook
    if (process.env.SHELBY_API_KEY || getShelbyConfig().apiKey) {
      try {
        const { proAutoActivate } = await import("./pro.js");
        await proAutoActivate();
        console.error("[MemoryForge] Pre-compact sync complete — memories safe on cloud.");
      } catch { /* non-fatal */ }
    }
  } else if (hookType === "capture-transcript") {
    try {
      const result = captureTranscript();
      console.error(`[MemoryForge] ${result}`);
    } catch (err) {
      console.error(`[MemoryForge] transcript capture failed: ${(err as Error).message}`);
      process.exit(1);
    }
  } else {
    console.error(`Unknown hook type: ${hookType || "(none)"}`);
    console.error("Hook types: session-start, stop, pre-compact, capture-transcript");
    process.exit(1);
  }
  process.exit(0);
} else if (cmd && cmd !== "serve" && cmd !== "start") {
  // Unknown command — show help
  console.error(`Unknown command: ${cmd}`);
  console.error("Usage: memory-forge <command>");
  console.error("Commands: setup, pro [status], list [category], search <query>, stats, hook <type>, capture-transcript, --version");
  console.error("Default (no command): start MCP server (for Claude Code / Cursor integration)");
  process.exit(1);
} else {
  // Default: start MCP server
  startMcpServer();
}

// ═══════════════════════════════════════════════════════════════
//  MCP Server
// ═══════════════════════════════════════════════════════════════
function startMcpServer() {
  const store = new MemoryStore();

  for (const m of loadAllMemories()) {
    store.add(m);
  }

  preload();

  const server = new McpServer({ name: "memory-forge", version: pkg.version });
  const hasPro = !!(process.env.SHELBY_API_KEY || getShelbyConfig().apiKey);

  // ── memory_store ──────────────────────────────────────────
  server.registerTool(
    "memory_store",
    {
      title: "Store memory",
      description: "Store a context, knowledge, or preference into persistent memory. Auto-embeds for semantic retrieval.",
      inputSchema: {
        content: z.string().min(1).max(100000).refine((s) => s.trim().length > 0, "Content must not be whitespace-only").describe("Memory content (max 100KB)."),
        category: z.string().default("general").describe("Category: user-preference, project-context, decision-log, code-pattern."),
        tags: z.array(z.string().min(1)).default([]).describe("Tags list."),
        priority: z.number().min(1).max(10).default(5).describe("Priority 1-10."),
        name: z.string().min(1).max(120).optional().describe("Custom name (optional — auto-generated from content if not provided)."),
      },
    },
    async (params) => {
      const { content, category, tags, priority, name: customName } = params;
      const vec = await embed(content);
      const name = customName || autoName(content);

      const memory = {
        id: randomUUID(), name, content, category, tags, priority,
        vector: vec ? Array.from(vec) : [],
        created_at: new Date().toISOString(), access_count: 0, last_accessed: null as string | null,
      };

      const merged = await autoMerge(store, memory);
      if (merged) {
        saveMemory(merged);
        console.error(`[MemoryForge] Merged duplicate: "${memory.name}" → "${merged.name}" (${(0.8 * 100).toFixed(0)}%+ overlap)`);
        return { content: [{ type: "text" as const, text: JSON.stringify({
          success: true, merged: true, memory_id: merged.id, name: merged.name, preview: safeTruncate(content, 200),
        }) }] };
      }

      saveMemory(memory);
      store.add(memory);

      // Pro: auto-upload to Shelby cloud
      if (hasPro) {
        uploadMemory(memory).catch(() => {});
      }

      // Contextual upgrade hint: 20+ memories, no Pro yet
      const hint = !hasPro && store.size() >= 20
        ? "💡 20+ memories! Upgrade to Pro for cross-device sync: memory-forge pro"
        : null;

      return { content: [{ type: "text" as const, text: JSON.stringify({
        success: true, memory_id: memory.id, name: memory.name, preview: safeTruncate(content, 200),
        ...(hint ? { hint } : {}),
      }) }] };
    }
  );

  // ── memory_search ─────────────────────────────────────────
  server.registerTool(
    "memory_search",
    {
      title: "Search memories",
      description: "Semantic search with vector similarity. Auto-falls back to keyword matching when model unavailable.",
      inputSchema: {
        query: z.string().describe("Natural language search query."),
        limit: z.number().min(1).max(20).default(5),
        min_similarity: z.number().min(0).max(1).default(0.6),
        category: z.string().optional(),
        tags: z.array(z.string()).optional(),
      },
    },
    async (params) => {
      const { query, limit, min_similarity, category, tags } = params;
      const vec = await embed(query);
      const results = store.search(query, {
        limit, minSimilarity: min_similarity, category: category ?? null,
        tags: tags ?? null, queryVec: vec ?? undefined,
      });
      for (const r of results) {
        store.touch(r.id);
        const updated = store.get(r.id);
        if (updated) saveMemory(updated);
      }
      return { content: [{ type: "text" as const, text: JSON.stringify({
        query, count: results.length,
        results: results.map((r) => ({
          memory_id: r.id, name: r.name,
          similarity: typeof r.similarity === "number" ? Number(r.similarity.toFixed(3)) : 0,
          _score: r._score ?? null,
          content: r.content,
          _method: r._fallback || "vector",
        })),
        hint: results.length === 0 ? "No relevant memories found." : null,
      }) }] };
    }
  );

  // ── memory_recall ─────────────────────────────────────────
  server.registerTool(
    "memory_recall",
    {
      title: "Recall memory",
      description: "Retrieve a single memory by its exact ID with full content.",
      inputSchema: { memory_id: z.string().describe("Memory ID.") },
    },
    async (params) => {
      const { memory_id } = params;
      const memory = store.get(memory_id);
      if (!memory) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Not found", memory_id }) }] };
      store.touch(memory_id);
      saveMemory(memory);
      return { content: [{ type: "text" as const, text: JSON.stringify({
        memory_id: memory.id, name: memory.name, content: memory.content,
        category: memory.category, tags: memory.tags, priority: memory.priority,
        created_at: memory.created_at, access_count: memory.access_count,
      }) }] };
    }
  );

  // ── memory_list ───────────────────────────────────────────
  server.registerTool(
    "memory_list",
    {
      title: "List memories",
      description: "List memories with category and tag filtering, pagination, and full metadata.",
      inputSchema: {
        category: z.string().optional(),
        tags: z.array(z.string()).optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      },
    },
    async (params) => {
      const { category, tags, limit, offset } = params;
      const isFiltered = !!(category || (tags && tags.length > 0));
      const memories = store.list({ category: category ?? null, tags: tags ?? null, limit, offset });
      // Count total matching (without pagination) when filtered, else full store
      const matchingTotal = isFiltered
        ? store.list({ category: category ?? null, tags: tags ?? null, limit: 10000, offset: 0 }).length
        : store.size();
      return { content: [{ type: "text" as const, text: JSON.stringify({
        total: matchingTotal, count: memories.length,
        memories: memories.map((m) => ({
          memory_id: m.id, name: m.name, category: m.category,
          tags: m.tags, priority: m.priority, access_count: m.access_count,
          created_at: m.created_at, last_accessed: m.last_accessed,
          preview: safeTruncate(m.content, 200),
        })),
      }) }] };
    }
  );

  // ── memory_forget ─────────────────────────────────────────
  server.registerTool(
    "memory_forget",
    {
      title: "Forget memory",
      description: "Delete a memory by ID — removes local file + uploads cloud tombstone.",
      inputSchema: { memory_id: z.string().describe("Memory ID to delete.") },
    },
    async (params) => {
      const { memory_id } = params;
      const existed = store.remove(memory_id);
      if (existed) {
        deleteMemoryFile(memory_id);
        // Pro: upload cloud tombstone to prevent sync resurrection
        if (process.env.SHELBY_API_KEY || getShelbyConfig().apiKey) {
          deleteBlob(getBlobName(memory_id)).catch(() => {});
        }
      }
      return { content: [{ type: "text" as const, text: JSON.stringify({
        success: existed, memory_id, action: existed ? "deleted" : "not_found",
      }) }] };
    }
  );

  // ── memory_context ────────────────────────────────────────
  server.registerTool(
    "memory_context",
    {
      title: "Load context",
      description: "Load current session context — returns top recent/high-priority memories.",
      inputSchema: { limit: z.number().min(1).max(20).default(5) },
    },
    async (params) => {
      const { limit } = params;
      const summary = generateContextSummary(store, limit);
      return { content: [{ type: "text" as const, text: JSON.stringify({
        context_loaded: true, memory_count: store.size(), context: summary,
      }) }] };
    }
  );

  // ── memory_export ─────────────────────────────────────────
  server.registerTool(
    "memory_export",
    {
      title: "Export memories",
      description: "Export memories to portable JSON or Markdown. Free users can move between machines; Pro users can backup. Exports all if no memory_ids specified.",
      inputSchema: {
        memory_ids: z.array(z.string()).optional().describe("Memory IDs to export. Exports all if not specified."),
        format: z.enum(["json", "markdown"]).default("json").describe("Export format: json (structured) or markdown (human-readable)."),
      },
    },
    async (params) => {
      const { memory_ids, format } = params;

      let memories = memory_ids
        ? memory_ids.map((id) => store.get(id)).filter((m): m is NonNullable<typeof m> => m !== null)
        : [...store.list({ limit: 10000, offset: 0 })];


      if (memories.length === 0) {
        return { content: [{ type: "text" as const, text: JSON.stringify({
          exported: 0, message: "No memories to export.",
          ...(!hasPro ? { hint: "💡 Pro auto-syncs across devices — no manual export needed: memory-forge pro" } : {}),
        }) }] };
      }

      let output: string;

      if (format === "markdown") {
        output = memories.map((m) => {
          const lines = [
            `# ${m.name}`,
            `> category: ${m.category} | tags: ${m.tags.join(", ")} | priority: ${m.priority}`,
            `> created: ${m.created_at} | access_count: ${m.access_count}`,
            ``,
            m.content,
            ``,
            "---",
          ];
          return lines.join("\n");
        }).join("\n\n");
      } else {
        output = JSON.stringify({
          exported_at: new Date().toISOString(),
          version: "memory-forge-1.0",
          count: memories.length,
          memories: memories.map((m) => ({
            id: m.id,
            name: m.name,
            content: m.content,
            category: m.category,
            tags: m.tags,
            priority: m.priority,
            created_at: m.created_at,
          })),
        }, null, 2);
      }

      const hint = !hasPro
        ? "\n\n💡 Pro auto-syncs across devices — no manual export needed: memory-forge pro"
        : "";

      return { content: [{ type: "text" as const, text: output + hint }] };
    }
  );

  // ── memory_share ──────────────────────────────────────────
  server.registerTool(
    "memory_share",
    {
      title: "Share memory",
      description: "Package a single memory into a shareable JSON bundle for teammates or other agents to import via memory_store.",
      inputSchema: {
        memory_id: z.string().describe("Memory ID to share."),
        recipient: z.string().optional().describe("Recipient name (optional, written to share metadata)."),
        note: z.string().optional().describe("Optional note attached to the share package."),
      },
    },
    async (params) => {
      const { memory_id, recipient, note } = params;
      const memory = store.get(memory_id);

      if (!memory) {
        return { content: [{ type: "text" as const, text: JSON.stringify({
          error: "Not found", memory_id, hint: "Use memory_list to find the correct ID.",
        }) }] };
      }

      store.touch(memory_id);

      const sharePackage = {
        type: "memory-forge-share",
        version: "1.0",
        shared_at: new Date().toISOString(),
        recipient: recipient ?? null,
        note: note ?? null,
        memory: {
          name: memory.name,
          content: memory.content,
          category: memory.category,
          tags: memory.tags,
        },
        import_instruction: "Use memory_store with this content to import.",
      };

      return { content: [{ type: "text" as const, text: JSON.stringify(sharePackage, null, 2) }] };
    }
  );

  // ── memory_update ────────────────────────────────────────
  server.registerTool(
    "memory_update",
    {
      title: "Update memory",
      description: "Partially update a memory by ID. Only provided fields are changed — unset fields stay untouched.",
      inputSchema: {
        memory_id: z.string().describe("Memory ID to update."),
        content: z.string().min(1).max(100000).refine((s) => s.trim().length > 0, "Content must not be whitespace-only").optional().describe("New content (optional)."),
        category: z.string().optional().describe("New category (optional)."),
        tags: z.array(z.string()).optional().describe("New tags list (optional, replaces all existing tags)."),
        priority: z.number().min(1).max(10).optional().describe("New priority 1-10 (optional)."),
        name: z.string().min(1).max(120).optional().describe("New name (optional — auto-generated if not provided)."),
      },
    },
    async (params) => {
      const { memory_id, content, category, tags, priority, name: customName } = params;

      // Guard: at least one optional field must be provided
      if (content === undefined && category === undefined && tags === undefined && priority === undefined && customName === undefined) {
        return { content: [{ type: "text" as const, text: JSON.stringify({
          error: "No fields to update", hint: "Provide at least one of: content, category, tags, priority.",
        }) }] };
      }

      const memory = store.get(memory_id);
      if (!memory) {
        return { content: [{ type: "text" as const, text: JSON.stringify({
          error: "Not found", memory_id, hint: "Use memory_list to find the correct ID.",
        }) }] };
      }

      // Apply partial updates — only override provided fields
      if (content !== undefined) {
        memory.content = content;
        memory.name = customName || autoName(content);
        const vec = await embed(content);
        if (vec) memory.vector = Array.from(vec);
      } else if (customName !== undefined) {
        memory.name = customName;
      }
      if (category !== undefined) memory.category = category;
      if (tags !== undefined) memory.tags = tags;
      if (priority !== undefined) memory.priority = priority;
      memory.access_count++;
      memory.last_accessed = new Date().toISOString();

      saveMemory(memory);
      store.add(memory); // update vectorCache for search

      // Pro: sync updated memory to cloud
      if (process.env.SHELBY_API_KEY || getShelbyConfig().apiKey) {
        uploadMemory(memory).catch(() => {});
      }

      return { content: [{ type: "text" as const, text: JSON.stringify({
        success: true, memory_id: memory.id, name: memory.name,
        preview: safeTruncate(memory.content, 200),
        updated_fields: Object.keys(params).filter((k) => k !== "memory_id" && params[k as keyof typeof params] !== undefined),
      }) }] };
    }
  );

  // ── 启动 ──────────────────────────────────────────────────
  async function main() {
    // Pro: auto-activate + sync before server starts (so all memories are loaded)
    const proActive = !!(process.env.SHELBY_API_KEY || getShelbyConfig().apiKey);
    if (proActive) {
      try {
        await proAutoActivate();
        for (const m of loadAllMemories()) store.add(m);
      } catch (err) {
        console.error("[MemoryForge] Pro sync failed (server still available):", (err as Error).message);
      }
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`[MemoryForge] MCP Server started — ${store.size()} memories loaded` +
      (proActive ? " (Pro: cross-device sync)" : " (Free: local storage)"));
    console.error("[MemoryForge] 9 tools: store / search / recall / list / forget / context / export / share / update");
  }

  main().catch((err) => {
    console.error("[MemoryForge] Fatal:", err);
    process.exit(1);
  });
}
