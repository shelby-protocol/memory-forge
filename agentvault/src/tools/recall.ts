import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolOptions } from "./types.js";
import { saveMemory } from "../storage/local.js";

export function register(server: McpServer, opts: ToolOptions) {
  const { store } = opts;

  server.registerTool(
    "memory_recall",
    {
      title: "Recall memory",
      description: "Retrieve a single memory by its exact ID with full content.",
      inputSchema: { memory_id: z.string().describe("Memory ID.") },
    },
    async (params) => {
      const { memory_id } = params;
      const memory = store.get(memory_id);
      if (!memory) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Not found", memory_id }) }] };
      store.touch(memory_id);
      saveMemory(memory);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              memory_id: memory.id,
              name: memory.name,
              content: memory.content,
              category: memory.category,
              tags: memory.tags,
              priority: memory.priority,
              created_at: memory.created_at,
              access_count: memory.access_count,
            }),
          },
        ],
      };
    },
  );
}
