import { describe, it, expect, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MemoryStore } from "../src/store.js";
import { register as registerModelInfo } from "../src/tools/model-info.js";
import { makeMemory } from "./test-helpers.js";

vi.mock("../src/embedding.js", () => ({
  modelName: vi.fn().mockReturnValue("Xenova/all-MiniLM-L6-v2"),
  modelLabel: vi.fn().mockReturnValue("all-MiniLM-L6-v2 (English, 384d, 23MB)"),
  modelDimension: vi.fn().mockReturnValue(384),
  modelStatus: vi.fn().mockReturnValue("ready"),
}));

describe("model_info tool", () => {
  it("returns current model info", async () => {
    const store = new MemoryStore();
    store.add(makeMemory({ id: "a", vector: [0.1, 0.2, 0.3] }));
    store.add(makeMemory({ id: "b", vector: [] }));

    let capturedHandler: ((params: unknown) => Promise<{
      content: Array<{ type: string; text: string }>;
    }>) | null = null;

    const mockServer = {
      registerTool: vi.fn(
        (_name: string, _config: unknown, handler: typeof capturedHandler) => {
          capturedHandler = handler;
        },
      ),
    } as unknown as McpServer;

    registerModelInfo(mockServer, { store, version: "0.8.2", hasPro: false });

    const result = await capturedHandler!({});
    const body = JSON.parse(result.content[0].text);
    expect(body.current_model).toBe("Xenova/all-MiniLM-L6-v2");
    expect(body.label).toContain("all-MiniLM-L6-v2");
    expect(body.dimension).toBe(384);
    expect(body.status).toBe("ready");
    expect(body.env_var).toBe("MEMORY_FORGE_MODEL");
    expect(body.total_memories).toBe(2);
    expect(body.memories_with_vector).toBe(1);
    expect(body.memories_without_vector).toBe(1);
    expect(body.available_aliases).toHaveLength(2);
  });

  it("shows hint when degraded", async () => {
    const { modelStatus } = await import("../src/embedding.js");
    vi.mocked(modelStatus).mockReturnValue("degraded");

    const store = new MemoryStore();
    let capturedHandler: ((params: unknown) => Promise<{
      content: Array<{ type: string; text: string }>;
    }>) | null = null;

    const mockServer = {
      registerTool: vi.fn(
        (_name: string, _config: unknown, handler: typeof capturedHandler) => {
          capturedHandler = handler;
        },
      ),
    } as unknown as McpServer;

    registerModelInfo(mockServer, { store, version: "0.8.2", hasPro: false });

    const result = await capturedHandler!({});
    const body = JSON.parse(result.content[0].text);
    expect(body.status).toBe("degraded");
    expect(body.hint).toContain("keyword matching");
  });
});
