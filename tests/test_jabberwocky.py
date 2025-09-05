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
    < C1 > yes </ C1 >
    <C2>no</C2>
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


def test_rubric_includes_syllable_tightness():
    os.environ.setdefault("OPENAI_API_KEY", "sk-dummy")
    env = vf.load_environment("jabberwocky", num_train_examples=5, num_eval_examples=5, seed=42)
    # Reward functions include per-criterion metrics; look for C19
    names = {getattr(f, "__name__", "") for f, _w in env.rubric.reward_funcs}
    assert any(name.startswith("C19_syllable_tightness") for name in names), "C19 syllable criterion missing"


def test_rubric_includes_new_variety_checks():
    os.environ.setdefault("OPENAI_API_KEY", "sk-dummy")
    env = vf.load_environment("jabberwocky", num_train_examples=5, num_eval_examples=5, seed=42)
    names = {getattr(f, "__name__", "") for f, _w in env.rubric.reward_funcs}
    assert any(name.startswith("C20_rhyme_variety") for name in names), "C20 rhyme variety missing"
    assert any(name.startswith("C21_lexical_repetition_guard") for name in names), "C21 repetition guard missing"
    assert any(name.startswith("C22_coinage_variety") for name in names), "C22 coinage variety missing"


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
