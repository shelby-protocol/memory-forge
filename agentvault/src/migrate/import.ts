/**
 * 规则迁移: 自动检测已有规则文件，导入为记忆。
 * 支持 CLAUDE.md / .cursor/rules/*.mdc / .gitconfig / AGENTS.md
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Memory } from "../store.js";
import { autoName } from "../auto/index.js";

export interface ImportedRule {
  source: string;
  key: string;
  content: string;
}

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "/tmp";

const SOURCES: { path: string; category: string; extract: (content: string, filepath: string) => ImportedRule[] }[] = [
  {
    path: path.join(HOME, ".claude", "CLAUDE.md"),
    category: "claude-rules",
    extract: (content, filepath) => {
      const rules: ImportedRule[] = [];
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#") && trimmed.length > 10) {
          rules.push({ source: filepath, key: `claude-rule-${rules.length}`, content: trimmed });
        }
      }
      return rules.slice(0, 20);
    },
  },
  {
    path: path.join(HOME, ".cursor", "rules"),
    category: "cursor-rules",
    extract: (content, filepath) => {
      const rules: ImportedRule[] = [];
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#") && trimmed.length > 10) {
          rules.push({ source: filepath, key: `cursor-${path.basename(filepath)}-${rules.length}`, content: trimmed });
        }
      }
      return rules.slice(0, 20);
    },
  },
  {
    path: path.join(HOME, ".gitconfig"),
    category: "user-info",
    extract: (content) => {
      const rules: ImportedRule[] = [];
      const name = content.match(/name\s*=\s*(.+)/)?.[1];
      const email = content.match(/email\s*=\s*(.+)/)?.[1];
      if (name) rules.push({ source: "~/.gitconfig", key: "git-user-name", content: `Git user name: ${name.trim()}` });
      if (email) rules.push({ source: "~/.gitconfig", key: "git-user-email", content: `Git user email: ${email.trim()}` });
      return rules;
    },
  },
];

export function importRules(): ImportedRule[] {
  const allRules: ImportedRule[] = [];

  for (const source of SOURCES) {
    try {
      const stat = fs.statSync(source.path);
      if (stat.isDirectory()) {
        const files = fs.readdirSync(source.path).filter((f) => f.endsWith(".md") || f.endsWith(".mdc"));
        for (const file of files) {
          const filepath = path.join(source.path, file);
          const content = fs.readFileSync(filepath, "utf-8");
          allRules.push(...source.extract(content, filepath));
        }
      } else if (stat.isFile()) {
        const content = fs.readFileSync(source.path, "utf-8");
        allRules.push(...source.extract(content, source.path));
      }
    } catch {
      // File doesn't exist — skip
    }
  }

  return allRules;
}

export function rulesToMemories(rules: ImportedRule[]): Memory[] {
  return rules.map((r) => ({
    id: randomUUID(),
    name: autoName(r.content),
    content: r.content,
    category: r.source.includes(".cursor") ? "cursor-rules" : r.source.includes(".gitconfig") ? "user-info" : "claude-rules",
    tags: [r.source.split("/").pop()?.replace(/\..*/, "") ?? "imported"],
    priority: 7,
    vector: [],
    created_at: new Date().toISOString(),
    access_count: 0,
    last_accessed: null,
  }));
}
