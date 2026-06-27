#!/usr/bin/env node
/**
 * MemoryForge — AI Agent 持久记忆引擎 (MVP)
 *
 * 8 个 MCP 工具 + 5 个后台自动化引擎 + Pro 层 Shelby 云同步。
 * 嵌入: Transformers.js (23MB, 进程内)。
 * 存储: Free 层本地 Markdown; Pro 层 Shelby 云。
 *
 * 一键嵌入:
 *   claude mcp add memory-forge -- npx memory-forge
 */

import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { MemoryStore } from "./store.js";
import { embed, preload } from "./embedding.js";
import { saveMemory, loadAllMemories, deleteMemoryFile, cleanupTombstones } from "./storage/local.js";
import { uploadMemory } from "./storage/shelby.js";
import { autoName, autoMerge, autoPriority, autoDecay, generateContextSummary } from "./auto/index.js";
import { setup } from "./setup.js";
import { pro, syncAll } from "./pro.js";
import { cliCaptureTranscript, captureTranscript } from "./transcript.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8")) as { version: string };

import * as fs from "node:fs";

/** Read stdin synchronously if piped (Claude Code hook), null if TTY (direct CLI). */
function readStdinSync(): string | null {
  try {
    if (process.stdin.isTTY) return null;
    return fs.readFileSync(0, "utf-8").trim() || null;
  } catch {
    return null;
  }
}

// ─── CLI 命令路由 ──────────────────────────────────────────
const cmd = process.argv[2];

if (cmd === "--version" || cmd === "-v") {
  console.log(pkg.version);
  process.exit(0);
} else if (cmd === "setup") {
  setup()
    .then(() => process.exit(0))
    .catch((err) => { console.error(err); process.exit(1); });
  // Don't start MCP server — rely on setup's process.exit
} else if (cmd === "pro") {
  pro()
    .then(() => process.exit(0))
    .catch((err) => { console.error(err); process.exit(1); });
} else if (cmd === "capture-transcript") {
  cliCaptureTranscript();
  process.exit(0);
} else if (cmd === "hook") {
  const hookType = process.argv[3];
  if (hookType === "session-start") {
    // Read stdin for Claude Code hook metadata (cwd, source, session_id)
    let projectSlug = "";
    let projectContextNote = "";
    try {
      const stdinData = readStdinSync();
      if (stdinData) {
        const hookInput = JSON.parse(stdinData);
        if (hookInput.cwd) {
          projectSlug = path.basename(hookInput.cwd);
          // Only add project note if it differs from default (avoids noise for home dir)
          projectContextNote = `\nCurrent project: ${projectSlug}`;
        }
      }
    } catch {
      // stdin not available or not JSON — ignore (called from CLI directly)
    }

    const s = new MemoryStore();
    for (const m of loadAllMemories()) s.add(m);
    const summary = generateContextSummary(s, 5);
    const memoryCount = s.size();
    const sessionTitle = projectSlug
      ? `${projectSlug} (${memoryCount} memories)`
      : `MemoryForge (${memoryCount} memories)`;

    // Output as hookSpecificOutput for silent, token-efficient context injection
    const output = JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: (summary || "[MemoryForge] No memories yet.") + projectContextNote,
        sessionTitle,
      },
    });
    console.log(output);
  } else if (hookType === "stop") {
    const all = loadAllMemories();
    let updated = 0, archived = 0;
    for (const m of all) {
      const newPriority = autoPriority(m);
      const decay = autoDecay(m);
      if (decay === 0) {
        try { deleteMemoryFile(m.id); } catch {}
        archived++;
      } else {
        let changed = false;
        if (newPriority !== m.priority) { m.priority = newPriority; changed = true; }
        if (changed) { try { saveMemory(m); updated++; } catch {} }
      }
    }
    console.error(`[MemoryForge] auto-capture: ${updated} updated, ${archived} archived`);
    // Auto-capture conversation transcript (best-effort, don't crash hook)
    try {
      const transcriptResult = captureTranscript();
      console.error(`[MemoryForge] ${transcriptResult}`);
    } catch (err) {
      console.error(`[MemoryForge] transcript capture failed: ${(err as Error).message}`);
    }
    // Purge expired tombstones
    try { cleanupTombstones(); } catch {}
  } else if (hookType === "pre-compact") {
    const s = new MemoryStore();
    for (const m of loadAllMemories()) s.add(m);
    const summary = generateContextSummary(s, 8);
    console.error(`[MemoryForge] pre-compact: preserving ${s.size()} memories`);

    const preCompactContext = summary +
      "\n\n[MEMORYFORGE AUTO-CAPTURE] Context window is about to compact. " +
      "Use memory_store to save key learnings, decisions, and preferences from this session " +
      "BEFORE continuing. What did you learn about the user? What decisions were made? " +
      "What preferences did you observe?" +
      "\n\n[MEMORYFORGE CROSS-DEVICE] If planning to continue on another machine, remind the user to:\n" +
      "1. git push (code)\n" +
      "2. Exit normally so Stop hook saves the transcript\n" +
      "3. On the other machine: git pull + memory-forge pro (memories)";

    // Silent context injection via hookSpecificOutput
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreCompact",
        additionalContext: preCompactContext,
      },
    }));

    // Safety net: capture transcript now (survives forced terminal close)
    try {
      const preCompactTranscript = captureTranscript();
      if (!preCompactTranscript.includes("already captured")) {
        console.error(`[MemoryForge] ${preCompactTranscript}`);
      }
    } catch (err) {
      console.error(`[MemoryForge] pre-compact transcript capture failed: ${(err as Error).message}`);
    }
  } else if (hookType === "capture-transcript") {
    try {
      const result = captureTranscript();
      console.error(`[MemoryForge] ${result}`);
    } catch (err) {
      console.error(`[MemoryForge] transcript capture failed: ${(err as Error).message}`);
      process.exit(1);
    }
  }
  process.exit(0);
} else {
  // Default: start MCP server
  startMcpServer();
}

// ═══════════════════════════════════════════════════════════════
//  MCP Server
// ═══════════════════════════════════════════════════════════════
function startMcpServer() {
  const store = new MemoryStore();

  for (const m of loadAllMemories()) {
    store.add(m);
  }

  preload();

  const server = new McpServer({ name: "memory-forge", version: pkg.version });

  // ── memory_store ──────────────────────────────────────────
  server.registerTool(
    "memory_store",
    {
      title: "存储记忆",
      description: "存储一条上下文、知识或偏好到持久记忆中。自动向量化以支持语义检索。",
      inputSchema: {
        content: z.string().min(1).describe("要存储的记忆内容。"),
        category: z.string().default("general").describe("分类标签: user-preference, project-context, decision-log, code-pattern。"),
        tags: z.array(z.string()).default([]).describe("标签列表。"),
        priority: z.number().min(1).max(10).default(5).describe("优先级 1-10。"),
      },
    },
    async (params) => {
      const { content, category, tags, priority } = params;
      const vec = await embed(content);
      const name = autoName(content);

      const memory = {
        id: randomUUID(), name, content, category, tags, priority,
        vector: vec ? Array.from(vec) : [],
        created_at: new Date().toISOString(), access_count: 0, last_accessed: null as string | null,
      };

      const merged = await autoMerge(store, memory);
      if (merged) {
        saveMemory(merged);
        return { content: [{ type: "text" as const, text: JSON.stringify({
          success: true, merged: true, memory_id: merged.id, name: merged.name, preview: content.slice(0, 200),
        }) }] };
      }

      saveMemory(memory);
      store.add(memory);

      // Pro: auto-upload to Shelby cloud
      if (process.env.SHELBY_API_KEY) {
        uploadMemory(memory).catch(() => {});
      }

      return { content: [{ type: "text" as const, text: JSON.stringify({
        success: true, memory_id: memory.id, name: memory.name, preview: content.slice(0, 200),
      }) }] };
    }
  );

  // ── memory_search ─────────────────────────────────────────
  server.registerTool(
    "memory_search",
    {
      title: "语义检索记忆",
      description: "通过语义相似度搜索相关记忆。向量模型不可用时自动回退到关键词匹配。",
      inputSchema: {
        query: z.string().describe("自然语言查询。"),
        limit: z.number().min(1).max(20).default(5),
        min_similarity: z.number().min(0).max(1).default(0.6),
        category: z.string().optional(),
        tags: z.array(z.string()).optional(),
      },
    },
    async (params) => {
      const { query, limit, min_similarity, category, tags } = params;
      const vec = await embed(query);
      const results = store.search(query, {
        limit, minSimilarity: min_similarity, category: category ?? null,
        tags: tags ?? null, queryVec: vec ?? undefined,
      });
      for (const r of results) {
        store.touch(r.id);
        const updated = store.get(r.id);
        if (updated) saveMemory(updated);
      }
      return { content: [{ type: "text" as const, text: JSON.stringify({
        query, count: results.length,
        results: results.map((r) => ({
          memory_id: r.id, name: r.name,
          similarity: r.similarity?.toFixed(3) ?? 0, content: r.content,
          _method: r._fallback || "vector",
        })),
        hint: results.length === 0 ? "No relevant memories found." : null,
      }) }] };
    }
  );

  // ── memory_recall ─────────────────────────────────────────
  server.registerTool(
    "memory_recall",
    {
      title: "精确获取记忆",
      description: "通过 memory_id 精确获取一条记忆的完整内容。",
      inputSchema: { memory_id: z.string().describe("记忆 ID。") },
    },
    async (params) => {
      const { memory_id } = params;
      const memory = store.get(memory_id);
      if (!memory) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Not found", memory_id }) }] };
      store.touch(memory_id);
      saveMemory(memory);
      return { content: [{ type: "text" as const, text: JSON.stringify({
        memory_id: memory.id, name: memory.name, content: memory.content,
        category: memory.category, tags: memory.tags, priority: memory.priority,
        created_at: memory.created_at, access_count: memory.access_count,
      }) }] };
    }
  );

  // ── memory_list ───────────────────────────────────────────
  server.registerTool(
    "memory_list",
    {
      title: "List memories",
      description: "List memories with category and tag filtering, pagination, and full metadata.",
      inputSchema: {
        category: z.string().optional(),
        tags: z.array(z.string()).optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      },
    },
    async (params) => {
      const { category, tags, limit, offset } = params;
      const memories = store.list({ category: category ?? null, tags: tags ?? null, limit, offset });
      return { content: [{ type: "text" as const, text: JSON.stringify({
        total: store.size(), count: memories.length,
        memories: memories.map((m) => ({
          memory_id: m.id, name: m.name, category: m.category,
          tags: m.tags, priority: m.priority, access_count: m.access_count,
          created_at: m.created_at, last_accessed: m.last_accessed,
          preview: m.content.slice(0, 200),
        })),
      }) }] };
    }
  );

  // ── memory_forget ─────────────────────────────────────────
  server.registerTool(
    "memory_forget",
    {
      title: "遗忘记忆",
      description: "删除一条记忆，同时删除本地文件。",
      inputSchema: { memory_id: z.string().describe("要删除的记忆 ID。") },
    },
    async (params) => {
      const { memory_id } = params;
      const existed = store.remove(memory_id);
      if (existed) deleteMemoryFile(memory_id);
      return { content: [{ type: "text" as const, text: JSON.stringify({
        success: existed, memory_id, action: existed ? "deleted" : "not_found",
      }) }] };
    }
  );

  // ── memory_context ────────────────────────────────────────
  server.registerTool(
    "memory_context",
    {
      title: "加载上下文",
      description: "加载当前会话的上下文——返回最近创建或访问的高优先级记忆。",
      inputSchema: { limit: z.number().min(1).max(20).default(5) },
    },
    async (params) => {
      const { limit } = params;
      const summary = generateContextSummary(store, limit);
      return { content: [{ type: "text" as const, text: JSON.stringify({
        context_loaded: true, memory_count: store.size(), context: summary,
      }) }] };
    }
  );

  // ── memory_export ─────────────────────────────────────────
  server.registerTool(
    "memory_export",
    {
      title: "导出记忆",
      description: "导出记忆为可移植格式（JSON 或 Markdown）。Free 用户换电脑时手动带走记忆，Pro 用户备份。不指定 memory_ids 则导出全部。",
      inputSchema: {
        memory_ids: z.array(z.string()).optional().describe("要导出的记忆 ID 列表。不指定则导出全部。"),
        format: z.enum(["json", "markdown"]).default("json").describe("导出格式: json（结构化）或 markdown（人类可读）。"),
      },
    },
    async (params) => {
      const { memory_ids, format } = params;

      let memories = memory_ids
        ? memory_ids.map((id) => store.get(id)).filter((m): m is NonNullable<typeof m> => m !== null)
        : [...store.list({ limit: 10000, offset: 0 })];

      if (memories.length === 0) {
        return { content: [{ type: "text" as const, text: JSON.stringify({
          exported: 0, message: "No memories to export.",
        }) }] };
      }

      let output: string;

      if (format === "markdown") {
        output = memories.map((m) => {
          const lines = [
            `# ${m.name}`,
            `> category: ${m.category} | tags: ${m.tags.join(", ")} | priority: ${m.priority}`,
            `> created: ${m.created_at} | access_count: ${m.access_count}`,
            ``,
            m.content,
            ``,
            "---",
          ];
          return lines.join("\n");
        }).join("\n\n");
      } else {
        output = JSON.stringify({
          exported_at: new Date().toISOString(),
          version: "memory-forge-1.0",
          count: memories.length,
          memories: memories.map((m) => ({
            id: m.id,
            name: m.name,
            content: m.content,
            category: m.category,
            tags: m.tags,
            priority: m.priority,
            created_at: m.created_at,
          })),
        }, null, 2);
      }

      return { content: [{ type: "text" as const, text: output }] };
    }
  );

  // ── memory_share ──────────────────────────────────────────
  server.registerTool(
    "memory_share",
    {
      title: "分享记忆",
      description: "将一条记忆打包为可分享的格式，方便发送给队友或其他 Agent 导入。返回一个独立 JSON 包，对方可用 memory_store 重新存入。",
      inputSchema: {
        memory_id: z.string().describe("要分享的记忆 ID。"),
        recipient: z.string().optional().describe("接收者名称（可选，写入分享包元数据）。"),
        note: z.string().optional().describe("附注消息（可选，写入分享包）。"),
      },
    },
    async (params) => {
      const { memory_id, recipient, note } = params;
      const memory = store.get(memory_id);

      if (!memory) {
        return { content: [{ type: "text" as const, text: JSON.stringify({
          error: "Not found", memory_id, hint: "Use memory_list to find the correct ID.",
        }) }] };
      }

      store.touch(memory_id);

      const sharePackage = {
        type: "memory-forge-share",
        version: "1.0",
        shared_at: new Date().toISOString(),
        recipient: recipient ?? null,
        note: note ?? null,
        memory: {
          name: memory.name,
          content: memory.content,
          category: memory.category,
          tags: memory.tags,
        },
        import_instruction: "Use memory_store with this content to import.",
      };

      return { content: [{ type: "text" as const, text: JSON.stringify(sharePackage, null, 2) }] };
    }
  );

  // ── 启动 ──────────────────────────────────────────────────
  async function main() {
    // Pro: auto-sync on startup (non-blocking — server starts regardless)
    const proActive = !!process.env.SHELBY_API_KEY;
    if (proActive) {
      console.error("[MemoryForge] Pro: Syncing with Shelby cloud...");
      syncAll()
        .then(() => {
          for (const m of loadAllMemories()) store.add(m);
          console.error(`[MemoryForge] Pro sync complete — ${store.size()} memories`);
        })
        .catch((err) => console.error("[MemoryForge] Pro sync failed (server still available):", (err as Error).message));
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`[MemoryForge] MCP Server started — ${store.size()} memories loaded` +
      (proActive ? " (Pro: Shelby cloud sync)" : " (Free: local storage)"));
    console.error("[MemoryForge] 8 tools: store / search / recall / list / forget / context / export / share");
  }

  main().catch((err) => {
    console.error("[MemoryForge] Fatal:", err);
    process.exit(1);
  });
}
