#!/usr/bin/env node
/**
 * MemoryForge 一键安装: npx memory-forge setup
 */

import { installHooks, installMcpServers, getHooksStatus, getMcpStatus } from "./hooks/install.js";
import { importRules, rulesToMemories } from "./migrate/import.js";
import { preload } from "./embedding.js";
import { saveMemory } from "./storage/local.js";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getLocalTimezone } from "./lib/timezone.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function setup(): Promise<void> {
  console.log(`
  ╔══════════════════════════╗
  ║   MemoryForge Setup       ║
  ╚══════════════════════════╝
  `);

  // 0. Install globally (npm link for dev, npm i -g for published)
  console.log("📦 Installing memory-forge globally…");
  try {
    execSync("npm link", { stdio: "pipe", timeout: 30000, cwd: join(__dirname, "..") });
    console.log("   ✅ Global link complete");
  } catch {
    try {
      execSync("npm i -g memory-forge@latest", { stdio: "pipe", timeout: 30000 });
      console.log("   ✅ Global install complete (from registry)");
    } catch {
      console.log("   ⚠️  Global install skipped — hooks work with npx too");
    }
  }

  // 1. Install MCP servers for all detected tools
  console.log("\n🔌 Installing MCP servers…");
  const mcpResult = installMcpServers();
  if (mcpResult.updated.length > 0) {
    console.log(`   ✅ Registered in: ${mcpResult.updated.join(", ")}`);
  }
  if (mcpResult.installed.length > 0) {
    console.log(`   ℹ️  Already configured: ${mcpResult.installed.join(", ")}`);
  }
  if (mcpResult.updated.length === 0 && mcpResult.installed.length === 0) {
    console.log(
      "   ℹ️  No supported AI tools detected. Install Claude Code, Codex, Cursor, or Windsurf first.",
    );
  }

  // 2. Install Claude Code lifecycle hooks
  console.log("\n🪝  Installing Claude Code hooks…");
  const hooksOk = installHooks();
  console.log(
    hooksOk
      ? "   ✅ Hooks installed (SessionStart / Stop / PreCompact / PostToolUse)"
      : "   ⚠️  Hooks skipped (Claude Code not found)",
  );

  // 3. Import existing rules
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

  // 4. Preload embedding model
  console.log("\n🧠 Preloading embedding model (background)…");
  preload();
  console.log("   ℹ️  Model will download on first use (~23MB, one-time)");

  // 4a. CJK auto-config + timezone persistence
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "/tmp";
  const mfDir = join(home, ".memory-forge");
  const configPath = join(mfDir, "config.json");
  const tz = getLocalTimezone();

  const lang = (process.env.LANG ?? process.env.LC_ALL ?? process.env.LANGUAGE ?? "").toLowerCase();
  const isCJK = lang.startsWith("zh") || lang.startsWith("ja") || lang.startsWith("ko");

  // Load existing config or start fresh
  let config: Record<string, string> = {};
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, "utf-8"));
    } catch {
      /* overwrite */
    }
  }

  if (isCJK) {
    config.embedModel = "e5";
    config.hfMirror = "https://hf-mirror.com";
  }
  config.timezone = tz;

  if (!existsSync(mfDir)) mkdirSync(mfDir, { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  if (isCJK) {
    console.log(
      "   🌐 CJK detected — multilingual model + HF mirror configured (~118MB, auto-download on first use)",
    );
  }
  console.log(`   🕐 Timezone: ${tz}`);

  // 5. Verify everything
  console.log("\n🔍 Verifying setup…");

  const hookStatus = getHooksStatus();
  console.log(`   SessionStart:  ${hookStatus.sessionStart ? "✅" : "⚠️ not configured"}`);
  console.log(`   Stop:          ${hookStatus.stop ? "✅" : "⚠️ not configured"}`);
  console.log(`   PreCompact:    ${hookStatus.preCompact ? "✅" : "⚠️ not configured"}`);
  console.log(`   PostToolUse:   ${hookStatus.postToolUse ? "✅" : "⚠️ not configured"}`);

  const mcpStatus = getMcpStatus();
  const mcpConfigured = mcpStatus.filter((s) => s.configured);
  if (mcpConfigured.length > 0) {
    console.log(`\n   MCP Servers:`);
    for (const s of mcpStatus) {
      console.log(`   ${s.tool.padEnd(14)} ${s.configured ? "✅" : "⚠️ not detected"}`);
    }
  }

  console.log(`
  ┌──────────────────────────────────────┐
  │  MemoryForge is ready!                │
  │                                      │
  │  Your AI Agent now has memory.       │
  │  Supported: Claude Code, Codex,       │
  │  Cursor, Windsurf, VS Code            │
  │                                      │
  │  Try it now:                          │
  │    • CLI:  memory-forge list         │
  │    • CLI:  memory-forge search "react"│
  │    • CLI:  memory-forge stats        │
  │    • MCP:  memory_store "I prefer…"  │
  │                                      │
  │  No further setup needed.            │
  └──────────────────────────────────────┘
  `);
}
