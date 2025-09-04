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
    # Timeout defaults: keep CLI simple; use env ACTOR_TIMEOUT_SECONDS if needed
    p.add_argument("--openrouter-http-referer", type=str, default=None, help="Optional OpenRouter HTTP-Referer header")
    p.add_argument("--openrouter-x-title", type=str, default=None, help="Optional OpenRouter X-Title header")
    # Convenience: load all OpenRouter/OpenAI models from registry
    p.add_argument("--all-openrouter", action="store_true", help="Evaluate all registry models with provider=openrouter (overrides --models/--actor-model)")
    p.add_argument("--all-openai", action="store_true", help="Evaluate all registry models with provider=openai (overrides --models/--actor-model)")
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
    # Overall reward (ignore empty poems)
    usable_rewards: list[float] = []
    n = len(results.prompt)
    for i in range(n):
        # completion may be list[ChatMessage]
        cpl = results.completion[i]
        if isinstance(cpl, list) and cpl:
            last_assist = next((m for m in cpl[::-1] if m.get("role") == "assistant"), None)
            poem = last_assist.get("content") if last_assist else str(cpl)
        else:
            poem = str(cpl)
        if isinstance(poem, str) and poem.strip():
            try:
                usable_rewards.append(float(results.reward[i]))
            except Exception:
                pass
    overall = mean(usable_rewards)
    # Per-metric
    metrics_mean = {k: mean(v) for k, v in results.metrics.items()}
    # Extract judge labels from composite metrics if available
    label_counts: Dict[str, int] = {"very_low": 0, "low": 0, "medium": 0, "high": 0}
    # Prefer explicit label_* metrics if present
    if "label_high" in results.metrics:
        n = len(results.prompt)
        for i in range(n):
            # Skip empty poems for label counting as well
            cpl = results.completion[i]
            if isinstance(cpl, list) and cpl:
                last_assist = next((m for m in cpl[::-1] if m.get("role") == "assistant"), None)
                poem_i = last_assist.get("content") if last_assist else str(cpl)
            else:
                poem_i = str(cpl)
            if not (isinstance(poem_i, str) and poem_i.strip()):
                continue
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


def _make_actor_client(cfg, timeout: float | None = None) -> OpenAI:
    # Build OpenAI-compatible client with default headers if provided
    # Note: verifiers expects non-streaming OpenAI-compatible client
    kwargs: Dict[str, Any] = {"base_url": cfg.base_url}
    if cfg.api_key:
        kwargs["api_key"] = cfg.api_key
    if cfg.default_headers:
        kwargs["default_headers"] = cfg.default_headers
    if timeout is not None:
        # OpenAI Python supports float seconds for default timeout
        kwargs["timeout"] = float(timeout)
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

    # We intentionally create an identical environment per model (inside _run_one)
    # to avoid any shared-state or concurrency effects. The parameters here are
    # captured in the closure and reused for each local clone.

    # Build registry and load optional file
    reg = ActorRegistry()
    if args.actor_registry:
        reg.load_file(args.actor_registry)

    # Resolve models list
    models: List[str]
    if args.all_openrouter or args.all_openai:
        wanted = set()
        provs = []
        if args.all_openrouter:
            provs.append("openrouter")
        if args.all_openai:
            provs.append("openai")
        try:
            for alias, entry in (reg.models or {}).items():
                if isinstance(entry, dict) and entry.get("provider") in provs:
                    wanted.add(alias)
        except Exception:
            pass
        models = sorted(wanted)
        if not models:
            raise RuntimeError("No registry models found for providers: " + ", ".join(provs))
        print(f"[info] selected {len(models)} models for providers: {', '.join(provs)}")
    else:
        models = args.models if args.models else [args.actor_model]

    # Per-provider default headers from CLI (OpenRouter extras)
    openrouter_hdrs: Dict[str, str] = {}
    if args.openrouter_http_referer:
        openrouter_hdrs["HTTP-Referer"] = args.openrouter_http_referer
    if args.openrouter_x_title:
        openrouter_hdrs["X-Title"] = args.openrouter_x_title

    # Resolve all ActorConfigs up-front
    # Reasonable default timeout for slow providers (e.g., Gemini Pro via OpenRouter)
    ACTOR_TIMEOUT = float(os.getenv("ACTOR_TIMEOUT_SECONDS", "120"))
    # Effective example/rollout counts (spread rollouts across topics when n=1)
    effective_n = args.n
    effective_rollouts = args.rollouts
    if args.n == 1 and args.rollouts > 1 and not args.topics:
        effective_n = args.rollouts
        effective_rollouts = 1
    actor_cfgs: List[Tuple[str, Any]] = []
    for spec in models:
        cfg = reg.resolve(
            spec,
            base_url=args.actor_base_url,
            api_key=args.actor_api_key,
            provider=args.actor_provider,
        )
        # Attach OpenRouter-specific headers if applicable (supports alias specs)
        if cfg.provider == 'openrouter' and openrouter_hdrs:
            try:
                cfg.default_headers.update(openrouter_hdrs)
            except Exception:
                pass
        # Pre-flight key check for OpenRouter to avoid 401 spam
        if cfg.provider == 'openrouter' and not cfg.api_key:
            print(f"[skip] {spec}: OPENROUTER_API_KEY not set; skipping.")
            continue
        actor_cfgs.append((spec, cfg))

    # Optionally evaluate multiple models in parallel (coarse-grained). Default sequential.
    from concurrent.futures import ThreadPoolExecutor, as_completed

    def _run_one(spec: str, cfg) -> Tuple[str, vf.GenerateOutputs, Dict[str, Any]]:
        # Create a local environment clone to ensure the exact same prompts
        # (topics, order, templates) are used independently per model.
        local_env = vf.load_environment(
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
        # Apply actor max_tokens override (temperature is never set)
        if hasattr(local_env, 'sampling_args') and isinstance(local_env.sampling_args, dict):
            sa = dict(local_env.sampling_args)
            sa.pop('temperature', None)
            if args.actor_max_tokens is not None:
                sa['max_tokens'] = int(args.actor_max_tokens)
            local_env.sampling_args = sa
        client = _make_actor_client(cfg, timeout=ACTOR_TIMEOUT)
        # First attempt
        def run_eval():
            # Spread rollouts across topics when n=1 for better coverage (reasonable default)
            eff_n = args.n
            eff_rollouts = args.rollouts
            if args.n == 1 and args.rollouts > 1 and not args.topics:
                eff_n = args.rollouts
                eff_rollouts = 1
            return local_env.evaluate(
                client=client,
                model=cfg.model,
                num_examples=eff_n,
                rollouts_per_example=eff_rollouts,
                max_concurrent=args.max_concurrent,
            )
        results = run_eval()
        summary = summarize(results, print_samples=args.print_samples)
        # Optional dumping per-model
        if args.outdir:
            _dump_per_model(args.outdir, spec, cfg, results, summary)
        return spec, results, summary

    summaries: List[Tuple[str, Dict[str, Any]]] = []
    cfg_by_spec: Dict[str, Any] = {spec: cfg for spec, cfg in actor_cfgs}
    if len(actor_cfgs) == 1 or args.parallel_models <= 1:
        for spec, cfg in actor_cfgs:
            try:
                _, _, summ = _run_one(spec, cfg)
                summaries.append((spec, summ))
            except Exception as e:
                print(f"[error] model {spec}: {e}")
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
        client = _make_actor_client(cfg, timeout=ACTOR_TIMEOUT)
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
            "num_examples": effective_n,
            "rollouts_per_example": effective_rollouts,
            "eval_hint_profile": args.eval_hint_profile,
            "system_prompt_mode": args.system_prompt_mode,
            "judge_model": args.judge_model,
            "actor_models": [],
            "models": [],
        }
        models_summary = []
        # Only include successfully summarized models to avoid broken manifest entries
        for spec, summ in summaries:
            cfg = cfg_by_spec.get(spec)
            if not cfg:
                continue
            slug = _safe_slug(spec)
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

        # Aggregate all samples into a single run-level file for easy exploration
        try:
            agg_path = os.path.join(args.outdir, "all_samples.jsonl")
            with open(agg_path, "w", encoding="utf-8") as agg_f:
                for m in manifest["models"]:
                    m_slug = m["slug"]
                    m_id = m["id"]
                    m_provider = m["provider"]
                    m_model = m["model"]
                    spath = os.path.join(args.outdir, m_slug, "samples.jsonl")
                    if not os.path.exists(spath):
                        continue
                    with open(spath, "r", encoding="utf-8") as sf:
                        for line in sf:
                            line = line.strip()
                            if not line:
                                continue
                            try:
                                row = _json.loads(line)
                            except Exception:
                                continue
                            row["model_id"] = m_id
                            row["model_slug"] = m_slug
                            row["provider"] = m_provider
                            row["model"] = m_model
                            agg_f.write(_json.dumps(row, ensure_ascii=False) + "\n")
        except Exception as _e:
            # Non-fatal; per-model samples remain available
            pass

        # Create a convenient index.html in the run folder that redirects to the explorer
        # with the correct manifest query param.
        try:
            outdir_norm = os.path.normpath(args.outdir)
            parts = outdir_norm.split(os.sep)
            if "docs" in parts:
                di = parts.index("docs")
                tail_parts = []
                explorer_rel_from_outdir = "explorer/index.html"  # default fallback
                manifest_rel_from_explorer = "manifest.json"
                if len(parts) > di + 1 and parts[di + 1] == "runs":
                    # Compute ../../explorer/index.html from docs/runs/<tail...>
                    tail_parts = parts[di + 2 :]
                    ups = 1 + len(tail_parts)  # from runs/<tail...> back to docs/
                    explorer_rel_from_outdir = ("../" * ups) + "explorer/index.html"
                    # From explorer to the manifest location
                    if tail_parts:
                        manifest_rel_from_explorer = "../runs/" + "/".join(tail_parts) + "/manifest.json"
                    else:
                        manifest_rel_from_explorer = "../runs/manifest.json"
                index_html = f"""<!doctype html>
<html><head><meta charset=\"utf-8\"><title>Jabberwocky Run</title>
<meta http-equiv=\"refresh\" content=\"0; url={explorer_rel_from_outdir}?manifest={manifest_rel_from_explorer}\">
</head>
<body>
  <p>Open explorer: <a href=\"{explorer_rel_from_outdir}?manifest={manifest_rel_from_explorer}\">View Run</a></p>
</body></html>"""
                with open(os.path.join(args.outdir, "index.html"), "w", encoding="utf-8") as f:
                    f.write(index_html)
        except Exception as _e:
            # Non-fatal; the manifest and summaries are already written
            pass


if __name__ == "__main__":
    main()
