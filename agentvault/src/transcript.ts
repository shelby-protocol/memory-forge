/**
 * Transcript auto-capture: reads Claude Code session JSONL and extracts
 * conversation as a memory. Run from SessionEnd hook or CLI.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { saveMemory, loadAllMemories, deleteMemoryFile } from "./storage/local.js";
import type { Memory } from "./store.js";
import { safeTruncate } from "./store.js";

const PROJECTS_DIR = path.join(process.env.HOME ?? process.env.USERPROFILE ?? "/tmp", ".claude", "projects");

const MAX_MEMORY_CHARS = 100_000;
const MAX_SESSION_AGE_MS = 24 * 60 * 60 * 1000; // 24h — ignore stale JSONL files
const SAME_SESSION_WINDOW_MS = 30 * 60 * 1000; // 30min — same session dedup

/** Derive project slug from CWD so we scope to the right project directory. */
function currentProjectSlug(): string {
  const cwd = process.cwd();
  // Claude Code names project dirs as D--path or C--path (drive letter → root)
  const normalized = cwd
    .replace(/^([A-Za-z]):\\/, "$1--") // Windows: D:\foo → D--\foo
    .replace(/^([A-Za-z]):/, "$1--") // Git Bash: D:/foo → D--/foo
    .replace(/\\/g, "-") // backslash → dash
    .replace(/\//g, "-"); // forward slash → dash
  return normalized.replace(/^-+/, ""); // trim leading dashes
}

export function captureTranscript(): string {
  const filePath = findRecentTranscript();
  if (!filePath) return "No recent transcript found.";

  const sessionId = path.basename(filePath, ".jsonl");

  // Skip if we already captured THIS session's transcript recently
  if (alreadyCaptured(sessionId)) return "Transcript already captured (dedup same session).";

  const messages = readTranscript(filePath);
  if (messages.length === 0) return "Transcript empty.";

  const content = formatTranscript(messages, sessionId);
  const memory: Memory = {
    id: randomUUID(),
    name: `Session ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
    content,
    category: "session-transcript",
    tags: ["transcript", "auto-capture", "claude-code"],
    priority: 7,
    vector: [],
    created_at: new Date().toISOString(),
    access_count: 0,
    last_accessed: null,
  };

  // Delete old transcripts for THIS session only (keep transcripts from other sessions)
  for (const m of loadAllMemories()) {
    if (m.category !== "session-transcript") continue;
    if (m.id === memory.id) continue;
    if (m.content?.includes(sessionId)) {
      deleteMemoryFile(m.id);
    }
  }

  saveMemory(memory);
  return `Transcript saved: ${memory.name} (${memory.content.length} chars, ${messages.length} messages)`;
}

/** Avoid duplicate captures of the same session within SAME_SESSION_WINDOW_MS */
function alreadyCaptured(sessionId: string): boolean {
  for (const m of loadAllMemories()) {
    if (m.category !== "session-transcript") continue;
    const age = Date.now() - new Date(m.created_at).getTime();
    // Only block if the SAME session was captured recently
    if (age < SAME_SESSION_WINDOW_MS && m.content?.includes(sessionId)) {
      return true;
    }
  }
  return false;
}

/**
 * Find the most recently modified JSONL, scoped to the CURRENT project directory.
 * Falls back to any project if current project has no recent transcript.
 */
function findRecentTranscript(): string | null {
  if (!fs.existsSync(PROJECTS_DIR)) return null;

  const projectSlug = currentProjectSlug();
  const currentProjectDir = path.join(PROJECTS_DIR, projectSlug);

  // Try current project first
  let best = findBestInDir(currentProjectDir);
  if (best) return best;

  // Fallback: scan all projects (cross-project / handoff scenarios)
  const dirs = fs.readdirSync(PROJECTS_DIR);
  for (const dir of dirs) {
    if (dir === projectSlug) continue; // already checked
    const fullDir = path.join(PROJECTS_DIR, dir);
    if (!fs.statSync(fullDir).isDirectory()) continue;
    best = findBestInDir(fullDir);
    if (best) return best; // return first fallback hit (most recent is fine)
  }

  return null;
}

function findBestInDir(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;

  let best: { path: string; mtime: number } | null = null;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.mtimeMs > Date.now() - MAX_SESSION_AGE_MS && (!best || stat.mtimeMs > best.mtime)) {
      best = { path: fullPath, mtime: stat.mtimeMs };
    }
  }
  return best?.path ?? null;
}

/** Read and parse a JSONL transcript, extracting user/assistant messages */
function readTranscript(filePath: string): Array<{ role: string; text: string }> {
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim());
  const messages: Array<{ role: string; text: string }> = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      const msg = entry.message;
      if (!msg?.role || !msg?.content) continue;
      if (msg.role !== "user" && msg.role !== "assistant") continue;

      const text = msg.content
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("\n")
        .trim();

      if (text) {
        messages.push({ role: msg.role, text });
      }
    } catch {
      // Skip malformed lines
    }
  }

  return messages;
}

/** Format transcript messages into a readable memory */
function formatTranscript(messages: Array<{ role: string; text: string }>, sessionId: string): string {
  const lines: string[] = [`Session transcript — ${new Date().toISOString()} | session:${sessionId}\n`];
  let charCount = 0;

  for (const msg of messages) {
    const prefix = msg.role === "user" ? "👤 User" : "🤖 Agent";
    let text = msg.text;
    // Truncate long messages for readability
    if (text.length > 2000) {
      const graphemeLen = [...text].length; // grapheme count (emoji/ZWS-safe)
      text = safeTruncate(text, 2000) + `... [truncated, ${graphemeLen} total chars]`;
    }
    const entry = `${prefix}:\n${text}\n`;
    if (charCount + entry.length > MAX_MEMORY_CHARS) {
      lines.push("\n[Transcript truncated at 100KB]");
      break;
    }
    lines.push(entry);
    charCount += entry.length;
  }

  return lines.join("\n");
}

/** CLI entry: memory-forge hook capture-transcript */
export function cliCaptureTranscript(): void {
  const result = captureTranscript();
  console.error(`[MemoryForge] ${result}`);
}
