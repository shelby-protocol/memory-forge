/**
 * Shelby cloud storage (Pro tier).
 * Uses @shelby-protocol/sdk + @aptos-labs/ts-sdk — both optionalDependencies.
 * All SDK imports are dynamic to prevent crashes for free-tier users
 * when optional packages fail to install.
 */

import type { Memory } from "../store.js";
import type { ShelbyNodeClient } from "@shelby-protocol/sdk/node";
import type { Account } from "@aptos-labs/ts-sdk";
import * as fs from "node:fs";
import * as path from "node:path";

const DOWNLOAD_TIMEOUT_MS = 30_000;
const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "/tmp";
const PROFILE_PATH = path.join(HOME, ".memory-forge", "pro.json");

// SDK references — populated lazily by loadShelbySdk()
let ShelbyNCtor: new (...args: any[]) => ShelbyNodeClient | null = null as any;
let AccountClass: any = null;
let Ed25519Class: any = null;
let NetworkEnum: any = null;
let sdkLoadAttempted = false;
let sdkLoadFailed = false;

let client: ShelbyNodeClient | null = null;
let account: Account | null = null;
let authFailed = false;
let uploadFailCount = 0;

async function loadShelbySdk(): Promise<boolean> {
  if (sdkLoadAttempted) return !sdkLoadFailed;
  sdkLoadAttempted = true;
  try {
    const [shelbyModule, aptosModule] = await Promise.all([
      import("@shelby-protocol/sdk/node"),
      import("@aptos-labs/ts-sdk"),
    ]);
    ShelbyNCtor = shelbyModule.ShelbyNodeClient;
    AccountClass = aptosModule.Account;
    Ed25519Class = aptosModule.Ed25519PrivateKey;
    NetworkEnum = aptosModule.Network;
    if (!ShelbyNCtor || !AccountClass || !Ed25519Class || !NetworkEnum) {
      sdkLoadFailed = true;
      console.error(
        "[MemoryForge] Shelby SDK loaded but missing expected exports. Pro features disabled.",
      );
      return false;
    }
    return true;
  } catch {
    sdkLoadFailed = true;
    console.error("[MemoryForge] Shelby SDK not available. Pro features disabled.");
    console.error(
      "[MemoryForge] Install with: npm install @shelby-protocol/sdk @aptos-labs/ts-sdk",
    );
    return false;
  }
}

/** Whether the last API call failed with 401/403. */
export function isAuthFailed(): boolean {
  return authFailed;
}

/** Central Shelby config — single switch point for API key → license key migration. */
export interface ShelbyConfig {
  apiKey: string | null;
  namespace: string; // blob prefix for user isolation
  accountAddress: string | null;
}

export function getShelbyConfig(): ShelbyConfig {
  // Priority: env var → saved in pro.json → null
  let apiKey = process.env.SHELBY_API_KEY ?? null;

  let accountAddress: string | null = null;
  try {
    if (fs.existsSync(PROFILE_PATH)) {
      const profile = JSON.parse(fs.readFileSync(PROFILE_PATH, "utf-8"));
      accountAddress = profile.address ?? null;
      // Fall back to saved key if env not set
      if (!apiKey) apiKey = profile.apiKey ?? null;
    }
  } catch {
    /* corrupted profile — ignore */
  }

  const namespace = accountAddress ? `users/${accountAddress}` : `users/default`;

  return { apiKey, namespace, accountAddress };
}

export async function initShelby(
  apiKey: string,
  privateKey?: string,
): Promise<{ address: string; generatedKey?: string } | null> {
  const ok = await loadShelbySdk();
  if (!ok) return null;

  authFailed = false;
  uploadFailCount = 0;
  client = new ShelbyNCtor({
    network: NetworkEnum.SHELBYNET,
    apiKey,
  });

  let generatedKey: string | undefined;

  if (privateKey) {
    account = AccountClass.fromPrivateKey({
      privateKey: new Ed25519Class(privateKey),
    });
  } else {
    const edKey = Ed25519Class.generate();
    account = AccountClass.fromPrivateKey({ privateKey: edKey });
    generatedKey = edKey.toString();
  }

  return {
    address: account!.accountAddress.toString(),
    generatedKey,
  };
}

export function getShelbyClient(): ShelbyNodeClient | null {
  return client;
}

export function getShelbyAccount(): Account | null {
  return account;
}

/** Build namespaced blob name.
 *
 *  项目记忆: users/{namespace}/projects/{hash}/memories/{id}-{ts}.json
 *  全局记忆: users/{namespace}/global/memories/{id}-{ts}.json
 *  旧格式:   users/{namespace}/memories/{id}-{ts}.json (向后兼容)
 *
 *  Timestamp enables versioning — Shelby blobs are immutable, so updates create new blobs. */
function blobNameFor(memoryId: string, projectHash?: string | null): string {
  const cfg = getShelbyConfig();
  if (projectHash) {
    return `${cfg.namespace}/projects/${projectHash}/memories/${memoryId}-${Date.now()}.json`;
  }
  return `${cfg.namespace}/global/memories/${memoryId}-${Date.now()}.json`;
}

// ShelbyUSD fungible asset address on Shelbynet testnet
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const SHELBYUSD_FA = "0x1b18363a9f1fe5e6ebf247daba5cc1c18052bb232efdc4c50f556053922d98e1";

/** Query on-chain balances via Aptos indexer GraphQL.
 *  On shelbynet, APT and ShelbyUSD are both Fungible Assets (8 decimals).
 *  FA stores live at derived addresses — indexer aggregates them correctly. */
export async function getBalances(): Promise<{ apt: string; shelbyUsd: string } | null> {
  if (!client || !account) return null;
  try {
    const addr = account.accountAddress.toString();
    const indexerUrl = "https://api.shelbynet.shelby.xyz/v1/graphql";

    const query = {
      query: `{ current_fungible_asset_balances(where: {owner_address: {_eq: "${addr}"}}) { amount metadata { name symbol decimals } } }`,
    };

    const res = await fetch(indexerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query),
    })
      .then((r) => r.json())
      .catch(() => null);

    const balances: any[] = res?.data?.current_fungible_asset_balances ?? [];
    const aptEntry = balances.find((b: any) => b.metadata?.symbol === "APT");
    const usdEntry = balances.find((b: any) => b.metadata?.symbol === "SHELBY_USD");

    return {
      apt: aptEntry?.amount != null ? (Number(aptEntry.amount) / 1e8).toFixed(4) : "0.0000",
      shelbyUsd: usdEntry?.amount != null ? (Number(usdEntry.amount) / 1e8).toFixed(4) : "0.0000",
    };
  } catch {
    return null;
  }
}

/** Query storage usage from Shelby. Returns count + total bytes, or null on error. */
export async function getStorageUsage(): Promise<{ blobCount: number; totalBytes: number } | null> {
  if (!client || !account) return null;
  try {
    // Use coordination layer to list blobs with metadata
    const metadata = await client.coordination.getAccountBlobs({
      account: account.accountAddress,
    });
    const cfg = getShelbyConfig();
    const ours = metadata.filter((m: any) => m.name?.includes(`/${cfg.namespace}/`));
    const totalBytes = ours.reduce((sum: number, m: any) => sum + (m.size ?? 0), 0);
    return { blobCount: ours.length, totalBytes };
  } catch {
    return null;
  }
}

// Track upload failures for diagnostics (#3)
const MAX_VERBOSE_FAILURES = 3;

/** 上传记忆到 Shelby */
export async function uploadMemory(memory: Memory): Promise<string | null> {
  if (!client || !account) return null;
  if (authFailed) return null;

  const blobData = Buffer.from(JSON.stringify(memory));
  const blobName = blobNameFor(memory.id);

  try {
    await client.upload({
      signer: account,
      blobData,
      blobName,
      expirationMicros: (Date.now() + 365 * 86400000) * 1000, // 1 year
    });
    // Reset fail counter on any success — failures may be transient
    uploadFailCount = 0;
    return blobName;
  } catch (err) {
    const msg = (err as Error).message;
    // 400 "already exists" (immutable blob) — treat as success
    if (msg.includes("already exists") || msg.includes("immutable")) {
      return blobName;
    }
    // 401/403 = auth failure — stop trying this session
    if (msg.includes("401") || msg.includes("403") || msg.includes("Unauthorized")) {
      authFailed = true;
      console.error("[MemoryForge] Pro sync: authentication failed. Check SHELBY_API_KEY.");
      return null;
    }
    // 429 = rate limited — stop trying this session, retry next
    if (msg.includes("429") || msg.includes("rate") || msg.includes("Rate")) {
      console.error(
        `[MemoryForge] Pro sync: rate limited by Shelby cloud. ${uploadFailCount} uploads deferred.`,
      );
      return null;
    }
    uploadFailCount++;
    if (uploadFailCount <= MAX_VERBOSE_FAILURES) {
      const shortId = memory.id.slice(0, 8);
      const errPreview = msg.length > 120 ? msg.slice(0, 120) + "..." : msg;
      console.error(
        `[MemoryForge] Upload failed [${shortId}…] (${uploadFailCount}): ${errPreview}`,
      );
    } else if (uploadFailCount === MAX_VERBOSE_FAILURES + 1) {
      console.error(
        `[MemoryForge] Suppressing further upload error details (${uploadFailCount} failures so far). See \`memory-forge pro status\`.`,
      );
    }
    return null;
  }
}

/** 从 Shelby 下载记忆（30s 超时，Windows 安全边界） */
export async function downloadMemory(blobName: string): Promise<Memory | null> {
  if (!client || !account) return null;

  try {
    const blob = await client.download({
      account: account.accountAddress,
      blobName,
    });

    // Safety: don't await the stream directly — wrap in promise with crash guard
    const data = await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const timer = setTimeout(() => {
        try {
          (blob.readable as any)?.destroy?.();
        } catch {}
        reject(new Error(`Download timeout after ${DOWNLOAD_TIMEOUT_MS}ms`));
      }, DOWNLOAD_TIMEOUT_MS);

      try {
        // Process stream asynchronously to avoid blocking event loop
        (async () => {
          try {
            for await (const chunk of blob.readable) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            clearTimeout(timer);
            resolve(Buffer.concat(chunks).toString());
          } catch (e) {
            clearTimeout(timer);
            reject(e);
          }
        })();
      } catch (e) {
        clearTimeout(timer);
        reject(e);
      }
    });

    return JSON.parse(data) as Memory;
  } catch (err) {
    console.error("[MemoryForge] Shelby download failed:", (err as Error).message);
    return null;
  }
}

/** 列出 Shelby 上的所有记忆（可选按项目过滤） */
export async function listBlobs(projectHash?: string | null): Promise<string[]> {
  if (!client || !account) return [];

  try {
    const metadata = await client.coordination.getAccountBlobs({
      account: account.accountAddress,
    });
    const prefix = projectHash ? `/projects/${projectHash}/memories/` : "/memories/";
    const globalPrefix = "/global/memories/";

    return metadata
      .map((m) => m.name)
      .filter((n) => {
        if (n.includes(".deleted")) return true; // tombstones always included
        return (
          n.includes(prefix) || n.includes(globalPrefix) || n.match(/\/memories\/[^/]+\.json$/)
        );
      })
      .map((n) => n.replace(/^@[^/]+\//, "")); // strip @address/ prefix for download
  } catch (err) {
    console.error(
      "[MemoryForge] Pro sync: failed to list cloud blobs — will retry next sync:",
      (err as Error).message,
    );
    return [];
  }
}

/** 从 Shelby 删除记忆 */
export async function deleteBlob(blobName: string): Promise<void> {
  if (!client || !account) return;
  // Shelby blobs are immutable once uploaded.
  // Tombstone uses stable name (no timestamp) so repeats overwrite, not duplicate
  const tombstoneName = blobName.replace(/-\d+\.json$/, ".json") + ".deleted";
  try {
    await client.upload({
      signer: account,
      blobData: Buffer.from("{}"),
      blobName: tombstoneName,
      expirationMicros: (Date.now() + 365 * 86400000) * 1000, // 1 year
    });
  } catch {
    // ignore
  }
}

/** 将本地记忆导出为 blob 名称（含命名空间） */
export function getBlobName(memoryId: string, projectHash?: string | null): string {
  return blobNameFor(memoryId, projectHash);
}

/** 从 blob 名称解析 memory_id（兼容新旧格式 + 版本时间戳 + .deleted 后缀） */
export function getMemoryId(blobName: string): string | null {
  // Strip .deleted suffix first for consistent parsing
  const name = blobName.replace(/\.deleted$/, "");
  // New format: users/{ns}/memories/{uuid}-{ts}.json
  const uuidMatch = name.match(
    /memories\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/,
  );
  if (uuidMatch) return uuidMatch[1];
  // Old format: memories/{id}.json (legacy, pre-namespace)
  const oldMatch = name.match(/^memories\/(.+)\.json$/);
  return oldMatch ? oldMatch[1] : null;
}

/** Extract cloud tombstone IDs from blob list (entries ending with .deleted) */
export function getCloudTombstones(blobs: string[]): Set<string> {
  const ids = new Set<string>();
  for (const name of blobs) {
    if (!name.endsWith(".deleted")) continue;
    const id = getMemoryId(name); // getMemoryId already handles .deleted suffix via regex
    if (id) ids.add(id);
  }
  return ids;
}
