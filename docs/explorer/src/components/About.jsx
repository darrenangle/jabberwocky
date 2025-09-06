import React from "react";

export default function About() {
  return (
    <div className="methodology-content">
      <div className="card">
        <h3>The challenge of evaluating creative capabilities</h3>
        <p className="intro">
          Jabberwocky Bench transforms the subjective assessment of poetic skill into a reproducible benchmark by
          decomposing creative imitation into 24 binary criteria. Each check probes a specific dimension of
          instruction-following under creative constraints, from prosodic control to morphological invention.
        </p>
      </div>
      <div className="card">
        <h3>Technical approach</h3>
        <p>
          Built on the <a href="https://github.com/prime-intellect/verifiers" target="_blank" rel="noopener noreferrer">Verifiers library</a> and compatible with the
          <a href="https://hub.primeintellect.ai" target="_blank" rel="noopener noreferrer"> Prime Intellect Environments Hub</a>, this benchmark employs GPT-4-mini as an automated judge to evaluate
          structured creative outputs. The approach demonstrates how LLM judges can provide consistent evaluation of non-verifiable tasks
          when given precise, decomposed criteria.
        </p>
      </div>
      <div className="card">
        <h3>Core capabilities tested</h3>
        <div className="rubric-grid">
          <div className="rubric-item">
            <div className="rubric-score">Prosodic control</div>
            <div className="rubric-desc">Maintain ballad meter (8-6-8-6 syllables), ABAB/ABCB rhyme schemes, and seven quatrain structure while avoiding mechanical rigidity.</div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">Morphological invention</div>
            <div className="rubric-desc">Generate 8+ phonologically plausible portmanteaus distributed across stanzas, demonstrating productive word formation.</div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">Narrative coherence</div>
            <div className="rubric-desc">Execute the canonical hero's journey: warning → preparation → encounter → triumph → celebration, with ring composition.</div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">Originality constraints</div>
            <div className="rubric-desc">Avoid verbatim copying while maintaining stylistic fidelity. Maximum 15% canonical word reuse enforces genuine creation.</div>
          </div>
        </div>
      </div>
      <div className="card">
        <h3>Instruction sensitivity as a diagnostic</h3>
        <p>
          The benchmark evaluates models at two instruction levels here: Minimal (style prompt only) and High (rubric-aligned guidance). The
          performance delta (ΔH) between these levels reveals a model's zero-shot creative capabilities versus its ability to follow detailed specifications.
          Models with low ΔH demonstrate robust internalized understanding of the task.
        </p>
      </div>
      <div className="card">
        <h3>Verifying the unverifiable</h3>
        <p>
          This benchmark exemplifies a broader methodology for evaluating creative AI capabilities. By decomposing subjective quality into objective
          binary checks, we can create reproducible benchmarks for tasks traditionally considered impossible to verify. The approach extends to any domain
          where human judgment can be formalized into structured criteria.
        </p>
      </div>
    </div>
  );
}

