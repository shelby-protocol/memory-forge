import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { installHooks, getHooksStatus } from "../src/hooks/install.js";
import { importRules, rulesToMemories } from "../src/migrate/import.js";

const home = os.homedir();
const settingsPath = path.join(home, ".claude", "settings.json");
const origExists = fs.existsSync(settingsPath);
const origBackup = origExists ? fs.readFileSync(settingsPath, "utf-8") : null;

afterAll(() => {
  if (origBackup) {
    fs.writeFileSync(settingsPath, origBackup);
  } else if (!origExists) {
    try {
      fs.unlinkSync(settingsPath);
    } catch {}
  }
});

describe("installHooks", () => {
  it("installHooks returns boolean", () => {
    expect(typeof installHooks()).toBe("boolean");
  });

  it("settings.json created after install", () => {
    expect(fs.existsSync(settingsPath)).toBe(true);
  });

  it("settings.json is valid JSON", () => {
    JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  });

  it("settings has hooks section", () => {
    const config = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    expect(config.hooks).toBeDefined();
  });

  it("SessionStart hook configured", () => {
    const config = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    const hooks = config.hooks?.SessionStart || [];
    const hasMf = hooks.some((h: any) =>
      h.hooks?.some((inner: any) => inner.command?.includes("memory-forge")),
    );
    expect(hasMf).toBe(true);
  });

  it("Stop hook configured", () => {
    const config = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    const hooks = config.hooks?.Stop || [];
    const hasMf = hooks.some((h: any) =>
      h.hooks?.some((inner: any) => inner.command?.includes("memory-forge hook stop")),
    );
    expect(hasMf).toBe(true);
  });

  it("PreCompact hook configured", () => {
    const config = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    const hooks = config.hooks?.PreCompact || [];
    expect(
      hooks.some((h: any) =>
        h.hooks?.some((inner: any) => inner.command?.includes("memory-forge hook pre-compact")),
      ),
    ).toBe(true);
  });

  it("double install does not duplicate hooks", () => {
    installHooks();
    const config = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    const sessionHooks = config.hooks?.SessionStart || [];
    const mfCount = sessionHooks.filter((h: any) =>
      h.hooks?.some((inner: any) => inner.command?.includes("memory-forge")),
    ).length;
    expect(mfCount).toBeLessThanOrEqual(1);
  });

  it("hook type is 'command'", () => {
    const config = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    const mfHook = config.hooks?.SessionStart?.find((h: any) =>
      h.hooks?.some((inner: any) => inner.command?.includes("memory-forge")),
    );
    expect(mfHook?.hooks?.[0]?.type).toBe("command");
  });
});

describe("getHooksStatus", () => {
  it("returns object with 3 booleans", () => {
    const status = getHooksStatus();
    expect(typeof status.sessionStart).toBe("boolean");
    expect(typeof status.stop).toBe("boolean");
    expect(typeof status.preCompact).toBe("boolean");
  });
});

describe("importRules", () => {
  it("returns array", () => {
    expect(Array.isArray(importRules())).toBe(true);
  });

  it("each rule has required fields", () => {
    for (const r of importRules()) {
      expect(typeof r.source).toBe("string");
      expect(typeof r.key).toBe("string");
      expect(typeof r.content).toBe("string");
    }
  });

  it("does not crash", () => {
    importRules();
  });
});

describe("rulesToMemories", () => {
  it("handles empty rules", () => {
    expect(rulesToMemories([])).toHaveLength(0);
  });
});
