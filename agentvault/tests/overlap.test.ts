import { describe, it, expect } from "vitest";
import { contentOverlap, safeTruncate } from "../src/store.js";

describe("contentOverlap (char 3-gram Jaccard)", () => {
  it("short tech terms partial overlap", () => {
    const score = contentOverlap("AI model deployed", "DB model deployed");
    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThan(0.9);
  });

  it("identical strings = 1.0", () => {
    expect(contentOverlap("React 19 TypeScript hooks pattern", "React 19 TypeScript hooks pattern")).toBe(1.0);
  });

  it("completely different = near 0", () => {
    expect(contentOverlap("apple banana cherry", "xylophone zebra quantum")).toBeLessThan(0.1);
  });

  it("typo tolerance for near-duplicate", () => {
    expect(contentOverlap("database migration failed", "database migration faild")).toBeGreaterThan(0.7);
  });
});

describe("safeTruncate (Unicode-safe)", () => {
  it("short string unchanged", () => {
    expect(safeTruncate("hello", 10)).toBe("hello");
  });

  it("handles emoji safely", () => {
    const text = "Hello 🚀💻🔥 world!";
    const result = safeTruncate(text, 8);
    expect(result).not.toContain("�");
  });

  it("preserves ZWJ family emoji", () => {
    const text = "family 👨‍👩‍👦 test";
    const result = safeTruncate(text, 8);
    expect(result).not.toContain("�");
  });

  it("truncates Chinese text safely", () => {
    const text = "你好世界这是一个测试文本";
    const result = safeTruncate(text, 5);
    expect(result).not.toContain("�");
    expect(result.length).toBeLessThan(text.length);
  });
});
