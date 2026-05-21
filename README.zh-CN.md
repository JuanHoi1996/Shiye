# 师爷 Shiye

> 一款自托管的 AI 搜索工作流。底子是 [Vane](https://github.com/ItzCrazyKns/Vane) 的引擎，被重构成了能日常顶住用的样子：前后端解耦、UX 更打磨、坑也填了一批。

English · [简体中文](./README.zh-CN.md)

「师爷」取自旧时县官身后那位低调博学、随时能掏出相关案卷的幕僚。本项目是 [Vane](https://github.com/ItzCrazyKns/Vane) 的一个 fork，已被重构为 **Express 后端 + Vite 前端**的解耦架构，搜索编排核心基本重写，UX 细节也打磨了一长串。改名是因为"已经不只是 Vane 了"，但原项目的 UI 血脉得到保留，并致以感谢。

师爷首先服务于它的作者一个人，发出来只是顺便——万一某些工程上的处理对你有用。

---

## 亮点

**比 Vane 更顺手的 UX**

- **什么都能往输入框里拖** — 文件和**网页选中文本**都行；只有拖文件时才出蓝色上传遮罩，所以拖文本不会被挡住落点。
- **对话过程中随时调整** — 模型、搜索来源、搜索深度、reasoning effort 都能逐轮切换（上游只能在开新会话时选一次）。
- **Reasoning 档位选择器** — `off / auto / low / medium / high` 显式可控，集成在模型 Popover 里。
- **Quick Prompts** — 像 slash 命令一样的常用提示词板，设置页里用 GUI 编辑（不再是裸 JSON 文本框）。
- **Library 文件夹系统** — 对话可以归到「Space」里；标题大小写不敏感搜索；列表按 `lastMessageAt`（最近互动时间）排序——这是上游根本没有的字段。
- **每轮 Meta Info 页脚** — 每条助手回复底部展示这一轮**实际用了哪个模型 / reasoning 档位 / 搜索模式**，不用回想"我三轮前是不是改过模型"。
- **Prompt 复制 + 智能折叠** — 长 prompt 超过约 200 字符自动折叠，一键复制。
- **中文上传不再乱码** — multer 的 latin1 文件名 bug 被修；非 UTF-8（GBK 等）文本文件用 `jschardet` + `iconv-lite` 自动检测解码，不再开局就是一堆"锟斤拷"。
- **聊天分叉** — 任意一条已完成的助手回复都可以作为分叉点，整个上下文在同一个事务里被复制成新对话。适合"那我换一种问法呢"的反复试探。
- **PDF / Markdown 导出** — 一键导出，中文不会变方块。

**更稳的引擎**

- **长上下文的纪律** — Researcher 历史按滑窗截断；tool 输出在 stringify 后再截断时会清掉半截的 `\uXXXX` 转义，避免下一轮 request 直接 400。
- **SearXNG 单 query 故障隔离** — 单条 query 失败不连累整轮 Researcher。
- **多模态裁剪** — 非 vision 模型自动从历史里剥掉 `image_url`，并通过系统提示让模型知道"附件存在过"。
- **能省钱的可观测性** — 每轮 token 用量按日落到 `data/token-usage/*.jsonl`（phase / provider / model / cache 命中 / reasoning 档位都有）。

---

## 它不是什么

- 不是 Perplexity 的竞品。用户基数 = 1。
- 不是多租户。单用户假设贯穿整个代码库（鉴权、限流、配额全都缺位或形同虚设）。
- 不是稳定的 API。路由和数据库 schema 会迁移，迁移是尽力而为。
- 不是开箱即用的部署。SearXNG、模型 API key、以及看日志的耐心是前提。

---

## 架构速览

```
┌──────────────┐    HTTP / SSE    ┌──────────────────────────────────┐
│   vane-ui    │ ───────────────▶ │             vane-api             │
│  (Vite, R19) │                  │  Express + better-sqlite3 + ESM  │
└──────────────┘                  │                                  │
                                  │  ┌────────────────────────────┐  │
                                  │  │  搜索编排                  │  │
                                  │  │  classifier → researcher   │  │
                                  │  │            → writer        │  │
                                  │  └────────┬───────────────────┘  │
                                  │           │                      │
                                  │   ┌───────▼───────┐  ┌────────┐  │
                                  │   │   SearXNG     │  │  LLM   │  │
                                  │   │  网页/学术    │  │ 多厂商 │  │
                                  │   │    /社区      │  │  适配  │  │
                                  │   └───────────────┘  └────────┘  │
                                  └──────────────────────────────────┘
```

- `**vane-api/**` — Node 20+ / Express 5 / better-sqlite3 / Drizzle ORM。源码 ESM，dev 用 `tsx`，生产打包成 CJS（`tsup`）。入口 `src/index.ts`，搜索引擎在 `src/lib/agents/search/`。
- `**vane-ui/**` — Vite + React 19 + Tailwind。入口 `src/App.tsx`，聊天状态在 `src/lib/hooks/useChat.tsx`。
- `**searxng-config/**` + `docker-compose.yml` — 本地 SearXNG 实例，建议只读挂载。
- `**vane-api/data/**` — `db.sqlite`、上传文件、token JSONL，已 gitignore。

---

## 快速开始

依赖：Node ≥ 20、pnpm ≥ 10、Docker（用于 SearXNG）。

```bash
# 1. 启 SearXNG
docker compose up -d

# 2. 装依赖（首次 clone 后跑一次；better-sqlite3 需要 build script）
pnpm -C vane-api install
pnpm -C vane-ui install

# 3. 开发模式 — 同时拉起前后端
./start-dev.sh
```

第一次启动会进入设置向导，在里面配置模型 provider 和搜索源。配置落盘在 `vane-api/data/config.json`。

> 如果碰到 `better-sqlite3` 报 `Could not locate the bindings file`，那是 pnpm 10 跳过了部分包的 build 脚本。解药：`cd vane-api && rm -rf node_modules && pnpm install`。`vane-api/package.json` 里的 `pnpm.onlyBuiltDependencies` 白名单已经对新 clone 处理好这件事。

---

## 模型 Provider

师爷通过内部的「OpenAI 兼容策略层」（`vane-api/src/lib/models/providers/policy/openaiCompatPolicy.ts`）和各家 LLM 对话，把厂商间的差异（base URL 规范化、reasoning 档位门控、结构化输出回退）集中在一处收敛，不会污染其它代码。

**日常实战 & 确认可用**

- **DeepSeek V3.2 / V4** — 作者本人在用的组合。V4 的 thinking 模式完整支持（包括 `reasoning_content`-only 那个边角 case）。

**有代码路径但未充分实测**

- **OpenAI、Gemini、Ollama、其它 OpenAI 兼容端点** — 代码都通了，曾经也接过，但作者目前是 DeepSeek 一条龙在用。预期会有一些适配层的小惊喜，欢迎提 issue。

如果你要加新的 OpenAI 兼容厂商，请扩这个 policy 文件，不要在别处堆 `if (vendor === ...)`。这是个承重的约定。

---

## 与上游 Vane 的差异

如果你从 [ItzCrazyKns/Vane](https://github.com/ItzCrazyKns/Vane) 过来：


| 维度                | 上游 Vane          | 师爷 Shiye                                                                      |
| ----------------- | ---------------- | ----------------------------------------------------------------------------- |
| **技术栈**           | Next.js 全栈       | Express API + Vite SPA，前后端解耦                                                  |
| **对话过程中改配置**      | 开会话时锁死           | 模型 / 搜索来源 / 深度 / reasoning 都可以**逐轮**切换                                        |
| **Reasoning 档位**  | —                | 显式选择器，嵌在模型 Popover 里                                                          |
| **Library**       | 扁平列表，按创建时间排序     | 文件夹（Space）系统、大小写不敏感标题搜索、按 `lastMessageAt` 排序                                  |
| **拖拽**            | —                | **文件和文本都行**；遮罩只对文件触发                                                          |
| **Quick Prompts** | —                | 设置页 GUI 编辑的常用 prompt 板                                                        |
| **每轮 Meta Info**  | —                | 助手回复底部一行：本轮用的模型 / reasoning / 搜索模式                                            |
| **中文上传**          | 文件名乱码、GBK 文件读不出  | UTF-8 文件名修复 + 文本上传自动编码检测                                                      |
| **分叉**            | —                | `POST /api/chats/:chatId/messages/:messageId/fork` 在事务内复制到任意已完成助手轮次           |
| **导出**            | Markdown + PDF   | Markdown 导出 + 中文安全的 PDF                                                       |
| **Researcher**    | Tool 循环          | Tool 循环 + 滑窗历史预算、JSON 转义安全的 tool 截断、SearXNG 单 query 故障隔离                      |
| **Provider 适配**   | —                | `openaiCompatPolicy`（base URL 规范化、reasoning 档位门控、结构化输出回退）                     |
| **数据库**           | Drizzle + SQLite | + `chats.lastMessageAt`、`chat_branches`、消息粒度的 provider / model / reasoning 字段 |
| **可观测性**          | —                | 每轮 token JSONL                                                                |


UI 大部分仍源自上游，正在逐步换皮。

---

## 路线图（松散，按优先级）

- UI 视觉独立化（logo、配色、字体），不做整体重构。
- 搜索偏好记忆 v0.1 — 小、压缩过、用户可见可控。"记得太多" 比 "记得太少" 更糟糕。
- 把 classifier 的 `skipSearch` 决策展示在助手回复的页脚，配一个"强制重做搜索"的按钮，替代全局 Force Search 开关。
- 收敛搜索深度档位（Speed / Balanced / Quality），决定 Multi-Agent 是否值得做。
- 把 `/api/search` 的对外契约打磨干净，将来万一要作为 tool 嵌入更大的 Agent 框架，今天的代码不挡路。

---

## 致谢

- **[Vane](https://github.com/ItzCrazyKns/Vane)**，作者 [@ItzCrazyKns](https://github.com/ItzCrazyKns) — 这个 fork 的起点。产品形态、最初的 UI 语汇、以及一大堆扎实的编排思路都是他的。原项目 MIT 协议，师爷在 `[LICENSE](./LICENSE)` 中保留原作者版权声明。
- **[SearXNG](https://github.com/searxng/searxng)** — 这一切赖以建立的元搜索引擎。

---

## 协议

[MIT](./LICENSE)。原始版权 © 2026 ItzCrazyKns（上游 Vane）。修改部分版权 © 2026 JuanHoi1996（师爷）。