/**
 * Claude Code hooks 自动配置。
 * 写入 ~/.claude/settings.json，自动添加 SessionStart/Stop/PreCompact hooks。
 */

import * as fs from "node:fs";
import * as path from "node:path";

const CLAUDE_SETTINGS = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? "/tmp",
  ".claude",
  "settings.json"
);

export function installHooks(): boolean {
  try {
    const dir = path.dirname(CLAUDE_SETTINGS);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let config: any = {};
    if (fs.existsSync(CLAUDE_SETTINGS)) {
      const raw = fs.readFileSync(CLAUDE_SETTINGS, "utf-8");
      config = JSON.parse(raw);
    }

    if (!config.hooks) config.hooks = {};

    const mfCmd = "memory-forge";

    config.hooks.SessionStart = config.hooks.SessionStart || [];
    if (!hasHook(config.hooks.SessionStart, "memory-forge")) {
      config.hooks.SessionStart.push({
        hooks: [{ type: "command", command: `${mfCmd} hook session-start` }],
      });
    }

    config.hooks.Stop = config.hooks.Stop || [];
    if (!hasHook(config.hooks.Stop, "memory-forge")) {
      config.hooks.Stop.push({
        hooks: [{ type: "command", command: `${mfCmd} hook stop` }],
      });
    }

    config.hooks.PreCompact = config.hooks.PreCompact || [];
    if (!hasHook(config.hooks.PreCompact, "memory-forge")) {
      config.hooks.PreCompact.push({
        hooks: [{ type: "command", command: `${mfCmd} hook pre-compact` }],
      });
    }

    fs.writeFileSync(CLAUDE_SETTINGS, JSON.stringify(config, null, 2));
    return true;
  } catch (err) {
    console.error("[MemoryForge] Failed to install hooks:", (err as Error).message);
    return false;
  }
}

function hasHook(hooks: any[], name: string): boolean {
  return hooks.some(
    (h: any) =>
      h.hooks?.some((inner: any) => inner.command?.includes(name))
  );
}

export function getHooksStatus(): { sessionStart: boolean; stop: boolean; preCompact: boolean } {
  try {
    if (!fs.existsSync(CLAUDE_SETTINGS)) return { sessionStart: false, stop: false, preCompact: false };
    const config = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, "utf-8"));
    return {
      sessionStart: hasHook(config.hooks?.SessionStart || [], "memory-forge"),
      stop: hasHook(config.hooks?.Stop || [], "memory-forge"),
      preCompact: hasHook(config.hooks?.PreCompact || [], "memory-forge"),
    };
  } catch {
    return { sessionStart: false, stop: false, preCompact: false };
  }
}
