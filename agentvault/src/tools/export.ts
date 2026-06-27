import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolOptions } from "./types.js";

export function register(server: McpServer, opts: ToolOptions) {
  const { store, version, hasPro } = opts;

  server.registerTool(
    "memory_export",
    {
      title: "Export memories",
      description:
        "Export memories to portable JSON or Markdown. Free users can move between machines; Pro users can backup. Exports all if no memory_ids specified.",
      inputSchema: {
        memory_ids: z
          .array(z.string())
          .optional()
          .describe("Memory IDs to export. Exports all if not specified."),
        format: z
          .enum(["json", "markdown"])
          .default("json")
          .describe("Export format: json (structured) or markdown (human-readable)."),
      },
    },
    async (params) => {
      const { memory_ids, format } = params;
      const memories = memory_ids
        ? memory_ids
            .map((id) => store.get(id))
            .filter((m): m is NonNullable<typeof m> => m !== null)
        : [...store.list({ limit: 10000, offset: 0 })];

      if (memories.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                exported: 0,
                message: "No memories to export.",
                ...(!hasPro
                  ? {
                      hint: "💡 Pro auto-syncs across devices — no manual export needed: memory-forge pro",
                    }
                  : {}),
              }),
            },
          ],
        };
      }

      let output: string;
      if (format === "markdown") {
        output = memories
          .map((m) => {
            const lines = [
              `# ${m.name}`,
              `> category: ${m.category} | tags: ${m.tags.join(", ")} | priority: ${m.priority}`,
              `> created: ${m.created_at} | access_count: ${m.access_count}`,
              "",
              m.content,
              "",
              "---",
            ];
            return lines.join("\n");
          })
          .join("\n\n");
      } else {
        output = JSON.stringify(
          {
            exported_at: new Date().toISOString(),
            version: `memory-forge-${version}`,
            count: memories.length,
            memories: memories.map((m) => ({
              id: m.id,
              name: m.name,
              content: m.content,
              category: m.category,
              tags: m.tags,
              priority: m.priority,
              created_at: m.created_at,
            })),
          },
          null,
          2,
        );
      }

      const hint = !hasPro
        ? "\n\n💡 Pro auto-syncs across devices — no manual export needed: memory-forge pro"
        : "";
      return { content: [{ type: "text" as const, text: output + hint }] };
    },
  );
}
