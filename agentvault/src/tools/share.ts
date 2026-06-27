import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolOptions } from "./types.js";

export function register(server: McpServer, opts: ToolOptions) {
  const { store } = opts;

  server.registerTool(
    "memory_share",
    {
      title: "Share memory",
      description: "Package a single memory into a shareable JSON bundle for teammates or other agents to import via memory_store.",
      inputSchema: {
        memory_id: z.string().describe("Memory ID to share."),
        recipient: z.string().optional().describe("Recipient name (optional, written to share metadata)."),
        note: z.string().optional().describe("Optional note attached to the share package."),
      },
    },
    async (params) => {
      const { memory_id, recipient, note } = params;
      const memory = store.get(memory_id);
      if (!memory) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Not found",
                memory_id,
                hint: "Use memory_list to find the correct ID.",
              }),
            },
          ],
        };
      }
      store.touch(memory_id);
      const sharePackage = {
        type: "memory-forge-share",
        version: "1.0",
        shared_at: new Date().toISOString(),
        recipient: recipient ?? null,
        note: note ?? null,
        memory: { name: memory.name, content: memory.content, category: memory.category, tags: memory.tags },
        import_instruction: "Use memory_store with this content to import.",
      };
      return { content: [{ type: "text" as const, text: JSON.stringify(sharePackage, null, 2) }] };
    },
  );
}
