/**
 * Hybrid Logical Clock (HLC).
 *
 * Combines wall clock with a monotonic counter to produce strictly increasing
 * timestamps across processes on the same machine. Persists state to disk so
 * the counter survives crashes and avoids regression from system clock jumps.
 *
 * Uses a simple file-based HLC (no network component — we don't need causal
 * ordering across machines, only monotonicity on this machine). The "hybrid"
 * aspect comes from mixing wall clock + logical counter, ensuring that even
 * when the wall clock jumps backward, the counter advances to maintain the
 * invariant: every call to clock.now() returns a value strictly greater than
 * all previous calls on this machine.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const HOME = os.homedir();
const MF_DIR = process.env.MEMORYFORGE_HOME ?? path.join(HOME, ".memory-forge");
const CLOCK_PATH = path.join(MF_DIR, "clock.json");

interface ClockState {
  wall: number; // last wall clock millis
  counter: number; // logical counter (advances when wall doesn't)
}

let state: ClockState | null = null;
let dirty = false;

function loadState(): ClockState {
  if (state) return state;
  try {
    if (fs.existsSync(CLOCK_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CLOCK_PATH, "utf-8"));
      if (
        typeof raw.wall === "number" &&
        typeof raw.counter === "number" &&
        isFinite(raw.wall) &&
        isFinite(raw.counter)
      ) {
        state = { wall: raw.wall, counter: raw.counter };
        return state;
      }
    }
  } catch {
    /* corrupted — reinitialize */
  }
  state = { wall: Date.now(), counter: 0 };
  dirty = true;
  return state;
}

function persistState(): void {
  if (!dirty) return;
  try {
    if (!fs.existsSync(MF_DIR)) fs.mkdirSync(MF_DIR, { recursive: true });
    const tmpPath = path.join(os.tmpdir(), `.mf-clock-${process.pid}-${Date.now()}`);
    fs.writeFileSync(tmpPath, JSON.stringify(state));
    fs.renameSync(tmpPath, CLOCK_PATH);
    dirty = false;
  } catch {
    /* best-effort persistence — in-memory state is still valid */
  }
}

/**
 * Returns a strictly increasing numeric timestamp (milliseconds).
 * Guaranteed monotonic across all calls on this machine.
 */
export function now(): number {
  const s = loadState();
  const wallMs = Date.now();

  // If wall clock advanced, use it and reset counter
  if (wallMs > s.wall) {
    s.wall = wallMs;
    s.counter = 0;
    dirty = true;
    persistState();
    return s.wall;
  }

  // Wall clock didn't advance (or jumped backward) — increment counter
  s.counter++;
  dirty = true;
  persistState();
  return s.wall + s.counter;
}

/**
 * Returns an ISO 8601 string from the HLC, for use in memory.created_at fields.
 */
export function nowISO(): string {
  return new Date(now()).toISOString();
}

/**
 * Advance the local clock to be strictly ahead of a remote timestamp.
 * Called when receiving memories from another device with a potentially
 * different wall clock.
 */
export function tick(remoteHlc?: number): void {
  if (!remoteHlc || !isFinite(remoteHlc)) return;
  const s = loadState();
  if (remoteHlc >= s.wall + s.counter) {
    // Advance past the remote timestamp
    s.wall = remoteHlc;
    s.counter = 1; // +1 so we're strictly ahead
    dirty = true;
    persistState();
  }
}

/**
 * Flush clock state to disk. Call before process exit for durability.
 */
export function sync(): void {
  persistState();
}

/**
 * Reset clock state (for testing only).
 */
export function _resetForTest(): void {
  state = null;
  dirty = false;
  try {
    if (fs.existsSync(CLOCK_PATH)) fs.unlinkSync(CLOCK_PATH);
  } catch {
    /* ignore */
  }
}
