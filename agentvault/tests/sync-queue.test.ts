/**
 * Tests for SyncQueue — pending upload/tombstone queue.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { SyncQueue, SyncOperation } from "../src/sync-queue.js";

const MF_DIR = process.env.MEMORYFORGE_HOME ?? path.join(os.homedir(), ".memory-forge");
const QUEUE_PATH = path.join(MF_DIR, "sync-queue.json");

function cleanQueue() {
  try {
    if (fs.existsSync(QUEUE_PATH)) fs.unlinkSync(QUEUE_PATH);
  } catch {
    /* ignore */
  }
}

function makeUploadOp(id: string): Omit<SyncOperation, "createdAt" | "retries"> {
  return {
    id,
    type: "upload",
    memoryId: id,
    memory: {
      id,
      name: "test",
      content: "test content for upload queue",
      category: "general",
      tags: [],
      priority: 5,
      vector: [],
      created_at: new Date().toISOString(),
      access_count: 0,
      last_accessed: null,
    },
  };
}

function makeTombstoneOp(id: string): Omit<SyncOperation, "createdAt" | "retries"> {
  return {
    id,
    type: "tombstone",
    memoryId: id,
  };
}

describe("SyncQueue", () => {
  beforeEach(() => {
    cleanQueue();
  });

  afterEach(() => {
    cleanQueue();
  });

  describe("enqueue + peek", () => {
    it("stores and retrieves operations", () => {
      const queue = new SyncQueue();
      queue.enqueue(makeUploadOp("mem-1"));
      const items = queue.peek();
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe("mem-1");
      expect(items[0].type).toBe("upload");
    });

    it("deduplicates by id + type", () => {
      const queue = new SyncQueue();
      queue.enqueue(makeUploadOp("mem-1"));
      queue.enqueue(makeUploadOp("mem-1"));
      expect(queue.size()).toBe(1);
    });

    it("allows same id with different types", () => {
      const queue = new SyncQueue();
      queue.enqueue(makeUploadOp("mem-1"));
      queue.enqueue(makeTombstoneOp("mem-1"));
      expect(queue.size()).toBe(2);
    });

    it("sets createdAt and retries=0 on enqueue", () => {
      const queue = new SyncQueue();
      queue.enqueue(makeUploadOp("mem-1"));
      const [item] = queue.peek();
      expect(item.createdAt).toBeDefined();
      expect(item.retries).toBe(0);
    });
  });

  describe("size", () => {
    it("returns 0 for empty queue", () => {
      const queue = new SyncQueue();
      expect(queue.size()).toBe(0);
    });

    it("returns correct count", () => {
      const queue = new SyncQueue();
      queue.enqueue(makeUploadOp("a"));
      queue.enqueue(makeUploadOp("b"));
      queue.enqueue(makeUploadOp("c"));
      expect(queue.size()).toBe(3);
    });
  });

  describe("drain", () => {
    it("returns all items and increments retries", () => {
      const queue = new SyncQueue();
      queue.enqueue(makeUploadOp("a"));
      queue.enqueue(makeUploadOp("b"));

      const drained = queue.drain();
      expect(drained).toHaveLength(2);
      // Items still in queue (retry count incremented)
      expect(queue.size()).toBe(2);
      expect(drained[0].retries).toBe(1);
    });

    it("returns empty array when queue is empty", () => {
      const queue = new SyncQueue();
      expect(queue.drain()).toHaveLength(0);
    });
  });

  describe("confirm", () => {
    it("removes confirmed operations from queue", () => {
      const queue = new SyncQueue();
      queue.enqueue(makeUploadOp("a"));
      queue.enqueue(makeUploadOp("b"));

      const drained = queue.drain();
      queue.confirm(drained.slice(0, 1)); // confirm only 'a'

      expect(queue.size()).toBe(1);
      expect(queue.peek()[0].id).toBe("b");
    });
  });

  describe("reEnqueue", () => {
    it("updates existing operations with new retry counts", () => {
      const queue = new SyncQueue();
      queue.enqueue(makeUploadOp("a"));

      const drained = queue.drain();
      drained[0].retries = 3;
      queue.reEnqueue(drained);

      const items = queue.peek();
      expect(items[0].retries).toBe(3);
    });

    it("adds operations not already in queue", () => {
      const queue = new SyncQueue();
      queue.enqueue(makeUploadOp("a"));

      const ops: SyncOperation[] = [
        {
          id: "b",
          type: "upload",
          memoryId: "b",
          createdAt: new Date().toISOString(),
          retries: 1,
        },
      ];
      queue.reEnqueue(ops);

      expect(queue.size()).toBe(2);
    });
  });

  describe("remove", () => {
    it("removes a specific operation", () => {
      const queue = new SyncQueue();
      queue.enqueue(makeUploadOp("a"));
      queue.enqueue(makeUploadOp("b"));

      queue.remove("a", "upload");
      expect(queue.size()).toBe(1);
      expect(queue.peek()[0].id).toBe("b");
    });
  });

  describe("persistence", () => {
    it("survives queue reconstruction", () => {
      const queue1 = new SyncQueue();
      queue1.enqueue(makeUploadOp("persist-1"));
      queue1.enqueue(makeTombstoneOp("persist-2"));

      const queue2 = new SyncQueue();
      expect(queue2.size()).toBe(2);
      const items = queue2.peek();
      expect(items.map((i) => i.id).sort()).toEqual(["persist-1", "persist-2"]);
    });

    it("handles corrupted queue file gracefully", () => {
      // Write invalid JSON
      const dir = path.dirname(QUEUE_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(QUEUE_PATH, "not-valid-json{{{");

      const queue = new SyncQueue();
      expect(queue.size()).toBe(0); // reset to empty
      queue.enqueue(makeUploadOp("recovery"));
      expect(queue.size()).toBe(1);
    });
  });
});
