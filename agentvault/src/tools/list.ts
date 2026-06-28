import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolOptions } from "./types.js";
import { safeTruncate } from "../store.js";
import { redactSecrets } from "../auto/index.js";

export function register(server: McpServer, opts: ToolOptions) {
  const { store } = opts;

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
      const isFiltered = !!(category || (tags && tags.length > 0));
      const memories = store.list({
        category: category ?? null,
        tags: tags ?? null,
        limit,
        offset,
      });
      const matchingTotal = isFiltered
        ? store.list({ category: category ?? null, tags: tags ?? null, limit: 10000, offset: 0 })
            .length
        : store.size();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              total: matchingTotal,
              count: memories.length,
              memories: memories.map((m) => ({
                memory_id: m.id,
                name: m.name,
                category: m.category,
                tags: m.tags,
                priority: m.priority,
                access_count: m.access_count,
                created_at: m.created_at,
                last_accessed: m.last_accessed,
                preview: safeTruncate(redactSecrets(m.content), 200),
              })),
            }),
          },
        ],
      };
    },
  );
}
