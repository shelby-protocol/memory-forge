# MemoryForge — 系统架构

## 整体架构

```
┌───────────────────────────────────────────────────────┐
│              AI Agent 平台（MCP 客户端）               │
│  Claude Code / Cursor / Windsurf / Codex / Devin       │
└────────────────────┬──────────────────────────────────┘
                     │  MCP Protocol (JSON-RPC over stdio/SSE)
                     │
┌────────────────────┴──────────────────────────────────┐
│            MemoryForge MCP Server                       │
│                                                        │
│  ┌──────────┐  ┌───────────┐  ┌────────────────────┐ │
│  │ 15 MCP   │  │ Memory    │  │ Hash Verifier         │ │
│  │ Tools    │  │ Indexer   │  │ (Aptos tx hash       │ │
│  │          │  │ (LRU +    │  │  verification)       │ │
│  │          │  │  vector)  │  │                      │ │
│  └────┬─────┘  └─────┬─────┘  └──────────┬─────────┘ │
│       │               │                    │           │
│       └───────────────┼────────────────────┘           │
│                       │                                │
│            ┌──────────┴──────────┐                     │
│            │ @shelby-protocol/sdk │ ← Shelby 存储层      │
│            └──────────┬──────────┘                     │
└───────────────────────┼────────────────────────────────┘
                        │
┌───────────────────────┴────────────────────────────────┐
│            Shelby Protocol                              │
│                                                        │
│  Aptos 区块链 (控制层)                                   │
│  ├─ 数据所有权 / 来源 / 访问权                           │
│  ├─ 加密收据 (每次读取)                                  │
│  └─ 微支付结算                                          │
│                                                        │
│  DoubleZero 光纤网络 (数据层)                             │
│  ├─ 30+ 城市 / 5 大洲                                   │
│  ├─ 亚秒级读取延迟                                       │
│  └─ < 2x 复制开销 (Clay codes)                          │
└────────────────────────────────────────────────────────┘
```

## 核心模块

### 1. MCP Server 层

```
src/
├── index.ts          # MCP Server 入口 (StdioServerTransport)
├── tools/
│   ├── core.ts       # 核心层 7 个工具
│   ├── verify.ts    # 链上哈希验证工具
│   ├── version.ts   # Git 分支/回滚/冲突解决
│   ├── smart.ts     # 智能层 (consolidate/staleness)
│   ├── gated.ts     # Token-Gated 记忆工具
│   └── payment.ts   # 微支付通道管理
├── store.ts          # 内存索引 (LRU 缓存 + 向量缓存)
├── shelby.ts         # @shelby-protocol/sdk 封装
├── embedding.ts      # 嵌入服务客户端 (Ollama/OpenAI)
├── hash.ts             # Aptos tx hash 校验
├── modes.ts          # full/slim/universal 模式
├── payment.ts        # 微支付通道管理
├── gated.ts          # Token-Gated (Solana) 访问控制
└── multipart.ts      # 分片上传管理
```

### 1.1 Web Dashboard（React）

```
dashboard/
├── src/
│   ├── App.tsx
│   ├── components/
│   │   ├── MemoryList.tsx      # use-account-blobs
│   │   ├── MemoryDetail.tsx    # use-blob-metadata
│   │   ├── UploadMemory.tsx    # use-upload-blobs
│   │   ├── TokenGate.tsx       # Token-Gated 管理
│   │   └── PaymentChannel.tsx  # 微支付管理
│   └── hooks/
│       └── useShelby.ts        # Shelby React SDK Hooks
└── package.json
```

### 2. 记忆索引层

```
Memory Indexer
├── LRU Cache (最近 1000 条记忆，内存)
├── 元数据索引 (分类/标签/优先级/时间)
├── 向量缓存 (最近查询结果)
└── 冲突检测引擎 (确定性 max(serial) 算法)
```

### 3. Shelby 存储层

基于 `@shelby-protocol/sdk`（Shelby 官方 TypeScript SDK）：

```bash
npm install @shelby-protocol/sdk @aptos-labs/ts-sdk
```

```typescript
import { ShelbyNodeClient } from '@shelby-protocol/sdk/node';
import { Account, Network } from '@aptos-labs/ts-sdk';

// 创建 Aptos 账户（需有 APT + ShelbyUSD）
const account = Account.generate();

const shelby = new ShelbyNodeClient({
  network: Network.TESTNET,
  apiKey: 'aptoslabs_***',
});

// 上传（需先充值 APT gas + ShelbyUSD 上传费）
await shelby.upload({
  signer: account,
  blobData: Buffer.from(content),
  blobName: 'path/to/memory.json',
  expirationMicros: (Date.now() + 30 * 86400000) * 1000, // 30天
});

// 下载
const blob = await shelby.download({
  account: account.accountAddress,
  blobName: 'path/to/memory.json',
});
```

**官方 API 映射到 MemoryForge MCP 工具：**

```
@shelby-protocol/sdk 官方 API         → MemoryForge MCP 工具
─────────────────────────────────────────────────────────
ShelbyNodeClient.upload()              → memory_store
ShelbyNodeClient.download()            → memory_recall
ShelbyRPCClient.putBlob()              → (内部：底层上传)
ShelbyRPCClient.getBlob()              → (内部：底层下载)
ShelbyBlobClient.registerBlob()        → (内部：链上注册)
sessions/createMicropaymentChannel     → (内部：付费读取)
multipart-uploads/*                    → (内部：大文件分片上传)
```

**上传成本：** 需要两种 Aptos 链上代币——APT（gas 费）和 ShelbyUSD（存储费）。

### 4. 链上验证层

```
memory_verify 的验证路径：

1. 获取记忆的 Aptos 交易哈希 (来自 store 时的响应)
2. 查询 Aptos 链上交易 → 获取存储证明
3. 计算本地内容的 SHA-256
4. 比对链上哈希 vs 本地哈希
5. 返回 { verified: true/false, tx_hash, stored_at, block_height }
```

### 5. Token-Gated 访问控制

基于 Shelby 官方 Solana Kit 的 Token-Gated 指南（`/sdks/solana-kit/guides/token-gated-solana/`）。

Shelby 官方提供了完整的 4 页实现指南：
1. **Environment Setup** — 项目脚手架、依赖安装、环境变量配置
2. **Writing the Programs** — Solana Anchor 智能合约（`access_control` + `ace_hook`）
3. **Building the Frontend** — React 前端（文件上传 + 购买卡片组件）
4. **Introduction** — 架构概述（卖家流程 / 买家流程）

**MemoryForge 的集成方式：**
- MemoryForge 封装 Token-Gated 预置模板
- 用户无需自己写 Solana 合约——使用 MemoryForge 预部署的合约
- `memory_gate` 工具 → 调用 Solana 智能合约绑定记忆访问权限
- `memory_access` 工具 → 验证钱包持有的代币/NFT

**使用场景：**
- 用户铸造 "Memory Access NFT" → 控制谁可以访问记忆
- 企业发行内部代币 → 控制哪些 Agent 可访问企业数据
- 记忆市场 → 用户出售记忆包，买家用代币购买

### 6. Shelby 原生微支付通道

```typescript
// 创建微支付通道（官方 API：/sessions/createMicropaymentChannel）
const channel = await shelby.createMicropaymentChannel({
  // 底层调用 Shelbynet RPC 端点
});

// 记忆读取时关联微支付
// Shelby 架构中，每次读取自动从通道扣费
```

**优势：**
- 不依赖第三方计费平台（SettleGrid）
- 0% 平台费
- 实时结算，无延迟

### 7. 分片上传（大文件支持）

```typescript
// 大文件分片上传
const upload = await shelby.multipart.startMultipartUpload({
  fileName: "large-memory-dataset.bin",
  totalSize: 1024 * 1024 * 100 // 100MB
});

// 分片上传
for (const chunk of chunks) {
  await shelby.multipart.uploadPart({
    uploadId: upload.id,
    partNumber: chunk.index,
    data: chunk.data
  });
}

// 完成上传
await shelby.multipart.completeMultipartUpload({
  uploadId: upload.id
});
```

### 8. 节点自运行

Shelby 提供 `cavalier` 节点软件，用户可运行自己的 Shelby 节点：

```bash
# 下载 cavalier 节点
wget https://shelby.network/cavalier.tar.gz

# 运行节点
./cavalier --network shelbynet --data-dir /data/shelby
```

**优势：**
- 最大化隐私（数据不经过第三方节点）
- 企业私有化部署
- 节点运营商可获得 Shelby 代币奖励

### 5. Token 效率模式

```
full mode (默认):     15 工具 → ~12,000 tokens
slim mode (Pro):      5 工具  → ~3,200 tokens  (73% ↓)
universal mode (Team): 1 meta → ~150 tokens     (98% ↓)

slim 模式工具选择策略：
  选择最高频调用的 5 个工具作为直接工具
  其他 10 个工具通过 tool_search 动态加载
```

## 数据流

### 存储记忆

```
Agent → memory_store(content, category, tags)
  → EmbeddingService.embed(content) → vector
  → ShelbyNodeClient.upload({ signer, blobData, blobName, expirationMicros })
      → 链上注册 (ShelbyBlobClient.registerBlob)
      → RPC 上传 (ShelbyRPCClient.putBlob)
      → 消耗 APT (gas) + ShelbyUSD (存储费)
  → MemoryIndexer.add(memory_id, vector, metadata)
  → 返回 { memory_id, blob_name, tx_hash }
```

### 检索记忆

```
Agent → memory_search(query, strategy, limit)
  → EmbeddingService.embed(query) → query_vector
  → MemoryIndexer.search(query_vector, strategy, filters)
      → LRU 缓存 → 向量索引 → ShelbyNodeClient.download 回退
  → 排序 + 去重 + 预算装配
  → 返回 { results, similarities, access_counts }
```

### 验证记忆

```
Agent → memory_verify(memory_id)
  → MemoryIndexer.get(memory_id) → { content, blob_name }
  → ShelbyNodeClient.download({ account, blobName })
  → 本地 SHA-256 vs Aptos 链上 tx hash
  → 返回 { verified, blob_name, tx_hash, block_height }
```

## 嵌入配置

### Claude Code

```bash
claude mcp add memory-forge -- npx memory-forge
# 或带参数
claude mcp add --scope project memory-forge -- npx memory-forge --mode slim
```

### Cursor

```json
// .cursor/mcp.json
{
  "mcpServers": {
    "memory-forge": {
      "command": "npx",
      "args": ["memory-forge", "--mode", "slim"]
    }
  }
}
```

### SSE 远程模式 (Team)

```bash
# 启动远程服务器
memory-forge serve --port 8765 --api-key sk-xxx

# 客户端连接
claude mcp add --transport sse memory-forge https://your-server.com:8765/sse
```

### Shelby API Key 认证

`@shelby-protocol/sdk` 使用 API Key 认证。开发者需要在 Shelby 文档的 `acquire-api-keys` 页面获取 Key。

```typescript
import { ShelbyNodeClient } from '@shelby-protocol/sdk/node';
import { Network } from '@aptos-labs/ts-sdk';

const shelby = new ShelbyNodeClient({
  network: Network.TESTNET,
  apiKey: process.env.SHELBY_API_KEY!,
});
```

MemoryForge 首次启动时检查 `SHELBY_API_KEY` 环境变量，缺失则提示用户获取。

## 依赖

```json
{
  "@modelcontextprotocol/sdk": "^1.0.0",
  "@shelby-protocol/sdk": "^0.4.0",
  "@aptos-labs/ts-sdk": "^1.0.0",
  "zod": "^3.0.0",
  "uuid": "^9.0.0"
}
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `SHELBY_API_KEY` | Shelby API Key（格式：`aptoslabs_***`） | — |
| `APTOS_PRIVATE_KEY` | Aptos 账户私钥 | — |
| `EMBEDDING_URL` | 嵌入服务地址 | `http://127.0.0.1:11434` |
| `EMBEDDING_MODEL` | 嵌入模型 | `nomic-embed-text` |
| `MCP_MODE` | 工具模式 | `full` |

## 关键优化（2026年6月确认）

### 1. Shelby API Key 认证
Shelby 使用 API Key 认证。开发者需要在 Shelby 文档的 `acquire-api-keys` 页面获取 Key。MemoryForge 首次启动时检查环境变量，缺失则提示用户。

### 2. MCP Server 自动发现
MemoryForge 首次启动时自动检测所有已安装的 Agent 平台并配置：

```bash
npx memory-forge setup  # 一键配置所有 Agent 平台
  → 检测 Claude Code     → 自动运行 claude mcp add
  → 检测 Cursor          → 自动写入 .cursor/mcp.json
  → 检测 Windsurf        → 自动写入 Windsurf 配置
  → 检测 VS Code/Copilot → 自动写入 .vscode/settings.json
```

对标 Moderne Agent Tools 的 `mod config agent-tools install` 模式。

### 3. 记忆市场（数据可交易性）
基于 USC 学术论文 "Infrastructure for Valuable, Tradable, and Verifiable Agent Memory" (arXiv:2603.24564)：

```typescript
// 用户 A 导出记忆包
memory_export({ category: "react-patterns", format: "tome-portable" })
// → 生成加密记忆包 + Merkle 根锚定到 Aptos

// 用户 B 导入记忆包
memory_import({ package_id, proof })
// → 验证来源 → 加载记忆 → 支付结算 (USDC)
```

对标 Tome AI / Ghast AI / MeowTrade，但通过 MCP 标准嵌入全部 Agent 平台。

### 4. ClawGang 相容性（TEE 可信执行）
MemoryForge 架构兼容 ClawGang 论文的可信执行环境模型：
- 记忆可以生成 TEE 证明（AMD SEV-SNP）
- 支持 "gangs"（相同任务/模型的 Agent 群组共享记忆）
- 记忆真实性可通过 TEE 证明验证（非 LLM 推理）

### 5. 学习引擎（River Algorithm）
基于 River Algorithm（沉积式记忆固化模型）：
- 观察自动累积为"疑似事实"
- 跨会话验证 → 升级为"已确认知识"
- 过期/矛盾 → 降级为"存疑"
- offline "净化"阶段（12步管道），类比睡眠固化

引擎嵌入在 `memory_consolidate` 和 `memory_staleness` 工具中。
