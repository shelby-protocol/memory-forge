# MemoryForge 产品规格

## 定位

基于 MCP 标准的 AI Agent 持久记忆引擎。Free 层本地运行，Pro 层 Shelby 去中心化云同步。

## MCP 工具 (8 个)

### 核心层

| 工具 | 说明 |
|---|---|
| `memory_store` | 存储记忆，自动向量化 + 命名 + 去重合并 |
| `memory_search` | 语义检索（向量优先，失败降级关键词） |
| `memory_recall` | 按 ID 精确获取 |
| `memory_list` | 列出记忆，支持分类 / 标签过滤 |
| `memory_forget` | 删除记忆（本地 + Shelby tombstone） |
| `memory_context` | 加载当前会话 top-N 上下文 |

### 协作层

| 工具 | 说明 |
|---|---|
| `memory_export` | 导出 JSON 或 Markdown |
| `memory_share` | 打包单条记忆供队友导入 |

## 自动化引擎 (5 个)

| 引擎 | 触发时机 | 说明 |
|---|---|---|
| autoName | memory_store | 从内容提取前 40 字符为名称 |
| autoMerge | memory_store | >80% Jaccard 重叠自动合并 |
| autoPriority | hook stop | 基于访问频率 + 时效 + 年龄计算 (1-10) |
| autoDecay | hook stop | Ebbinghaus 遗忘曲线: 1天→1.0, 7天→0.8, 30天→0.5, 90天→0.2, >90天→归档 |
| generateContextSummary | hook session-start / pre-compact | 按访问量+优先级排序生成上下文摘要 |

## Hook 系统 (3 个)

| Hook | 命令 | 行为 |
|---|---|---|
| SessionStart | `memory-forge hook session-start` | 加载 top-5 记忆注入上下文 |
| Stop | `memory-forge hook stop` | autoPriority + autoDecay 维护 |
| PreCompact | `memory-forge hook pre-compact` | 保存 top-8 记忆防压缩丢失 |

## 定价

| 方案 | 说明 |
|---|---|
| Free | 8 工具，本地存储，无限制记忆 |
| Pro | + Shelby 去中心化云同步，多设备 |

Pro 当前在 Shelbynet 测试网运行。

## 技术参数

- **嵌入模型**: Transformers.js / Xenova all-MiniLM-L6-v2 (23MB)
- **向量维度**: 384
- **相似度算法**: 余弦相似度
- **降级策略**: 模型加载失败 → 关键词匹配 + 5 分钟自动重试
- **存储格式**: 本地 Markdown with YAML frontmatter; Shelby JSON blob
- **LRU 上限**: 5000 条内存, 超出淘汰最低访问量
- **去重阈值**: Jaccard > 0.8

## 未来路线

- SettleGrid 支付集成 (Pro → 付费)
- 链上哈希验证
- MCP 目录发布 (mcp.so / smithery.ai / glama.ai)
- 多语言嵌入模型切换
