# jabberwocky

Train and evaluate small language models on writing full poems in the style of Lewis Carroll's "Jabberwocky", optionally on a specified topic. Rewards come from a composite LLM judge rubric with 18 binary criteria specific to Jabberwocky (title, quatrain ballad form, meter echo, ballad rhyme ABAB/ABCB, arc and ring, coinages, sound devices, tone, canonical reuse limits). The judge reasons briefly and outputs XML with 18 yes/no tags only; we compute the sum and label on our side.

## What it does
- Presents topic-conditioned prompts like: "Write a poem about fish in the style of 'Jabberwocky'. Include a title. Output only the titled poem."
- Curated topics balance common poetic subjects, everyday scenes, and a sprinkling of esoteric cross‑disciplinary STEM topics (e.g., “Fourier transform”, “queueing theory”) to test generalization without steering content toward creatures or myth.
- Uses the original poem as a reference for the judge's comparison.
- Judge returns XML tags for the 18 criteria (each tag contains 'yes' or 'no'). The environment converts them to 0/1, computes `sum`, derives a label from thresholds (16–18: high; 10–15: medium; 5–9: low; 0–4: very_low), and uses `sum/18` as the reward. Each criterion and the derived label are logged as metrics.
- Optional bonuses:
  - stanza-count adherence (e.g., 3–5 stanzas)
  - quatrain shape (encourage ~4 lines per stanza)
  - topic adherence (presence of topic keywords)
  - plagiarism penalty (negative): penalizes verbatim copying of canonical lines (normalized)
- Mixed curricula support: control hint strength with `hint_profile` = `minimal|medium|high|mixed` and `hint_mix` proportions (backwards-compat: `heavy→high`, `light→minimal`).
   - `minimal`: just “in the style of 'Jabberwocky'” + title
   - `medium`: a few hints (coinages and arc), still “Output only the titled poem.”
   - `high`: many hints (rhyme, arc, sound, reuse limits), still “Output only the titled poem.”
   - Default mix: `{high:0.2, medium:0.6, minimal:0.2}`. Default eval uses `minimal` (light, no structural hints).
- System prompt control: `system_prompt_mode`=`always_style|neutral`. Use `neutral` to test that the model only produces Jabberwocky-style when asked in the user prompt.
 - Eval style enforcement: `eval_force_style` (default True) ensures evaluation prompts always mention Jabberwocky. Even `minimal` remains style‑conditional; no non‑style prompts are used during evaluation.

## Install

- Development install (local):

```
uv pip install -e .
```

## Run Tests

```
uv pip install -e .
uv pip install pytest
export OPENAI_API_KEY="sk-dummy"  # judge not called in unit tests
pytest environments/jabberwocky/tests -q
```

## Quickstart (1 minute)

1) Set your key once:

```
export OPENAI_API_KEY="sk-..."
```

2) Run a small eval (defaults: model gpt-4.1-mini, 5 prompts, 3 rollouts):

```
uv run vf-eval jabberwocky
```

Optional: small run with flags (pretty UI still applies):

```
uv run vf-eval jabberwocky -n 3 -r 1
```

## Python Version

This environment targets Python 3.11–3.12 to match `verifiers`. If your default Python is newer (e.g., 3.13), select a supported interpreter with `uv`:

```
uv -p 3.12 run vf-eval jabberwocky
```

or create a 3.12 virtualenv before running the commands above.

## Interpreting Results

- The header `criteria 10/18` means the judge marked 10 of the 18 binary rubric checks as “yes”. Reward is `sum/18` (e.g., 10/18 ≈ 0.556 → label medium).
- Poems are as long as the actor’s generation allows. Our environment sets `max_tokens=2048` by default for actor sampling; the judge has no max token cap by default.

- Programmatic usage:

```python
import verifiers as vf
from openai import OpenAI

env = vf.load_environment("jabberwocky", num_eval_examples=10)
client = OpenAI()  # or AsyncOpenAI
results = env.evaluate(client, model="gpt-4.1-mini", num_examples=10, rollouts_per_example=2)
print(results.metrics)
```

## Groq Actor + OpenAI Judge

Run the actor on Groq (OpenAI-compatible) while keeping the judge on OpenAI (`gpt-4.1-mini`).

- Env vars:

```
export OPENAI_API_KEY="sk-OPENAI-..."   # judge (OpenAI)
export GROQ_API_KEY="gsk-GROQ-..."      # actor (Groq)
```

- CLI (convenience script):

```
uv run python scripts/eval_groq_actor.py \
  --n 5 --rollouts 1 \
  --model moonshotai/kimi-k2-instruct \
  --eval-hint-profile medium \
  --system-prompt-mode neutral \
  --max-concurrent 4 \
  --print-samples 5
```

- Alternate (generic eval script):

```
uv run python scripts/eval_jabberwocky.py \
  --n 5 --rollouts 1 \
  --actor-model moonshotai/kimi-k2-instruct \
  --actor-base-url https://api.groq.com/openai/v1 \
  --actor-api-key "$GROQ_API_KEY" \
  --judge-model gpt-4.1-mini \
  --eval-hint-profile medium \
  --system-prompt-mode neutral \
  --max-concurrent 4 \
  --print-samples 5
```

Notes:
- Do not set `OPENAI_BASE_URL` to Groq if you want the judge to stay on OpenAI.
- No streaming; the environment expects non-streamed responses.
 - If you see a missing API key error, set `OPENAI_API_KEY` or pass `judge_api_key_var` to `load_environment`.

## prime-rl usage

In your `orch.toml`:

```
[environment]
id = "jabberwocky"
args = { num_train_examples = 2000, judge_model = "gpt-4.1-mini", target_stanzas_min = 3, target_stanzas_max = 5 }
```

Ensure your inference cluster exposes an OpenAI-compatible endpoint for actors. You can also point the judge to a separate base URL (e.g., vLLM) using `judge_base_url`.

## Training (verifiers GRPO)

Run a GRPO training with a vLLM actor (mirrors verifiers/examples/grpo/*).

1) Start vLLM (OpenAI-compatible):

```
vf-vllm --model google/gemma-2-2b --port 8000 --enforce-eager --disable-log-requests
```

2) Train (OpenAI judge):

```
export OPENAI_API_KEY="sk-..."
accelerate launch --num-processes 1 \
  --config-file docs/verifiers/configs/zero3.yaml \
  scripts/train_jabberwocky_grpo.py
```

Notes:
- Configure via ENV: `MODEL_NAME` (policy), `RUN_NAME` (default jabberwocky), `VLLM_HOST/PORT`, `JUDGE_MODEL`.
- GRPO requires ≥2 generations; effective generation batch must be divisible by `num_generations`.
- Keep judge temperature ~0.0; actor ~0.7 for exploration.
- For longer runs, prefer LoRA/ZeRO; this example mirrors verifiers examples for compatibility.

## Config options (load_environment)
- `num_train_examples` (int): size of synthetic train set (default 500)
- `num_eval_examples` (int): size of eval set (default 100)
- `judge_model` (str): judge model id (default `gpt-4.1-mini`)
- `judge_base_url` (str): judge API base (default OpenAI)
- `judge_api_key_var` (str): env var for judge key (default `OPENAI_API_KEY`)
- `judge_sampling_args` (dict): overrides for the judge call (default `{temperature: 0.0}`)
- `topics` (list[str]): topics sampled for prompts (defaults to a curated list of ~120). When unspecified, eval uses a held-out subset.
- `seed` (int): seed for topic sampling and dataset generation (default 777)
- `topic_holdout_n` (int): number of topics reserved for eval when using default topics (default 20; capped to 20% of list)
- `target_stanzas_min` / `target_stanzas_max` (int): inclusive range for stanza counts in prompts (default 3..5)
- [Deprecated] previous auxiliary rewards (stanza count, quatrain shape, topic adherence, copy penalty) have been replaced by the composite rubric’s binary criteria.
- `hint_profile` (str): one of `minimal|medium|high|mixed` (also accepts `heavy`→`high`, `light`→`minimal`; default `medium`).
- `hint_mix` (dict): proportions for the mixed profile, e.g. `{high:0.2, medium:0.6, minimal:0.2}`.
- `eval_hint_profile` (str|None): override hint profile for eval dataset (default `minimal`).
- `eval_hint_mix` (dict|None): proportions for eval mixed profile.
- `system_prompt_mode` (str): `always_style` (default) or `neutral` to remove global style bias.
- `eval_force_style` (bool): force eval prompts to include Jabberwocky cue (default True). Minimal remains style‑conditional.
- Judge runs with a generous timeout (60s) and supports reasoning in the prompt (scratchpad + example analyses). No max token cap is enforced by default.

## Notes
- The original poem is embedded as a string within the module for portability.
- For consistent judging, consider lowering judge temperature and fixing seeds at the caller.
- This module follows Verifiers' `SingleTurnEnv` pattern and should be compatible with both `verifiers` and `prime-rl` trainers.
- The judge prompt contains few-shot examples (high, medium, low, very_low) with short rationales and a strict 18-point binary rubric; it reasons briefly (<scratchpad>) before emitting the XML yes/no tags.
- Mixed training + style-conditional eval works well if your goal is to teach the skill “on request” rather than always produce Jabberwocky-like text.

Bias note:
- Because all profiles are style‑conditional, small policies may over‑generalize toward Jabberwocky on unrelated prompts at inference time. Keep `system_prompt_mode=neutral`, and evaluate on neutral prompts if concerned. If needed, consider a separate neutral curriculum with an anti‑style objective to explicitly teach “no style unless asked.”

 
