import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { normalizeGitUrl } from "../src/project.js";

// Clean up env vars that may leak to other tests
afterAll(() => {
  delete process.env.MF_PROJECT;
  delete process.env.MF_PROJECT_HASH;
  delete process.env.CLAUDE_PROJECT_DIR;
  delete process.env.CODEX_WORKSPACE_ROOT;
  delete process.env.WORKSPACE_FOLDER_PATHS;
  delete process.env.PWD;
  delete process.env.VSCODE_CWD;
});

describe("normalizeGitUrl", () => {
  it("normalizes SSH SCP-style URLs", () => {
    expect(normalizeGitUrl("git@github.com:user/repo.git")).toBe("github.com/user/repo");
  });

  it("normalizes HTTPS URLs", () => {
    expect(normalizeGitUrl("https://github.com/user/repo.git")).toBe("github.com/user/repo");
  });

  it("normalizes ssh:// protocol URLs", () => {
    expect(normalizeGitUrl("ssh://git@gitlab.com/team/project.git")).toBe(
      "gitlab.com/team/project",
    );
  });

  it("handles URLs without .git suffix", () => {
    expect(normalizeGitUrl("https://github.com/user/repo")).toBe("github.com/user/repo");
  });

  it("handles self-hosted GitLab instances", () => {
    expect(normalizeGitUrl("git@gitlab.internal.com:ops/infra.git")).toBe(
      "gitlab.internal.com/ops/infra",
    );
  });

  it("trims whitespace", () => {
    expect(normalizeGitUrl("  git@github.com:user/repo.git  ")).toBe("github.com/user/repo");
  });

  it("converts SSH and HTTPS to same canonical form", () => {
    const ssh = normalizeGitUrl("git@github.com:org/repo.git");
    const https = normalizeGitUrl("https://github.com/org/repo.git");
    expect(ssh).toBe(https);
  });
});

describe("resolveProject", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.MF_PROJECT;
    delete process.env.MF_PROJECT_HASH;
    delete process.env.CLAUDE_PROJECT_DIR;
    delete process.env.CODEX_WORKSPACE_ROOT;
    delete process.env.WORKSPACE_FOLDER_PATHS;
    delete process.env.PWD;
    delete process.env.VSCODE_CWD;
  });

  it("returns null when no project can be detected (root cwd, no env)", async () => {
    const { resolveProject } = await import("../src/project.js");
    const result = resolveProject("/");
    expect(result).toBeNull();
  });

  it("detects from MF_PROJECT env var (with non-git cwd)", async () => {
    process.env.MF_PROJECT = "test-project";
    const { resolveProject } = await import("../src/project.js");
    const result = resolveProject("/nonexistent/path");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("test-project");
    expect(result!.source).toBe("env:MF_PROJECT");
  });

  it("detects from MF_PROJECT_HASH env var", async () => {
    process.env.MF_PROJECT_HASH = "abc123def456";
    process.env.MF_PROJECT = "named-project";
    const { resolveProject } = await import("../src/project.js");
    const result = resolveProject("/nonexistent/path");
    expect(result).not.toBeNull();
    expect(result!.hash).toBe("abc123def456");
    expect(result!.name).toBe("named-project");
  });

  it("detects from cwd when it is a valid non-git path", async () => {
    const { resolveProject } = await import("../src/project.js");
    const result = resolveProject("/home/user/cli-project");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("cli-project");
    expect(result!.source).toBe("cwd");
  });

  it("returns null when cwd is HOME", async () => {
    const home = process.env.HOME || "/home/user";
    const { resolveProject } = await import("../src/project.js");
    const result = resolveProject(home);
    expect(result).toBeNull();
  });
});
