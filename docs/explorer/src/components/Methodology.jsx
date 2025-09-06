import React from "react";

export default function Methodology() {
  return (
    <div className="methodology-content">
      <div className="card">
        <h3>Evaluation methodology</h3>
        <p className="intro">
          Jabberwocky Bench employs a structured judge prompt with 24 binary
          criteria, implemented via{" "}
          <a
            href="https://github.com/prime-intellect/verifiers"
            target="_blank"
            rel="noopener noreferrer"
          >
            Verifiers
          </a>{" "}
          for reproducibility. Each criterion is evaluated independently by
          GPT-4-mini, producing a binary pass/fail decision. The final reward is
          the arithmetic mean of all checks, normalized to [0, 1].
        </p>
      </div>
      <div className="card">
        <h3>Criterion design principles</h3>
        <p>
          Each criterion is designed to be:
          <strong> objectively verifiable</strong> (can be checked
          algorithmically),
          <strong> linguistically grounded</strong> (based on established
          prosodic/poetic concepts), and <strong> discriminative</strong>{" "}
          (distinguishes between quality levels). The criteria span four
          dimensions: prosodic form, morphological invention, narrative
          structure, and originality constraints.
        </p>
      </div>
      <div className="card">
        <h3>Judge implementation and scoring thresholds</h3>
        <p>
          The LLM judge (GPT-4-mini) evaluates each poem using a structured XML
          prompt that enforces step-by-step reasoning. The judge first analyzes
          each criterion in isolation, then produces a binary decision. This
          approach minimizes position bias and ensures consistent evaluation.
        </p>
        <p style={{ marginTop: "1rem" }}>
          Performance labels are assigned based on total satisfied criteria:
        </p>
        <ul className="label-list">
          <li>
            <strong>High</strong>: ≥ 12/24 criteria (50%+)
          </li>
          <li>
            <strong>Medium</strong>: 9-11/24 criteria (37.5-45.8%)
          </li>
          <li>
            <strong>Low</strong>: 6-8/24 criteria (25-33.3%)
          </li>
          <li>
            <strong>Very Low</strong>: ≤ 5/24 criteria (&lt;21%)
          </li>
        </ul>
        <p style={{ marginTop: "1rem", color: "#666", fontSize: "0.9rem" }}>
          These thresholds were calibrated on a development set to align with
          human intuitions about poem quality while maintaining sufficient
          granularity for model comparison.
        </p>
      </div>

      <div className="card">
        <h3>The 24 binary criteria (exact judge questions)</h3>
        <div className="rubric-grid">
          <div className="rubric-item">
            <div className="rubric-score">C1_title_present</div>
            <div className="rubric-desc">
              Is there a non-empty title line before the first stanza (not part
              of stanza text)?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C2_quatrain_shape</div>
            <div className="rubric-desc">
              Do all stanzas have 4 lines, and is the total stanza count between
              5 and 8 (inclusive)?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C3_ballad_meter_echo</div>
            <div className="rubric-desc">
              In ≥60% of stanzas, do lines alternate longer/shorter with ≥2
              content-word difference?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C4_ballad_rhyme</div>
            <div className="rubric-desc">
              In ≥60% of stanzas, do lines (2,4) rhyme (allowing slant rhyme),
              and avoid AABB dominance?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C5_ring_composition</div>
            <div className="rubric-desc">
              Does the final stanza echo the opening with ≥2 repeated content
              words/phrases or a clear refrain?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C6_warning_admonition</div>
            <div className="rubric-desc">
              Is there an early admonition (e.g., 'Beware …') or equivalent
              caution to the protagonist?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C7_preparation_armament</div>
            <div className="rubric-desc">
              Before the encounter, does the protagonist prepare
              (tool/resolve/wait/plan)?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C8_encounter_confrontation</div>
            <div className="rubric-desc">
              Is there a clear meeting between protagonist and
              adversary/obstacle?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C9_slaying_decisive_action</div>
            <div className="rubric-desc">
              Is there a decisive act that resolves the central tension?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C10_return_celebration</div>
            <div className="rubric-desc">
              Is there a return/homecoming and jubilant acknowledgement?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C11_coinage_count</div>
            <div className="rubric-desc">
              Are there ≥8 distinct invented coinages (not canonical or standard
              English)?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C12_coinage_spread</div>
            <div className="rubric-desc">
              Does each stanza contain ≥1 coinage?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C13_creature_naming</div>
            <div className="rubric-desc">
              Is a non‑canonical creature/entity named and central to action
              (not 'Jabberwock')?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C14_onomatopoeia</div>
            <div className="rubric-desc">
              Are there ≥2 onomatopoeic bursts (e.g., 'snicker‑snack!', 'Pop!',
              'Hiss!')?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C15_alliteration_consonance</div>
            <div className="rubric-desc">
              Do ≥2 stanzas show clear within‑line alliteration/consonance
              beyond incidental repeats?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C16_arc_order</div>
            <div className="rubric-desc">
              Do the arc beats appear in canonical order (warning → preparation
              → encounter → decisive act → return/celebration)?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C17_no_verbatim_lines</div>
            <div className="rubric-desc">
              Does no line exactly match the canonical poem?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C18_canonical_budget</div>
            <div className="rubric-desc">
              Are distinct canonical tokens ≤8, favoring new coinages?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C19_syllable_tightness</div>
            <div className="rubric-desc">
              In every quatrain stanza, are longer lines ≈8–9 syllables and
              shorter lines ≈5–7 (Jabberwocky's ~8/6 pattern)?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C20_rhyme_variety</div>
            <div className="rubric-desc">
              Across stanzas, are (2,4) end‑rhymes varied (no exact end word
              reused &gt;2 times excluding the ring echo)?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C21_lexical_repetition_guard</div>
            <div className="rubric-desc">
              Outside the ring echo, is no single content word overused (e.g.,
              &gt;5 times or &gt;8% of content words)?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C22_coinage_variety</div>
            <div className="rubric-desc">
              Do coinages show ≥4 distinct roots (no single coined suffix
              accounts for &gt;50% of coinages)?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C23_topic_adherence</div>
            <div className="rubric-desc">
              Does the poem clearly address the given topic (named or evident)
              without substituting a different subject?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C24_subtext</div>
            <div className="rubric-desc">
              Beyond surface action, is there a coherent implied layer
              (motif/undertone) detectable across the poem?
            </div>
          </div>
        </div>
      </div>
      <div className="card">
        <h3>In-context calibration examples</h3>
        <p>
          The judge prompt includes three calibration examples representing
          different quality levels to establish consistent evaluation standards.
          These examples demonstrate how the 24 criteria apply to poems about
          "Diet Coke" in the Jabberwocky style:
        </p>
        <div style={{ marginTop: "1rem" }}>
          <h4
            style={{
              fontSize: "1rem",
              marginBottom: "0.5rem",
              fontWeight: "700",
            }}
          >
            High Quality (23/24 criteria met) - "Dietwocky"
          </h4>
          <details style={{ marginBottom: "1rem" }}>
            <summary
              style={{
                cursor: "pointer",
                padding: "0.5rem",
                background: "#f8f7f5",
                borderRadius: "8px",
                fontSize: "0.85rem",
                fontWeight: "600",
              }}
            >
              Click to view full poem and judge evaluation
            </summary>
            <div
              style={{
                fontSize: "0.8rem",
                lineHeight: "1.4",
                background: "#f8f7f5",
                padding: "0.75rem",
                borderRadius: "8px",
                marginTop: "0.5rem",
                fontFamily: "var(--mono)",
              }}
            >
              <div style={{ fontWeight: "700", marginBottom: "1rem" }}>
                Dietwocky
              </div>

              <div style={{ marginBottom: "1rem" }}>
                'Twas fizzlig, and the silv'ry cans
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;Did clink and tinkle in the cave:
                <br />
                All zero were the sugargrams,
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;And mome throats outcrave.
              </div>

              <div style={{ marginBottom: "1rem" }}>
                "Beware the Sucrowock, my son!
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;The syruped bite, the caramel catch!
                <br />
                Beware the Jubjub thirst, and shun
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;The caffrinous Bandersnatch!"
              </div>

              <div style={{ marginBottom: "1rem" }}>
                He took his vorpal Diet‑Coke in hand;
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;Long time the manxome thirst he sought—
                <br />
                So rested he by the NumNum stand
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;And stood awhile in thought.
              </div>

              <div style={{ marginBottom: "1rem" }}>
                And, as in uffish thought he stood,
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;The Sucrowock, with eyes of foam,
                <br />
                Came whiffling from the vending‑wood,
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;And burbled as it came!
              </div>

              <div style={{ marginBottom: "1rem" }}>
                Pop! Hiss! Pop! Hiss! and through and through
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;The silver tab went snicker‑snack!
                <br />
                He left it drained; and with its ring
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;He went galumphing back.
              </div>

              <div style={{ marginBottom: "1rem" }}>
                "And hast thou quenched the Sucrowock?
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;Come to my arms, my beamish boy!
                <br />
                O frabjous day! Callooh! Callay!"
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;He chortled in his joy.
              </div>

              <div>
                'Twas fizzlig, and the silv'ry cans
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;Did clink and tinkle in the cave:
                <br />
                All zero were the sugargrams,
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;And mome throats outcrave.
              </div>
            </div>
            <div
              style={{
                marginTop: "1rem",
                padding: "0.75rem",
                background: "#fff",
                border: "1px solid #e7e2d9",
                borderRadius: "8px",
                fontSize: "0.75rem",
                fontFamily: "var(--mono)",
              }}
            >
              <strong style={{ fontSize: "0.85rem" }}>
                Judge evaluation (23/24 pass):
              </strong>
              <pre
                style={{
                  marginTop: "0.5rem",
                  whiteSpace: "pre-wrap",
                  lineHeight: "1.4",
                  color: "#444",
                }}
              >
                &lt;think&gt;
                <br /> &lt;C1_think&gt;Title present&lt;/C1_think&gt;
                <br /> &lt;C2_think&gt;stanzas=8; quatrains=8 (100.0%) -&gt;
                yes&lt;/C2_think&gt;
                <br /> &lt;C3_think&gt;quatrains=8; alt_hits=6 (75.0%) -&gt;
                yes&lt;/C3_think&gt;
                <br /> &lt;C4_think&gt;quatrains=8; rhyme(2,4) hits=7 (87.5%)
                -&gt; yes&lt;/C4_think&gt;
                <br /> &lt;C5_think&gt;Ring echo present -&gt;
                yes&lt;/C5_think&gt;
                <br /> &lt;C6_think&gt;Admonition present -&gt;
                yes&lt;/C6_think&gt;
                <br /> &lt;C7_think&gt;Preparation present -&gt;
                yes&lt;/C7_think&gt;
                <br /> &lt;C8_think&gt;Encounter present -&gt;
                yes&lt;/C8_think&gt; <br /> &lt;C9_think&gt;Decisive action
                present -&gt; yes&lt;/C9_think&gt; <br />
                &lt;C10_think&gt;Return/celebration present -&gt;
                yes&lt;/C10_think&gt; <br />{" "}
                &lt;C11_think&gt;distinct_coinages=12 -&gt;
                yes&lt;/C11_think&gt; <br />
                &lt;C12_think&gt;stanzas_with_coinage=8/8 -&gt;
                yes&lt;/C12_think&gt; <br /> &lt;C13_think&gt;Creature named
                (Sucrowock) -&gt; yes&lt;/C13_think&gt;
                <br /> &lt;C14_think&gt;Onomatopoeia (Pop!, Hiss!, etc.) -&gt;
                yes&lt;/C14_think&gt; <br />
                &lt;C15_think&gt;Alliteration in multiple stanzas -&gt;
                yes&lt;/C15_think&gt;
                <br /> &lt;C16_think&gt;Arc sequence present in order -&gt;
                yes&lt;/C16_think&gt; <br /> &lt;C17_think&gt;No verbatim
                canonical lines -&gt; yes&lt;/C17_think&gt; <br />
                &lt;C18_think&gt;Canonical tokens &lt;=8 -&gt;
                yes&lt;/C18_think&gt; <br /> &lt;C19_think&gt;quatrains=8;
                syllable_hits=6 (75.0%); samples: 8/6/8/6 | 9/6/8/6 -&gt;
                no&lt;/C19_think&gt; <br /> &lt;C20_think&gt;unique_endings=7;
                max_repeat=1 -&gt; yes&lt;/C20_think&gt;
                <br /> &lt;C21_think&gt;content_tokens=180; top_word='day' x3
                (1.7%) -&gt; yes&lt;/C21_think&gt; <br />{" "}
                &lt;C22_think&gt;coinages=12; distinct_suffixes&gt;=8;
                top_suffix_share&lt;=33% -&gt; yes&lt;/C22_think&gt; <br />
                &lt;C23_think&gt;Topic explicitly sustained throughout -&gt;
                yes&lt;/C23_think&gt; <br /> &lt;C24_think&gt;Consistent
                undertone/subtext present -&gt; yes&lt;/C24_think&gt; <br />
                &lt;/think&gt; <br /> &lt;C1&gt;yes&lt;/C1&gt;
                <br />
                &lt;C2&gt;yes&lt;/C2&gt;
                <br /> &lt;C3&gt;yes&lt;/C3&gt;
                <br />
                &lt;C4&gt;yes&lt;/C4&gt;
                <br /> &lt;C5&gt;yes&lt;/C5&gt;
                <br />
                &lt;C6&gt;yes&lt;/C6&gt;
                <br /> &lt;C7&gt;yes&lt;/C7&gt;
                <br />
                &lt;C8&gt;yes&lt;/C8&gt;
                <br /> &lt;C9&gt;yes&lt;/C9&gt;
                <br />
                &lt;C10&gt;yes&lt;/C10&gt;
                <br /> &lt;C11&gt;yes&lt;/C11&gt;
                <br />
                &lt;C12&gt;yes&lt;/C12&gt;
                <br /> &lt;C13&gt;yes&lt;/C13&gt;
                <br />
                &lt;C14&gt;yes&lt;/C14&gt;
                <br /> &lt;C15&gt;yes&lt;/C15&gt;
                <br />
                &lt;C16&gt;yes&lt;/C16&gt;
                <br /> &lt;C17&gt;yes&lt;/C17&gt;
                <br />
                &lt;C18&gt;yes&lt;/C18&gt;
                <br /> &lt;C19&gt;no&lt;/C19&gt;
                <br />
                &lt;C20&gt;yes&lt;/C20&gt;
                <br /> &lt;C21&gt;yes&lt;/C21&gt;
                <br />
                &lt;C22&gt;yes&lt;/C22&gt;
                <br /> &lt;C23&gt;yes&lt;/C23&gt;
                <br />
                &lt;C24&gt;yes&lt;/C24&gt;
              </pre>
            </div>
          </details>
          <p style={{ fontSize: "0.85rem", color: "#666" }}>
            Demonstrates excellent prosodic control, rich coinage ("fizzlig",
            "Sucrowock"), complete narrative arc, and ring composition.
          </p>
        </div>
        <div style={{ marginTop: "1.5rem" }}>
          <h4
            style={{
              fontSize: "1rem",
              marginBottom: "0.5rem",
              fontWeight: "700",
            }}
          >
            Medium Quality (16/24 criteria met)
          </h4>
          <details style={{ marginBottom: "1rem" }}>
            <summary
              style={{
                cursor: "pointer",
                padding: "0.5rem",
                background: "#f8f7f5",
                borderRadius: "8px",
                fontSize: "0.85rem",
                fontWeight: "600",
              }}
            >
              Click to view full poem and judge evaluation
            </summary>
            <div
              style={{
                fontSize: "0.8rem",
                lineHeight: "1.4",
                background: "#f8f7f5",
                padding: "0.75rem",
                borderRadius: "8px",
                marginTop: "0.5rem",
                fontFamily: "var(--mono)",
              }}
            >
              <div style={{ fontWeight: "700", marginBottom: "1rem" }}>
                Diet Coke, a Jabberwocky Parody
              </div>

              <div style={{ marginBottom: "1rem" }}>
                'Twas fizzful in the fridge's dim glow,
                <br />
                Where slithy toves of plastic roll;
                <br />
                A can of Diet Coke hummed slow,
                <br />
                With carbon frost upon its soul.
              </div>

              <div style={{ marginBottom: "1rem" }}>
                "Beware the Diet Coke," the whispers say,
                <br />
                "For fizz that bites and sugar none;
                <br />
                The cap that snaps with silvered sway,
                <br />
                And bubbles bright as midnight sun."
              </div>

              <div style={{ marginBottom: "1rem" }}>
                He gripped a vorpal straw with keen resolve,
                <br />
                And sought the foe with eyes aflame;
                <br />
                Through tulgey aisles of sizzle and resolve,
                <br />
                The liquid dare wore a silver name.
              </div>

              <div style={{ marginBottom: "1rem" }}>
                From the cooler's tulgey wood it burst,
                <br />
                A hiss of foam, a glittering gleam;
                <br />
                It burbled, hissed, and dared the worst,
                <br />A clinking, clattering, fizzing dream.
              </div>

              <div style={{ marginBottom: "1rem" }}>
                One, two! One, two! And through and through
                <br />
                The vorpal straw went snicker-snack!
                <br />
                The can lay shattered, foamy head
                <br />
                Rolled on the floor and clicked back.
              </div>

              <div style={{ marginBottom: "1rem" }}>
                "O Diet Coke slain? O bottled delight!
                <br />
                Return, bright beamish boy of fizz!
                <br />
                O frabjous sip! Callooh! Callay!"
                <br />
                He chortled in his thirsty bliss.
              </div>

              <div>
                'Twas fizzful in the fridge's dim glow,
                <br />
                Where slithy toves of plastic roll;
                <br />
                All mimsy were the borogoves,
                <br />
                And the mome raths outgrabe.
              </div>
            </div>
            <div
              style={{
                marginTop: "1rem",
                padding: "0.75rem",
                background: "#fff",
                border: "1px solid #e7e2d9",
                borderRadius: "8px",
                fontSize: "0.75rem",
                fontFamily: "var(--mono)",
              }}
            >
              <strong style={{ fontSize: "0.85rem" }}>
                Judge evaluation (16/24 pass):
              </strong>
              <pre
                style={{
                  marginTop: "0.5rem",
                  whiteSpace: "pre-wrap",
                  lineHeight: "1.4",
                  color: "#444",
                }}
              >
                &lt;think&gt; &lt;C1_think&gt;Title present&lt;/C1_think&gt;
                &lt;C2_think&gt;stanzas=8; quatrains=7 (87.5%) -&gt; no (require
                all quatrains; total 5-8)&lt;/C2_think&gt;
                &lt;C3_think&gt;quatrains=7; alt_hits=3 (42.9%) -&gt;
                no&lt;/C3_think&gt; &lt;C4_think&gt;quatrains=7; rhyme(2,4)
                hits=5 (71.4%) -&gt; yes&lt;/C4_think&gt; &lt;C5_think&gt;Ring
                echo weak/uncertain -&gt; no (must be clear)&lt;/C5_think&gt;
                &lt;C6_think&gt;Admonition present -&gt; yes&lt;/C6_think&gt;
                &lt;C7_think&gt;Preparation present -&gt; yes&lt;/C7_think&gt;
                &lt;C8_think&gt;Encounter present -&gt; yes&lt;/C8_think&gt;
                &lt;C9_think&gt;Decisive action present -&gt;
                yes&lt;/C9_think&gt; &lt;C10_think&gt;Return present -&gt;
                yes&lt;/C10_think&gt; &lt;C11_think&gt;distinct_coinages=9 -&gt;
                yes&lt;/C11_think&gt; &lt;C12_think&gt;stanzas_with_coinage=6/8
                -&gt; no&lt;/C12_think&gt; &lt;C13_think&gt;Creature named -&gt;
                yes&lt;/C13_think&gt; &lt;C14_think&gt;Onomatopoeia present
                -&gt; yes&lt;/C14_think&gt; &lt;C15_think&gt;Alliteration
                present -&gt; yes&lt;/C15_think&gt; &lt;C16_think&gt;Arc
                sequence partially out of order -&gt; no&lt;/C16_think&gt;
                &lt;C17_think&gt;No verbatim lines -&gt; yes&lt;/C17_think&gt;
                &lt;C18_think&gt;Canonical budget ok -&gt; yes&lt;/C18_think&gt;
                &lt;C19_think&gt;quatrains=7; syllable_hits=2 (28.6%); samples:
                10/7/10/7 | 9/7/10/7 -&gt; no&lt;/C19_think&gt;
                &lt;C20_think&gt;unique_endings=3; max_repeat=3 -&gt;
                no&lt;/C20_think&gt; &lt;C21_think&gt;content_tokens=170;
                top_word='diet' x4 (2.4%) -&gt; yes&lt;/C21_think&gt;
                &lt;C22_think&gt;coinages=9; distinct_suffixes=5;
                top_suffix_share=44% -&gt; yes&lt;/C22_think&gt;
                &lt;C23_think&gt;Topic present but drifts minimally -&gt;
                yes&lt;/C23_think&gt; &lt;C24_think&gt;Subtext unclear/weak
                -&gt; no&lt;/C24_think&gt; &lt;/think&gt;
                &lt;C1&gt;yes&lt;/C1&gt; &lt;C2&gt;no&lt;/C2&gt;
                &lt;C3&gt;no&lt;/C3&gt; &lt;C4&gt;yes&lt;/C4&gt;
                &lt;C5&gt;no&lt;/C5&gt; &lt;C6&gt;yes&lt;/C6&gt;
                &lt;C7&gt;yes&lt;/C7&gt; &lt;C8&gt;yes&lt;/C8&gt;
                &lt;C9&gt;yes&lt;/C9&gt; &lt;C10&gt;yes&lt;/C10&gt;
                &lt;C11&gt;yes&lt;/C11&gt; &lt;C12&gt;no&lt;/C12&gt;
                &lt;C13&gt;yes&lt;/C13&gt; &lt;C14&gt;yes&lt;/C14&gt;
                &lt;C15&gt;yes&lt;/C15&gt; &lt;C16&gt;no&lt;/C16&gt;
                &lt;C17&gt;yes&lt;/C17&gt; &lt;C18&gt;yes&lt;/C18&gt;
                &lt;C19&gt;no&lt;/C19&gt; &lt;C20&gt;no&lt;/C20&gt;
                &lt;C21&gt;yes&lt;/C21&gt; &lt;C22&gt;yes&lt;/C22&gt;
                &lt;C23&gt;yes&lt;/C23&gt; &lt;C24&gt;no&lt;/C24&gt;
              </pre>
            </div>
          </details>
          <p style={{ fontSize: "0.85rem", color: "#666" }}>
            Shows good creative elements but fails on technical constraints:
            mixed stanza shapes (not all quatrains), inconsistent meter, limited
            rhyme variety, and unclear ring composition.
          </p>
        </div>
        <div style={{ marginTop: "1rem" }}>
          <h4
            style={{
              fontSize: "1rem",
              marginBottom: "0.5rem",
              fontWeight: "700",
            }}
          >
            Very Low Quality (0/24 criteria met)
          </h4>
          <details style={{ marginBottom: "1rem" }}>
            <summary
              style={{
                cursor: "pointer",
                padding: "0.5rem",
                background: "#f8f7f5",
                borderRadius: "8px",
                fontSize: "0.85rem",
                fontWeight: "600",
              }}
            >
              Click to view full poem and judge evaluation
            </summary>
            <div
              style={{
                fontSize: "0.8rem",
                lineHeight: "1.4",
                background: "#f8f7f5",
                padding: "0.75rem",
                borderRadius: "8px",
                marginTop: "0.5rem",
                fontFamily: "var(--mono)",
              }}
            >
              <div
                style={{
                  fontStyle: "italic",
                  color: "#666",
                  marginBottom: "1rem",
                }}
              >
                [No title]
              </div>

              <div style={{ marginBottom: "1rem" }}>
                In days of olde, when times were tough,
                <br />
                A beverage rose to the occasion's rough,
                <br />
                A sparkling drink of wondrous taste,
                <br />A sweet and effervescent haste,
              </div>

              <div style={{ marginBottom: "1rem" }}>
                Its colors bright, its flavors bold,
                <br />
                A thirst-quenching treat that soon 'twould unfold,
                <br />
                A brew that doth delight both young and old,
                <br />A sweet escape from life's harsh cold,
              </div>

              <div style={{ marginBottom: "1rem" }}>
                With every sip, one's spirit doth soar,
                <br />
                A sense of joy that can't be ignored,
                <br />
                A taste of freedom, a perfect score,
                <br />A friend when times seem tough and dull,
              </div>

              <div style={{ marginBottom: "1rem" }}>
                It's called Diet Coke, thy elixir true,
                <br />
                A classic treat that always sees you through,
                <br />
                A delightful blend of sugar and fizz,
                <br />A drink that brings a smile so sweet, it is,
              </div>

              <div>
                So raise your glass to Diet Coke's might,
                <br />
                A beverage that's simply out of sight,
                <br />
                A taste of yesteryear, now and evermore,
                <br />A drink to cherish, always and forevermore.
              </div>
            </div>
            <div
              style={{
                marginTop: "1rem",
                padding: "0.75rem",
                background: "#fff",
                border: "1px solid #e7e2d9",
                borderRadius: "8px",
                fontSize: "0.75rem",
                fontFamily: "var(--mono)",
              }}
            >
              <strong style={{ fontSize: "0.85rem" }}>
                Judge evaluation (0/24 pass):
              </strong>
              <pre
                style={{
                  marginTop: "0.5rem",
                  whiteSpace: "pre-wrap",
                  lineHeight: "1.4",
                  color: "#444",
                }}
              >
                &lt;think&gt; &lt;C1_think&gt;No title -&gt; no&lt;/C1_think&gt;
                &lt;C2_think&gt;stanzas=5; no quatrains (couplets) -&gt;
                no&lt;/C2_think&gt; &lt;C3_think&gt;No quatrains to evaluate
                -&gt; no&lt;/C3_think&gt; &lt;C4_think&gt;No quatrains to
                evaluate -&gt; no&lt;/C4_think&gt; &lt;C5_think&gt;No ring echo
                -&gt; no&lt;/C5_think&gt; &lt;C6_think&gt;No admonition -&gt;
                no&lt;/C6_think&gt; &lt;C7_think&gt;No preparation -&gt;
                no&lt;/C7_think&gt; &lt;C8_think&gt;No clear encounter -&gt;
                no&lt;/C8_think&gt; &lt;C9_think&gt;No decisive action -&gt;
                no&lt;/C9_think&gt; &lt;C10_think&gt;No return/celebration -&gt;
                no&lt;/C10_think&gt; &lt;C11_think&gt;coinages&lt;8 -&gt;
                no&lt;/C11_think&gt;
                &lt;C12_think&gt;stanzas_with_coinage&lt;50% -&gt;
                no&lt;/C12_think&gt; &lt;C13_think&gt;No creature -&gt;
                no&lt;/C13_think&gt; &lt;C14_think&gt;No onomatopoeia -&gt;
                no&lt;/C14_think&gt; &lt;C15_think&gt;No alliteration -&gt;
                no&lt;/C15_think&gt; &lt;C16_think&gt;Arc sequence broken/out of
                order -&gt; no&lt;/C16_think&gt; &lt;C17_think&gt;Verbatim
                issues -&gt; no&lt;/C17_think&gt; &lt;C18_think&gt;Canonical
                budget exceeded -&gt; no&lt;/C18_think&gt; &lt;C19_think&gt;No
                syllable control -&gt; no&lt;/C19_think&gt;
                &lt;C20_think&gt;Poor rhyme variety -&gt; no&lt;/C20_think&gt;
                &lt;C21_think&gt;Overused lexicon -&gt; no&lt;/C21_think&gt;
                &lt;C22_think&gt;Coinage not varied -&gt; no&lt;/C22_think&gt;
                &lt;C23_think&gt;Topic unclear/shifted -&gt;
                no&lt;/C23_think&gt; &lt;C24_think&gt;No coherent subtext -&gt;
                no&lt;/C24_think&gt; &lt;/think&gt; &lt;C1&gt;no&lt;/C1&gt;
                &lt;C2&gt;no&lt;/C2&gt; &lt;C3&gt;no&lt;/C3&gt;
                &lt;C4&gt;no&lt;/C4&gt; &lt;C5&gt;no&lt;/C5&gt;
                &lt;C6&gt;no&lt;/C6&gt; &lt;C7&gt;no&lt;/C7&gt;
                &lt;C8&gt;no&lt;/C8&gt; &lt;C9&gt;no&lt;/C9&gt;
                &lt;C10&gt;no&lt;/C10&gt; &lt;C11&gt;no&lt;/C11&gt;
                &lt;C12&gt;no&lt;/C12&gt; &lt;C13&gt;no&lt;/C13&gt;
                &lt;C14&gt;no&lt;/C14&gt; &lt;C15&gt;no&lt;/C15&gt;
                &lt;C16&gt;no&lt;/C16&gt; &lt;C17&gt;no&lt;/C17&gt;
                &lt;C18&gt;no&lt;/C18&gt; &lt;C19&gt;no&lt;/C19&gt;
                &lt;C20&gt;no&lt;/C20&gt; &lt;C21&gt;no&lt;/C21&gt;
                &lt;C22&gt;no&lt;/C22&gt; &lt;C23&gt;no&lt;/C23&gt;
                &lt;C24&gt;no&lt;/C24&gt;
              </pre>
              <p
                style={{
                  marginTop: "0.5rem",
                  fontSize: "0.85rem",
                  color: "#666",
                }}
              >
                This is a conventional poem that completely misses the
                Jabberwocky style—no nonsense words, no narrative journey,
                standard poetic form.
              </p>
            </div>
          </details>
          <p style={{ fontSize: "0.85rem", color: "#666" }}>
            Lacks essential Jabberwocky elements: no coinages, no narrative arc,
            conventional language, and standard poetic structure rather than
            Carroll's distinctive style.
          </p>
        </div>
        <p style={{ marginTop: "1rem", fontSize: "0.9rem" }}>
          These examples calibrate the judge's binary decisions, ensuring that
          "yes" is only assigned when criteria are clearly and definitively
          satisfied. The judge employs strict evaluation—borderline or partially
          met criteria receive "no."
        </p>
      </div>
      <div className="card">
        <h3>Topic sampling strategy</h3>
        <p>
          The benchmark samples from 48 carefully curated topics that combine
          technical specificity with emotional resonance. These topics draw from
          specialized crafts and subcultures—luthiery, letterpress printing,
          horology, mountaineering, tea ceremony, perfumery—using terms that are
          both precise and evocative.
        </p>
        <p style={{ marginTop: "0.75rem" }}>
          Examples include: <em>"luthier's soundpost setter"</em>,
          <em>"verglas on granite"</em>, <em>"selenium-toned fiber print"</em>,
          <em>"night-blooming cereus vigil"</em>, and{" "}
          <em>"farewell at a platform"</em>. This approach tests whether models
          can maintain poetic form while engaging with unfamiliar technical
          vocabulary that carries inherent aesthetic and emotional weight.
        </p>
        <p style={{ marginTop: "0.75rem", fontSize: "0.9rem", color: "#666" }}>
          The topics are sampled without replacement until exhausted, then
          reshuffled, ensuring low repetition. A 20% holdout set separates
          training from evaluation topics to test generalization.
        </p>
      </div>
    </div>
  );
}

