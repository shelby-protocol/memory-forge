/**
 * Shelby 云存储 (Pro 层)。
 * 使用 @shelby-protocol/sdk 官方 SDK + Gas Station 代付。
 */

import { ShelbyNodeClient } from "@shelby-protocol/sdk/node";
import { Account, Ed25519PrivateKey, Network } from "@aptos-labs/ts-sdk";
import type { Memory } from "../store.js";
import * as fs from "node:fs";
import * as path from "node:path";

const DOWNLOAD_TIMEOUT_MS = 30_000;
const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "/tmp";
const PROFILE_PATH = path.join(HOME, ".memory-forge", "pro.json");

let client: ShelbyNodeClient | null = null;
let account: Account | null = null;
let authFailed = false;
let uploadWarned = false;

/** Whether the last API call failed with 401/403. */
export function isAuthFailed(): boolean { return authFailed; }

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
  } catch { /* corrupted profile — ignore */ }

  const namespace = accountAddress
    ? `users/${accountAddress}`
    : `users/default`;

  return { apiKey, namespace, accountAddress };
}

export function initShelby(apiKey: string, privateKey?: string): { address: string; generatedKey?: string } {
  authFailed = false;
  uploadWarned = false;
  client = new ShelbyNodeClient({
    network: Network.SHELBYNET,
    apiKey,
  });

  let generatedKey: string | undefined;

  if (privateKey) {
    account = Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(privateKey),
    });
  } else {
    const edKey = Ed25519PrivateKey.generate();
    account = Account.fromPrivateKey({ privateKey: edKey });
    generatedKey = edKey.toString();
  }

  return {
    address: account.accountAddress.toString(),
    generatedKey,
  };
}

export function getShelbyClient(): ShelbyNodeClient | null {
  return client;
}

export function getShelbyAccount(): Account | null {
  return account;
}

/** Build namespaced blob name: users/{namespace}/memories/{id}.json */
function blobNameFor(memoryId: string): string {
  const cfg = getShelbyConfig();
  return `${cfg.namespace}/memories/${memoryId}.json`;
}

const SHELBYUSD_FA = "0x1b18363a9f1fe5e6ebf247daba5cc1c18052bb232efdc4c50f556053922d98e1";

/** Query on-chain balances via REST API. Returns null on error. */
export async function getBalances(): Promise<{ apt: string; shelbyUsd: string } | null> {
  if (!client || !account) return null;
  try {
    const aptosConfig = (client as any).config;
    const baseUrl = aptosConfig.fullnode ?? "https://api.shelbynet.shelby.xyz/v1";
    const addr = account.accountAddress.toString();

    // APT: query coin store resource
    const aptUrl = `${baseUrl}/accounts/${addr}/resource/0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>`;
    const aptRes = await fetch(aptUrl).then(r => r.json()).catch(() => null);
    const aptRaw = aptRes?.data?.coin?.value;

    // ShelbyUSD: query fungible asset balance
    const usdUrl = `${baseUrl}/accounts/${addr}/fungible_asset_balances`;
    const usdRes = await fetch(usdUrl).then(r => r.json()).catch(() => null);
    const usdEntry = Array.isArray(usdRes) ? usdRes.find((b: any) => b.asset_type === SHELBYUSD_FA) : null;
    const usdRaw = usdEntry?.amount;

    return {
      apt: aptRaw !== undefined ? (Number(aptRaw) / 1e8).toFixed(4) : "?",
      shelbyUsd: usdRaw !== undefined ? (Number(usdRaw) / 1e6).toFixed(4) : "?",
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
    return blobName;
  } catch (err) {
    const msg = (err as Error).message;
    // 400 = blob already exists (immutable) — treat as success
    if (msg.includes("400") || msg.includes("Bad Request")) {
      return blobName;
    }
    // 401/403 = auth failure — stop trying this session
    if (msg.includes("401") || msg.includes("403") || msg.includes("Unauthorized")) {
      authFailed = true;
      console.error("[MemoryForge] Pro sync: authentication failed. Check SHELBY_API_KEY.");
      return null;
    }
    if (!uploadWarned) {
      uploadWarned = true;
      console.error("[MemoryForge] Pro sync: upload failed (network/storage issue). Will retry next sync.");
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
        try { (blob.readable as any)?.destroy?.(); } catch {}
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

/** 列出 Shelby 上的所有记忆 */
export async function listBlobs(): Promise<string[]> {
  if (!client || !account) return [];

  try {
    const metadata = await client.coordination.getAccountBlobs({
      account: account.accountAddress,
    });
    return metadata
      .map((m) => m.name)
      .filter((n) => n.includes("/memories/"))
      .map((n) => n.replace(/^@[^/]+\//, "")); // strip @address/ prefix for download
  } catch {
    return [];
  }
}

/** 从 Shelby 删除记忆 */
export async function deleteBlob(blobName: string): Promise<void> {
  if (!client || !account) return;
  // Shelby blobs are immutable once uploaded.
  // Deletion in our model = upload empty file as tombstone
  try {
    await client.upload({
      signer: account,
      blobData: Buffer.from("{}"),
      blobName: blobName + ".deleted",
      expirationMicros: (Date.now() + 86400000) * 1000,
    });
  } catch {
    // ignore
  }
}

/** 将本地记忆导出为 blob 名称（含命名空间） */
export function getBlobName(memoryId: string): string {
  return blobNameFor(memoryId);
}

/** 从 blob 名称解析 memory_id（兼容新旧格式） */
export function getMemoryId(blobName: string): string | null {
  // New format: users/{ns}/memories/{id}.json
  const newMatch = blobName.match(/memories\/(.+)\.json$/);
  if (newMatch) return newMatch[1];
  // Old format: memories/{id}.json (legacy, pre-namespace)
  const oldMatch = blobName.match(/^memories\/(.+)\.json$/);
  return oldMatch ? oldMatch[1] : null;
}
