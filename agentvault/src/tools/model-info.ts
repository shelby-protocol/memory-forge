import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolOptions } from "./types.js";
import { modelName, modelLabel, modelDimension, modelStatus } from "../embedding.js";

export function register(server: McpServer, opts: ToolOptions) {
  const { store } = opts;

  server.registerTool(
    "model_info",
    {
      title: "Model info",
      description:
        "Get current embedding model name, status, and dimension. Use to diagnose search quality issues.",
      inputSchema: {},
    },
    async () => {
      const allMemories = store.list({ limit: 10000, offset: 0 });
      let withVector = 0;
      let withoutVector = 0;
      for (const m of allMemories) {
        if (m.vector && m.vector.length > 0) withVector++;
        else withoutVector++;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              current_model: modelName(),
              label: modelLabel(),
              dimension: modelDimension(),
              status: modelStatus(),
              env_var: "MEMORY_FORGE_MODEL",
              available_aliases: ["default (all-MiniLM-L6-v2)", "e5 (multilingual-e5-small)"],
              memories_with_vector: withVector,
              memories_without_vector: withoutVector,
              total_memories: allMemories.length,
              hint:
                modelStatus() === "degraded"
                  ? "Model failed to load. Search uses keyword matching only. Set MEMORY_FORGE_MODEL and restart to retry."
                  : null,
            }),
          },
        ],
      };
    },
  );
}
