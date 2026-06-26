# MemoryForge -- 系统架构（精简版）

## 整体架构

```
┌──────────────────────────────────────┐
│     AI Agent（Claude Code 等）        │
└──────────────┬───────────────────────┘
               │  MCP (stdio)
┌──────────────┴───────────────────────┐
│        MemoryForge MCP Server          │
│                                       │
│  6 MCP Tools  │  5 自动引擎           │
│                                       │
│  嵌入引擎 (@huggingface/transformers) │
│    23MB, 进程内, 无外部服务            │
│                                       │
│  存储:                               │
│    Free: 本地 Markdown                │
│    Pro:  @shelby-protocol/sdk 云      │
└───────────────────────────────────────┘
```

## 核心模块

```
src/
├── index.ts          # MCP Server 入口
├── tools/
│   └── core.ts       # 6 个核心工具 (store/search/recall/list/forget/context)
├── auto/
│   ├── inject.ts     # prompt 前自动注入
│   ├── capture.ts    # 会话结束自动提取
│   ├── priority.ts   # 频率×时间评分
│   ├── decay.ts      # 遗忘曲线 (24h 定时)
│   ├── merge.ts      # 相似记忆合并
│   └── naming.ts     # 自动命名
├── store.ts          # 内存索引 (LRU + 余弦相似度)
├── embedding.ts      # Transformers.js 封装
├── storage/
│   ├── local.ts      # Markdown 文件 (Free)
│   └── shelby.ts     # Shelby 云 (Pro)
├── hooks/
│   └── install.ts    # Claude Code hooks 配置
├── migrate/
│   └── import.ts     # 导入 CLAUDE.md / .cursor/rules
├── setup.ts          # 一键安装脚本
└── config.ts         # 配置管理
```

## 嵌入引擎

```typescript
import { pipeline } from '@huggingface/transformers';

// 首次运行自动下载 23MB ONNX 模型，后续完全离线
const embed = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
const vec = await embed('hello world', { pooling: 'mean', normalize: true });
// → Float32Array(384)
```

| 属性 | 值 |
|------|-----|
| 包 | `@huggingface/transformers` |
| 模型 | `Xenova/all-MiniLM-L6-v2`, 23MB |
| 维度 | 384 |
| 网络 | 仅首次下载，之后离线 |
| 安装 | `npm install` 自动触发下载 |

## 延迟加载

模型不随 setup 加载。首次 memory_search 或 memory_store 调用时才加载：

```typescript
// embedding.ts
let embedFn = null;

async function getEmbedder() {
  if (!embedFn) {
    embedFn = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return embedFn;
}
```

**用户感知：setup 秒开。首次查询 5-10 秒（模型加载），后续毫秒级。**

## 错误降级

| 故障 | 降级 |
|------|------|
| Transformers.js 崩溃 | → 关键词匹配（功能可用） |
| Shelby RPC 超时 (Pro) | → 本地缓存 + 异步重试 |

## 存储架构

### Free 层
```
存储: ~/.memory-forge/memories/{id}.md
      Markdown 文件, 人类可读, Git 可追溯
换电脑: 没了
```

### Pro 层（Gas Station 代付，用户零感知）

Shelby 官方提供 Gas Station 服务（[来源](https://build.staging.aptoslabs.com/docs/gas-stations/shelby)），支持代付 APT gas + ShelbyUSD 存储费。

```typescript
import { GasStationClient, GasStationTransactionSubmitter } from "@aptos-labs/gas-station-client";

const blobClient = new ShelbyBlobClient({
  aptos: { pluginSettings: { TRANSACTION_SUBMITTER: new GasStationTransactionSubmitter(gasStationClient) } }
}, {
  usdSponsor: { feePayerAddress: AccountAddress.from("0x<our-account>") }
});
```

| 阶段 | APT gas | ShelbyUSD | 来源 | 每用户成本 |
|------|---------|-----------|------|-----------|
| 测试网 | 代付 | 代付 | Faucet | $0 |
| 主网 | 代付 | 代付 | Gas Station 预充值 | < $0.01/月 |

## 数据流

### 自动注入（prompt 前）
```
用户发送 prompt
  → auto-inject 拦截
  → Transformers.js 向量化 prompt
  → 余弦相似度 top-3 匹配
  → 失败 → 关键词 fallback
  → 注入 <memory-forge-context> 到 prompt 前
```

### 存储记忆
```
Agent → memory_store(content)
  → Transformers.js 向量化 → 384 维
  → 本地 Markdown 写入
  → Pro: shelby.upload() 异步上传
```

### 自动捕获（会话结束）
```
Stop hook 触发
  → auto-capture 扫描对话历史
  → 提取偏好 / 决策 / 发现
  → 自动调用 memory_store
```

### 智能启动（会话开始）
```
SessionStart hook 触发
  → 加载 top-5 高优先级记忆
  → Pro: 从 Shelby 同步最新数据
  → 生成摘要注入首条 prompt
```

## Hook 配置

```json
{
  "SessionStart": {"hooks": [{"command": "memory-forge hook session-start"}]},
  "Stop":         {"hooks": [{"command": "memory-forge hook stop"}]},
  "PreCompact":   {"hooks": [{"command": "memory-forge hook pre-compact"}]}
}
```

## 规则迁移

`npx memory-forge setup` 自动导入：
```
CLAUDE.md / .cursor/rules/*.mdc / .gitconfig / AGENTS.md
```

## 依赖

```bash
npm install @modelcontextprotocol/sdk @huggingface/transformers @shelby-protocol/sdk @aptos-labs/ts-sdk
```

全部运行在用户本地。Pro 层通过 Aptos Gas Station 代付所有链上费用，用户零配置。

## 支付集成

SettleGrid（`@settlegrid/mcp`）1 行代码，多支付方式自动可用：

```typescript
import { sg } from '@settlegrid/mcp';
sg.wrap(server.tools, { pricing: { perCallCents: 1 } });
// → 信用卡 / Google Pay / USDC / Visa 全部可用
```

我们不需要处理信用卡信息——Stripe 处理。

## 安全

| 我们存 | 我们不存 |
|--------|---------|
| 邮箱 | 信用卡（Stripe） |
| — | 私钥（Gas Station 代付） |
| — | 密码（PBKDF2→密钥，不存原文） |
| — | 记忆明文（AES-256-GCM 加密后上传） |

记忆加密模型：用户密码 → PBKDF2 60 万次 → AES-256-GCM → Shelby blob。
只有用户自己能解密。对标 1Password/Bitwarden。
