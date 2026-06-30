/**
 * Pending sync operation queue.
 *
 * When cloud uploads or tombstone operations fail (network issues, auth
 * errors, rate limits), they're enqueued here for retry on the next sync
 * cycle. The queue is file-backed so it survives process restarts.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { Memory } from "./store.js";

const HOME = os.homedir();
const MF_DIR = process.env.MEMORYFORGE_HOME ?? path.join(HOME, ".memory-forge");
const QUEUE_PATH = path.join(MF_DIR, "sync-queue.json");

const MAX_ENTRIES = 1000;
const MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours

/** A pending sync operation. */
export interface SyncOperation {
  id: string; // memory ID (for dedup)
  type: "upload" | "tombstone";
  memory?: Memory; // present for uploads
  memoryId: string; // always present
  projectHash?: string; // for tombstone blob naming
  createdAt: string; // ISO timestamp
  retries: number;
}

export class SyncQueue {
  /** Load queue from disk. */
  private load(): SyncOperation[] {
    try {
      if (!fs.existsSync(QUEUE_PATH)) return [];
      const raw = fs.readFileSync(QUEUE_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      // Filter expired entries
      const cutoff = Date.now() - MAX_AGE_MS;
      return parsed.filter(
        (e: any) =>
          e &&
          typeof e.id === "string" &&
          (e.type === "upload" || e.type === "tombstone") &&
          new Date(e.createdAt).getTime() > cutoff,
      );
    } catch {
      return [];
    }
  }

  /** Persist queue to disk atomically. */
  private save(ops: SyncOperation[]): void {
    try {
      if (!fs.existsSync(MF_DIR)) fs.mkdirSync(MF_DIR, { recursive: true });
      const tmpPath = path.join(os.tmpdir(), `.mf-queue-${process.pid}-${Date.now()}`);
      fs.writeFileSync(tmpPath, JSON.stringify(ops, null, 2));
      fs.renameSync(tmpPath, QUEUE_PATH);
    } catch {
      /* best-effort — in-memory queue is lost on process exit, but the
         operations were already failed before entering the queue anyway */
    }
  }

  /** Add an operation to the queue (dedup by id+type). */
  enqueue(op: Omit<SyncOperation, "createdAt" | "retries">): void {
    const ops = this.load();
    // Dedup: skip if same id+type already queued
    if (ops.some((e) => e.id === op.id && e.type === op.type)) return;

    if (ops.length >= MAX_ENTRIES) {
      console.error("[MemoryForge] Sync queue full — dropping oldest entry");
      ops.shift();
    }

    ops.push({
      ...op,
      createdAt: new Date().toISOString(),
      retries: 0,
    });

    this.save(ops);
  }

  /** Get all pending operations without removing them. */
  peek(): SyncOperation[] {
    return this.load();
  }

  /** Get the number of pending operations. */
  size(): number {
    return this.load().length;
  }

  /** Remove a specific operation from the queue. */
  remove(id: string, type: "upload" | "tombstone"): void {
    const ops = this.load().filter((e) => !(e.id === id && e.type === type));
    this.save(ops);
  }

  /**
   * Drain all pending operations and clear the queue.
   * Caller is responsible for processing them.
   * Increments retry count on each entry.
   */
  drain(): SyncOperation[] {
    const ops = this.load();
    // Increment retries and save back
    for (const op of ops) op.retries++;
    this.save(ops);
    return ops;
  }

  /** Confirm a batch of operations as successfully processed (remove from queue). */
  confirm(ops: SyncOperation[]): void {
    const ids = new Set(ops.map((o) => `${o.id}:${o.type}`));
    const remaining = this.load().filter((e) => !ids.has(`${e.id}:${e.type}`));
    this.save(remaining);
  }

  /** Re-enqueue operations that failed again (with updated retry count). */
  reEnqueue(ops: SyncOperation[]): void {
    const current = this.load();
    for (const op of ops) {
      // Replace existing or append
      const idx = current.findIndex((e) => e.id === op.id && e.type === op.type);
      if (idx >= 0) current[idx] = op;
      else current.push(op);
    }
    this.save(current);
  }
}
