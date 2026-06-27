import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { safeTruncate } from "../store.js";
import type { ToolOptions } from "./types.js";
import { embed } from "../embedding.js";
import { autoName, autoMerge } from "../auto/index.js";
import { saveMemory } from "../storage/local.js";
import { uploadMemory } from "../storage/shelby.js";

export function register(server: McpServer, opts: ToolOptions) {
  const { store, hasPro } = opts;

  server.registerTool(
    "memory_store",
    {
      title: "Store memory",
      description: "Store a context, knowledge, or preference into persistent memory. Auto-embeds for semantic retrieval.",
      inputSchema: {
        content: z
          .string()
          .min(1)
          .max(100000)
          .refine((s) => s.trim().length > 0, "Content must not be whitespace-only")
          .describe("Memory content (max 100KB)."),
        category: z.string().default("general").describe("Category: user-preference, project-context, decision-log, code-pattern."),
        tags: z.array(z.string().min(1)).default([]).describe("Tags list."),
        priority: z.number().min(1).max(10).default(5).describe("Priority 1-10."),
        name: z.string().min(1).max(120).optional().describe("Custom name (optional — auto-generated from content if not provided)."),
      },
    },
    async (params) => {
      const { content, category, tags, priority, name: customName } = params;
      const vec = await embed(content);
      const name = customName || autoName(content);

      const memory = {
        id: randomUUID(),
        name,
        content,
        category,
        tags,
        priority,
        vector: vec ? Array.from(vec) : [],
        created_at: new Date().toISOString(),
        access_count: 0,
        last_accessed: null as string | null,
      };

      const merged = await autoMerge(store, memory);
      if (merged) {
        saveMemory(merged);
        console.error(`[MemoryForge] Merged duplicate: "${memory.name}" → "${merged.name}" (${(0.8 * 100).toFixed(0)}%+ overlap)`);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                merged: true,
                memory_id: merged.id,
                name: merged.name,
                preview: safeTruncate(content, 200),
              }),
            },
          ],
        };
      }

      saveMemory(memory);
      store.add(memory);

      if (hasPro) uploadMemory(memory).catch((err) => console.error("[MemoryForge] Pro upload failed:", (err as Error).message));

      const hint = !hasPro && store.size() >= 20 ? "💡 20+ memories! Upgrade to Pro for cross-device sync: memory-forge pro" : null;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              memory_id: memory.id,
              name: memory.name,
              preview: safeTruncate(content, 200),
              ...(hint ? { hint } : {}),
            }),
          },
        ],
      };
    },
  );
}
