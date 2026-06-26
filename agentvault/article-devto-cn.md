# 你的 AI Agent 失忆了。这是我修好的方法。

**每次你关闭 Claude Code 或 Cursor，你的 AI Agent 就忘记了一切。**

你告诉过它你偏好 React 19 + TypeScript。你教它理解了项目的认证流程。你和它一起花了 20 分钟调试了一个配置问题。关上终端——全没了。

66% 的开发者抱怨 AI Agent 的输出"几乎对，但差一点"。根本原因是什么？缺少上下文。每次会话都从零开始。

## 记忆市场正在爆发

AI 记忆赛道已被顶级 VC 重金验证：

- **Engram** 融资 **$9800 万**（红杉、Kleiner Perkins，2026 年 6 月）
- **Mem0** 融资 **$2400 万**（Basis Set、Peak XV、YC）
- **Weaviate** 刚刚发布 **Engram GA** 作为托管记忆基础设施

市面上有超过 **25 个 MCP 记忆服务器**——MemPalace、Nexus、Mind Keg、Waggle、Enfram、ShelbyMCP、Memoir、Deep Recall、Apex Memory……它们全部把记忆存在**本地 SQLite 文件**里。

## 本地存储的问题

```
✅ 快
✅ 离线
❌ 换电脑 → 没了
❌ 格式化硬盘 → 没了
❌ 没有审计追踪
❌ 无法分享给队友
❌ 无法证明这段记忆是真实的
```

## MemoryForge 是什么

MemoryForge 是一个 MCP 记忆服务器，把你的 AI Agent 的记忆存储在 **Shelby 协议**上——一个由 Aptos Labs 和 Jump Crypto 联合构建的去中心化热存储网络。

```bash
# 免费版：本地存储，一条命令
npx memory-forge setup

# Pro 版：$5/月，云存储，换电脑自动恢复
npx memory-forge pro
```

**三个不同之处：**

### 1. 去中心化热存储（不是本地 SQLite）
你的记忆存储在 Shelby 上——全球分布式网络，亚秒级读取，比 AWS S3 便宜 70%。换电脑、格式化硬盘，记忆依然存在。

### 2. 可验证的记忆（Aptos 区块链）
每次记忆写入都生成链上交易哈希。你可以证明这段记忆在那个精确的时间点存在。没有任何其他 MCP 记忆工具能做到这一点。

### 3. 零配置安装
一条命令。MemoryForge 自动检测 Claude Code、Cursor、Windsurf 和 VS Code。自动导入你已有的 CLAUDE.md 和 .cursor/rules。自动安装 hooks。你不需要知道 Shelby、Aptos 或 gas 费是什么。

## 用起来是什么感觉

```
第 1 天： npx memory-forge setup → 完成
第 7 天： 换了台电脑。打开 Claude Code。
         → Agent 记得 React 19、camelCase、你的认证流程。
         → 什么都不用配置。什么都不用解释。
第 30 天：旧记忆自动归档。新记忆自动强化。
```

## 2 周构建完成

我一个人用两周时间构建了 MemoryForge。技术栈刻意保持极简：

- **MCP 服务器**：8 个工具（store、search、recall、list、forget、context、export、share）
- **向量嵌入**：Transformers.js 进程内运行（23MB 模型，不需要外部服务）
- **存储（免费版）**：本地 Markdown 文件（~/.memory-forge/memories/）
- **存储（Pro 版）**：Shelby 去中心化云存储，基于 @shelby-protocol/sdk
- **认证（Pro 版）**：Aptos Gas Station 代付（用户永远不需要碰加密货币）

零外部 SaaS 依赖。一切在你的机器上运行。

## 最难的不是代码

是克制功能膨胀。我一开始设计了 20 个工具、15 层竞争壁垒、6 个收入引擎。最后砍到 8 个工具、2 个价格档位、1 条安装命令。

最好的产品是让人感觉不到它存在的产品。

## 我需要你的帮助

MemoryForge 是真实的产品——MCP 服务器已运行，Shelby 云已验证，全部测试通过。但在投入更多时间之前：

**你会用吗？**

- 如果会：还缺什么？
- 如果不会：什么能让你改变主意？
- 如果你用过其他 MCP 记忆工具：哪里出问题了？

留下评论。你需要的功能，我下周就写出来。

---

*立即体验：`npx memory-forge setup`（本周内上线 npm）*

*[GitHub: github.com/shelby-protocol/memory-forge](https://github.com/shelby-protocol/memory-forge)*
