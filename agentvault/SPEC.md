# MemoryForge — 完整产品规格

## 定位

**唯一基于 Shelby 去中心化热存储 + 链上可验证 + MCP 标准的 AI Agent 持久记忆引擎。**

现有 25+ MCP 记忆项目全部使用本地 SQLite/PostgreSQL 存储。MemoryForge 是唯一使用去中心化热存储的方案。

## 核心差异化

### 1. 去中心化热存储（Shelby Protocol）

| 对比 | 其他 MCP 记忆项目 | MemoryForge |
|------|-----------------|------------|
| 存储位置 | 本地 SQLite 文件 | Shelby 去中心化网络 |
| 跨设备 | ❌ 换电脑就丢失 | ✅ 全球可访问 |
| 数据主权 | 绑定在文件系统上 | 用户拥有，链上证明 |
| 检索速度 | 本地快 | 亚秒级（Shelby 热存储） |

### 2. 链上哈希可验证记忆

- 每条记忆存储时生成 Aptos 链上哈希
- `memory_verify` 工具可验证记忆完整性
- 审计链：完整记录谁、什么时候、做了什么

### 3. Git 式版本控制

- `memory_branch` — 创建记忆分支
- `memory_rollback` — 回滚到历史快照
- `memory_diff` — 比较时间点差异
- `memory_merge` — 合并不冲突的分支

### 4. 自动冲突解决

基于学术论文 "Don't Ask the LLM to Track Freshness" 的确定性算法：
- 不使用 LLM 判断 → 省 token + 更准确
- 结构化版本标记 + max(serial) 比较
- 比 LLM 判断准确率高 10-20 个百分点

### 5. Token-Gated 记忆（基于 Shelby Solana Kit）

Shelby 官方提供完整的 Token-Gated 内容指南。MemoryForge 利用此功能实现：

- **记忆 NFT**：用户铸造 NFT，NFT 持有者可以访问该用户的记忆
- **代币门控访问**：只有持有特定代币的 Agent 才能访问敏感记忆
- **企业访问控制**：企业发行内部代币，控制哪些 Agent 可访问企业数据
- **记忆市场**：用户出售记忆包，买家用代币购买

**竞品没有此功能。这是 MemoryForge 独有的差异化。**

### 6. Shelby 原生微支付通道

Shelby 内置微支付通道（`sessions/createMicropaymentChannel`）。MemoryForge 直接使用：

- 用户预充值 APT → 按记忆读写量自动扣费
- 不依赖第三方计费平台（SettleGrid）
- 降低抽成（0% 平台费 vs SettleGrid 的 5%）
- 实时结算，无延迟

### 7. React Web Dashboard（基于 Shelby React SDK）

Shelby 官方提供 React Hooks：

| Hooks | 用途 |
|-------|------|
| `use-upload-blobs` | 上传记忆 |
| `use-commit-blobs` | 提交记忆 |
| `use-encode-blobs` | 加密记忆 |
| `use-register-commitments` | 注册承诺 |
| `use-account-blobs` | 获取记忆列表 |
| `use-blob-metadata` | 获取记忆元数据 |

MemoryForge 提供 Web Dashboard，用户可以在浏览器中查看/管理记忆。

### 8. 分片上传（大文件支持）

Shelby 支持分片上传（`multipart-uploads/*`）：

- 支持大型记忆数据集（>100MB）
- 断点续传
- 并行上传加速

### 9. 节点自运行（隐私最大化）

Shelby 提供节点设置指南（`cavalier` 节点软件）：

- 用户可运行自己的 Shelby 节点
- 最大化隐私（数据不经过第三方节点）
- 企业私有化部署方案

### 10. 多链支持（Solana + Ethereum）

Shelby 提供多链 SDK：

| SDK | 用途 |
|-----|------|
| Solana Kit | Token-Gated 记忆、Solana 链上证明 |
| Ethereum Kit | 以太坊 Agent 集成、跨链记忆 |
| React SDK | Web Dashboard

## MCP 工具集（20 个）

### 核心层（Free 可用）
```
memory_store      存储记忆（支持 AES-256-GCM 加密）
memory_search     语义检索（4 种策略：semantic/recent/important/full_context）
memory_recall     按 ID 精确获取
memory_list       列表浏览（类型/标签/时间过滤）
memory_update     修改记忆
memory_forget     删除 + 遗忘证明
memory_context    token-budget 感知的上下文装配
```

### 差异层（Pro 可用）
```
memory_verify     链上哈希证明校验——验证记忆完整性
memory_export     可移植导出（对齐 IETF SAIHM 标准）
memory_resolve    自动冲突检测和解决
```

### 高级层（Team/Enterprise 可用）
```
memory_branch     创建记忆分支（实验性探索）
memory_rollback   回滚到历史快照
memory_diff       比较两个时间点的记忆差异
memory_consolidate 合并重复/相似记忆
memory_staleness  过时检测 + 自动标记
```

### Token-Gated 层（Enterprise 可用）
```
memory_gate       创建 Token-Gated 记忆（需要特定代币才能访问）
memory_ungate     移除 Token-Gated 限制
memory_access     验证 Agent 是否有权访问 Token-Gated 记忆
```

### 微支付层（Pro/Team/Enterprise 可用）
```
payment_channel   创建/管理 Shelby 微支付通道
payment_balance   查询支付通道余额
```

## Token 效率模式

| 模式 | 工具数 | Token 消耗 | 减少 |
|------|--------|-----------|------|
| `--mode full` | 20 | ~16,000 | — |
| `--mode slim` | 5 | ~3,200 | 80% |
| `--mode universal` | 1 meta | ~150 | 99% |

## 定价

| 方案 | 月费 | 工具 | 记忆数 | 存储 | 功能 |
|------|------|------|--------|------|------|
| Free | $0 | 核心层 7 | 100 | 本地 | 社区支持 |
| Pro | $7 | + 差异层 | 10,000 | Shelby | slim 模式 |
| Team | $19 | 全 15 | 50,000 | Shelby | universal 模式 + SSE |
| Enterprise | $149 | 全 15 | 无限 | Shelby | 链上哈希审计 + SSO + SLA |

## 企业附加模块（独立定价）

| 模块 | 年费 | 目标场景 |
|------|------|---------|
| 链上审计合规包 | $3,000 | EU AI Act 合规 |
| GDPR 被遗忘权 | $2,000 | 欧洲企业 |
| HIPAA 合规包 | $5,000 | 医疗企业 |
| 私有化部署 | $9,900/次 | 金融/政府 |

## 技术栈

```
Agent 平台层:  Claude Code / Cursor / Codex / Devin / Windsurf
         ↕  MCP (JSON-RPC over stdio/SSE)
MemoryForge:   MCP Server (TypeScript, Node.js 18+)
         ↕
存储层:       @shelby-protocol/sdk + @aptos-labs/ts-sdk → Shelby Protocol (Aptos + DoubleZero)
嵌入层:       本地 Ollama / OpenAI 可切换
链上层:       Aptos 交易哈希 + 微支付通道
```

## 嵌入方式（API Key 认证）

### 一键自动检测并配置所有 Agent 平台

```bash
npx memory-forge setup
```

自动检测并配置：Claude Code / Cursor / Windsurf / VS Code + Copilot / Codex / Devin。

### 手动配置单个平台

```bash
# Claude Code
claude mcp add memory-forge -- npx memory-forge

# Cursor (.cursor/mcp.json)
{ "mcpServers": { "memory-forge": { "command": "npx", "args": ["memory-forge"] } } }

# Windsurf / VS Code / Codex / Devin
# 同上，均为标准 MCP stdio 配置
```

### Shelby API Key 认证

需要获取 Shelby API Key（格式 aptoslabs_***）+ Aptos 账户私钥。上传还需要 APT（gas）和 ShelbyUSD（存储费）两种代币。

```bash
export SHELBY_API_KEY="aptoslabs_***"
export APTOS_PRIVATE_KEY="ed25519-priv-..."
```

## 路线图

```
Phase 1 (2 周) — MVP
  ✅ MCP Server 骨架 (已开始)
  ⬜ 核心层 7 个工具
  ⬜ @shelby-protocol/sdk 集成 + API Key 认证
  ⬜ npm publish + claude mcp add 测试

Phase 2 (2 周) — 差异化
  ⬜ memory_verify (链上哈希证明 Aptos tx hash 链上校验)
  ⬜ memory_export (IETF SAIHM)
  ⬜ memory_resolve (确定性 max(serial))
  ⬜ memory_branch / memory_rollback (CoW 版本链)

Phase 3 (2 周) — 生产化
  ⬜ --slim / --universal 模式
  ⬜ SSE 远程服务器模式 + Session Handoff
  ⬜ auto-setup (npx memory-forge setup)
  ⬜ 5 个 MCP 目录上线
  ⬜ Pro/Team/Enterprise 付费墙 (SettleGrid)

Phase 4 (3 周) — 企业化
  ⬜ MCP 2026-07-28 协议兼容（双重协议栈）
  ⬜ Tasks API (memory_consolidate 作为长时间任务)
  ⬜ Elicitation 确认流程 (敏感记忆操作)
  ⬜ 多租户 RBAC + 工作区隔离
  ⬜ Cron + Webhook 调度 (定时记忆维护)

Phase 5 (持续) — 增长
  ⬜ 企业合规附加模块
  ⬜ 记忆市场 + USDC 结算
  ⬜ River Algorithm 学习引擎
  ⬜ 内容营销 + 社区建设
```

## 竞争壁垒（15 层）

```
存储与验证层：
  第 1 层：Shelby 去中心化热存储          ← 其他 25 个竞品用不了
  第 2 层：链上验证 + Aptos 链上证明       ← 其他方案没有
  第 3 层：Git 式分支/回滚 + 冲突解决      ← 学术阶段，无产品化

接入层：
  第 4 层：MCP 标准 + 一键嵌入            ← 覆盖全部 Agent 平台
  第 5 层：API Key 认证                ← @shelby-protocol 自注册
  第 6 层：auto-setup 自动发现配置        ← 对标 Moderne Agent Tools
  第 7 层：MCP 2026-07-28 协议就绪        ← 新一代协议首发兼容

智能层：
  第 8 层：River Algorithm 学习引擎       ← 沉积式记忆固化
  第 9 层：Token 效率模式 (73-98% 减少)   ← 内置 slim/universal
  第 10 层：会话 Bootstrap (Session Handoff) ← 对标 Engram/cf-memory-mcp

企业与商业层：
  第 11 层：企业合规                      ← 99% 竞品进不了
  第 12 层：多租户 RBAC                   ← 工具级 + 记忆级权限
  第 13 层：Cron + Webhook 调度           ← 定时记忆维护

生态层：
  第 14 层：记忆市场                      ← 对标 Tome AI / Ghast AI
  第 15 层：分销网络效应 (5+ 目录)        ← 先发优势
```

## 融资对标与定位

### AI 记忆赛道已获巨额融资

| 公司 | 融资 | 投资方 | 定位 |
|------|------|--------|------|
| **Engram** | **$98M** | Sequoia, Kleiner Perkins | 企业 AI 记忆层 |
| Mem0 | $24M | Basis Set, Peak XV, YC | 通用 AI 记忆 |
| Viktor | $75M | Accel | AI 协作助手 |

**MemoryForge 定位：去中心化版 Engram + 1/100 成本**

```
Engram:       企业私有化 + $50K-150K/年维护
MemoryForge:   SaaS 托管 + $7-149/月订阅

核心差异：
  - Shelby 去中心化存储 vs 客户自建
  - 链上验证 链上验证 vs 无验证
  - MCP 一键嵌入 vs 重量级部署
```

### Aptos $50M AI Agent 基金

Aptos Foundation 承诺 $50M 投入 AI Agent 生态。**MemoryForge 作为首个基于 Shelby 的 MCP Agent 记忆服务，可申请 Grant。**
