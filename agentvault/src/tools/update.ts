import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolOptions } from "./types.js";
import { embed } from "../embedding.js";
import { autoName } from "../auto/index.js";
import { safeTruncate } from "../store.js";
import { saveMemory } from "../storage/local.js";
import { uploadMemory } from "../storage/shelby.js";
import { execSync } from "node:child_process";

export function register(server: McpServer, opts: ToolOptions) {
  const { store } = opts;

  server.registerTool(
    "memory_update",
    {
      title: "Update memory",
      description: "Partially update a memory by ID. Only provided fields are changed — unset fields stay untouched.",
      inputSchema: {
        memory_id: z.string().describe("Memory ID to update."),
        content: z
          .string()
          .min(1)
          .max(100000)
          .refine((s) => s.trim().length > 0, "Content must not be whitespace-only")
          .optional()
          .describe("New content (optional)."),
        category: z.string().optional().describe("New category (optional)."),
        tags: z.array(z.string()).optional().describe("New tags list (optional, replaces all existing tags)."),
        priority: z.number().min(1).max(10).optional().describe("New priority 1-10 (optional)."),
        name: z.string().min(1).max(120).optional().describe("New name (optional — auto-generated if not provided)."),
        branch: z.string().max(120).optional().describe("Git branch (auto-detected if omitted)."),
        related_to: z.array(z.string()).optional().describe("Related memory IDs."),
      },
    },
    async (params) => {
      const { memory_id, content, category, tags, priority, name: customName, branch: newBranch, related_to } = params;

      if (content === undefined && category === undefined && tags === undefined && priority === undefined && customName === undefined) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "No fields to update",
                hint: "Provide at least one of: content, category, tags, priority.",
              }),
            },
          ],
        };
      }

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

      if (content !== undefined) {
        memory.content = content;
        memory.name = customName || autoName(content);
        const vec = await embed(content);
        if (vec) memory.vector = Array.from(vec);
      } else if (customName !== undefined) {
        memory.name = customName;
      }
      if (category !== undefined) memory.category = category;
      if (tags !== undefined) memory.tags = tags;
      if (priority !== undefined) memory.priority = priority;
        if (related_to !== undefined) memory.related_to = related_to;
        if (newBranch !== undefined) memory.branch = newBranch;
      memory.access_count++;
      memory.last_accessed = new Date().toISOString();

      saveMemory(memory);
      store.add(memory);

      if (process.env.SHELBY_API_KEY) uploadMemory(memory).catch((err) => console.error("[MemoryForge] Pro upload failed:", (err as Error).message));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              memory_id: memory.id,
              name: memory.name,
              preview: safeTruncate(memory.content, 200),
              updated_fields: Object.keys(params).filter((k) => k !== "memory_id" && params[k as keyof typeof params] !== undefined),
            }),
          },
        ],
      };
    },
  );
}
