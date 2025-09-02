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

