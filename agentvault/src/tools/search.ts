import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolOptions } from "./types.js";
import { embed } from "../embedding.js";
import { saveMemory } from "../storage/local.js";
import { expandQuery } from "../search/expand.js";
import { redactSecrets } from "../auto/index.js";

export function register(server: McpServer, opts: ToolOptions) {
  const { store, scopedStore } = opts;

  server.registerTool(
    "memory_search",
    {
      title: "Search memories",
      description:
        "Hybrid search — vector (70%) + BM25 keyword (30%). Auto-falls back to keyword-only when embedding model unavailable. Project-scoped by default.",
      inputSchema: {
        query: z.string().max(5000).describe("Natural language search query."),
        limit: z.number().min(1).max(20).default(5),
        min_similarity: z.number().min(0).max(1).default(0.3),
        category: z.string().optional(),
        tags: z.array(z.string()).optional(),
        search_method: z
          .enum(["hybrid", "vector", "bm25"])
          .default("hybrid")
          .describe("Search method: hybrid (default), vector-only, or BM25-only."),
        alpha: z
          .number()
          .min(0)
          .max(1)
          .default(0.7)
          .describe("Hybrid weight: 1 = pure vector, 0 = pure BM25. Default 0.7."),
        project: z
          .enum(["current", "all"])
          .default("current")
          .describe("'current' project only, or 'all' projects."),
      },
    },
    async (params) => {
      const { query, limit, min_similarity, category, tags, search_method, alpha, project } =
        params;

      // Query expansion: broaden keywords for better recall
      const expanded = expandQuery(query);
      const searchQuery = expanded.expanded;

      let effectiveAlpha = alpha;
      let queryVec: Float32Array | undefined;

      if (search_method === "bm25") {
        effectiveAlpha = 0;
      } else {
        const vec = await embed(query);
        queryVec = vec ?? undefined;
        if (search_method === "vector") {
          effectiveAlpha = 1;
        } else if (!queryVec) {
          // Vector unavailable → fallback to BM25
          effectiveAlpha = 0;
        }
      }

      const searchStore = project === "current" ? scopedStore : store;
      const results = searchStore.search(searchQuery, {
        limit,
        minSimilarity: min_similarity,
        category: category ?? null,
        tags: tags ?? null,
        queryVec,
        alpha: effectiveAlpha,
        includeAllProjects: project === "all",
      } as any);

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
              expanded_query: expanded.expanded !== query ? expanded.expanded : undefined,
              count: results.length,
              results: results.map((r) => ({
                memory_id: r.id,
                name: r.name,
                similarity: typeof r.similarity === "number" ? Number(r.similarity.toFixed(3)) : 0,
                _score: r._score ?? null,
                content: redactSecrets(r.content),
                project: r.project_name || null,
                scope: r.scope || (r.project_id ? "project" : "global"),
                _method:
                  r._fallback ||
                  (effectiveAlpha === 0 ? "bm25" : effectiveAlpha === 1 ? "vector" : "hybrid"),
              })),
              hint:
                results.length === 0
                  ? project === "current"
                    ? "No matches in current project. Try project: 'all' to search across all projects."
                    : "No relevant memories found."
                  : null,
            }),
          },
        ],
      };
    },
  );
}
