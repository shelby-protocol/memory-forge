/**
 * 本地 Markdown 存储。
 *
 * 新格式:
 *   ~/.memory-forge/projects/{project_hash}/memories/{id}.md
 *   ~/.memory-forge/global/memories/{id}.md
 *
 * 旧格式 (向后兼容):
 *   ~/.memory-forge/memories/{id}.md
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { randomUUID } from "node:crypto";
import type { Memory } from "../store.js";

const HOMEDIR = os.homedir();
const MEMORYFORGE_ROOT = process.env.MEMORYFORGE_HOME ?? path.join(HOMEDIR, ".memory-forge");

/** 旧格式目录（向后兼容） */
export const LEGACY_BASEDIR = path.join(MEMORYFORGE_ROOT, "memories");

/** 项目记忆目录: ~/.memory-forge/projects/{hash}/memories/ */
export function projectBasedir(projectHash: string): string {
  return path.join(MEMORYFORGE_ROOT, "projects", projectHash, "memories");
}

/** 全局记忆目录: ~/.memory-forge/global/memories/ */
export const GLOBAL_BASEDIR = path.join(MEMORYFORGE_ROOT, "global", "memories");

/** Atomic write: write to temp file, sync, rename (rename is atomic on all major FS). */
function atomicWriteSync(filepath: string, content: string): void {
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(os.tmpdir(), `.mf-atomic-${randomUUID()}`);
  fs.writeFileSync(tmpPath, content);
  fs.renameSync(tmpPath, filepath);
}

/** Detect if legacy format memories exist (flat dir, no project layout). */
export function hasLegacyMemories(): boolean {
  return (
    fs.existsSync(LEGACY_BASEDIR) && fs.readdirSync(LEGACY_BASEDIR).some((f) => f.endsWith(".md"))
  );
}

/** Build markdown content for a memory file */
function serializeMemory(memory: Memory): string {
  const vectorStr = memory.vector?.length ? `> vector: ${JSON.stringify(memory.vector)}` : null;
  const projectLine = memory.project_id ? `> project_id: ${memory.project_id}` : null;
  const projectNameLine = memory.project_name ? `> project_name: ${memory.project_name}` : null;
  const scopeLine = memory.scope ? `> scope: ${memory.scope}` : null;
  const lines = [
    `# ${memory.name}`,
    `> category: ${memory.category}`,
    `> tags: ${JSON.stringify(memory.tags)}`,
    `> priority: ${memory.priority}`,
    `> created: ${memory.created_at}`,
    `> access_count: ${memory.access_count}`,
    `> last_accessed: ${memory.last_accessed ?? ""}`,
    ...(projectLine ? [projectLine] : []),
    ...(projectNameLine ? [projectNameLine] : []),
    ...(scopeLine ? [scopeLine] : []),
    ...(vectorStr ? [vectorStr] : []),
    ``,
    memory.content,
  ];
  return lines.join("\n");
}

/**
 * Save a memory to the correct directory based on project_id.
 * project_id set → projects/{hash}/memories/
 * project_id null → global/memories/
 * no project_id at all → legacy memeries/ (old format, backward compat)
 */
export function saveMemory(memory: Memory): void {
  const content = serializeMemory(memory);
  let targetDir: string;

  if (memory.project_id) {
    targetDir = projectBasedir(memory.project_id);
  } else {
    targetDir = GLOBAL_BASEDIR;
  }

  atomicWriteSync(path.join(targetDir, `${memory.id}.md`), content);
}

/** Load all memories from a single directory */
function loadFromDir(dir: string): Memory[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => parseMemoryFile(path.join(dir, f)))
    .filter((m): m is Memory => m !== null);
}

/**
 * Load memories: project-specific + global.
 * Also checks legacy dir for old-format memories.
 */
export function loadAllMemories(projectHash?: string | null): Memory[] {
  const results: Memory[] = [];

  // 1. Load global memories (always included)
  results.push(...loadFromDir(GLOBAL_BASEDIR));

  // 2. Load project-specific memories
  if (projectHash) {
    results.push(...loadFromDir(projectBasedir(projectHash)));
  } else {
    // Load all project dirs
    const projectsRoot = path.join(MEMORYFORGE_ROOT, "projects");
    if (fs.existsSync(projectsRoot)) {
      for (const dir of fs.readdirSync(projectsRoot)) {
        const memoriesDir = path.join(projectsRoot, dir, "memories");
        results.push(...loadFromDir(memoriesDir));
      }
    }
  }

  // 3. Legacy: load old-format memories (no project_id)
  if (fs.existsSync(LEGACY_BASEDIR)) {
    results.push(...loadFromDir(LEGACY_BASEDIR));
  }

  return results;
}

/** Load only global memories */
export function loadGlobalMemories(): Memory[] {
  return loadFromDir(GLOBAL_BASEDIR);
}

/** Load only memories for a specific project */
export function loadProjectMemories(projectHash: string): Memory[] {
  return loadFromDir(projectBasedir(projectHash));
}

export function parseMemoryFile(filepath: string): Memory | null {
  try {
    const content = fs.readFileSync(filepath, "utf-8");
    const id = path.basename(filepath, ".md");
    const lines = content.split("\n");

    // Parse YAML-like frontmatter
    let name = id;
    let category = "general";
    let tags: string[] = [];
    let priority = 5;
    let created = new Date().toISOString();
    let accessCount = 0;
    let lastAccessed: string | null = null;
    let vector: number[] = [];
    let projectId: string | undefined;
    let projectName: string | undefined;
    let scope: "project" | "global" | undefined;
    let bodyStart = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith("# ")) {
        name = line.slice(2);
        continue;
      }
      if (line.startsWith("> category:")) {
        category = line.slice(12).trim();
        continue;
      }
      if (line.startsWith("> project_id:")) {
        projectId = line.slice(14).trim() || undefined;
        continue;
      }
      if (line.startsWith("> project_name:")) {
        projectName = line.slice(16).trim() || undefined;
        continue;
      }
      if (line.startsWith("> scope:")) {
        const rawScope = line.slice(8).trim();
        if (rawScope === "project" || rawScope === "global") scope = rawScope;
        continue;
      }
      if (line.startsWith("> tags:")) {
        const raw = line.slice(8).trim();
        if (raw.startsWith("[")) {
          try {
            tags = JSON.parse(raw);
          } catch {
            tags = [];
          }
        } else {
          tags = raw
            .split(",")
            .map((t: string) => t.trim())
            .filter(Boolean);
        }
        continue;
      }
      if (line.startsWith("> priority:")) {
        priority = parseInt(line.slice(12).trim(), 10) || 5;
        continue;
      }
      if (line.startsWith("> created:")) {
        created = line.slice(11).trim();
        continue;
      }
      if (line.startsWith("> access_count:")) {
        accessCount = parseInt(line.slice(16).trim(), 10) || 0;
        continue;
      }
      if (line.startsWith("> last_accessed:")) {
        lastAccessed = line.slice(17).trim() || null;
        continue;
      }
      if (line.startsWith("> vector:")) {
        try {
          const arr = JSON.parse(line.slice(10).trim());
          if (Array.isArray(arr)) vector = arr.map(Number).filter((n) => isFinite(n) && !isNaN(n));
        } catch {
          /* ignore corrupt vector */
        }
        continue;
      }
      if (line === "" && i + 1 < lines.length) {
        bodyStart = i + 1;
        break;
      }
    }

    const body = lines.slice(bodyStart).join("\n").trim();

    return {
      id,
      name: name || id,
      content: body,
      category,
      tags,
      priority,
      vector,
      created_at: created,
      access_count: accessCount,
      last_accessed: lastAccessed,
      project_id: projectId,
      project_name: projectName,
      scope,
    };
  } catch {
    return null;
  }
}

export function deleteMemoryFile(id: string): void {
  // Try legacy dir, global dir, and all project dirs
  const candidates: string[] = [];
  if (fs.existsSync(LEGACY_BASEDIR)) candidates.push(path.join(LEGACY_BASEDIR, `${id}.md`));
  if (fs.existsSync(GLOBAL_BASEDIR)) candidates.push(path.join(GLOBAL_BASEDIR, `${id}.md`));
  const projectsRoot = path.join(MEMORYFORGE_ROOT, "projects");
  if (fs.existsSync(projectsRoot)) {
    for (const dir of fs.readdirSync(projectsRoot)) {
      candidates.push(path.join(projectsRoot, dir, "memories", `${id}.md`));
    }
  }
  for (const filepath of candidates) {
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      addTombstone(id);
      return;
    }
  }
}

// --- Tombstone: prevent deleted memories from resurrecting on Pro sync ---

const TOMBSTONE_DIR = path.join(
  process.env.MEMORYFORGE_HOME ?? path.join(HOMEDIR, ".memory-forge"),
);
const TOMBSTONE_PATH = path.join(TOMBSTONE_DIR, "tombstones.json");
const TOMBSTONE_TTL_DAYS = 90;

interface Tombstone {
  id: string;
  deleted_at: string;
}

function addTombstone(id: string): void {
  const tombstones = loadTombstonesRaw();
  // Dedup: skip if already tombstoned
  if (tombstones.some((t) => t.id === id)) return;
  tombstones.push({ id, deleted_at: new Date().toISOString() });
  if (!fs.existsSync(MEMORYFORGE_ROOT)) fs.mkdirSync(MEMORYFORGE_ROOT, { recursive: true });
  try {
    fs.writeFileSync(TOMBSTONE_PATH, JSON.stringify(tombstones, null, 2));
  } catch {
    // Non-fatal — tombstone is best-effort
  }
}

function loadTombstonesRaw(): Tombstone[] {
  try {
    if (fs.existsSync(TOMBSTONE_PATH)) {
      const raw = fs.readFileSync(TOMBSTONE_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch {
    // Corrupted — reset
  }
  return [];
}

/** Get set of tombstoned memory IDs (active only, within TTL) */
export function getTombstonedIds(): Set<string> {
  const cutoff = new Date(Date.now() - TOMBSTONE_TTL_DAYS * 86400000);
  return new Set(
    loadTombstonesRaw()
      .filter((t) => new Date(t.deleted_at) > cutoff)
      .map((t) => t.id),
  );
}

/** Purge expired tombstones (called from Stop hook / Pro sync) */
// ─── Cross-Process File Locking ─────────────────────────────────
// Uses mkdir atomicity (works on all major FS: NTFS, APFS, ext4).
// Locks protect syncAll() and saveMemory() from concurrent writes
// by separate processes (e.g., PreCompact hook + Stop hook).

const LOCKS_DIR = path.join(MEMORYFORGE_ROOT, ".locks");
const SYNC_LOCK = "sync.lock";

/**
 * Acquire an advisory lock. Returns true if lock was acquired, false if
 * another process holds it (after waiting up to timeoutMs).
 *
 * Uses mkdir which is atomic on all major file systems.
 * Stale lock detection: if the owning PID is dead, the lock is removed.
 */
export function acquireSyncLock(timeoutMs: number = 10_000): boolean {
  const lockDir = path.join(LOCKS_DIR, SYNC_LOCK);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      if (!fs.existsSync(LOCKS_DIR)) fs.mkdirSync(LOCKS_DIR, { recursive: true });
      fs.mkdirSync(lockDir);
      // Write PID to help stale detection
      fs.writeFileSync(path.join(lockDir, "pid"), String(process.pid));
      fs.writeFileSync(path.join(lockDir, "hostname"), os.hostname());
      fs.writeFileSync(path.join(lockDir, "timestamp"), new Date().toISOString());
      return true;
    } catch (err: any) {
      if (err?.code === "EEXIST" || err?.code === "EPERM") {
        // Lock exists — check if stale
        if (_isLockStale(lockDir)) {
          try {
            fs.rmSync(lockDir, { recursive: true, force: true });
          } catch {
            /* retry */
          }
          continue;
        }
        // Lock is active — wait and retry
        const wait = Math.min(200, deadline - Date.now());
        if (wait > 0) _sleep(wait);
      } else {
        // Unexpected error — assume we can't lock
        return false;
      }
    }
  }

  return false; // timeout
}

function _sleep(ms: number): void {
  // Busy-wait is acceptable here — max wait is 200ms and this
  // only runs during lock contention (PreCompact/Stop race).
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* spin */
  }
}

function _isLockStale(lockDir: string): boolean {
  try {
    const pidFile = path.join(lockDir, "pid");
    if (!fs.existsSync(pidFile)) return true;
    const pid = parseInt(fs.readFileSync(pidFile, "utf-8"), 10);
    if (!pid || isNaN(pid)) return true;
    try {
      process.kill(pid, 0); // signal 0 just checks existence
      return false; // process is alive
    } catch (e: any) {
      // ESRCH on Unix, or general error on Windows for dead PID
      return e?.code === "ESRCH" || !_isPidAlive(pid);
    }
  } catch {
    return true; // corrupted lock — safe to remove
  }
}

function _isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Release a previously acquired lock. */
export function releaseSyncLock(): void {
  const lockDir = path.join(LOCKS_DIR, SYNC_LOCK);
  try {
    if (fs.existsSync(lockDir)) {
      fs.rmSync(lockDir, { recursive: true, force: true });
    }
  } catch {
    /* best-effort */
  }
}

// ─── Sync Checkpoint ────────────────────────────────────────────

const CHECKPOINT_PATH = path.join(MEMORYFORGE_ROOT, ".sync-checkpoint.json");

interface CheckpointEntry {
  path: string;
  mtimeMs: number;
}

/** Save a checkpoint of all current memory files before sync. */
export function saveSyncCheckpoint(): void {
  try {
    const entries: CheckpointEntry[] = [];
    for (const dir of [GLOBAL_BASEDIR]) {
      if (fs.existsSync(dir)) {
        for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".md"))) {
          const fp = path.join(dir, f);
          entries.push({ path: fp, mtimeMs: fs.statSync(fp).mtimeMs });
        }
      }
    }
    const projectsRoot = path.join(MEMORYFORGE_ROOT, "projects");
    if (fs.existsSync(projectsRoot)) {
      for (const projectDir of fs.readdirSync(projectsRoot)) {
        const memDir = path.join(projectsRoot, projectDir, "memories");
        if (fs.existsSync(memDir)) {
          for (const f of fs.readdirSync(memDir).filter((f) => f.endsWith(".md"))) {
            const fp = path.join(memDir, f);
            entries.push({ path: fp, mtimeMs: fs.statSync(fp).mtimeMs });
          }
        }
      }
    }
    if (!fs.existsSync(MEMORYFORGE_ROOT)) fs.mkdirSync(MEMORYFORGE_ROOT, { recursive: true });
    const tmpPath = path.join(os.tmpdir(), `.mf-checkpoint-${process.pid}`);
    fs.writeFileSync(tmpPath, JSON.stringify(entries, null, 2));
    fs.renameSync(tmpPath, CHECKPOINT_PATH);
  } catch {
    /* best-effort */
  }
}

/** Clear the sync checkpoint after successful sync. */
export function clearSyncCheckpoint(): void {
  try {
    if (fs.existsSync(CHECKPOINT_PATH)) fs.unlinkSync(CHECKPOINT_PATH);
  } catch {
    /* best-effort */
  }
}

/** Check if a sync checkpoint exists (indicating a crashed sync). */
export function hasSyncCheckpoint(): boolean {
  return fs.existsSync(CHECKPOINT_PATH);
}

/** Load checkpoint entries for manual recovery. */
export function loadSyncCheckpoint(): CheckpointEntry[] {
  try {
    if (!fs.existsSync(CHECKPOINT_PATH)) return [];
    return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, "utf-8"));
  } catch {
    return [];
  }
}

export function cleanupTombstones(): number {
  const cutoff = new Date(Date.now() - TOMBSTONE_TTL_DAYS * 86400000);
  const all = loadTombstonesRaw();
  const valid = all.filter((t) => new Date(t.deleted_at) > cutoff);
  const removed = all.length - valid.length;
  if (removed > 0) {
    try {
      fs.writeFileSync(TOMBSTONE_PATH, JSON.stringify(valid, null, 2));
    } catch {}
  }
  return removed;
}
