#!/usr/bin/env python3
"""Summarize vane-api token usage JSONL files (default: ./vane-api/data/token-usage/*.jsonl).

Aggregates token sums, provider-reported prompt cache (cachedTokens), and
search-path flags (skipSearch, researcherRan) when present.

Phases: classifier | researcher | writer_draft | verifier | writer | advisor | …
JSONL uses optimizationMode: speed|balanced|quality; quality rows may also have
deepResearch: true (legacy flag name).

Extra sections for context-engineering baselines:
  - overall cache hit
  - by phase (model-agnostic)
  - researcher by iteration index
  - input-token share by phase
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
from typing import Any


def load_records(paths: list[Path]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for p in paths:
        if not p.is_file():
            continue
        with p.open(encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError:
                    rows.append({"_parse_error": True, "_source_file": str(p)})
    return rows


def _fnum(r: dict[str, Any], key: str) -> float | None:
    v = r.get(key)
    return float(v) if isinstance(v, (int, float)) else None


def _bool_label(r: dict[str, Any], key: str) -> str:
    if key not in r:
        return "unknown"
    v = r[key]
    if v is True:
        return "true"
    if v is False:
        return "false"
    return "unknown"


def _empty_cache_bucket() -> dict[str, float]:
    return {
        "count": 0,
        "input": 0.0,
        "output": 0.0,
        "total": 0.0,
        "errors": 0,
        "cached": 0.0,
        "input_when_cached_reported": 0.0,
        "rows_with_cached_field": 0,
    }


def _add_usage(agg: dict[str, float], r: dict[str, Any]) -> None:
    agg["count"] += 1
    for k, field in ("input", "inputTokens"), ("output", "outputTokens"), ("total", "totalTokens"):
        v = _fnum(r, field)
        if v is not None:
            agg[k] += v
    if r.get("error"):
        agg["errors"] += 1
    if "cachedTokens" in r:
        agg["rows_with_cached_field"] += 1
        c = _fnum(r, "cachedTokens")
        inp = _fnum(r, "inputTokens")
        if c is not None:
            agg["cached"] += c
        if inp is not None:
            agg["input_when_cached_reported"] += inp


def _hit_pct(agg: dict[str, float]) -> float | None:
    denom = agg["input_when_cached_reported"]
    if denom <= 0 or int(agg["rows_with_cached_field"]) == 0:
        return None
    return 100.0 * agg["cached"] / denom


def _fmt_hit(agg: dict[str, float]) -> str:
    rc = int(agg["rows_with_cached_field"])
    tot = int(agg["count"])
    pct = _hit_pct(agg)
    if pct is None:
        return f"(no cachedTokens on these {tot} lines)"
    return (
        f"cached={int(agg['cached']):8}  cache_hit≈{pct:5.1f}% "
        f"(on {rc}/{tot} lines with cachedTokens)"
    )


def filter_since(rows: list[dict[str, Any]], since: str | None) -> list[dict[str, Any]]:
    if not since:
        return rows
    out: list[dict[str, Any]] = []
    for r in rows:
        if r.get("_parse_error"):
            out.append(r)
            continue
        ts = str(r.get("timestamp", ""))[:10]
        if ts >= since:
            out.append(r)
    return out


def summarize(rows: list[dict[str, Any]]) -> None:
    by_day: dict[str, int] = defaultdict(int)
    by_phase_model: dict[tuple[str, str], dict[str, float]] = defaultdict(_empty_cache_bucket)
    by_phase: dict[str, dict[str, float]] = defaultdict(_empty_cache_bucket)
    overall = _empty_cache_bucket()

    # researcher iteration index → cache stats (smoking gun for per-iter system rewrite)
    by_researcher_iter: dict[str, dict[str, float]] = defaultdict(_empty_cache_bucket)

    # writer rows only: researcherRan -> cache stats
    writer_by_ran: dict[str, dict[str, float]] = defaultdict(_empty_cache_bucket)

    by_optimization_mode: dict[str, dict[str, float]] = defaultdict(
        lambda: {"count": 0, "input": 0.0, "output": 0.0, "total": 0.0},
    )
    by_mode_cache: dict[str, dict[str, float]] = defaultdict(_empty_cache_bucket)

    # writer + writer_draft
    writer_family: dict[str, float] = defaultdict(float)
    writer_family["count"] = 0

    # classifier: skipSearch -> cache stats
    clf_by_skip: dict[str, dict[str, float]] = defaultdict(_empty_cache_bucket)

    for r in rows:
        if r.get("_parse_error"):
            by_phase_model[("__parse_error__", "")]["errors"] += 1
            continue
        ts = str(r.get("timestamp", ""))[:10] or "unknown-date"
        by_day[ts] += 1
        phase = str(r.get("phase", "unknown"))
        model = str(r.get("modelKey", "unknown"))

        _add_usage(overall, r)
        _add_usage(by_phase[phase], r)
        _add_usage(by_phase_model[(phase, model)], r)

        mode_key = str(r.get("optimizationMode", "unknown"))
        if r.get("deepResearch") is True and "deepResearch" not in mode_key:
            mode_key = f"{mode_key} (quality/deepResearch flag)"
        om = by_optimization_mode[mode_key]
        om["count"] += 1
        for k, field in ("input", "inputTokens"), ("output", "outputTokens"), ("total", "totalTokens"):
            v = _fnum(r, field)
            if v is not None:
                om[k] += v
        _add_usage(by_mode_cache[mode_key], r)

        if phase in ("writer", "writer_draft"):
            writer_family["count"] += 1
            for k, field in ("input", "inputTokens"), ("output", "outputTokens"), ("total", "totalTokens"):
                v = _fnum(r, field)
                if v is not None:
                    writer_family[k] += v

        if phase == "researcher":
            it = r.get("researcherIteration")
            it_label = str(int(it)) if isinstance(it, (int, float)) else "unknown"
            _add_usage(by_researcher_iter[it_label], r)

        if phase == "writer":
            ran = _bool_label(r, "researcherRan")
            _add_usage(writer_by_ran[ran], r)

        if phase == "classifier":
            sk = _bool_label(r, "skipSearch")
            _add_usage(clf_by_skip[sk], r)

    print("=== By date (line count) ===")
    for d in sorted(by_day.keys()):
        print(f"  {d}: {by_day[d]}")

    print("\n=== Overall prompt cache (context-engineering baseline) ===")
    print(f"  n={int(overall['count']):5}  in={int(overall['input']):8}  {_fmt_hit(overall)}")
    if overall["input"] > 0:
        share = 100.0 * overall["cached"] / overall["input"]
        print(
            f"  Note: hit% above uses only rows that report cachedTokens "
            f"(denom=input on those rows). vs all input tokens: "
            f"cached/all_in ≈ {share:5.1f}%",
        )

    print("\n=== By phase — cache hit + input share (model-agnostic) ===")
    total_in = overall["input"] or 1.0
    for phase in sorted(by_phase.keys(), key=lambda p: -by_phase[p]["input"]):
        a = by_phase[phase]
        n = int(a["count"])
        if n == 0:
            continue
        share = 100.0 * a["input"] / total_in
        print(
            f"  {phase:16} n={n:5}  in={int(a['input']):8} ({share:5.1f}% of all input)  "
            f"out={int(a['output']):8}  {_fmt_hit(a)}",
        )

    print("\n=== Researcher by iteration index (expect flat/low hit if system prompt mutates each iter) ===")
    if not by_researcher_iter or all(b["count"] == 0 for b in by_researcher_iter.values()):
        print("  (no researcher rows with data)")
    else:
        def iter_sort_key(k: str) -> tuple[int, str]:
            try:
                return (0, f"{int(k):05d}")
            except ValueError:
                return (1, k)

        for name in sorted(by_researcher_iter.keys(), key=iter_sort_key):
            b = by_researcher_iter[name]
            n = int(b["count"])
            if n == 0:
                continue
            print(
                f"  iter={name:8} n={n:5}  in={int(b['input']):8}  {_fmt_hit(b)}",
            )

    print("\n=== By optimizationMode (input/output/total + cache) ===")
    for mode in sorted(by_optimization_mode.keys()):
        o = by_optimization_mode[mode]
        n = int(o["count"])
        if n == 0:
            continue
        c = by_mode_cache[mode]
        print(
            f"  {mode:40} n={n:5} "
            f"in={int(o['input']):8} out={int(o['output']):8} tot={int(o['total']):8}  "
            f"{_fmt_hit(c)}",
        )

    wf_n = int(writer_family["count"])
    if wf_n > 0:
        print(
            f"\n=== Writer family (phase writer + writer_draft) n={wf_n} "
            f"in={int(writer_family['input']):8} out={int(writer_family['output']):8} "
            f"tot={int(writer_family['total']):8}",
        )

    print("\n=== By phase + modelKey (count, input/output/total, errors; cache where reported) ===")
    for (phase, model) in sorted(by_phase_model.keys()):
        a = by_phase_model[(phase, model)]
        tot = int(a["count"])
        print(
            f"  {phase:12} {model:32} n={tot:5} "
            f"in={int(a['input']):8} out={int(a['output']):8} tot={int(a['total']):8} "
            f"err={int(a['errors'])}  {_fmt_hit(a)}",
        )

    def print_bucket(title: str, buckets: dict[str, dict[str, float]]) -> None:
        print(f"\n=== {title} ===")
        if not buckets or all(b["count"] == 0 for b in buckets.values()):
            print("  (no rows)")
            return
        for name in sorted(buckets.keys()):
            b = buckets[name]
            n = int(b["count"])
            if n == 0:
                continue
            print(f"  {name:14} n={n:5}  in={int(b['input']):8}  {_fmt_hit(b)}")

    print_bucket("Classifier: prompt cache vs skipSearch", clf_by_skip)
    print_bucket("Writer: prompt cache vs researcherRan", writer_by_ran)

    total_lines = sum(1 for r in rows if not r.get("_parse_error"))
    with_cached = sum(1 for r in rows if not r.get("_parse_error") and "cachedTokens" in r)
    print("\n=== JSONL cache field coverage ===")
    print(
        f"  Lines with `cachedTokens` key: {with_cached} / {total_lines} "
        f"({'no historical data' if with_cached == 0 else 'partial or full coverage'})",
    )
    if with_cached == 0:
        print(
            "  Hint: vane-api now logs cachedTokens when the provider returns "
            "`prompt_tokens_details.cached_tokens` (or compatible). Re-run traffic and summarize again.",
        )


def default_globs(repo_root: Path) -> list[Path]:
    d = repo_root / "vane-api" / "data" / "token-usage"
    if not d.is_dir():
        return []
    return sorted(d.glob("*.jsonl"))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "paths",
        nargs="*",
        type=Path,
        help="JSONL files (default: vane-api/data/token-usage/*.jsonl under repo root)",
    )
    ap.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parent,
        help="Repository root when using default glob",
    )
    ap.add_argument(
        "--since",
        type=str,
        default=None,
        metavar="YYYY-MM-DD",
        help="Only include rows with timestamp date >= this (UTC day prefix)",
    )
    args = ap.parse_args()
    paths = list(args.paths) if args.paths else default_globs(args.repo_root)
    if not paths:
        print("No JSONL files found. Run vane-api with chat traffic or pass explicit paths.")
        return
    rows = load_records(paths)
    rows = filter_since(rows, args.since)
    since_note = f" (since {args.since})" if args.since else ""
    print(f"Loaded {len(rows)} records from {len(paths)} file(s){since_note}.")
    summarize(rows)


if __name__ == "__main__":
    main()
