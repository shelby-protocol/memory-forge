import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolOptions } from "./types.js";
import { embed } from "../embedding.js";
import { saveMemory } from "../storage/local.js";

export function register(server: McpServer, opts: ToolOptions) {
  const { store } = opts;

  server.registerTool(
    "memory_search",
    {
      title: "Search memories",
      description: "Semantic search with vector similarity. Auto-falls back to keyword matching when model unavailable.",
      inputSchema: {
        query: z.string().describe("Natural language search query."),
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
        limit,
        minSimilarity: min_similarity,
        category: category ?? null,
        tags: tags ?? null,
        queryVec: vec ?? undefined,
      });
      for (const r of results) {
        store.touch(r.id);
        const updated = store.get(r.id);
        if (updated) saveMemory(updated);
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              query,
              count: results.length,
              results: results.map((r) => ({
                memory_id: r.id,
                name: r.name,
                similarity: typeof r.similarity === "number" ? Number(r.similarity.toFixed(3)) : 0,
                _score: r._score ?? null,
                content: r.content,
                _method: r._fallback || "vector",
              })),
              hint: results.length === 0 ? "No relevant memories found." : null,
            }),
          },
        ],
      };
    },
  );
}
