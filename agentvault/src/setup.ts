#!/usr/bin/env node
/**
 * MemoryForge 一键安装: npx memory-forge setup
 */

import { installHooks, getHooksStatus } from "./hooks/install.js";
import { importRules, rulesToMemories } from "./migrate/import.js";
import { preload } from "./embedding.js";
import { saveMemory } from "./storage/local.js";
import { execSync } from "node:child_process";

export async function setup(): Promise<void> {
  console.log(`
  ╔══════════════════════════╗
  ║   MemoryForge Setup       ║
  ╚══════════════════════════╝
  `);

  // 0. Install globally (so hooks can find the command)
  console.log("📦 Installing memory-forge globally…");
  try {
    execSync("npm i -g memory-forge@latest", { stdio: "pipe", timeout: 60000 });
    console.log("   ✅ Global install complete");
  } catch {
    console.log("   ⚠️  Global install skipped (run `npm i -g memory-forge` manually if hooks fail)");
  }

  // 1. Install Claude Code hooks
  console.log("\n🪝  Installing Claude Code hooks…");
  const hooksOk = installHooks();
  console.log(hooksOk ? "   ✅ Hooks installed (SessionStart / Stop / PreCompact)" : "   ⚠️  Hooks skipped (Claude Code not found)");

  // 2. Import existing rules
  console.log("\n📋 Scanning existing rules…");
  const rules = importRules();
  if (rules.length > 0) {
    console.log(`   Found ${rules.length} rules in CLAUDE.md / .cursor/rules / .gitconfig`);
    const memories = rulesToMemories(rules);
    for (const mem of memories) {
      saveMemory(mem);
    }
    console.log(`   ✅ Imported ${memories.length} rules as memories`);
  } else {
    console.log("   ℹ️  No existing rules found — starting fresh");
  }

  // 3. Preload embedding model in background
  console.log("\n🧠 Preloading embedding model (background)…");
  preload();
  console.log("   ℹ️  Model will download on first use (~23MB, one-time)");

  // 4. Verify hooks status
  console.log("\n🔍 Verifying setup…");
  const hookStatus = getHooksStatus();
  console.log(`   SessionStart:  ${hookStatus.sessionStart ? "✅" : "⚠️ not configured"}`);
  console.log(`   Stop:          ${hookStatus.stop ? "✅" : "⚠️ not configured"}`);
  console.log(`   PreCompact:    ${hookStatus.preCompact ? "✅" : "⚠️ not configured"}`);

  console.log(`
  ┌──────────────────────────────────────┐
  │  MemoryForge is ready!                │
  │                                      │
  │  Your AI Agent now has memory.       │
  │  It will automatically:              │
  │    • Remember your preferences       │
  │    • Load context on session start   │
  │    • Capture learnings each session  │
  │                                      │
  │  No further setup needed.            │
  └──────────────────────────────────────┘
  `);
}
