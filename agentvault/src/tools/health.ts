/**
 * memory_health MCP tool.
 *
 * Reports Pro sync health, queue depth, profile validity, balances, and
 * recent conflict count. Agent-accessible so the user can check sync
 * status mid-session without switching to the CLI.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolOptions } from "./types.js";
import { proStatus } from "../pro.js";
import { SyncQueue } from "../sync-queue.js";

export function register(server: McpServer, opts: ToolOptions) {
  const { hasPro } = opts;

  server.registerTool(
    "memory_health",
    {
      title: "MemoryForge health check",
      description:
        "Check MemoryForge sync health, queue status, profile validity, and account balances.",
      inputSchema: {},
    },
    async () => {
      const status = proStatus();
      const queue = new SyncQueue();
      const pendingOps = queue.size();

      let balances: { apt: string; shelbyUsd: string } | null = null;
      if (hasPro) {
        try {
          const { getBalances } = await import("../storage/shelby.js");
          balances = await getBalances();
        } catch {
          /* network issue — balances unavailable */
        }
      }

      const aptVal = balances ? parseFloat(balances.apt) : -1;
      const usdVal = balances ? parseFloat(balances.shelbyUsd) : -1;

      const health: Record<string, unknown> = {
        pro_active: status.active,
        profile_valid: status.profileValid ?? true,
        last_sync: status.lastSync ?? null,
        pending_operations: pendingOps,
        conflict_records: status.conflictCount ?? 0,
        total_sync_conflicts: status.totalConflicts ?? 0,
        total_uploaded: status.totalUploaded ?? 0,
        total_downloaded: status.totalDownloaded ?? 0,
        total_failed: status.totalFailed ?? 0,
        key_backed_up: status.keyBackedUp ?? false,
        address: status.address ?? null,
        local_count: status.localCount ?? 0,
        ...(status.profileErrors ? { profile_errors: status.profileErrors } : {}),
        ...(balances
          ? {
              balances: {
                apt: balances.apt,
                shelby_usd: balances.shelbyUsd,
                apt_low: aptVal >= 0 && aptVal < 0.01,
                usd_low: usdVal >= 0 && usdVal < 1.0,
              },
            }
          : { balances: null }),
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(health, null, 2),
          },
        ],
      };
    },
  );
}
