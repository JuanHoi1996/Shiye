# 师爷 Shiye

> 一个自托管的思考工作台。搜索只是地基，上面盖着三件事：**长文写作工房**、**周期性战略进言**，以及师爷私下为你写的那份**主公备忘录**。

English · [简体中文](./README.zh-CN.md)

「师爷」取自旧时县官身后那位低调博学、随时能掏出相关案卷的幕僚。本项目起源于 [Vane](https://github.com/ItzCrazyKns/Vane) 搜索引擎的 fork，如今已长成另一种东西：**Express + Vite 解耦架构** 之上的三条联动工作流——搜索、写作、进言——共同围绕一份不断更新的「主公印象档」在运转。

首先服务于它的作者一人，发出来是顺便——万一某些工程上的处理对你有用。

---

## 三条工作流

### 搜索（地基）
模型 / 搜索源 / 深度 / reasoning 档位**逐轮**可调。三档深度：**Speed**（Researcher 最多 6 轮）、**Balanced**（12 轮）、**DeepResearch**（25 轮——原 Quality 档，UI 已改名）。Researcher 历史滑窗有纪律；SearXNG 单 query 故障隔离；中文上传不再乱码；任意已完成回合可分叉成新对话。这是日常主力，也是另外两条工作流的素材库。

**DeepResearch** 是搜索链路里的重量级路径：classifier → widgets ∥ researcher（**强制搜索**，最多 25 轮 tool）→ **Writer 初稿**（不外显）→ **Verifier**（结构化逐条核查 claim 与检索来源的忠实性）→ **Writer 终稿**（流式输出，无依据论断软化或标注「未核实」）。UI 会展示 Draft / Verify 子步，避免 research 结束后长时间静默被误以为卡住。token JSONL 单独记录 `writer_draft` / `verifier` phase，方便分项核算成本。

### 写作工房（`/studio`）
独立于聊天的长文流水线——与 DeepResearch 同形的 **R → W → V → W**，但为成稿而非问答调优。**Researcher → Writer 初稿 → Verifier → Writer 定稿**。可选「来源对话」作为根基，确保稿件源于你真实思考过的内容，而不是 LLM 凭空发挥。可选篇幅（短 / 适中 / 长），可多轮修订，可一键导出 Markdown。落在 `kind='studio'` 的 chat 下。

### 师爷进言（`/advisor`）
师爷阅读你近期的普通对话后，写给你的一篇**周期性长篇战略报告**。四段结构，目标 2000–3000 字：

1. **闪光点**（~15%）—— 带证据的认可。
2. **逆耳忠言**（~15%）—— 直击盲区，不绕弯不攻击。
3. **增量认知**（~35%，**纵深**）—— 沿你已在追问的话题往更深处推：更底层的机制、更长远的后果、更尖锐的权衡。
4. **认知萌发**（~35%，**广度**）—— **大脑发芽课**：把你不同对话、不同领域的零散点焊接起来，给你看见认知边界**之外**的图景。

资格判定：`首次` 或 `距上次 ≥ 28 天` 或 `自上次 cursor 起 ≥ 30 条用户消息`。进言以 `kind='advisor'` 的 chat 形式保存；可以在底部**直接和师爷论道**——见下。

### 主公备忘录（Memory）
师爷为你维护的一份**私密单文档**——**写给师爷自己看的内部备忘**，不是面向用户的画像稿。回答的是：*主公是谁、盲区在哪、师爷应该怎样调整策略才能更好地辅佐*。在 Settings → 记忆 中可见可编辑。每次进言写完后自动融合更新；在进言对话中纠正师爷时也会增量更新。

每次进言开跑，师爷都会读它一遍；你也可以随时去重写它。

---

## 工作流之外的细节

**丝滑的 UX** —— 是那种你在别处用惯了才会突然想念的手感

- **什么都能往输入框拖** —— 文件和**网页选中文本**都行；只有拖文件才出蓝色上传遮罩，所以拖文本不会被挡住落点。
- **对话过程中随时改配置** —— 模型 / 搜索源 / 深度 / reasoning 档位逐轮切换。
- **Reasoning 档位选择器** —— `off / auto / low / medium / high` 显式可控，集成在模型 Popover 里。
- **Quick Prompts** —— 设置页 GUI 编辑的常用提示词板。输入框里打 `/` 按命令前缀过滤；按 **`Ctrl+/`**（macOS 为 **`Cmd+/`**）随时呼出完整面板——这个快捷键比较少见，值得记一下。
- **Library 文件夹系统** —— 对话可归到 Space；标题大小写不敏感搜索；按 **`lastMessageAt`** 排序。
- **每轮 Meta Info 页脚** —— 每条助手回复底部展示这一轮**实际用了哪个模型 / reasoning 档位 / 搜索模式**。
- **智能折叠 + 复制** —— 长 prompt 超过约 200 字自动折叠，一键复制。
- **中文上传不再乱码** —— multer 的 latin1 文件名 bug 已修；GBK/Big5 等非 UTF-8 文本文件自动检测解码。
- **聊天分叉** —— 任意已完成助手回合都可分叉，整个前缀在同一事务内复制。
- **PDF / Markdown 导出** —— 一键，中文不掉字。
- **进言追问** —— 师爷进言页底部可直接论道；遇到「其实我不是这样的」类纠正，会增量更新主公备忘录。

**引擎纪律**

- **Verifier** —— DeepResearch 与写作工房共用的重量级环节：Writer 出稿后结构化 JSON 逐条核查 claim，强制二改终稿，无来源论断须软化或标注；核查失败时优雅降级，不废整轮。
- Researcher 历史按滑窗截断；tool 输出截断时清掉半截 `\uXXXX` 转义，避免下一轮 400。
- SearXNG 单 query try/catch —— 单条 query 失败不连累整轮。
- 非 vision 模型自动剥掉历史里的 `image_url`，并通过系统提示让模型知道「附件存在过」。
- 每轮 token 用量按日落到 `data/token-usage/*.jsonl`（phase / provider / model / cache 命中 / reasoning 档位）；advisor / studio / `memory_update` 都有独立 phase，方便分项核算成本。
- 级联删除：删除一个进言 chat 时一并清理 `advisor_runs`，cursor 正确回落，可重新进言。

---

## 它不是什么

- 不是 Perplexity 的竞品。用户基数 = 1。
- 不是多租户。单用户假设贯穿整个代码库（鉴权、限流、配额全都缺位或形同虚设）。
- 不是稳定 API。路由和数据库 schema 会迁移，迁移是尽力而为。
- 不是开箱即用的部署。SearXNG、模型 API key、以及看日志的耐心是前提。

---

## 架构速览

```
┌──────────────┐    HTTP / SSE / NDJSON    ┌──────────────────────────────────────────┐
│   vane-ui    │ ────────────────────────▶ │                vane-api                  │
│  (Vite R19)  │                           │  Express 5 + better-sqlite3 + Drizzle    │
└──────────────┘                           │                                          │
                                           │  ┌────────────┐ ┌────────┐ ┌──────────┐  │
                                           │  │   搜索     │ │  写作  │ │  进言    │  │
                                           │  │ classifier │ │  R→W   │ │ 语料  → │  │
                                           │  │ →research  │ │  →V→W  │ │ 四段长文 │  │
                                           │  │  →writer   │ │        │ │          │  │
                                           │  └─────┬──────┘ └───┬────┘ └────┬─────┘  │
                                           │        │            │           │        │
                                           │        │      ┌─────▼──────┐    │        │
                                           │        │      │   Memory   │◀───┘        │
                                           │        │      │ 主公备忘录 │             │
                                           │        │      └────────────┘             │
                                           │   ┌────▼────┐                ┌────────┐  │
                                           │   │ SearXNG │                │  LLM   │  │
                                           │   │ 网/学/社 │               │ 多厂商 │  │
                                           │   └─────────┘                └────────┘  │
                                           └──────────────────────────────────────────┘
```

- **`vane-api/`** —— Node 20+ / Express 5 / better-sqlite3 / Drizzle ORM。源码 ESM，dev 用 `tsx`，生产 `tsup` 打成 CJS。入口 `src/index.ts`。
  - 搜索：`src/lib/agents/search/`
  - 写作工房：`src/lib/agents/studio/` · 路由 `src/routes/studio.ts`
  - 师爷进言：`src/lib/agents/advisor/` · 路由 `src/routes/advisor.ts`
  - 记忆：`src/lib/memory/` · 路由 `src/routes/memory.ts`
- **`vane-ui/`** —— Vite + React 19 + Tailwind。聊天状态在 `src/lib/hooks/useChat.tsx`（多 kind 感知：`normal | advisor | studio`）。
- **`searxng-config/`** + `docker-compose.yml` —— 本地 SearXNG 实例，建议只读挂载。
- **`vane-api/data/`** —— `db.sqlite`、上传文件、`persona/`、`token-usage/`，已 gitignore。

---

## 快速开始

依赖：Node ≥ 20、pnpm ≥ 10、Docker（用于 SearXNG）。

```bash
docker compose up -d                # 1. 启 SearXNG
pnpm -C vane-api install            # 2. 装依赖（better-sqlite3 需要 build script）
pnpm -C vane-ui install
./start-dev.sh                      # 3. 同时拉起前后端
```

第一次启动会进入设置向导，在里面配置模型 provider 和搜索源。配置落盘在 `vane-api/data/config.json`。API 启动时自动跑 migration。

> 如果 `better-sqlite3` 报 `Could not locate the bindings file` 或 `NODE_MODULE_VERSION` 不匹配：`cd vane-api && pnpm rebuild better-sqlite3`（或整体重装）。`pnpm.onlyBuiltDependencies` 白名单已为新 clone 处理好这件事。

---

## 模型 Provider

LLM 访问统一经过 `vane-api/src/lib/models/providers/policy/openaiCompatPolicy.ts`，把厂商差异（base URL 规范化、reasoning 档位门控、结构化输出回退）收敛到一处。

**日常实战** —— DeepSeek V3.2 / V4（V4 thinking 模式完整支持，包括 `reasoning_content`-only 的边角 case）。

**有代码路径但未充分实测** —— OpenAI、Gemini、Ollama、其它 OpenAI 兼容端点。代码都通了，作者目前是 DeepSeek 一条龙。欢迎提 issue。

加新厂商请扩这个 policy 文件，不要在别处堆 `if (vendor === ...)`。这是承重约定。

---

## 与上游 Vane 的差异

如果你从 [ItzCrazyKns/Vane](https://github.com/ItzCrazyKns/Vane) 过来：

| 维度                   | 上游 Vane            | 师爷 Shiye                                                                              |
| ---------------------- | -------------------- | --------------------------------------------------------------------------------------- |
| **定位**               | AI 搜索              | 搜索 + 长文写作工房 + 周期性战略进言 + 私密主公备忘录                                  |
| **技术栈**             | Next.js 全栈         | Express API + Vite SPA，前后端解耦                                                      |
| **对话过程中改配置**   | 开会话时锁死         | 模型 / 搜索源 / 深度 / reasoning 都可**逐轮**切换                                       |
| **Reasoning 档位**     | —                    | 显式选择器，嵌在模型 Popover                                                            |
| **Library**            | 扁平列表，按创建时间 | 文件夹（Space）系统、大小写不敏感标题搜索、按 `lastMessageAt` 排序                      |
| **拖拽**               | —                    | **文件和文本都行**；遮罩只对文件触发                                                    |
| **Quick Prompts**      | —                    | 设置页 GUI 编辑的常用 prompt 板                                                         |
| **每轮 Meta Info**     | —                    | 助手回复底部一行：本轮用的模型 / reasoning / 搜索模式                                   |
| **中文上传**           | 文件名乱码、GBK 失败 | UTF-8 文件名修复 + 文本上传自动编码检测                                                 |
| **分叉**               | —                    | `POST /api/chats/:chatId/messages/:messageId/fork` 在事务内复制前缀                     |
| **导出**               | Markdown + PDF       | Markdown + 中文安全 PDF；写作工房稿件可导出 `.md`                                       |
| **搜索深度**           | Speed / Balanced / Quality | Speed / Balanced / **DeepResearch**（UI 改名；内部仍 `quality`）；DR 强制搜索 + 最多 25 轮 researcher |
| **Verifier**         | —                    | DeepResearch + 写作工房：初稿 → 结构化 claim 核查 → 终稿二改并标注忠实性                 |
| **Researcher**         | Tool 循环            | Tool 循环 + 滑窗历史预算 + JSON 转义安全截断 + SearXNG 单 query 故障隔离                |
| **写作工房**           | —                    | R→W→V→W 流水线，可绑来源对话，篇幅可选，多轮修订，`kind='studio'` chat                  |
| **战略进言**           | —                    | 周期性四段长文（闪光点 / 逆耳忠言 / 增量认知 / 认知萌发），`kind='advisor'`，可论道追问 |
| **记忆**               | —                    | 单文档「主公备忘录」，进言后自动融合更新，Settings 可见可改                             |
| **Provider 适配**      | —                    | `openaiCompatPolicy`（base URL 规范化、reasoning 档位门控、结构化输出回退）             |
| **数据库**             | Drizzle + SQLite     | + `chats.kind`、`chats.lastMessageAt`、`chat_branches`、`advisor_runs`、`user_memory`   |
| **可观测性**           | —                    | 每轮 token JSONL，phase 含 `search|studio_*|advisor|memory_update`                      |

UI 外壳仍源自上游，正在逐步换皮。

---

## 路线图（松散，按优先级）

- UI 视觉独立化（logo、配色、字体），不做整体重构。
- 进言语料选择策略升级 —— 目前超预算时按 `lastMessageAt` **整段丢老对话**，导致老对话进不了「认知萌发」章。计划改成「每个 chat 取首尾若干轮」的广度优先预算，让老对话也能参与跨界焊接。
- 把 classifier 的 `skipSearch` 决策展示在助手回复页脚，配一个「强制重做搜索」按钮，替代全局 Force Search 开关。
- 写作工房 v2 —— 多 agent 写作室（策划 / 调研 / 撰稿 / 编辑）；多稿对比 UI；DOCX 导出。
- 调优 DeepResearch 的 researcher 轮次上限与提前结束行为；决定 Multi-Agent 是否值得做。
- 把 `/api/search` 的对外契约打磨干净，将来万一要作为 tool 嵌入更大的 Agent 框架，今天的代码不挡路。

---

## 致谢

- **[Vane](https://github.com/ItzCrazyKns/Vane)**，作者 [@ItzCrazyKns](https://github.com/ItzCrazyKns) —— 这个 fork 的起点。产品形态、最初的 UI 语汇、以及一大堆扎实的编排思路都是他的。原项目 MIT 协议，师爷在 [LICENSE](./LICENSE) 中保留原作者版权声明。
- **[SearXNG](https://github.com/searxng/searxng)** —— 这一切赖以建立的元搜索引擎。

---

## 协议

[MIT](./LICENSE)。原始版权 © 2026 ItzCrazyKns（上游 Vane）。修改部分版权 © 2026 JuanHoi1996（师爷）。
