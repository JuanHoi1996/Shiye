# 师爷 Shiye

> 一个自托管的思考工作台。**搜索**是日常主力；上面盖着**周期性战略进言**，以及师爷私下为你写的那份**主公备忘录**。

[English](./README.md) · 简体中文

「师爷」取自旧时县官身后那位低调博学、随时能掏出相关案卷的幕僚。本项目起源于 [Vane](https://github.com/ItzCrazyKns/Vane) 搜索引擎的 fork，如今已长成另一种东西：**Express + Vite 解耦架构** 之上，以搜索与进言为核心，共同围绕一份不断更新的「主公印象档」在运转。

首先服务于它的作者一人，发出来是顺便——万一某些工程上的处理对你有用。

**2026 年 10 月的状态。** 这是一份还能跑的快照。下面写的搜索、进言、主公备忘录都在。作者不再给这条搜索管道加功能。更早 README 底部的路线图作废。克隆下来自己用可以，别等那份优先级清单被捡起来。

---

## 核心工作流

### 搜索（地基）
模型 / 搜索源 / 深度 / reasoning 档位**逐轮**可调。三档深度：**Speed**（Researcher 最多 6 轮）、**Balanced**（12 轮）、**Quality**（25 轮——研究 + 核查）。Researcher 历史滑窗有纪律；SearXNG 单 query 故障隔离；中文上传不再乱码；任意已完成回合可分叉成新对话。这是日常主力，也是进言的素材库。

**Quality** 是搜索链路里的重量级路径：classifier → widgets ∥ researcher（**强制搜索**，最多 25 轮 tool）→ **Writer 初稿**（不外显）→ **Verifier**（结构化逐条核查 claim 与检索来源的忠实性）→ **Writer 终稿**（流式输出，无依据论断软化或标注「未核实」）。UI 会展示 Draft / Verify 子步，避免 research 结束后长时间静默被误以为卡住。token JSONL 单独记录 `writer_draft` / `verifier` phase，方便分项核算成本。

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

### 写作工房（`/studio`）——可选
仓库里仍保留长文 **R → W → V → W** 流水线（`/studio`，可从对话取种子、可导出 Markdown）。作者本人几乎不用；请当作**实验性 / 低优先级**功能——需要时在，不需要时忽略即可。

---

## 工作流之外的细节

**丝滑的 UX** —— 是那种你在别处用惯了才会突然想念的手感

- **什么都能往输入框拖** —— 文件和**网页选中文本**都行；只有拖文件才出蓝色上传遮罩，所以拖文本不会被挡住落点。
- **对话过程中随时改配置** —— 模型 / 搜索源 / 深度 / reasoning 档位逐轮切换。
- **Reasoning 档位选择器** —— `auto / off / low / high / max`，嵌在模型 Popover 里。这是用户意图，不是各家 API 的原始枚举。有的模型不能关思考，有的不接受 `max`。认不出的模型不会被猜成最高档。
- **Quick Prompts** —— 设置页 GUI 编辑的常用提示词板。按 **`Ctrl+/`**（macOS 为 **`Cmd+/`**）随时呼出面板——这个快捷键比较少见，值得记一下。
- **Library 文件夹系统** —— 对话可归到 Space；标题大小写不敏感搜索；按 **`lastMessageAt`** 排序。
- **每轮 Meta Info 页脚** —— 每条助手回复底部展示这一轮**实际用了哪个模型 / reasoning 档位 / 搜索模式**。
- **智能折叠 + 复制** —— 长 prompt 超过约 200 字自动折叠，一键复制。
- **中文上传不再乱码** —— multer 的 latin1 文件名 bug 已修；GBK/Big5 等非 UTF-8 文本文件自动检测解码。
- **聊天分叉** —— 任意已完成助手回合都可分叉，整个前缀在同一事务内复制。
- **PDF / Markdown 导出** —— 一键，中文不掉字。
- **进言追问** —— 师爷进言页底部可直接论道；遇到「其实我不是这样的」类纠正，会增量更新主公备忘录。

**引擎纪律**

- **Verifier** —— Quality 的重量级环节（若你使用写作工房也会复用）：Writer 出稿后结构化 JSON 逐条核查 claim，强制二改终稿，无来源论断须软化或标注；核查失败时优雅降级，不废整轮。
- Researcher 历史按滑窗截断；tool 输出截断时清掉半截 `\uXXXX` 转义，避免下一轮 400。
- SearXNG 单 query try/catch —— 单条 query 失败不连累整轮。
- **上传的图片**会在模型被视为能看图时发给 writer（OpenAI 的 vision 型号、除 `kimi-k2.7-code` 以外的 Kimi 对话模型、Gemini、Claude、Grok、Qwen-VL，以及显式的 `capabilities.vision`）。分类和 researcher 仍然只看到文件名。不能看图的模型会剥掉 `image_url`，并留一句「附件曾经在」。
- 每轮 token 用量按日落到 `data/token-usage/*.jsonl`（phase / provider / model / cache 命中 / reasoning 档位）；advisor / studio / `memory_update` 都有独立 phase，方便分项核算成本。
- 级联删除：删除一个进言 chat 时一并清理 `advisor_runs`，cursor 正确回落，可重新进言。

**Agent 调研 API + MCP** —— 给别的 coding agent（Cursor / Claude Code 等）用，不是师爷 UI

- **`POST /api/agent/research`** —— 仅 speed：跳过 classifier/widgets，面向 Agent 的干综述 writer，返回短 `summary` + 最多 15 条压缩来源（title / url / snippet）。无师爷人格。说明见 [`AGENT_RESEARCH_API.md`](./AGENT_RESEARCH_API.md)。
- **`mcp/shiye-research/`** —— stdio MCP 工具 `shiye_research`，转调上述 HTTP。启动方式须让 MCP 与 `vane-api` 共享 localhost（macOS/Linux/原生 Windows 用本机 Node；API 在 WSL、IDE 在 Windows 时用 `wsl.exe`）。配置见 [`mcp/shiye-research/README.md`](./mcp/shiye-research/README.md)。
- 仅本机 / 自托管——此路径无鉴权，勿对公网裸奔。

**Prompt 缓存卫生（context engineering）** —— researcher 的 system 跨轮字节稳定；writer 的检索 context 放在最新 user 消息；Quality 的 draft→final 让 draft 整请求成为可缓存前缀。可用 `python3 summarize_token_usage.py --since YYYY-MM-DD` 复盘。

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
                                           │  ┌────────────┐              ┌──────────┐  │
                                           │  │   搜索     │              │  进言    │  │
                                           │  │ classifier │              │ 语料  → │  │
                                           │  │ →research  │              │ 四段长文 │  │
                                           │  │  →writer   │              │          │  │
                                           │  └─────┬──────┘              └────┬─────┘  │
                                           │        │                          │        │
                                           │        │      ┌─────▼──────┐      │        │
                                           │        │      │   Memory   │◀─────┘        │
                                           │        │      │ 主公备忘录 │               │
                                           │        │      └────────────┘               │
                                           │   ┌────▼────┐                ┌────────┐    │
                                           │   │ SearXNG │                │  LLM   │    │
                                           │   │ 网/学/社 │               │ 多厂商 │    │
                                           │   └─────────┘                └────────┘    │
                                           └────────────────────────────────────────────┘
```

（写作工房仍在代码里 `/studio`；图中有意省略——可选 / 低优先级。）

- **`vane-api/`** —— Node 20+ / Express 5 / better-sqlite3 / Drizzle ORM。源码 ESM，dev 用 `tsx`，生产 `tsup` 打成 CJS。入口 `src/index.ts`。
  - 搜索：`src/lib/agents/search/`
  - 师爷进言：`src/lib/agents/advisor/` · 路由 `src/routes/advisor.ts`
  - 记忆：`src/lib/memory/` · 路由 `src/routes/memory.ts`
  - 写作工房（可选）：`src/lib/agents/studio/` · 路由 `src/routes/studio.ts`
- **`vane-ui/`** —— Vite + React 19 + Tailwind。聊天状态在 `src/lib/hooks/useChat.tsx`（多 kind 感知：`normal | advisor | studio`）。
- **`searxng-config/`** + `docker-compose.yml` —— 本地 SearXNG 实例，建议只读挂载。
- **`vane-api/data/`** —— `db.sqlite`、上传文件、`persona/`、`token-usage/`，已 gitignore。
- **`mcp/shiye-research/`** —— 可选的 stdio MCP 客户端，转调 `POST /api/agent/research`（见上文 Agent 调研一节）。

---

## 快速开始

依赖：Node ≥ 20、pnpm ≥ 10、Docker（用于 SearXNG）。

**Linux / WSL / macOS**

```bash
docker compose up -d                # 1. 启 SearXNG
pnpm -C vane-api install            # 2. 装依赖（better-sqlite3 需要 build script）
pnpm -C vane-ui install
./start-dev.sh                      # 3. 同时拉起前后端
```

**Windows（原生 PowerShell，仓库建议放在 NTFS 如 `C:\projects\MyVane`）**

```powershell
docker compose up -d
pnpm -C vane-api install
pnpm -C vane-ui install
.\start-dev.ps1
```

也可双击 **`start-dev.bat`**（内部调用 ps1，免改执行策略）。UI 默认 `http://localhost:5174`。

**说明：** 原生 Windows 启动脚本（`start-dev.ps1` / `start-dev.bat`）**尚未**在真实 NTFS + Docker Desktop 上充分验证；日常仍以 WSL / `start-dev.sh` 为准。

需已安装 [Docker Desktop](https://www.docker.com/products/docker-desktop/) 与 Node 20+（脚本**不会**自动安装 Docker；Node 可用 `winget install OpenJS.NodeJS.LTS` 手动装，见下）。若 `.ps1` 被策略拦截而 `.bat` 可用，优先用 bat。

第一次启动会进入设置向导，在里面配置模型 provider 和搜索源。配置落盘在 `vane-api/data/config.json`。API 启动时自动跑 migration。

**搜索源**：默认仍是本地 SearXNG。若上游引擎被 CAPTCHA/限流，可在设置 → Search 把 **Search provider** 改为 **Tavily**，并添加一个或多个 [Tavily](https://app.tavily.com) API key（或环境变量 `SEARCH_PROVIDER=tavily` + `TAVILY_API_KEY=tvly-…` / `TAVILY_API_KEYS=k1,k2`）。免费档约 1000 credits/key/月，basic 搜索约 1 credit/query；多 key 会轮询，并在 401/402/429 时自动换下一把。图片/视频搜索仍走 SearXNG。

> 如果 `better-sqlite3` 报 `Could not locate the bindings file` 或 `NODE_MODULE_VERSION` 不匹配：`cd vane-api && pnpm rebuild better-sqlite3`（或整体重装）。`pnpm.onlyBuiltDependencies` 白名单已为新 clone 处理好这件事。

---

## 模型 Provider

LLM 访问统一经过 `vane-api/src/lib/models/providers/policy/openaiCompatPolicy.ts`，把厂商差异（base URL 规范化、reasoning 档位门控、结构化输出回退）收敛到一处。

日常走的是 **OpenAI 兼容的 Chat Completions**，不是单一厂商。DeepSeek V4（thinking，含只回 `reasoning_content` 的情况）、OpenAI gpt-5.x、Kimi、MiMo、Gemini、Ollama，以及其他兼容端，都从这层 policy 进出。覆盖并不均匀：新的 model id 仍可能在采样或 reasoning 字段上 400，直到那个家族被补上。结构化调用（分类器）会在 thinking 会把 `content` 掏空时强制关掉 reasoning。

加新厂商请扩这个 policy（以及旁边的家族小模块），不要在别处堆 `if (vendor === ...)`。这是承重约定。

---

## 与上游 Vane 的差异

如果你从 [ItzCrazyKns/Vane](https://github.com/ItzCrazyKns/Vane) 过来：

| 维度                   | 上游 Vane            | 师爷 Shiye                                                                              |
| ---------------------- | -------------------- | --------------------------------------------------------------------------------------- |
| **定位**               | AI 搜索              | 搜索 + 周期性战略进言 + 私密主公备忘录（写作工房仍在，但是可选 / 低优先级）            |
| **技术栈**             | Next.js 全栈         | Express API + Vite SPA，前后端解耦                                                      |
| **对话过程中改配置**   | 开会话时锁死         | 模型 / 搜索源 / 深度 / reasoning 都可**逐轮**切换                                       |
| **Reasoning 档位**     | —                    | `auto / off / low / high / max`，嵌在模型 Popover；按厂商映射，不是统一枚举           |
| **Library**            | 扁平列表，按创建时间 | 文件夹（Space）系统、大小写不敏感标题搜索、按 `lastMessageAt` 排序                      |
| **拖拽**               | —                    | **文件和文本都行**；遮罩只对文件触发                                                    |
| **Quick Prompts**      | —                    | 设置页 GUI 编辑的常用 prompt 板                                                         |
| **每轮 Meta Info**     | —                    | 助手回复底部一行：本轮用的模型 / reasoning / 搜索模式                                   |
| **中文上传**           | 文件名乱码、GBK 失败 | UTF-8 文件名修复 + 文本上传自动编码检测                                                 |
| **分叉**               | —                    | `POST /api/chats/:chatId/messages/:messageId/fork` 在事务内复制前缀                     |
| **导出**               | Markdown + PDF       | Markdown + 中文安全 PDF                                                                 |
| **搜索深度**           | Speed / Balanced / Quality | Speed / Balanced / **Quality**（内部 `quality`）；Quality 强制搜索 + 最多 25 轮 researcher + verifier |
| **Verifier**         | —                    | Quality：初稿 → 结构化 claim 核查 → 终稿二改（写作工房若使用也会复用）                  |
| **Researcher**         | Tool 循环            | Tool 循环 + 滑窗历史预算 + JSON 转义安全截断 + SearXNG 单 query 故障隔离                |
| **写作工房**           | —                    | 可选 / 实验性：`/studio` 的 R→W→V→W（作者几乎不用）                                     |
| **战略进言**           | —                    | 周期性四段长文（闪光点 / 逆耳忠言 / 增量认知 / 认知萌发），`kind='advisor'`，可论道追问 |
| **记忆**               | —                    | 单文档「主公备忘录」，进言后自动融合更新，Settings 可见可改                             |
| **Provider 适配**      | —                    | `openaiCompatPolicy`（base URL 规范化、reasoning 档位门控、结构化输出回退）             |
| **数据库**             | Drizzle + SQLite     | + `chats.kind`、`chats.lastMessageAt`、`chat_branches`、`advisor_runs`、`user_memory`   |
| **可观测性**           | —                    | 每轮 token JSONL，phase 含 `search|studio_*|advisor|memory_update`                      |

UI 外壳仍源自上游，正在逐步换皮。

---

## 致谢

- **[Vane](https://github.com/ItzCrazyKns/Vane)**，作者 [@ItzCrazyKns](https://github.com/ItzCrazyKns) —— 这个 fork 的起点。产品形态、最初的 UI 语汇、以及一大堆扎实的编排思路都是他的。原项目 MIT 协议，师爷在 [LICENSE](./LICENSE) 中保留原作者版权声明。
- **[SearXNG](https://github.com/searxng/searxng)** —— 这一切赖以建立的元搜索引擎。

---

## 协议

[MIT](./LICENSE)。原始版权 © 2026 ItzCrazyKns（上游 Vane）。修改部分版权 © 2026 JuanHoi1996（师爷）。
