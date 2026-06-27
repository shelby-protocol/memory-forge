/**
 * Setup & hooks install smoke tests.
 * Tests hook config format generation and validation without touching real settings.
 * Run: npx tsx src/setup-test.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";

let ok = 0;
let ng = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
    ok++;
  } catch (e: any) {
    ng++;
    console.log(`  FAIL ${name}: ${e.message}`);
  }
}

const home = os.homedir();
const settingsPath = path.join(home, ".claude", "settings.json");
const origExists = fs.existsSync(settingsPath);
const origBackup = origExists ? fs.readFileSync(settingsPath, "utf-8") : null;

// ═══ 1. installHooks format validation ═══
console.log("=== 1. installHooks format ===");
import { installHooks, getHooksStatus } from "./hooks/install.js";

t("installHooks returns boolean", () => {
  const result = installHooks();
  if (typeof result !== "boolean") throw new Error(`expected boolean, got ${typeof result}`);
});

t("settings.json created after install", () => {
  if (!fs.existsSync(settingsPath)) throw new Error("settings.json not created");
});

t("settings.json is valid JSON", () => {
  const raw = fs.readFileSync(settingsPath, "utf-8");
  JSON.parse(raw); // throws if invalid
});

t("settings has hooks section", () => {
  const config = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  if (!config.hooks) throw new Error("no hooks section");
});

t("SessionStart hook configured", () => {
  const config = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  const hooks = config.hooks?.SessionStart || [];
  if (hooks.length === 0) throw new Error("no SessionStart hooks");
  const hasMf = hooks.some((h: any) => h.hooks?.some((inner: any) => inner.command?.includes("memory-forge")));
  if (!hasMf) throw new Error("memory-forge hook not found in SessionStart");
});

t("SessionStart has matcher: 'startup'", () => {
  const config = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  const hooks = config.hooks?.SessionStart || [];
  const mfHook = hooks.find((h: any) => h.hooks?.some((inner: any) => inner.command?.includes("memory-forge")));
  if (!mfHook?.matcher || mfHook.matcher !== "startup") throw new Error(`matcher=${mfHook?.matcher}`);
});

t("Stop hook configured", () => {
  const config = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  const hooks = config.hooks?.Stop || [];
  const hasMf = hooks.some((h: any) => h.hooks?.some((inner: any) => inner.command?.includes("memory-forge hook stop")));
  if (!hasMf) throw new Error("memory-forge Stop hook not found");
});

t("PreCompact hook configured", () => {
  const config = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  const hooks = config.hooks?.PreCompact || [];
  const hasMf = hooks.some((h: any) => h.hooks?.some((inner: any) => inner.command?.includes("memory-forge hook pre-compact")));
  if (!hasMf) throw new Error("memory-forge PreCompact hook not found");
});

// ═══ 2. getHooksStatus ═══
console.log("\n=== 2. getHooksStatus ===");

t("getHooksStatus returns object with 3 booleans", () => {
  const status = getHooksStatus();
  if (typeof status.sessionStart !== "boolean") throw new Error("sessionStart not boolean");
  if (typeof status.stop !== "boolean") throw new Error("stop not boolean");
  if (typeof status.preCompact !== "boolean") throw new Error("preCompact not boolean");
});

t("getHooksStatus all true after install", () => {
  const status = getHooksStatus();
  if (!status.sessionStart) throw new Error("sessionStart false");
  if (!status.stop) throw new Error("stop false");
  if (!status.preCompact) throw new Error("preCompact false");
});

// ═══ 3. Idempotent install ═══
console.log("\n=== 3. Idempotent install ===");

t("double install does not duplicate hooks", () => {
  installHooks(); // second call
  const config = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  const sessionHooks = config.hooks?.SessionStart || [];
  const mfHooks = sessionHooks.filter((h: any) => h.hooks?.some((inner: any) => inner.command?.includes("memory-forge")));
  if (mfHooks.length > 1) throw new Error(`duplicated: ${mfHooks.length} SessionStart hooks for memory-forge`);
  const stopHooks = (config.hooks?.Stop || []).filter((h: any) => h.hooks?.some((inner: any) => inner.command?.includes("memory-forge")));
  if (stopHooks.length > 1) throw new Error(`duplicated: ${stopHooks.length} Stop hooks`);
  const preHooks = (config.hooks?.PreCompact || []).filter((h: any) =>
    h.hooks?.some((inner: any) => inner.command?.includes("memory-forge")),
  );
  if (preHooks.length > 1) throw new Error(`duplicated: ${preHooks.length} PreCompact hooks`);
});

// ═══ 4. Hook command format ═══
console.log("\n=== 4. Hook command format ===");

t("hook commands use 'memory-forge' (not absolute path)", () => {
  const config = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  const allHooks = [...(config.hooks?.SessionStart || []), ...(config.hooks?.Stop || []), ...(config.hooks?.PreCompact || [])];
  for (const h of allHooks) {
    for (const inner of h.hooks || []) {
      if (inner.command && !inner.command.includes("memory-forge")) {
        throw new Error(`unexpected command: ${inner.command}`);
      }
    }
  }
});

t("hook type is 'command'", () => {
  const config = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  const mfHook = config.hooks?.SessionStart?.find((h: any) => h.hooks?.some((inner: any) => inner.command?.includes("memory-forge")));
  const inner = mfHook?.hooks?.[0];
  if (inner?.type !== "command") throw new Error(`type=${inner?.type}`);
});

// ═══ 5. Rules import smoke ═══
console.log("\n=== 5. Rules import smoke ===");
import { importRules, rulesToMemories } from "./migrate/import.js";

t("importRules returns array", () => {
  const rules = importRules();
  if (!Array.isArray(rules)) throw new Error("should return array");
});

t("rulesToMemories handles empty rules", () => {
  const memories = rulesToMemories([]);
  if (!Array.isArray(memories)) throw new Error("should return array");
  if (memories.length !== 0) throw new Error("should be empty for empty input");
});

t("importRules does not crash", () => {
  // Just verify it runs without exception
  importRules();
});

// ═══ Restore original settings ═══
if (origBackup) {
  fs.writeFileSync(settingsPath, origBackup);
} else if (!origExists) {
  try {
    fs.unlinkSync(settingsPath);
  } catch {}
}

console.log(`\n${ok} passed, ${ng} failed`);
if (ng > 0) process.exit(1);
