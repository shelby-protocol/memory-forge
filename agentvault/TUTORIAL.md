# MemoryForge 使用教程

> 一条命令。零配置。AI Agent 从此拥有持久记忆。

## 目录

1. [快速开始](#快速开始)
2. [工作原理](#工作原理)
3. [日常使用](#日常使用)
4. [Pro 版 (云同步)](#pro-版-云同步)
5. [管理记忆](#管理记忆)
6. [最佳实践](#最佳实践)
7. [排错指南](#排错指南)
8. [卸载](#卸载)

---

## 快速开始

### 安装

```bash
npx memory-forge setup
```

一步完成:
- 安装 Claude Code hooks (SessionStart / Stop / PreCompact)
- 自动导入已有规则 (CLAUDE.md / .cursor/rules / .gitconfig)
- 预加载嵌入模型 (23MB, 首次, 后续离线)
- 全局安装 `memory-forge` 命令

**支持平台:** Claude Code (全平台), Cursor (通过 MCP), Windsurf, VS Code。

### 验证安装

重启 Claude Code，你会看到:

```
- [Git User Info] Git user email: xxx
- [Claude Code Rules] For independent parallel tasks...
```

这表示 SessionStart hook 已生效，Agent 加载了你的记忆。

---

## 工作原理

### 自动化记忆生命周期

```
你打开 Claude Code
  → Agent 自动加载你的偏好和项目上下文
  
你工作...
  → Agent 自动记住你的编码风格、技术决策、项目偏好
  
上下文快满时 (PreCompact)
  → Agent 自动保存关键信息到记忆库
  → 即使你强制关终端，记忆也不会丢失

你关闭 Claude Code (Stop)
  → 自动更新记忆优先级 (常用记忆提高权重)
  → 自动归档 90 天未用的旧记忆

下次打开
  → Agent 又什么都记得 ✅
```

### 你什么都不用做

Agent 自动:
- **存储**: 你提到偏好、决策、教训 → Agent 调 `memory_store`
- **搜索**: 需要回忆之前的事 → Agent 调 `memory_search`
- **维护**: 优先级调整、过期清理 → 自动

---

## 日常使用

### 基本交互

```
你: "我偏好 camelCase 命名，单引号，2 空格缩进"

Agent 自动调 memory_store → 记忆保存 ✅
下次写代码，Agent 自动遵循你的偏好。

---

你: "之前那个 token 刷新 bug 怎么修的？"

Agent 调 memory_search → 找到相关记忆
"6 月 15 日，你在 auth.ts 修了 token 过期判断从 < 改为 <="

---

你: "帮我重构认证模块"

Agent 调 memory_context → 加载上下文
"好的。根据之前的记录，项目用 React 19 + JWT + refresh token 模式。从 auth.ts 开始？"
```

### 主动使用

你也可以明确让 Agent 操作记忆:

```
"存储一条记忆: 生产数据库用 PostgreSQL 16，连接串在 .env.production"
"搜索关于部署流程的记忆"
"列出我所有的记忆"
"导出全部记忆为 Markdown"
"删除 ID 为 xxx 的旧记忆"
```

---

## Pro 版 (云同步)

### 什么情况需要 Pro

- 你有多台电脑，想在设备间共享记忆
- 你担心硬盘故障丢失记忆
- 你想和队友共享项目记忆

### 开通 Pro

```bash
# 1. 获取 API Key
# 访问 https://docs.shelby.xyz/sdks/typescript/acquire-api-keys

# 2. 激活 Pro
SHELBY_API_KEY="your-api-key" memory-forge pro

# 3. 第一次需要充值 APT + ShelbyUSD (测试网水龙头)
# 地址会打印在屏幕上，去 faucet 领取:
#   APT:       https://docs.shelby.xyz/apis/faucet/aptos
#   ShelbyUSD: https://docs.shelby.xyz/apis/faucet/shelbyusd

# 4. 领取后重新运行同步
SHELBY_API_KEY="your-api-key" memory-forge pro
```

### 多设备同步

```
设备 A: 激活 Pro → 工作 → 记忆自动上传
设备 B: 设置 SHELBY_API_KEY 环境变量 → 安装 → 记忆自动下载
  → Agent 在设备 B 上也能记住一切 ✅
```

### 环境变量

建议写入 shell 配置文件:

```bash
# ~/.bashrc 或 ~/.zshrc
export SHELBY_API_KEY="your-api-key"
```

这样每次 Agent 启动自动启用 Pro 同步，无需手动运行命令。

---

## 管理记忆

### 查看记忆

```bash
# 查看记忆文件
ls ~/.memory-forge/memories/

# 读某条记忆
cat ~/.memory-forge/memories/{id}.md
```

记忆文件是人类可读的 Markdown，可以直接编辑。

### 导出

```
# Agent 方式
"导出全部记忆为 JSON"
"导出关于认证的记忆为 Markdown"

# 命令行方式
# JSON 导出在 Agent 调用 memory_export 后获取
```

### 备份

```bash
# 本地备份 (Free 层)
cp -r ~/.memory-forge/memories/ ~/backup/

# Pro 层自动备份到 Shelby 云
```

### 清理

```bash
# 删除全部本地记忆
rm -rf ~/.memory-forge/memories/*.md

# 删除单条
rm ~/.memory-forge/memories/{id}.md

# Pro 账户重置
rm ~/.memory-forge/pro.json
```

---

## 最佳实践

### 什么值得记

| 值得记 | 不值得记 |
|--------|---------|
| 编码风格偏好 | 单次 debug 过程 |
| 项目架构决策 | 临时实验代码 |
| 团队约定 | 过时的配置 |
| 常用命令和流程 | 纯事实性知识 |
| 踩过的坑和解决方案 | 一次性任务 |

### 记忆质量

```
✅ 好: "项目用 PostgreSQL 16 + Prisma ORM，连接池上限 20"
❌ 差: "数据库是 pg"

✅ 好: "用户偏好 camelCase，单引号，2 空格，React 19 + TypeScript strict"
❌ 差: "用 camelCase"

✅ 好: "6/26 决定用 Redis 缓存 token，因为 DB 查询太慢 (>500ms)"
❌ 差: "用了 Redis"
```

### 定期维护

每月做一次记忆清理:

```
"查看我所有记忆，标记哪些过时了或不再需要"
"删除 3 个月前关于旧项目的记忆"
```

---

## 排错指南

### Hook 不生效

**症状:** 打开 Claude Code 看不到记忆加载。

**解决:**
```bash
# 1. 检查 hook 配置
memory-forge hook session-start

# 2. 重新安装 hooks
memory-forge setup

# 3. 确认 settings.json
cat ~/.claude/settings.json | grep memory-forge

# 4. 重启 Claude Code
```

### Stop hook 报错

**症状:** 关闭时显示 "Stop hook error"。

```bash
# 确认全局安装
npm ls -g memory-forge

# 如果不是最新版
npm i -g memory-forge@latest

# 检查 hook 命令格式
# settings.json 中应该是 "memory-forge hook stop"，不是 "npx memory-forge hook stop"
```

### 记忆搜索不准确

**症状:** memory_search 返回无关结果。

```bash
# 检查嵌入模型是否下载成功
# 如果看到 "[MemoryForge] Falling back to keyword matching"
# → 模型下载失败，使用关键词模式

# 解决: 等待 5 分钟自动重试，或手动触发重试
# 模型大小 23MB，确保网络正常
```

### Pro 同步失败

**症状:** "Shelby upload failed: INSUFFICIENT_BALANCE_FOR_TRANSACTION_FEE"

```bash
# 检查账户余额
# 去 faucet 领取 APT + ShelbyUSD
# 然后重新运行 pro 命令

SHELBY_API_KEY="your-key" memory-forge pro
```

### 重复记忆

**症状:** memory_list 显示重复的相似记忆。

```bash
# 0.1.6+ 已根因修复。如果仍有:
# 1. 升级到最新版
npm i -g memory-forge@latest
memory-forge setup

# 2. 手动清理
# 删除 ~/.memory-forge/memories/ 中的重复 .md 文件
```

### 完全重置

```bash
# 1. 删记忆
rm -rf ~/.memory-forge/memories/*.md

# 2. 删 Pro 账户 (可选)
rm -f ~/.memory-forge/pro.json

# 3. 清除 hooks
# 编辑 ~/.claude/settings.json, 删除含 "memory-forge" 的条目

# 4. 重装
memory-forge setup
```

---

## 卸载

```bash
# 删除所有本地数据
rm -rf ~/.memory-forge/

# 编辑 ~/.claude/settings.json
# 删除 hooks 中包含 "memory-forge" 的所有条目

# 卸载全局命令
npm uninstall -g memory-forge
```
