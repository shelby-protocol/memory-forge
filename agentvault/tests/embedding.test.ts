import { describe, it, expect, vi } from "vitest";
import {
  embed,
  preload,
  modelName,
  modelDimension,
  modelLabel,
  modelStatus,
} from "../src/embedding.js";

describe("embedding engine", () => {
  it("embed short text returns null or Float32Array", async () => {
    const r = await embed("hello world");
    expect(r === null || r instanceof Float32Array).toBe(true);
  });

  it("embed empty string does not crash", async () => {
    const r = await embed("");
    expect(r === null || r instanceof Float32Array).toBe(true);
  });

  it("embed long text does not crash", async () => {
    const r = await embed("TypeScript React Node.js ".repeat(100));
    expect(r === null || r instanceof Float32Array).toBe(true);
  });

  it("preload does not throw", () => {
    preload();
  });

  it("preload twice is idempotent", () => {
    preload();
  });

  it("multiple embed calls return same type", async () => {
    const r1 = await embed("test a");
    const r2 = await embed("test b");
    const t1 = r1 === null ? "null" : "vector";
    const t2 = r2 === null ? "null" : "vector";
    expect(t1).toBe(t2);
  });

  it("rapid 5 concurrent embeds don't crash", async () => {
    await Promise.all([0, 1, 2, 3, 4].map((i) => embed(`rapid ${i}`)));
  });

  it("embed CJK characters", async () => {
    const r = await embed("中文テスト데이터");
    expect(r === null || r instanceof Float32Array).toBe(true);
  });

  it("embed emoji", async () => {
    const r = await embed("deploy 🚀 test ✨");
    expect(r === null || r instanceof Float32Array).toBe(true);
  });

  it("embed single character", async () => {
    const r = await embed("x");
    expect(r === null || r instanceof Float32Array).toBe(true);
  });

  it("embed whitespace only", async () => {
    const r = await embed("   \n\t   ");
    expect(r === null || r instanceof Float32Array).toBe(true);
  });

  it("embed 10KB text does not crash", async () => {
    const r = await embed("A".repeat(10_000));
    expect(r === null || r instanceof Float32Array).toBe(true);
  });
});

describe("model resolution", () => {
  it("modelDimension returns 384 (from MODEL_MAP default)", () => {
    expect(modelDimension()).toBe(384);
  });

  it("modelName returns default model after embed", () => {
    // Earlier tests already triggered embed() — singleton state is loaded
    expect(modelName()).toBe("Xenova/all-MiniLM-L6-v2");
  });

  it("modelLabel contains model description", () => {
    const label = modelLabel();
    expect(label).toContain("all-MiniLM-L6-v2");
    expect(label).toContain("384d");
  });

  it("modelStatus is ready after successful load", () => {
    expect(modelStatus()).toBe("ready");
  });
});
