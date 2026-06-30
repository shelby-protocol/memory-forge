import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { safeTruncate } from "../store.js";
import type { ToolOptions } from "./types.js";
import { embed } from "../embedding.js";
import { autoName, autoMerge, suggestTags, inferCategory } from "../auto/index.js";
import { saveMemory } from "../storage/local.js";
import { uploadMemory } from "../storage/shelby.js";

export function register(server: McpServer, opts: ToolOptions) {
  const { store, hasPro, projectHash, projectName, scopedStore } = opts;

  server.registerTool(
    "memory_store",
    {
      title: "Store memory",
      description:
        "Store a context, knowledge, or preference into persistent memory. Auto-embeds for semantic retrieval. Project-scoped by default.",
      inputSchema: {
        content: z
          .string()
          .min(1)
          .max(100000)
          .refine((s) => s.trim().length > 0, "Content must not be whitespace-only")
          .describe("Memory content (max 100KB)."),
        category: z
          .string()
          .max(50)
          .default("general")
          .describe("Category: user-preference, project-context, decision-log, code-pattern."),
        tags: z.array(z.string().min(1)).default([]).describe("Tags list."),
        priority: z.number().min(1).max(10).default(5).describe("Priority 1-10."),
        name: z
          .string()
          .min(1)
          .max(120)
          .optional()
          .describe("Custom name (optional — auto-generated from content if not provided)."),
        project: z
          .string()
          .max(120)
          .optional()
          .describe(
            "Project name. Auto-detected from current workspace if omitted. Use 'global' for cross-project memories.",
          ),
        branch: z
          .string()
          .max(120)
          .optional()
          .describe("Git branch for context scoping (auto-detected if omitted)."),
        related_to: z.array(z.string()).optional().describe("IDs of related memories."),
        auto_tag: z
          .boolean()
          .default(true)
          .describe(
            "Auto-suggest tags and category from content. Set false to use only explicit tags/category.",
          ),
      },
    },
    async (params) => {
      const { content, category, tags, priority, name: customName, project, auto_tag } = params;
      const vec = await embed(content);
      const name = customName || autoName(content);

      // Quality floor: reject too-short memories (latentcontext-mcp pattern).
      // Count both whitespace-delimited words AND individual CJK characters,
      // since Chinese/Japanese/Korean text doesn't use spaces between words.
      const cjkChars = (content.match(/[一-鿿㐀-䶿豈-﫿぀-ゟ゠-ヿ가-힯]/g) || []).length;
      const nonCjkWords = content
        .replace(/[一-鿿㐀-䶿豈-﫿぀-ゟ゠-ヿ가-힯]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 0).length;
      const wordCount = cjkChars + nonCjkWords;
      if (wordCount < 10) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Content too short",
                message: `Memory content must be at least 10 words (got ${wordCount}).`,
              }),
            },
          ],
        };
      }

      // Resolve project: Agent-provided > server-detected
      const effectiveProject = project === "global" ? null : project || projectName;
      const effectiveProjectHash = effectiveProject ? projectHash : null;

      // Auto-tag: suggest tags and category when user hasn't explicitly set them
      let effectiveCategory = category;
      let effectiveTags = tags;
      const suggested_tags: string[] = [];

      if (auto_tag) {
        const suggested = suggestTags(content);
        // Merge: user-provided tags + auto-suggested (no duplicates)
        const merged = new Set([...tags, ...suggested]);
        effectiveTags = [...merged];

        if (category === "general") {
          const inferred = inferCategory(content);
          if (inferred) effectiveCategory = inferred;
        }
        suggested_tags.push(...suggested);
      }

      const memory = {
        id: randomUUID(),
        name,
        content,
        category: effectiveCategory,
        tags: effectiveTags,
        priority,
        vector: vec ? Array.from(vec) : [],
        created_at: new Date().toISOString(),
        access_count: 0,
        last_accessed: null as string | null,
        project_id: effectiveProjectHash || undefined,
        project_name: effectiveProject || undefined,
        scope: effectiveProjectHash ? ("project" as const) : ("global" as const),
      };

      const merged = await autoMerge(store, memory);
      if (merged) {
        saveMemory(merged);
        console.error(
          `[MemoryForge] Merged duplicate: "${memory.name}" → "${merged.name}" (${(0.8 * 100).toFixed(0)}%+ overlap)`,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                merged: true,
                memory_id: merged.id,
                name: merged.name,
                project: merged.project_name || "global",
                preview: safeTruncate(content, 200),
              }),
            },
          ],
        };
      }

      saveMemory(memory);
      scopedStore.add(memory);

      if (hasPro)
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
            projectHash: effectiveProjectHash ?? undefined,
          });
        });

      const hint =
        !hasPro && store.size() >= 20
          ? "💡 20+ memories! Upgrade to Pro for cross-device sync: memory-forge pro"
          : null;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              memory_id: memory.id,
              name: memory.name,
              preview: safeTruncate(content, 200),
              project: memory.project_name || "global",
              scope: memory.scope,
              inferred_category: effectiveCategory !== category ? effectiveCategory : undefined,
              suggested_tags: suggested_tags.length > 0 ? suggested_tags : undefined,
              ...(hint ? { hint } : {}),
            }),
          },
        ],
      };
    },
  );
}
