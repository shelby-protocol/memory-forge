#!/usr/bin/env node
/**
 * MemoryForge — AI Agent persistent memory engine.
 * 9 MCP tools + 5 auto-engines + Pro Shelby cloud sync.
 *
 * Quick start: npx memory-forge setup
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, join } from "node:path";
import * as fs from "node:fs";

import { MemoryStore } from "./store.js";
import { preload } from "./embedding.js";
import { loadAllMemories, cleanupTombstones, deleteMemoryFile } from "./storage/local.js";
import { deleteBlob, getBlobName, getShelbyConfig } from "./storage/shelby.js";
import { autoPriority, autoDecay, generateContextSummary } from "./auto/index.js";
import { setup } from "./setup.js";
import { pro, syncAll, proStatus, proAutoActivate } from "./pro.js";
import { captureTranscript, cliCaptureTranscript } from "./transcript.js";
import { saveMemory } from "./storage/local.js";

// Tool modules
import { register as registerStore } from "./tools/store.js";
import { register as registerSearch } from "./tools/search.js";
import { register as registerRecall } from "./tools/recall.js";
import { register as registerList } from "./tools/list.js";
import { register as registerForget } from "./tools/forget.js";
import { register as registerContext } from "./tools/context.js";
import { register as registerExport } from "./tools/export.js";
import { register as registerShare } from "./tools/share.js";
import { register as registerUpdate } from "./tools/update.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8")) as { version: string };

function readStdinSync(): string | null {
  try {
    if (process.stdin.isTTY) return null;
    return fs.readFileSync(0, "utf-8").trim() || null;
  } catch {
    return null;
  }
}

// ─── CLI command routing ────────────────────────────────────
const cmd = process.argv[2];

if (cmd === "--version" || cmd === "-v") {
  console.log(pkg.version);
  process.exit(0);
}
if (cmd === "setup") {
  setup()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
} else if (cmd === "pro") {
  const sub = process.argv[3];
  if (sub === "status") {
    (async () => {
      const { getBalances, getStorageUsage, initShelby, getShelbyConfig: getCfg } = await import("./storage/shelby.js");
      const s = proStatus();
      if (!s.active) {
        console.log(
          'Pro: not active\n  Set SHELBY_API_KEY and restart your session to auto-activate.\n  Or run: SHELBY_API_KEY="..." memory-forge pro',
        );
      } else {
        const cfg = getCfg();
        let balances = null,
          storage = null;
        if (cfg.apiKey && cfg.accountAddress) {
          const { readFileSync: rfs } = await import("node:fs");
          const { join: jn } = await import("node:path");
          const { homedir } = await import("node:os");
          let profile: any = null;
          try {
            profile = JSON.parse(rfs(jn(homedir(), ".memory-forge", "pro.json"), "utf-8"));
          } catch { /* ignore */ }
          if (profile?.privateKey) {
            await initShelby(cfg.apiKey, profile.privateKey);
            balances = await getBalances();
            storage = await getStorageUsage();
          }
        }
        const keyStatus = s.apiKeyValid === false ? "❌ invalid" : s.apiKeyValid ? "✅ valid" : "⚠️  not set (sync paused)";
        console.log(`Pro: ${s.apiKeyValid ? "active ✅" : "paused ⚠️"}\n`);
        console.log("  ── Account ──");
        console.log(`  Address:            ${s.address}`);
        console.log(`  API key:            ${keyStatus}`);
        if (balances) {
          const aptVal = parseFloat(balances.apt),
            usdVal = parseFloat(balances.shelbyUsd);
          const aptWarn = aptVal < 0.01 ? " ⚠️  low — faucet: https://docs.shelby.xyz/apis/faucet/aptos" : "";
          const usdWarn = usdVal < 1.0 ? " ⚠️  low — faucet: https://docs.shelby.xyz/apis/faucet/shelbyusd" : "";
          console.log(`  APT balance:        ${balances.apt}${aptWarn}`);
          console.log(`  ShelbyUSD balance:  ${balances.shelbyUsd}${usdWarn}`);
        } else if (cfg.apiKey) {
          console.log(`  Balances:           (query failed — network or unfunded)`);
        }
        console.log("");
        console.log("  ── Storage ──");
        console.log(`  Local memories:     ${s.localCount}`);
        if (storage) console.log(`  Shelby blobs:       ${storage.blobCount} (${(storage.totalBytes / 1024).toFixed(1)} KB)`);
        else if (cfg.apiKey) console.log(`  Shelby usage:       (query failed)`);
        console.log("");
        console.log("  ── Sync stats ──");
        console.log(`  Total uploaded:     ${s.totalUploaded}`);
        console.log(`  Total downloaded:   ${s.totalDownloaded}`);
        console.log(`  Total failed:       ${s.totalFailed || "—"}`);
        console.log(`  Total conflicts:    ${s.totalConflicts || "—"}`);
        console.log(`  Last sync:          ${s.lastSync || "never"}`);
        if (s.syncHistory?.length) {
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
      .catch((err) => {
        console.error(err);
        process.exit(1);
      });
  }
} else if (cmd === "list") {
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
  const query = process.argv.slice(3).join(" ");
  if (!query) {
    console.log("Usage: memory-forge search <query>");
    process.exit(1);
  }
  const s = new MemoryStore();
  for (const m of loadAllMemories()) s.add(m);
  const results = s.search(query, { limit: 10, minSimilarity: 0 });
  if (results.length === 0) {
    console.log(`No memories matching "${query}".`);
  } else {
    console.log(`${results.length} results for "${query}":`);
    for (const r of results) {
      console.log(`  ${r.id.slice(0, 8)}  [${r.category}]  ${r.name}`);
      console.log(`    ${r.content.slice(0, 120)}`);
    }
  }
  process.exit(0);
} else if (cmd === "stats") {
  const s = new MemoryStore();
  for (const m of loadAllMemories()) s.add(m);
  const st = s.stats();
  console.log(`Total: ${st.total}  |  Accesses: ${st.total_accesses}  |  Weekly new: ${st.weekly_new}  |  Oldest: ${st.oldest ?? "—"}  |  Newest: ${st.newest ?? "—"}`);
  console.log(
    "Categories:",
    Object.entries(st.categories)
      .map(([k, v]) => `${k}(${v})`)
      .join("  "),
  );
  if (st.top_tags.length) console.log("Top tags:", st.top_tags.map(([t, n]) => `${t}(${n})`).join("  "));
  console.log(
    "Decay:",
    `active=${st.decay_distribution.active} fading=${st.decay_distribution.fading} stale=${st.decay_distribution.stale} archived=${st.decay_distribution.archived}`,
  );
  if (st.branches) console.log("Branches:", Object.entries(st.branches).map(([k, v]) => `${k}(${v})`).join("  "));
  if (st.with_relations > 0) console.log(`Relations: ${st.with_relations} memories linked`);
  if (st.top_accessed.length) console.log("Top accessed:", st.top_accessed.map((a) => `${a.name}(${a.count})`).join("  "));
  process.exit(0);
} else if (cmd === "capture-transcript") {
  cliCaptureTranscript();
  process.exit(0);
} else if (cmd === "hook") {
  const hookType = process.argv[3];
  if (hookType === "session-start") {
    let projectSlug = "";
    let projectContextNote = "";
    try {
      const stdinData = readStdinSync();
      if (stdinData) {
        const hookInput = JSON.parse(stdinData);
        if (hookInput.cwd) {
          projectSlug = basename(hookInput.cwd);
          projectContextNote = `\nCurrent project: ${projectSlug}`;
        }
      }
    } catch {}
    const s = new MemoryStore();
    for (const m of loadAllMemories()) s.add(m);
    const summary = generateContextSummary(s, 5);
    const memoryCount = s.size();
    let proNote = "";
    const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? "/tmp";
    const profilePath = join(homeDir, ".memory-forge", "pro.json");
    if (fs.existsSync(profilePath) && (process.env.SHELBY_API_KEY || getShelbyConfig().apiKey)) {
      try {
        const profile = JSON.parse(fs.readFileSync(profilePath, "utf-8"));
        if (profile.address) {
          const localCount = loadAllMemories().length;
          const syncAge = profile.lastSync ? Math.round((Date.now() - new Date(profile.lastSync).getTime()) / 60000) : null;
          const ageStr =
            syncAge === null
              ? ""
              : syncAge < 1
                ? " (just now)"
                : syncAge < 60
                  ? ` (${syncAge}m ago)`
                  : ` (${Math.round(syncAge / 60)}h ago)`;
          proNote = ` | Pro: ${localCount} memories synced${ageStr}`;
        }
      } catch {}
    }
    const sessionTitle = projectSlug ? `${projectSlug} (${memoryCount} memories)` : `MemoryForge (${memoryCount} memories)`;
    const systemMsgBase =
      memoryCount > 0
        ? `MemoryForge: ${memoryCount} memories loaded from previous sessions`
        : "MemoryForge: No memories yet. Run `memory-forge setup` to get started.";
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext: (summary || "[MemoryForge] No memories yet.") + projectContextNote,
          sessionTitle: sessionTitle + proNote,
        },
        systemMessage: systemMsgBase + proNote,
      }),
    );
  } else if (hookType === "stop") {
    const all = loadAllMemories();
    let updated = 0,
      archived = 0;
    for (const m of all) {
      const newPriority = autoPriority(m);
      const decay = autoDecay(m);
      if (decay === 0) {
        try {
          deleteMemoryFile(m.id);
        } catch {}
        if (process.env.SHELBY_API_KEY || getShelbyConfig().apiKey) deleteBlob(getBlobName(m.id)).catch(() => {});
        archived++;
      } else {
        let changed = false;
        if (newPriority !== m.priority) {
          m.priority = newPriority;
          changed = true;
        }
        if (changed) {
          try {
            saveMemory(m);
            updated++;
          } catch {}
        }
      }
    }
    console.error(`[MemoryForge] ${all.length} memories maintained, ${archived} archived`);
    try {
      console.error(`[MemoryForge] ${captureTranscript()}`);
    } catch (err) {
      console.error(`[MemoryForge] transcript capture failed: ${(err as Error).message}`);
    }
    try {
      cleanupTombstones();
    } catch {}
    if (process.env.SHELBY_API_KEY || getShelbyConfig().apiKey) {
      try {
        await proAutoActivate();
        console.error("[MemoryForge] All memories synced to cloud. Safe to close.");
      } catch {
        console.error("[MemoryForge] Cloud sync skipped — will retry next session.");
      }
    }
  } else if (hookType === "post-tool-use") {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: "[MemoryForge] 💡 Consider saving key changes or decisions with memory_store.",
      },
    }));
  } else if (hookType === "pre-compact") {
    const s = new MemoryStore();
    for (const m of loadAllMemories()) s.add(m);
    const summary = generateContextSummary(s, 8);
    console.error(`[MemoryForge] pre-compact: preserving ${s.size()} memories`);
    const preCompactContext =
      summary +
      "\n\n[MEMORYFORGE HANDOFF] Create a session handoff summary BEFORE the context compacts. " +
      "Use memory_store with category=\"session-handoff\" and priority=10. Include:\n" +
      "1. What we worked on this session\n" +
      "2. Key decisions made and why\n" +
      "3. File paths modified (for git context)\n" +
      "4. What's blocked or pending for next time\n" +
      "5. Any user preferences or patterns observed\n" +
      "This handoff will appear FIRST on the next SessionStart so you can resume instantly." +
      "\n\n[MEMORYFORGE AUTO-CAPTURE] Also use memory_store to save individual learnings, decisions, " +
      "and preferences as separate memories. What did you learn about the user? " +
      "What decisions were made? What preferences did you observe?" +
      "\n\n[MEMORYFORGE CROSS-DEVICE] If planning to continue on another machine, remind the user to:\n" +
      "1. git push (code)\n2. Exit normally so Stop hook saves the transcript\n" +
      "3. On the other machine: git pull + memory-forge pro (memories)";
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreCompact", additionalContext: preCompactContext } }));
    try {
      const preCompactTranscript = captureTranscript();
      if (!preCompactTranscript.includes("already captured")) console.error(`[MemoryForge] ${preCompactTranscript}`);
    } catch (err) {
      console.error(`[MemoryForge] pre-compact transcript capture failed: ${(err as Error).message}`);
    }
    if (process.env.SHELBY_API_KEY || getShelbyConfig().apiKey) {
      try {
        await proAutoActivate();
        console.error("[MemoryForge] Pre-compact sync complete — memories safe on cloud.");
      } catch {}
    }
  } else if (hookType === "capture-transcript") {
    try {
      console.error(`[MemoryForge] ${captureTranscript()}`);
    } catch (err) {
      console.error(`[MemoryForge] transcript capture failed: ${(err as Error).message}`);
      process.exit(1);
    }
  } else {
    console.error(`Unknown hook type: ${hookType || "(none)"}`);
    console.error("Hook types: session-start, stop, pre-compact, capture-transcript, post-tool-use");
    process.exit(1);
  }
  process.exit(0);
} else if (cmd && cmd !== "serve" && cmd !== "start") {
  console.error(`Unknown command: ${cmd}`);
  console.error("Usage: memory-forge <command>");
  console.error("Commands: setup, pro [status], list [category], search <query>, stats, hook <type>, capture-transcript, --version");
  console.error("Default (no command): start MCP server (for Claude Code / Cursor integration)");
  process.exit(1);
} else {
  startMcpServer();
}

// ═══════════════════════════════════════════════════════════════
//  MCP Server
// ═══════════════════════════════════════════════════════════════
function startMcpServer() {
  const store = new MemoryStore();
  for (const m of loadAllMemories()) store.add(m);
  preload();

  const server = new McpServer({ name: "memory-forge", version: pkg.version });
  const hasPro = !!(process.env.SHELBY_API_KEY || getShelbyConfig().apiKey);
  const toolOpts = { store, version: pkg.version, hasPro };

  registerStore(server, toolOpts);
  registerSearch(server, toolOpts);
  registerRecall(server, toolOpts);
  registerList(server, toolOpts);
  registerForget(server, toolOpts);
  registerContext(server, toolOpts);
  registerExport(server, toolOpts);
  registerShare(server, toolOpts);
  registerUpdate(server, toolOpts);

  async function main() {
    if (hasPro) {
      try {
        await proAutoActivate();
        for (const m of loadAllMemories()) store.add(m);
      } catch (err) {
        console.error("[MemoryForge] Pro sync failed (server still available):", (err as Error).message);
      }
    }
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(
      `[MemoryForge] MCP Server started — ${store.size()} memories loaded` +
        (hasPro ? " (Pro: cross-device sync)" : " (Free: local storage)"),
    );
    console.error("[MemoryForge] 9 tools: store / search / recall / list / forget / context / export / share / update");
  }

  main().catch((err) => {
    console.error("[MemoryForge] Fatal:", err);
    process.exit(1);
  });
}
