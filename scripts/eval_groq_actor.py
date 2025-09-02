#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
import os
import statistics as stats
from typing import Dict, Optional

from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.text import Text

import verifiers as vf
from openai import OpenAI


def build_argparser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Eval jabberwocky with Groq actor + OpenAI judge")
    p.add_argument("-n", "--n", type=int, default=10, help="Num eval examples")
    p.add_argument("-r", "--rollouts", type=int, default=1, help="Rollouts per example")
    p.add_argument("--model", type=str, default="moonshotai/kimi-k2-instruct", help="Actor (Groq) model id")
    p.add_argument("--judge-model", type=str, default="gpt-4.1-mini", help="Judge (OpenAI) model id")
    p.add_argument("--max-concurrent", type=int, default=8, help="Concurrent rollouts")
    p.add_argument("--eval-hint-profile", type=str, default="minimal", choices=["high", "medium", "minimal", "mixed", "heavy", "light"], help="Eval prompt profile (default minimal; heavy→high, light→minimal)")
    p.add_argument("--system-prompt-mode", type=str, default="neutral", choices=["always_style", "neutral"], help="System prompt bias")
    p.add_argument("--topics", type=str, nargs="*", default=None, help="Optional custom topics")
    p.add_argument("-p", "--print-samples", type=int, default=3, help="How many samples to print")
    p.add_argument("--dump-json", type=str, default=None, help="Optional path to write per-sample JSON lines")
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
    overall = mean(results.reward)
    metrics_mean = {k: mean(v) for k, v in results.metrics.items()}
    label_counts: Dict[str, int] = {"very_low": 0, "low": 0, "medium": 0, "high": 0}
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
    console = Console()
    table = Table(title="Jabberwocky Evaluation Summary", expand=True)
    table.add_column("Metric", style="bold cyan")
    table.add_column("Value", style="white")
    table.add_row("overall_reward", f"{overall:.3f}")
    lc_str = ", ".join([f"{k}:{v}" for k, v in label_counts.items() if v]) or "(none)"
    table.add_row("labels", lc_str)
    crit_items = [(k, v) for k, v in metrics_mean.items() if k.startswith("C")]
    crit_items.sort(key=lambda kv: kv[1], reverse=True)
    top = crit_items[:6]
    if top:
        top_str = ", ".join(
            [f"{k.replace('_',' ').split(' ',1)[1] if '_' in k else k}:{v:.2f}" for k, v in top]
        )
        table.add_row("top_criteria", top_str)
    console.print(table)

    nshow = min(print_samples, len(results.prompt))
    for i in range(nshow):
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
        cpl = results.completion[i]
        if isinstance(cpl, list) and cpl:
            last_assist = next((m for m in cpl[::-1] if m.get("role") == "assistant"), None)
            poem = last_assist.get("content") if last_assist else str(cpl)
        else:
            poem = str(cpl)
        reward = results.reward[i]
        label = _derive_label_for_i(results.metrics, i) or "—"
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

    for i in range(min(print_samples, len(results.prompt))):
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

        print(f"\n--- Sample {i+1} ---")
        print("Prompt:\n" + prompt_text)
        print("\nPoem:\n" + completion_text)
        print("\nInfo:", info)
        print("Reward:", reward)
        print("Metrics:", json.dumps(metric_i, indent=2))

        st = results.state[i]
        if isinstance(st, dict):
            raw = st.get("jw_judge_xml_raw") or st.get("judge_xml_raw")
            if raw:
                print("\n[Judge raw excerpt]\n" + str(raw)[:600])
        c_yes = []
        c_all = sorted([k for k in results.metrics if k.startswith("C")])
        for k in c_all:
            try:
                if results.metrics[k][i] >= 0.5:
                    c_yes.append(k)
            except Exception:
                pass
        print("[Criteria yes]", c_yes, "| count:", len(c_yes))


def main():
    args = build_argparser().parse_args()

    # Load environment (judge on OpenAI by default)
    env = vf.load_environment(
        "jabberwocky",
        judge_model=args.judge_model,
        judge_base_url="https://api.openai.com/v1",
        judge_api_key_var="OPENAI_API_KEY",
        eval_hint_profile=args.eval_hint_profile,
        system_prompt_mode=args.system_prompt_mode,
        eval_force_style=True,
        topics=args.topics,
    )

    # Actor on Groq (OpenAI-compatible)
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key:
        raise RuntimeError("GROQ_API_KEY not set in environment")
    actor = OpenAI(api_key=groq_key, base_url="https://api.groq.com/openai/v1")

    results = env.evaluate(
        client=actor,
        model=args.model,
        num_examples=args.n,
        rollouts_per_example=args.rollouts,
        max_concurrent=args.max_concurrent,
    )
    summarize(results, print_samples=args.print_samples)

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
