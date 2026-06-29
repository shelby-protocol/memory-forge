/**
 * Legacy → Project memory migration.
 *
 * Migrates old-format memories (flat ~/.memory-forge/memories/ dir, no project_id)
 * into the project-scoped directory structure introduced in v0.12.0.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  LEGACY_BASEDIR,
  GLOBAL_BASEDIR,
  projectBasedir,
  parseMemoryFile,
  saveMemory,
  hasLegacyMemories,
} from "../storage/local.js";

/** Categories that should stay global (not project-scoped). */
const GLOBAL_CATEGORIES = new Set(["user-preference", "claude-rules", "cursor-rules", "user-info"]);

export interface MigrateResult {
  /** Number of memories moved to project directory. */
  movedToProject: number;
  /** Number of memories moved to global directory. */
  movedToGlobal: number;
  /** Number skipped (target already exists). */
  skipped: number;
  /** Number of files that failed to parse. */
  errors: number;
  /** Total legacy files processed. */
  total: number;
}

export interface MigrateOptions {
  projectHash: string;
  projectName: string;
  dryRun?: boolean;
}

/**
 * Migrate legacy-format memories to project or global directories.
 *
 * Routing logic:
 *   category in GLOBAL_CATEGORIES → GLOBAL_BASEDIR (no project_id)
 *   everything else → projects/{projectHash}/memories/ (with project_id injected)
 *
 * Skips files that already exist at the destination.
 */
export function migrateLegacyMemories(opts: MigrateOptions): MigrateResult {
  const { projectHash, projectName, dryRun = false } = opts;

  const result: MigrateResult = {
    movedToProject: 0,
    movedToGlobal: 0,
    skipped: 0,
    errors: 0,
    total: 0,
  };

  if (!hasLegacyMemories()) return result;

  const files = fs.readdirSync(LEGACY_BASEDIR).filter((f) => f.endsWith(".md"));

  result.total = files.length;

  for (const file of files) {
    const filepath = path.join(LEGACY_BASEDIR, file);
    const memory = parseMemoryFile(filepath);

    if (!memory) {
      result.errors++;
      continue;
    }

    const isGlobal = GLOBAL_CATEGORIES.has(memory.category);

    if (isGlobal) {
      // Global memories: no project_id, save to global dir
      memory.project_id = undefined;
      memory.project_name = undefined;
      memory.scope = "global";

      const dest = path.join(GLOBAL_BASEDIR, file);
      if (!dryRun) {
        if (fs.existsSync(dest)) {
          // Destination already exists — delete legacy duplicate
          result.skipped++;
          fs.unlinkSync(filepath);
          continue;
        }
        saveMemory(memory);
        fs.unlinkSync(filepath);
      }
      result.movedToGlobal++;
    } else {
      // Project memories: inject project info
      memory.project_id = projectHash;
      memory.project_name = projectName;
      memory.scope = "project";

      const dest = path.join(projectBasedir(projectHash), file);
      if (!dryRun) {
        if (fs.existsSync(dest)) {
          // Destination already exists — delete legacy duplicate
          result.skipped++;
          fs.unlinkSync(filepath);
          // Also clean up any stale copy in global dir
          const globalCopy = path.join(GLOBAL_BASEDIR, file);
          if (fs.existsSync(globalCopy)) fs.unlinkSync(globalCopy);
          continue;
        }
        saveMemory(memory);
        fs.unlinkSync(filepath);
        // Clean up stale global copy if present (prevents cross-project leak)
        const globalCopy = path.join(GLOBAL_BASEDIR, file);
        if (fs.existsSync(globalCopy)) fs.unlinkSync(globalCopy);
      }
      result.movedToProject++;
    }
  }

  return result;
}
