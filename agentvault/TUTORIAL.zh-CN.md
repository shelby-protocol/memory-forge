# MemoryForge — 完整使用指南

> v0.7.0 · 一条命令。零配置。让 AI Agent 记住一切。

---

## 目录

1. [MemoryForge 是什么](#1-memoryforge-是什么)
2. [安装](#2-安装)
3. [第一次使用](#3-第一次使用)
4. [记忆如何工作](#4-记忆如何工作)
5. [9 个 MCP 工具详解](#5-9-个-mcp-工具详解)
6. [5 个自动引擎](#6-5-个自动引擎)
7. [会话交接 — 瞬间恢复上下文](#7-会话交接--瞬间恢复上下文)
8. [Git 分支感知](#8-git-分支感知)
9. [过时检测](#9-过时检测)
10. [记忆关联](#10-记忆关联-related_to)
11. [统计面板](#11-统计面板)
12. [Pro — 跨设备云同步](#12-pro--跨设备云同步)
13. [上下文排序算法](#13-上下文排序算法)
14. [存储文件结构](#14-存储文件结构)
15. [CLI 命令参考](#15-cli-命令参考)
16. [常见问题](#16-常见问题)
17. [卸载](#17-卸载)
18. [进阶技巧](#18-进阶技巧)

---

## 1. MemoryForge 是什么

MemoryForge 给你的 AI 编程 Agent **跨会话、跨设备、跨时间的持久记忆**。

**没有 MemoryForge：** 每次打开 Claude Code（或 Cursor、Windsurf、VS Code），Agent 从零开始。它不知道你是谁、项目是什么、偏好是什么、10 分钟前在做什么。

**有了 MemoryForge：** 会话一启动，Agent 立刻知道：

| Agent 记得什么 | 举例 |
|---|---|
| 你的编码偏好 | "使用 `pnpm` 而非 `npm`。偏好 React 19 + TypeScript strict 模式。" |
| 项目上下文 | "Turborepo monorepo。PostgreSQL + Prisma。部署到 Vercel。" |
| 过往决策 | "选择 Redis 而非 Memcached 做 session store，因为需要持久化。" |
| 上次做什么 | "上次会话：修复了 auth 中间件的 JWT 刷新问题。下一步：部署到 staging。" |
| 调试历史 | "Auth bug 是 token 过期偏移了 5 秒造成的。在 middleware.ts 中已修复。" |
| 团队约定 | "所有 API 端点返回 RFC 9457 Problem Details JSON 错误体。" |

**全部自动完成**，只需要一次 `npx memory-forge setup`。

---

## 2. 安装

### 第一步：运行安装

```bash
npx memory-forge setup
```

**安装过程中你会看到：**

```
╔══════════════════════════╗
║   MemoryForge Setup       ║
╚══════════════════════════╝

📦 Installing memory-forge globally (background)…
   ✅ Global install complete

🪝  Installing Claude Code hooks…
   ✅ Hooks installed (SessionStart / Stop / PreCompact / PostToolUse)

📋 Scanning existing rules…
   Found 3 rules in CLAUDE.md / .cursor/rules / .gitconfig
   ✅ Imported 3 rules as memories

🧠 Preloading embedding model (background)…
   ℹ️  Model will download on first use (~23MB, one-time)

🔍 Verifying setup…
   SessionStart:  ✅
   Stop:          ✅
   PreCompact:    ✅
   PostToolUse:   ✅

┌──────────────────────────────────────┐
│  MemoryForge is ready!                │
│                                      │
│  Your AI Agent now has memory.       │
│  It will automatically:              │
│    • Remember your preferences       │
│    • Load context on session start   │
│    • Capture learnings each session  │
│                                      │
│  Try it now:                          │
│    • CLI:  memory-forge list         │
│    • CLI:  memory-forge search "react"│
│    • CLI:  memory-forge stats        │
│    • MCP:  memory_store "I prefer…"  │
│                                      │
│  No further setup needed.            │
└──────────────────────────────────────┘
```

### 第二步：验证

```bash
memory-forge stats
```

```
Total: 3  |  Accesses: 0  |  Weekly new: 3  |  Oldest: Jun 27  |  Newest: Jun 27
Categories: claude-rules(2)  user-info(1)
Decay: active=3 fading=0 stale=0 archived=0
```

导入的规则已经变成了记忆，共 3 条。

### 环境要求

- **Node.js 18+**
- **Claude Code / Cursor / Windsurf / VS Code** 支持 MCP 协议
- **Git**（可选 — 分支感知功能需要）
- **Free 版**：不需要网络（除一次性下载 23MB 模型）
- **Pro 版**：Shelbynet 测试网账号（免费领水龙头代币）

---

## 3. 第一次使用

打开 Claude Code（或支持 MCP 的 IDE），你会看到：

```
MemoryForge: 3 memories loaded from previous sessions

[MemoryForge] 📋 Recent context from previous sessions:

- [Global Instructions] Jun 27, 05:30 PM | claude-rules
  # Global Instructions  ## Auto Context Management  - When context usage…

- [Git User Info] Jun 27, 05:30 PM | user-info
  Git user email: you@example.com Git user name: YourName
```

Agent 已经知道导入的规则了。现在教它一些新东西。

### 告诉 Agent 你的项目

正常说话就行。Agent 自己在背后调用工具。

**你：** "我们的项目用 React 19、TypeScript strict 模式、Tailwind CSS v5，包管理用 pnpm。"

**Agent** *（内部调用 memory_store）*：
```json
{
  "success": true,
  "memory_id": "a1b2c3d4-...",
  "name": "Our project uses React 19 TypeScript strict mode Tailwind",
  "preview": "Our project uses React 19, TypeScript strict mode, Tailwind CSS v5, and pnpm as the package manager."
}
```

**Agent**（回复你）："已保存。项目技术栈是 React 19、TypeScript strict、Tailwind v5、pnpm。"

### 做技术决策

**你：** "我们用 PostgreSQL + JSONB 做文档存储，不用 MongoDB。"

**Agent** *（内部调用 memory_store）*：
```json
{
  "success": true,
  "memory_id": "b2c3d4e5-...",
  "name": "Use PostgreSQL with JSONB for document storage",
  "category": "decision-log",
  "priority": 7
}
```

### 搜索之前的决定

**你：** "我们之前决定用什么数据库来着？"

**Agent** *（内部调用 memory_search）* → 立刻找到 PostgreSQL 决策记忆。

---

## 4. 记忆如何工作

### 四阶段生命周期

```
┌─────────────────────────────────────────────────────┐
│  会话启动 (SessionStart)                              │
│  Hook 触发 → 加载 top-5 记忆 → Agent 立刻知道上下文    │
├─────────────────────────────────────────────────────┤
│  会话中                                              │
│  Agent 按需调用 memory_store/search/recall/list/      │
│  update/forget                                      │
│  postToolUse hook 提醒 Agent 保存关键变更              │
├─────────────────────────────────────────────────────┤
│  上下文压缩前 (PreCompact)                             │
│  上下文窗口即将满了 → 提示 Agent 写会话交接 + 保存关键   │
│  学习内容。同时捕获对话记录作为安全备份                  │
├─────────────────────────────────────────────────────┤
│  会话结束 (SessionStop)                               │
│  Hook 触发 → autoPriority 重算 → autoDecay 检查       │
│  → 保存对话记录 → Pro 同步到云端                       │
└─────────────────────────────────────────────────────┘
```

### 记忆分类

每条记忆有分类，影响在上下文中"记住"多久：

| 分类 | 半衰期 | 用途 |
|---|---|---|
| `session-handoff` | **∞**（始终显示） | 会话总结，上次做了什么 |
| `decision-log` | 38天 | 架构决策、技术选型 |
| `project-context` | 30天 | 技术栈、仓库结构、约定 |
| `user-preference` | 24天 | 编码风格、工具偏好 |
| `code-pattern` | 20天 | 可复用模式、样板代码 |
| `general` | 14天 | 其他 |
| `session-transcript` | **0**（永不注入上下文） | 原始对话记录 |

---

## 5. 9 个 MCP 工具详解

### 5.1 `memory_store` — 存储记忆

Agent 的核心工具。你不需要直接调用，Agent 自己来。

**参数：**

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `content` | string (1-100000字符) | **必填** | 记忆内容 |
| `category` | string | `"general"` | 见上面分类表 |
| `tags` | string[] | `[]` | 可搜索标签 |
| `priority` | number (1-10) | `5` | 重要度。10=常青 |
| `name` | string (1-120) | 自动生成 | 自定义名称 |
| `branch` | string | 自动检测 | Git 分支，用于上下文范围 |
| `related_to` | string[] | `[]` | 关联记忆 ID |

**示例 1 — 简单偏好：**
```
memory_store({
  content: "Go 文件用 tab 缩进，TypeScript 文件用空格缩进。"
  category: "user-preference",
  tags: ["formatting", "indentation"],
  priority: 8
})
```

**示例 2 — 项目决策：**
```
memory_store({
  content: "选择 Redis (v7.2) 而非 Memcached 做 session store。原因：支持持久化、数据结构更丰富、团队有经验。Memcached 虽然简单但缺少我们需要的持久化能力。"
  category: "decision-log",
  tags: ["redis", "architecture", "session-store"],
  priority: 9
})
```

**示例 3 — 代码模式：**
```
memory_store({
  content: "Repository 模式：所有数据访问通过 src/repositories/ 中的接口。实现类在 src/repositories/implementations/。通过构造函数参数注入依赖。"
  category: "code-pattern",
  tags: ["architecture", "repository-pattern", "dependency-injection"],
  priority: 7
})
```

**示例 4 — 带关联：**
```
memory_store({
  content: "PostgreSQL users 表结构：id UUID PK, email UNIQUE, name TEXT, created_at TIMESTAMPTZ, settings JSONB。"
  category: "decision-log",
  tags: ["database", "postgresql", "schema"],
  priority: 8,
  related_to: ["b2c3d4e5-..."]  // 链接到"选择 PostgreSQL"那条记忆
})
```

### 5.2 `memory_search` — 搜索记忆

语义搜索。嵌入模型可用时用向量搜索，不可用时自动降级为关键词搜索。

**参数：**

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `query` | string | **必填** | 自然语言查询 |
| `limit` | number (1-20) | `5` | 最大结果数 |
| `min_similarity` | number (0-1) | `0.6` | 最低相关性分数 |
| `category` | string | — | 按分类过滤 |
| `tags` | string[] | — | 按标签过滤（OR 匹配） |

**示例 1 — 找之前的解决方案：**
```
memory_search({
  query: "auth token 过期 bug 怎么修的"
  limit: 3
})
```

返回：
```json
{
  "query": "auth token 过期 bug 怎么修的",
  "count": 1,
  "results": [{
    "memory_id": "c3d4e5f6-...",
    "name": "JWT token expiry offset bug in auth middleware",
    "similarity": 0.85,
    "content": "Token 过期检查在 src/auth/middleware.ts:42 用了 `<` 而非 `<=`。导致 token 提前 5 秒过期。改为 `<=` 修复。",
    "_method": "keyword"
  }]
}
```

**示例 2 — 按分类搜索：**
```
memory_search({
  query: "数据库 schema",
  category: "decision-log",
  limit: 5
})
```

### 5.3 `memory_recall` — 获取完整详情

通过 ID 获取单条记忆的完整内容和元数据，包括关联记忆。

```
memory_recall({
  memory_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
})
```

返回：
```json
{
  "memory_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "Our project uses React 19 TypeScript strict mode",
  "content": "Our project uses React 19, TypeScript strict mode, Tailwind CSS v5, and pnpm as the package manager.",
  "category": "user-preference",
  "tags": ["react", "typescript", "tailwind", "pnpm"],
  "priority": 8,
  "created_at": "2026-06-27T09:30:00.000Z",
  "access_count": 5,
  "branch": "main",
  "related_to": ["b2c3d4e5-..."],
  "related_memories": [{"id": "b2c3d4", "name": "Use PostgreSQL with JSONB"}]
}
```

### 5.4 `memory_list` — 浏览全部

**参数：**

| 参数 | 类型 | 默认值 |
|---|---|---|
| `category` | string | — |
| `tags` | string[] | — |
| `limit` | number (1-100) | `20` |
| `offset` | number | `0` |

**示例 — 浏览所有决策：**
```
memory_list({
  category: "decision-log",
  limit: 10,
  offset: 0
})
```

### 5.5 `memory_update` — 编辑记忆

部分更新。只改传了的字段，没传的保持原样。

**示例 — 提高决策重要性：**
```
memory_update({
  memory_id: "b2c3d4e5-...",
  priority: 10,
  tags: ["redis", "architecture", "session-store", "critical"]
})
```

**示例 — 更新内容：**
```
memory_update({
  memory_id: "a1b2c3d4-...",
  content: "项目技术栈更新：React 19, TypeScript 5.8 strict, Tailwind v5, pnpm v10, Node.js 22。"
})
```

**示例 — 链接关联记忆：**
```
memory_update({
  memory_id: "b2c3d4e5-...",
  related_to: ["a1b2c3d4-...", "c3d4e5f6-..."]
})
```

### 5.6 `memory_forget` — 删除

```
memory_forget({
  memory_id: "old-memory-id-..."
})
```

返回：`{ "success": true, "memory_id": "...", "action": "deleted" }`

Pro 版：同时上传云端墓碑，确保删除操作同步到其他设备。

### 5.7 `memory_context` — 加载会话上下文

返回和 SessionStart 自动注入相同的 top-N 上下文。

```
memory_context({ limit: 3 })
```

### 5.8 `memory_export` — 备份/迁移

**JSON 格式：**
```
memory_export({ format: "json" })
```
返回完整 JSON，可以导入到其他机器。

**Markdown 格式：**
```
memory_export({ format: "markdown" })
```
人类可读，适合做文档或分享。

**导出特定记忆：**
```
memory_export({
  memory_ids: ["id1", "id2"],
  format: "json"
})
```

### 5.9 `memory_share` — 分享给队友

将单条记忆打包成可导入的 JSON。

```
memory_share({
  memory_id: "b2c3d4e5-...",
  recipient: "alice",
  note: "上周做的数据库选型决策，给你参考。"
})
```

返回：
```json
{
  "type": "memory-forge-share",
  "version": "1.0",
  "shared_at": "2026-06-27T10:00:00.000Z",
  "recipient": "alice",
  "note": "上周做的数据库选型决策，给你参考。",
  "memory": {
    "name": "Use PostgreSQL with JSONB for document storage",
    "content": "选择 PostgreSQL (v17) + JSONB 做文档存储…",
    "category": "decision-log",
    "tags": ["postgresql", "architecture"]
  },
  "import_instruction": "Use memory_store with this content to import."
}
```

接收方的 Agent 只需一次 `memory_store` 就能导入。

---

## 6. 5 个自动引擎

完全自动运行，你不需要关心。

### autoName（自动命名）

从内容中提取第一句有意义的话作为记忆名称。

| 内容 | 生成的名称 |
|---|---|
| "Always use React 19 with TypeScript strict mode. We also use..." | "Always use React 19 with TypeScript strict mode." |
| "```\ncode block\n```"（纯代码） | "memory"（回退名称） |

可以通过 `memory_store` 的 `name` 参数覆盖。

### autoMerge（自动合并）

新记忆与已有记忆 >80% 相似时，自动合并而非重复存储。

```
[MemoryForge] Merged duplicate: "PostgreSQL schema v2" → "PostgreSQL schema" (80%+ overlap)
```

### autoPriority（自动优先级）

会话结束时重新计算每条记忆的优先级（1-10），依据：

- **访问频率**（权重 40%）— 被检索了多少次
- **最近访问**（权重 40%）— 最近一次访问距今多久
- **年龄**（权重 20%）— 创建了多久

### autoDecay（自动衰减）

会话结束时按艾宾浩斯遗忘曲线检查每条记忆：

| 最后访问时间 | 衰减分数 | 状态 |
|---|---|---|
| 0-1 天 | 1.0 | 活跃 |
| 1-7 天 | 0.8 | 活跃 |
| 7-30 天 | 0.5 | 消退中 |
| 30-90 天 | 0.2 | 陈旧 |
| 90+ 天 | 0 | **归档**（文件被删除） |

### generateContextSummary（生成上下文摘要）

为 SessionStart 和 PreCompact 构建 top-N 上下文注入。详见[上下文排序算法](#13-上下文排序算法)。

---

## 7. 会话交接 — 瞬间恢复上下文

### 问题

没有会话交接时，SessionStart 只能给你碎片：

```
- [React 19 rules] Jun 27 | code-pattern
- [PostgreSQL schema] Jun 26 | decision-log
- [User prefers pnpm] Jun 25 | user-preference
```

Agent 看到了偏好和决策，但**不知道你上次实际在做什么**。

### 怎么解决

PreCompact（上下文窗口快满时）告诉 Agent：

```
[MEMORYFORGE HANDOFF] Create a session handoff summary BEFORE the context compacts.
Use memory_store with category="session-handoff" and priority=10. Include:
1. What we worked on this session
2. Key decisions made and why
3. File paths modified (for git context)
4. What's blocked or pending for next time
5. Any user preferences or patterns observed
This handoff will appear FIRST on the next SessionStart so you can resume instantly.
```

### Agent 创建什么

```
memory_store({
  content: "## 本次工作\n- 修复了 auth 中间件的 JWT token 刷新 bug（middleware.ts:42）\n- 新增 Redis (v7.2) session store 做 token 黑名单\n- 写了 12 个单元测试覆盖 JWT 刷新边界情况\n\n## 关键决策\n- Redis 而非 Memcached：token 黑名单需要持久化\n- JWT 刷新窗口：15 分钟（原来是 5 分钟）\n\n## 下一步\n- [ ] 部署到 staging 运行集成测试\n- [ ] 更新前端 token 刷新逻辑适配新窗口\n- [ ] 写 Redis session store 的迁移文档\n\n## 修改的文件\n- src/auth/middleware.ts (第42行：`<` 改 `<=`)\n- src/auth/token.ts (JWT 刷新窗口：300000 → 900000)\n- src/cache/redis.ts (新文件：session store 实现)\n- src/auth/__tests__/middleware.test.ts (12 个新测试)\n\n## 观察到的偏好\n- 用户偏好 `pnpm` 而非 `npm`\n- 用户提交前总是先跑测试\n- 用户用 VS Code + Tailwind CSS IntelliSense 插件",
  category: "session-handoff",
  priority: 10
})
```

### 下次会话

```
## 📋 上次会话 (Jun 27, 5:52 PM)

## 本次工作
- 修复了 auth 中间件的 JWT token 刷新 bug（middleware.ts:42）
- 新增 Redis (v7.2) session store 做 token 黑名单
- 写了 12 个单元测试覆盖 JWT 刷新边界情况

## 关键决策
- Redis 而非 Memcached：token 黑名单需要持久化
- JWT 刷新窗口：15 分钟（原来是 5 分钟）

## 下一步
- [ ] 部署到 staging 运行集成测试
- [ ] 更新前端 token 刷新逻辑适配新窗口
- [ ] 写 Redis session store 的迁移文档

---

其他记忆：
- [React 19 rules] Jun 27 | code-pattern
- [PostgreSQL schema] Jun 26 | decision-log
```

Agent 第一句话就能说："上次我们修复了 JWT 刷新 bug 和搭建了 Redis 做 token 黑名单。下一步是部署到 staging。要继续吗？"

---

## 8. Git 分支感知

### 做什么

切换分支时，当前分支的记忆在上下文中获得 **+50% 分数加成**。其他分支的记忆仍然可见但排名靠后。

### 自动工作

每次 `memory_store` 调用自动执行 `git branch --show-current`，结果存入 `branch` 字段。

### 手动覆盖

```
memory_store({
  content: "这个决策适用于所有分支。"
  branch: "*"  // 全局记忆，不绑定分支
})
```

### 上下文效果

在 `feat/auth` 分支上：
```
📋 feat/auth 分支的 5 条记忆（已加权）
- [JWT refresh fix] feat/auth
- [OAuth2 integration plan] feat/auth
- [Middleware refactor] feat/auth

📋 其他分支记忆
- [PostgreSQL schema] main
- [Deploy pipeline] main
```

切换到 `main` 分支后：
```
📋 无当前分支特定记忆
- [PostgreSQL schema] main
- [Deploy pipeline] main
- [JWT refresh fix] feat/auth（普通权重）
```

### 统计

```
memory-forge stats

Branches: main(28)  feat/auth(5)  fix/billing(3)
```

---

## 9. 过时检测

### 做什么

记忆里引用的文件路径如果已经不存在了（被改名、删除、重构），标记为可能过时。

### 自动工作

SessionStart 时扫描记忆内容中的文件路径模式（`src/...`, `lib/...`, `app/...`, `config/...`, `docs/...`），用 `fs.existsSync` 检查是否还存在。

### 示例

```
- [Fix auth middleware] Jun 20 | decision-log ⚠️ stale: src/auth/middleware.ts, src/auth/old-config.ts
  JWT token refresh bug fix — middleware.ts 在这条记忆创建后被重构了
```

Agent 看到 `⚠️ stale` 就知道文件引用可能不准确，需要重新定位。

### 哪些会被标记

只检查包含 `/` 和文件扩展名的路径 — 不会误标记普通单词或 URL。检查用 `fs.existsSync` 包裹 try/catch，损坏的引用不会导致崩溃。

---

## 10. 记忆关联 (related_to)

### 做什么

将有关系的记忆链接在一起。Recall 一条时能看到关联的其他记忆。

### 建立关联

```
# 根决策
memory_store({
  content: "选择 PostgreSQL 做文档存储。"
  name: "PostgreSQL 决策"
})
→ memory_id: "abc-123"

# Schema 设计，链接到决策
memory_store({
  content: "Users 表结构：id UUID PK, email UNIQUE..."
  name: "Users 表 schema"
  related_to: ["abc-123"]
})
→ memory_id: "def-456"

# 迁移计划，链接到 schema
memory_store({
  content: "Migration v3：新增 users 表，创建索引..."
  name: "Migration v3 - users 表"
  related_to: ["def-456", "abc-123"]
})
```

### Recall 时看到关联

```
memory_recall({ memory_id: "def-456" })
```

返回包含：
```json
{
  "memory_id": "def-456",
  "name": "Users 表 schema",
  "related_to": ["abc-123"],
  "related_memories": [
    { "id": "abc-12", "name": "PostgreSQL 决策" }
  ]
}
```

### 典型用法

构建决策树：
```
PostgreSQL 决策（根）
  └── Users 表 schema
        ├── Migration v3
        └── Users API 端点
  └── 索引优化
        └── 查询性能基准
```

### 后补关联

```
memory_update({
  memory_id: "def-456",
  related_to: ["abc-123", "xyz-789"]  // 替换所有已有关联
})
```

---

## 11. 统计面板

### CLI

```bash
memory-forge stats
```

```
Total: 38  |  Accesses: 126  |  Weekly new: 5  |  Oldest: Jun 01  |  Newest: Jun 27
Categories: decision-log(12)  code-pattern(8)  user-preference(6)  session-transcript(5)  project-context(4)  general(3)
Top tags: postgresql(8)  react(6)  auth(5)  typescript(4)  redis(3)  deploy(3)  tailwind(2)
Decay: active=25  fading=8  stale=4  archived=1
Branches: main(28)  feat/auth(5)  fix/billing(3)
Relations: 8 memories linked
Top accessed: PostgreSQL schema(15)  React 19 rules(12)  Auth middleware(9)  Deploy config(7)  Redis session store(6)  API patterns(5)  Tailwind dark mode(4)  CI/CD pipeline(4)  pnpm workspace(3)  Testing conventions(3)
```

### 数据解读

| 指标 | 含义 |
|---|---|
| `Weekly new: 5` | 本周存储了 5 条记忆 — 使用正常 |
| `active=25` | 25 条记忆 7 天内被访问过 — 大多数活跃 |
| `fading=8` | 8 条 1-4 周未访问 — 还有用但在消退 |
| `stale=4` | 4 条 1-3 个月未访问 — 需要审视 |
| `archived=1` | 1 条被删除（90+ 天未使用） |
| `Relations: 8` | 8 条记忆有关联链 |
| `Branches: feat/auth(5)` | auth 分支积累了 5 条记忆 — 可能需要合并回 main |

---

## 12. Pro — 跨设备云同步

### 为什么用 Pro

Free 版记忆存在本地 `~/.memory-forge/memories/`。Pro 版同步到 **Shelby 区块链**，所有设备共享同一个记忆池。

| 场景 | Free | Pro |
|---|---|---|
| 同台电脑，第二天 | ✅ | ✅ |
| 公司电脑 → 家里笔记本 | ❌ | ✅ |
| 电脑崩溃，换新机 | ❌ | ✅ |
| 分享记忆给队友 | 手动导出 | ✅ 自动同步 |

### 激活

```bash
# 第一步：获取免费 API key
# 访问：https://docs.shelby.xyz/sdks/typescript/acquire-api-keys

# 第二步：激活
SHELBY_API_KEY="your-key" memory-forge pro
```

首次激活创建链上账号并上传所有已有记忆：

```
╔══════════════════════════╗
║   MemoryForge Pro Setup   ║
╚══════════════════════════╝

🔄 Initializing Shelby storage…
   ℹ️  Auto-generated Shelbynet account
   ℹ️  Address: 0xe1c4784a9ce…
   ⚠️  Fund this account with APT + ShelbyUSD:
      APT:       https://docs.shelby.xyz/apis/faucet/aptos
      ShelbyUSD: https://docs.shelby.xyz/apis/faucet/shelbyusd

📤 Uploading existing memories to Shelby…

┌──────────────────────────────────────┐
│  MemoryForge Pro is active!           │
│                                      │
│  ✅ 32 memories synced to Shelby     │
│  ✅ Auto-sync on every session       │
│  ✅ Memories survive across devices  │
└──────────────────────────────────────┘
```

### 领取水龙头代币（Shelbynet 测试网 — 免费）

访问以下地址给账号充值：
- **APT**（gas 费）：https://docs.shelby.xyz/apis/faucet/aptos
- **ShelbyUSD**（存储费）：https://docs.shelby.xyz/apis/faucet/shelbyusd

Gas Station 会赞助大多数交易（即使余额为 0 也能用）。但充值后更可靠。

### 多设备配置

**电脑 A：**
```bash
SHELBY_API_KEY="your-key" memory-forge pro
```

**电脑 B：**
```bash
# 设置相同的环境变量
export SHELBY_API_KEY="your-key"
export APTOS_PRIVATE_KEY="从 pro.json 中获取的私钥"

npm i -g memory-forge@latest
memory-forge pro    # 从 Shelby 下载所有记忆
```

两台电脑现在共享同一个记忆池。

### Pro 状态

```bash
memory-forge pro status
```

```
Pro: active ✅

  ── Account ──
  Address:            0xe1c4784a9ce…
  API key:            ✅ valid
  APT balance:        0.5000
  ShelbyUSD balance:  10.0000

  ── Storage ──
  Local memories:     38
  Shelby blobs:       45 (245.3 KB)

  ── Sync stats ──
  Total uploaded:     50
  Total downloaded:   12
  Total failed:       2
  Total conflicts:    3
  Last sync:          2026-06-27 10:00:30
  Recent syncs:
    2026-06-27 10:00  ↑5 ↓0
    2026-06-27 09:30  ↑0 ↓12
    2026-06-26 18:00  ↑3 ↓0
```

### 自动同步

Pro 在以下时机自动同步：
- **SessionStart** — 从云端下载新记忆
- **SessionStop** — 上传新增/修改的记忆到云端
- **PreCompact** — 上下文压缩前的安全同步

激活后不需要手动操作。

### 同步冲突处理

如果一条记忆在两个设备上都被改了，云端版本胜出（时间戳比较）。冲突会记录：

```
[MemoryForge] Merge conflict on "React 19 rules": priority — remote won
```

---

## 13. 上下文排序算法

SessionStart 构建 top-N 上下文时使用以下排序算法：

### 第一层：分类过滤

`session-transcript` 被排除。`session-handoff` 强制包含。

### 第二层：三组分离

```
1. 交接组 (session-handoff)
   └── 只取最近一条。完整内容展示在 "📋 上次会话" 下。

2. 常青组 (priority=10，非 handoff)
   └── 按 priority 降序排列。

3. 普通组 (priority < 10)
   └── 按下述算法排序。
```

### 第三层：普通记忆排序

```
分数 = 衰减 × 优先级 × 分支加成

其中：
  衰减       = 0.5 ^ (距上次访问天数 / 分类半衰期)
  优先级     = 1-10（用户指定或自动计算）
  分支加成   = 同分支 1.5，其他分支 1.0
```

### 第四层：去重

与已选中记忆内容重叠 >60% 的被跳过。

### 计算示例

假设 3 条普通记忆的最后访问时间相同：

| 记忆 | 分类 | 优先级 | 分支 | 衰减 | 分支加成 | 分数 |
|---|---|---|---|---|---|---|
| "Auth 中间件修复" | decision-log | 7 | main | 0.982 | 1.5 | **10.3** ← 第1 |
| "Tailwind 配置" | code-pattern | 8 | feat/ui | 0.966 | 1.0 | 7.7 |
| "CI 流水线" | project-context | 6 | main | 0.977 | 1.5 | **8.8** ← 第2 |

"Auth 中间件修复" 胜出原因：同分支（+50%）、衰减慢（decision-log）、优先级合理。

---

## 14. 存储文件结构

```
~/.memory-forge/
├── pro.json              # Pro 账号：地址、私钥、API key、同步统计
├── tombstones.json       # 已删除的记忆 ID（跨设备删除传播）
└── memories/
    ├── abc123.md         # 单条记忆文件
    ├── def456.md         # 另一条记忆
    └── xyz789.md         # 对话记录
```

### 记忆文件格式

```markdown
# React 19 TypeScript strict mode

> category: user-preference
> tags: ["react","typescript","strict-mode"]
> priority: 8
> created: 2026-06-27T09:30:00.000Z
> access_count: 5
> last_accessed: 2026-06-27T10:00:00.000Z
> branch: main

Always use React 19 with TypeScript strict mode and exactOptionalPropertyTypes enabled.
```

人类可读的 Markdown。可以直接编辑。修改在下次加载时生效。

### Pro 配置文件

```json
{
  "version": 2,
  "activatedAt": "2026-06-27T09:00:00.000Z",
  "privateKey": "ed25519-priv-...",
  "address": "0xe1c4784a9ce…",
  "apiKey": "AG-…",
  "lastSync": "2026-06-27T10:00:30.697Z",
  "totalUploaded": 50,
  "totalDownloaded": 12,
  "totalFailed": 2,
  "totalConflicts": 3,
  "syncHistory": […]
}
```

Unix 系统上文件权限设为 `0600`（仅 owner 可读写）。

---

## 15. CLI 命令参考

```bash
# 安装与配置
memory-forge setup              # 一次性安装：hooks + 导入规则

# 浏览
memory-forge list               # 列出所有记忆
memory-forge list decision-log  # 按分类过滤
memory-forge list user-preference

# 搜索
memory-forge search "PostgreSQL 数据库"
memory-forge search "JWT 认证"

# 统计
memory-forge stats              # 健康面板

# Pro
memory-forge pro                # 激活 / 重新同步
memory-forge pro status         # 账号 + 存储 + 同步统计

# 维护
memory-forge capture-transcript # 手动捕获对话记录

# 查看版本
memory-forge --version          # 例如：0.7.0

# MCP 服务器（Claude Code / Cursor 自动启动）
memory-forge                    # 启动 MCP stdio 服务器
```

### 环境变量

| 变量 | 用途 |
|---|---|
| `SHELBY_API_KEY` | Pro 云同步 API key |
| `APTOS_PRIVATE_KEY` | Pro 账号私钥（可选 — 不设置则自动生成） |
| `MEMORYFORGE_HOME` | 覆盖存储目录（默认：`~/.memory-forge`） |

---

## 16. 常见问题

| 问题 | 可能原因 | 解决方法 |
|---|---|---|
| Agent 好像不记得事情 | Hooks 未安装 | 重新 `memory-forge setup` |
| Agent 说"没有记忆" | SessionStart hook 未触发 | 检查 `~/.claude/settings.json` 中是否有 memory-forge hooks |
| Pro 同步失败 | API key 无效或过期 | `SHELBY_API_KEY="新key" memory-forge pro` |
| 余额显示 0 但 Pro 能用 | Gas Station 赞助交易 | 正常 — 充值后更稳定 |
| 搜索无结果 | 嵌入模型未下载 | 等 5 分钟自动重试。或检查 huggingface.co 网络连通性 |
| 重复记忆太多 | autoMerge 未触发 | 正常 — 需 >80% 相似才合并 |
| "Corrupted profile" 错误 | pro.json 是无效 JSON | 删除 `~/.memory-forge/pro.json` 后重新 `memory-forge pro` |
| 对话记录采集失败 | 没有最近的 Claude Code 会话 | 新安装正常。下次会话后会正常工作 |
| 全局安装版本过旧 | npm 缓存 | `npm cache clean --force && npm i -g memory-forge@latest` |
| 完全重置 | 清空所有数据 | `rm -rf ~/.memory-forge/` 然后从 settings.json 中移除 hooks |

---

## 17. 卸载

```bash
# 删除所有记忆数据
rm -rf ~/.memory-forge/

# 全局卸载
npm uninstall -g memory-forge

# 从 Claude Code 设置中移除 hooks
# 编辑 ~/.claude/settings.json — 删除所有 hook 段中 "memory-forge" 的条目
# (SessionStart, Stop, PreCompact, PostToolUse)
```

---

## 18. 进阶技巧

### 永久设置环境变量

添加到 `~/.bashrc` 或 `~/.zshrc`：
```bash
export SHELBY_API_KEY="your-key"
export APTOS_PRIVATE_KEY="your-private-key"
```

### 定期检查记忆健康

```bash
memory-forge stats
```

关注：
- `archived` 数量增长 — 记忆在被清理
- `stale` > 5 — 需要审视旧记忆
- `weekly_new: 0` 持续数周 — Agent 保存不够积极

### 坚持做会话交接

最重要的一条习惯：**正常结束会话**（不要强制关闭终端），这样 PreCompact hook 才会触发，Agent 才会写交接总结。

### 用分支组织上下文

做大的功能时创建分支。该分支上创建的记忆自动获得上下文优先级。完成后合并分支。记忆依然可访问但权重降低。

### 链接关联记忆

做决策时如果是从之前的决策延伸出来的，加上 `related_to`。构建决策树。未来的会话可以从根节点一路遍历到叶子节点。

### 用导出做备份

即使有 Pro 同步，定期：
```
# Agent：导出所有记忆为 JSON
memory_export({ format: "json" })

# 把输出保存到文件
```

---

**就这些。你的 AI Agent 现在有记忆了。它只会越来越聪明。**

---

*MemoryForge v0.7.0 · MIT License · [GitHub](https://github.com/shelby-protocol/memory-forge)*
