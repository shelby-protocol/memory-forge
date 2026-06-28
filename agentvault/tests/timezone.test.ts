import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getLocalTimezone,
  resetTimezone,
  formatTimestamp,
  formatDate,
  formatDateTime,
} from "../src/lib/timezone.js";
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from "node:fs";
import { join } from "node:path";

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "/tmp";
const configPath = join(HOME, ".memory-forge", "config.json");

let savedTZ: string | undefined;
let savedConfig: string | null = null;

beforeEach(() => {
  savedTZ = process.env.TZ;
  delete process.env.TZ;
  resetTimezone();
  try {
    savedConfig = readFileSync(configPath, "utf-8");
  } catch {
    savedConfig = null;
  }
  try {
    unlinkSync(configPath);
  } catch {
    /* ok */
  }
});

afterEach(() => {
  if (savedTZ) process.env.TZ = savedTZ;
  else delete process.env.TZ;
  resetTimezone();
  try {
    if (savedConfig) {
      const dir = join(HOME, ".memory-forge");
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(configPath, savedConfig);
    } else {
      try {
        unlinkSync(configPath);
      } catch {
        /* ok */
      }
    }
  } catch {
    /* ok */
  }
});

describe("getLocalTimezone", () => {
  it("returns a string", () => {
    const tz = getLocalTimezone();
    expect(typeof tz).toBe("string");
    expect(tz.length).toBeGreaterThan(0);
  });

  it("respects TZ env var", () => {
    process.env.TZ = "UTC";
    resetTimezone();
    expect(getLocalTimezone()).toBe("UTC");
  });

  it("trims TZ env var whitespace", () => {
    process.env.TZ = "  America/New_York  ";
    resetTimezone();
    expect(getLocalTimezone()).toBe("America/New_York");
  });

  it("reads config.json timezone (2nd priority)", () => {
    const dir = join(HOME, ".memory-forge");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(configPath, JSON.stringify({ timezone: "Asia/Tokyo" }));
    resetTimezone();
    expect(getLocalTimezone()).toBe("Asia/Tokyo");
  });

  it("falls through config without timezone field", () => {
    const dir = join(HOME, ".memory-forge");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(configPath, JSON.stringify({ embedModel: "e5" }));
    resetTimezone();
    const tz = getLocalTimezone();
    expect(typeof tz).toBe("string");
    expect(tz.length).toBeGreaterThan(0);
  });

  it("caches result ignoring later env changes", () => {
    resetTimezone();
    const first = getLocalTimezone();
    process.env.TZ = "Pacific/Honolulu";
    expect(getLocalTimezone()).toBe(first);
  });
});

describe("formatTimestamp", () => {
  it("formats UTC timestamp correctly", () => {
    expect(formatTimestamp("2024-01-01T08:00:00Z", "UTC")).toBe("Jan 1, 08:00 AM");
  });

  it("respects timezone offset (UTC → Shanghai +8h)", () => {
    expect(formatTimestamp("2024-01-01T08:00:00Z", "Asia/Shanghai")).toBe("Jan 1, 04:00 PM");
  });
});

describe("formatDate", () => {
  it("formats date only", () => {
    expect(formatDate("2024-06-15T12:00:00Z", "UTC")).toBe("Jun 15");
  });

  it("crosses date boundary with timezone", () => {
    const result = formatDate("2024-01-01T23:30:00Z", "Asia/Shanghai");
    expect(result).toBe("Jan 2");
  });
});

describe("formatDateTime", () => {
  it("formats full datetime UTC", () => {
    expect(formatDateTime("2024-01-01T08:30:45Z", "UTC")).toBe("2024-01-01 08:30:45");
  });

  it("shifts with timezone", () => {
    expect(formatDateTime("2024-01-01T08:30:45Z", "Asia/Shanghai")).toBe("2024-01-01 16:30:45");
  });

  it("handles year-end boundary", () => {
    expect(formatDateTime("2024-12-31T23:59:59Z", "UTC")).toBe("2024-12-31 23:59:59");
  });
});
