"""
Jabberwocky Environment (verifiers-compatible)

Minimal, reproducible, and judge-driven environment to teach models to write
full poems in the style of Lewis Carroll's “Jabberwocky” when asked.

Defaults are chosen for a 1-minute trial via `vf-eval jabberwocky`.
"""

from __future__ import annotations

import os
import random
from typing import Any, Dict, List, Tuple

from datasets import Dataset
from openai import OpenAI
import logging

import verifiers as vf
from verifiers.utils import logging_utils as _vf_log
from rich.console import Console as _Console
from rich.panel import Panel as _Panel
from rich.table import Table as _Table
from rich.text import Text as _Text


# Full poem reference used by the judge for stylistic comparison.
# Embedded for portability when packaging as a wheel.
JABBERWOCKY_TEXT = (
    "’Twas brillig, and the slithy toves\n"
    "      Did gyre and gimble in the wabe:\n"
    "All mimsy were the borogoves,\n"
    "      And the mome raths outgrabe.\n\n"
    "“Beware the Jabberwock, my son!\n"
    "      The jaws that bite, the claws that catch!\n"
    "Beware the Jubjub bird, and shun\n"
    "      The frumious Bandersnatch!”\n\n"
    "He took his vorpal sword in hand;\n"
    "      Long time the manxome foe he sought—\n"
    "So rested he by the Tumtum tree\n"
    "      And stood awhile in thought.\n\n"
    "And, as in uffish thought he stood,\n"
    "      The Jabberwock, with eyes of flame,\n"
    "Came whiffling through the tulgey wood,\n"
    "      And burbled as it came!\n\n"
    "One, two! One, two! And through and through\n"
    "      The vorpal blade went snicker-snack!\n"
    "He left it dead, and with its head\n"
    "      He went galumphing back.\n\n"
    "“And hast thou slain the Jabberwock?\n"
    "      Come to my arms, my beamish boy!\n"
    "O frabjous day! Callooh! Callay!”\n"
    "      He chortled in his joy.\n\n"
    "’Twas brillig, and the slithy toves\n"
    "      Did gyre and gimble in the wabe:\n"
    "All mimsy were the borogoves,\n"
    "      And the mome raths outgrabe.\n"
)

# Install a prettier sample printer for vf-eval output
_PRETTY_INSTALLED = False


def _pretty_print_prompt_completions_sample(
    prompts, completions, rewards, step, num_samples: int = 2
):
    console = _Console()
    table = _Table(title=f"Jabberwocky Summary (step {step})", expand=True)
    table.add_column("#", style="bold white", justify="right")
    table.add_column("Prompt", style="bright_yellow", no_wrap=False)
    table.add_column("Reward", style="bold cyan", justify="right")
    n = min(num_samples, len(prompts))
    for i in range(n):
        # format prompt as the last user content if chat; else raw string
        prm = prompts[i]
        if isinstance(prm, list) and prm:
            last = prm[-1]
            prompt_text = str(last.get("content", ""))
        else:
            prompt_text = str(prm)
        table.add_row(str(i + 1), _Text(prompt_text), _Text(f"{rewards[i]:.3f}"))
    console.print(table)

    # Show one or two poems as panels
    nshow = min(n, 2)
    for i in range(nshow):
        cpl = completions[i]
        if isinstance(cpl, list) and cpl:
            last_assist = next((m for m in cpl[::-1] if m.get("role") == "assistant"), None)
            poem = last_assist.get("content") if last_assist else str(cpl)
        else:
            poem = str(cpl)
        console.print(_Panel.fit(_Text(poem), title=f"Sample {i+1} Poem", border_style="green"))


def _install_pretty_printer_once():
    global _PRETTY_INSTALLED
    if _PRETTY_INSTALLED:
        return
    # patch both the utils module and the re-export on verifiers package
    _vf_log.print_prompt_completions_sample = _pretty_print_prompt_completions_sample  # type: ignore
    try:
        vf.print_prompt_completions_sample = _pretty_print_prompt_completions_sample  # type: ignore
    except Exception:
        pass
    _PRETTY_INSTALLED = True


def _patch_vf_eval_max_tokens_once():
    """Ensure vf-eval uses a generous max_tokens (2048) if smaller.

    This avoids skimpy poems without forcing users to pass flags.
    """
    try:
        import verifiers.scripts.eval as vfe  # type: ignore

        if getattr(vfe, "__jw_patched_max_tokens__", False):
            return

        _orig = vfe.eval_environment

        def _wrapped_eval_environment(
            env: str,
            env_args: dict,
            env_dir_path: str,
            endpoints_path: str,
            model: str,
            api_key_var: str,
            api_base_url: str,
            num_examples: int,
            rollouts_per_example: int,
            max_concurrent_requests: int,
            max_tokens: int,
            temperature: float | None,
            verbose: bool,
            save_dataset: bool,
            save_to_hf_hub: bool,
            hf_hub_dataset_name: str,
        ):
            if max_tokens is None or max_tokens < 2048:
                max_tokens = 2048
            return _orig(
                env,
                env_args,
                env_dir_path,
                endpoints_path,
                model,
                api_key_var,
                api_base_url,
                num_examples,
                rollouts_per_example,
                max_concurrent_requests,
                max_tokens,
                temperature,
                verbose,
                save_dataset,
                save_to_hf_hub,
                hf_hub_dataset_name,
            )

        vfe.eval_environment = _wrapped_eval_environment  # type: ignore
        setattr(vfe, "__jw_patched_max_tokens__", True)
    except Exception:
        # If anything fails, don't block loading the environment
        pass

STYLE_SYSTEM_PROMPT = (
    "You are a playful nonsense poet. When asked, write a poem in the style of "
    "Lewis Carroll's 'Jabberwocky'. Avoid copying lines or phrases from the original."
)

NEUTRAL_SYSTEM_PROMPT = (
    "You are a helpful poet. When asked, respond with a poem that addresses the user's request."
)

CANONICAL_LEXICON = [
    "brillig",
    "slithy",
    "toves",
    "gyre",
    "gimble",
    "wabe",
    "mimsy",
    "borogoves",
    "mome",
    "raths",
    "outgrabe",
    "Jubjub",
    "Bandersnatch",
    "vorpal",
    "manxome",
    "Tumtum",
    "uffish",
    "whiffling",
    "tulgey",
    "burbled",
    "snicker-snack",
    "galumphing",
    "beamish",
]

def _normalize_line(s: str) -> str:
    s = s.strip().lower()
    # normalize curly quotes and dashes/hyphens
    s = (
        s.replace("’", "'")
        .replace("‘", "'")
        .replace("“", '"')
        .replace("”", '"')
        .replace("—", "-")
        .replace("–", "-")
        .replace("‑", "-")
    )
    # collapse whitespace
    s = " ".join(s.split())
    return s

CANONICAL_LINES_NORM = {
    _normalize_line(ln)
    for ln in JABBERWOCKY_TEXT.splitlines()
    if ln.strip()
}

HIGH_EXAMPLE = (
    "Dietwocky\n\n"
    "’Twas fizzlig, and the silv’ry cans\n"
    "    Did clink and tinkle in the cave:\n"
    "All zero were the sugargrams,\n"
    "    And mome throats outcrave.\n\n"
    "“Beware the Sucrowock, my son!\n"
    "    The syruped bite, the caramel catch!\n"
    "Beware the Jubjub thirst, and shun\n"
    "    The caffrinous Bandersnatch!”\n\n"
    "He took his vorpal Diet‑Coke in hand;\n"
    "    Long time the manxome thirst he sought—\n"
    "So rested he by the NumNum stand\n"
    "    And stood awhile in thought.\n\n"
    "And, as in uffish thought he stood,\n"
    "    The Sucrowock, with eyes of foam,\n"
    "Came whiffling from the vending‑wood,\n"
    "    And burbled as it came!\n\n"
    "Pop! Hiss! Pop! Hiss! and through and through\n"
    "    The silver tab went snicker‑snack!\n"
    "He left it drained; and with its ring\n"
    "    He went galumphing back.\n\n"
    "“And hast thou quenched the Sucrowock?\n"
    "    Come to my arms, my beamish boy!\n"
    "O frabjous day! Callooh! Callay!”\n"
    "    He chortled in his joy.\n\n"
    "’Twas fizzlig, and the silv’ry cans\n"
    "    Did clink and tinkle in the cave:\n"
    "All zero were the sugargrams,\n"
    "    And mome throats outcrave."
)

MEDIUM_EXAMPLE = (
    "Diet Coke, a Jabberwocky Parody\n\n"
    "’Twas fizzful in the fridge’s dim glow,\n"
    "Where slithy toves of plastic roll;\n"
    "A can of Diet Coke hummed slow,\n"
    "With carbon frost upon its soul.\n\n"
    "“Beware the Diet Coke,” the whispers say,\n"
    "“For fizz that bites and sugar none;\n"
    "The cap that snaps with silvered sway,\n"
    "And bubbles bright as midnight sun.”\n\n"
    "He gripped a vorpal straw with keen resolve,\n"
    "And sought the foe with eyes aflame;\n"
    "Through tulgey aisles of sizzle and resolve,\n"
    "The liquid dare wore a silver name.\n\n"
    "From the cooler’s tulgey wood it burst,\n"
    "A hiss of foam, a glittering gleam;\n"
    "It burbled, hissed, and dared the worst,\n"
    "A clinking, clattering, fizzing dream.\n\n"
    "One, two! One, two! And through and through\n"
    "The vorpal straw went snicker-snack!\n"
    "The can lay shattered, foamy head\n"
    "Rolled on the floor and clicked back.\n\n"
    "“O Diet Coke slain? O bottled delight!\n"
    "Return, bright beamish boy of fizz!\n"
    "O frabjous sip! Callooh! Callay!”\n"
    "He chortled in his thirsty bliss.\n\n"
    "’Twas fizzful in the fridge’s dim glow,\n"
    "Where slithy toves of plastic roll;\n"
    "All mimsy were the borogoves,\n"
    "And the mome raths outgrabe."
)

LOW_EXAMPLE = (
    "Fizz! Fizz! It's Diet Coke time, my son!\n"
    "The bubbles burst, the fizz goes on.\n"
    "The caffeine kicks, the craze ignites,\n"
    "Oh, what a treat for our delight!\n\n"
    "With ice cubes cold and sweetener fair,\n"
    "We raise our cans with a wild air,\n"
    "And toast to life's delicious pace,\n"
    "Even in this bustling space.\n\n"
    "The frothy glory in our claw,\n"
    "We sip it slow, we savor law,\n"
    "For Diet Coke does no harm at all,\n"
    "Except for when we guzzle gall.\n\n"
    "With every sip, we're transformed,\n"
    "Our energies reborned, deformed.\n"
    "We gyre and gimble through the day,\n"
    "A gentle yet vibrant way."
)

VERY_LOW_EXAMPLE = (
    "In days of olde, when times were tough,\n"
    "A beverage rose to the occasion's rough,\n"
    "A sparkling drink of wondrous taste,\n"
    "A sweet and effervescent haste,\n\n"
    "Its colors bright, its flavors bold,\n"
    "A thirst-quenching treat that soon 'twould unfold,\n"
    "A brew that doth delight both young and old,\n"
    "A sweet escape from life's harsh cold,\n\n"
    "With every sip, one's spirit doth soar,\n"
    "A sense of joy that can't be ignored,\n"
    "A taste of freedom, a perfect score,\n"
    "A friend when times seem tough and dull,\n\n"
    "It's called Diet Coke, thy elixir true,\n"
    "A classic treat that always sees you through,\n"
    "A delightful blend of sugar and fizz,\n"
    "A drink that brings a smile so sweet, it is,\n\n"
    "So raise your glass to Diet Coke's might,\n"
    "A beverage that's simply out of sight,\n"
    "A taste of yesteryear, now and evermore,\n"
    "A drink to cherish, always and forevermore."
)


def _canon_profile(name: str) -> str:
    name = (name or "").strip().lower()
    # backward-compat synonyms
    if name == "heavy":
        return "high"
    if name == "light":
        return "minimal"
    return name


def _sample_topics(rnd: random.Random, topics: List[str], n: int) -> List[str]:
    """Sample topics with low repetition and fixed seed behavior.

    Samples without replacement until the pool is exhausted, then reshuffles.
    """
    if n <= len(topics):
        return rnd.sample(topics, n)
    out: List[str] = []
    while len(out) < n:
        out.extend(rnd.sample(topics, len(topics)))
    return out[:n]


def _make_instructions(
    n: int,
    topics: List[str],
    stanza_range: Tuple[int, int],
    seed: int = 777,
    hint_profile: str = "medium",
    hint_mix: dict | None = None,
    enforce_style: bool = False,
) -> Tuple[List[str], List[dict]]:
    """Create topic-conditioned poem instructions and per-example info.

    hint_profile levels:
      - "minimal": style-conditional only (title; no structural coaching)
      - "medium": style-conditional with a few hints (stanza count OR coinages OR arc)
      - "high": style-conditional with many hints (stanzas, rhyme, arc, sound, reuse limits)
      - "mixed": sample from a mixture; proportions from hint_mix
    """
    rnd = random.Random(seed)
    lo, hi = stanza_range
    profile = _canon_profile(hint_profile)

    # Minimal (style only, include a title)
    minimal_templates = [
        "Write a poem about {topic} in the style of Lewis Carroll's 'Jabberwocky'. Include a title. Output only the titled poem.",
        "Compose a poem on {topic} in the style of 'Jabberwocky'. Include a title. Output only the titled poem.",
        "Create a poem about {topic} in the style of 'Jabberwocky'. Include a title. Output only the titled poem.",
    ]
    # Medium (a few hints; avoid stanza counts)
    medium_templates = [
        (
            "Write a poem about {topic} in the style of 'Jabberwocky'. Include a title. Output only the titled poem. "
            "Use a few invented coinages and a named creature. Avoid copying lines from the original."
        ),
        (
            "Write a poem about {topic} in the style of 'Jabberwocky'. Include a title. Output only the titled poem. "
            "Keep a playful ballad cadence with some rhyme. Add an admonition or preparation and a celebratory return. "
            "Use some invented words."
        ),
    ]
    # High (many hints; concise list, not prescriptive step-by-step; avoid stanza counts)
    high_templates = [
        (
            "Write a poem about {topic} in the style of 'Jabberwocky'. Include a title. Output only the titled poem. "
            "Keep ballad rhyme (ABAB/ABCB) and a lively alternating cadence. "
            "Invent new coinages in each stanza and introduce a named creature. Add onomatopoeia and some alliteration. "
            "Arc: warning → preparation → encounter/slay → return/celebration. Echo the opening at the end. Avoid verbatim lines; limit canonical words."
        )
    ]

    def sample_profile() -> str:
        if profile != "mixed":
            return profile
        mix_in = hint_mix or {"high": 0.2, "medium": 0.6, "minimal": 0.2}
        # Backward-compat: allow heavy/light keys
        mix = { _canon_profile(k): float(v) for k, v in mix_in.items() }
        keys = list(mix.keys())
        weights = [mix[k] for k in keys]
        s = sum(weights)
        weights = [w / s if s > 0 else 0.0 for w in weights]
        return rnd.choices(keys, weights=weights, k=1)[0]

    questions: List[str] = []
    infos: List[dict] = []
    topic_order = _sample_topics(rnd, topics, n)
    for i in range(n):
        topic = topic_order[i]
        choice = sample_profile()
        if choice == "high":
            template = high_templates[i % len(high_templates)]
        elif choice == "medium":
            template = medium_templates[i % len(medium_templates)]
        elif choice == "minimal":
            template = minimal_templates[i % len(minimal_templates)]
        else:
            # fallback to minimal
            template = minimal_templates[i % len(minimal_templates)]
        q = template.format(topic=topic)
        info = {"topic": topic}
        questions.append(q)
        infos.append(info)
    return questions, infos


def _make_synthetic_dataset(
    num_examples: int,
    topics: List[str],
    stanza_range: Tuple[int, int],
    seed: int = 777,
    hint_profile: str = "heavy",
    hint_mix: dict | None = None,
    enforce_style: bool = False,
) -> Dataset:
    questions, infos = _make_instructions(
        num_examples, topics, stanza_range, seed, hint_profile, hint_mix, enforce_style
    )
    answers = [JABBERWOCKY_TEXT for _ in range(num_examples)]
    return Dataset.from_dict({"question": questions, "answer": answers, "info": infos})


def load_environment(
    num_train_examples: int = 500,
    num_eval_examples: int = 100,
    judge_model: str = "gpt-4.1-mini",
    judge_base_url: str = "https://api.openai.com/v1",
    judge_api_key_var: str = "OPENAI_API_KEY",
    topics: List[str] | None = None,
    seed: int = 777,
    topic_holdout_n: int = 20,
    target_stanzas_min: int = 3,
    target_stanzas_max: int = 5,
    hint_profile: str = "medium",
    hint_mix: dict | None = None,
    eval_hint_profile: str | None = "minimal",
    eval_hint_mix: dict | None = None,
    eval_force_style: bool = True,
    system_prompt_mode: str = "neutral",  # one of: always_style | neutral
    judge_timeout: float = 60.0,
    judge_sampling_args: Dict[str, Any] | None = None,
    log_judge_debug: bool = False,
    **kwargs,
) -> vf.Environment:
    """Load the Jabberwocky environment.

    Returns a SingleTurnEnv whose reward is computed by an LLM judge using an
    18-criterion binary XML rubric specific to the style of 'Jabberwocky'.
    """

    # Datasets
    user_supplied_topics = topics is not None
    if topics is None:
        topics = [
            # Nature & seasons
            "falling leaves", "first snow", "spring rain", "summer heat", "morning fog",
            "river bend", "desert wind", "mountain pass", "meadow at noon", "ocean tide",
            "storm at sea", "winter sun", "dawn chorus", "harvest moon", "evening breeze",
            "puddles after rain", "footprints in snow", "heatwave", "thunderstorm", "low tide",
            "spindrift", "alpenglow", "rain shadow", "katabatic wind", "scree slope",
            "murmuration", "firn field", "hoarfrost", "frost heave", "verglas",
            "tide rip", "eelgrass bed", "kelp wrack", "blown sand", "rain squall",
            # Urban & transit
            "subway platform", "bus stop in rain", "airport gate", "city rooftop", "corner bookstore",
            "laundromat", "parking garage", "neon sign flicker", "traffic at dusk", "underground station",
            "empty theater", "museum bench", "office elevator", "crosswalk", "vending machine",
            "platform wind", "third rail hum", "pantograph sparks", "ballast crunch", "signal box",
            "switchyard at dawn", "headway drift", "sodium‑vapor glow", "turnstile click", "farebox chime",
            "diesel haze", "overhead catenary", "bridge expansion joints", "streetcar bell", "underpass echo",
            "wheel squeal", "crossover clatter", "interlocking tower", "dwell time", "rail corrugation",
            "flag stop", "short turn", "bus bunching", "deadhead run", "layover bay",
            "platform gap", "guard whistle", "door chime", "goat path", "desire line",
            # Domestic & everyday
            "kitchen table", "empty room", "attic dust", "old photograph", "singing kettle",
            "moving boxes", "fresh bread", "folded laundry", "family recipe", "postcards",
            "sun‑faded curtains", "radiator hiss", "pilot light", "junk drawer", "porch steps",
            "window sash cord", "cedar chest", "mothball scent", "laundry line", "doorknob patina",
            # Objects & tools
            "umbrella", "mirror", "clock", "suitcase", "map", "notebook", "fountain pen",
            "paper plane", "coin in pocket", "key ring", "candle", "teacup", "glass of water",
            "rubber band", "paperclip chain", "stapler", "lantern", "wristwatch",
            "bench plane", "dovetail joint", "kerf", "swarf", "burr",
            "honing stone", "hollow grind", "mortise and tenon", "spokeshave", "awl",
            # Technology & media
            "low battery", "lost wireless signal", "loading bar", "keyboard clicks", "server room hum",
            "voicemail", "pocket calculator", "vinyl crackle", "cassette tape", "film camera",
            "alarm clock", "radio static", "screen burn‑in", "coil whine", "printer jam",
            "contact sheet", "light leak", "reciprocity failure", "ground hum", "wow and flutter",
            # School & play
            "playground swings", "basketball court at night", "running track", "science fair",
            "first day of school", "library table", "locker hallway", "music room", "chalk screech",
            "field day", "stage wings", "trophy case", "bus loop", "study hall",
            # Work & routine
            "morning commute", "lunch break", "last train home", "night shift", "coffee break",
            "open office", "conference room", "break room fridge", "coat rack", "name badge",
            "loading dock", "pallet jack", "dock plate", "time clock punch", "shift horn",
            # Time & milestones
            "new year's morning", "birthday candle", "graduation stage", "wedding shoes", "funeral flowers",
            "last day of summer", "anniversary dinner", "first apartment", "retirement party", "moving day",
            "golden hour", "blue hour", "witching hour", "closing time", "opening bell",
            # Food & kitchen
            "soup simmering", "peeler and potatoes", "citrus zest", "burnt toast", "tea steam",
            "spice rack", "espresso crema", "gooseneck kettle", "pour over bloom", "cast‑iron pan",
            "mise en place", "mirepoix", "deglaze", "brown butter", "proofing basket",
            # Streets & details
            "broken streetlight", "crossed wires", "mail slot", "brick alley", "pigeons on a ledge",
            "pothole puddle", "traffic cone", "chalk marks", "sidewalk cafe", "manhole steam",
            "tactile paving", "bus lane marking", "fog line", "rumble strip", "desire path",
            "zebra crossing", "cat's eyes", "Belgian block", "setts", "cast‑iron grate",
            # Atypical / random phenomena
            "escalator", "parking meter", "turnstile", "elevator music", "receipt tape",
            "broken umbrella", "traffic detour", "stray shopping cart", "lost glove", "echo in a tunnel",
            "stiction", "creep", "outgassing", "heat shimmer", "ground fog",
            "mirage", "sun dog", "thin‑film colors", "moire pattern", "Newton's rings",
            # Abstract & emotions
            "a promise kept", "something forgotten", "sudden luck", "decision at midnight", "words unsent",
            "quiet relief", "a near miss", "déjà vu", "a secret shared", "homesickness",
            "forgiveness", "nostalgia", "time and memory", "second chances", "bittersweet victory",
            "saudade", "sprezzatura", "mono no aware", "hiraeth", "beginner's mind",
            # STEM / cross-disciplinary (clean, short)
            "Fourier transform", "Bayesian inference", "entropy", "phase transitions", "signal processing",
            "graph isomorphism", "shortest path", "Kalman filter", "Markov chains", "gradient descent",
            "Noether's theorem", "Gödel's incompleteness theorem", "polynomial time versus nondeterministic polynomial time", "Monte Carlo", "Poisson process",
            "Nyquist sampling", "fast Fourier transform", "superposition", "interference", "refraction",
            "laminar flow", "control theory", "game theory", "queueing theory", "error correction",
            "consensus", "hash collisions", "principal component analysis", "spectral clustering", "dimensional analysis",
            "four-color theorem",
        ]
    # Held-out topics for eval when using defaults
    rnd_topics = random.Random(seed)
    topics_shuffled = topics[:]
    rnd_topics.shuffle(topics_shuffled)
    if not user_supplied_topics:
        # only apply holdout automatically for the default topic list
        holdout_n = max(0, min(topic_holdout_n, len(topics_shuffled)//5))  # cap to 20% if list is short
        eval_topics = topics_shuffled[:holdout_n] if holdout_n > 0 else topics_shuffled[:max(1, len(topics_shuffled)//10)]
        train_topics = topics_shuffled[holdout_n:] if holdout_n > 0 else topics_shuffled
    else:
        train_topics = topics_shuffled
        eval_topics = topics_shuffled  # user-specified topics: no automatic holdout

    stanza_range = (target_stanzas_min, target_stanzas_max)
    # build train + eval with potentially different hint profiles
    tr_profile = hint_profile
    ev_profile = eval_hint_profile or hint_profile
    full_train = _make_synthetic_dataset(
        num_train_examples,
        train_topics,
        stanza_range,
        seed=seed,
        hint_profile=tr_profile,
        hint_mix=hint_mix,
        enforce_style=False,
    )
    full_eval = _make_synthetic_dataset(
        num_eval_examples,
        eval_topics,
        stanza_range,
        seed=seed + 1,
        hint_profile=ev_profile,
        hint_mix=eval_hint_mix,
        enforce_style=eval_force_style,
    )
    train_dataset = full_train
    eval_dataset = full_eval

    # Parser and system prompt
    parser = vf.Parser()
    if system_prompt_mode == "neutral":
        system_prompt = NEUTRAL_SYSTEM_PROMPT
    else:
        system_prompt = STYLE_SYSTEM_PROMPT

    # Judge client (fail fast on missing key) and logger
    api_key = os.getenv(judge_api_key_var)
    if not api_key:
        raise ValueError(
            f"Missing judge API key. Set {judge_api_key_var} or override judge_api_key_var."
        )
    judge_client = OpenAI(api_key=api_key, base_url=judge_base_url)
    judge_sampling_args = judge_sampling_args or {"temperature": 0.0, "max_tokens": 256}
    logger = logging.getLogger("jabberwocky")

    # Composite binary rubric keys (descriptive) — keep in sync with XML prompt
    RUBRIC_KEYS = [
        "C1_title_present",
        "C2_quatrain_shape",
        "C3_ballad_meter_echo",
        "C4_ballad_rhyme",
        "C5_ring_composition",
        "C6_warning_admonition",
        "C7_preparation_armament",
        "C8_encounter_confrontation",
        "C9_slaying_decisive_action",
        "C10_return_celebration",
        "C11_coinage_count",
        "C12_coinage_spread",
        "C13_creature_naming",
        "C14_onomatopoeia",
        "C15_alliteration_consonance",
        "C16_tone_alignment",
        "C17_no_verbatim_lines",
        "C18_canonical_budget",
    ]
    # Short tags to make formatting easy for small judges
    RUBRIC_SHORT = [
        "C1","C2","C3","C4","C5","C6","C7","C8","C9","C10","C11","C12","C13","C14","C15","C16","C17","C18"
    ]
    # XML field definitions: canonical name + alternative short tag
    RUBRIC_FIELDS = [(RUBRIC_KEYS[i], RUBRIC_SHORT[i]) for i in range(len(RUBRIC_KEYS))]

    # XML rubric prompt: model outputs yes/no for each tag
    judge_xml_prompt = (
        "You are grading whether a model-written poem matches the style of "
        "Lewis Carroll's 'Jabberwocky'.\n\n"
        "First, think briefly in <scratchpad> for a few lines. Then output exactly and only "
        "the XML tags listed below, using lowercase 'yes' or 'no' inside each, one tag per line, "
        "in the same order. Do not include any other text after the XML tags.\n\n"
        "Criteria (binary):\n"
        "- C1_title_present: Non-empty title preceding the first stanza.\n"
        "- C2_quatrain_shape: Majority (≥70%) 4-line stanzas; total ≈3–8 stanzas (one deviation allowed).\n"
        "- C3_ballad_meter_echo: In ≥60% stanzas, alternating longer/shorter line lengths (contrast ≥2 words).\n"
        "- C4_ballad_rhyme: In ≥60% stanzas, (2,4) rhyme; ABAB if also (1,3) rhyme. AABB does not count; allow slant rhyme.\n"
        "- C5_ring_composition: Final stanza echoes opening (≥2 repeated content words/phrases) or refrain.\n"
        "- C6_warning_admonition: Early admonition (e.g., Beware …) or equivalent caution.\n"
        "- C7_preparation_armament: Protagonist prepares (tool/resolve/wait/plan).\n"
        "- C8_encounter_confrontation: Clear meeting with the adversary/obstacle.\n"
        "- C9_slaying_decisive_action: Climactic act resolves tension (strike/capture/overcoming).\n"
        "- C10_return_celebration: Homecoming/reunion and jubilant acknowledgement.\n"
        "- C11_coinage_count: ≥8 distinct invented coinages not in canonical lexicon or standard English.\n"
        "- C12_coinage_spread: Each stanza has ≥1 coinage.\n"
        "- C13_creature_naming: Introduces a named non-canonical creature/entity central to action (not 'Jabberwock').\n"
        "- C14_onomatopoeia: ≥2 onomatopoeic bursts (e.g., snicker‑snack!, Pop! Hiss!).\n"
        "- C15_alliteration_consonance: ≥2 stanzas show clear within-line alliteration/consonance.\n"
        "- C16_tone_alignment: Whimsical/playful mythic tone; not generic promotional copy.\n"
        "- C17_no_verbatim_lines: No line exactly matches the canonical poem.\n"
        "- C18_canonical_budget: Distinct canonical tokens ≤8; new coinages encouraged.\n\n"
        "Canonical lexicon: "
        + ", ".join(CANONICAL_LEXICON)
        + "\n\n"
        "<scratchpad>Explain your reasoning concisely.</scratchpad>\n\n"
        "Now output only the following XML tags (one per line) filled with yes/no, in order: \n"
        + "\n".join([f"<{k}>yes|no</{k}>" for k in RUBRIC_SHORT])
        + "\n"
    )

    rubric_xml_parser = vf.XMLParser(fields=RUBRIC_FIELDS, answer_field=RUBRIC_KEYS[0])

    def get_or_make_judge_xml(prompt, completion, answer, state) -> dict:
        """One call to the judge → parse XML → cache under 'jw_*' keys."""
        # Build question/response text
        if isinstance(prompt, list) and prompt:
            last_user = next((m for m in prompt[::-1] if m.get("role") == "user"), None)
            question = last_user.get("content") if last_user else str(prompt)
        else:
            question = str(prompt)
        response_text = parser.parse_answer(completion) or ""
        jp = (
            judge_xml_prompt
            + "\n<question>\n" + question + "\n</question>\n\n"
            + "<reference_poem>\n" + answer + "\n</reference_poem>\n\n"
            + "<model_poem>\n" + response_text + "\n</model_poem>\n"
        )
        cache = state.get("jw_judge_xml_cache")
        if isinstance(cache, dict) and jp in cache:
            return cache[jp]
        try:
            jr = judge_client.chat.completions.create(
                model=judge_model,
                messages=[{"role": "user", "content": jp}],
                timeout=judge_timeout,
                **judge_sampling_args,
            )
            txt = str(jr.choices[0].message.content or "")
            if log_judge_debug:
                logger.info("[judge-xml] %s", txt[:300])
        except Exception as e:
            if log_judge_debug:
                logger.warning("[judge-xml-exc] %s", e)
            txt = ""
        # normalize tags like "< C1 >yes</ C1 >" → "<C1>yes</C1>"
        import re as _re
        txt_norm = _re.sub(r"<\s*/\s*([A-Za-z0-9_]+)\s*>", r"</\1>", txt)
        txt_norm = _re.sub(r"<\s*([A-Za-z0-9_]+)\s*>", r"<\1>", txt_norm)
        parsed = rubric_xml_parser.parse(txt_norm)
        # store raw for debugging
        state["jw_judge_xml_raw"] = txt
        out: dict[str, int] = {}
        s = 0
        for i, k in enumerate(RUBRIC_KEYS):
            # accept either descriptive tag <C1_coinage_count> or short tag <C1>
            v = getattr(parsed, k, None)
            if not v:
                short_tag = RUBRIC_SHORT[i]
                v = getattr(parsed, short_tag, None)
            bit = 1 if str(v or "").strip().lower() == "yes" else 0
            out[k] = bit
            s += bit
        if s >= 15:
            label = "high"
        elif s >= 10:
            label = "medium"
        elif s >= 5:
            label = "low"
        else:
            label = "very_low"
        out["sum"] = s
        out["label"] = label
        # cache
        if not isinstance(cache, dict):
            cache = {}
        cache[jp] = out
        state["jw_judge_xml_cache"] = cache
        state["jw_judge_xml_last"] = out
        return out

    def composite_score(prompt, completion, answer, state, **_kwargs) -> float:
        jj = get_or_make_judge_xml(prompt, completion, answer, state)
        return float(jj.get("sum", 0)) / float(len(RUBRIC_KEYS))

    rubric = vf.Rubric(parallelize_scoring=False)
    rubric.add_reward_func(composite_score, weight=1.0)

    # Add per-criterion metrics (weight 0.0) and label indicators
    for key in RUBRIC_KEYS:
        def make_fn(k):
            def f(prompt, completion, answer, state, **_kwargs) -> float:
                jj = get_or_make_judge_xml(prompt, completion, answer, state)
                return float(1.0 if int(jj.get(k, 0)) else 0.0)
            f.__name__ = k
            return f
        rubric.add_reward_func(make_fn(key), weight=0.0)

    def label_high(prompt, completion, answer, state, **_kwargs) -> float:
        jj = get_or_make_judge_xml(prompt, completion, answer, state)
        return 1.0 if jj.get("label") == "high" else 0.0

    def label_medium(prompt, completion, answer, state, **_kwargs) -> float:
        jj = get_or_make_judge_xml(prompt, completion, answer, state)
        return 1.0 if jj.get("label") == "medium" else 0.0

    def label_low(prompt, completion, answer, state, **_kwargs) -> float:
        jj = get_or_make_judge_xml(prompt, completion, answer, state)
        return 1.0 if jj.get("label") == "low" else 0.0

    def label_very_low(prompt, completion, answer, state, **_kwargs) -> float:
        jj = get_or_make_judge_xml(prompt, completion, answer, state)
        return 1.0 if jj.get("label") == "very_low" else 0.0

    rubric.add_reward_func(label_high, weight=0.0)
    rubric.add_reward_func(label_medium, weight=0.0)
    rubric.add_reward_func(label_low, weight=0.0)
    rubric.add_reward_func(label_very_low, weight=0.0)

    # Remove old auxiliary rewards to avoid double counting; the composite rubric covers structure and style

    # Environment
    env = vf.SingleTurnEnv(
        dataset=train_dataset,  # type: ignore
        eval_dataset=eval_dataset,  # type: ignore
        system_prompt=system_prompt,
        parser=parser,
        rubric=rubric,
        sampling_args={
            # Encourage creative, fuller generations by default for vf-eval
            "temperature": 0.8,
            "max_tokens": 2048,
        },
        **kwargs,
    )
    return env
    # Ensure vf-eval uses a pleasant, compact pretty-printer
    _install_pretty_printer_once()
    # And ensure vf-eval has a generous token budget
    _patch_vf_eval_max_tokens_once()
