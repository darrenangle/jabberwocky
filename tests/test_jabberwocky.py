from __future__ import annotations

import os
import re

import verifiers as vf


def normalize_xml(s: str) -> str:
    # Mirrors normalization in the environment to tolerate spaced tags
    s = re.sub(r"<\s*/\s*([A-Za-z0-9_]+)\s*>", r"</\1>", s)
    s = re.sub(r"<\s*([A-Za-z0-9_]+)\s*>", r"<\1>", s)
    return s


def test_xml_parser_normalizes_spaced_and_descriptive_tags():
    fields = [
        ("C1_title_present", "C1"),
        ("C2_quatrain_shape", "C2"),
        ("C3_ballad_meter_echo", "C3"),
    ]
    parser = vf.XMLParser(fields=fields, answer_field="C1_title_present")
    raw = """
    < C1_title_present > yes </ C1_title_present >
    <C2_quatrain_shape>no</C2_quatrain_shape>
    <C3_ballad_meter_echo>yes</C3_ballad_meter_echo>
    """
    parsed = parser.parse(normalize_xml(raw))
    assert (parsed.C1_title_present or "").strip().lower() == "yes"
    assert (parsed.C2_quatrain_shape or "").strip().lower() == "no"
    assert (parsed.C3_ballad_meter_echo or "").strip().lower() == "yes"


def test_profile_aliases_and_sampler_holdout_behavior():
    # Ensure we can construct the environment without actually calling the judge.
    # A dummy key is enough since no evaluation happens in this test.
    os.environ.setdefault("OPENAI_API_KEY", "sk-dummy")

    # Load small datasets deterministically; rely on default topic pool and seed.
    env = vf.load_environment(
        "jabberwocky",
        num_train_examples=30,
        num_eval_examples=20,
        seed=123,
        topic_holdout_n=10,
        hint_profile="heavy",  # alias; should map to "high" internally
    )

    train_ds = env.get_dataset()
    eval_ds = env.get_eval_dataset()

    # Extract topics from info
    train_topics = {row["info"]["topic"] for row in train_ds}
    eval_topics = {row["info"]["topic"] for row in eval_ds}

    # When using default topics + holdout, eval topics should be disjoint from train
    assert train_topics.isdisjoint(eval_topics)

    # Re-create with same seed; first train topic should match (reproducibility)
    env2 = vf.load_environment(
        "jabberwocky",
        num_train_examples=30,
        num_eval_examples=20,
        seed=123,
        topic_holdout_n=10,
        hint_profile="heavy",
    )
    train_ds2 = env2.get_dataset()
    assert train_ds[0]["info"]["topic"] == train_ds2[0]["info"]["topic"]


def test_same_seed_same_topics_across_hint_levels():
    os.environ.setdefault("OPENAI_API_KEY", "sk-dummy")

    # Set same seed; ensure topic order aligns across hint levels
    base_kwargs = dict(
        num_train_examples=25,
        num_eval_examples=15,
        seed=98765,
        topic_holdout_n=10,
    )

    env_min = vf.load_environment("jabberwocky", hint_profile="minimal", eval_hint_profile="minimal", **base_kwargs)
    env_med = vf.load_environment("jabberwocky", hint_profile="medium", eval_hint_profile="medium", **base_kwargs)
    env_high = vf.load_environment("jabberwocky", hint_profile="high", eval_hint_profile="high", **base_kwargs)

    ds_min = env_min.get_eval_dataset()
    ds_med = env_med.get_eval_dataset()
    ds_high = env_high.get_eval_dataset()

    # Compare first 10 topics for exact positional equality
    topics_min = [row["info"]["topic"] for row in ds_min][:10]
    topics_med = [row["info"]["topic"] for row in ds_med][:10]
    topics_high = [row["info"]["topic"] for row in ds_high][:10]
    assert topics_min == topics_med == topics_high

    # Ensure the prompt contains the topic and differs by hint style
    q_min = ds_min[0]["question"]
    q_med = ds_med[0]["question"]
    q_high = ds_high[0]["question"]
    t0 = topics_min[0]
    assert t0 in q_min and t0 in q_med and t0 in q_high
    # Medium/high should not be identical to minimal wording
    assert q_min != q_med or q_min != q_high


def test_rubric_includes_meter_proxy_metric():
    os.environ.setdefault("OPENAI_API_KEY", "sk-dummy")
    env = vf.load_environment("jabberwocky", num_train_examples=5, num_eval_examples=5, seed=42)
    # Reward functions include per-criterion metrics; ensure S4 meter proxy is present
    funcs = []
    for item in env.rubric.reward_funcs:
        try:
            f = item[0]
        except Exception:
            f = item
        funcs.append(f)
    names = {getattr(f, "__name__", "") for f in funcs}
    assert any(name.startswith("S4_meter_alt_proxy") for name in names), "S4 meter proxy missing"


def test_rubric_includes_new_variety_checks():
    os.environ.setdefault("OPENAI_API_KEY", "sk-dummy")
    env = vf.load_environment("jabberwocky", num_train_examples=5, num_eval_examples=5, seed=42)
    funcs = []
    for item in env.rubric.reward_funcs:
        try:
            f = item[0]
        except Exception:
            f = item
        funcs.append(f)
    names = {getattr(f, "__name__", "") for f in funcs}
    assert any(name.startswith("J15_rhyme_variety") for name in names), "J15 rhyme variety missing"
    assert any(name.startswith("J16_lexical_repetition_guard") for name in names), "J16 repetition guard missing"
    assert any(name.startswith("J17_coinage_variety") for name in names), "J17 coinage variety missing"


def test_same_seed_same_questions_within_level():
    os.environ.setdefault("OPENAI_API_KEY", "sk-dummy")
    base = dict(num_train_examples=5, num_eval_examples=12, seed=424242)
    env_a = vf.load_environment("jabberwocky", hint_profile="medium", eval_hint_profile="medium", **base)
    env_b = vf.load_environment("jabberwocky", hint_profile="medium", eval_hint_profile="medium", **base)
    qa = [row["question"] for row in env_a.get_eval_dataset()]
    qb = [row["question"] for row in env_b.get_eval_dataset()]
    assert qa == qb


def test_medium_template_distribution_is_balanced_with_seed():
    os.environ.setdefault("OPENAI_API_KEY", "sk-dummy")
    env = vf.load_environment(
        "jabberwocky",
        num_train_examples=5,
        num_eval_examples=50,
        seed=101010,
        hint_profile="medium",
        eval_hint_profile="medium",
    )
    ds = env.get_eval_dataset()
    qs = [row["question"] for row in ds]
    # Count two known medium template phrases
    t1 = "Use a few invented coinages and a named creature"
    t2 = "Keep a playful ballad cadence with some rhyme"
    c1 = sum(1 for q in qs if t1 in q)
    c2 = sum(1 for q in qs if t2 in q)
    assert c1 > 0 and c2 > 0
    # With two templates and deterministic alternation, counts should be close
    diff = abs(c1 - c2)
    assert diff <= len(qs) * 0.3, f"unbalanced medium distribution: c1={c1}, c2={c2}"


def test_near_verbatim_detector_flags_canonical_lines():
    # Import jabberwocky helpers directly
    import jabberwocky as jw

    def is_near_verbatim(line: str) -> bool:
        toks = jw._tokenize_words(line)
        if len(toks) < 3:
            return False
        bgs = jw._bigrams(toks)
        for ctoks, cbgs in zip(jw._CANONICAL_TOKENS, jw._CANONICAL_BIGRAMS):
            if abs(len(toks) - len(ctoks)) > 1:
                continue
            inter = len(bgs & cbgs)
            union = len(bgs | cbgs)
            j = inter / union if union else 0.0
            cover = sum(1 for t in toks if t in ctoks) / max(1, len(toks))
            if j >= 0.6 and cover >= 0.75:
                return True
        return False

    # Common near-verbatim lines that models regurgitate
    l1 = "So rested he by the Tumtum tree"
    l2 = "And stood awhile in thought."
    # Exact canonical (case/punct variants) should be flagged
    assert is_near_verbatim(l1)
    assert is_near_verbatim(l2)
    assert is_near_verbatim("so rested he by the tumtum tree")
    assert is_near_verbatim("And stood awhile in thought")  # no period
    assert is_near_verbatim("‘And stood awhile in thought’")  # smart quotes

    # Canonical "vorpal sword" line vs near variants
    assert is_near_verbatim("He took his vorpal sword in hand")
    assert is_near_verbatim("He took his vorpal sword in hand;")
    # Non-canonical minimal change should NOT be flagged
    assert not is_near_verbatim("He took his vorpal saw in hand")

    # A non-canonical novel line should not be flagged
    l3 = "We brewed a brew of nonsense tea"
    assert not is_near_verbatim(l3)


def _make_simple_poem(stanzas: int, indent: str = "    ") -> str:
    # Build a quatrain poem with optional indentation for lines 2 and 4
    blocks = []
    for i in range(stanzas):
        q = [
            f"Line A {i}",
            f"{indent}Line B {i}",
            f"Line C {i}",
            f"{indent}Line D {i}",
        ]
        blocks.append("\n".join(q))
    return "\n\n".join(blocks)


def test_deterministic_rewards_happy_paths():
    import jabberwocky as jw
    os.environ.setdefault("OPENAI_API_KEY", "sk-dummy")
    env = vf.load_environment("jabberwocky", num_train_examples=1, num_eval_examples=1, expected_stanzas=7)
    # Fetch reward functions by name
    funcs = {}
    for item in env.rubric.reward_funcs:
        f = item[0] if isinstance(item, (list, tuple)) else item
        funcs[getattr(f, "__name__", "")] = f
    poem = _make_simple_poem(7, indent="    ")
    # Quatrain shape should be perfect
    assert funcs["S2_quatrain_shape"](None, poem, None, {}) == 1.0
    # Stanza count perfect
    assert funcs["S1_stanza_count"](None, poem, None, {}) == 1.0
    # Alternating indent with 4 spaces is full credit
    assert funcs["S3_indent_alternation"](None, poem, None, {}) == 1.0


def test_deterministic_edge_cases_blank_lines_and_two_space_indent():
    os.environ.setdefault("OPENAI_API_KEY", "sk-dummy")
    env = vf.load_environment("jabberwocky", num_train_examples=1, num_eval_examples=1, expected_stanzas=7)
    funcs = {}
    for item in env.rubric.reward_funcs:
        f = item[0] if isinstance(item, (list, tuple)) else item
        funcs[getattr(f, "__name__", "")] = f

    # Poem with extra blank lines between stanzas should still count correctly
    blocks = []
    for i in range(7):
        blocks.append("\n".join([f"A{i}", "  B", f"C{i}", "  D"]))
    poem = ("\n\n\n").join(blocks)  # triple blank lines between stanzas
    assert funcs["S1_stanza_count"](None, poem, None, {}) == 1.0
    # Two-space indent should average 0.5 on targeted lines
    val = funcs["S3_indent_alternation"](None, poem, None, {})
    assert 0.45 <= val <= 0.55


def test_meter_alt_proxy_rewards_alternation():
    os.environ.setdefault("OPENAI_API_KEY", "sk-dummy")
    env = vf.load_environment("jabberwocky", num_train_examples=1, num_eval_examples=1, expected_stanzas=4)
    funcs = {}
    for item in env.rubric.reward_funcs:
        f = item[0] if isinstance(item, (list, tuple)) else item
        funcs[getattr(f, "__name__", "")] = f
    # Craft a poem where lines 1/3 are long-ish, 2/4 short-ish
    # Use eight clear one-syllable tokens to hit the 8–10 target
    long = "sun spark light gleam gold seam bright mend"
    short = "whiffle"
    st = []
    for i in range(4):
        st.append("\n".join([f"{long} {i}", f"    {short}", f"{long}", f"    {short}"]))
    poem = "\n\n".join(st)
    v = funcs["S4_meter_alt_proxy"](None, poem, None, {})
    assert v >= 0.6


def test_runon_lines_penalized_structure():
    # Visually looks like quatrains when wrapped, but actually 3-line stanzas
    os.environ.setdefault("OPENAI_API_KEY", "sk-dummy")
    env = vf.load_environment("jabberwocky", num_train_examples=1, num_eval_examples=1, expected_stanzas=7)
    funcs = {}
    for item in env.rubric.reward_funcs:
        f = item[0] if isinstance(item, (list, tuple)) else item
        funcs[getattr(f, "__name__", "")] = f

    stanza = (
        "'Twas slithern on the Slithy Sea, the squidchells weak and drail,\n"
        "All gorbling were the poltsnipes, the frantles brightly pale.\n"
        '"Beware the slippery Slorg, my son! The jaws that grip, the claws that flay!"\n'
    )  # only 3 explicit lines
    poem = "\n\n".join([stanza]*5)
    # Quatrain shape should be poor (<1.0)
    assert funcs["S2_quatrain_shape"](None, poem, None, {}) < 1.0
    # Composite should decrease with poor quatrain shape (still judge-weighted)
    overall = funcs["overall_reward"](None, poem, None, {})
    assert overall < 0.85


def test_syllable_estimator_reasonable_counts():
    import jabberwocky as jw
    # Basic checks: silent 'e', groups, 'table' kind of ending
    assert jw._estimate_syllables_word("make") >= 1
    assert 2 <= jw.estimate_syllables_line("The quick brown fox") <= 5
    # Lines with punctuation and quotes
    s = jw.estimate_syllables_line("'Twas brillig, and the slithy toves")
    assert s > 4


def test_title_block_dropped_and_counts_correct():
    os.environ.setdefault("OPENAI_API_KEY", "sk-dummy")
    env = vf.load_environment("jabberwocky", num_train_examples=1, num_eval_examples=1, expected_stanzas=7)
    funcs = {}
    for item in env.rubric.reward_funcs:
        f = item[0] if isinstance(item, (list, tuple)) else item
        funcs[getattr(f, "__name__", "")] = f

    # Title + blank line, then 7 strict quatrains
    body = _make_simple_poem(7, indent="    ")
    poem = "The Kintsugi Seam of Gold\n\n" + body
    assert funcs["S1_stanza_count"](None, poem, None, {}) == 1.0
    assert funcs["S2_quatrain_shape"](None, poem, None, {}) == 1.0


def test_crlf_and_spaced_blanklines_split_correctly():
    os.environ.setdefault("OPENAI_API_KEY", "sk-dummy")
    env = vf.load_environment("jabberwocky", num_train_examples=1, num_eval_examples=1, expected_stanzas=6)
    funcs = {}
    for item in env.rubric.reward_funcs:
        f = item[0] if isinstance(item, (list, tuple)) else item
        funcs[getattr(f, "__name__", "")] = f
    # Build 6 stanzas with CRLF endings and blank lines containing spaces
    stanzas = []
    for i in range(6):
        stanzas.append("\r\n".join([f"A{i}", "\tB", f"C{i}", "    D"]))
    poem = ("\r\n \r\n").join(stanzas)  # spaced blank line separators
    assert funcs["S1_stanza_count"](None, poem, None, {}) == 1.0
    assert funcs["S2_quatrain_shape"](None, poem, None, {}) == 1.0


def test_indent_tabs_and_six_spaces_get_full_credit():
    os.environ.setdefault("OPENAI_API_KEY", "sk-dummy")
    env = vf.load_environment("jabberwocky", num_train_examples=1, num_eval_examples=1)
    funcs = {}
    for item in env.rubric.reward_funcs:
        f = item[0] if isinstance(item, (list, tuple)) else item
        funcs[getattr(f, "__name__", "")] = f
    # Mix tabs and 6 spaces on even lines
    blocks = []
    for i in range(4):
        even_indent = "\t" if i % 2 == 0 else "      "  # 6 spaces
        blocks.append("\n".join([f"A{i}", f"{even_indent}B", f"C{i}", f"{even_indent}D"]))
    poem = "\n\n".join(blocks)
    val = funcs["S3_indent_alternation"](None, poem, None, {})
    assert val == 1.0


def test_nbsp_and_weird_spaces_dont_break_stanzas():
    os.environ.setdefault("OPENAI_API_KEY", "sk-dummy")
    env = vf.load_environment("jabberwocky", num_train_examples=1, num_eval_examples=1, expected_stanzas=2)
    funcs = {}
    for item in env.rubric.reward_funcs:
        f = item[0] if isinstance(item, (list, tuple)) else item
        funcs[getattr(f, "__name__", "")] = f
    nbsp = "\u00A0"
    stanza1 = "\n".join(["A", "  B", "C", "  D"]) + "\n"
    stanza2 = "\n".join(["E", "\tF", "G", "\tH"]) + "\n"
    poem = stanza1 + nbsp + "\n" + nbsp + "\n" + stanza2
    assert funcs["S1_stanza_count"](None, poem, None, {}) == 1.0
    assert funcs["S2_quatrain_shape"](None, poem, None, {}) == 1.0


def test_hard_caps_penalize_overlong_lines():
    os.environ.setdefault("OPENAI_API_KEY", "sk-dummy")
    env = vf.load_environment("jabberwocky", num_train_examples=1, num_eval_examples=1, expected_stanzas=1)
    funcs = {}
    for item in env.rubric.reward_funcs:
        f = item[0] if isinstance(item, (list, tuple)) else item
        funcs[getattr(f, "__name__", "")] = f
    # Create a stanza with an overlong line (>12 syllables)
    long_line = "one two three four five six seven eight nine ten eleven twelve thirteen"
    poem = "\n".join([long_line, "  b", "c", "  d"])  # 1 stanza
    # Alternation proxy should be 0 for this stanza due to hard cap
    assert funcs["S4_meter_alt_proxy"](None, poem, None, {}) == 0.0
    # Outlier reward should be < 1
    assert funcs["S5_syllable_outliers"](None, poem, None, {}) < 1.0
