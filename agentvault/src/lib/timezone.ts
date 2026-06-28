/**
 * Timezone detection and timestamp formatting.
 *
 * Priority: env TZ > config.json timezone > Intl auto-detect > UTC fallback
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "/tmp";

let cachedTimezone: string | null = null;

/** Auto-detect local timezone, with env/config override. */
export function getLocalTimezone(): string {
  if (cachedTimezone) return cachedTimezone;

  // 1. env var override
  const envTz = process.env.TZ?.trim();
  if (envTz) {
    cachedTimezone = envTz;
    return cachedTimezone;
  }

  // 2. config.json override
  try {
    const configPath = join(HOME, ".memory-forge", "config.json");
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
      const configTz = typeof config.timezone === "string" ? config.timezone.trim() : "";
      if (configTz) {
        cachedTimezone = configTz;
        return cachedTimezone;
      }
    }
  } catch {
    /* config unavailable, fall through */
  }

  // 3. auto-detect from system
  try {
    cachedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    cachedTimezone = "UTC";
  }
  return cachedTimezone;
}

/** Reset cached timezone — call after config changes. */
export function resetTimezone(): void {
  cachedTimezone = null;
}

/**
 * Format ISO timestamp as "Jun 28, 13:30" (short date + time).
 * Used by: CLI list, context summary.
 */
export function formatTimestamp(iso: string, tz?: string): string {
  const timezone = tz || getLocalTimezone();
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  });
}

/**
 * Format ISO timestamp as "Jun 28" (date only).
 * Used by: CLI list compact.
 */
export function formatDate(iso: string, tz?: string): string {
  const timezone = tz || getLocalTimezone();
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: timezone,
  });
}

/**
 * Format ISO timestamp as "2026-06-28 13:30:45" (full datetime, local time).
 * Used by: Pro sync history.
 */
export function formatDateTime(iso: string, tz?: string): string {
  const timezone = tz || getLocalTimezone();
  const fmt = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: timezone,
  });
  const parts = fmt.formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}
