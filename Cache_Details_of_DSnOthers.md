结合官方文档与社区实践的踩坑/实测情况，针对你提出的问题回答如下：

---

## 1. Context Caching 的精确语义

### 块粒度与对齐

* **64 Tokens 最小对齐/间隔**：官方与社区实践均确认，DeepSeek 的前缀缓存要求**最小缓存或截断粒度为 64 tokens**。少于 64 tokens 的短前缀通常无法被独立落盘；在大段文本输入中，也会按 64 tokens（或其整数倍的固定 Token 间隔）进行 Chunk 分割与落盘。
* **匹配机制**：受 Sliding Window Attention（滑动窗口注意力）影响，DeepSeek 将缓存划分成独立的“缓存前缀单元”**。后续请求必须**严格从第 0 个 Token 开始完全匹配某个已落盘的前缀单元，才能命中该部分缓存。

### TTL / 淘汰策略

* **自动/隐式 TTL**：官方文档明确说明缓存构建耗时为秒级，**不再使用后会自动清空，通常维持几小时到几天**。
* **淘汰机制**：API **不提供手动清理或指定 TTL 的参数**（属于 Best-Effort 尽力而为策略）。若长时间没有新请求命中该前缀，系统会自动回收硬盘上的 KV 缓存数据。

### 跨请求与跨 Chat 共享

* **全局跨 Chat 共享（跨租户/跨请求）**：**只要绝对前缀完全一致，即可跨请求、跨 Chat 甚至跨账号命中**。DeepSeek 采用的是公共前缀检测（Public Prefix Detection）落盘机制。例如不同用户发送了完全相同的 System Prompt 或大型文档，后续请求均可命中同一份硬盘 Cache。

---

## 2. `tools` 数组是否参与前缀判定？

**是的，`tools` 数组会严格参与前缀判定！**

### 原因与影响

在 OpenAI/DeepSeek API 的标准 Prompt 拼接格式中，`tools` 数组会被格式化/序列化为 System 级别的上下文信息，**置于最前端（通常位于 messages 之前或与第一个 system message 紧挨在一起）**。

因此：

1. **顺序极其敏感**：如果 Tool schema 的序列化顺序（包括 `tools` 数组内 Tool 的排列顺序、Tool schema 内部 JSON 字段的 key 顺序）发生变化，生成的 Token 序列就会从变动点开始发生改变。
2. **发生 Cache Miss**：由于前缀匹配要求从头到尾严格按字符/Token 对齐，一旦 `tools` 的序列化顺序发生改变，**不仅 `tools` 本身无法命中，紧随其后的所有 System Prompt 和历史对话（messages）全部都会发生 `prompt_cache_miss**`。

### 结论与建议

**绝对有必要保证 Tool Registry 序列化在字节/Token 级别的稳定性**：

* **排序 Tool 列表**：在构造 API 请求体前，建议对 `tools` 数组按 `name` 进行**确定性排序（Canonical Sorting）**。
* **稳定 JSON Schema 序列化**：对每个 Tool 的 `parameters`（JSON Schema）中的 key 进行递归 key 排序（例如保证 `properties` 内的字段顺序不变，`required` 数组按字母排序），确保每次生成的 JSON 文本在字节层面完全一致。

接上文，针对你补充的第三个问题，我们直接将 **DeepSeek、OpenAI、Anthropic** 三家的 Context Caching / Prompt Caching 语义放在一起做横向对比：

---

## 三家 Prompt Caching 机制横向对比

| 维度 | **DeepSeek** | **OpenAI** | **Anthropic (Claude)** |
| --- | --- | --- | --- |
| **缓存触发方式** | **全自动（Implicit）** <br>

<br>无需任何参数配置。 | **全自动（Implicit）** <br>

<br>无需任何参数配置。 | **显式控制（Explicit）** <br>

<br>需在 message/system 节点显式声明 `"cache_control": {"type": "ephemeral"}`。 |
| **最小缓存阈值** | **64 Tokens** <br>

<br>极其激进，短前缀即可被记录。 | **1024 Tokens** <br>

<br>小于 1024 tokens 的前缀完全不触发缓存。 | **1024 Tokens**（Sonnet/Opus） / **2048 Tokens**（Haiku） <br>

<br>断点之前的内容总量需达标。 |
| **对齐与递增粒度** | **64 Tokens** <br>

<br>以 64 tokens 作为一个 Chunk 递增对齐。 | **128 Tokens** <br>

<br>以 128 tokens 作为一个 Chunk 递增对齐。 | **按声明的断点（Checkpoint）截断** <br>

<br>最长支持 4 个显式断点，灵活度极高。 |
| **TTL / 生存时间** | **约 几小时 ~ 几天** <br>

<br>视集群整体负载自动回收。 | **约 5 ~ 10 分钟**（空闲失效） <br>

<br>如果持续有请求命中，最高可续期至几小时。 | **5 分钟**（默认空闲失效） <br>

<br>如果持续命中会自动刷新 TTL。 |
| **跨请求 / 跨用户共享** | **全局共享（Global）** <br>

<br>基于公共前缀检测落盘。只要 Token 序列一致，可跨租户命中。 | **组织级隔离（Organization-level）** <br>

<br>仅在同一个 Organization/Project 内共享。 | **组织级隔离（Organization-level）** <br>

<br>仅在同一 Org 内的请求命中。 |
| **Tool / Schema 顺序敏感** | **极度敏感** <br>

<br>Tools 序列化后置于最前端，顺序变动引发全局 Miss。 | **极度敏感** <br>

<br>Tools 置于最前端，顺序变动引发全局 Miss。 | **局部敏感** <br>

<br>如果把 `tools` 放在 `cache_control` 断点之前，顺序变动会破坏断点后的 Cache。 |

---

## 核心语义差异与实战工程建议

### 1. OpenAI vs DeepSeek：自动前缀匹配的区别

* **阈值与粒度**：OpenAI 必须达到 **1024 tokens** 起步，且按 128 tokens 递增；DeepSeek 仅需 **64 tokens** 起步，且按 64 tokens 递增。这意味着 DeepSeek 对短对话、轻量系统提示词（System Prompt）的缓存更加敏感。
* **隔离级别**：DeepSeek 的公共前缀落盘使得极高频的公共 Prompt（如热门 Agent 的 System Prompt）在整个平台层都能被高效复用；而 OpenAI 出于隐私与隔离考虑，限制在同一个 Organization 内。

### 2. Anthropic 的“显式断点”机制

* **工作原理**：Anthropic 要求开发者明确告诉 API“**缓存到这里为止**”。
* **适用场景**：在包含动态变量（如当前时间戳、用户 UUID、搜索结果）的场景下，Anthropic 的显式断点非常强大——你可以把“静态工具库 + 大型背景文档”打上 `cache_control`，后面接着“动态时间戳 + 用户提问”。这样即便中间夹杂了动态变化的内容，断点前的 KV Cache 也依然能够 100% 命中。
* **反观 DeepSeek/OpenAI**：由于是自动匹配最长公共前缀，如果把动态内容（如时间戳）误放到了 Prompt 的头部或 `tools` 之前，就会直接从该位置开始破坏整个后续文本的 Cache。

### 3. 工具库（Tools Registry）的最佳工程实践

由于三家模型在处理 API 请求体时，均会将 `tools` 数组序列化后嵌入在整个上下文的最前面（或作为 System 的隐式前缀）：

1. **Canonical JSON 序列化**：对传入 API 的 `tools` 数组进行字典序排序（如按 `tool.name` ASC），并且对 `parameters` 中的 key 做稳定序列化。
2. **避免动态插入 Tool**：在 Agent 运行过程中，切忌根据上下文动态地向 `tools` 数组中添加/删减 Tool（例如第一轮传了 5 个 Tool，第二轮根据意图过滤删成了 2 个）。这会导致前缀被直接破坏。正确做法是**保持全量 `tools` 列表完全不变**，仅通过 Prompt 引导或禁用不相关的工具。