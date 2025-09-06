#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path
from typing import Dict, Any, List


TOPIC_PATTERNS = [
    r"your\s+prompt\s+is\s+[\"'\u201c\u2018]?(.+?)[\"'\u201d\u2019]?(?:\s*\.|$)",
    r"about\s+(.+?)\s+in\s+the\s+style",
    r"on\s+(.+?)\s+in\s+the\s+style",
    r"about\s+(.+?)\s*\.",
]


def extract_topic(prompt: str) -> str:
    if not isinstance(prompt, str):
        return ""
    s = prompt.strip()
    for pat in TOPIC_PATTERNS:
        m = re.search(pat, s, flags=re.IGNORECASE)
        if m:
            return m.group(1).strip()
    return ""


def process_file(path: Path, dry_run: bool = False) -> Dict[str, int]:
    updated = 0
    total = 0
    rows: List[Dict[str, Any]] = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except Exception:
                continue
            total += 1
            info = row.get("info")
            has_topic = isinstance(info, dict) and bool(info.get("topic"))
            if not has_topic:
                topic = extract_topic(str(row.get("prompt", "")))
                if topic:
                    if not isinstance(info, dict):
                        info = {}
                    info["topic"] = topic
                    row["info"] = info
                    updated += 1
            rows.append(row)

    if not dry_run and updated > 0:
        tmp = path.with_suffix(path.suffix + ".tmp")
        bak = path.with_suffix(path.suffix + ".bak")
        with open(tmp, "w", encoding="utf-8") as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        if not bak.exists():
            try:
                path.replace(bak)
            except Exception:
                pass
        tmp.replace(path)
    return {"total": total, "updated": updated}


def main():
    p = argparse.ArgumentParser(description="Restore missing topics in samples.jsonl by parsing the prompt text")
    p.add_argument("--run-dir", required=True, help="Path to run directory (e.g., docs/runs/run-50-YYYYMMDD-HHMM)")
    p.add_argument("--only-model", default=None, help="Limit to one model subdir (folder name)")
    p.add_argument("--dry-run", action="store_true", help="Do not write files; just report counts")
    args = p.parse_args()

    run_dir = Path(args.run_dir)
    if not run_dir.exists():
        raise SystemExit(f"run dir not found: {run_dir}")

    model_dirs = []
    for pth in sorted(run_dir.iterdir()):
        if not pth.is_dir():
            continue
        if args.only_model and pth.name != args.only_model:
            continue
        if (pth / "samples.jsonl").exists():
            model_dirs.append(pth)

    if not model_dirs:
        print(f"[info] no per-model samples.jsonl under {run_dir}")
        return

    grand_total = 0
    grand_updated = 0
    for md in model_dirs:
        sf = md / "samples.jsonl"
        stats = process_file(sf, dry_run=args.dry_run)
        grand_total += stats["total"]
        grand_updated += stats["updated"]
        print(f"[topics] {sf} • rows={stats['total']} updated={stats['updated']}")

    print(f"[done] files={len(model_dirs)} rows={grand_total} updated={grand_updated}")


if __name__ == "__main__":
    main()

