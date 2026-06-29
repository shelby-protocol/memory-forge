import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolOptions } from "./types.js";
import { safeTruncate } from "../store.js";
import { redactSecrets } from "../auto/index.js";

export function register(server: McpServer, opts: ToolOptions) {
  const { store, scopedStore } = opts;

  server.registerTool(
    "memory_list",
    {
      title: "List memories",
      description: "List memories with category, tag, and project filtering.",
      inputSchema: {
        category: z.string().optional(),
        tags: z.array(z.string()).optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
        project: z
          .enum(["current", "all"])
          .default("current")
          .describe("'current' project only, or 'all' projects."),
      },
    },
    async (params) => {
      const { category, tags, limit, offset, project } = params;
      const isFiltered = !!(category || (tags && tags.length > 0));
      const listStore = project === "current" ? scopedStore : store;
      const memories = listStore.list({
        category: category ?? null,
        tags: tags ?? null,
        limit,
        offset,
        includeAllProjects: project === "all",
      } as any);
      const matchingTotal = isFiltered
        ? listStore.list({
            category: category ?? null,
            tags: tags ?? null,
            limit: 10000,
            offset: 0,
            includeAllProjects: project === "all",
          } as any).length
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
                project: m.project_name || null,
                scope: m.scope || (m.project_id ? "project" : "global"),
                preview: safeTruncate(redactSecrets(m.content), 200),
              })),
            }),
          },
        ],
      };
    },
  );
}
