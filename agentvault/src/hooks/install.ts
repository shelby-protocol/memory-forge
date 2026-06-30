/**
 * Hooks + MCP server auto-configuration.
 * Installs lifecycle hooks to Claude Code settings.json.
 * Installs MCP server config to Claude Code / Codex / Cursor / Windsurf.
 */

import * as fs from "node:fs";
import * as path from "node:path";

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "/tmp";

/**
 * Resolve the memory-forge command for hooks/MCP config.
 *
 * Always returns `npx memory-forge`. Rationale:
 * - Absolute paths break across shells (cmd.exe vs Git Bash vs WSL)
 * - Bare `memory-forge` requires npm global bin in PATH (not in Git Bash)
 * - `npx` works uniformly from every shell on every platform
 * - First download is cached; subsequent invocations are fast (~50ms)
 */
function resolveMemoryForgeCommand(): string {
  return "npx memory-forge";
}

/** Tools that use the standard MCP mcp.json format. */
const MCP_TOOLS: { name: string; dir: string }[] = [
  { name: "Claude Code", dir: path.join(HOME, ".claude") },
  { name: "Codex", dir: path.join(HOME, ".codex") },
  { name: "Cursor", dir: path.join(HOME, ".cursor") },
  { name: "Windsurf", dir: path.join(HOME, ".windsurf") },
];

const CLAUDE_SETTINGS = path.join(HOME, ".claude", "settings.json");

// ═══ MCP Server Installation ════════════════════════════════

export function installMcpServers(): { installed: string[]; updated: string[] } {
  const installed: string[] = [];
  const updated: string[] = [];

  for (const tool of MCP_TOOLS) {
    try {
      if (!fs.existsSync(tool.dir)) {
        // Only create directory if tool config dir exists (don't create for absent tools)
        continue;
      }

      const mcpPath = path.join(tool.dir, "mcp.json");
      let config: any = {};
      if (fs.existsSync(mcpPath)) {
        config = JSON.parse(fs.readFileSync(mcpPath, "utf-8"));
      }

      if (!config.mcpServers) config.mcpServers = {};

      if (config.mcpServers["memory-forge"]) {
        installed.push(tool.name);
        continue;
      }

      config.mcpServers["memory-forge"] = { command: resolveMemoryForgeCommand() };
      fs.writeFileSync(mcpPath, JSON.stringify(config, null, 2));
      updated.push(tool.name);
    } catch {
      // Tool not installed or config corrupted — skip
    }
  }

  return { installed, updated };
}

// ═══ Claude Code Hooks ══════════════════════════════════════

export function installHooks(): boolean {
  try {
    const dir = path.dirname(CLAUDE_SETTINGS);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let config: any = {};
    if (fs.existsSync(CLAUDE_SETTINGS)) {
      config = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, "utf-8"));
    }

    if (!config.hooks) config.hooks = {};

    const mfCmd = resolveMemoryForgeCommand();

    config.hooks.SessionStart = config.hooks.SessionStart || [];
    setHook(config.hooks.SessionStart, "memory-forge", {
      matcher: "startup",
      hooks: [{ type: "command", command: `${mfCmd} hook session-start` }],
    });

    config.hooks.Stop = config.hooks.Stop || [];
    setHook(config.hooks.Stop, "memory-forge", {
      hooks: [{ type: "command", command: `${mfCmd} hook stop` }],
    });

    config.hooks.PostToolUse = config.hooks.PostToolUse || [];
    setHook(config.hooks.PostToolUse, "memory-forge", {
      matcher: "",
      hooks: [{ type: "command", command: `${mfCmd} hook post-tool-use` }],
    });

    config.hooks.PreCompact = config.hooks.PreCompact || [];
    setHook(config.hooks.PreCompact, "memory-forge", {
      hooks: [{ type: "command", command: `${mfCmd} hook pre-compact` }],
    });

    fs.writeFileSync(CLAUDE_SETTINGS, JSON.stringify(config, null, 2));
    return true;
  } catch (err) {
    console.error("[MemoryForge] Failed to install hooks:", (err as Error).message);
    return false;
  }
}

/** Check if a hook exists for this name (any command).
 *  Matches: "memory-forge", "npx memory-forge", or local dev paths like
 *  "node .../memory-forge/dist/index.js" or "node .../agentvault/dist/index.js". */
function hasHook(hooks: any[], name: string): boolean {
  return hooks.some((h: any) =>
    h.hooks?.some((inner: any) => {
      const cmd = inner.command || "";
      return (
        cmd.includes(name) ||
        // Local dev paths: node /path/to/memory-forge/..., node /path/to/agentvault/...
        /node\s+.*[/\\](?:memory-forge|agentvault)[/\\]/.test(cmd)
      );
    }),
  );
}

/**
 * Set a hook block — replaces existing entry with same name, or appends.
 * This ensures `setup` can update stale commands (e.g., bare `memory-forge` → resolved path).
 */
function setHook(hooks: any[], name: string, entry: any): void {
  const idx = hooks.findIndex((h: any) =>
    h.hooks?.some((inner: any) => {
      const cmd = inner.command || "";
      return cmd.includes(name) || /node\s+.*[/\\](?:memory-forge|agentvault)[/\\]/.test(cmd);
    }),
  );
  if (idx >= 0) hooks[idx] = entry;
  else hooks.push(entry);
}

// ═══ Status ═════════════════════════════════════════════════

export function getHooksStatus(): {
  sessionStart: boolean;
  stop: boolean;
  preCompact: boolean;
  postToolUse: boolean;
} {
  try {
    if (!fs.existsSync(CLAUDE_SETTINGS))
      return { sessionStart: false, stop: false, preCompact: false, postToolUse: false };
    const config = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, "utf-8"));
    return {
      sessionStart: hasHook(config.hooks?.SessionStart || [], "memory-forge"),
      stop: hasHook(config.hooks?.Stop || [], "memory-forge"),
      postToolUse: hasHook(config.hooks?.PostToolUse || [], "memory-forge"),
      preCompact: hasHook(config.hooks?.PreCompact || [], "memory-forge"),
    };
  } catch {
    return { sessionStart: false, stop: false, preCompact: false, postToolUse: false };
  }
}

// ═══ Auto-Repair on Startup ═════════════════════════════════

/**
 * Detect the command to use for hooks based on how memory-forge is being run.
 * Uses the same argv pattern as the MCP server so hooks stay in sync.
 */
function detectHookCommand(): string {
  const argv1 = (process.argv[1] || "").replace(/\\/g, "/");
  // Running from local build: "node dist/index.js" or "node D:/shelby-ai/agentvault/dist/index.js"
  if (argv1.endsWith(".js") || argv1.endsWith(".ts")) {
    return `node ${argv1}`;
  }
  // Running as global binary: "memory-forge"
  if (argv1.includes("memory-forge")) {
    return argv1;
  }
  // Fallback: npx works everywhere
  return "npx memory-forge";
}

export interface HookHealth {
  healthy: boolean;
  repaired: string[];
  missing: string[];
}

/**
 * Check and auto-repair hooks on startup.
 * Returns what was repaired so the caller can log a summary.
 */
export function ensureHooks(): HookHealth {
  const repaired: string[] = [];
  const missing: string[] = [];

  try {
    const settingsPath = path.join(HOME, ".claude", "settings.json");
    const dir = path.dirname(settingsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let config: any = {};
    if (fs.existsSync(settingsPath)) {
      config = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    }

    if (!config.hooks) config.hooks = {};

    const mfCmd = detectHookCommand();

    const required: Record<string, { matcher?: string; type: string }> = {
      SessionStart: { matcher: "startup", type: "session-start" },
      Stop: { type: "stop" },
      PostToolUse: { matcher: "", type: "post-tool-use" },
      PreCompact: { type: "pre-compact" },
    };

    for (const [hookName, def] of Object.entries(required)) {
      config.hooks[hookName] = config.hooks[hookName] || [];

      if (!hasHook(config.hooks[hookName], "memory-forge")) {
        const entry: any = {
          hooks: [{ type: "command", command: `${mfCmd} hook ${def.type}` }],
        };
        if (def.matcher !== undefined) entry.matcher = def.matcher;
        config.hooks[hookName].push(entry);
        repaired.push(hookName);
      }
    }

    if (repaired.length > 0) {
      fs.writeFileSync(settingsPath, JSON.stringify(config, null, 2));
    }
  } catch (err) {
    missing.push((err as Error).message);
  }

  return {
    healthy: repaired.length === 0 && missing.length === 0,
    repaired,
    missing,
  };
}

export function getMcpStatus(): { tool: string; configured: boolean }[] {
  return MCP_TOOLS.map((t) => {
    try {
      const mcpPath = path.join(t.dir, "mcp.json");
      if (!fs.existsSync(mcpPath)) return { tool: t.name, configured: false };
      const config = JSON.parse(fs.readFileSync(mcpPath, "utf-8"));
      return { tool: t.name, configured: !!config.mcpServers?.["memory-forge"] };
    } catch {
      return { tool: t.name, configured: false };
    }
  });
}
