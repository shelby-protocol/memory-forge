import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

const mockHookStatus = vi.hoisted(() => ({
  sessionStart: true,
  stop: true,
  preCompact: true,
  postToolUse: true,
}));

vi.mock("../src/hooks/install.js", () => ({
  installHooks: vi.fn().mockReturnValue(true),
  installMcpServers: vi.fn().mockReturnValue({
    installed: ["Claude Code"],
    updated: ["Cursor"],
  }),
  getHooksStatus: vi.fn().mockReturnValue(mockHookStatus),
  getMcpStatus: vi.fn().mockReturnValue([
    { tool: "Claude Code", configured: true },
    { tool: "Codex", configured: false },
  ]),
}));
vi.mock("../src/migrate/import.js", () => ({
  importRules: vi
    .fn()
    .mockReturnValue([{ source: "CLAUDE.md", key: "coding-style", content: "Use tabs" }]),
  rulesToMemories: vi.fn().mockReturnValue([
    {
      id: "rule-1",
      name: "Coding Style",
      content: "Use tabs",
      category: "user-preference",
      tags: ["coding-style"],
      priority: 5,
      vector: [],
      created_at: new Date().toISOString(),
      access_count: 0,
      last_accessed: null,
    },
  ]),
}));
vi.mock("../src/embedding.js", () => ({
  preload: vi.fn(),
}));
vi.mock("../src/storage/local.js", () => ({
  saveMemory: vi.fn(),
}));
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

// Suppress console output during test
const origLog = console.log;
beforeAll(() => {
  console.log = vi.fn();
});
afterAll(() => {
  console.log = origLog;
});

import { setup } from "../src/setup.js";

describe("setup", () => {
  it("completes without throwing", async () => {
    await expect(setup()).resolves.toBeUndefined();
  });
});
