# MemoryForge — 市场分析与竞品全景

> 分析时间：2026 年 6 月 | 搜索轮次：40+

## 市场数据

| 指标 | 数据 |
|------|------|
| Agentic AI 记忆系统市场（2026） | $9B |
| AI 治理/合规市场（2026） | $492M — $2.55B |
| MCP 总 Server 数 | 15,000-20,000 |
| MCP SDK 月下载量 | 97M-120M |
| MCP Server 赚钱比例 | < 5% |
| AI 审计服务市场（Q3 2026） | $1.4B 年化 |
| 78% 企业未开始 AI 合规准备 | 市场窗口 |

## MCP 记忆赛道（25+ 竞品）

| 竞品 | 存储 | 定价 | 差异化 | 缺陷 |
|------|------|------|--------|------|
| Memory-MCP | PostgreSQL+Docker | 免费 | 自动分类/去重 | 重量级，需要 Docker |
| MemPalace | ChromaDB | 免费 | 170 token 启动 | 纯本地 |
| Hindsight | 自建 | 免费 | 10M token | 重基础设施 |
| Nexus Memory | 未知 | $19-149/月 | 知识图谱 | 无 链上验证 |
| Waggle | SQLite/Neo4j | 免费 | 对话图谱 | 纯本地 |
| Engram (7 个分支) | SQLite 为主 | 免费 | Git 类似功能 | 本地存储 |
| ShelbyMCP | SQLite | 免费 | 知识图谱 | **与 Shelby 协议无关** |
| Memoir | 本地文件 | 免费 | Git 版本控制 | 本地存储 |
| Deep Recall | 未知 | $39-299/月 | 情感搜索 | 无去中心化 |
| Tribal Memory | 本地 ChromaDB | 免费 | 跨 Agent 共享 | 纯本地，非 Shelby |
| MnemoVerse | 未知 | $29-149/月 | 原子记忆 | 无去中心化 |
| Apex Memory | SQLite | $9/月 | 轻量 + 云同步 | 中心化云 |

**共同缺陷：全部使用中心化/本地存储。没有 链上哈希验证。没有合规审计链。**

## Shelby 生态现有项目

| 项目 | 类型 | 能力 | MCP? |
|------|------|------|:--:|
| Shelby MCP Server（官方） | MCP CRUD | shelby_upload/download/list/delete/account | ✅ |
| shelby-mcp (jasekeee) | MCP CRUD | 同上（社区实现） | ✅ |
| shelby-agent-bridge | MCP 桥接 | Agent ↔ Shelby | ✅ |
| ShelMem SDK (Python) | SDK | write/recall/delete | ❌ |
| @forestinfra/shelmem (TS) | SDK | write/recall/delete | ❌ |
| @shelby-protocol/sdk (TS) | SDK | 完整 API（含加密/合规/向量/计费） | ❌ |

**关键发现：Shelby 有 SDK 级的记忆 API，但没有 MCP Server 形态的记忆引擎。**

## 去中心化存储 MCP 项目

| 项目 | 存储 | 速度 | 说明 |
|------|------|------|------|
| 4EVERLAND MCP | IPFS/Arweave/Greenfield | 慢 | 全冷存储 |
| Hive Agent Storage | Storj/Filecoin/Arweave | 慢 | 全冷存储 |
| Storacha MCP | IPFS (+ Filecoin) | 慢 | 全冷存储 |

**三者全部是冷存储，不适合 Agent 记忆的实时检索需求。**

## MemoryForge 的独特位置

```
                    MCP 记忆项目 (25+)
                   ┌──────────────────┐
                   │  全部中心化存储     │
                   │  无 链上哈希验证       │
                   │  无合规审计        │
                   └────────┬─────────┘
                            │
              ┌─────────────┼─────────────┐
              │                           │
    去中心化存储 MCP (3)           Shelby SDK (3)
    ┌──────────────────┐       ┌──────────────────┐
    │  全部冷存储        │       │  无 MCP Server   │
    │  不适合实时检索     │       │  不能嵌入 Agent   │
    └──────────────────┘       └──────────────────┘
              │                           │
              └─────────────┬─────────────┘
                            │
                    ┌───────┴───────┐
                    │  MemoryForge   │  ← 唯一填空
                    │  热存储 + MCP  │
                    │  + 链上验证 + 合规   │
                    └───────────────┘
```

## 零竞争确认

经过 40+ 轮搜索确认，**Shelby 网络上没有任何项目做到**：

- ❌ MCP + Agent 记忆引擎 + Shelby 热存储 + 链上哈希验证 + Git 版本控制
- 最近的项目：
  - ShelbyMCP：碰巧同名，用 SQLite，与 Shelby 协议无关
  - Shelby MCP Server：只有 CRUD，无记忆管理
  - ShelMem SDK/@shelby-protocol SDK：无 MCP，Agent 不能直接用
