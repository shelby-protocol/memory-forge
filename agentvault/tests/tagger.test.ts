import { describe, it, expect } from "vitest";
import { normalizeContent, inferCategory, suggestTags, analyzeMemory } from "../src/auto/tagger.js";

describe("normalizeContent", () => {
  it("strips code blocks", () => {
    const r = normalizeContent("Hello ```\nconst x = 1;\n``` world");
    expect(r).not.toContain("```");
    expect(r).not.toContain("const x");
    expect(r).toContain("Hello");
    expect(r).toContain("world");
  });

  it("strips inline code", () => {
    const r = normalizeContent("Use `react` and `typescript`");
    expect(r).not.toContain("`");
    expect(r).toMatch(/Use\s+and/);
  });

  it("collapses whitespace", () => {
    const r = normalizeContent("hello    world\n\n\nfoo");
    expect(r).toBe("hello world foo");
  });

  it("handles empty", () => {
    expect(normalizeContent("")).toBe("");
  });
});

describe("inferCategory", () => {
  it("detects code pattern from code blocks", () => {
    expect(inferCategory("```ts\nconst x: string = 'hello'\nexport default x\n```")).toBe("code-pattern");
  });

  it("detects decision-log from chose/decided", () => {
    expect(inferCategory("We chose PostgreSQL over MySQL for JSONB support")).toBe("decision-log");
    expect(inferCategory("Decided to use Redis for caching")).toBe("decision-log");
  });

  it("detects user-preference from prefer/always/convention", () => {
    expect(inferCategory("Always use 2-space indentation in TypeScript projects")).toBe("user-preference");
    expect(inferCategory("Prefer single quotes over double quotes")).toBe("user-preference");
  });

  it("detects project-context from architecture/deploy/build", () => {
    expect(inferCategory("The project uses a monorepo with pnpm workspaces and Turborepo")).toBe("project-context");
  });

  it("returns null for ambiguous content", () => {
    expect(inferCategory("hello world")).toBeNull();
  });
});

describe("suggestTags", () => {
  it("detects react + typescript", () => {
    const tags = suggestTags("Using React 19 with TypeScript strict mode, useState and useEffect hooks");
    expect(tags).toContain("react");
    expect(tags).toContain("typescript");
  });

  it("detects docker + deployment", () => {
    const tags = suggestTags("Deploy via Docker container to Kubernetes on Vercel production");
    expect(tags).toContain("docker");
    expect(tags).toContain("deployment");
  });

  it("detects auth + api + security", () => {
    const tags = suggestTags("JWT authentication with OAuth2 for REST API endpoints, CSRF protection enabled");
    expect(tags).toContain("auth");
    expect(tags).toContain("api");
    expect(tags).toContain("security");
  });

  it("detects postgresql + database", () => {
    const tags = suggestTags("PostgreSQL migration with Prisma ORM for database schema management");
    expect(tags).toContain("postgresql");
    expect(tags).toContain("database");
  });

  it("detects llm from openai/anthropic mention", () => {
    const tags = suggestTags("Using Anthropic Claude API for prompt engineering and embedding generation");
    expect(tags).toContain("llm");
  });

  it("detects code-snippet from code blocks", () => {
    const tags = suggestTags("Here is a pattern:\n```ts\nfunction hello() { return 'world' }\n```");
    expect(tags).toContain("code-snippet");
  });

  it("detects url-reference from URLs", () => {
    const tags = suggestTags("See https://docs.example.com for details");
    expect(tags).toContain("url-reference");
  });

  it("caps at reasonable limit", () => {
    const tags = suggestTags(
      "React TypeScript Node.js PostgreSQL Redis Docker Kubernetes API auth security " +
        "deploy database testing CI CD git monorepo llm python rust go css",
    );
    expect(tags.length).toBeLessThanOrEqual(8);
  });

  it("returns empty for no matches", () => {
    const tags = suggestTags("foo bar baz qux");
    expect(tags).toEqual([]);
  });
});

describe("analyzeMemory", () => {
  it("returns full analysis", () => {
    const result = analyzeMemory("Prefer React 19 with TypeScript strict mode for all new projects");
    expect(result.suggested_category).toBe("user-preference");
    expect(result.suggested_tags).toContain("react");
    expect(result.suggested_tags).toContain("typescript");
  });

  it("respects existing tags when provided", () => {
    const result = analyzeMemory("some content", undefined, ["custom-tag"]);
    expect(result.suggested_tags).toEqual(["custom-tag"]);
  });

  it("detects code blocks", () => {
    const result = analyzeMemory("```ts\nconst x = 1;\n```");
    expect(result.is_code).toBe(true);
  });

  it("detects URLs", () => {
    const result = analyzeMemory("See https://example.com for docs");
    expect(result.has_urls).toBe(true);
  });
});
