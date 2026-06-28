import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { installHooks, installMcpServers } from "../src/hooks/install.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "/tmp";
const settingsPath = join(HOME, ".claude", "settings.json");
const mcpPath = join(HOME, ".claude", "mcp.json");

let savedSettings: string | null = null;
let savedMcp: string | null = null;

function cleanConfigs() {
  try {
    unlinkSync(settingsPath);
  } catch {
    /* ok */
  }
  try {
    unlinkSync(mcpPath);
  } catch {
    /* ok */
  }
}

beforeEach(() => {
  try {
    savedSettings = readFileSync(settingsPath, "utf-8");
  } catch {
    savedSettings = null;
  }
  try {
    savedMcp = readFileSync(mcpPath, "utf-8");
  } catch {
    savedMcp = null;
  }
  cleanConfigs();
});

afterEach(() => {
  cleanConfigs();
  if (savedSettings) {
    const dir = join(HOME, ".claude");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(settingsPath, savedSettings);
  }
  if (savedMcp) {
    const dir = join(HOME, ".claude");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(mcpPath, savedMcp);
  }
});

describe("installHooks", () => {
  it("creates settings.json with all 4 hook types", () => {
    expect(installHooks()).toBe(true);
    const config = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(config.hooks.SessionStart).toBeDefined();
    expect(config.hooks.Stop).toBeDefined();
    expect(config.hooks.PostToolUse).toBeDefined();
    expect(config.hooks.PreCompact).toBeDefined();
  });

  it("uses npx memory-forge in every hook command", () => {
    installHooks();
    const config = JSON.parse(readFileSync(settingsPath, "utf-8"));
    for (const key of ["SessionStart", "Stop", "PostToolUse", "PreCompact"]) {
      const cmd = config.hooks[key][0].hooks[0].command;
      expect(cmd).toContain("npx memory-forge");
    }
  });

  it("replaces stale bare command (setHook overwrites, not appends)", () => {
    const dir = join(HOME, ".claude");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: { Stop: [{ hooks: [{ type: "command", command: "memory-forge hook stop" }] }] },
      }),
    );
    installHooks();
    const config = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(config.hooks.Stop.length).toBe(1);
    expect(config.hooks.Stop[0].hooks[0].command).toBe("npx memory-forge hook stop");
  });

  it("preserves unrelated existing hooks", () => {
    const dir = join(HOME, ".claude");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          PostToolUse: [
            {
              matcher: "Edit|Write",
              hooks: [{ type: "command", command: "npx prettier --write" }],
            },
          ],
        },
      }),
    );
    installHooks();
    const config = JSON.parse(readFileSync(settingsPath, "utf-8"));
    const hasMF = config.hooks.PostToolUse.some((h: any) =>
      h.hooks?.some((inner: any) => inner.command?.includes("memory-forge")),
    );
    const hasPrettier = config.hooks.PostToolUse.some((h: any) =>
      h.hooks?.some((inner: any) => inner.command?.includes("prettier")),
    );
    expect(hasMF).toBe(true);
    expect(hasPrettier).toBe(true);
  });

  it("handles fresh install with no existing settings.json", () => {
    // cleanConfigs already removed settings.json
    expect(installHooks()).toBe(true);
    const config = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(config.hooks).toBeDefined();
  });
});

describe("installMcpServers", () => {
  it("creates mcp.json with npx memory-forge", () => {
    const dir = join(HOME, ".claude");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const result = installMcpServers();
    expect(result.updated).toContain("Claude Code");
    const config = JSON.parse(readFileSync(mcpPath, "utf-8"));
    expect(config.mcpServers["memory-forge"].command).toBe("npx memory-forge");
  });

  it("skips when already configured", () => {
    const dir = join(HOME, ".claude");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(
      mcpPath,
      JSON.stringify({
        mcpServers: { "memory-forge": { command: "npx memory-forge" } },
      }),
    );
    const result = installMcpServers();
    expect(result.installed).toContain("Claude Code");
    expect(result.updated).not.toContain("Claude Code");
  });
});
