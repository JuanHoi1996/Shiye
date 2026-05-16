#!/usr/bin/env python3
"""Summarize vane-api token usage JSONL files (default: ./vane-api/data/token-usage/*.jsonl).

Aggregates token sums, optional provider-reported prompt cache (cachedTokens), and
search-path flags (skipSearch, researcherRan) when present in newer JSONL lines.
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


def summarize(rows: list[dict[str, Any]]) -> None:
    by_day: dict[str, int] = defaultdict(int)
    by_phase_model: dict[tuple[str, str], dict[str, float]] = defaultdict(
        lambda: {
            "count": 0,
            "input": 0.0,
            "output": 0.0,
            "total": 0.0,
            "errors": 0,
            "cached": 0.0,
            "input_when_cached_reported": 0.0,
            "rows_with_cached_field": 0,
        },
    )

    # writer rows only: researcherRan -> cache stats
    writer_by_ran: dict[str, dict[str, float]] = defaultdict(
        lambda: {
            "count": 0,
            "input": 0.0,
            "cached": 0.0,
            "input_when_cached_reported": 0.0,
            "rows_with_cached_field": 0,
        },
    )

    # classifier: skipSearch -> cache stats
    clf_by_skip: dict[str, dict[str, float]] = defaultdict(
        lambda: {
            "count": 0,
            "input": 0.0,
            "cached": 0.0,
            "input_when_cached_reported": 0.0,
            "rows_with_cached_field": 0,
        },
    )

    for r in rows:
        if r.get("_parse_error"):
            by_phase_model[("__parse_error__", "")]["errors"] += 1
            continue
        ts = str(r.get("timestamp", ""))[:10] or "unknown-date"
        by_day[ts] += 1
        phase = str(r.get("phase", "unknown"))
        model = str(r.get("modelKey", "unknown"))
        key = (phase, model)
        agg = by_phase_model[key]
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

        if phase == "writer":
            ran = _bool_label(r, "researcherRan")
            w = writer_by_ran[ran]
            w["count"] += 1
            inp = _fnum(r, "inputTokens")
            if inp is not None:
                w["input"] += inp
            if "cachedTokens" in r:
                w["rows_with_cached_field"] += 1
                cc = _fnum(r, "cachedTokens")
                if cc is not None:
                    w["cached"] += cc
                if inp is not None:
                    w["input_when_cached_reported"] += inp

        if phase == "classifier":
            sk = _bool_label(r, "skipSearch")
            cagg = clf_by_skip[sk]
            cagg["count"] += 1
            inp = _fnum(r, "inputTokens")
            if inp is not None:
                cagg["input"] += inp
            if "cachedTokens" in r:
                cagg["rows_with_cached_field"] += 1
                cc = _fnum(r, "cachedTokens")
                if cc is not None:
                    cagg["cached"] += cc
                if inp is not None:
                    cagg["input_when_cached_reported"] += inp

    print("=== By date (line count) ===")
    for d in sorted(by_day.keys()):
        print(f"  {d}: {by_day[d]}")

    print("\n=== By phase + modelKey (count, input/output/total, errors; cache where reported) ===")
    for (phase, model) in sorted(by_phase_model.keys()):
        a = by_phase_model[(phase, model)]
        rc = int(a["rows_with_cached_field"])
        tot = int(a["count"])
        extra = ""
        if rc > 0:
            denom = a["input_when_cached_reported"]
            pct = 100.0 * a["cached"] / denom if denom > 0 else 0.0
            extra = f"  cached={int(a['cached']):8}  cache_hit≈{pct:5.1f}% (on {rc}/{tot} lines with cachedTokens)"
        print(
            f"  {phase:12} {model:32} n={tot:5} "
            f"in={int(a['input']):8} out={int(a['output']):8} tot={int(a['total']):8} err={int(a['errors'])}{extra}",
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
            rc = int(b["rows_with_cached_field"])
            if rc == 0:
                print(f"  {name:14} n={n:5}  in={int(b['input']):8}  (no cachedTokens in JSONL — upgrade vane-api or provider may omit)")
                continue
            denom = b["input_when_cached_reported"]
            pct = 100.0 * b["cached"] / denom if denom > 0 else 0.0
            print(
                f"  {name:14} n={n:5}  in={int(b['input']):8}  "
                f"cached={int(b['cached']):8}  cache_hit≈{pct:5.1f}%  (cached field on {rc}/{n} lines)",
            )

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
    args = ap.parse_args()
    paths = list(args.paths) if args.paths else default_globs(args.repo_root)
    if not paths:
        print("No JSONL files found. Run vane-api with chat traffic or pass explicit paths.")
        return
    rows = load_records(paths)
    print(f"Loaded {len(rows)} records from {len(paths)} file(s).")
    summarize(rows)


if __name__ == "__main__":
    main()
