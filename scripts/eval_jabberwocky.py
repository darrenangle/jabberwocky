#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
import statistics as stats
from typing import Any, Dict, Optional, List, Tuple
import os
import re
import json as _json
from datetime import datetime

from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.text import Text

import verifiers as vf
from openai import OpenAI
try:
    # Ensure local import works when run as a script
    from actor_registry import ActorRegistry  # type: ignore
except Exception:  # pragma: no cover
    import sys as _sys
    _HERE = os.path.dirname(__file__)
    if _HERE not in _sys.path:
        _sys.path.append(_HERE)
    from actor_registry import ActorRegistry  # type: ignore

# Make the environment module available without requiring installation
import sys as _sys
from pathlib import Path as _Path
_ENV_ROOT = str(_Path(__file__).resolve().parents[1])  # environments/jabberwocky
if _ENV_ROOT not in _sys.path:
    _sys.path.insert(0, _ENV_ROOT)


def build_argparser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Evaluate jabberwocky environment")
    p.add_argument("-n", "--n", type=int, default=10, help="Num eval examples")
    p.add_argument("-r", "--rollouts", type=int, default=2, help="Rollouts per example")
    # Single actor model (back-compat). If --models is provided, this is ignored.
    p.add_argument("--actor-model", type=str, default="gpt-4.1-mini", help="Actor model id or registry alias (e.g., openrouter:anthropic/claude-3.5-sonnet)")
    # Multi-actor support
    p.add_argument("--models", type=str, nargs="*", default=None, help="Evaluate multiple models (aliases or provider:model specs)")
    p.add_argument("--judge-model", type=str, default="gpt-4.1-mini", help="Judge model id")
    p.add_argument("--stanzas-min", type=int, default=3, help="Min target stanzas")
    p.add_argument("--stanzas-max", type=int, default=5, help="Max target stanzas")
    p.add_argument("--hint-profile", type=str, default="medium", choices=["high", "medium", "minimal", "mixed", "heavy", "light"], help="Hint strength for dataset prompts (heavy→high, light→minimal)")
    p.add_argument("--eval-hint-profile", type=str, default="minimal", choices=["high", "medium", "minimal", "mixed", "heavy", "light"], help="Override hint strength for eval prompts (default minimal; heavy→high, light→minimal)")
    p.add_argument("--max-concurrent", type=int, default=16, help="Concurrent rollouts")
    p.add_argument("--topics", type=str, nargs="*", default=None, help="List of topics for prompts")
    p.add_argument("-p", "--print-samples", type=int, default=2, help="How many samples to print")
    p.add_argument("--dump-json", type=str, default=None, help="Optional path to write per-sample JSON lines")
    p.add_argument("--outdir", type=str, default=None, help="Output directory for per-model dumps and manifest (e.g., docs/runs/<run-name>)")
    p.add_argument("--run-name", type=str, default=None, help="Run name for manifest; defaults to timestamp if not provided")
    p.add_argument("--system-prompt-mode", type=str, default="neutral", choices=["always_style", "neutral"], help="Global system prompt bias")
    p.add_argument("--no-eval-force-style", action="store_true", help="Allow non-Jabberwocky prompts in eval (not recommended)")
    # Judge tuning flags removed; environment uses robust defaults (timeout=60s)
    p.add_argument("--show-system", action="store_true", help="Print system prompt for samples")
    # Actor endpoint overrides (OpenAI-compatible)
    p.add_argument("--actor-base-url", type=str, default=None, help="Actor OpenAI-compatible base URL (e.g., https://api.groq.com/openai/v1)")
    p.add_argument("--actor-api-key", type=str, default=None, help="Actor API key (or set via env)")
    p.add_argument("--actor-provider", type=str, default=None, choices=["openai", "groq", "openrouter", "vllm"], help="Force provider for single model without registry alias")
    p.add_argument("--actor-registry", type=str, default=None, help="Path to registry file (.toml or .json) for providers/models")
    p.add_argument("--openrouter-http-referer", type=str, default=None, help="Optional OpenRouter HTTP-Referer header")
    p.add_argument("--openrouter-x-title", type=str, default=None, help="Optional OpenRouter X-Title header")
    # Optional judge endpoint overrides
    p.add_argument("--judge-base-url", type=str, default=None, help="Judge OpenAI-compatible base URL (default: OpenAI)")
    p.add_argument("--judge-api-key", type=str, default=None, help="Judge API key (or set via env OPENAI_API_KEY)")
    p.add_argument("--seed", type=int, default=777, help="Seed for topic sampling (ensures same dataset across models)")
    p.add_argument("--parallel-models", type=int, default=1, help="Evaluate up to N models in parallel (use with care)")
    # Actor sampling overrides
    p.add_argument("--actor-max-tokens", type=int, default=None, help="Override actor max_tokens (temperature is never set)")
    return p


def mean(xs: list[float]) -> float:
    return float(stats.mean(xs)) if xs else 0.0


def _derive_label_for_i(metrics: Dict[str, list[float]], i: int) -> Optional[str]:
    if "label_high" in metrics:
        if metrics.get("label_high", [0])[i] >= 0.5:
            return "high"
        if metrics.get("label_medium", [0])[i] >= 0.5:
            return "medium"
        if metrics.get("label_low", [0])[i] >= 0.5:
            return "low"
        if metrics.get("label_very_low", [0])[i] >= 0.5:
            return "very_low"
    return None


def summarize(results: vf.GenerateOutputs, print_samples: int = 2) -> Dict[str, Any]:
    # Overall reward
    overall = mean(results.reward)
    # Per-metric
    metrics_mean = {k: mean(v) for k, v in results.metrics.items()}
    # Extract judge labels from composite metrics if available
    label_counts: Dict[str, int] = {"very_low": 0, "low": 0, "medium": 0, "high": 0}
    # Prefer explicit label_* metrics if present
    if "label_high" in results.metrics:
        n = len(results.prompt)
        for i in range(n):
            if results.metrics.get("label_high", [0]*n)[i] >= 0.5:
                label_counts["high"] += 1
            elif results.metrics.get("label_medium", [0]*n)[i] >= 0.5:
                label_counts["medium"] += 1
            elif results.metrics.get("label_low", [0]*n)[i] >= 0.5:
                label_counts["low"] += 1
            elif results.metrics.get("label_very_low", [0]*n)[i] >= 0.5:
                label_counts["very_low"] += 1
    else:
        # Fallback to none
        pass

    console = Console()
    table = Table(title="Jabberwocky Evaluation Summary", expand=True)
    table.add_column("Metric", style="bold cyan")
    table.add_column("Value", style="white")
    table.add_row("overall_reward", f"{overall:.3f}")
    # label counts compact
    lc_str = ", ".join([f"{k}:{v}" for k, v in label_counts.items() if v]) or "(none)"
    table.add_row("labels", lc_str)

    # show top criteria frequencies (up to 6)
    crit_items = [(k, v) for k, v in metrics_mean.items() if k.startswith("C")]
    crit_items.sort(key=lambda kv: kv[1], reverse=True)
    top = crit_items[:6]
    if top:
        top_str = ", ".join(
            [f"{k.replace('_',' ').split(' ',1)[1] if '_' in k else k}:{v:.2f}" for k, v in top]
        )
        table.add_row("top_criteria", top_str)

    console.print(table)

    # Sample blocks
    nshow = min(print_samples, len(results.prompt))
    for i in range(nshow):
        # prompt
        prm = results.prompt[i]
        if isinstance(prm, list) and prm:
            user = next((m for m in prm[::-1] if m.get("role") == "user"), None)
            prompt_text = user.get("content") if user else str(prm)
        else:
            prompt_text = str(prm)
        topic = None
        inf = results.info[i] or {}
        if isinstance(inf, dict):
            topic = inf.get("topic")

        # completion
        cpl = results.completion[i]
        if isinstance(cpl, list) and cpl:
            last_assist = next((m for m in cpl[::-1] if m.get("role") == "assistant"), None)
            poem = last_assist.get("content") if last_assist else str(cpl)
        else:
            poem = str(cpl)

        reward = results.reward[i]
        label = _derive_label_for_i(results.metrics, i) or "—"
        # criteria yes count
        c_yes = 0
        for k, arr in results.metrics.items():
            if k.startswith("C") and i < len(arr):
                try:
                    if arr[i] >= 0.5:
                        c_yes += 1
                except Exception:
                    pass

        header = f"Sample {i+1} • reward {reward:.3f} • label {label} • criteria {c_yes}/18"
        if topic:
            header += f" • topic: {topic}"

        meta = Text(prompt_text or "", style="dim")
        poem_panel = Panel.fit(Text(poem), title="Poem", border_style="green")
        console.rule(header)
        console.print(Panel(meta, title="Prompt", border_style="cyan"))
        console.print(poem_panel)

    # Print a few samples
    for i in range(min(print_samples, len(results.prompt))):
        prompt = results.prompt[i]
        completion = results.completion[i]
        info = results.info[i]
        reward = results.reward[i]
        metric_i = {k: results.metrics[k][i] for k in results.metrics}

        if isinstance(prompt, list) and prompt:
            user = next((m for m in prompt[::-1] if m.get("role") == "user"), None)
            prompt_text = user.get("content") if user else str(prompt)
        else:
            prompt_text = str(prompt)

        # completion may be list[ChatMessage]
        if isinstance(completion, list) and completion:
            last_assist = next((m for m in completion[::-1] if m.get("role") == "assistant"), None)
            completion_text = last_assist.get("content") if last_assist else str(completion)
        else:
            completion_text = str(completion)

        print("\n--- Sample", i + 1, "---")
        print("Prompt:")
        print(prompt_text)
        print("\nPoem:")
        print(completion_text)
        print("\nInfo:", info)
        print("Reward:", reward)
        print("Metrics:", json.dumps(metric_i, indent=2))

        # Debug: show judge raw and parsed C-criteria per-sample
        st = results.state[i]
        raw = None
        if isinstance(st, dict):
            raw = st.get("jw_judge_xml_raw") or st.get("judge_xml_raw") or st.get("judge_response") or st.get("judge_json_last")
        if raw:
            raw_str = raw if isinstance(raw, str) else str(raw)
            print("\n[Judge raw excerpt]\n" + raw_str[:600])
        # Show which criteria were marked yes (>=0.5)
        c_yes = []
        c_all = sorted([k for k in results.metrics.keys() if k.startswith("C")])
        for k in c_all:
            try:
                if results.metrics[k][i] >= 0.5:
                    c_yes.append(k)
            except Exception:
                pass
        print("[Criteria yes]", c_yes, "| count:", len(c_yes))

    # Return a compact dict for cross-model aggregation
    return {
        "overall_reward": overall,
        "label_counts": label_counts,
        "metrics_mean": metrics_mean,
    }


def _make_actor_client(cfg) -> OpenAI:
    # Build OpenAI-compatible client with default headers if provided
    # Note: verifiers expects non-streaming OpenAI-compatible client
    kwargs: Dict[str, Any] = {"base_url": cfg.base_url}
    if cfg.api_key:
        kwargs["api_key"] = cfg.api_key
    if cfg.default_headers:
        kwargs["default_headers"] = cfg.default_headers
    try:
        return OpenAI(**kwargs)
    except TypeError:
        # Older SDKs may not support default_headers; retry without
        kwargs.pop("default_headers", None)
        return OpenAI(**kwargs)


def _safe_slug(s: str) -> str:
    s = s.strip()
    s = s.replace("/", "-").replace(":", "-")
    s = re.sub(r"[^a-zA-Z0-9_.-]+", "_", s)
    return s.strip("_.-")


def _dump_per_model(outdir: str, spec: str, cfg, results: vf.GenerateOutputs, summary: Dict[str, Any]):
    os.makedirs(outdir, exist_ok=True)
    model_dir = os.path.join(outdir, _safe_slug(spec))
    os.makedirs(model_dir, exist_ok=True)

    # Write summary.json
    summ = dict(summary)
    summ.update({
        "spec": spec,
        "provider": cfg.provider,
        "model": cfg.model,
        "num_samples": len(results.prompt),
    })
    with open(os.path.join(model_dir, "summary.json"), "w", encoding="utf-8") as f:
        f.write(_json.dumps(summ, ensure_ascii=False, indent=2))

    # Write samples.jsonl
    with open(os.path.join(model_dir, "samples.jsonl"), "w", encoding="utf-8") as f:
        n = len(results.prompt)
        for i in range(n):
            prm = results.prompt[i]
            cpl = results.completion[i]
            info = results.info[i]
            reward = results.reward[i]
            metric_i = {k: results.metrics[k][i] for k in results.metrics}

            if isinstance(prm, list) and prm:
                user = next((m for m in prm[::-1] if m.get("role") == "user"), None)
                prompt_text = user.get("content") if user else str(prm)
            else:
                prompt_text = str(prm)

            if isinstance(cpl, list) and cpl:
                last_assist = next((m for m in cpl[::-1] if m.get("role") == "assistant"), None)
                completion_text = last_assist.get("content") if last_assist else str(cpl)
            else:
                completion_text = str(cpl)

            # derive label
            label = None
            if metric_i.get("label_high", 0) >= 0.5:
                label = "high"
            elif metric_i.get("label_medium", 0) >= 0.5:
                label = "medium"
            elif metric_i.get("label_low", 0) >= 0.5:
                label = "low"
            elif metric_i.get("label_very_low", 0) >= 0.5:
                label = "very_low"

            # criteria yes count
            criteria_yes = 0
            for k, v in metric_i.items():
                if k.startswith("C"):
                    try:
                        if float(v) >= 0.5:
                            criteria_yes += 1
                    except Exception:
                        pass

            row = {
                "i": i,
                "prompt": prompt_text,
                "poem": completion_text,
                "info": info,
                "reward": reward,
                "label": label,
                "criteria_yes": criteria_yes,
                "metrics": metric_i,
            }
            f.write(_json.dumps(row, ensure_ascii=False) + "\n")


def main():
    args = build_argparser().parse_args()

    # Load env (requires module installed: uv pip install -e environments/jabberwocky)
    # Build environment (judge lives inside the env)
    judge_kwargs = {}
    if args.judge_base_url:
        judge_kwargs["judge_base_url"] = args.judge_base_url
    if args.judge_api_key:
        import os as _os
        _os.environ.setdefault("JUDGE_API_KEY_CLI", args.judge_api_key)
        judge_kwargs["judge_api_key_var"] = "JUDGE_API_KEY_CLI"

    env = vf.load_environment(
        "jabberwocky",
        judge_model=args.judge_model,
        target_stanzas_min=args.stanzas_min,
        target_stanzas_max=args.stanzas_max,
        topics=args.topics,
        hint_profile=args.hint_profile,
        eval_hint_profile=args.eval_hint_profile,
        system_prompt_mode=args.system_prompt_mode,
        eval_force_style=(not args.no_eval_force_style),
        seed=args.seed,
        **judge_kwargs,
    )

    # Apply actor max_tokens override only (we never set temperature)
    if hasattr(env, 'sampling_args') and isinstance(env.sampling_args, dict):
        sa = dict(env.sampling_args)
        # Ensure no lingering temperature key
        sa.pop('temperature', None)
        if args.actor_max_tokens is not None:
            sa['max_tokens'] = int(args.actor_max_tokens)
        env.sampling_args = sa

    # Build registry and load optional file
    reg = ActorRegistry()
    if args.actor_registry:
        reg.load_file(args.actor_registry)

    # Resolve models list
    models: List[str] = args.models if args.models else [args.actor_model]

    # Per-provider default headers from CLI (OpenRouter extras)
    openrouter_hdrs: Dict[str, str] = {}
    if args.openrouter_http_referer:
        openrouter_hdrs["HTTP-Referer"] = args.openrouter_http_referer
    if args.openrouter_x_title:
        openrouter_hdrs["X-Title"] = args.openrouter_x_title

    # Resolve all ActorConfigs up-front
    actor_cfgs: List[Tuple[str, Any]] = []
    for spec in models:
        cfg = reg.resolve(
            spec,
            base_url=args.actor_base_url,
            api_key=args.actor_api_key,
            provider=args.actor_provider,
            default_headers=openrouter_hdrs if (args.actor_provider == "openrouter" or spec.startswith("openrouter:")) else None,
        )
        # Pre-flight key check for OpenRouter to avoid 401 spam
        if cfg.provider == 'openrouter' and not cfg.api_key:
            print(f"[skip] {spec}: OPENROUTER_API_KEY not set; skipping.")
            continue
        actor_cfgs.append((spec, cfg))

    # Optionally evaluate multiple models in parallel (coarse-grained). Default sequential.
    from concurrent.futures import ThreadPoolExecutor, as_completed

    def _run_one(spec: str, cfg) -> Tuple[str, vf.GenerateOutputs, Dict[str, Any]]:
        client = _make_actor_client(cfg)
        # First attempt
        def run_eval():
            return env.evaluate(
                client=client,
                model=cfg.model,
                num_examples=args.n,
                rollouts_per_example=args.rollouts,
                max_concurrent=args.max_concurrent,
            )
        results = run_eval()
        summary = summarize(results, print_samples=args.print_samples)
        # Optional dumping per-model
        if args.outdir:
            _dump_per_model(args.outdir, spec, cfg, results, summary)
        return spec, results, summary

    summaries: List[Tuple[str, Dict[str, Any]]] = []
    if len(actor_cfgs) == 1 or args.parallel_models <= 1:
        for spec, cfg in actor_cfgs:
            _, _, summ = _run_one(spec, cfg)
            summaries.append((spec, summ))
    else:
        with ThreadPoolExecutor(max_workers=args.parallel_models) as ex:
            futs = {ex.submit(_run_one, spec, cfg): (spec, cfg) for spec, cfg in actor_cfgs}
            for fut in as_completed(futs):
                spec, _cfg = futs[fut]
                try:
                    _spec, _res, summ = fut.result()
                    summaries.append((spec, summ))
                except Exception as e:
                    print(f"[error] model {spec}: {e}")

    # Aggregate summary across models
    if len(summaries) > 1:
        from rich.console import Console
        from rich.table import Table
        console = Console()
        tab = Table(title="Cross-Model Summary", expand=True)
        tab.add_column("Model", style="bold white")
        tab.add_column("Provider", style="cyan")
        tab.add_column("Reward", style="bold green", justify="right")
        tab.add_column("Labels", style="white")
        # Compose rows from actor_cfgs to preserve order
        for spec, cfg in actor_cfgs:
            row = next((s for s in summaries if s[0] == spec), None)
            if not row:
                continue
            summ = row[1]
            labels = summ.get("label_counts", {})
            label_str = ", ".join([f"{k}:{v}" for k, v in labels.items() if v]) or "(none)"
            tab.add_row(spec, cfg.provider, f"{summ.get('overall_reward', 0.0):.3f}", label_str)
        console.print(tab)

    # Legacy single-file dump for back-compat (only when single model and no outdir)
    if args.dump_json and not args.outdir and len(actor_cfgs) == 1:
        spec, cfg = actor_cfgs[0]
        # re-run minimal pack for single dump
        client = _make_actor_client(cfg)
        results = env.evaluate(
            client=client,
            model=cfg.model,
            num_examples=args.n,
            rollouts_per_example=args.rollouts,
            max_concurrent=args.max_concurrent,
        )
        with open(args.dump_json, "w", encoding="utf-8") as f:
            n = len(results.prompt)
            for i in range(n):
                prm = results.prompt[i]
                cpl = results.completion[i]
                info = results.info[i]
                reward = results.reward[i]
                metric_i = {k: results.metrics[k][i] for k in results.metrics}
                if isinstance(prm, list) and prm:
                    user = next((m for m in prm[::-1] if m.get("role") == "user"), None)
                    prompt_text = user.get("content") if user else str(prm)
                else:
                    prompt_text = str(prm)
                if isinstance(cpl, list) and cpl:
                    last_assist = next((m for m in cpl[::-1] if m.get("role") == "assistant"), None)
                    completion_text = last_assist.get("content") if last_assist else str(cpl)
                else:
                    completion_text = str(cpl)
                row = {
                    "i": i,
                    "prompt": prompt_text,
                    "poem": completion_text,
                    "info": info,
                    "reward": reward,
                    "metrics": metric_i,
                }
                f.write(_json.dumps(row, ensure_ascii=False) + "\n")

    # If outdir specified, write a run-level manifest and models summary
    if args.outdir:
        os.makedirs(args.outdir, exist_ok=True)
        run_name = args.run_name or datetime.utcnow().strftime("run-%Y%m%dT%H%M%SZ")
        manifest = {
            "run_name": run_name,
            "created_utc": datetime.utcnow().isoformat() + "Z",
            "seed": args.seed,
            "num_examples": args.n,
            "rollouts_per_example": args.rollouts,
            "eval_hint_profile": args.eval_hint_profile,
            "system_prompt_mode": args.system_prompt_mode,
            "judge_model": args.judge_model,
            "actor_models": [],
            "models": [],
        }
        models_summary = []
        for spec, cfg in actor_cfgs:
            slug = _safe_slug(spec)
            # Find summary entry we captured earlier
            row = next((s for s in summaries if s[0] == spec), None)
            summ = row[1] if row else {}
            models_summary.append({
                "spec": spec,
                "provider": cfg.provider,
                "model": cfg.model,
                "summary": summ,
                "path": f"{slug}/",
            })
            manifest["actor_models"].append(spec)
            manifest["models"].append({
                "id": spec,
                "slug": slug,
                "provider": cfg.provider,
                "model": cfg.model,
                "summary_path": f"{slug}/summary.json",
                "samples_path": f"{slug}/samples.jsonl",
            })
        with open(os.path.join(args.outdir, "models_summary.json"), "w", encoding="utf-8") as f:
            f.write(_json.dumps(models_summary, ensure_ascii=False, indent=2))
        with open(os.path.join(args.outdir, "manifest.json"), "w", encoding="utf-8") as f:
            f.write(_json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
