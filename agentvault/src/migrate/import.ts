/**
 * 规则迁移: 自动检测已有规则文件，导入为记忆。
 * 支持 CLAUDE.md / .cursor/rules/*.mdc / .gitconfig / AGENTS.md
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Memory } from "../store.js";
import { autoName } from "../auto/index.js";
import { MemoryStore, contentOverlap } from "../store.js";
import { loadAllMemories } from "../storage/local.js";

export interface ImportedRule {
  source: string;
  key: string;
  content: string;
}

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "/tmp";

const SOURCES: {
  path: string;
  category: string;
  extract: (content: string, filepath: string) => ImportedRule[];
}[] = [
  {
    path: path.join(HOME, ".claude", "CLAUDE.md"),
    category: "claude-rules",
    extract: (content, filepath) => {
      // Import entire CLAUDE.md as one memory (not line-by-line)
      if (content.trim().length > 10) {
        return [{ source: filepath, key: "claude-rules", content: content.trim() }];
      }
      return [];
    },
  },
  {
    path: path.join(HOME, ".cursor", "rules"),
    category: "cursor-rules",
    extract: (content, filepath) => {
      // Import entire rule file as one memory (not line-by-line)
      if (content.trim().length > 10) {
        return [
          { source: filepath, key: `cursor-${path.basename(filepath)}`, content: content.trim() },
        ];
      }
      return [];
    },
  },
  {
    path: path.join(HOME, ".gitconfig"),
    category: "user-info",
    extract: (content) => {
      const rules: ImportedRule[] = [];
      const name = content.match(/name\s*=\s*(.+)/)?.[1];
      const email = content.match(/email\s*=\s*(.+)/)?.[1];
      if (name || email) {
        // Merge into single memory — avoids duplicate single-line memories
        const parts: string[] = [];
        if (email) parts.push(`Git user email: ${email.trim()}`);
        if (name) parts.push(`Git user name: ${name.trim()}`);
        rules.push({ source: "~/.gitconfig", key: "git-user-info", content: parts.join("\n") });
      }
      return rules;
    },
  },
];

export function importRules(): ImportedRule[] {
  const allRules: ImportedRule[] = [];

  for (const source of SOURCES) {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(source.path);
    } catch {
      continue; // Source doesn't exist or inaccessible — skip
    }

    if (stat.isDirectory()) {
      const files = fs
        .readdirSync(source.path)
        .filter((f) => f.endsWith(".md") || f.endsWith(".mdc"));
      for (const file of files) {
        const filepath = path.join(source.path, file);
        try {
          const content = fs.readFileSync(filepath, "utf-8");
          allRules.push(...source.extract(content, filepath));
        } catch {
          // Individual file read failed — skip this file, continue with others
        }
      }
    } else if (stat.isFile()) {
      try {
        const content = fs.readFileSync(source.path, "utf-8");
        allRules.push(...source.extract(content, source.path));
      } catch {
        // Source file read failed — skip
      }
    }
  }

  return allRules;
}

export function rulesToMemories(rules: ImportedRule[]): Memory[] {
  // Load existing memories to dedup before import
  const store = new MemoryStore();
  for (const m of loadAllMemories()) store.add(m);

  const result: Memory[] = [];
  for (const r of rules) {
    const memory: Memory = {
      id: randomUUID(),
      name: autoName(r.content),
      content: r.content,
      category: path.basename(r.source).startsWith(".cursor")
        ? "cursor-rules"
        : r.source.includes(".gitconfig")
          ? "user-info"
          : "claude-rules",
      tags: [r.source.split("/").pop()?.replace(/\..*/, "") ?? "imported"],
      priority: 7,
      vector: [],
      created_at: new Date().toISOString(),
      access_count: 0,
      last_accessed: null,
    };
    // Check existing memories for near-duplicate content
    let isDuplicate = false;
    for (const existing of store.list({ limit: 500, offset: 0 })) {
      if (contentOverlap(existing.content, memory.content) > 0.8) {
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) {
      result.push(memory);
      store.add(memory); // track across this batch too
    }
  }
  return result;
}
