#!/usr/bin/env python3
"""Summarize vane-api token usage JSONL files (default: ./vane-api/data/token-usage/*.jsonl)."""

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


def summarize(rows: list[dict[str, Any]]) -> None:
    by_day: dict[str, int] = defaultdict(int)
    by_phase_model: dict[tuple[str, str], dict[str, float]] = defaultdict(
        lambda: {"count": 0, "input": 0.0, "output": 0.0, "total": 0.0, "errors": 0},
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
            v = r.get(field)
            if isinstance(v, (int, float)):
                agg[k] += float(v)
        if r.get("error"):
            agg["errors"] += 1

    print("=== By date (line count) ===")
    for d in sorted(by_day.keys()):
        print(f"  {d}: {by_day[d]}")

    print("\n=== By phase + modelKey (count, sum input/output/total tokens, errors) ===")
    for (phase, model) in sorted(by_phase_model.keys()):
        a = by_phase_model[(phase, model)]
        print(
            f"  {phase:12} {model:32} n={int(a['count']):5} "
            f"in={int(a['input']):8} out={int(a['output']):8} tot={int(a['total']):8} err={int(a['errors'])}",
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
