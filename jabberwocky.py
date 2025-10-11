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

# =========================
# Criteria registry (sustainable)
# =========================
# Judge‑evaluated base criteria (structure-only items like quatrain shape are
# moved to deterministic proxies later). Use base names to keep numbering stable
# when we add/remove elements.
_JUDGE_BASE = [
    "title_present",
    # quatrain_shape is deterministic
    "ballad_meter_echo",
    "ballad_rhyme",
    "ring_composition",
    "warning_admonition",
    "preparation_armament",
    "encounter_confrontation",
    "slaying_decisive_action",
    "return_celebration",
    "coinage_count",
    "coinage_spread",
    "creature_naming",
    "onomatopoeia",
    "alliteration_consonance",
    "arc_order",
    "no_verbatim_lines",
    "canonical_budget",
    "syllable_tightness",
    "rhyme_variety",
    "lexical_repetition_guard",
    "coinage_variety",
    "topic_adherence",
    "subtext",
]

def _build_keys(prefix_list: list[str], start_idx: int = 1) -> tuple[list[str], list[str]]:
    keys = []
    shorts = []
    for i, base in enumerate(prefix_list, start=start_idx):
        shorts.append(f"C{i}")
        keys.append(f"C{i}_{base}")
    return keys, shorts

# Stable C-numbering with C2_quatrain_shape preserved (deterministic at runtime)
_JUDGE_BASE_WITH_C2 = [
    "title_present",
    "quatrain_shape",  # placeholder; judged deterministically, but keep numbering stable
    *_JUDGE_BASE[1:],   # rest of the judge criteria in order
]
RUBRIC_KEYS, RUBRIC_SHORT = _build_keys(_JUDGE_BASE_WITH_C2, 1)

# Deterministic criteria (appended at the end of numbering)
_DET_BASE = [
    "stanza_count",
    "quatrain_shape",
    "indent_alternation",
    "meter_alt_proxy",
    "syllable_outliers",
]
DET_KEYS, _DET_SHORT = _build_keys(_DET_BASE, start_idx=len(RUBRIC_KEYS) + 1)

# Combined registry for reporting order if needed
ALL_CRITERIA_KEYS = RUBRIC_KEYS + DET_KEYS

# XML field definitions only for the judge‑evaluated keys
RUBRIC_FIELDS = [(RUBRIC_KEYS[i], RUBRIC_SHORT[i]) for i in range(len(RUBRIC_KEYS))]


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
            last_assist = next(
                (m for m in cpl[::-1] if m.get("role") == "assistant"), None
            )
            poem = last_assist.get("content") if last_assist else str(cpl)
        else:
            poem = str(cpl)
        console.print(
            _Panel.fit(_Text(poem), title=f"Sample {i+1} Poem", border_style="green")
        )


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


STYLE_SYSTEM_PROMPT = (
    "You are a playful nonsense poet. When asked, write a poem in the style of "
    "Lewis Carroll's 'Jabberwocky'. Avoid copying lines or phrases from the original."
)

NEUTRAL_SYSTEM_PROMPT = "You are a helpful poet. When asked, respond with a poem that addresses the user's request."

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
    _normalize_line(ln) for ln in JABBERWOCKY_TEXT.splitlines() if ln.strip()
}

def _tokenize_words(s: str) -> list[str]:
    import re as _re
    s = _normalize_line(s)
    return _re.findall(r"[a-z]+(?:'[a-z]+)?", s)

def _bigrams(tokens: list[str]) -> set[tuple[str, str]]:
    return {(tokens[i], tokens[i+1]) for i in range(len(tokens) - 1)}

_CANONICAL_TOKENS = [
    _tokenize_words(ln) for ln in (ln for ln in JABBERWOCKY_TEXT.splitlines() if ln.strip())
]
_CANONICAL_BIGRAMS = [_bigrams(toks) for toks in _CANONICAL_TOKENS]

# ------------------------------
# Syllable estimation (heuristic)
# ------------------------------
_VOWELS = set("aeiouy")

def _estimate_syllables_word(w: str) -> int:
    w = w.lower()
    if not w:
        return 0
    # remove non-alpha and possessives
    import re as _re
    w = _re.sub(r"[^a-z]", "", w)
    if not w:
        return 0
    # silent 'e' (care/alone) but keep if only syllable
    if w.endswith("e") and len(w) > 2 and w[-2] not in _VOWELS:
        w = w[:-1]
    # count vowel groups
    groups = 0
    prev_v = False
    for ch in w:
        is_v = ch in _VOWELS
        if is_v and not prev_v:
            groups += 1
        prev_v = is_v
    # -le endings like "table"
    if w.endswith("le") and len(w) > 2 and w[-3] not in _VOWELS:
        groups += 1
    return max(1, groups)

def estimate_syllables_line(line: str) -> int:
    toks = _tokenize_words(line)
    return sum(_estimate_syllables_word(t) for t in toks)


# Quantile helper without numpy
def _percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    xs = sorted(values)
    if p <= 0:
        return float(xs[0])
    if p >= 1:
        return float(xs[-1])
    idx = int((len(xs) - 1) * p)
    return float(xs[idx])

# Normative syllable bounds based on canonical ballad feel
SYLL_LONG_MIN = 8    # long lines should be at least 8 syllables
SYLL_LONG_MAX = 10   # and not exceed ~10
SYLL_SHORT_MAX = 7   # short lines should be 7 or fewer
SYLL_HARD_CAP = 12   # any line above this is an outlier

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


def build_judge_xml_prompt() -> str:
    tags = [t for t in RUBRIC_SHORT if t != "C2"]
    return (
        "You are grading whether a model-written poem matches the style of "
        "Lewis Carroll's 'Jabberwocky'.\n\n"
        "First, produce a structured <think> block. Then produce the final decision tags.\n"
        "In the <think> block use <C1_think>…</C1_think> … <C22_think>…</C22_think> to record brief reasoning for each criterion.\n"
        "Do NOT use <C1> inside <think>.\n\n"
        "Questions (binary). Answer each with 'yes' or 'no' only in the final decision tags.\n"
        "Strictness: If a check is borderline, partially met, or uncertain, answer 'no'. Only answer 'yes' when the criterion is clearly and definitively satisfied.\n"
        "- C1_title_present: Is there a non-empty title line before the first stanza (not part of stanza text)?\n"
        # C2 (quatrain shape) is judged deterministically, so omitted from the judge rubric.\n"
        "- C3_ballad_meter_echo: In ≥60% of stanzas, do lines alternate longer/shorter with ≥2 content-word difference?\n"
        "- C4_ballad_rhyme: In ≥60% of stanzas, do lines (2,4) rhyme (allowing slant rhyme), and avoid AABB dominance?\n"
        "- C5_ring_composition: Does the final stanza echo the opening with ≥2 repeated content words/phrases or a clear refrain?\n"
        "- C6_warning_admonition: Is there an early admonition (e.g., ‘Beware …’) or equivalent caution to the protagonist?\n"
        "- C7_preparation_armament: Before the encounter, does the protagonist prepare (tool/resolve/wait/plan)?\n"
        "- C8_encounter_confrontation: Is there a clear meeting between protagonist and adversary/obstacle?\n"
        "- C9_slaying_decisive_action: Is there a decisive act that resolves the central tension?\n"
        "- C10_return_celebration: Is there a return/homecoming and jubilant acknowledgement?\n"
        "- C11_coinage_count: Are there ≥8 distinct invented coinages (not canonical or standard English)?\n"
        "- C12_coinage_spread: Does each stanza contain ≥1 coinage?\n"
        "- C13_creature_naming: Is a non‑canonical creature/entity named and central to action (not ‘Jabberwock’)?\n"
        "- C14_onomatopoeia: Are there ≥2 onomatopoeic bursts (e.g., ‘snicker‑snack!’, ‘Pop!’, ‘Hiss!’)?\n"
        "- C15_alliteration_consonance: Do ≥2 stanzas show clear within‑line alliteration/consonance beyond incidental repeats?\n"
        "- C16_arc_order: Do the arc beats appear in canonical order (warning → preparation → encounter → decisive act → return/celebration)?\n"
        "- C17_no_verbatim_lines: Does no line exactly match the canonical poem? Normalize quotes/dashes/whitespace; if any line equals a line in the reference poem, answer 'no'.\n"
        "- C18_canonical_budget: Are distinct canonical tokens ≤8, favoring new coinages?\n"
        "- C19_syllable_tightness: In every quatrain stanza, are longer lines ≈8–9 syllables and shorter lines ≈5–7 (Jabberwocky’s ~8/6 pattern)?\n"
    "- C20_rhyme_variety: Across stanzas, are (2,4) end‑rhymes varied (no exact end word reused >2 times excluding the ring echo)?\n"
    "- C21_lexical_repetition_guard: Outside the ring echo, is no single content word overused (e.g., >5 times or >8% of content words)?\n"
    "- C22_coinage_variety: Do coinages show ≥4 distinct roots (no single coined suffix accounts for >50% of coinages)?\n"
    "- C23_topic_adherence: Does the poem clearly address the given topic (named or evident) without substituting a different subject?\n"
    "- C24_subtext: Beyond surface action, is there a coherent implied layer (motif/undertone) detectable across the poem?\n\n"
        "Canonical lexicon: " + ", ".join(CANONICAL_LEXICON) + "\n\n"
        "Format your output exactly as follows:\n"
        "<think>\n"
        + "\n".join([f"<{k}_think>…your brief reasoning…</{k}_think>" for k in tags])
        + "\n"
        "</think>\n\n"
        "Then, on new lines, the final decision tags only (one per line), exactly these tags filled with yes/no, in order:\n"
        + "\n".join([f"<{k}>yes|no</{k}>" for k in tags])
        + "\n\n"
        "Calibration examples (do not copy answers; tags suffixed with _demo so they are not parsed):\n"
        "<example>\n<poem>" + HIGH_EXAMPLE + "</poem>\n<think>\n"
        "<C1_demo_think>Title present</C1_demo_think>\n"
        "<C3_demo_think>quatrains=8; alt_hits=6 (75.0%) -> yes</C3_demo_think>\n"
        "<C4_demo_think>quatrains=8; rhyme(2,4) hits=7 (87.5%) -> yes</C4_demo_think>\n"
        "<C5_demo_think>Ring echo present -> yes</C5_demo_think>\n"
        "<C6_demo_think>Admonition present -> yes</C6_demo_think>\n"
        "<C7_demo_think>Preparation present -> yes</C7_demo_think>\n"
        "<C8_demo_think>Encounter present -> yes</C8_demo_think>\n"
        "<C9_demo_think>Decisive action present -> yes</C9_demo_think>\n"
        "<C10_demo_think>Return/celebration present -> yes</C10_demo_think>\n"
        "<C11_demo_think>distinct_coinages=12 -> yes</C11_demo_think>\n"
        "<C12_demo_think>stanzas_with_coinage=8/8 -> yes</C12_demo_think>\n"
        "<C13_demo_think>Creature named (Sucrowock) -> yes</C13_demo_think>\n"
        "<C14_demo_think>Onomatopoeia (Pop!, Hiss!, etc.) -> yes</C14_demo_think>\n"
        "<C15_demo_think>Alliteration in multiple stanzas -> yes</C15_demo_think>\n"
        "<C16_demo_think>Arc sequence present in order -> yes</C16_demo_think>\n"
        "<C17_demo_think>No verbatim canonical lines -> yes</C17_demo_think>\n"
        "<C18_demo_think>Canonical tokens <=8 -> yes</C18_demo_think>\n"
        "<C19_demo_think>quatrains=8; syllable_hits=6 (75.0%); samples: 8/6/8/6 | 9/6/8/6 -> no</C19_demo_think>\n"
        "<C20_demo_think>unique_endings=7; max_repeat=1 -> yes</C20_demo_think>\n"
        "<C21_demo_think>content_tokens≈180; top_word='day' x3 (1.7%) -> yes</C21_demo_think>\n"
        "<C22_demo_think>coinages=12; distinct_suffixes>=8; top_suffix_share<=33% -> yes</C22_demo_think>\n"
        "<C23_demo_think>Topic explicitly sustained throughout -> yes</C23_demo_think>\n"
        "<C24_demo_think>Consistent undertone/subtext present -> yes</C24_demo_think>\n"
        "</think>\n<answers_demo>\n"
        + "\n".join([f"<{k}_demo>yes</{k}_demo>" for k in RUBRIC_SHORT])
        + "\n</answers_demo>\n</example>\n\n"
        "<example>\n<poem>" + MEDIUM_EXAMPLE + "</poem>\n<think>\n"
        "<C1_demo_think>Title present</C1_demo_think>\n"
        "<C2_demo_think>stanzas=8; quatrains=7 (87.5%) -> no (require all quatrains; total 5–8)</C2_demo_think>\n"
        "<C3_demo_think>quatrains=7; alt_hits=3 (42.9%) -> no</C3_demo_think>\n"
        "<C4_demo_think>quatrains=7; rhyme(2,4) hits=5 (71.4%) -> yes</C4_demo_think>\n"
        "<C5_demo_think>Ring echo weak/uncertain -> no (must be clear)</C5_demo_think>\n"
        "<C6_demo_think>Admonition present -> yes</C6_demo_think>\n"
        "<C7_demo_think>Preparation present -> yes</C7_demo_think>\n"
        "<C8_demo_think>Encounter present -> yes</C8_demo_think>\n"
        "<C9_demo_think>Decisive action present -> yes</C9_demo_think>\n"
        "<C10_demo_think>Return present -> yes</C10_demo_think>\n"
        "<C11_demo_think>distinct_coinages=9 -> yes</C11_demo_think>\n"
        "<C12_demo_think>stanzas_with_coinage=6/8 -> no</C12_demo_think>\n"
        "<C13_demo_think>Creature named -> yes</C13_demo_think>\n"
        "<C14_demo_think>Onomatopoeia present -> yes</C14_demo_think>\n"
        "<C15_demo_think>Alliteration present -> yes</C15_demo_think>\n"
        "<C16_demo_think>Arc sequence partially out of order -> no</C16_demo_think>\n"
        "<C17_demo_think>No verbatim lines -> yes</C17_demo_think>\n"
        "<C18_demo_think>Canonical budget ok -> yes</C18_demo_think>\n"
        "<C19_demo_think>quatrains=7; syllable_hits=2 (28.6%); samples: 10/7/10/7 | 9/7/10/7 -> no</C19_demo_think>\n"
        "<C20_demo_think>unique_endings=3; max_repeat=3 -> no</C20_demo_think>\n"
        "<C21_demo_think>content_tokens≈170; top_word='diet' x4 (2.4%) -> yes</C21_demo_think>\n"
        "<C22_demo_think>coinages=9; distinct_suffixes=5; top_suffix_share≈44% -> yes</C22_demo_think>\n"
        "<C23_demo_think>Topic present but drifts minimally -> yes</C23_demo_think>\n"
        "<C24_demo_think>Subtext unclear/weak -> no</C24_demo_think>\n"
        "</think>\n<answers_demo>\n"
        + "\n".join([
            "<C1_demo>yes</C1_demo>",
            "<C2_demo>no</C2_demo>",
            "<C3_demo>no</C3_demo>",
            "<C4_demo>yes</C4_demo>",
            "<C5_demo>no</C5_demo>",
            "<C6_demo>yes</C6_demo>",
            "<C7_demo>yes</C7_demo>",
            "<C8_demo>yes</C8_demo>",
            "<C9_demo>yes</C9_demo>",
            "<C10_demo>yes</C10_demo>",
            "<C11_demo>yes</C11_demo>",
            "<C12_demo>no</C12_demo>",
            "<C13_demo>yes</C13_demo>",
            "<C14_demo>yes</C14_demo>",
            "<C15_demo>yes</C15_demo>",
            "<C16_demo>no</C16_demo>",
            "<C17_demo>yes</C17_demo>",
            "<C18_demo>yes</C18_demo>",
            "<C19_demo>no</C19_demo>",
            "<C20_demo>no</C20_demo>",
            "<C21_demo>yes</C21_demo>",
            "<C22_demo>yes</C22_demo>",
            "<C23_demo>yes</C23_demo>",
            "<C24_demo>no</C24_demo>",
        ])
        + "\n</answers_demo>\n</example>\n\n"
        "<example>\n<poem>"
        + VERY_LOW_EXAMPLE
        + "</poem>\n<think>\n"
        + "\n".join(
            [
                "<C1_demo_think>Title present</C1_demo_think>",
                "<C2_demo_think>stanzas=8; quatrains=3 (37.5%) -> no</C2_demo_think>",
                "<C3_demo_think>quatrains=3; alt_hits=0 (0.0%) -> no</C3_demo_think>",
                "<C4_demo_think>quatrains=3; rhyme(2,4) hits=1 (33.3%) -> no</C4_demo_think>",
                "<C5_demo_think>No ring echo -> no</C5_demo_think>",
                "<C6_demo_think>No admonition -> no</C6_demo_think>",
                "<C7_demo_think>No preparation -> no</C7_demo_think>",
                "<C8_demo_think>No clear encounter -> no</C8_demo_think>",
                "<C9_demo_think>No decisive action -> no</C9_demo_think>",
                "<C10_demo_think>No return/celebration -> no</C10_demo_think>",
                "<C11_demo_think>coinages<8 -> no</C11_demo_think>",
                "<C12_demo_think>stanzas_with_coinage<50% -> no</C12_demo_think>",
                "<C13_demo_think>No creature -> no</C13_demo_think>",
                "<C14_demo_think>No onomatopoeia -> no</C14_demo_think>",
                "<C15_demo_think>No alliteration -> no</C15_demo_think>",
            "<C16_demo_think>Arc sequence broken/out of order -> no</C16_demo_think>",
                "<C17_demo_think>Verbatim issues -> no</C17_demo_think>",
                "<C18_demo_think>Canonical budget exceeded -> no</C18_demo_think>",
                "<C19_demo_think>No syllable control -> no</C19_demo_think>",
                "<C20_demo_think>Poor rhyme variety -> no</C20_demo_think>",
                "<C21_demo_think>Overused lexicon -> no</C21_demo_think>",
                "<C22_demo_think>Coinage not varied -> no</C22_demo_think>",
                "<C23_demo_think>Topic unclear/shifted -> no</C23_demo_think>",
                "<C24_demo_think>No coherent subtext -> no</C24_demo_think>",
        ]
        )
        + "\n</think>\n<answers_demo>\n"
        + "\n".join(
            [
                "<C1_demo>no</C1_demo>",
                "<C2_demo>no</C2_demo>",
                "<C3_demo>no</C3_demo>",
                "<C4_demo>no</C4_demo>",
                "<C5_demo>no</C5_demo>",
                "<C6_demo>no</C6_demo>",
                "<C7_demo>no</C7_demo>",
                "<C8_demo>no</C8_demo>",
                "<C9_demo>no</C9_demo>",
                "<C10_demo>no</C10_demo>",
                "<C11_demo>no</C11_demo>",
                "<C12_demo>no</C12_demo>",
                "<C13_demo>no</C13_demo>",
                "<C14_demo>no</C14_demo>",
                "<C15_demo>no</C15_demo>",
                "<C16_demo>no</C16_demo>",
                "<C17_demo>no</C17_demo>",
                "<C18_demo>no</C18_demo>",
                "<C19_demo>no</C19_demo>",
                "<C20_demo>no</C20_demo>",
                "<C21_demo>no</C21_demo>",
                "<C22_demo>no</C22_demo>",
                "<C23_demo>no</C23_demo>",
                "<C24_demo>no</C24_demo>",
            ]
        )
        + "\n</answers_demo>\n</example>\n\n"
    )

def build_judge_xml_prompt_v2() -> str:
    # Exclude structural C2 from the judge tag set
    tags = [RUBRIC_SHORT[i] for i, k in enumerate(RUBRIC_KEYS) if not k.endswith("quatrain_shape")]
    # Descriptions by base name for maintainability
    descs = {
        "title_present": "Is there a non-empty title line before the first stanza (not part of stanza text)?",
        "ballad_meter_echo": "In ≥60% of stanzas, do lines alternate longer/shorter with ≥2 content-word difference?",
        "ballad_rhyme": "In ≥60% of stanzas, do lines (2,4) rhyme (allowing slant rhyme), and avoid AABB dominance?",
        "ring_composition": "Does the final stanza echo the opening with ≥2 repeated content words/phrases or a clear refrain?",
        "warning_admonition": "Is there an early admonition (e.g., ‘Beware …’) or equivalent caution to the protagonist?",
        "preparation_armament": "Before the encounter, does the protagonist prepare (tool/resolve/wait/plan)?",
        "encounter_confrontation": "Is there a clear meeting between protagonist and adversary/obstacle?",
        "slaying_decisive_action": "Is there a decisive act that resolves the central tension?",
        "return_celebration": "Is there a return/homecoming and jubilant acknowledgement?",
        "coinage_count": "Are there ≥8 distinct invented coinages (not canonical or standard English)?",
        "coinage_spread": "Does each stanza contain ≥1 coinage?",
        "creature_naming": "Is a non‑canonical creature/entity named and central to action (not ‘Jabberwock’)?",
        "onomatopoeia": "Are there ≥2 onomatopoeic bursts (e.g., ‘snicker‑snack!’, ‘Pop!’, ‘Hiss!’)?",
        "alliteration_consonance": "Do ≥2 stanzas show clear within‑line alliteration/consonance beyond incidental repeats?",
        "arc_order": "Do the arc beats appear in canonical order (warning → preparation → encounter → decisive act → return/celebration)?",
        "no_verbatim_lines": "Does no line exactly match the canonical poem? Normalize quotes/dashes/whitespace.",
        "canonical_budget": "Are distinct canonical tokens ≤8, favoring new coinages?",
        "syllable_tightness": "In quatrain stanzas, are longer lines ≈8–9 syllables and shorter lines ≈5–7?",
        "rhyme_variety": "Across stanzas, are (2,4) end‑rhymes varied (no exact end word reused >2 times excluding the ring echo)?",
        "lexical_repetition_guard": "Outside the ring echo, is no single content word overused (e.g., >5 times or >8%)?",
        "coinage_variety": "Do coinages show ≥4 distinct roots (no single coined suffix accounts for >50%)?",
        "topic_adherence": "Does the poem clearly address the given topic (named or evident) without substituting a different subject?",
        "subtext": "Beyond surface action, is there a coherent implied layer across the poem?",
    }
    bullets = []
    for i, key in enumerate(RUBRIC_KEYS):
        base = key.split("_", 1)[1]
        bullets.append(f"- {RUBRIC_SHORT[i]}_{base}: {descs.get(base, base)}\n")
    think_list = "\n".join([f"<{k}_think>…your brief reasoning…</{k}_think>" for k in tags])
    answer_list = "\n".join([f"<{k}>yes|no</{k}>" for k in tags])
    demo_think = "\n".join([f"<{k}_demo_think>example reasoning</{k}_demo_think>" for k in tags])
    return (
        "You are grading whether a model-written poem matches the style of "
        "Lewis Carroll's 'Jabberwocky'.\n\n"
        "First, produce a structured <think> block. Then produce the final decision tags.\n"
        "In the <think> block use <C1_think>…</C1_think> … to record brief reasoning for each criterion.\n"
        "Do NOT use <C1> inside <think>.\n\n"
        "Questions (binary). Answer each with 'yes' or 'no' only in the final decision tags.\n"
        "Strictness: If a check is borderline, partially met, or uncertain, answer 'no'. Only answer 'yes' when the criterion is clearly and definitively satisfied.\n"
        + "".join(bullets)
        + "\n"
        "Canonical lexicon: " + ", ".join(CANONICAL_LEXICON) + "\n\n"
        "Format your output exactly as follows:\n"
        "<think>\n" + think_list + "\n</think>\n\n"
        "Then, on new lines, the final decision tags only (one per line), exactly these tags filled with yes/no, in order:\n"
        + answer_list + "\n\n"
        "Calibration example (tags suffixed with _demo so they are not parsed):\n"
        "<example>\n<poem>" + HIGH_EXAMPLE + "</poem>\n<think>\n" + demo_think + "\n</think>\n</example>\n\n"
        "<example>\n<poem>" + MEDIUM_EXAMPLE + "</poem>\n<think>\n" + demo_think + "\n</think>\n</example>\n\n"
        "<example>\n<poem>" + LOW_EXAMPLE + "</poem>\n<think>\n" + demo_think + "\n</think>\n</example>\n"
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

    # Minimal (standard phrasing; grammatically consistent)
    minimal_templates = [
        "Write a poem in the style of Lewis Carroll's 'Jabberwocky'. Your prompt is \"{topic}\". Output only the titled poem.",
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
    # High (single, non-prescriptive hint that lists what will be graded)
    high_templates = [
        (
            "Write a poem in the style of Lewis Carroll's 'Jabberwocky'. Your prompt is \"{topic}\". "
            "Your poem will be graded for adherence to these criteria: "
            "title; meter; rhyme; ring (ending echoes the beginning); warning; preparation; encounter; decisive act; return; "
            "coinages; coinage spread; creature naming; onomatopoeia; alliteration; arc order; no verbatim copying; canonical budget "
            "(limit use of distinctive words from the original poem); syllable tightness; rhyme variety; repetition guard; coinage variety; "
            "topic adherence; subtext. Output only the titled poem."
        )
    ]

    def sample_profile() -> str:
        if profile != "mixed":
            return profile
        mix_in = hint_mix or {"high": 0.2, "medium": 0.6, "minimal": 0.2}
        # Backward-compat: allow heavy/light keys
        mix = {_canon_profile(k): float(v) for k, v in mix_in.items()}
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
    expected_stanzas: int = 7,
    structure_floor_min: float = 0.5,
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
            "luthier's soundpost setter", "violin purfling knife", "mandolin tonebar", "fiddle rosin dust",
            "lead type in a composing stick", "ink brayer and chase", "makeready under tympan", "reglet and furniture",
            "balance spring collet", "blued screw in a movement", "jewel bearing oil", "escapement pallet stone",
            "fid for splicing four‑strand", "tarred marline hitch", "parrel bead on a gaff", "monkey's fist knot",
            "verglas on granite", "old piton scar", "dulfersitz burn", "summit prayer flag",
            "sencha kyusu drip", "wabi‑sabi tea crackle", "kiln‑kissed shino glaze", "kintsugi seam of gold",
            "orris butter in a vial", "oakmoss tincture", "ambergris fleck", "civet note and drydown",
            "flex nib on laid paper", "sizing in the rag pulp", "deckled edge in twilight", "sumi ink grind",
            "selenium‑toned fiber print", "split‑grade enlarger burn", "silver gelatin wash", "contact sheet with grease pencil",
            "night‑blooming cereus vigil", "lilac cuttings in twine", "peony ants at dawn", "fern fiddlehead uncurling",
            "pantograph arcing blue", "third‑rail hum at dusk", "interlocking tower key", "crosstie creosote scent",
            "hollow grind on an O1 blade", "spokeshave whisper", "honing burr and slurry", "quarter‑sawn shimmer",
            "letter kept in a cedar box", "childhood marble in a jar", "farewell at a platform", "rain on a tin roof",
            "alpenglow on scree", "murmuration over stubble", "noctilucent clouds", "blue hour on snow",
            # Added to ensure ample unique eval topics (evocative subcultures)
            "nixie tube warm glow", "theremin heterodyne wail", "modular synth patch spaghetti", "vactrol lag in filter",
            "cassette wow and flutter", "tape splicing block", "oscilloscope lissajous bloom", "numbers station drift",
            "Morse straight key click", "linocut brayer chatter", "burin bite on copper", "chine‑collé whisper",
            "mezzotint rocker burr", "krenovian plane throat", "kumiko asanoha lattice", "urushi lacquer cure",
            "sashiko boro patch", "shou sugi ban cedar", "mokume‑gane billet twist", "lost‑wax sprue tree",
            "kiln witness cone bend", "scythe peening ring", "slipjoint walk and talk", "straight razor strop draw",
            "badger knot bloom", "ebonite feed heat‑set", "nib tine micro‑mesh", "opal play‑of‑color flash",
            "agate burnisher gleam", "forged leaf scroll", "anvil hardy hole", "quenching brine hiss",
            "loom shuttle pick", "selvedge denim twill", "sourdough levain autolyse", "clay slip trailing",
            "fishtail gouge sweep", "obsidian blade knap", "kiridashi scribe line", "washi hinge whisper",
            "tatami edge heri", "orin bell hum", "zafu seam stitch", "pietra dura inlay",
            "intarsia veneer curl", "tinsmith stake song", "pewter inlay ribbon", "plum brown blueing bath",
            "plane iron camber",
        ]
    # Held-out topics for eval when using defaults
    rnd_topics = random.Random(seed)
    topics_shuffled = topics[:]
    rnd_topics.shuffle(topics_shuffled)
    if not user_supplied_topics:
        # only apply holdout automatically for the default topic list
        holdout_n = max(
            0, min(topic_holdout_n, len(topics_shuffled) // 5)
        )  # cap to 20% if list is short
        eval_topics = (
            topics_shuffled[:holdout_n]
            if holdout_n > 0
            else topics_shuffled[: max(1, len(topics_shuffled) // 10)]
        )
        train_topics = topics_shuffled[holdout_n:] if holdout_n > 0 else topics_shuffled
        # Guarantee at least 50 unique eval topics so n=50 yields unique prompts
        desired_eval_unique = min(len(topics_shuffled), max(50, 0))
        if len(eval_topics) < desired_eval_unique:
            # Pull additional unique topics from the remaining pool deterministically
            extra = []
            for t in topics_shuffled:
                if t not in eval_topics:
                    extra.append(t)
                if len(eval_topics) + len(extra) >= desired_eval_unique:
                    break
            if extra:
                eval_topics = list(eval_topics) + extra
                # Remove extras from train to keep sets disjoint
                train_topics = [t for t in train_topics if t not in set(extra)]
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
    # Build judge client with explicit per-request timeout and no internal retries
    try:
        judge_client = OpenAI(api_key=api_key, base_url=judge_base_url, timeout=judge_timeout, max_retries=0)
    except TypeError:
        judge_client = OpenAI(api_key=api_key, base_url=judge_base_url, timeout=judge_timeout)
    # Do not set temperature or other sampling knobs for the judge by default
    judge_sampling_args = judge_sampling_args or {}
    logger = logging.getLogger("jabberwocky")

    # Composite binary rubric keys (descriptive) — keep in sync with XML prompt
    # For parser stability and explorer compatibility, retain original numbering C1..C24
    RUBRIC_KEYS = [
        "C1_title_present",
        "C2_quatrain_shape",  # judged deterministically; judge likely returns empty
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
        "C16_arc_order",
        "C17_no_verbatim_lines",
        "C18_canonical_budget",
        "C19_syllable_tightness",
        "C20_rhyme_variety",
        "C21_lexical_repetition_guard",
        "C22_coinage_variety",
        "C23_topic_adherence",
        "C24_subtext",
    ]
    RUBRIC_SHORT = [
        "C1","C2","C3","C4","C5","C6","C7","C8","C9","C10",
        "C11","C12","C13","C14","C15","C16","C17","C18","C19","C20",
        "C21","C22","C23","C24",
    ]
    # XML field definitions: canonical name + alternative short tag
    RUBRIC_FIELDS = [(RUBRIC_KEYS[i], RUBRIC_SHORT[i]) for i in range(len(RUBRIC_KEYS))]

    # XML rubric prompt (single source of truth)
    judge_xml_prompt = build_judge_xml_prompt_v2()

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
        # Persist raw parsed poem text for deterministic checks
        try:
            state["jw_poem_text"] = response_text
        except Exception:
            pass

        # If no reference poem is provided (e.g., unit tests), skip the judge and return zeros
        if not isinstance(answer, str) or not answer.strip():
            zeros = {k: 0 for k in RUBRIC_KEYS}
            zeros["sum"] = 0
            zeros["label"] = "very_low"
            state["jw_judge_xml_last"] = zeros
            return zeros

        # Extract a topic string from the user prompt; do not expose full instructions to the judge
        def _extract_topic(q: str) -> str:
            import re as _re

            for pat in [
                r"about\s+(.+?)\s+in the style",
                r"on\s+(.+?)\s+in the style",
                r"about\s+(.+?)\s*\.",
            ]:
                m = _re.search(pat, q, flags=_re.IGNORECASE)
                if m:
                    return m.group(1).strip()
            return ""

        topic_only = _extract_topic(question)
        # Provide helpful quantitative hints for the judge (not binding):
        # approximate syllables per line and per-stanza breakdown to aid C19.
        try:
            model_lines_raw = [ln for ln in response_text.splitlines()]
            model_sylls = [str(estimate_syllables_line(ln)) for ln in model_lines_raw if ln.strip()]
            approx_block = "<approx>\n" + ",".join(model_sylls) + "\n</approx>\n\n"
        except Exception:
            approx_block = ""

        jp = (
            judge_xml_prompt
            + "\n<topic>\n"
            + topic_only
            + "\n</topic>\n\n"
            + "<reference_poem>\n"
            + answer
            + "\n</reference_poem>\n\n"
            + "<model_poem>\n"
            + response_text
            + "\n</model_poem>\n"
            + approx_block
        )
        cache = state.get("jw_judge_xml_cache")
        if isinstance(cache, dict) and jp in cache:
            return cache[jp]
        # Try a few times to handle transient 429/5xx; enforce per-call timeout if supported
        attempts = 3
        backoff = 2.0
        txt = ""
        last_exc: Exception | None = None
        for i in range(attempts):
            try:
                try:
                    jr = judge_client.chat.completions.create(
                        model=judge_model,
                        messages=[{"role": "user", "content": jp}],
                        timeout=judge_timeout,  # per-call timeout if SDK supports
                        **judge_sampling_args,
                    )
                except TypeError:
                    jr = judge_client.chat.completions.create(
                        model=judge_model,
                        messages=[{"role": "user", "content": jp}],
                        **judge_sampling_args,
                    )
                txt = str(jr.choices[0].message.content or "")
                if not txt:
                    state["jw_judge_error"] = "empty_response"
                if log_judge_debug:
                    logger.info("[judge-xml] %s", txt[:300])
                last_exc = None
                break
            except Exception as e:
                last_exc = e
                s = str(e)
                if log_judge_debug:
                    logger.warning("[judge-xml-exc attempt %d/%d] %s", i + 1, attempts, s)
                transient = any(tok in s for tok in ["429", "Rate limit", "timeout", "ECONNRESET", "5xx", "Gateway", "Too Many Requests"])  # best-effort
                if i < attempts - 1 and transient:
                    # Heuristic pause; if a reset header appears in text, honor it
                    sleep_s = backoff * (i + 1)
                    try:
                        import re as _re
                        m = _re.search(r"X-RateLimit-Reset[^0-9]*([0-9]{10,13})", s)
                        if m:
                            ts = int(m.group(1))
                            if ts > 1_000_000_000_000:
                                ts = ts / 1000.0
                            else:
                                ts = float(ts)
                            now = __import__("time").time()
                            sleep_s = max(sleep_s, ts - now)
                    except Exception:
                        pass
                    __import__("time").sleep(max(0.5, min(sleep_s, 30.0)))
                    continue
                # non-transient or last attempt: record and break
                break
        if last_exc is not None:
            if log_judge_debug:
                logger.warning("[judge-xml-final-exc] %s", last_exc)
            state["jw_judge_error"] = f"exception: {type(last_exc).__name__}: {last_exc}"
            txt = ""
        # normalize tags like "< C1 >yes</ C1 >" → "<C1>yes</C1>"
        import re as _re

        txt_norm = _re.sub(r"<\s*/\s*([A-Za-z0-9_]+)\s*>", r"</\1>", txt)
        txt_norm = _re.sub(r"<\s*([A-Za-z0-9_]+)\s*>", r"<\1>", txt_norm)
        parsed = rubric_xml_parser.parse(txt_norm)
        # store raw for debugging
        state["jw_judge_xml_raw"] = txt
        out: dict[str, int] = {}
        # First, collect judge bits from XML
        for i, k in enumerate(RUBRIC_KEYS):
            v = getattr(parsed, k, None)
            if not v:
                short_tag = RUBRIC_SHORT[i]
                v = getattr(parsed, short_tag, None)
            out[k] = 1 if str(v or "").strip().lower() == "yes" else 0

        # Deterministic guard: if any model line matches canonical exactly (after normalization), force C17 to 0
        try:
            model_lines = [ln for ln in response_text.splitlines() if ln.strip()]
            for ln in model_lines:
                ln_norm = _normalize_line(ln)
                # Exact normalized match
                if ln_norm in CANONICAL_LINES_NORM:
                    out["C17_no_verbatim_lines"] = 0
                    break
                # Near-verbatim: word bigram Jaccard + token overlap
                toks = _tokenize_words(ln_norm)
                if len(toks) < 3:
                    continue
                bgs = _bigrams(toks)
                for ctoks, cbgs in zip(_CANONICAL_TOKENS, _CANONICAL_BIGRAMS):
                    if not cbgs:
                        continue
                    # Require similar length (±1 token) to avoid false positives
                    if abs(len(toks) - len(ctoks)) > 1:
                        continue
                    inter = len(bgs & cbgs)
                    union = len(bgs | cbgs)
                    j = inter / union if union else 0.0
                    # Token coverage: proportion of toks that appear in ctoks
                    cover = sum(1 for t in toks if t in ctoks) / max(1, len(toks))
                    if j >= 0.6 and cover >= 0.75:
                        out["C17_no_verbatim_lines"] = 0
                        raise StopIteration
        except StopIteration:
            pass
        except Exception:
            pass

        s = sum(int(out.get(k, 0)) for k in RUBRIC_KEYS)
        # Label thresholds proportional to rubric length
        total = len(RUBRIC_KEYS)
        ratio = s / total if total else 0.0
        if ratio >= 0.83:
            label = "high"
        elif ratio >= 0.56:
            label = "medium"
        elif ratio >= 0.33:
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

    #
    # Scoring architecture
    # ---------------------
    # Historically the environment returned a single LLM‑judge composite over 24
    # binary criteria. To support sustainable, lower‑variance scoring, we
    # introduce deterministic rewards for structure that an algorithm can judge
    # reliably. We retain the LLM rubric for the stylistic/semantic parts.
    #
    # Weights are chosen such that totals still live in [0,1]. The judge keeps
    # the majority of signal (0.7), while deterministic structure contributes
    # 0.3 split across stanza count, quatrain shape, and alternating indentation.
    #
    rubric = vf.Rubric(parallelize_scoring=False)

    # -------- Deterministic structure rewards --------
    import re as _re

    def _split_stanzas(poem: str) -> list[list[str]]:
        """Robust stanza splitter.

        - Normalizes CRLF/CR to LF and NBSPs
        - Splits on one or more blank lines (spaces/tabs allowed)
        - Drops a leading single-line block as title (heuristic)
        - Returns stanzas as lists of non-empty lines (preserving leading indent)
        """
        s = str(poem or "")
        s = s.replace("\r\n", "\n").replace("\r", "\n").replace("\u00A0", " ")
        # Trim outer whitespace but keep internal newlines
        s = s.strip(" \t\n")
        blocks = _re.split(r"\n[ \t]*\n+", s)
        out: list[list[str]] = []
        for b in blocks:
            raw_lines = b.split("\n")
            lines = [ln for ln in raw_lines if ln.strip()]
            if lines:
                out.append([ln.rstrip("\r") for ln in raw_lines if ln.strip()])
        # Heuristic: drop a leading single-line block as title
        if out and len(out[0]) == 1 and len(out) > 1:
            out = out[1:]
        return out

    def stanza_count_reward(prompt, completion, answer, state, **_kwargs) -> float:
        stanzas = _split_stanzas(state.get("jw_poem_text") or completion)
        n = len(stanzas)
        # Target defaults to canonical 7 but can be overridden via expected_stanzas
        expected = int(expected_stanzas or 7)
        d = abs(n - expected)
        if d == 0:
            return 1.0
        if d == 1:
            return 0.6
        if d == 2:
            return 0.2
        return 0.0
    stanza_count_reward.__name__ = "R_stanza_count"

    def quatrain_shape_reward(prompt, completion, answer, state, **_kwargs) -> float:
        stanzas = _split_stanzas(state.get("jw_poem_text") or completion)
        if not stanzas:
            return 0.0
        good = 0
        total = 0
        for sz in stanzas:
            # count non‑empty logical lines — ignore accidental blank spacers
            lines = [ln for ln in sz if ln.strip()]
            if not lines:
                continue
            total += 1
            if len(lines) == 4:
                good += 1
        return good / max(1, total)
    quatrain_shape_reward.__name__ = "R_quatrain_shape"

    def alternating_indent_reward(prompt, completion, answer, state, **_kwargs) -> float:
        """Reward alternating indentation (lines 2 and 4 in each quatrain).

        Tabs or 4/6 spaces count as 1.0; 2 spaces count as 0.5. Lines 1 & 3
        are not penalized if indented; we simply reward correct even‑line
        indentation when present.
        """
        stanzas = _split_stanzas(state.get("jw_poem_text") or completion)
        scores: list[float] = []
        for sz in stanzas:
            lines = [ln for ln in sz if ln.strip()]
            if len(lines) < 2:
                continue
            targets = []
            if len(lines) >= 2:
                targets.append(lines[1])  # line 2
            if len(lines) >= 4:
                targets.append(lines[3])  # line 4
            for ln in targets:
                # count leading whitespace
                m = _re.match(r"^(\s+)", ln)
                if not m:
                    scores.append(0.0)
                    continue
                ws = m.group(1)
                if "\t" in ws:
                    scores.append(1.0)
                else:
                    nspaces = len(ws)
                    if nspaces in (4, 6):
                        scores.append(1.0)
                    elif nspaces == 2:
                        scores.append(0.5)
                    else:
                        scores.append(0.0)
        if not scores:
            return 0.0
        return sum(scores) / len(scores)
    alternating_indent_reward.__name__ = "R_indent_alternation"

    # Single composite: equal-weight over judge bits + deterministic proxies
    def composite_total(prompt, completion, answer, state, **_kwargs) -> float:
        jj = get_or_make_judge_xml(prompt, completion, answer, state)
        judge_yes = sum(int(jj.get(k, 0)) for k in RUBRIC_KEYS)
        r_stanza = stanza_count_reward(prompt, completion, answer, state)
        r_quatrain = quatrain_shape_reward(prompt, completion, answer, state)
        det = [
            r_stanza,
            r_quatrain,
            alternating_indent_reward(prompt, completion, answer, state),
            meter_alt_proxy_reward(prompt, completion, answer, state),
        ]
        total = judge_yes + sum(det)
        denom = len(RUBRIC_KEYS) + len(det)
        # Simple composite: equal weight across judge + deterministic metrics
        base = float(total) / float(max(1, denom))
        return base

    composite_total.__name__ = "overall_reward"
    rubric.add_reward_func(composite_total, weight=1.0)

    # Expose deterministic metrics (registration moved after all defs)

    def meter_alt_proxy_reward(prompt, completion, answer, state, **_kwargs) -> float:
        """Quintile-based echo of ballad meter (1&3 long, 2&4 short).

        For the poem:
          - Collect syllables per non-empty line
          - Compute p20, p40, p60, p80 (quintile cuts)
        For each stanza (first four lines only when available):
          - Hard match: 1&3 ≥ p80 and 2&4 ≤ p20 → 1.0
          - Medium:     1&3 ≥ p60 and 2&4 ≤ p40 → 0.6
          - Soft:       1&3 ≥ median(p50) and 2&4 ≤ p50 → 0.3
          - Else:       0.0
        Returns mean over stanzas (0 if none).
        """
        stanzas = _split_stanzas(state.get("jw_poem_text") or completion)
        if not stanzas:
            return 0.0
        all_lines = [ln for sz in stanzas for ln in sz if ln.strip()]
        if not all_lines:
            return 0.0
        syll = [estimate_syllables_line(ln) for ln in all_lines]
        p20 = _percentile(syll, 0.20)
        p40 = _percentile(syll, 0.40)
        p50 = _percentile(syll, 0.50)
        p60 = _percentile(syll, 0.60)
        p80 = _percentile(syll, 0.80)
        scores = []
        for sz in stanzas:
            lines = [ln for ln in sz if ln.strip()]
            if len(lines) < 4:
                continue
            s1, s2, s3, s4 = [estimate_syllables_line(x) for x in lines[:4]]
            # Hard reject: any line too long
            if max(s1, s2, s3, s4) > SYLL_HARD_CAP:
                scores.append(0.0)
                continue
            hard = (s1 >= p80) + (s3 >= p80) + (s2 <= p20) + (s4 <= p20)
            med  = (s1 >= p60) + (s3 >= p60) + (s2 <= p40) + (s4 <= p40)
            soft = (s1 >= p50) + (s3 >= p50) + (s2 <= p50) + (s4 <= p50)
            # Normative bounds: ensure long lines live in [8..10] and short in <=7
            long_ok = (SYLL_LONG_MIN <= s1 <= SYLL_LONG_MAX) and (SYLL_LONG_MIN <= s3 <= SYLL_LONG_MAX)
            short_ok = (s2 <= SYLL_SHORT_MAX) and (s4 <= SYLL_SHORT_MAX)
            if hard == 4 and long_ok and short_ok:
                scores.append(1.0)
            elif med >= 3 and long_ok and (s2 <= SYLL_SHORT_MAX + 1) and (s4 <= SYLL_SHORT_MAX + 1):
                scores.append(0.6)
            elif soft >= 2 and (s1 >= SYLL_LONG_MIN) and (s3 >= SYLL_LONG_MIN) and (s2 <= SYLL_SHORT_MAX + 1) and (s4 <= SYLL_SHORT_MAX + 1):
                scores.append(0.3)
            else:
                scores.append(0.0)
        return sum(scores) / max(1, len(scores))
    meter_alt_proxy_reward.__name__ = "R_meter_alt_proxy"
    # Now that all deterministic functions exist, register them (weight 0)
    rubric.add_reward_func(stanza_count_reward, weight=0.0)
    rubric.add_reward_func(quatrain_shape_reward, weight=0.0)
    rubric.add_reward_func(alternating_indent_reward, weight=0.0)
    rubric.add_reward_func(meter_alt_proxy_reward, weight=0.0)

    def syllable_outlier_reward(prompt, completion, answer, state, **_kwargs) -> float:
        stanzas = _split_stanzas(state.get("jw_poem_text") or completion)
        lines = [ln for sz in stanzas for ln in sz if ln.strip()]
        if not lines:
            return 0.0
        counts = [estimate_syllables_line(ln) for ln in lines]
        hard = sum(1 for c in counts if c > SYLL_HARD_CAP)
        return max(0.0, 1.0 - hard / max(1, len(counts)))
    syllable_outlier_reward.__name__ = "R_syllable_outliers"
    rubric.add_reward_func(syllable_outlier_reward, weight=0.0)

    # C-coded aliases for deterministic metrics so downstream tooling can rely on C-keys
    for det_key, fn in zip(DET_KEYS, [
        stanza_count_reward,
        quatrain_shape_reward,
        alternating_indent_reward,
        meter_alt_proxy_reward,
        syllable_outlier_reward,
    ]):
        def make_alias(k, f):
            def _alias(prompt, completion, answer, state, **_kw):
                return f(prompt, completion, answer, state, **_kw)
            _alias.__name__ = k
            return _alias
        rubric.add_reward_func(make_alias(det_key, fn), weight=0.0)

    # Back-compat alias so explorer radar (which expects C2_quatrain_shape) keeps working
    def C2_quatrain_shape(prompt, completion, answer, state, **_kwargs) -> float:
        # Return binary yes/no like the old judge: require all stanzas to be quatrains
        v = quatrain_shape_reward(prompt, completion, answer, state)
        return 1.0 if v >= 0.999 else 0.0
    rubric.add_reward_func(C2_quatrain_shape, weight=0.0)

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
        # Allow long generations by default; providers may clamp internally
        # Do not cap max_tokens here; let CLI (--actor-max-tokens) or provider defaults decide
        sampling_args={},
        **kwargs,
    )
    return env
    # Ensure vf-eval uses a pleasant, compact pretty-printer
    _install_pretty_printer_once()
