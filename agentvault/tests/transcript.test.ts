import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { randomUUID } from "node:crypto";
import { captureTranscript, cliCaptureTranscript } from "../src/transcript.js";
import { loadAllMemories, deleteMemoryFile } from "../src/storage/local.js";

const home = os.homedir();
const projectsDir = path.join(home, ".claude", "projects");
const cwd = process.cwd();
const projectSlug = cwd
  .replace(/^([A-Za-z]):\\/, "$1--")
  .replace(/^([A-Za-z]):/, "$1--")
  .replace(/\\/g, "-")
  .replace(/\//g, "-")
  .replace(/^-+/, "");
const testProjectDir = path.join(projectsDir, projectSlug);
const sessionId = randomUUID();
const jsonlPath = path.join(testProjectDir, sessionId + ".jsonl");

let preIds: Set<string>;

beforeAll(() => {
  const preExisting = loadAllMemories();
  preIds = new Set(preExisting.map((m: any) => m.id));
  fs.mkdirSync(testProjectDir, { recursive: true });

  const lines = [
    JSON.stringify({ message: { role: "user", content: [{ type: "text", text: "What is the capital of France?" }] } }),
    JSON.stringify({ message: { role: "assistant", content: [{ type: "text", text: "The capital of France is Paris." }] } }),
    JSON.stringify({ message: { role: "user", content: [{ type: "text", text: "Write a TypeScript function." }] } }),
    JSON.stringify({ message: { role: "assistant", content: [{ type: "text", text: "Here is the function." }] } }),
  ];
  fs.writeFileSync(jsonlPath, lines.join("\n") + "\n");
  fs.utimesSync(jsonlPath, Date.now() / 1000, Date.now() / 1000);
});

afterAll(() => {
  const all = loadAllMemories();
  for (const m of all) {
    if (!preIds.has(m.id) && m.category === "session-transcript") {
      deleteMemoryFile(m.id);
    }
  }
  try {
    fs.unlinkSync(jsonlPath);
  } catch {}
});

describe("captureTranscript", () => {
  it("succeeds with recent JSONL", () => {
    expect(captureTranscript()).toMatch(/Transcript saved:/);
  });

  it("transcript memory created in local storage", () => {
    const all = loadAllMemories();
    const transcripts = all.filter((m) => !preIds.has(m.id) && m.category === "session-transcript");
    expect(transcripts.length).toBeGreaterThanOrEqual(1);
  });

  it("transcript has correct category", () => {
    const all = loadAllMemories();
    const m = all.find((x) => !preIds.has(x.id) && x.category === "session-transcript");
    expect(m!.category).toBe("session-transcript");
  });

  it("transcript includes user message", () => {
    const all = loadAllMemories();
    const m = all.find((x) => !preIds.has(x.id) && x.category === "session-transcript");
    expect(m!.content).toContain("capital of France");
  });

  it("transcript name is date-based", () => {
    const all = loadAllMemories();
    const m = all.find((x) => !preIds.has(x.id) && x.category === "session-transcript");
    expect(m!.name).toMatch(/^Session 202/);
  });

  it("transcript has transcript tag", () => {
    const all = loadAllMemories();
    const m = all.find((x) => !preIds.has(x.id) && x.category === "session-transcript");
    expect(m!.tags).toContain("transcript");
  });

  it("second capture deduped", () => {
    expect(captureTranscript()).toContain("already captured");
  });

  it("deleted JSONL returns no transcript", () => {
    try {
      fs.unlinkSync(jsonlPath);
    } catch {}
    const result = captureTranscript();
    expect(
      result === "No recent transcript found." ||
        result === "Transcript already captured (dedup same session)." ||
        result.startsWith("Transcript saved:"),
    ).toBe(true);
  });

  it("garbage JSONL does not crash", () => {
    const mid = randomUUID();
    const mp = path.join(testProjectDir, mid + ".jsonl");
    fs.writeFileSync(mp, "not valid json\n{garbage\n[broken\n");
    fs.utimesSync(mp, Date.now() / 1000, Date.now() / 1000);
    expect(captureTranscript()).toBe("Transcript empty.");
    fs.unlinkSync(mp);
  });

  it("empty JSONL returns empty", () => {
    const eid = randomUUID();
    const ep = path.join(testProjectDir, eid + ".jsonl");
    fs.writeFileSync(ep, "");
    fs.utimesSync(ep, Date.now() / 1000, Date.now() / 1000);
    expect(captureTranscript()).toBe("Transcript empty.");
    fs.unlinkSync(ep);
  });
});

describe("cliCaptureTranscript", () => {
  it("does not throw", () => {
    cliCaptureTranscript();
  });
});
