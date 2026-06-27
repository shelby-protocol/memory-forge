import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolOptions } from "./types.js";
import { generateContextSummary } from "../auto/index.js";

export function register(server: McpServer, opts: ToolOptions) {
  const { store } = opts;

  server.registerTool(
    "memory_context",
    {
      title: "Load context",
      description: "Load current session context — returns top recent/high-priority memories.",
      inputSchema: { limit: z.number().min(1).max(20).default(5) },
    },
    async (params) => {
      const { limit } = params;
      const summary = generateContextSummary(store, limit);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              context_loaded: true,
              memory_count: store.size(),
              context: summary,
            }),
          },
        ],
      };
    },
  );
}
