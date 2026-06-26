# MemoryForge

> 唯一基于去中心化热存储、链上可验证、合规可审计的 AI Agent 记忆引擎。

## 一句话定位

MemoryForge = 基于 Shelby 协议 + MCP 标准的去中心化 AI Agent 持久记忆引擎。一键嵌入 Claude Code / Cursor / Codex / Devin / Windsurf。

## 为什么需要 MemoryForge

现在的 AI Agent 都是**失忆的**——关闭会话就忘记一切。换平台从零开始。无法验证记忆的真伪。

MemoryForge 解决这三个问题：
1. **持久化**：记忆存 Shelby 去中心化热存储，跨会话、跨平台
2. **可验证**：每条记忆有 链上哈希证明，无法篡改
3. **合规**：GDPR 被遗忘权 + 不可篡改审计链

## 快速开始

```bash
# 一键自动配置所有 Agent 平台
npx memory-forge setup
# → 自动检测 Claude Code / Cursor / Windsurf / VS Code / Codex / Devin
# → 需要 Shelby API Key（在 docs.shelby.xyz/sdks/typescript/acquire-api-keys 获取）

# 或手动嵌入 Claude Code
claude mcp add memory-forge -- npx memory-forge
```

## 核心能力

| 能力 | 说明 |
|------|------|
| 去中心化存储 | Shelby 热存储（亚秒级读取，~70% 比 AWS 便宜） |
| 链上可验证 | 每条记忆有 Aptos 链上证明 |
| MCP 标准 | 一键嵌入全部 Agent 平台 |
| Git 式版本控制 | 分支、回滚、diff、合并 |
| 自动冲突解决 | 确定性算法，非 LLM 判断 |
| Token 效率 | slim 模式（73% 减少），universal 模式（98% 减少） |
| 企业合规 | GDPR / HIPAA / SOC2 审计链 |
| 记忆市场 | 用户可交易记忆包 |

## 定价

| 方案 | 价格 | 说明 |
|------|------|------|
| Free | $0 | 核心层 7 工具，100 条记忆，本地模式 |
| Pro | $7/月 | + 差异层（链上哈希验证/导出/冲突解决），10K 记忆，Shelby 存储 |
| Team | $19/月 | 全 15 工具，50K 记忆，SSE 远程，多 Agent 协作 |
| Enterprise | $149/月 | + 链上哈希审计 + SSO + SLA + 合规报告 |

## 项目结构

```
memory-forge/
├── README.md           # 本文件
├── SPEC.md             # 完整产品规格
├── MARKET.md           # 市场分析与竞品
├── ARCHITECTURE.md     # 系统架构
├── REVENUE.md          # 收入模型
├── package.json        # npm 配置
├── tsconfig.json       # TypeScript 配置
└── src/
    └── index.ts        # MCP Server 入口
```

## 技术栈

- **MCP 协议**：`@modelcontextprotocol/sdk`
- **存储层**：`@shelby-protocol/sdk` (Shelby Protocol)
- **嵌入**：本地 Ollama / OpenAI 可切换
- **链上**：Aptos 交易哈希 + 链上存储证明
- **运行时**：Node.js 18+, TypeScript
