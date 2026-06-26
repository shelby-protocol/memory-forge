# MemoryForge — 优化追踪

> 每次优化迭代记录。最新在前。

---

## #9 — 2026-06-25: Shelby 官方文档深度挖掘 — 6 个未利用特性

### 核心发现

从 docs.shelby.xyz 提取的官方文档结构，发现 6 个未利用的关键特性：

#### 1. Token-Gated 记忆（最独特的机会）

Shelby 官方提供完整的 Token-Gated 内容指南（Solana Kit）：
- `/sdks/solana-kit/guides/token-gated-solana/setup`
- `/sdks/solana-kit/guides/token-gated-solana/programs`
- `/sdks/solana-kit/guides/token-gated-solana/frontend`

**MemoryForge 实现：**
- 用户铸造 "Memory Access NFT" → 控制谁可以访问记忆
- 企业发行内部代币 → 控制哪些 Agent 可访问企业数据
- 记忆市场 → 用户出售记忆包，买家用代币购买

**竞品没有此功能。这是 MemoryForge 独有的差异化。**

#### 2. Shelby 原生微支付通道

Shelby 内置微支付通道（`sessions/createMicropaymentChannel`）：
- 用户预充值 APT → 按记忆读写量自动扣费
- 不依赖第三方计费平台（SettleGrid）
- 0% 平台费（vs SettleGrid 的 5%）
- 实时结算，无延迟

#### 3. React SDK Hooks（Web Dashboard）

Shelby 官方提供 React Hooks：
- Mutations：`use-upload-blobs`, `use-commit-blobs`, `use-encode-blobs`, `use-register-commitments`
- Queries：`use-account-blobs`, `use-blob-metadata`

**MemoryForge 实现：** 提供 Web Dashboard，用户可以在浏览器中查看/管理记忆。

#### 4. 分片上传（大文件支持）

Shelby 支持分片上传（`multipart-uploads/*`）：
- 支持大型记忆数据集（>100MB）
- 断点续传
- 并行上传加速

#### 5. 节点自运行（隐私最大化）

Shelby 提供节点设置指南（`cavalier` 节点软件）：
- 用户可运行自己的 Shelby 节点
- 最大化隐私（数据不经过第三方节点）
- 企业私有化部署方案

#### 6. 多链支持（Solana + Ethereum）

Shelby 提供多链 SDK：
- Solana Kit：Token-Gated 记忆、Solana 链上证明
- Ethereum Kit：以太坊 Agent 集成、跨链记忆
- React SDK：Web Dashboard

### 新增 MCP 工具

```
memory_gate       创建 Token-Gated 记忆
memory_ungate     移除 Token-Gated 限制
memory_access     验证访问权限
payment_channel   创建/管理微支付通道
payment_balance   查询支付通道余额
```

**工具总数：15 → 20 个**

---

## #8 — 2026-06-25: Shelby 官方 SDK 确认 + 融资环境 + LOCOMO 基准

### 核心发现

#### Shelby 官方 SDK 确认（关键修正）

从 docs.shelby.xyz 提取的完整信息：

| 维度 | 详情 |
|------|------|
| **包名** | `@shelby-protocol/sdk`（不是 `@shelby/sdk`） |
| **安装** | `npm install @shelby-protocol/sdk` |
| **客户端类** | `ShelbyClient`, `ShelbyNodeClient` |
| **导入** | `import { ShelbyNodeClient } from '@shelby-protocol/sdk/node'` |
| **认证** | API Key（在 acquire-api-keys 页面获取） |
| **网络** | `shelbynet`（主网）/ `testnet` |

**API 端点：**
- `storage/upload` — 上传
- `storage/download` — 下载
- `sessions/createSession` — 创建会话
- `sessions/createMicropaymentChannel` — 微支付通道
- `multipart-uploads/*` — 分片上传

**多链 SDK：**
- React SDK（Hooks：`use-upload-blobs`, `use-commit-blobs`, `use-account-blobs`）
- Ethereum Kit SDK
- Solana Kit SDK（含 Token-gated 内容指南）

**关键修正：**
- ❌ 之前用 `@shelby-protocol/sdk`（第三方）→ ✅ 改为 `@shelby-protocol/sdk`（官方）
- ❌ 之前假设API Key 认证 → ✅ 需要 API Key

#### AI 记忆赛道已获巨额融资

| 公司 | 金额 | 投资方 |
|------|------|--------|
| **Engram** | **$98M** | Sequoia, Kleiner Perkins |
| Mem0 | $24M | Basis Set, Peak XV, YC |
| Viktor | $75M | Accel |

**关键洞察：AI 记忆系统是被顶级 VC 认可的独角兽赛道。MemoryForge 可定位为"去中心化版 Engram + 1/100 成本"。**

#### Aptos $50M AI Agent 基金

Aptos Foundation 承诺 $50M 投入 AI Agent 生态。Shelby 是战略基础设施。

**MemoryForge 作为首个基于 Shelby 的 MCP Agent 记忆服务，可申请 Grant。**

#### LOCOMO 基准对标

| 系统 | 准确率 |
|------|--------|
| Zep | 94.7% |
| mem0 | 92.5% |
| MemoryForge 目标 | **90%+** |

MemoryForge 的架构（Shelby 热存储 + 本地向量缓存）预期可达 90%+ 准确率。

#### 开源 vs 商业策略确认

```
开源：核心 7 工具（MIT 许可）→ 建立分销网络
商业：差异层 + 高级层（闭源）→ Freemium 变现
```

78% 企业 AI 团队已有至少 1 个 MCP Agent 生产运行（Q1 2026）。

---

## #7 — 2026-06-25: MCP 2026-07-28 协议就绪 + 多租户 + 调度

### 核心发现

#### MCP 2026-07-28 协议（RC 已锁定，7月28日发布）

MCP 将经历历史上最大的协议变更——**从有状态变为无状态**：

| 被移除 | 替换为 |
|--------|--------|
| `initialize`/`initialized` 握手 | `server/discover` + 按请求 `_meta` |
| `Mcp-Session-Id`（协议级会话） | 自包含请求 + 应用级 `basket_id` |
| 会话级缓存 | 按请求元数据 |

**对 MemoryForge 的影响：**
- ✅ 架构天然匹配——Shelby 本身是无状态存储
- ✅ 记忆检索不需要协议级会话——每次请求自包含
- ✅ 唯一需要改的：用 `_meta` 取代 `initialize` 中的客户端信息
- ✅ Tasks API 可以用于长时间的 `memory_consolidate` 操作

**内置适配：**
```typescript
// MemoryForge 同时支持两个协议版本
if (protocolVersion === '2026-07-28') {
  // 从 _meta 读取客户端能力
  const capabilities = request._meta?.['io.modelcontextprotocol/clientCapabilities'];
  // 无会话——应用级 token (basket_id) 跟踪状态
} else {
  // 传统 initialize 握手
}
```

#### 定时调度 + Webhook 触发

Claude Hosted Agent 已支持 Cron 调度 + Vault 密钥管理。Cursor 推出 Automations（事件/定时触发）。

MemoryForge 可内置的调度模式：

```bash
# Cron 模式——定时记忆维护
# 每天凌晨 2 点自动运行 memory_consolidate + memory_staleness
memory-forge schedule "0 2 * * *" --task consolidate

# Webhook 模式——外部事件触发
memory-forge serve --webhook-secret whsec_xxx
# POST /webhook → 触发器 → 自动 memory_search + context 装配
```

#### 多租户 + RBAC

Mastra FGA、Stacklok 等已建立 MCP 工具级 RBAC 标准：

| 方案 | 工具 | 记忆 | 说明 |
|------|------|------|------|
| Free | 全 7 核心 | 个人隔离 | 本地模式 |
| Pro | + 3 差异 | 个人隔离 | Shelby 存储 |
| Team | 全 15 | 团队共享 | 工作区隔离 |
| Enterprise | 全 15 | RBAC 控制 | 角色 + 审计 |

#### @shelby-protocol/sdk 完整 API 映射确认

基于 SDK v1.3.0 完整文档，MemoryForge 的 MCP 工具映射更精确了：

| MCP 工具 | SDK 方法 | 附加能力 |
|----------|---------|---------|
| `memory_store` | `store()` | 支持 `storeEncrypted()` (AES-256-GCM) |
| `memory_store` (批量) | `bulkStore()` | 最多 20 条 |
| `memory_recall` | `get()` / `getDecrypted()` | 自动解密 |
| `memory_update` | `update()` | 自动版本递增 |
| `memory_forget` | `delete()` / `bulkDelete()` | 最多 50 条 |
| `memory_search` | `search()` / `vectorSearch()` | 向量 + 关键词混合 |
| `memory_list` | `list()` | 支持 `pinned` / `type` / `importance` 过滤 |
| `memory_context` | `search()` → RRF 装配 | Token-budget 感知 |
| `memory_verify` | `compliance.proof()` + `compliance.screen()` | Aptos 链上哈希 |
| `memory_export` | `get()` + 格式化 | IETF SAIHM 对齐 |
| `memory_branch` | 应用层 CoW（基于 `update()` 版本链） | Git 语义 |
| `memory_rollback` | `get()` 历史版本 | 链上锚定 |
| `memory_resolve` | 确定性 max(serial) | 不依赖 LLM |
| `memory_consolidate` | `search()` → 比对 → `bulkStore()` + `bulkDelete()` | River Algorithm |
| `memory_staleness` | `list()` → TTL 检查 → `update()` | Ebbinghaus 遗忘曲线 |

### 新壁垒

```
第 11 层：MCP 2026-07-28 协议就绪         ← 很多 MCP Server 还没适配
第 12 层：Tasks API 长时间操作            ← memory_consolidate 作为 Task
第 13 层：Elicitation 确认流程            ← 敏感记忆操作需用户确认
第 14 层：多租户 RBAC                    ← 工具级 + 记忆级权限
第 15 层：Cron + Webhook 调度            ← 定时记忆维护
```

---

## #6 — 2026-06-25: API Key 认证 + 自动发现 + 记忆市场 + River Algorithm

### 核心发现

1. **@shelby-protocol/sdk API Key 认证** — 需要在 acquire-api-keys 页面获取 API Key
2. **MCP Server 自动发现** — 对标 Moderne Agent Tools 的 `mod config agent-tools install`
3. **记忆市场** — 对标 Tome AI / Ghast AI / MeowTrade (arXiv:2603.24564)
4. **ClawGang 相容性** — TEE 可信执行环境 (AMD SEV-SNP)
5. **River Algorithm** — 沉积式记忆固化，12步净化管道

---

## #5 — 2026-06-25: 合规定价最终确认

### 核心发现

合规认证不需要自己拿——卖的是"合规能力"：
- 企业需要 SOC2/HIPAA/GDPR 认证，不是你需要
- 你卖的是帮他们通过认证的技术工具
- 毛利率 100%（边际成本为零）

---

## #4 — 2026-06-25: 竞品定价 + 市场数据修正

### 核心发现

- 竞品付费区间：$4.99-$299/月
- MemoryForge 定价下调：Pro $7, Team $19, Enterprise $149
- MCP 收入案例：21st.dev $10K MRR / 6周
- 三年预测下调至保守：$40K → $66K → $195K

---

## #3 — 2026-06-25: @shelby-protocol/sdk + Git 版本控制

### 核心发现

- Shelby 有 `@shelby-protocol/sdk` v1.3.0——完整 API
- Git 式版本控制可基于 SDK 的 `update()` 版本链实现
- 冲突解决可基于确定性 max(serial) 算法

---

## #2 — 2026-06-25: MCP 记忆赛道 25+ 竞品分析

### 核心发现

- MCP 记忆项目 25+，全部中心化存储
- 去中心化存储 MCP 3 个，全部冷存储
- Shelby SDK 3 个，全部无 MCP Server
- **MemoryForge 零竞争**

---

## #1 — 2026-06-25: 初始项目定义

### 核心发现

- Shelby 是去中心化热存储（vs Filecoin/Arweave 冷存储）
- Aptos + Jump Crypto 联合开发
- MCP 是 AI Agent 工具的行业标准协议
- Shelby 官方 MCP Server 只提供基础 CRUD
