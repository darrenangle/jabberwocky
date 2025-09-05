#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import re
from pathlib import Path
from typing import Any, Dict, List, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

# Local imports from this repo
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
import jabberwocky as jw  # type: ignore

try:
    from openai import OpenAI
except Exception as e:  # pragma: no cover
    print("[error] openai package not available:", e)
    sys.exit(1)


def build_argparser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser("Direct backfill of missing judge outputs (no verifiers)")
    p.add_argument("--run-dir", type=str, required=True, help="Path to run dir (e.g., docs/runs/run-mixed-50-minimal)")
    p.add_argument("--only-model", type=str, default=None, help="Limit to one model subdir (folder name)")
    p.add_argument("--judge-model", type=str, default="gpt-4.1-mini")
    p.add_argument("--judge-base-url", type=str, default="https://api.openai.com/v1")
    p.add_argument("--judge-api-key", type=str, default=None, help="API key for judge; else uses OPENAI_API_KEY env var")
    p.add_argument("--timeout", type=float, default=60.0)
    p.add_argument("--retry", type=int, default=2)
    p.add_argument("--sleep", type=float, default=0.5)
    p.add_argument("--concurrency-files", type=int, default=max(1, (os.cpu_count() or 4)//2))
    p.add_argument("--concurrency-rows", type=int, default=16)
    p.add_argument("--qps", type=float, default=0.0, help="Per-file QPS limit; 0 disables")
    p.add_argument("--verbose", action="store_true")
    p.add_argument("--rebuild-aggregate", action="store_true", help="Rebuild all_samples.jsonl after backfill")
    p.add_argument(
        "--recompute-from-existing-raw",
        action="store_true",
        help="Recompute metrics/label/reward from existing judge_raw without calling the API",
    )
    p.add_argument(
        "--rejudge-existing",
        action="store_true",
        help="Re-call the judge and overwrite existing judge_raw/metrics/reward/label for all rows",
    )
    p.add_argument(
        "--recompute-summaries",
        action="store_true",
        help="Recompute per-model summary.json, models_summary.json, and all_samples.jsonl",
    )
    return p


class RateLimiter:
    def __init__(self, rate: float, burst: int):
        self.rate = float(rate)
        self.capacity = int(max(1, burst))
        self.tokens = float(self.capacity)
        self.last = time.monotonic()
        self.lock = threading.Lock()

    def acquire(self, tokens: int = 1) -> None:
        if self.rate <= 0:
            return
        need = float(max(1, tokens))
        while True:
            with self.lock:
                now = time.monotonic()
                delta = now - self.last
                self.tokens = min(self.capacity, self.tokens + delta * self.rate)
                self.last = now
                if self.tokens >= need:
                    self.tokens -= need
                    return
                missing = need - self.tokens
                wait = missing / self.rate
            time.sleep(wait)


RUBRIC_KEYS = jw.RUBRIC_KEYS
RUBRIC_SHORT = jw.RUBRIC_SHORT


def extract_topic_from_prompt(prompt: str) -> str:
    patterns = [r"about\s+(.+?)\s+in the style", r"on\s+(.+?)\s+in the style", r"about\s+(.+?)\s*\."]
    for pat in patterns:
        m = re.search(pat, prompt, flags=re.IGNORECASE)
        if m:
            return m.group(1).strip()
    return ""


def make_judge_prompt(topic: str, poem_text: str) -> str:
    header = jw.build_judge_xml_prompt()
    return (
        header
        + "<topic>\n" + topic + "\n</topic>\n\n"
        + "<reference_poem>\n" + jw.JABBERWOCKY_TEXT + "\n</reference_poem>\n\n"
        + "<model_poem>\n" + poem_text + "\n</model_poem>\n"
    )


def parse_decisions(xml_text: str) -> Dict[str, int]:
    # Normalize tolerant tags like < C1 >yes</ C1 >
    t = re.sub(r"<\s*/\s*([A-Za-z0-9_]+)\s*>", r"</\1>", xml_text)
    t = re.sub(r"<\s*([A-Za-z0-9_]+)\s*>", r"<\1>", t)
    out: Dict[str, int] = {}
    for i, key in enumerate(RUBRIC_KEYS):
        short = RUBRIC_SHORT[i]
        bit = 0
        # Prefer descriptive key tag, fallback to short tag
        m = re.search(fr"<{key}>(yes|no)</{key}>", t, flags=re.IGNORECASE)
        if not m:
            m = re.search(fr"<{short}>(yes|no)</{short}>", t, flags=re.IGNORECASE)
        if m:
            bit = 1 if m.group(1).lower() == "yes" else 0
        out[key] = bit
    return out


def label_from_ratio(ratio: float) -> str:
    if ratio >= 0.83:
        return "high"
    if ratio >= 0.56:
        return "medium"
    if ratio >= 0.33:
        return "low"
    return "very_low"


def needs_backfill(row: Dict[str, Any]) -> bool:
    if "__corrupt__" in row:
        return False
    has_reward = "reward" in row
    has_metrics = isinstance(row.get("metrics"), dict) and len(row.get("metrics", {})) > 0
    has_raw = bool(row.get("judge_raw"))
    return not (has_reward and has_metrics and has_raw)


def call_judge(client: OpenAI, model: str, base_timeout: float, prompt_text: str) -> Tuple[str, str]:
    err = ""
    try:
        jr = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt_text}],
            timeout=base_timeout,
        )
        txt = str(jr.choices[0].message.content or "")
        if not txt:
            err = "empty_response"
        return txt, err
    except Exception as e:
        return "", f"exception: {type(e).__name__}: {e}"


def process_row(
    client: OpenAI,
    model: str,
    timeout: float,
    limiter: RateLimiter | None,
    row: Dict[str, Any],
    retry: int,
    sleep: float,
    recompute_from_existing_raw: bool = False,
    rejudge_existing: bool = False,
) -> Tuple[Dict[str, Any], bool]:
    if "__corrupt__" in row:
        return row, False
    changed = False

    # Fast path: If recompute mode is on and we already have judge_raw, rebuild scores from it.
    if recompute_from_existing_raw and row.get("judge_raw") and not rejudge_existing:
        jr = str(row.get("judge_raw") or "")
        decisions = parse_decisions(jr)
        yes_count = sum(1 for v in decisions.values() if v)
        total = len(RUBRIC_KEYS) or 1
        reward = yes_count / total
        label_new = label_from_ratio(reward)
        metrics: Dict[str, float] = {"composite_score": reward}
        for k, v in decisions.items():
            metrics[k] = float(v)
        metrics["label_high"] = 1.0 if label_new == "high" else 0.0
        metrics["label_medium"] = 1.0 if label_new == "medium" else 0.0
        metrics["label_low"] = 1.0 if label_new == "low" else 0.0
        metrics["label_very_low"] = 1.0 if label_new == "very_low" else 0.0
        row["metrics"] = metrics
        row["reward"] = reward
        row["criteria_yes"] = yes_count
        row["label"] = label_new
        return row, True

    if not rejudge_existing and not needs_backfill(row) and row.get("label") and isinstance(row.get("criteria_yes"), int):
        return row, False

    prompt_text = str(row.get("prompt", ""))
    poem_text = str(row.get("poem", ""))
    topic = extract_topic_from_prompt(prompt_text)
    judge_prompt = make_judge_prompt(topic, poem_text)

    attempt = 0
    judge_raw = ""
    judge_err = ""
    had_raw_before = bool(row.get("judge_raw"))
    while attempt <= retry:
        if limiter is not None:
            limiter.acquire(1)
        txt, err = call_judge(client, model, timeout, judge_prompt)
        judge_raw = txt
        judge_err = err
        if judge_raw:
            break
        attempt += 1
        time.sleep(max(0.0, sleep * (2 ** (attempt - 1))))

    metrics: Dict[str, float] = {}
    reward = 0.0
    label = row.get("label") or None
    criteria_yes = 0

    if judge_raw:
        decisions = parse_decisions(judge_raw)
        yes_count = sum(1 for v in decisions.values() if v)
        total = len(RUBRIC_KEYS) or 1
        reward = yes_count / total
        criteria_yes = yes_count
        label = label_from_ratio(reward)
        metrics["composite_score"] = reward
        for k, v in decisions.items():
            metrics[k] = float(v)
        metrics["label_high"] = 1.0 if label == "high" else 0.0
        metrics["label_medium"] = 1.0 if label == "medium" else 0.0
        metrics["label_low"] = 1.0 if label == "low" else 0.0
        metrics["label_very_low"] = 1.0 if label == "very_low" else 0.0

        # Overwrite if rejudging existing or if we just added new judge_raw
        if rejudge_existing or not had_raw_before:
            row["judge_raw"] = judge_raw
            row["metrics"] = metrics
            row["reward"] = reward
            row["criteria_yes"] = criteria_yes
            if label:
                row["label"] = label
            changed = True

    # Fill only missing fields or differing values
    def set_if_missing(k: str, v: Any):
        nonlocal changed
        if k in row:
            if row.get(k) != v:
                row[k] = v
                changed = True
        else:
            row[k] = v
            changed = True

    # For rows that already had judge_raw (or if judge didn't return), only fill genuinely missing fields.
    if judge_raw and had_raw_before and not rejudge_existing:
        set_if_missing("judge_raw", judge_raw)
    if metrics and not (isinstance(row.get("metrics"), dict) and len(row.get("metrics", {})) > 0):
        set_if_missing("metrics", metrics)
    if ("reward" not in row) and reward:
        set_if_missing("reward", reward)
    if (not isinstance(row.get("criteria_yes"), int)) and criteria_yes:
        set_if_missing("criteria_yes", criteria_yes)
    if (row.get("label") in (None, "", "unknown")) and label:
        set_if_missing("label", label)
    if judge_err and row.get("judge_error") != judge_err:
        set_if_missing("judge_error", judge_err)
    return row, changed


def backfill_file(path: Path, client: OpenAI, model: str, timeout: float, retry: int, sleep: float, concurrency_rows: int, qps: float, verbose: bool, recompute_from_existing_raw: bool, rejudge_existing: bool = False) -> Tuple[int, int, Dict[str, int]]:
    rows: List[Dict[str, Any]] = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except Exception:
                rows.append({"__corrupt__": line})

    error_counter: Dict[str, int] = {}
    need_indices: List[int] = []
    total = 0
    for i, r in enumerate(rows):
        if "__corrupt__" in r:
            continue
        total += 1
        if needs_backfill(r) or (recompute_from_existing_raw and r.get("judge_raw")) or rejudge_existing:
            need_indices.append(i)
    if verbose:
        print(f"  need={len(need_indices)} (of {total} rows)")

    changed = 0
    limiter = RateLimiter(qps, max(1, concurrency_rows)) if qps > 0 else None

    if concurrency_rows <= 1 or len(need_indices) <= 1:
        for i in need_indices:
            new_row, ch = process_row(client, model, timeout, limiter, rows[i], retry, sleep, recompute_from_existing_raw, rejudge_existing)
            rows[i] = new_row
            if ch:
                changed += 1
            if new_row.get("judge_error"):
                key = str(new_row.get("judge_error"))[:200]
                error_counter[key] = error_counter.get(key, 0) + 1
    else:
        with ThreadPoolExecutor(max_workers=concurrency_rows) as ex:
            futs = {}
            for i in need_indices:
                futs[ex.submit(process_row, client, model, timeout, limiter, rows[i], retry, sleep, recompute_from_existing_raw, rejudge_existing)] = i
            for fut in as_completed(futs):
                i = futs[fut]
                try:
                    new_row, ch = fut.result()
                except Exception as e:
                    new_row, ch = rows[i], False
                    new_row["judge_error"] = new_row.get("judge_error") or f"worker_error: {e}"
                rows[i] = new_row
                if ch:
                    changed += 1
                if new_row.get("judge_error"):
                    key = str(new_row.get("judge_error"))[:200]
                    error_counter[key] = error_counter.get(key, 0) + 1

    # Write back if anything changed
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
    return total, changed, error_counter


def rebuild_aggregate(run_dir: Path, model_dirs: List[Path]) -> Tuple[int, Path]:
    out = run_dir / "all_samples.jsonl"
    tmp = out.with_suffix(out.suffix + ".tmp")
    bak = out.with_suffix(out.suffix + ".bak")
    written = 0
    with open(tmp, "w", encoding="utf-8") as fo:
        for md in sorted(model_dirs, key=lambda p: p.name):
            sf = md / "samples.jsonl"
            if not sf.exists():
                continue
            try:
                with open(sf, "r", encoding="utf-8") as fi:
                    for line in fi:
                        line = line.strip()
                        if not line:
                            continue
                        fo.write(line + "\n")
                        written += 1
            except Exception:
                continue
    if written > 0:
        if out.exists() and not bak.exists():
            try:
                out.replace(bak)
            except Exception:
                pass
        tmp.replace(out)
    else:
        try:
            tmp.unlink(missing_ok=True)  # type: ignore[arg-type]
        except Exception:
            pass
    return written, out


def compute_model_summary(samples_path: Path, manifest_entry: Dict[str, Any] | None = None) -> Dict[str, Any]:
    overall_rewards: List[float] = []
    label_counts: Dict[str, int] = {"very_low": 0, "low": 0, "medium": 0, "high": 0}
    metric_sums: Dict[str, float] = {}
    metric_counts: Dict[str, int] = {}
    n = 0
    with open(samples_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except Exception:
                continue
            n += 1
            r = float(row.get("reward") or 0.0)
            overall_rewards.append(r)
            lab = str(row.get("label") or "").lower()
            if lab in label_counts:
                label_counts[lab] += 1
            metrics = row.get("metrics") or {}
            if isinstance(metrics, dict):
                for k, v in metrics.items():
                    try:
                        x = float(v)
                    except Exception:
                        continue
                    metric_sums[k] = metric_sums.get(k, 0.0) + x
                    metric_counts[k] = metric_counts.get(k, 0) + 1
    sum_reward = sum(overall_rewards)
    overall_reward = sum_reward / len(overall_rewards) if overall_rewards else 0.0
    metrics_mean = {k: (metric_sums[k] / max(1, metric_counts.get(k, 1))) for k in metric_sums.keys()}
    out = {
        "overall_reward": overall_reward,
        "label_counts": label_counts,
        "metrics_mean": metrics_mean,
        # New scoring: sum of per-poem points with 100 points per perfect poem (max 5000 for 50 poems)
        "total_score": round(sum_reward * 100),
    }
    if manifest_entry:
        out.update({
            "spec": manifest_entry.get("id") or manifest_entry.get("slug"),
            "provider": manifest_entry.get("provider"),
            "model": manifest_entry.get("model"),
            "num_samples": n,
        })
    else:
        out["num_samples"] = n
    return out


def rewrite_model_summary(model_dir: Path, manifest_entry: Dict[str, Any] | None) -> Tuple[Path, Dict[str, Any]]:
    samples_path = model_dir / "samples.jsonl"
    summary = compute_model_summary(samples_path, manifest_entry)
    # If manifest has provider/model, carry them
    if manifest_entry:
        summary.setdefault("spec", manifest_entry.get("id") or manifest_entry.get("slug") or model_dir.name)
        summary.setdefault("provider", manifest_entry.get("provider"))
        summary.setdefault("model", manifest_entry.get("model"))
    out_path = model_dir / "summary.json"
    tmp = out_path.with_suffix(out_path.suffix + ".tmp")
    bak = out_path.with_suffix(out_path.suffix + ".bak")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    if out_path.exists() and not bak.exists():
        try:
            out_path.replace(bak)
        except Exception:
            pass
    tmp.replace(out_path)
    return out_path, summary


def rebuild_models_summary(run_dir: Path, manifest: Dict[str, Any]) -> Tuple[int, Path]:
    out = run_dir / "models_summary.json"
    tmp = out.with_suffix(out.suffix + ".tmp")
    bak = out.with_suffix(out.suffix + ".bak")
    arr: List[Dict[str, Any]] = []
    for m in manifest.get("models", []):
        slug = m.get("slug") or m.get("id")
        if not slug:
            continue
        md = run_dir / slug
        sfile = md / "summary.json"
        if not sfile.exists():
            continue
        try:
            s = json.loads(sfile.read_text(encoding="utf-8"))
        except Exception:
            continue
        arr.append({
            "spec": m.get("id") or slug,
            "provider": m.get("provider"),
            "model": m.get("model"),
            "summary": {
                "overall_reward": s.get("overall_reward", 0.0),
                "label_counts": s.get("label_counts", {}),
                "metrics_mean": s.get("metrics_mean", {}),
                "total_score": s.get("total_score", None),
            },
            "path": f"{slug}/",
        })
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(arr, f, ensure_ascii=False, indent=2)
    if out.exists() and not bak.exists():
        try:
            out.replace(bak)
        except Exception:
            pass
    tmp.replace(out)
    return len(arr), out


def main():
    args = build_argparser().parse_args()

    run_dir = Path(args.run_dir)
    if not run_dir.exists():
        print(f"[error] run dir not found: {run_dir}")
        sys.exit(1)

    # Collect model subdirs
    model_dirs: List[Path] = []
    for p in run_dir.iterdir():
        if p.is_dir() and (p / "samples.jsonl").exists():
            if args.only_model and p.name != args.only_model:
                continue
            model_dirs.append(p)
    if not model_dirs:
        print(f"[error] no per-model samples.jsonl under {run_dir}")
        sys.exit(2)

    api_key = args.judge_api_key or os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("[error] missing OPENAI_API_KEY (or --judge-api-key)")
        sys.exit(3)

    processed = 0
    changed = 0
    error_totals: Dict[str, int] = {}

    manifest_path = run_dir / "manifest.json"
    manifest = {}
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except Exception:
            manifest = {}

    manifest_by_slug = { (m.get("slug") or m.get("id") or ""): m for m in manifest.get("models", []) }

    def work_one(md: Path) -> Tuple[Path, int, int, Dict[str, int]]:
        sf = md / "samples.jsonl"
        client = OpenAI(api_key=api_key, base_url=args.judge_base_url)
        total, ch, errs = backfill_file(
            sf,
            client,
            args.judge_model,
            args.timeout,
            args.retry,
            args.sleep,
            args.concurrency_rows,
            args.qps,
            args.verbose,
            args.recompute_from_existing_raw,
            args.rejudge_existing,
        )
        if args.recompute_summaries:
            manifest_entry = manifest_by_slug.get(md.name)
            rewrite_model_summary(md, manifest_entry)
        return sf, total, ch, errs

    # Parallel over files
    to_process = sorted(model_dirs)
    if args.concurrency_files <= 1 or len(to_process) <= 1:
        for md in to_process:
            sf, total, ch, errs = work_one(md)
            print(f"[backfill] {sf}")
            print(f"  rows={total} updated={ch}")
            processed += total
            changed += ch
            for k, v in errs.items():
                error_totals[k] = error_totals.get(k, 0) + v
    else:
        with ThreadPoolExecutor(max_workers=args.concurrency_files) as ex:
            futs = {ex.submit(work_one, md): md for md in to_process}
            for fut in as_completed(futs):
                md = futs[fut]
                try:
                    sf, total, ch, errs = fut.result()
                except Exception as e:
                    print(f"[backfill] {md / 'samples.jsonl'}")
                    print(f"  error: {e}")
                    continue
                print(f"[backfill] {sf}")
                print(f"  rows={total} updated={ch}")
                processed += total
                changed += ch
                for k, v in errs.items():
                    error_totals[k] = error_totals.get(k, 0) + v

    if error_totals:
        print("[errors] judge_error summary (top 10):")
        top = sorted(error_totals.items(), key=lambda kv: kv[1], reverse=True)[:10]
        for msg, cnt in top:
            print(f"  {cnt:4d}  {msg}")

    print(f"[done] processed={processed} updated={changed}")

    if args.rebuild_aggregate or args.recompute_summaries:
        written, outp = rebuild_aggregate(run_dir, model_dirs)
        print("[aggregate] rebuilt all_samples.jsonl")
        print(f"  wrote {written} rows to {outp}")
    if args.recompute_summaries:
        if not manifest:
            print("[warn] manifest.json missing; skipping models_summary.json rebuild")
        else:
            nitems, outp2 = rebuild_models_summary(run_dir, manifest)
            print("[summary] rebuilt models_summary.json")
            print(f"  wrote {nitems} model summaries to {outp2}")


if __name__ == "__main__":
    main()
