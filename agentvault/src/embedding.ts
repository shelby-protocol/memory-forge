/**
 * 嵌入引擎: Transformers.js 进程内运行，支持多模型切换。
 * 延迟加载: 首次调用时加载模型，后续毫秒级。
 * 降级: 加载失败 → 返回 null，memory_search 自动回退到关键词匹配。
 *
 * 模型选择: 设置 MEMORY_FORGE_MODEL 环境变量切换模型。
 *   - 不设 / "default": Xenova/all-MiniLM-L6-v2 (23MB, 英文, 384d)
 *   - "e5": Xenova/multilingual-e5-small (~118MB, 94 语言含 CJK, 384d)
 *   - 也接受完整模型名: "Xenova/all-MiniLM-L6-v2", "Xenova/multilingual-e5-small"
 */

type EmbedFn = (text: string) => Promise<Float32Array | null>;

interface ModelDescriptor {
  name: string;
  dims: number;
  label: string;
}

const MODEL_MAP: Record<string, ModelDescriptor> = {
  default: {
    name: "Xenova/all-MiniLM-L6-v2",
    dims: 384,
    label: "all-MiniLM-L6-v2 (English, 384d, 23MB)",
  },
  e5: {
    name: "Xenova/multilingual-e5-small",
    dims: 384,
    label: "multilingual-e5-small (94 langs incl. CJK, 384d, 118MB)",
  },
};

function resolveModel(): ModelDescriptor {
  const input = process.env.MEMORY_FORGE_MODEL?.trim();
  if (!input) return MODEL_MAP["default"];

  // By alias
  if (MODEL_MAP[input]) return MODEL_MAP[input];

  // By full model name
  for (const desc of Object.values(MODEL_MAP)) {
    if (desc.name === input) return desc;
  }

  console.error(
    `[MemoryForge] Unknown MEMORY_FORGE_MODEL="${input}". Use "default" or "e5". Falling back to default.`,
  );
  return MODEL_MAP["default"];
}

let modelDescriptor: ModelDescriptor | null = null;
let embedFn: EmbedFn | null = null;
let loading: Promise<EmbedFn> | null = null;
let lastAttempt = 0;
let embedErrorWarned = false;
let discoveredDims = 0;
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
      const desc = resolveModel();
      modelDescriptor = desc;
      console.error(
        `[MemoryForge] Loading embedding model: ${desc.label}…`,
      );
      const { pipeline, env } = await import("@huggingface/transformers");
      // Use HF mirror in blocked regions via HF_MIRROR env var
      if (process.env.HF_MIRROR) {
        env.remoteHost = process.env.HF_MIRROR;
        console.error(`[MemoryForge] Using mirror: ${process.env.HF_MIRROR}`);
      }
      const engine = await pipeline("feature-extraction", desc.name, {
        progress_callback: (progress: any) => {
          if (progress?.status === "downloading") {
            const pct = progress?.progress ? Math.round(progress.progress) : 0;
            if (pct === 100) process.stderr.write("\n");
          }
        },
      });
      embedFn = async (text: string) => {
        const result = await engine(text, { pooling: "mean", normalize: true });
        if (discoveredDims === 0 && result.data.length > 0) {
          discoveredDims = result.data.length;
          if (discoveredDims !== desc.dims) {
            console.error(
              `[MemoryForge] Warning: model returned ${discoveredDims}d, expected ${desc.dims}d. Search degraded.`,
            );
          }
        }
        return new Float32Array(result.data);
      };
      lastAttempt = 0;
      return embedFn;
    } catch (err) {
      console.error("[MemoryForge] Failed to load embedding model:", (err as Error).message);
      console.error(
        `[MemoryForge] Falling back to keyword matching (retry in ${RETRY_MS / 1000}s).`,
      );
      modelDescriptor = null;
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

/** Resolved model name (e.g. "Xenova/multilingual-e5-small"). */
export function modelName(): string | null {
  return modelDescriptor?.name ?? null;
}

/** Discovered vector dimension (0 before first embed). */
export function modelDimension(): number {
  return modelDescriptor?.dims ?? discoveredDims;
}

/** Human-readable model label. */
export function modelLabel(): string | null {
  return modelDescriptor?.label ?? null;
}
