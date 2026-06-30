/**
 * Tests for Hybrid Logical Clock.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { now, nowISO, tick, sync, _resetForTest } from "../src/clock.js";

describe("clock", () => {
  beforeEach(() => {
    _resetForTest();
  });

  describe("now()", () => {
    it("returns a positive number", () => {
      expect(now()).toBeGreaterThan(0);
    });

    it("returns increasing values (counter advances when wall clock stalls)", () => {
      const a = now();
      const b = now();
      // Within same process, b >= a always (counter guarantee)
      expect(b).toBeGreaterThanOrEqual(a);
    });

    it("can be called many times without error", () => {
      for (let i = 0; i < 100; i++) {
        expect(() => now()).not.toThrow();
      }
    });
  });

  describe("nowISO()", () => {
    it("returns a valid ISO 8601 string", () => {
      expect(nowISO()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe("tick()", () => {
    it("advances clock past a remote HLC value", () => {
      const local = now();
      tick(local + 100_000);
      expect(now()).toBeGreaterThan(local + 100_000);
    });

    it("does not throw on undefined or NaN", () => {
      tick(undefined);
      tick(NaN);
      expect(now()).toBeGreaterThan(0);
    });
  });

  describe("persistence", () => {
    it("sync() writes without throwing", () => {
      now();
      expect(() => sync()).not.toThrow();
    });

    it("_resetForTest() clears state for fresh start", () => {
      now();
      _resetForTest();
      // Should not throw after reset
      expect(now()).toBeGreaterThan(0);
    });
  });
});
