/**
 * 嵌入引擎: Transformers.js 进程内运行，23MB 模型，零外部服务。
 * 延迟加载: 首次调用时加载模型，后续毫秒级。
 * 降级: 加载失败 → 返回 null，memory_search 自动回退到关键词匹配。
 */

type EmbedFn = (text: string) => Promise<Float32Array | null>;

let embedFn: EmbedFn | null = null;
let loading: Promise<EmbedFn> | null = null;
let lastAttempt = 0;
let embedErrorWarned = false;
const RETRY_MS = 300_000; // 5 min before retry after failure

async function getEmbedder(): Promise<EmbedFn> {
  // Auto-retry: if model failed, clear cache after RETRY_MS for next attempt
  if (embedFn && lastAttempt > 0 && Date.now() - lastAttempt >= RETRY_MS) {
    console.error("[MemoryForge] Retrying embedding model download...");
    embedFn = null;
    loading = null;
  }

  if (embedFn) return embedFn;
  if (loading) return loading;

  loading = (async () => {
    try {
      console.error("[MemoryForge] Loading embedding model (~23MB, one-time download)…");
      const { pipeline } = await import("@huggingface/transformers");
      const engine = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
        progress_callback: (progress: any) => {
          if (progress?.status === "downloading") {
            const pct = progress?.progress ? Math.round(progress.progress) : 0;
            const file = progress?.file ?? "";
            if (pct > 0) process.stderr.write(`\r[MemoryForge] Downloading model… ${pct}%`);
            if (pct === 100) process.stderr.write("\n");
          }
        },
      });
      embedFn = async (text: string) => {
        const result = await engine(text, { pooling: "mean", normalize: true });
        return new Float32Array(result.data);
      };
      lastAttempt = 0;
      return embedFn;
    } catch (err) {
      console.error("[MemoryForge] Failed to load embedding model:", (err as Error).message);
      console.error(`[MemoryForge] Falling back to keyword matching (retry in ${RETRY_MS / 1000}s).`);
      lastAttempt = Date.now();
      embedFn = async () => null;
      return embedFn;
    }
  })();

  return loading;
}

export async function embed(text: string): Promise<Float32Array | null> {
  const fn = await getEmbedder();
  try {
    return await fn(text);
  } catch (err) {
    if (!embedErrorWarned) {
      embedErrorWarned = true;
      console.error("[MemoryForge] Embedding inference failed:", (err as Error).message);
    }
    return null;
  }
}

/** 预加载模型（后台运行，不阻塞） */
export function preload(): void {
  getEmbedder().then((fn) => {
    // Test with a lightweight string to warm the pipeline
    fn("warmup")
      .then(() => {
        console.error("[MemoryForge] Embedding model ready — semantic search active");
      })
      .catch(() => {
        console.error("[MemoryForge] Embedding warmup failed — keyword search fallback active");
      });
  });
}

/** Current model status for diagnostics. */
export function modelStatus(): "loading" | "ready" | "degraded" {
  if (embedFn && lastAttempt === 0) return "ready";
  if (lastAttempt > 0) return "degraded";
  return "loading";
}
