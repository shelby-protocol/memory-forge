/**
 * Embedding engine edge case tests — graceful degradation when model unavailable.
 * Run: npx tsx src/embed-test.ts
 */
import { embed, preload } from "./embedding.js";

let ok = 0;
let ng = 0;
async function t(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    ok++;
    console.log(`  ✅ ${name}`);
  } catch (e: any) {
    ng++;
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

console.log("=== Embedding tests ===");

await t("embed short text returns null or Float32Array", async () => {
  const r = await embed("hello world");
  if (r !== null && !(r instanceof Float32Array)) throw new Error(`bad type: ${typeof r}`);
});

await t("embed empty string does not crash", async () => {
  const r = await embed("");
  if (r !== null && !(r instanceof Float32Array)) throw new Error(`bad type: ${typeof r}`);
});

await t("embed long text does not crash", async () => {
  const r = await embed("TypeScript React Node.js ".repeat(100));
  if (r !== null && !(r instanceof Float32Array)) throw new Error(`bad type: ${typeof r}`);
});

await t("preload does not throw", async () => {
  preload();
});
await t("preload twice is idempotent", async () => {
  preload();
});

await t("multiple embed calls return same type", async () => {
  const r1 = await embed("test a");
  const r2 = await embed("test b");
  const t1 = r1 === null ? "null" : "vector";
  const t2 = r2 === null ? "null" : "vector";
  if (t1 !== t2) throw new Error(`inconsistent: ${t1} vs ${t2}`);
});

await t("rapid 5 concurrent embeds don't crash", async () => {
  await Promise.all([0, 1, 2, 3, 4].map((i) => embed(`rapid ${i}`)));
});

await t("embed CJK characters", async () => {
  const r = await embed("中文テスト데이터");
  if (r !== null && !(r instanceof Float32Array)) throw new Error(`bad type: ${typeof r}`);
});

await t("embed emoji", async () => {
  const r = await embed("deploy 🚀 test ✨");
  if (r !== null && !(r instanceof Float32Array)) throw new Error(`bad type: ${typeof r}`);
});

await t("embed single character", async () => {
  const r = await embed("x");
  if (r !== null && !(r instanceof Float32Array)) throw new Error(`bad type: ${typeof r}`);
});

await t("embed whitespace only", async () => {
  const r = await embed("   \n\t   ");
  if (r !== null && !(r instanceof Float32Array)) throw new Error(`bad type: ${typeof r}`);
});

await t("embed 10KB text does not crash", async () => {
  const r = await embed("A".repeat(10_000));
  if (r !== null && !(r instanceof Float32Array)) throw new Error(`bad type: ${typeof r}`);
});

console.log(`\n${ok} passed, ${ng} failed`);
if (ng > 0) process.exit(1);
