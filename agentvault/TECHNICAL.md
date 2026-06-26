# MemoryForge 技术文档

> 版本 0.1.8 | 8 MCP 工具 + 5 自动引擎 | Free 本地 + Pro Shelby 云

## 目录

1. [系统架构](#系统架构)
2. [数据模型](#数据模型)
3. [MCP 工具 API 参考](#mcp-工具-api-参考)
4. [自动引擎](#自动引擎)
5. [Hook 系统](#hook-系统)
6. [存储层](#存储层)
7. [嵌入引擎](#嵌入引擎)
8. [安全模型](#安全模型)
9. [Pro 层 (Shelby 云)](#pro-层-shelby-云)
10. [错误处理与降级](#错误处理与降级)

---

## 系统架构

```
┌─────────────────────────────────────┐
│  AI Agent (Claude Code / Cursor)    │  MCP stdio 协议
├─────────────────────────────────────┤
│  CLI 路由 (index.ts)                │
│  setup / pro / hook / MCP Server    │
├─────────────────────────────────────┤
│  8 MCP Tools                        │
│  store / search / recall / list     │
│  forget / context / export / share  │
├──────────────┬──────────────────────┤
│  Free 层     │  Pro 层               │
│  memoryStore │  ShelbyNodeClient     │
│  local .md   │  upload/download/list │
├──────────────┴──────────────────────┤
│  5 Auto Engines                     │
│  name → merge → priority → decay    │
│  → contextSummary                   │
├─────────────────────────────────────┤
│  Embedding Engine                   │
│  Transformers.js / MiniLM-L6-v2     │
│  384-dim vectors, cosine similarity │
│  fallback: keyword matching         │
└─────────────────────────────────────┘
```

### 源文件结构

```
agentvault/src/
├── index.ts           # 入口: CLI 路由 + MCP Server
├── store.ts           # MemoryStore: 内存索引 + 搜索
├── embedding.ts       # Transformers.js 延迟加载引擎
├── setup.ts           # 一键安装流程
├── pro.ts             # Pro 激活 + 同步
├── auto/index.ts      # 5 自动引擎
├── storage/
│   ├── local.ts       # Markdown 文件读写
│   └── shelby.ts      # Shelby 云 API 封装
├── hooks/install.ts   # Claude Code hooks 配置
└── migrate/import.ts  # 规则导入 + 去重
```

---

## 数据模型

### Memory 接口

```typescript
interface Memory {
  id: string;              // UUID v4
  name: string;            // 人类可读名称 (autoName 生成, 最长40字符)
  content: string;         // 原始内容
  category: string;        // 分类: user-preference | project-context | decision-log | code-pattern
  tags: string[];          // 标签列表
  priority: number;        // 1-10, autoPriority 动态调整
  vector: number[];        // 384-dim 嵌入向量
  created_at: string;      // ISO-8601 创建时间
  access_count: number;    // 访问次数 (touch)
  last_accessed: string | null;  // 最后访问时间
}
```

### 本地存储格式

文件路径: `~/.memory-forge/memories/{id}.md`

```markdown
# Memory Name
> category: user-preference
> tags: coding-style, javascript
> priority: 8
> created: 2026-06-26T10:00:00.000Z
> access_count: 5
> last_accessed: 2026-06-26T12:00:00.000Z

User prefers camelCase naming, single quotes, and 2-space indent.
```

### MemoryStore 索引

- `Map<string, Memory>` 主存储
- `Map<string, Float32Array>` 向量缓存
- LRU 淘汰: 5000 条上限, 超出淘汰最低访问量×优先级
- 去重: Jaccard 相似度 > 0.8 自动合并

---

## MCP 工具 API 参考

所有工具通过 MCP stdio 协议调用。Agent 自动获得，无需手动调用。

### memory_store

存储一条记忆。自动向量化、命名、去重合并。

```typescript
// Input
{
  content: string;        // required, min 1 char
  category?: string;      // "general" | "user-preference" | "project-context" | "decision-log" | "code-pattern"
  tags?: string[];        // default: []
  priority?: number;      // 1-10, default: 5
}

// Output (success)
{
  success: true;
  merged?: boolean;       // true if merged with existing memory (>80% overlap)
  memory_id: string;
  name: string;
  preview: string;        // first 200 chars
}
```

**内部流程:**
1. `embed(content)` → 384-dim vector (失败则 vector=[])
2. `autoName(content)` → 从内容提取名称
3. `autoMerge(store, memory)` → 检查已有记忆, >0.8 Jaccard 则合并
4. `saveMemory(memory)` → 写本地 Markdown
5. `store.add(memory)` → 更新 LRU 缓存
6. Pro: `uploadMemory(memory)` → Shelby 云 (async, fire-and-forget)

### memory_search

语义检索记忆。向量优先, 失败自动降级关键词。

```typescript
// Input
{
  query: string;           // required, 自然语言
  limit?: number;          // 1-20, default: 5
  min_similarity?: number; // 0-1, default: 0.6
  category?: string;       // filter by category
  tags?: string[];         // filter by tags (OR match)
}

// Output
{
  query: string;
  count: number;
  results: [{
    memory_id: string;
    name: string;
    similarity: number;    // cosine similarity (0 if keyword fallback)
    content: string;
    _method: "vector" | "keyword";
  }];
  hint: string | null;     // "No relevant memories found." if empty
}
```

**评分公式 (向量模式):**
```
score = cosineSimilarity(queryVec, memoryVec)
      × (priority / 5)
      × (1 + min(access_count, 10) × 0.05)
```

**评分公式 (关键词模式):**
```
score = (contentHits × 2 + nameHits × 3) + priority
```

### memory_recall

按 ID 精确获取一条记忆。

```typescript
// Input
{ memory_id: string }

// Output (success)
{
  memory_id, name, content, category, tags,
  priority, created_at, access_count
}

// Output (not found)
{ error: "Not found", memory_id }
```

### memory_list

列出记忆目录，支持分页和过滤。

```typescript
// Input
{
  category?: string;    // filter
  tags?: string[];      // filter (OR match)
  limit?: number;       // 1-100, default: 20
  offset?: number;      // default: 0
}

// Output
{
  total: number;        // 总记忆数
  count: number;        // 当前页数量
  memories: [{
    memory_id, name, category,
    tags, priority,
    preview: string;    // first 100 chars
  }];
}
```

### memory_forget

删除一条记忆（本地文件 + 内存缓存）。

```typescript
// Input
{ memory_id: string }

// Output
{
  success: boolean;
  memory_id: string;
  action: "deleted" | "not_found";
}
```

### memory_context

加载当前会话上下文，返回最近访问的高优先级记忆摘要。

```typescript
// Input
{ limit?: number;  // 1-20, default: 5 }

// Output
{
  context_loaded: true;
  memory_count: number;
  context: string;  // 格式: "- [name] preview..."
}
```

**排序:** `access_count` DESC, 同分则 `priority` DESC。

### memory_export

导出记忆为 JSON 或 Markdown。

```typescript
// Input
{
  memory_ids?: string[];  // 不指定则导出全部
  format?: "json" | "markdown";  // default: "json"
}

// Output (JSON)
{
  exported_at: string;
  version: "memory-forge-1.0";
  count: number;
  memories: [{ id, name, content, category, tags, priority, created_at }];
}

// Output (Markdown)
# Memory Name
> category: x | tags: a, b | priority: 7
...
---
```

### memory_share

打包单条记忆供队友导入。

```typescript
// Input
{
  memory_id: string;
  recipient?: string;
  note?: string;
}

// Output
{
  type: "memory-forge-share";
  version: "1.0";
  shared_at: string;
  recipient: string | null;
  note: string | null;
  memory: { name, content, category, tags };
  import_instruction: "Use memory_store with this content to import.";
}
```

---

## 自动引擎

所有引擎位于 `src/auto/index.ts`。

### autoName

从内容提取人类可读名称。

```
算法:
1. 移除代码块 (```...```)
2. 取前 40 字符
3. 换行替换为空格
4. 空内容 → "memory"
```

### autoMerge

检测并合并重复记忆。

```
算法:
1. Jaccard 相似度: |setA ∩ setB| / min(|setA|, |setB|)
2. 单词长度 ≥ 3
3. 阈值: > 0.8 → 合并
4. 合并后重新计算向量
```

### autoPriority

基于 Ebbinghaus 遗忘曲线计算优先级 (1-10)。

```
公式:
freqWeight   = min(access_count, 50) / 50
recencyWeight = 1 - (daysSinceLastAccess / 90)  // clamp 0-1
ageWeight    = 1 - min(ageDays, 365) / 365

priority = 1 + 9 × (freqWeight × 0.4 + recencyWeight × 0.4 + ageWeight × 0.2)
```

### autoDecay

Ebbinghaus 遗忘曲线判定记忆是否归档。

```
| 天数 | 衰减值 | 含义 |
|------|--------|------|
| ≤1   | 1.0    | 活跃 |
| ≤7   | 0.8    | 近期 |
| ≤30  | 0.5    | 衰减中 |
| ≤90  | 0.2    | 弱记忆 |
| >90  | 0      | 归档 (删除) |
```

### generateContextSummary

生成 Agent 上下文摘要。

```
算法:
1. 取全部记忆, 按 access_count DESC, priority DESC 排序
2. 截取 top-N
3. 每条截断 150 字符
4. 格式: "- [name] content..."
```

---

## Hook 系统

配置位置: `~/.claude/settings.json`

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{"type": "command", "command": "memory-forge hook session-start"}]
    }],
    "Stop": [{
      "hooks": [{"type": "command", "command": "memory-forge hook stop"}]
    }],
    "PreCompact": [{
      "hooks": [{"type": "command", "command": "memory-forge hook pre-compact"}]
    }]
  }
}
```

### 生命周期

```
SessionStart  → 加载 top-5 记忆 → 注入 Agent 上下文 (stdout)
   ↓
Agent 工作    → 调 memory_store / memory_search / ...
   ↓
PreCompact    → 加载 top-8 记忆 + 注入存储指令 → Agent 自动保存
   ↓
Stop          → autoPriority 重算 + autoDecay 检查 + 归档过期记忆
   ↓
(下次) SessionStart → 记忆已保留 ✅
```

### 关键设计决策

**为什么 PreCompact 而非 Stop 做 auto-capture？**
Stop hook 只在正常退出时触发。`kill` / 关终端窗口 / 崩溃 → Stop 不跑。PreCompact 在上下文快满时一定触发，此时进程还活着，Agent 能执行存储指令。

---

## 存储层

### Free 层 (本地 Markdown)

- 路径: `~/.memory-forge/memories/{id}.md`
- 格式: 类 YAML frontmatter + Markdown body
- 编码: UTF-8
- 权限: 用户文件系统控制
- 网络: 零

### Pro 层 (Shelby 云)

- SDK: `@shelby-protocol/sdk` ^0.3.1 (optionalDep)
- 网络: Shelbynet 测试网
- 认证: API Key + Ed25519 链上账户
- Blob 格式: `memories/{id}.json` (JSON)
- 过期: 365 天
- 数据流: 双向同步 (session 启动时 ↓↑, memory_store 时 ↑)

**Pro 数据流:**
```
SessionStart:
  syncAll():
    ↓ listBlobs() → 获取远程记忆列表
    ↓ downloadMemory() → 下载本地不存在的 (30s timeout)
    ↑ uploadMemory() → 上传本地有而远程无的
    → 双向同步完成

memory_store:
  saveMemory() → 本地
  uploadMemory() → Shelby (fire-and-forget, 失败不阻塞)
```

---

## 嵌入引擎

### 技术栈

- 库: `@huggingface/transformers` ^3.0.0
- 模型: Xenova/all-MiniLM-L6-v2
- 大小: ~23MB (首次下载, 后续缓存)
- 维度: 384
- 池化: mean pooling + L2 normalize

### 降级策略

```
加载模型
  → 成功: cos similarity search
  → 失败: keyword matching (Jaccard)
     + 5 分钟自动重试
     + sleep(300s) 防止请求风暴
```

### 性能

- 首次加载: 3-10s (取决于网络, 23MB 下载)
- 后续推理: < 100ms
- 降级关键词: < 10ms
- 模型缓存: Transformers.js 内置缓存

---

## 安全模型

### Free 层

- 全部数据在 `~/.memory-forge/` 目录
- 零持续网络请求
- 唯一网络: 首次模型下载 (HuggingFace CDN, 23MB)
- 模型下载失败 → 关键词降级, 零功能损失

### Pro 层

- API Key: 环境变量 `SHELBY_API_KEY` 注入, 不落盘
- 私钥: `~/.memory-forge/pro.json`, Ed25519 格式
- 传输: HTTPS (Shelbynet API)
- 链上: 每条记忆 → Aptos blob upload transaction
- 删除: tombstone blob (标记删除, 链上不可篡改)

### 记忆权限

- 文件系统权限 = 记忆权限 (Free)
- 链上账户签名 = 记忆权限 (Pro)
- 无内置认证/授权层 (Agent 已通过 Claude Code 认证)

---

## 错误处理与降级

| 场景 | 行为 | 影响 |
|------|------|------|
| 嵌入模型下载失败 | 关键词搜索, 5min 重试 | 搜索精度下降, 功能可用 |
| 嵌入模型推理失败 | 返回 null, 关键词降级 | 单次查询降级 |
| Shelby 上传失败 | console.error, 不阻塞 | Pro 同步不同步, 本地完好 |
| Shelby 下载超时 | 30s timeout, 返回 null | 该条不同步, 其他正常 |
| Shelby 链上 gas 不足 | 上传失败 + 错误消息 | Pro 不可用, Free 完好 |
| parseMemoryFile 损坏 | 跳过该文件, 返回 null | 损坏文件被忽略 |
| 磁盘写失败 | 静默失败 | 记忆丢失 (极罕见) |
| LRU 满 5000 | 淘汰最低 access_count × priority | 旧记忆清出内存, 磁盘保留 |
