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

export function initShelby(apiKey: string, privateKey?: string): { address: string; generatedKey?: string } {
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
    console.error("[MemoryForge] Shelby upload failed:", (err as Error).message);
    return null;
  }
}

/** 从 Shelby 下载记忆（30s 超时） */
export async function downloadMemory(blobName: string): Promise<Memory | null> {
  if (!client || !account) return null;

  try {
    const blob = await client.download({
      account: account.accountAddress,
      blobName,
    });

    const streamPromise = (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of blob.readable) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks).toString();
    })();

    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error(`Download timeout after ${DOWNLOAD_TIMEOUT_MS}ms`)), DOWNLOAD_TIMEOUT_MS)
    );

    const data = await Promise.race([streamPromise, timeoutPromise]);
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
    return metadata.map((m) => m.name).filter((n) => n.startsWith("memories/"));
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
      expirationMicros: Date.now() * 1000 + 86400000,
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
  const match = blobName.match(/^memories\/(.+)\.json$/);
  return match ? match[1] : null;
}
