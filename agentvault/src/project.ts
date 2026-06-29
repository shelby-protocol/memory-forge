/**
 * 项目身份推导引擎: 11层优先级链。
 *
 * 用于跨客户端检测当前工作项目，生成稳定的 project_hash。
 * Agent 驱动的 project 参数优先，Server 端环境变量回退。
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, basename, resolve, dirname } from "node:path";
import { createHash } from "node:crypto";

/** 规范化后的项目身份 */
export interface ProjectIdentity {
  hash: string;
  name: string;
  /** 检测来源，用于调试 */
  source: string;
}

/** 稳定的 SHA-256 哈希 */
function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

/** 获取 git remote origin URL */
function getGitRemote(startDir?: string): string | null {
  try {
    const cwd = startDir || process.cwd();
    const remote = execSync("git remote get-url origin", {
      encoding: "utf-8",
      timeout: 2000,
      cwd,
    }).trim();
    return remote || null;
  } catch {
    return null;
  }
}

/**
 * 规范化 git URL。
 * SSH:   git@github.com:user/repo.git
 * HTTPS: https://github.com/user/repo.git
 * 两者规范化后 → github.com/user/repo
 */
export function normalizeGitUrl(url: string): string {
  let normalized = url.trim();
  normalized = normalized.replace(/\.git$/, "");
  const scpMatch = normalized.match(/^git@([^:]+):(.+)$/);
  if (scpMatch) {
    return `${scpMatch[1]}/${scpMatch[2]}`;
  }
  const httpsMatch = normalized.match(/^https?:\/\/([^\/]+)\/(.+)$/);
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`;
  }
  const sshMatch = normalized.match(/^ssh:\/\/git@([^\/]+)\/(.+)$/);
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`;
  }
  return normalized;
}

/** 从 git remote 推导项目名 */
function projectNameFromGitUrl(url: string): string {
  const normalized = normalizeGitUrl(url);
  const parts = normalized.split("/");
  return parts[parts.length - 1] || normalized;
}

/** 获取 git 根目录 */
function findGitRoot(startDir: string): string | null {
  try {
    return (
      execSync("git rev-parse --show-toplevel", {
        encoding: "utf-8",
        timeout: 2000,
        cwd: startDir,
      }).trim() || null
    );
  } catch {
    return null;
  }
}

/** 向上查找 .project-id marker 文件 */
function findProjectMarker(startDir: string): string | null {
  let dir = resolve(startDir);
  const root = process.platform === "win32" ? dir.match(/^[A-Z]:\\/)?.[0] || "C:\\" : "/";
  while (dir !== root && dir !== dirname(dir)) {
    const markerPath = join(dir, ".project-id");
    if (existsSync(markerPath)) {
      try {
        return readFileSync(markerPath, "utf-8").trim() || null;
      } catch {
        return null;
      }
    }
    dir = dirname(dir);
  }
  return null;
}

/** 从路径推导项目名 */
function deriveProjectName(hash: string, hint?: string): string {
  if (hint) return hint;
  return hash.slice(0, 8);
}

/**
 * 核心函数：推导当前项目身份。
 * 11 层优先级链，返回 { hash, name, source } 或 null（global-only）。
 */
export function resolveProject(cwdOverride?: string): ProjectIdentity | null {
  const cwd = cwdOverride || process.cwd();

  // ─── 优先级 0: 用户显式设置 ──────────────────────────
  const mfProject = process.env.MF_PROJECT;
  const mfHash = process.env.MF_PROJECT_HASH;
  if (mfHash) {
    const name = mfProject || deriveProjectName(mfHash);
    return { hash: mfHash, name, source: "env:MF_PROJECT_HASH" };
  }
  if (mfProject) {
    return { hash: sha256(`mf-project:${mfProject}`), name: mfProject, source: "env:MF_PROJECT" };
  }

  // ─── 优先级 1: git remote origin (规范化) ─────────────
  const gitRemote = getGitRemote(cwd);
  if (gitRemote) {
    const normalized = normalizeGitUrl(gitRemote);
    const name = projectNameFromGitUrl(gitRemote);
    return { hash: sha256(normalized), name, source: "git-remote" };
  }

  // ─── 优先级 2: CLAUDE_PROJECT_DIR (Claude Code) ──────
  if (process.env.CLAUDE_PROJECT_DIR) {
    const dir = process.env.CLAUDE_PROJECT_DIR;
    const name = basename(dir);
    return { hash: sha256(dir), name, source: "CLAUDE_PROJECT_DIR" };
  }

  // ─── 优先级 3: CODEX_WORKSPACE_ROOT (Codex, 懒捕获) ──
  if (process.env.CODEX_WORKSPACE_ROOT) {
    const dir = process.env.CODEX_WORKSPACE_ROOT;
    const name = basename(dir);
    return { hash: sha256(dir), name, source: "CODEX_WORKSPACE_ROOT" };
  }

  // ─── 优先级 4: WORKSPACE_FOLDER_PATHS (Cursor) ────────
  if (process.env.WORKSPACE_FOLDER_PATHS) {
    const dir = process.env.WORKSPACE_FOLDER_PATHS.split(",")[0].trim();
    const name = basename(dir);
    return { hash: sha256(dir), name, source: "WORKSPACE_FOLDER_PATHS" };
  }

  // ─── 优先级 5: PWD (Windsurf / shell) ─────────────────
  if (process.env.PWD) {
    const dir = process.env.PWD;
    if (dir !== "/" && dir !== process.env.HOME) {
      const gitRoot = findGitRoot(dir);
      if (gitRoot) {
        const name = basename(gitRoot);
        return { hash: sha256(gitRoot), name, source: "PWD+git" };
      }
      const name = basename(dir);
      return { hash: sha256(dir), name, source: "PWD" };
    }
  }

  // ─── 优先级 6: VSCODE_CWD (VS Code) ───────────────────
  if (process.env.VSCODE_CWD) {
    const dir = process.env.VSCODE_CWD;
    const name = basename(dir);
    return { hash: sha256(dir), name, source: "VSCODE_CWD" };
  }

  // ─── 优先级 7: git rev-parse (从 cwd 查找) ────────────
  const gitRoot = findGitRoot(cwd);
  if (gitRoot && gitRoot !== "/" && gitRoot !== process.env.HOME) {
    const name = basename(gitRoot);
    return { hash: sha256(gitRoot), name, source: "git-root" };
  }

  // ─── 优先级 8: process.cwd() (CLI 客户端) ─────────────
  if (cwd !== "/" && cwd !== process.env.HOME) {
    const name = basename(cwd);
    return { hash: sha256(cwd), name, source: "cwd" };
  }

  // ─── 优先级 9: .project-id marker 文件 ─────────────────
  const markerId = findProjectMarker(cwd);
  if (markerId) {
    const name = basename(cwd);
    return { hash: sha256(markerId), name, source: "project-id-file" };
  }

  // ─── 完全检测不到 → global-only ─────────────────
  return null;
}

/**
 * 获取 global-only 模式的引导提示。
 */
export function getGlobalModeHint(): string {
  const lines = [
    "[MemoryForge] ⚠️  No project detected. Working in global-only mode.",
    "[MemoryForge]    All memories will be stored as global (cross-project).",
    "[MemoryForge]    To enable project isolation, set MF_PROJECT in your MCP config:",
    '[MemoryForge]    { "env": { "MF_PROJECT": "your-project-name" } }',
    "[MemoryForge]    Or create a .project-id file in your project root.",
    "[MemoryForge]    Supported clients: Claude Code (auto), Cursor (auto), Codex CLI (auto).",
    "[MemoryForge]    Windsurf & Codex VS Code users: set MF_PROJECT manually.",
  ];
  return lines.join("\n");
}
