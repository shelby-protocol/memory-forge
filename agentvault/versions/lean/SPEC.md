# MemoryForge -- 产品规格（精简版）

## 定位

**AI Agent 持久记忆引擎。一键安装，自动工作。**

Free 层本地存储，换电脑就没了——和所有其他 MCP 记忆工具一样。
Pro 层 Shelby 云存储，换电脑自动恢复。

## MCP 工具：6 个可见 + 5 个后台自动

### 可见工具
```
memory_store     存储记忆
memory_search    语义检索（内置降级：向量失败 → 关键词 fallback）
memory_recall    精确获取
memory_list      列出记忆
memory_forget    删除记忆
memory_context   会话启动自动加载相关上下文
```

### 后台自动（用户无感知）
```
auto-inject      每条 prompt 前自动注入 top-3 相关记忆
auto-capture     会话结束自动提取关键信息
auto-priority    基于使用频率自动评分
auto-decay       遗忘曲线自动降权，90 天归档
auto-merge       80%+ 相似内容自动合并去重
auto-name        自动生成人类可读名称（"偏好 React 19" 代替 UUID）
```

## 自动化详解

| 特性 | 触发 | 效果 |
|------|------|------|
| auto-inject | 每条 prompt 前 | 注入 top-3 相关记忆 |
| auto-capture | 会话结束 (Stop hook) | 提取关键信息自动存入 |
| auto-priority | 每次访问后 | 频率×时间，自动调权 |
| auto-decay | 每日定时 | 7d→0.7x, 30d→0.3x, 90d 归档 |
| auto-merge | 每次存储后 | 余弦相似度>0.8→自动合并 |
| auto-name | 每次存储时 | 从内容生成描述性名称 |

## 错误降级

| 故障 | 降级路径 |
|------|---------|
| Transformers.js 崩溃 | → 关键词匹配 fallback（功能可用） |
| Shelby RPC 超时 (Pro) | → 本地缓存 + 异步重试，不阻塞 |

## 安装：零依赖，一键完成

```bash
npx memory-forge setup
```

自动完成：
1. 检测已安装的 Agent 平台（Claude Code / Cursor / Windsurf / VS Code）
2. 配置 MCP 集成
3. 安装 Claude Code hooks（SessionStart / Stop / PreCompact）
4. 导入已有规则文件（CLAUDE.md / .cursor/rules / .gitconfig）
5. 首次使用时延迟加载嵌入模型（秒开）

## 定价

| 方案 | 月费 | 存储 | 换电脑 |
|------|------|------|:--:|
| Free | $0 | 本地 Markdown | 没了 |
| Pro | $5 | Shelby 云 | 自动恢复 |

**Free 层和所有其他 MCP 记忆工具一样——本地存储。想换电脑自动恢复 → $5/月。**

### Pro 支付方式

集成 SettleGrid（1 行代码），自动支持：

| 支付方式 | 协议 | 抽成 |
|---------|------|------|
| 信用卡 | Stripe MPP | ~2.9% |
| Google Pay | AP2 | ~2.9% |
| USDC 链上 | x402 (Base) | ~0.1% |
| Visa | TAP | ~2.5% |

**SettleGrid Free 层：0% 平台抽成，开发者拿 95%。**

### Pro 零区块链感知

Aptos Gas Station 代付所有链上费用（APT gas + ShelbyUSD）。Pro 用户不需要知道钱包、私钥、代币、gas。

## 安全模型

### 我们存什么

| 数据 | 存储位置 | 敏感度 |
|------|---------|:--:|
| 邮箱 | 服务器 | 低 |
| 信用卡 | **不存** — Stripe 处理 | 无 |
| 私钥 | **不存** — Gas Station 代付 | 无 |
| 用户密码 | **不存** — PBKDF2 派生密钥 | 无 |
| 记忆内容 | Shelby blob（加密后） | 中 |

### 记忆加密

```
用户密码
  ↓ PBKDF2（60 万次迭代）
派生 256 位密钥
  ↓ AES-256-GCM
加密记忆 → 上传 Shelby blob
```

**只有用户知道密码。即使服务器被黑，攻击者也无法解密记忆。**（对标 1Password / Bitwarden 的安全模型）

### 密码恢复

首次设置时生成恢复短语：

```
"请保存这个恢复短语：apple-tree-river-mountain-sun
 忘记密码时用它恢复。我们不存它——请自己保存好。"
```

对标 Bitwarden 恢复码。用户自保管，我们不知道。

### 最坏情况

| 攻击 | 攻击者获得 | 用户损失 |
|------|-----------|:--:|
| 服务器被黑 | 邮箱列表 | 无 |
| Shelby 节点被黑 | 加密 blob（无法解密） | 无 |
| SettleGrid 被黑 | 支付记录（卡号在 Stripe） | 无 |

## 技术栈（用户无感知）

```
MCP 协议：  @modelcontextprotocol/sdk
嵌入模型：  @huggingface/transformers + Xenova/all-MiniLM-L6-v2
             23MB, 384 维, 进程内运行, npm install 自动下载
本地存储：  ~/.memory-forge/memories/*.md（Markdown, 人类可读）
云存储：    Pro: @shelby-protocol/sdk + @aptos-labs/ts-sdk
Hooks：     Claude Code SessionStart / Stop / PreCompact
```

## Pro 零区块链感知

Shelby 官方 Gas Station 代付所有链上费用（APT gas + ShelbyUSD）。
Pro 用户不需要知道关键、代币、gas。输入邮箱即可。

## 用户感知

```
npx memory-forge setup → 完成。零操作。

"Agent 自动记住我的偏好了。"
"换了电脑……哦要 Pro 才行。$5/月还行，订阅了。"
```

## 路线图

```
Phase 1 -- MVP（2 周）
  6 工具 + hooks + 规则导入 + npm publish

Phase 2 -- Pro（2 周）
  Shelby 云存储 + 多设备同步

Phase 3 -- 按需
  从完整版挑选：Team 共享 / Token-Gated / 微支付等
```

## 升级路径

完整版（20 工具）保存在 `../full/`。
