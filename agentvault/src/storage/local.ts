/**
 * 本地 Markdown 存储: ~/.memory-forge/memories/{id}.md
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Memory } from "../store.js";

const BASE = path.join(
  process.env.MEMORYFORGE_HOME ?? path.join(requireHome(), ".memory-forge"),
  "memories"
);

function requireHome(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? "/tmp";
}

function ensureDir(): void {
  if (!fs.existsSync(BASE)) {
    fs.mkdirSync(BASE, { recursive: true });
  }
}

export function saveMemory(memory: Memory): void {
  ensureDir();
  const vectorStr = memory.vector?.length
    ? `> vector: ${JSON.stringify(Array.from(memory.vector))}`
    : null;
  const lines = [
    `# ${memory.name}`,
    `> category: ${memory.category}`,
    `> tags: ${memory.tags.join(", ")}`,
    `> priority: ${memory.priority}`,
    `> created: ${memory.created_at}`,
    `> access_count: ${memory.access_count}`,
    `> last_accessed: ${memory.last_accessed ?? ""}`,
    ...(vectorStr ? [vectorStr] : []),
    ``,
    memory.content,
  ];
  fs.writeFileSync(path.join(BASE, `${memory.id}.md`), lines.join("\n"));
}

export function loadAllMemories(): Memory[] {
  if (!fs.existsSync(BASE)) return [];
  return fs
    .readdirSync(BASE)
    .filter((f) => f.endsWith(".md"))
    .map((f) => parseMemoryFile(path.join(BASE, f)))
    .filter((m): m is Memory => m !== null);
}

function parseMemoryFile(filepath: string): Memory | null {
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
      if (line.startsWith("> tags:")) {
        tags = line.slice(8).trim().split(",").map((t) => t.trim()).filter(Boolean);
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
          if (Array.isArray(arr)) vector = arr.map(Number);
        } catch { /* ignore corrupt vector */ }
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
    };
  } catch {
    return null;
  }
}

export function deleteMemoryFile(id: string): void {
  const filepath = path.join(BASE, `${id}.md`);
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
    addTombstone(id);
  }
}

// --- Tombstone: prevent deleted memories from resurrecting on Pro sync ---

const TOMBSTONE_DIR = path.join(
  process.env.MEMORYFORGE_HOME ?? path.join(requireHome(), ".memory-forge")
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
  ensureDir();
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
      .map((t) => t.id)
  );
}

/** Purge expired tombstones (called from Stop hook / Pro sync) */
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
