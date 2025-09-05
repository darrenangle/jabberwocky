#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

import verifiers as vf
import logging

# Make environment importable even if not installed as a package
HERE = Path(__file__).resolve().parent
ENV_ROOT = HERE.parent  # environments/jabberwocky
if str(ENV_ROOT) not in sys.path:
    sys.path.insert(0, str(ENV_ROOT))
import jabberwocky as jw  # type: ignore


def build_argparser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser("Backfill missing judge outputs for Jabberwocky runs")
    p.add_argument("--run-dir", type=str, required=True, help="Path to run dir (e.g., docs/runs/run-mixed-50-minimal)")
    p.add_argument("--judge-model", type=str, default="gpt-4.1-mini")
    p.add_argument("--judge-base-url", type=str, default=None)
    p.add_argument("--judge-api-key", type=str, default=None, help="Set API key for judge; otherwise uses OPENAI_API_KEY")
    p.add_argument("--timeout", type=float, default=60.0, help="Judge timeout seconds")
    p.add_argument("--retry", type=int, default=2, help="Retries per sample on judge failure")
    p.add_argument("--sleep", type=float, default=0.5, help="Sleep seconds between judge calls to avoid rate limits")
    p.add_argument("--only-model", type=str, default=None, help="Slug of a single model dir to backfill (optional)")
    p.add_argument("--rebuild-aggregate", action="store_true", help="After backfilling per‑model files, rebuild all_samples.jsonl by concatenation")
    p.add_argument("--aggregate-only", action="store_true", help="Do not run the judge; just rebuild all_samples.jsonl from per‑model files")
    p.add_argument("--concurrency-files", type=int, default=max(1, (os.cpu_count() or 4) // 2))
    p.add_argument("--concurrency-rows", type=int, default=32)
    p.add_argument("--env-pool", type=int, default=1)
    p.add_argument("--qps", type=float, default=0.0)
    p.add_argument("--log-judge-debug", action="store_true", help="Log first ~300 chars of judge output for debugging")
    p.add_argument("--verbose", action="store_true", help="Verbose per-file progress + write info")
    return p


def load_judge_env(judge_model: str, base_url: str | None, api_key: str | None, timeout: float, log_debug: bool = False) -> vf.Environment:
    judge_kwargs: Dict[str, Any] = {}
    if base_url:
        judge_kwargs["judge_base_url"] = base_url
    if api_key:
        os.environ.setdefault("JUDGE_API_KEY_CLI", api_key)
        judge_kwargs["judge_api_key_var"] = "JUDGE_API_KEY_CLI"
    # IMPORTANT: call the local jabberwocky.load_environment to ensure we use the
    # repo's judge/rubric (not a possibly installed package variant).
    env = jw.load_environment(
        judge_model=judge_model,
        judge_base_url=base_url or "https://api.openai.com/v1",
        judge_api_key_var=judge_kwargs.get("judge_api_key_var", "OPENAI_API_KEY"),
        judge_timeout=timeout,
        eval_hint_profile="minimal",
        log_judge_debug=log_debug,
    )
    return env


def score_one(env: vf.Environment, prompt_text: str, poem_text: str) -> Tuple[float, Dict[str, float], str, str, int, str]:
    # Build state per sample so judge caches are isolated
    state: Dict[str, Any] = {}
    # The rubric stores reward funcs as (func, weight)
    metrics: Dict[str, float] = {}
    composite = None
    label = None

    # Compute composite first
    for f, w in env.rubric.reward_funcs:
        name = getattr(f, "__name__", "")
        try:
            v = f(prompt_text, poem_text, jw.JABBERWOCKY_TEXT, state)
        except Exception:
            v = 0.0
        if name == "composite_score":
            composite = float(v)
        else:
            metrics[name] = float(v)

    # Derive label from label_* metrics if present
    if metrics.get("label_high", 0) >= 0.5:
        label = "high"
    elif metrics.get("label_medium", 0) >= 0.5:
        label = "medium"
    elif metrics.get("label_low", 0) >= 0.5:
        label = "low"
    elif metrics.get("label_very_low", 0) >= 0.5:
        label = "very_low"
    else:
        label = "unknown"

    # Criteria yes count
    criteria_yes = sum(1 for k, v in metrics.items() if k.startswith("C") and v >= 0.5)
    # Raw judge output and any captured error
    judge_raw = state.get("jw_judge_xml_raw", "")
    judge_err = state.get("jw_judge_error", "")
    # Fallbacks: if composite name was wrapped, try to grab from metrics
    if (composite is None) and ("composite_score" in metrics):
        composite = metrics.get("composite_score", 0.0)
    # Ensure an error marker for empty/parse failures
    if not judge_raw and not judge_err:
        judge_err = "empty_or_parse_failure"
    return float(composite or 0.0), metrics, judge_raw, label, criteria_yes, judge_err


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


def _needs_backfill(row: Dict[str, Any]) -> bool:
    if "__corrupt__" in row:
        return False
    has_reward = isinstance(row.get("reward"), (int, float)) and row.get("reward", 0) > 0
    has_metrics = isinstance(row.get("metrics"), dict) and len(row.get("metrics", {})) > 0
    has_raw = bool(row.get("judge_raw"))
    return not (has_reward and has_metrics and has_raw)


def _process_row(env: vf.Environment, limiter: RateLimiter | None, row: Dict[str, Any], retry: int, sleep: float) -> Tuple[Dict[str, Any], bool]:
    if "__corrupt__" in row:
        return row, False
    changed = False
    def _set_if_missing(k: str, v: Any) -> None:
        nonlocal changed
        if k in row:
            # Only mark changed if value actually differs
            if row.get(k) != v:
                row[k] = v
                changed = True
        else:
            row[k] = v
            changed = True
    need = _needs_backfill(row)
    if not need and row.get("label") and isinstance(row.get("criteria_yes"), int):
        return row, False
    prompt_text = row.get("prompt", "")
    poem_text = row.get("poem", "")
    attempt = 0
    reward = 0.0
    metrics: Dict[str, float] = {}
    judge_raw = ""
    label = None
    criteria_yes = 0
    judge_err = ""
    delay = sleep
    while attempt <= retry:
        try:
            if limiter is not None:
                limiter.acquire(1)
            reward, metrics, judge_raw, label, criteria_yes, judge_err = score_one(env, prompt_text, poem_text)
            if judge_raw or metrics:
                break
        except Exception:
            pass
        attempt += 1
        time.sleep(max(0.0, delay))
        delay *= 2
    has_reward = "reward" in row
    has_metrics = "metrics" in row and isinstance(row.get("metrics"), dict) and len(row.get("metrics", {})) > 0
    has_raw = ("judge_raw" in row) and bool(row.get("judge_raw"))
    if not has_reward:
        _set_if_missing("reward", float(reward or 0.0))
    if not has_metrics:
        _set_if_missing("metrics", metrics)
    if not has_raw:
        _set_if_missing("judge_raw", judge_raw)
    if row.get("label") in (None, "", "unknown") and label:
        _set_if_missing("label", label)
    if not isinstance(row.get("criteria_yes"), int):
        _set_if_missing("criteria_yes", int(criteria_yes or 0))
    if judge_err and row.get("judge_error") != judge_err:
        _set_if_missing("judge_error", judge_err)
    return row, changed


def backfill_file_parallel(envs: List[vf.Environment], path: Path, retry: int, sleep: float, concurrency_rows: int = 1, qps: float = 0.0, verbose: bool = False) -> Tuple[int, int, Dict[str, int]]:
    rows: List[Dict[str, Any]] = []
    changed = 0
    total = 0
    # Keep a copy of the original file text to detect true no-op writes
    try:
        original_text = path.read_text(encoding="utf-8")
    except Exception:
        original_text = ""
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
    for i, r in enumerate(rows):
        if "__corrupt__" in r:
            continue
        total += 1
        if _needs_backfill(r) or not r.get("label") or not isinstance(r.get("criteria_yes"), int):
            need_indices.append(i)

    if verbose:
        print(f"  need={len(need_indices)} (of {total} rows)")
    if concurrency_rows <= 1 or len(need_indices) <= 1:
        limiter = RateLimiter(qps, max(1, concurrency_rows)) if qps > 0 else None
        env = envs[0]
        for idx, i in enumerate(need_indices):
            rows[i], ch = _process_row(env, limiter, rows[i], retry, sleep)
            if ch:
                changed += 1
            err = rows[i].get("judge_error")
            if err:
                key = str(err)[:200]
                error_counter[key] = error_counter.get(key, 0) + 1
    else:
        limiter = RateLimiter(qps, max(1, concurrency_rows)) if qps > 0 else None
        def pick_env(idx: int) -> vf.Environment:
            return envs[idx % len(envs)]
        with ThreadPoolExecutor(max_workers=concurrency_rows) as ex:
            futs = {}
            for k, i in enumerate(need_indices):
                fut = ex.submit(_process_row, pick_env(k), limiter, rows[i], retry, sleep)
                futs[fut] = i
            for fut in as_completed(futs):
                i = futs[fut]
                try:
                    new_row, ch = fut.result()
                except Exception as e:
                    new_row = rows[i]
                    ch = False
                    new_row["judge_error"] = new_row.get("judge_error") or f"worker_error: {e}"
                rows[i] = new_row
                if ch:
                    changed += 1
                err = rows[i].get("judge_error")
                if err:
                    key = str(err)[:200]
                    error_counter[key] = error_counter.get(key, 0) + 1

    tmp = path.with_suffix(path.suffix + ".tmp")
    bak = path.with_suffix(path.suffix + ".bak")
    with open(tmp, "w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    if not bak.exists():
        try:
            path.replace(bak)
        except Exception:
            pass
    tmp.replace(path)
    # Post-write diff check
    try:
        new_text = path.read_text(encoding="utf-8")
    except Exception:
        new_text = ""
    if verbose:
        if original_text == new_text:
            print("  write: no-op (content identical)")
        else:
            print(f"  write: updated file (bytes {len(original_text)} -> {len(new_text)})")
    return total, changed, error_counter
def backfill_file(env: vf.Environment, path: Path, retry: int, sleep: float) -> Tuple[int, int]:
    # Read existing jsonl
    rows: List[Dict[str, Any]] = []
    changed = 0
    total = 0
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except Exception:
                rows.append({"__corrupt__": line})

    # Backfill
    for row in rows:
        if "__corrupt__" in row:
            continue
        total += 1
        has_reward = isinstance(row.get("reward"), (int, float)) and row.get("reward", 0) > 0
        has_metrics = isinstance(row.get("metrics"), dict) and len(row.get("metrics", {})) > 0
        has_raw = bool(row.get("judge_raw"))
        # Determine whether to skip
        if has_reward and has_metrics and has_raw:
            continue
        prompt_text = row.get("prompt", "")
        poem_text = row.get("poem", "")
        # Attempt retries
        attempt = 0
        reward = 0.0
        metrics: Dict[str, float] = {}
        judge_raw = ""
        label = None
        criteria_yes = 0
        delay = sleep
        while attempt <= retry:
            try:
                reward, metrics, judge_raw, label, criteria_yes, judge_err = score_one(env, prompt_text, poem_text)
                # Consider it success if we got a non-empty raw or some metrics
                if judge_raw or metrics:
                    break
            except Exception:
                pass
            attempt += 1
            time.sleep(max(0.0, delay))
            delay *= 2
        # Apply backfill fields without overwriting existing values
        if not has_reward:
            row["reward"] = reward
        if not has_metrics:
            row["metrics"] = metrics
        if not has_raw:
            row["judge_raw"] = judge_raw
        if row.get("label") in (None, "", "unknown") and label:
            row["label"] = label
        if not isinstance(row.get("criteria_yes"), int):
            row["criteria_yes"] = criteria_yes
        if judge_err and not row.get("judge_error"):
            row["judge_error"] = judge_err
        changed += 1

    # Write to tmp then atomically replace
    tmp = path.with_suffix(path.suffix + ".tmp")
    bak = path.with_suffix(path.suffix + ".bak")
    with open(tmp, "w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    # Backup original once
    if not bak.exists():
        try:
            path.replace(bak)
        except Exception:
            pass
    tmp.replace(path)
    return total, changed


def _load_model_meta(model_dir: Path) -> Dict[str, str]:
    meta: Dict[str, str] = {}
    sj = model_dir / "summary.json"
    try:
        if sj.exists():
            data = json.loads(sj.read_text(encoding="utf-8"))
            for k in ("id", "slug", "provider", "model"):
                if k in data:
                    meta[k] = str(data[k])
    except Exception:
        pass
    # Fallbacks
    meta.setdefault("slug", model_dir.name)
    return meta


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
            meta = _load_model_meta(md)
            with open(sf, "r", encoding="utf-8") as fi:
                for line in fi:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        row = json.loads(line)
                    except Exception:
                        continue
                    # Inject model metadata if missing
                    for k in ("model_id", "model_slug", "provider", "model"):
                        if k not in row:
                            if k == "model_id" and "id" in meta:
                                row[k] = meta.get("id")
                            elif k == "model_slug":
                                row[k] = meta.get("slug")
                            else:
                                row[k] = meta.get(k, row.get(k))
                    fo.write(json.dumps(row, ensure_ascii=False) + "\n")
                    written += 1
    if written > 0:
        if out.exists() and not bak.exists():
            try:
                out.replace(bak)
            except Exception:
                pass
        tmp.replace(out)
    else:
        # No data; remove tmp
        try:
            tmp.unlink(missing_ok=True)  # type: ignore[arg-type]
        except Exception:
            pass
    return written, out


def main():
    args = build_argparser().parse_args()
    if getattr(args, "log_judge_debug", False):
        logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")

    run_dir = Path(args.run_dir)
    if not run_dir.exists():
        print(f"[error] run dir not found: {run_dir}")
        sys.exit(1)

    # Prefer per-model samples.jsonl if present; else fall back to all_samples.jsonl
    model_dirs = []
    for p in run_dir.iterdir():
        if p.is_dir() and (p / "samples.jsonl").exists():
            if args.only_model and p.name != args.only_model:
                continue
            model_dirs.append(p)

    processed = 0
    changed = 0
    error_totals: Dict[str, int] = {}
    if model_dirs:
        # Aggregate-only mode: just rebuild the aggregate file and exit
        if args.aggregate_only:
            print("[aggregate] rebuilding all_samples.jsonl from per‑model files (aggregate-only mode)…")
            written, outp = rebuild_aggregate(run_dir, model_dirs)
            print(f"  wrote {written} rows to {outp}")
            print("[done] processed=0 updated=0")
            return

        def make_env() -> vf.Environment:
            return load_judge_env(args.judge_model, args.judge_base_url, args.judge_api_key, args.timeout, args.log_judge_debug)

        def backfill_one_model(md: Path) -> Tuple[Path, int, int, Dict[str, int]]:
            sf = md / "samples.jsonl"
            env_pool_size = args.env_pool if args.env_pool and args.env_pool > 0 else max(1, args.concurrency_rows)
            envs = [make_env() for _ in range(env_pool_size)]
            total, ch, errs = backfill_file_parallel(envs, sf, args.retry, args.sleep, args.concurrency_rows, args.qps, args.verbose)
            return sf, total, ch, errs

        to_process = sorted(model_dirs)
        if args.concurrency_files <= 1 or len(to_process) <= 1:
            for md in to_process:
                sf, total, ch, errs = backfill_one_model(md)
                print(f"[backfill] {sf}")
                print(f"  rows={total} updated={ch}")
                processed += total
                changed += ch
                for k, v in errs.items():
                    error_totals[k] = error_totals.get(k, 0) + v
        else:
            with ThreadPoolExecutor(max_workers=args.concurrency_files) as ex:
                futs = {ex.submit(backfill_one_model, md): md for md in to_process}
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
        if args.rebuild_aggregate:
            print("[aggregate] rebuilding all_samples.jsonl from per‑model files…")
            written, outp = rebuild_aggregate(run_dir, model_dirs)
            print(f"  wrote {written} rows to {outp}")
    else:
        # Fallback to all_samples.jsonl
        af = run_dir / "all_samples.jsonl"
        if not af.exists():
            print(f"[error] no per-model samples.jsonl and no all_samples.jsonl in {run_dir}")
            sys.exit(2)
        if args.aggregate_only:
            print("[error] --aggregate-only requires per‑model samples to rebuild; none found.")
            sys.exit(3)
        env_pool_size = args.env_pool if args.env_pool and args.env_pool > 0 else max(1, args.concurrency_rows)
        envs = [load_judge_env(args.judge_model, args.judge_base_url, args.judge_api_key, args.timeout, args.log_judge_debug) for _ in range(env_pool_size)]
        total, ch, errs = backfill_file_parallel(envs, af, args.retry, args.sleep, args.concurrency_rows, args.qps, args.verbose)
        print(f"[backfill] {af}")
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


if __name__ == "__main__":
    main()
