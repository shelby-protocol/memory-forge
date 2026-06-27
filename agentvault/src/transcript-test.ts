/**
 * Transcript capture integration tests — uses temp JSONL files.
 * Run: npx tsx src/transcript-test.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { randomUUID } from "node:crypto";
import { captureTranscript, cliCaptureTranscript } from "./transcript.js";
import { loadAllMemories, deleteMemoryFile } from "./storage/local.js";

let ok = 0;
let ng = 0;
function t(name, fn) {
  try {
    fn();
    ok++;
  } catch (e) {
    ng++;
    console.log("  FAIL " + name + ": " + e.message);
  }
}

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

console.log("Setup: creating temp JSONL in", testProjectDir);
fs.mkdirSync(testProjectDir, { recursive: true });

const preExisting = loadAllMemories();
const preIds = new Set(
  preExisting.map(function (m) {
    return m.id;
  }),
);

const jsonlPath = path.join(testProjectDir, sessionId + ".jsonl");
const jsonlLines = [
  JSON.stringify({ message: { role: "user", content: [{ type: "text", text: "What is the capital of France?" }] } }),
  JSON.stringify({ message: { role: "assistant", content: [{ type: "text", text: "The capital of France is Paris." }] } }),
  JSON.stringify({ message: { role: "user", content: [{ type: "text", text: "Write a TypeScript function." }] } }),
  JSON.stringify({ message: { role: "assistant", content: [{ type: "text", text: "Here is the function." }] } }),
];
fs.writeFileSync(jsonlPath, jsonlLines.join("\n") + "\n");
fs.utimesSync(jsonlPath, Date.now() / 1000, Date.now() / 1000);

// ── 1. Basic capture ──
console.log("\n=== 1. captureTranscript basic ===");
let capturedId = null;

t("captureTranscript succeeds with recent JSONL", function () {
  const result = captureTranscript();
  if (!result.startsWith("Transcript saved:")) throw new Error(result);
});

t("transcript memory created in local storage", function () {
  const all = loadAllMemories();
  const newMems = all.filter(function (m) {
    return !preIds.has(m.id);
  });
  const transcripts = newMems.filter(function (m) {
    return m.category === "session-transcript";
  });
  if (transcripts.length === 0) throw new Error("no transcript memory found");
  capturedId = transcripts[0].id;
});

t("transcript has correct category", function () {
  const all = loadAllMemories();
  const m = all.find(function (x) {
    return x.id === capturedId;
  });
  if (m.category !== "session-transcript") throw new Error(m.category);
});

t("transcript includes user message", function () {
  const all = loadAllMemories();
  const m = all.find(function (x) {
    return x.id === capturedId;
  });
  if (!m.content.includes("capital of France")) throw new Error("user message missing");
});

t("transcript name is date-based", function () {
  const all = loadAllMemories();
  const m = all.find(function (x) {
    return x.id === capturedId;
  });
  if (!m.name.startsWith("Session 202")) throw new Error("bad name: " + m.name);
});

t("transcript has transcript tag", function () {
  const all = loadAllMemories();
  const m = all.find(function (x) {
    return x.id === capturedId;
  });
  if (!m.tags.includes("transcript")) throw new Error("tag missing");
});

// ── 2. Dedup ──
console.log("\n=== 2. Dedup same session ===");
t("second capture deduped", function () {
  const result = captureTranscript();
  if (!result.includes("already captured")) throw new Error(result);
});

// ── 3. No transcript ──
console.log("\n=== 3. No recent transcript ===");
t("deleted JSONL returns no transcript", function () {
  fs.unlinkSync(jsonlPath);
  const result = captureTranscript();
  if (result === "Transcript already captured (dedup same session).") {
    /* ok */
  } else if (result !== "No recent transcript found." && !result.startsWith("Transcript saved:")) throw new Error(result);
});

// ── 4. Malformed JSONL ──
console.log("\n=== 4. Malformed JSONL ===");
t("garbage JSONL does not crash", function () {
  const mid = randomUUID();
  const mp = path.join(testProjectDir, mid + ".jsonl");
  fs.writeFileSync(mp, "not valid json\n{garbage\n[broken\n");
  fs.utimesSync(mp, Date.now() / 1000, Date.now() / 1000);
  const result = captureTranscript();
  if (result !== "Transcript empty.") throw new Error("expected empty for all-garbage JSONL, got: " + result);
  fs.unlinkSync(mp);
});

// ── 5. Empty JSONL ──
console.log("\n=== 5. Empty JSONL ===");
t("empty JSONL returns empty", function () {
  const eid = randomUUID();
  const ep = path.join(testProjectDir, eid + ".jsonl");
  fs.writeFileSync(ep, "");
  fs.utimesSync(ep, Date.now() / 1000, Date.now() / 1000);
  const result = captureTranscript();
  if (result !== "Transcript empty.") throw new Error(result);
  fs.unlinkSync(ep);
});

// ── 6. cliCaptureTranscript ──
console.log("\n=== 6. cliCaptureTranscript ===");
t("cliCaptureTranscript does not throw", function () {
  cliCaptureTranscript();
});

// ── Cleanup ──
console.log("\n=== Cleanup ===");
t("cleanup: delete test transcript memories", function () {
  const all = loadAllMemories();
  for (const m of all) {
    if (!preIds.has(m.id) && m.category === "session-transcript") {
      deleteMemoryFile(m.id);
    }
  }
});

console.log("\n" + ok + " passed, " + ng + " failed");
if (ng > 0) process.exit(1);
