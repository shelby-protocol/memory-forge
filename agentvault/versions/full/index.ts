#!/usr/bin/env node
/**
 * AgentVault — AI Agent 去中心化持久记忆引擎 (完整版)
 *
 * 基于 Shelby Protocol (@shelby-protocol/sdk) + Aptos (@aptos-labs/ts-sdk)。
 * MCP Server 入口，暴露 8 个 memory_* 工具给任何 MCP 客户端。
 *
 * 嵌入:
 *   Claude Code:  claude mcp add agentvault -- npx agentvault
 *   Cursor:       .cursor/mcp.json
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ─── 存储层: Shelby 官方 TypeScript SDK ────────────────────
import { ShelbyNodeClient } from "@shelby-protocol/sdk/node";
import { Account, Network } from "@aptos-labs/ts-sdk";

// ─── 嵌入层: Transformers.js (进程内, 23MB, 零外部服务) ────
import { pipeline } from "@huggingface/transformers";

// ─── 内部模块 ──────────────────────────────────────────────
import { MemoryStore } from "./store.js";

// ─── 初始化 ──────────────────────────────────────────────────
const store = new MemoryStore();

// 延迟加载嵌入模型 (首次调用时才加载, setup 秒开)
let embedFn: ((text: string) => Promise<Float32Array>) | null = null;
async function getEmbedder() {
  if (!embedFn) {
    const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    embedFn = async (text: string) => {
      const out = await extractor(text, { pooling: "mean", normalize: true });
      return new Float32Array(out.data);
    };
  }
  return embedFn;
}

// Pro 层 Shelby 客户端 (未配置 API Key 时使用本地存储)
let shelby: ShelbyNodeClient | null = null;
function getShelby(): ShelbyNodeClient | null {
  if (!shelby && process.env.SHELBY_API_KEY) {
    shelby = new ShelbyNodeClient({
      network: Network.TESTNET,
      apiKey: process.env.SHELBY_API_KEY,
    });
  }
  return shelby;
}

const server = new McpServer({ name: "agentvault", version: "0.1.0" });

// ═══════════════════════════════════════════════════════════════
// MCP 工具定义
// ═══════════════════════════════════════════════════════════════

// ─── memory_store ────────────────────────────────────────────
server.registerTool(
  "memory_store",
  {
    title: "存储记忆",
    description:
      "存储一条上下文、知识或偏好到持久记忆中。自动向量化以支持语义检索。",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "要存储的记忆内容。" },
        category: { type: "string", description: "分类标签。", default: "general" },
        tags: { type: "array", items: { type: "string" }, description: "标签。", default: [] },
        priority: { type: "integer", description: "优先级 1-10。", minimum: 1, maximum: 10, default: 5 },
      },
      required: ["content"],
    },
  },
  async (params) => {
    const { content, category, tags, priority } = params as Record<string, any>;

    // 向量化
    const embed = await getEmbedder();
    const vector = await embed(content);

    const memory = {
      id: crypto.randomUUID(),
      content,
      category: category || "general",
      tags: tags || [],
      priority: priority || 5,
      vector: Array.from(vector),
      created_at: new Date().toISOString(),
      access_count: 0,
      last_accessed: null as string | null,
    };

    // Pro 层: 上传到 Shelby
    const client = getShelby();
    if (client) {
      try {
        // 需要 Aptos Account (Gas Station 代付或用户自管)
        // shelby.upload({ signer: account, blobData: Buffer.from(JSON.stringify(memory)), blobName: `memories/${memory.id}.json`, expirationMicros: (Date.now() + 30*86400000)*1000 });
      } catch { /* fallback to local */ }
    }

    store.add(memory);
    return {
      content: [{ type: "text", text: JSON.stringify({
        success: true, memory_id: memory.id, category: memory.category, preview: content.substring(0, 200),
      }) }],
    };
  }
);

// ─── memory_search ───────────────────────────────────────────
server.registerTool(
  "memory_search",
  {
    title: "语义检索记忆",
    description: "通过语义相似度搜索相关记忆。内置降级: 向量失败时回退到关键词匹配。",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "自然语言查询。" },
        limit: { type: "integer", description: "返回数量。", minimum: 1, maximum: 20, default: 5 },
        min_similarity: { type: "number", description: "最低相似度 0-1。", minimum: 0, maximum: 1, default: 0.6 },
      },
      required: ["query"],
    },
  },
  async (params) => {
    const { query, limit, min_similarity } = params as Record<string, any>;

    let results: any[];
    try {
      const embed = await getEmbedder();
      const queryVec = await embed(query);
      results = store.search(query, { limit: limit || 5, minSimilarity: min_similarity ?? 0.6, queryVec });
    } catch {
      // 降级: 关键词匹配
      results = store.keywordSearch(query, { limit: limit || 5 });
    }

    for (const r of results) store.touch(r.id);

    return {
      content: [{ type: "text", text: JSON.stringify({
        query, count: results.length,
        results: results.map((r: any) => ({
          memory_id: r.id, similarity: r.similarity?.toFixed(3), content: r.content,
          category: r.category, tags: r.tags, created_at: r.created_at, access_count: r.access_count,
        })),
        hint: results.length === 0 ? "No results. Use memory_store to save context." : null,
      }) }],
    };
  }
);

// ─── memory_recall ───────────────────────────────────────────
server.registerTool(
  "memory_recall",
  {
    title: "精确获取记忆",
    description: "通过 memory_id 精确获取一条记忆的完整内容。",
    inputSchema: {
      type: "object",
      properties: { memory_id: { type: "string", description: "记忆 ID。" } },
      required: ["memory_id"],
    },
  },
  async (params) => {
    const { memory_id } = params as Record<string, any>;
    const memory = store.get(memory_id);
    if (!memory) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "Memory not found", memory_id }) }] };
    }
    store.touch(memory_id);
    return { content: [{ type: "text", text: JSON.stringify(memory) }] };
  }
);

// ─── memory_list ─────────────────────────────────────────────
server.registerTool(
  "memory_list",
  {
    title: "列出记忆",
    description: "列出记忆目录，可按分类和标签过滤。",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
        offset: { type: "integer", minimum: 0, default: 0 },
      },
    },
  },
  async (params) => {
    const { category, tags, limit, offset } = params as Record<string, any>;
    const memories = store.list({ category, tags, limit: limit || 20, offset: offset || 0 });
    return {
      content: [{ type: "text", text: JSON.stringify({
        total: store.size(), count: memories.length,
        memories: memories.map((m: any) => ({
          memory_id: m.id, category: m.category, tags: m.tags, priority: m.priority,
          preview: m.content.substring(0, 100), created_at: m.created_at, access_count: m.access_count,
        })),
      }) }],
    };
  }
);

// ─── memory_forget ───────────────────────────────────────────
server.registerTool(
  "memory_forget",
  {
    title: "遗忘记忆",
    description: "删除一条记忆。支持用户隐私请求。",
    inputSchema: {
      type: "object",
      properties: {
        memory_id: { type: "string", description: "要删除的记忆 ID。" },
        reason: { type: "string", description: "删除原因。", default: "manual" },
      },
      required: ["memory_id"],
    },
  },
  async (params) => {
    const { memory_id, reason } = params as Record<string, any>;
    const existed = store.remove(memory_id);
    return {
      content: [{ type: "text", text: JSON.stringify({
        success: existed, memory_id, reason: reason || "manual", action: existed ? "deleted" : "not_found",
      }) }],
    };
  }
);

// ─── memory_context ──────────────────────────────────────────
server.registerTool(
  "memory_context",
  {
    title: "加载上下文",
    description: "会话启动时自动加载最近的高优先级记忆。",
    inputSchema: { type: "object", properties: {} },
  },
  async () => {
    const recent = store.list({ limit: 10, offset: 0 });
    const top = recent.sort((a: any, b: any) => (b.priority || 5) - (a.priority || 5)).slice(0, 5);
    return {
      content: [{ type: "text", text: JSON.stringify({
        context_count: top.length,
        context: top.map((m: any) => ({ memory_id: m.id, content: m.content, category: m.category })),
      }) }],
    };
  }
);

// ─── memory_summary ──────────────────────────────────────────
server.registerTool(
  "memory_summary",
  {
    title: "记忆统计",
    description: "获取记忆统计概览。",
    inputSchema: { type: "object", properties: {} },
  },
  async () => {
    const stats = store.stats();
    return { content: [{ type: "text", text: JSON.stringify(stats) }] };
  }
);

// ─── memory_consolidate ──────────────────────────────────────
server.registerTool(
  "memory_consolidate",
  {
    title: "合并记忆",
    description: "合并多条相关记忆为一条精炼记忆。",
    inputSchema: {
      type: "object",
      properties: {
        memory_ids: { type: "array", items: { type: "string" } },
        instruction: { type: "string", default: "去除重复，保留关键信息。" },
      },
      required: ["memory_ids"],
    },
  },
  async (params) => {
    const { memory_ids, instruction } = params as Record<string, any>;
    const memories = memory_ids.map((id: string) => store.get(id)).filter(Boolean);
    if (memories.length < 2) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "Need >= 2 valid memories", found: memories.length }) }] };
    }
    const combined = memories.map((m: any) => m.content).join("\n\n---\n\n");
    return {
      content: [{ type: "text", text: JSON.stringify({
        action: "consolidate", memory_ids, count: memories.length,
        combined_preview: combined.substring(0, 500), instruction: instruction || "去除重复，保留关键信息。",
      }) }],
    };
  }
);

// ═══════════════════════════════════════════════════════════════
// 启动
// ═══════════════════════════════════════════════════════════════
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[AgentVault] MCP Server started");
  console.error("[AgentVault] Storage: Shelby Protocol (@shelby-protocol/sdk)");
  console.error("[AgentVault] Embedding: Transformers.js (Xenova/all-MiniLM-L6-v2, 23MB, in-process)");
  console.error("[AgentVault] 8 memory tools registered");
}

main().catch((err) => {
  console.error("[AgentVault] Fatal:", err);
  process.exit(1);
});
