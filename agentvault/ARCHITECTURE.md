# MemoryForge 架构

## 系统层级

```
┌─────────────────────────────────────┐
│  AI Agent (Claude Code / Cursor)    │
│  via MCP stdio protocol              │
├─────────────────────────────────────┤
│  MCP Server (index.ts)              │
│  8 tools + CLI hook routing          │
├──────────┬──────────────────────────┤
│  Free    │  Pro                      │
│  local   │  Shelby cloud             │
│  .md     │  @shelby-protocol/sdk     │
├──────────┴──────────────────────────┤
│  MemoryStore (store.ts)              │
│  LRU cache + cosine similarity       │
│  + keyword fallback                  │
├─────────────────────────────────────┤
│  Embedding (embedding.ts)            │
│  Transformers.js / MiniLM-L6-v2      │
│  23MB local model                    │
├─────────────────────────────────────┤
│  Auto Engines (auto/index.ts)        │
│  name / merge / priority / decay     │
│  + context summary                   │
└─────────────────────────────────────┘
```

## 目录结构

```
agentvault/src/
├── index.ts          # MCP Server + CLI 路由 (setup/pro/hook)
├── store.ts          # MemoryStore: LRU + 余弦相似度 + 关键词降级
├── embedding.ts      # Transformers.js 嵌入引擎 (延迟加载, 自动降级)
├── setup.ts          # 一键安装 (hooks + import + preload)
├── pro.ts            # Pro 激活 + Shelby 双向同步
├── auto/
│   └── index.ts      # 5 自动引擎 (autoName/Merge/Priority/Decay/Summary)
├── storage/
│   ├── local.ts      # 本地 Markdown 读写 (~/.memory-forge/memories/)
│   └── shelby.ts     # Shelby 云: upload/download/list/delete
├── hooks/
│   └── install.ts    # Claude Code settings.json hooks 配置
└── migrate/
    └── import.ts     # 规则导入 (CLAUDE.md/.cursor/.gitconfig) + 去重
```

## 数据流

### Free 层
```
Agent call memory_store()
  → index.ts: 接收工具调用
  → embedding.ts: 向量化内容 (失败→null)
  → auto/index.ts: 自动命名 + 去重合并
  → storage/local.ts: 写 ~/.memory-forge/memories/{id}.md
  → store.ts: 更新 LRU 缓存
```

### Pro 层
```
Agent session start
  → hook session-start: 加载本地记忆 → 生成上下文摘要
  → MCP Server start: SHELBY_API_KEY 存在则同步
  → pro.ts syncAll():
    ↓ 从 Shelby 下载远程记忆 (合并，跳过已存在)
    ↑ 上传本地新记忆到 Shelby
    → 双向同步完成
```

### Hook 生命周期
```
SessionStart → memory-forge hook session-start
  → 加载全部记忆 → 生成 top-5 上下文摘要 → 注入 Agent 上下文

Stop → memory-forge hook stop
  → 遍历全部记忆 → autoPriority 重算 → autoDecay 检查
  → decay=0 → 删除 (归档)
  → priority 变化 → 保存

PreCompact → memory-forge hook pre-compact
  → 生成 top-8 上下文摘要 → 确保压缩前保留关键记忆
```

## 依赖

| 依赖 | 用途 | 运行时网络 |
|---|---|---|
| `@modelcontextprotocol/sdk` | MCP stdio 协议 | 无 |
| `zod` | 工具参数校验 | 无 |
| `@huggingface/transformers` | 本地嵌入模型 | 首次下载 23MB |
| `@shelby-protocol/sdk` (optional) | Pro 云存储 | Shelbynet API |
| `@aptos-labs/ts-sdk` (optional) | Pro 链上账户 | Shelbynet 全节点 |

## 安全模型

- Free: 全部本地, 零网络 (除首次模型下载)
- Pro: API key 环境变量注入, 私钥本地存储
- 记忆文件: `~/.memory-forge/memories/{id}.md`, 用户文件系统权限控制
- 去重: >80% 内容重叠自动合并, 防止重复
