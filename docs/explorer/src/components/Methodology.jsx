import React from "react";

export default function Methodology() {
  return (
    <div className="methodology-content">
      <div className="card">
        <h3>Evaluation methodology</h3>
        <p className="intro">
          Jabberwocky Bench employs a structured judge prompt with 24 binary criteria, implemented via
          <a href="https://github.com/prime-intellect/verifiers" target="_blank" rel="noopener noreferrer"> Verifiers</a>
          {" "}for reproducibility. Each criterion is evaluated independently by GPT-4-mini, producing a binary pass/fail decision. The final reward is
          the arithmetic mean of all checks, normalized to [0, 1].
        </p>
      </div>
      <div className="card">
        <h3>Criterion design principles</h3>
        <p>
          Each criterion is designed to be: <strong>objectively verifiable</strong> (can be checked algorithmically),
          <strong> linguistically grounded</strong> (based on established prosodic/poetic concepts), and <strong>discriminative</strong>
          {" "}(distinguishes between quality levels). The criteria span four dimensions: prosodic form, morphological invention, narrative structure, and originality constraints.
        </p>
      </div>
      <div className="card">
        <h3>Judge implementation and scoring thresholds</h3>
        <p>
          The LLM judge evaluates each poem using a structured XML prompt that enforces step-by-step reasoning. The judge first analyzes each criterion in isolation, then produces a binary decision.
          This approach minimizes position bias and ensures consistent evaluation.
        </p>
        <p style={{ marginTop: "1rem" }}>
          Performance labels are assigned based on total satisfied criteria:
        </p>
        <ul className="label-list">
          <li><strong>High</strong>: ≥ 12/24 criteria (50%+)</li>
          <li><strong>Medium</strong>: 9-11/24 criteria (37.5-45.8%)</li>
          <li><strong>Low</strong>: 6-8/24 criteria (25-33.3%)</li>
          <li><strong>Very Low</strong>: ≤ 5/24 criteria (&lt;21%)</li>
        </ul>
      </div>

      <div className="card">
        <h3>The 24 binary criteria (exact judge questions)</h3>
        <div className="rubric-grid">
          <div className="rubric-item"><div className="rubric-score">C1_title_present</div><div className="rubric-desc">Is there a non-empty title line before the first stanza (not part of stanza text)?</div></div>
          <div className="rubric-item"><div className="rubric-score">C2_quatrain_shape</div><div className="rubric-desc">Do all stanzas have 4 lines, and is the total stanza count between 5 and 8 (inclusive)?</div></div>
          <div className="rubric-item"><div className="rubric-score">C3_ballad_meter_echo</div><div className="rubric-desc">In ≥60% of stanzas, do lines alternate longer/shorter with ≥2 content-word difference?</div></div>
          <div className="rubric-item"><div className="rubric-score">C4_ballad_rhyme</div><div className="rubric-desc">In ≥60% of stanzas, do lines (2,4) rhyme (allowing slant rhyme), and avoid AABB dominance?</div></div>
          <div className="rubric-item"><div className="rubric-score">C5_ring_composition</div><div className="rubric-desc">Does the final stanza echo the opening with ≥2 repeated content words/phrases or a clear refrain?</div></div>
          <div className="rubric-item"><div className="rubric-score">C6_warning_admonition</div><div className="rubric-desc">Is there an early admonition (e.g., 'Beware …') or equivalent caution to the protagonist?</div></div>
          <div className="rubric-item"><div className="rubric-score">C7_preparation_armament</div><div className="rubric-desc">Before the encounter, does the protagonist prepare (tool/resolve/wait/plan)?</div></div>
          <div className="rubric-item"><div className="rubric-score">C8_encounter_confrontation</div><div className="rubric-desc">Is there a clear meeting between protagonist and adversary/obstacle?</div></div>
          <div className="rubric-item"><div className="rubric-score">C9_slaying_decisive_action</div><div className="rubric-desc">Is there a decisive act that resolves the central tension?</div></div>
          <div className="rubric-item"><div className="rubric-score">C10_return_celebration</div><div className="rubric-desc">Is there a return/homecoming and jubilant acknowledgement?</div></div>
          <div className="rubric-item"><div className="rubric-score">C11_coinage_count</div><div className="rubric-desc">Are there ≥8 distinct invented coinages (not canonical or standard English)?</div></div>
          <div className="rubric-item"><div className="rubric-score">C12_coinage_spread</div><div className="rubric-desc">Does each stanza contain ≥1 coinage?</div></div>
          <div className="rubric-item"><div className="rubric-score">C13_creature_naming</div><div className="rubric-desc">Is a non‑canonical creature/entity named and central to action (not 'Jabberwock')?</div></div>
          <div className="rubric-item"><div className="rubric-score">C14_onomatopoeia</div><div className="rubric-desc">Are there ≥2 onomatopoeic bursts (e.g., 'snicker‑snack!', 'Pop!', 'Hiss!')?</div></div>
          <div className="rubric-item"><div className="rubric-score">C15_alliteration_consonance</div><div className="rubric-desc">Do ≥2 stanzas show clear within‑line alliteration/consonance beyond incidental repeats?</div></div>
          <div className="rubric-item"><div className="rubric-score">C16_arc_order</div><div className="rubric-desc">Do the arc beats appear in canonical order (warning → preparation → encounter → decisive act → return/celebration)?</div></div>
          <div className="rubric-item"><div className="rubric-score">C17_no_verbatim_lines</div><div className="rubric-desc">Does no line exactly match the canonical poem?</div></div>
          <div className="rubric-item"><div className="rubric-score">C18_canonical_budget</div><div className="rubric-desc">Are distinct canonical tokens ≤8, favoring new coinages?</div></div>
          <div className="rubric-item"><div className="rubric-score">C19_syllable_tightness</div><div className="rubric-desc">In every quatrain stanza, are longer lines ≈8–9 syllables and shorter lines ≈5–7 (Jabberwocky's ~8/6 pattern)?</div></div>
          <div className="rubric-item"><div className="rubric-score">C20_rhyme_variety</div><div className="rubric-desc">Across stanzas, are (2,4) end‑rhymes varied (no exact end word reused &gt;2 times excluding the ring echo)?</div></div>
          <div className="rubric-item"><div className="rubric-score">C21_lexical_repetition_guard</div><div className="rubric-desc">Outside the ring echo, is no single content word overused (e.g., &gt;5 times or &gt;8% of content words)?</div></div>
          <div className="rubric-item"><div className="rubric-score">C22_coinage_variety</div><div className="rubric-desc">Do coinages show ≥4 distinct roots (no single coined suffix accounts for &gt;50% of coinages)?</div></div>
          <div className="rubric-item"><div className="rubric-score">C23_topic_adherence</div><div className="rubric-desc">Does the poem clearly address the given topic (named or evident) without substituting a different subject?</div></div>
          <div className="rubric-item"><div className="rubric-score">C24_subtext</div><div className="rubric-desc">Beyond surface action, is there a coherent implied layer (motif/undertone) detectable across the poem?</div></div>
        </div>
      </div>
    </div>
  );
}

