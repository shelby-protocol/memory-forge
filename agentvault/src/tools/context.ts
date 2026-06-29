import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolOptions } from "./types.js";
import { generateContextSummary } from "../auto/index.js";

export function register(server: McpServer, opts: ToolOptions) {
  const { store, projectHash, projectName } = opts;

  server.registerTool(
    "memory_context",
    {
      title: "Load context",
      description:
        "Load current session context — returns top recent/high-priority memories for the current project.",
      inputSchema: {
        limit: z.number().min(1).max(20).default(5),
        project: z
          .enum(["current", "all"])
          .default("current")
          .describe("'current' project only, or 'all' projects."),
      },
    },
    async (params) => {
      const { limit, project } = params;
      const summary = generateContextSummary(
        store,
        limit,
        project === "current" ? projectHash : null,
        project === "current" ? projectName : null,
      );
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
