import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolOptions } from "./types.js";
import { deleteMemoryFile } from "../storage/local.js";
import { deleteBlob, getBlobName } from "../storage/shelby.js";

export function register(server: McpServer, opts: ToolOptions) {
  const { store, projectHash } = opts;

  server.registerTool(
    "memory_forget",
    {
      title: "Forget memory",
      description: "Delete a memory by ID — removes local file + uploads cloud tombstone.",
      inputSchema: {
        memory_id: z
          .string()
          .regex(/^[^\x00-\x1f\/\\]+$/)
          .describe("Memory ID to delete."),
      },
    },
    async (params) => {
      const { memory_id } = params;
      const memory = store.get(memory_id);
      const existed = store.remove(memory_id);
      if (existed) {
        deleteMemoryFile(memory_id);
        const memProjectHash = memory?.project_id || projectHash;
        if (process.env.SHELBY_API_KEY || opts.hasPro) {
          deleteBlob(getBlobName(memory_id, memProjectHash)).catch((err) =>
            console.error("[MemoryForge] Cloud tombstone failed:", (err as Error).message),
          );
        }
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: existed,
              memory_id,
              action: existed ? "deleted" : "not_found",
            }),
          },
        ],
      };
    },
  );
}
