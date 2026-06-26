# MemoryForge

> AI Agent 持久记忆引擎。8 个 MCP 工具 + 5 个自动化引擎。Free 层本地运行，Pro 层 Shelby 去中心化云同步。

## 安装

```bash
npx memory-forge setup
```

自动配置 Claude Code hooks（SessionStart / Stop / PreCompact），导入已有规则为记忆。

Free 层零依赖外部服务。Pro 层需 `SHELBY_API_KEY` 启用 Shelby 云同步。

## 核心能力

**8 个 MCP 工具（Agent 直接调用）：**

| 工具 | 说明 |
|---|---|
| `memory_store` | 存储记忆，自动向量化 + 命名 + 去重合并 |
| `memory_search` | 语义检索（向量 + 关键词双模式） |
| `memory_recall` | 按 ID 精确获取 |
| `memory_list` | 列出记忆，支持分类 / 标签过滤 |
| `memory_forget` | 删除记忆（本地 + Shelby 同步） |
| `memory_context` | 加载当前会话上下文 |
| `memory_export` | 导出 JSON 或 Markdown |
| `memory_share` | 打包记忆供队友导入 |

**5 个自动化引擎（用户无感知）：**

| 引擎 | 说明 |
|---|---|
| autoName | 从内容自动提取记忆名称 |
| autoMerge | 检测 >80% 重叠自动合并 |
| autoPriority | 基于访问频率 + 时效计算优先级（Ebbinghaus 遗忘曲线） |
| autoDecay | 90 天未访问自动归档 |
| autoCapture | 会话结束自动更新优先级 + 清理过期记忆 |

## 定价

| 方案 | 说明 |
|---|---|
| **Free** | 8 工具，本地存储，无限制记忆 |
| **Pro** | + Shelby 去中心化云同步，多设备 |

Pro 当前在测试网阶段。

## 技术栈

- **MCP 协议**: `@modelcontextprotocol/sdk` (stdio transport)
- **嵌入模型**: Transformers.js / Xenova all-MiniLM-L6-v2（23MB，本地运行，失败自动降级关键词搜索）
- **云存储 (Pro)**: `@shelby-protocol/sdk` (Shelbynet / Aptos)
- **运行时**: Node.js 18+, TypeScript

## 项目结构

```
agentvault/
├── README.md
├── package.json
├── server.json          # MCP Registry manifest
├── Dockerfile
├── smithery.yaml
├── tsconfig.json
└── src/
    ├── index.ts         # MCP Server 入口 + CLI 路由
    ├── store.ts         # MemoryStore: LRU 缓存 + 向量/关键词搜索
    ├── embedding.ts     # Transformers.js 嵌入引擎
    ├── setup.ts         # 一键安装流程
    ├── pro.ts           # Pro 激活 + Shelby 云同步
    ├── auto/
    │   └── index.ts     # 5 个自动化引擎
    ├── storage/
    │   ├── local.ts     # 本地 Markdown 存储
    │   └── shelby.ts    # Shelby 云存储
    ├── hooks/
    │   └── install.ts   # Claude Code hooks 配置
    └── migrate/
        └── import.ts    # 规则导入 + 去重
```

## 安全

- Free 层全本地，零网络请求（除首次模型下载 23MB）
- Pro 层记忆上传至 Shelby 链上存储，每条有 Aptos 交易证明
- API key 通过环境变量注入，不存储密钥明文
- 支持 GDPR 被遗忘权（`memory_forget` 删除本地 + 链上 tombstone）

## 测试

```bash
npm test   # 48 tests, 100% pass
```
