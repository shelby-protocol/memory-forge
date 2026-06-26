# MemoryForge

> 基于 Shelby 去中心化热存储协议的 AI Agent 生态项目

## AgentVault

**AI Agent 持久记忆引擎。一键安装，自动工作。**

```bash
claude mcp add agentvault -- npx agentvault
```

## 两个版本

| | 精简版（推荐） | 完整版 |
|--|-------------|--------|
| 工具数 | **8** | 20 |
| 用户安装步骤 | **1 步** | 4 步 |
| 定价层 | Free / Pro $5 / Team $15 | Free / Pro $7 / Team $19 / Enterprise $149 |
| 定位 | 简单易用，快速上线 | 企业级全功能 |
| 文档 | [versions/lean/](agentvault/versions/lean/) | [versions/full/](agentvault/versions/full/) |

## 精简版工具（8 个）

```
memory_store    memory_search   memory_recall   memory_list
memory_forget   memory_context  memory_export   memory_share
```

## 当前文档

| 文件 | 内容 |
|------|------|
| [agentvault/SPEC.md](agentvault/SPEC.md) | 完整版产品规格 |
| [agentvault/ARCHITECTURE.md](agentvault/ARCHITECTURE.md) | 完整版系统架构 |
| [agentvault/MARKET.md](agentvault/MARKET.md) | 市场分析与竞品 |
| [agentvault/REVENUE.md](agentvault/REVENUE.md) | 完整版收入模型 |
| [agentvault/ADVANTAGES.md](agentvault/ADVANTAGES.md) | 竞争优势分析 |
| [agentvault/OPTIMIZATIONS.md](agentvault/OPTIMIZATIONS.md) | 9 轮优化记录 |
| [agentvault/versions/full/](agentvault/versions/full/) | 完整版归档 |
| [agentvault/versions/lean/](agentvault/versions/lean/) | 精简版文档 |

## 状态

| 项目 | 阶段 |
|------|------|
| AgentVault | 规划完成，待开发 |

## 技术栈

- **MCP 协议**: @modelcontextprotocol/sdk
- **存储**: @shelby-protocol/sdk + @aptos-labs/ts-sdk → Shelby Protocol
- **嵌入**: Transformers.js (进程内, 23MB, Xenova/all-MiniLM-L6-v2)
- **运行时**: Node.js 18+, TypeScript
