/**
 * Transcript auto-capture: reads Claude Code session JSONL and extracts
 * conversation as a memory. Run from SessionEnd hook or CLI.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { saveMemory } from "./storage/local.js";
import type { Memory } from "./store.js";

const PROJECTS_DIR = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? "/tmp",
  ".claude",
  "projects"
);

const MAX_MEMORY_CHARS = 100_000; // cap transcript at 100KB to avoid giant memories

export function captureTranscript(): string {
  const filePath = findRecentTranscript();
  if (!filePath) return "No recent transcript found.";

  const messages = readTranscript(filePath);
  if (messages.length === 0) return "Transcript empty.";

  const content = formatTranscript(messages);
  const memory: Memory = {
    id: randomUUID(),
    name: `Session ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
    content,
    category: "session-transcript",
    tags: ["transcript", "auto-capture", "claude-code"],
    priority: 9,
    vector: [],
    created_at: new Date().toISOString(),
    access_count: 0,
    last_accessed: null,
  };

  saveMemory(memory);
  return `Transcript saved: ${memory.name} (${memory.content.length} chars, ${messages.length} messages)`;
}

/** Find the most recently modified JSONL in any project directory */
function findRecentTranscript(): string | null {
  if (!fs.existsSync(PROJECTS_DIR)) return null;

  let best: { path: string; mtime: number } | null = null;

  const dirs = fs.readdirSync(PROJECTS_DIR);
  for (const dir of dirs) {
    const fullDir = path.join(PROJECTS_DIR, dir);
    if (!fs.statSync(fullDir).isDirectory()) continue;

    const files = fs.readdirSync(fullDir).filter((f) => f.endsWith(".jsonl"));
    for (const file of files) {
      const fullPath = path.join(fullDir, file);
      const stat = fs.statSync(fullPath);
      if (stat.mtimeMs > Date.now() - 86400000 && (!best || stat.mtimeMs > best.mtime)) { // last 24h
        best = { path: fullPath, mtime: stat.mtimeMs };
      }
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
function formatTranscript(messages: Array<{ role: string; text: string }>): string {
  const lines: string[] = [`Session transcript — ${new Date().toISOString()}\n`];
  let charCount = 0;

  for (const msg of messages) {
    const prefix = msg.role === "user" ? "👤 User" : "🤖 Agent";
    let text = msg.text;
    // Truncate long messages for readability
    if (text.length > 2000) {
      text = text.slice(0, 2000) + `... [truncated, ${msg.text.length} total chars]`;
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
