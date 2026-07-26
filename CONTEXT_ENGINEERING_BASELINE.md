# Context Engineering Baseline（重构前）

> 快照日期：2026-07-24  
> 数据源：`vane-api/data/token-usage/*.jsonl`  
> 复现：`python3 summarize_token_usage.py`（全量） / `python3 summarize_token_usage.py --since 2026-07-01`  
> 目的：在动手改 prompt / 消息布局之前，把「现状数字」钉死，方便改完对照。

---

## 1. 总览

| 窗口 | 行数 | Input tokens | Cache hit（有 `cachedTokens` 的行） | cached / 全部 input |
| --- | ---: | ---: | ---: | ---: |
| 全量（约 2026-05-03 → 07-24） | 4621 | 91.6M | **7.2%** | 6.0% |
| 2026-07 起 | 852 | 14.2M | **7.0%** | 7.0% |

与主观感受一致：整体命中率在 **6–7%**。DeepSeek 风格缓存计价下，这几乎等于「几乎每次都在付全价 input」。

命中率定义：`sum(cachedTokens) / sum(inputTokens)`，只在 JSONL 行带 `cachedTokens` 键时计入分母（自 2026-05-14 起几乎全覆盖）。

---

## 2. 按 phase：钱烧在哪、缓存死在哪

全量（模型无关聚合）：

| Phase | n | Input 占比 | Cache hit |
| --- | ---: | ---: | ---: |
| **researcher** | 3219 | **74.1%** | **3.2%** |
| writer | 679 | 16.5% | 9.7% |
| classifier | 639 | 6.5% | **46.0%** |
| writer_draft | 32 | 1.3% | 2.0% |
| verifier | 29 | 1.0% | 0.6% |
| 其余（advisor / studio / memory…） | 少量 | <1% | 参差 |

**结论**：整体 7% 几乎就是 researcher 拖垮的结果。classifier 已经能到 ~46%，说明「静态前缀 + 自动缓存」这条路在我们这套 provider 上是通的；researcher / writer 的布局才是问题。

2026-07 窗口同样结构：researcher 61% input、命中 4.2%；classifier 30%；writer 6.5%。

---

## 3. Researcher × iteration：吸烟枪

全量（有 `researcherIteration` 的行）：

| Iter | n | Input | Cache hit |
| ---: | ---: | ---: | ---: |
| 0 | 393 | 2.8M | **12.7%** |
| 1 | 393 | 3.5M | 8.8% |
| 2 | 353 | 4.5M | 6.0% |
| 3 | 329 | 5.0M | 4.6% |
| 5 | 266 | 5.4M | 3.4% |
| 10 | 95 | 3.4M | 1.3% |
| 15+ | … | … | **≤0.8%，后期常为 0%** |

越往后 history 越长、本该越容易命中前缀——结果却**单调下降**。这与「每轮把 `iteration ${i+1}` 写进 system prompt」完全吻合：前缀在第 ~150 token 处分叉，后续越滚越长的 tool 历史全部按未缓存价重读。

2026-07 同样：iter0 **17.1%** → iter5 **1.5%** → iter10+ **0%**。

---

## 4. 按 optimizationMode（全量）

| Mode | n | Input | Cache hit |
| --- | ---: | ---: | ---: |
| speed | 1166 | 16.5M | 11.9% |
| balanced | 1624 | 24.8M | 8.3% |
| quality（含 deepResearch flag 行） | ~1811 | ~49.7M | **约 2.6–7.6%**（分桶略乱，整体偏低） |

Quality / 长 researcher 循环最吃亏——正是我们最贵的路径。

---

## 5. 对照：已经「做得还行」的部分

- **Classifier ~46%**：system 相对稳定、跨 chat 可共享前缀；仍有日期等小扰动，但不是主矛盾。
- **Writer ~10%**：跨轮对话本可更高，但 `<context>` + 秒级时间戳塞在 system 里，导致 history 前缀很难复用。
- **Verifier / writer_draft ≈ 0–2%**：Quality 管道里 draft→verify→revise 几乎没有共享前缀设计。

---

## 6. 已识别的缓存杀手（待改，按 ROI）

1. **Researcher 每轮改写 system**（`getResearcherPrompt` 注入 iteration 计数）——最大头；修完后 researcher 阶段命中率应接近 coding-agent 循环形态。
2. **Writer 把易变 `<context>` / 秒级时间戳放在 system**——跨轮 chat history 无法命中。
3. **Quality：final 把 verifier 报告拼进 system**——相对 draft 丢掉可共享的消息前缀。
4. **Researcher 滑窗 / 字符裁剪中途改写 history**（`capResearcherAgentHistory`）——最长 run 恰好最容易 miss。

详细讨论见对话；本文只钉数字。

---

## 7. 改完后怎么验收

**改动生效日期 = 2026-07-24**（杀手 1–3 已合入源码；`--since` 从此日起算，需重启 API 并积累真实流量后再比）。

```bash
python3 summarize_token_usage.py --since 2026-07-24
```

关注：

1. **Overall cache_hit**（目标区间：先看能否稳定进 20%+，再冲 40%+；不幻想 coding-agent 的 90%）。
2. **researcher 命中率**与 **iter≥1 是否明显高于 iter0**（修对后应随轮次上升或至少不再崩塌）。
3. **researcher 的 input 占比仍会高**，但 cached 应显著抬升——这才是省钱信号。

---

## 8. 原始命令输出摘录

全量关键行（2026-07-24 跑）：

```
Loaded 4621 records …
=== Overall prompt cache ===
  n= 4621  in=91551117  cached= 5507328  cache_hit≈  7.2%
=== By phase ===
  researcher  … (74.1% of all input)  cache_hit≈  3.2%
  writer      … (16.5%)               cache_hit≈  9.7%
  classifier  … ( 6.5%)               cache_hit≈ 46.0%
=== Researcher by iteration ===
  iter=0   cache_hit≈ 12.7%
  … 单调下降 …
  iter=20+ cache_hit≈  0.0%
```
