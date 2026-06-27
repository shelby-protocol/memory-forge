/**
 * Shelby 云存储 (Pro 层)。
 * 使用 @shelby-protocol/sdk 官方 SDK + Gas Station 代付。
 */

import { ShelbyNodeClient } from "@shelby-protocol/sdk/node";
import { Account, Ed25519PrivateKey, Network } from "@aptos-labs/ts-sdk";
import type { Memory } from "../store.js";

const DOWNLOAD_TIMEOUT_MS = 30_000; // 30s

let client: ShelbyNodeClient | null = null;
let account: Account | null = null;
let authFailed = false;
let uploadWarned = false; // only warn once per session for generic failures

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

/** 上传记忆到 Shelby */
export async function uploadMemory(memory: Memory): Promise<string | null> {
  if (!client || !account) return null;
  if (authFailed) return null; // fail fast after 401

  const blobData = Buffer.from(JSON.stringify(memory));
  const blobName = `memories/${memory.id}.json`;

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

/** 将本地记忆导出为 blob 名称列表 */
export function getBlobName(memoryId: string): string {
  return `memories/${memoryId}.json`;
}

/** 从 blob 名称解析 memory_id */
export function getMemoryId(blobName: string): string | null {
  const match = blobName.match(/memories\/(.+)\.json$/);
  return match ? match[1] : null;
}
