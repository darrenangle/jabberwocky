#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
import statistics as stats
from typing import Any, Dict, Optional

from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.text import Text

import verifiers as vf
from openai import OpenAI


def build_argparser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Evaluate jabberwocky environment")
    p.add_argument("-n", "--n", type=int, default=10, help="Num eval examples")
    p.add_argument("-r", "--rollouts", type=int, default=2, help="Rollouts per example")
    p.add_argument("--actor-model", type=str, default="gpt-4.1-mini", help="Actor model id")
    p.add_argument("--judge-model", type=str, default="gpt-4.1-mini", help="Judge model id")
    p.add_argument("--stanzas-min", type=int, default=3, help="Min target stanzas")
    p.add_argument("--stanzas-max", type=int, default=5, help="Max target stanzas")
    p.add_argument("--hint-profile", type=str, default="medium", choices=["high", "medium", "minimal", "mixed", "heavy", "light"], help="Hint strength for dataset prompts (heavy→high, light→minimal)")
    p.add_argument("--eval-hint-profile", type=str, default="minimal", choices=["high", "medium", "minimal", "mixed", "heavy", "light"], help="Override hint strength for eval prompts (default minimal; heavy→high, light→minimal)")
    p.add_argument("--max-concurrent", type=int, default=16, help="Concurrent rollouts")
    p.add_argument("--topics", type=str, nargs="*", default=None, help="List of topics for prompts")
    p.add_argument("-p", "--print-samples", type=int, default=2, help="How many samples to print")
    p.add_argument("--dump-json", type=str, default=None, help="Optional path to write per-sample JSON lines")
    p.add_argument("--system-prompt-mode", type=str, default="neutral", choices=["always_style", "neutral"], help="Global system prompt bias")
    p.add_argument("--no-eval-force-style", action="store_true", help="Allow non-Jabberwocky prompts in eval (not recommended)")
    # Judge tuning flags removed; environment uses robust defaults (timeout=60s)
    p.add_argument("--show-system", action="store_true", help="Print system prompt for samples")
    # Actor endpoint overrides (OpenAI-compatible)
    p.add_argument("--actor-base-url", type=str, default=None, help="Actor OpenAI-compatible base URL (e.g., https://api.groq.com/openai/v1)")
    p.add_argument("--actor-api-key", type=str, default=None, help="Actor API key (or set via env)")
    # Optional judge endpoint overrides
    p.add_argument("--judge-base-url", type=str, default=None, help="Judge OpenAI-compatible base URL (default: OpenAI)")
    p.add_argument("--judge-api-key", type=str, default=None, help="Judge API key (or set via env OPENAI_API_KEY)")
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


def summarize(results: vf.GenerateOutputs, print_samples: int = 2):
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
        **judge_kwargs,
    )

    # Actor client (OpenAI-compatible). If base URL or key provided, use them; else default OpenAI env.
    if args.actor_base_url or args.actor_api_key:
        client = OpenAI(api_key=args.actor_api_key, base_url=args.actor_base_url)
    else:
        client = OpenAI()

    results = env.evaluate(
        client=client,
        model=args.actor_model,
        num_examples=args.n,
        rollouts_per_example=args.rollouts,
        max_concurrent=args.max_concurrent,
    )
    summarize(results, print_samples=args.print_samples)

    # Optional per-sample JSONL dump
    if args.dump_json:
        with open(args.dump_json, "w", encoding="utf-8") as f:
            for i in range(len(results.prompt)):
                prm = results.prompt[i]
                cpl = results.completion[i]
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
                    "info": results.info[i],
                    "reward": results.reward[i],
                    "metrics": {k: results.metrics[k][i] for k in results.metrics},
                }
                f.write(json.dumps(row, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
