import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolOptions } from "./types.js";
import { embed } from "../embedding.js";
import { autoName, suggestTags, inferCategory } from "../auto/index.js";
import { safeTruncate } from "../store.js";
import { saveMemory } from "../storage/local.js";
import { uploadMemory } from "../storage/shelby.js";

export function register(server: McpServer, opts: ToolOptions) {
  const { store, scopedStore } = opts;

  server.registerTool(
    "memory_update",
    {
      title: "Update memory",
      description:
        "Partially update a memory by ID. Only provided fields are changed — unset fields stay untouched.",
      inputSchema: {
        memory_id: z
          .string()
          .regex(/^[^\x00-\x1f\/\\]+$/)
          .describe("Memory ID to update."),
        content: z
          .string()
          .min(1)
          .max(100000)
          .refine((s) => s.trim().length > 0, "Content must not be whitespace-only")
          .optional()
          .describe("New content (optional)."),
        category: z.string().optional().describe("New category (optional)."),
        tags: z
          .array(z.string())
          .optional()
          .describe("New tags list (optional, replaces all existing tags)."),
        priority: z.number().min(1).max(10).optional().describe("New priority 1-10 (optional)."),
        name: z
          .string()
          .min(1)
          .max(120)
          .optional()
          .describe("New name (optional — auto-generated if not provided)."),
        branch: z.string().max(120).optional().describe("Git branch (auto-detected if omitted)."),
        related_to: z.array(z.string()).optional().describe("Related memory IDs."),
        auto_tag: z
          .boolean()
          .default(true)
          .describe("Auto-suggest tags and category when updating content."),
      },
    },
    async (params) => {
      const {
        memory_id,
        content,
        category,
        tags,
        priority,
        name: customName,
        branch: newBranch,
        related_to,
        auto_tag,
      } = params;

      if (
        content === undefined &&
        category === undefined &&
        tags === undefined &&
        priority === undefined &&
        customName === undefined
      ) {
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

      // Auto-tag: supplement with suggestions when user hasn't overridden
      let suggested_tags: string[] = [];
      let inferredCategory: string | null = null;
      if (auto_tag) {
        const suggested = suggestTags(memory.content);
        if (tags === undefined) {
          // User didn't set tags → merge with existing + suggestions
          const merged = new Set([...memory.tags, ...suggested]);
          memory.tags = [...merged];
          suggested_tags = suggested;
        }
        if (category === undefined) {
          inferredCategory = inferCategory(memory.content);
          if (inferredCategory) memory.category = inferredCategory;
        }
      }
      memory.access_count++;
      memory.last_accessed = new Date().toISOString();

      saveMemory(memory);
      scopedStore.add(memory);

      if (process.env.SHELBY_API_KEY)
        uploadMemory(memory).catch(async (err) => {
          console.error(
            "[MemoryForge] Pro upload failed, queued for retry:",
            (err as Error).message,
          );
          const { SyncQueue } = await import("../sync-queue.js");
          const queue = new SyncQueue();
          queue.enqueue({
            id: memory.id,
            type: "upload",
            memory,
            memoryId: memory.id,
            projectHash: memory.project_id,
          });
        });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              memory_id: memory.id,
              name: memory.name,
              preview: safeTruncate(memory.content, 200),
              inferred_category: inferredCategory ? inferredCategory : undefined,
              suggested_tags: suggested_tags.length > 0 ? suggested_tags : undefined,
              updated_fields: Object.keys(params).filter(
                (k) => k !== "memory_id" && params[k as keyof typeof params] !== undefined,
              ),
            }),
          },
        ],
      };
    },
  );
}
