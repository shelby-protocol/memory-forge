# MemoryForge 使用说明

> AI Agent 持久记忆引擎。一条命令，自动工作。

---

## 安装

```bash
npx memory-forge setup
```

自动完成：
1. 检测 Claude Code / Cursor / Windsurf / VS Code
2. 配置 MCP 集成
3. 安装 Claude Code hooks（会话启动/停止自动触发）
4. 导入已有规则文件（CLAUDE.md / .cursor/rules / .gitconfig）
5. 下载嵌入模型（23MB，首次，后续离线）

---

## 使用方式

### 通过 Claude Code 使用

安装后，Agent 自动获得 8 个记忆工具：

```
memory_store     → 想记什么就记什么
memory_search    → 用自然语言搜索记忆
memory_recall    → 按 ID 精确查看某条记忆
memory_list      → 浏览所有记忆
memory_forget    → 删除某条记忆
memory_context   → 加载当前相关的上下文
memory_export    → 导出记忆为 JSON 或 Markdown
memory_share     → 打包分享给队友或其他 Agent
```

**对话示例：**

```
你： "帮我重构认证模块"

Agent 自动调用 memory_context → 加载之前的上下文
Agent： "好的。之前你在 6 月 15 日修了 token 刷新 bug，
        项目用的是 React 19 + JWT。从 auth.ts 开始？"

你： "对"

Agent 调用 memory_store → 保存："6 月 25 日，用户要求重构认证模块"
```

**什么都不用做。Agent 自动记忆并恢复上下文。**

### 通过 Cursor 使用

配置后，在 Cursor 中同样可用。任何聊天中调用：

```
请用 memory_search 查找我之前的 React 偏好
```

### 手动触发命令

你也可以主动让 Agent 做特定记忆操作：

```
"存储一条记忆：项目部署用 Docker Compose"
"查找关于认证的记忆"
"列出所有记忆"
"删除 ID 为 xxx 的记忆"
```

---

## 自动功能（完全无感知）

安装完成后，以下功能在后台自动运行：

| 功能 | 何时触发 | 做什么 |
|------|---------|--------|
| 上下文注入 | 每次对话开始 | 自动注入你的偏好和项目上下文 |
| 自动捕获 | 每次对话结束 | 扫描对话，提取关键决策和偏好 |
| 自动评分 | 每次访问记忆 | 常用记忆自动提高权重 |
| 遗忘曲线 | 每日定时 | 90 天未访问的记忆自动归档 |
| 重复合并 | 每次存储 | 80% 以上相似的记忆自动合并 |
| 自动命名 | 每次存储 | 从内容自动生成人类可读名称 |

你不需要做任何操作。Agent 的记忆库会自动维护。

---

## 免费版 vs Pro 版

| 功能 | 免费版 | Pro 版 |
|------|:--:|:--:|
| 记忆数 | 100 条 | 无限 |
| 存储位置 | 本地文件 | Shelby 云 + 本地缓存 |
| 换电脑恢复 | ❌ 需要手动备份 | ✅ 自动恢复 |
| 记忆加密 | — | ✅ AES-256-GCM |
| 月费 | $0 | $5 |

**免费版和其他所有 MCP 记忆工具一样——本地存储。想换电脑自动恢复，$5/月。**

---

## 常见场景

### 场景一：记住编码偏好

```
你："记住，我偏好 camelCase 命名，单引号，2 空格缩进"

Agent 自动存储 → 之后每次写代码自动遵循你的偏好
```

### 场景二：跨会话项目上下文

```
昨天："我们决定用 PostgreSQL + Prisma"
今天："帮我写数据库迁移脚本"

Agent 自动回忆昨天的决策 → 直接生成 Prisma 迁移代码
```

### 场景三：换电脑

```
旧电脑：已开通 Pro，记忆存储在 Shelby 云
新电脑：npx memory-forge pro → 输入 API Key → 记忆自动恢复
         → 如同从未换过电脑
```

### 场景四：团队协作

```
同事 A 记录了项目关键决策
同事 B 用同一个 Pro 账号 → 自动看到 A 积累的记忆
```

---

## 常见问题

**Q：记忆存在哪里？**
A：免费版存在 `~/.memory-forge/memories/` 目录下，Markdown 格式，人类可读。Pro 版额外同步到 Shelby 去中心化云。

**Q：我的记忆安全吗？**
A：免费版数据完全在你的电脑上，不上传任何地方。Pro 版数据用 PBKDF2 + AES-256-GCM 加密后存储。

**Q：会消耗很多 token 吗？**
A：不会。上下文注入是精炼的摘要，通常只增加 50-100 token。

**Q：可以导出记忆吗？**
A：可以。免费版的 `~/.memory-forge/memories/` 本身就是 Markdown 文件，直接复制即可。Pro 版支持 `memory_export` 导出。

**Q：怎么删除所有记忆？**
A：删除 `~/.memory-forge/memories/` 目录即可彻底清除。

---

## 卸载

```bash
# 删除本地记忆
rm -rf ~/.memory-forge/memories/

# 移除 hooks — 编辑 ~/.claude/settings.json，删除包含 "memory-forge" 的条目

# 删除所有配置
rm -rf ~/.memory-forge/
```
