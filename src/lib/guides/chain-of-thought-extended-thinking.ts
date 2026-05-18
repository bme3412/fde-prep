import type { StudyGuide } from "../guide-types";

export const chainOfThoughtExtendedThinkingGuide: StudyGuide = {
  topicTitle: "Chain-of-thought & extended thinking",
  topicSlug: "chain-of-thought-extended-thinking",
  sections: [
    // ─── Section 1: Two ways to "let the model think" ────────────────────
    {
      title: "Two ways to let the model think",
      blocks: [
        {
          kind: "prose",
          markdown: `## The decision under this whole topic

When a customer says "the model is making mistakes on hard problems," there are essentially three knobs you can turn:

1. **Inline chain-of-thought (CoT) prompting** — ask the model to "think step by step" in its visible output. The thinking is part of the response, billed as output tokens, visible to your application.
2. **Structured CoT** — give the model an explicit reasoning template (Plan / Steps / Answer) so the structure of its thinking is enforced.
3. **Extended thinking** — Claude's built-in reasoning mode (\`thinking\` parameter). The model produces internal reasoning tokens that don't appear in the visible response but improve answer quality.

These are not interchangeable. They have different cost profiles, different latency profiles, and different failure modes. Picking the right one is the prompt-engineering decision under this topic.

**This guide covers when to use each.** The mechanics of the extended-thinking API parameter — \`budget_tokens\`, parsing \`ThinkingBlock\`, multi-turn preservation — are covered in the **Extended thinking patterns** SDK guide.`,
        },
        {
          kind: "key_insight",
          label: "The core decision",
          insight: `**Use inline CoT** when you want the reasoning to be auditable, the task benefits from structure you can specify, or you're working with a non-thinking-enabled model.

**Use extended thinking** when reasoning quality matters more than reasoning visibility, the task is hard enough to justify the latency, and you don't need to display or post-process the reasoning.

**Use neither** when the task is straightforward — CoT *hurts* on factual recall, tone-sensitive tasks, and anything latency-bound.`,
        },
        {
          kind: "code_comparison",
          label: "Same hard task, two approaches",
          left: {
            title: "Inline CoT — reasoning is in the response",
            code: `prompt = """
You are a triage analyst. A user reports a checkout error.

Information:
- Order #12847, $89.50, declined at payment step
- User has 3 prior successful orders this month
- Same card used previously without issue
- Error code: AVS_MISMATCH

Think step by step about the most likely cause, then state your
single best hypothesis.
"""

r = client.messages.create(
    model="claude-opus-4-5",
    max_tokens=1024,
    messages=[{"role":"user","content":prompt}],
)
# r.content[0].text contains BOTH the reasoning and the answer.
# You'll need to parse if you want just the conclusion.`,
            annotation: "Reasoning is visible, billed as output, parseable. You can show it, audit it, or use it as training data. Latency ≈ time to generate reasoning + answer.",
          },
          right: {
            title: "Extended thinking — reasoning is internal",
            code: `r = client.messages.create(
    model="claude-opus-4-5",
    max_tokens=4096,
    thinking={"type": "enabled", "budget_tokens": 2048},
    temperature=1,  # required when thinking enabled
    messages=[{"role":"user","content":prompt_without_cot_instruction}],
)
# r.content has a ThinkingBlock + a TextBlock.
# The TextBlock is the visible answer. The ThinkingBlock is the
# reasoning — preserved for multi-turn but not displayed by default.`,
            annotation: "Reasoning is internal; the visible answer is just the conclusion. Latency is higher (model thinks for longer) but the response is clean. Thinking tokens are billed but cheaper than output.",
          },
          takeaway: "Inline CoT: reasoning in the response, auditable, you handle parsing. Extended thinking: reasoning internal, cleaner output, model decides depth within your budget. Pick based on whether you need to *see* the reasoning or just *benefit from* it.",
        },
        {
          kind: "scenario_predict",
          label: "Pick the knob",
          language: "text",
          scenario: `A customer is building three features. For each, recommend inline CoT,
extended thinking, or neither:

  A) Auto-tagger that adds 1-3 category tags to incoming support tickets.
     Volume: 50k/day. Categories are mostly obvious.
  B) Tutor that explains math problems to students; reasoning steps
     should be visible to the student.
  C) Engineering assistant that diagnoses production incidents from
     logs + metrics; correctness matters more than latency.`,
          question: "Which knob for each?",
          answer: "A) Neither — straightforward classification at high volume; CoT would bloat cost/latency for no quality win. B) Inline CoT (structured) — the reasoning *is* the product; students need to see the steps. C) Extended thinking — correctness matters, latency is acceptable, and the user wants a clean diagnosis not a wall of reasoning.",
          explanation: "The decision is driven by (1) does reasoning improve quality on this task type, (2) does the consumer of the output want to see reasoning. Tagging is high-volume and easy — no CoT. Tutoring requires visible reasoning — inline. Incident diagnosis benefits from depth without needing visible steps — extended thinking. Same model, three different prompt-engineering decisions.",
        },
        {
          kind: "method_ref",
          title: "Quick reference: when each applies",
          importLine: "# Decision shorthand",
          methods: [
            {
              signature: "Inline CoT",
              description: "Ask model to think step-by-step in its response.",
              returns: "Use when: reasoning must be visible/auditable, structure matters (you specify template), or model lacks extended-thinking support.",
            },
            {
              signature: "Structured CoT",
              description: "Inline CoT with explicit sections (Plan / Steps / Answer).",
              returns: "Use when: you need to programmatically extract reasoning vs answer, or quality benefits from forced structure.",
            },
            {
              signature: "Extended thinking",
              description: "thinking={type:'enabled', budget_tokens:N}; reasoning is internal.",
              returns: "Use when: reasoning quality matters more than visibility, latency is acceptable, output should be clean.",
            },
            {
              signature: "No reasoning prompt",
              description: "Single-shot answer with no thinking instruction.",
              returns: "Use when: task is straightforward (classification, format conversion, simple Q&A) and latency or cost matters.",
            },
            {
              signature: "Few-shot examples",
              description: "Include 2-5 worked examples that *implicitly* show reasoning.",
              returns: "Use when: you want consistent reasoning style without explicit CoT instruction (often combined with structured CoT for compounding effect).",
            },
          ],
        },
        {
          kind: "flashcard",
          front: "Why isn't extended thinking always better than inline CoT?",
          back: "Three reasons: (1) **Visibility** — when the reasoning *is* the product (tutoring, audit reports, debugging assistants), extended thinking hides what you need to show. (2) **Latency** — extended thinking can add seconds; if you're under 500ms SLA, inline CoT or no-CoT is faster. (3) **Cost on easy tasks** — extended thinking can spend thinking tokens on problems that don't need them, where a plain prompt would have been correct. The right framing: extended thinking is a *quality lever*, not a default.",
        },
      ],
    },
    // ─── Section 2: When CoT helps and when it hurts ─────────────────────
    {
      title: "When CoT helps and when it hurts",
      blocks: [
        {
          kind: "prose",
          markdown: `## The research-backed picture

Chain-of-thought is well-studied. The shape of the evidence:

### CoT *helps* on
- **Multi-step arithmetic and math word problems** — original GSM8K result.
- **Logical / multi-hop reasoning** — questions requiring chained inferences ("If A implies B, and B implies C, does A imply C?").
- **Code generation involving planning** — outlining steps before writing the code.
- **Tasks with implicit decomposition** — e.g., "review this PR for security, performance, and style" benefits from the model addressing each axis.
- **Constrained generation** — tasks with multiple requirements where forgetting one is the common failure mode.

### CoT *hurts* (or is neutral) on
- **Factual recall** — "What's the capital of France?" Adding "think step by step" gives the model room to overthink and sometimes confabulate.
- **Direct classification** — short labels where reasoning encourages second-guessing.
- **Tone-sensitive content** — chatty CoT bleeds into the final answer's voice.
- **Latency-bound tasks** — every CoT token is wall-clock time.
- **Token-counting / character-counting tasks** — model's "step-by-step" reasoning about character positions is unreliable.

### CoT can be *misleading*
- Models will produce confident-sounding CoT that doesn't reflect their actual decision process (a finding from Anthropic and others). The CoT is **plausible**, not necessarily **causal**. This matters when you use CoT as a transparency feature.`,
        },
        {
          kind: "code_comparison",
          label: "CoT helps (math) vs CoT hurts (recall)",
          left: {
            title: "Helps — multi-step math",
            code: `# No CoT
prompt = "If a train leaves NYC at 2pm going 60mph, and another \\
leaves Boston at 3pm going 70mph, when do they meet? \\
NYC to Boston is 215 miles. Answer only with the time."

# CoT version
prompt_cot = "If a train leaves NYC at 2pm going 60mph, and \\
another leaves Boston at 3pm going 70mph, when do they meet? \\
NYC to Boston is 215 miles.\\n\\n\\
Think step by step, then give the final time."

# CoT consistently beats no-CoT on this class of problem.`,
            annotation: "Multi-step math is the canonical CoT-helps case. The model needs working space to track quantities and constraints; visible reasoning gives it that space.",
          },
          right: {
            title: "Hurts — factual recall",
            code: `# No CoT (correct, fast)
prompt = "What's the chemical symbol for tungsten?"
# → "W"

# CoT (slower, sometimes WORSE)
prompt_cot = "What's the chemical symbol for tungsten? \\
Think step by step about the element's name and history first."
# → "The element tungsten was discovered in 1783... its symbol comes
#    from the German 'Wolfram'... so the symbol is W."
# Same answer, 10x the tokens, and now there's a chance the model
# riffs into wrong etymology that drags the final answer with it.`,
            annotation: "Factual recall doesn't need reasoning. Adding CoT gives the model space to insert plausible-but-wrong intermediate claims that then contaminate the final answer.",
          },
          takeaway: "The diagnostic: does the task have *steps*? If yes, CoT likely helps. If no, CoT likely just costs more. Don't apply CoT reflexively to every prompt — it's a tool, not a setting.",
        },
        {
          kind: "scenario_predict",
          label: "The CoT-hurts trap",
          language: "text",
          scenario: `A team adds "think step by step" to every prompt across their app
because "it improves quality." Three weeks later:
  - Average latency is up 40%.
  - Cost is up 60%.
  - Quality is up on math/code prompts, flat on Q&A, slightly *down*
    on tone-sensitive content (customer-facing emails).`,
          question: "What's the diagnosis and the fix?",
          answer: "Global CoT was applied to tasks that don't benefit. The fix is per-task: keep CoT on multi-step reasoning prompts, remove it from factual Q&A, and specifically remove it from tone-sensitive prompts where the reasoning chatter bleeds into final output voice. Use prompt categories with different system prompts rather than one global instruction.",
          explanation: "This is the most common 'we added CoT and it backfired' pattern. CoT is task-specific; applying it globally is like turning every knob to max. Route different task types to different prompts (this is exactly what routing patterns are for). When in doubt: A/B test CoT-on vs CoT-off on a representative sample of each task type.",
        },
        {
          kind: "multiple_choice",
          title: "CoT-helps vs CoT-hurts diagnosis",
          prompt: "Which of these tasks would you expect to benefit most from chain-of-thought prompting?",
          choices: [
            {
              text: "Classify a tweet as positive / negative / neutral.",
              correct: false,
              rationale: "Direct classification of short text — CoT adds tokens without quality benefit. Often slightly hurts because reasoning encourages overthinking.",
            },
            {
              text: "Translate a paragraph from English to French.",
              correct: false,
              rationale: "Translation is largely pattern-matching at the model's level. CoT doesn't help; structured CoT for terminology consistency can help on technical text but plain prompting is the baseline.",
            },
            {
              text: "Given a customer's account history, decide whether they qualify for a discount based on 4 written rules.",
              correct: true,
              rationale: "Multi-criterion decision with explicit rules — exactly where CoT shines. The model needs working space to check each rule and combine results.",
            },
            {
              text: "Generate a friendly customer service greeting.",
              correct: false,
              rationale: "Generative + tone-sensitive. CoT bleeds into the response and produces stilted output. No CoT.",
            },
          ],
          explanation: "CoT helps when the task has explicit decomposition steps the model needs to track. Multi-rule eligibility is the textbook case — without CoT the model often skips a rule or applies them in the wrong order. With CoT the model articulates each check, which both improves quality and gives you a paper trail.",
        },
        {
          kind: "warm_up",
          title: "Anti-pattern recognition",
          prompt: `A prompt says: "Generate a one-line product description for {product}. Think step by step about the target audience, the key feature, the tone, and the length, then write the description." What's wrong with this prompt?`,
          answer: "CoT is overkill for one-line generation. The 'thinking' will dominate the output, often appearing in or contaminating the description. Strip the CoT instruction; replace with 2-3 few-shot examples showing the desired style.",
          explanation: "CoT and short generative tasks are a bad fit because the thinking outweighs the answer. Few-shot examples encode the same guidance (audience, feature, tone, length) without the inline reasoning overhead.",
        },
        {
          kind: "flashcard",
          front: "What does 'CoT is plausible, not necessarily causal' mean?",
          back: "When a model emits chain-of-thought, the reasoning *sounds* like it caused the answer — but research (including Anthropic's) shows the CoT may not actually be how the model arrived at its conclusion. The model can write a CoT that's post-hoc rationalization. Practical implication: don't use CoT as a transparency or auditability tool for high-stakes decisions. It tells you what reasoning the model is willing to articulate, not what reasoning drove the answer. For real auditability, use deterministic checks (test cases, schema validators) on the *answer* — not reading the CoT and trusting it.",
        },
      ],
    },
    // ─── Section 3: Prompt-engineering CoT in practice ───────────────────
    {
      title: "Prompt-engineering CoT in practice",
      blocks: [
        {
          kind: "prose",
          markdown: `## Three flavors of inline CoT, in increasing structure

### 1. Unstructured CoT — "Think step by step"
The original. A single instruction at the end of the prompt. Pros: trivial to add, often effective. Cons: model decides format; you can't reliably extract reasoning vs answer; output verbosity is unpredictable.

### 2. Structured CoT — explicit sections
Tell the model what sections to produce: \`<plan>\`, \`<work>\`, \`<answer>\` (or XML, or markdown headings). Pros: programmatically extractable; consistent format; you can show or hide the reasoning per use case. Cons: slightly more prompt engineering effort.

### 3. Few-shot CoT — examples show the reasoning style
Include 2-5 worked examples where each has Question → Reasoning → Answer. The model imitates the demonstrated reasoning style. Pros: highest consistency; no explicit "think step by step" needed; works on subtle tasks where instructions alone underperform. Cons: takes prompt budget; need to curate good examples.

**Often the right answer is to combine structured + few-shot** for production prompts: 2-3 examples that show the desired section structure, then the new question in the same format.`,
        },
        {
          kind: "code_comparison",
          label: "Unstructured vs structured CoT",
          left: {
            title: "Unstructured",
            code: `prompt = f"""
A customer is reporting that their dashboard shows wrong data. The
metric is 'monthly active users.' Here's what we know:
{evidence}

Think step by step about the most likely cause, then state your
single best hypothesis.
"""

# Model output:
# "Let me think about this. First, we have... [3 paragraphs] ...
#  So the most likely cause is: stale cache."

# To extract the hypothesis, you need to parse arbitrary prose.`,
            annotation: "Quick to write. Hard to reliably extract just the answer. The model picks the format.",
          },
          right: {
            title: "Structured",
            code: `prompt = f"""
A customer reports their dashboard shows wrong data. Evidence:
{evidence}

Respond using exactly these sections:

<reasoning>
Your step-by-step analysis.
</reasoning>

<hypothesis>
One sentence. Your single best hypothesis.
</hypothesis>

<confidence>
high | medium | low
</hypothesis>
"""

# Output is parseable with a simple regex on the tags.
# You can show <reasoning> to engineers, surface just <hypothesis>
# to ops, and route based on <confidence>.`,
            annotation: "Slightly more work; pays back immediately the first time you need to extract the answer programmatically.",
          },
          takeaway: "Once a prompt is going into production, upgrade from unstructured CoT to structured CoT. The structure makes the reasoning machine-readable, the answer reliably extractable, and the format consistent enough to display.",
        },
        {
          kind: "method_ref",
          title: "Structured CoT section taxonomy",
          importLine: "# Common section names and what they're for",
          methods: [
            {
              signature: "<plan> / <approach>",
              description: "What the model intends to do before doing it. Useful when ordering matters.",
              returns: "Catches model misinterpretation early — if the plan is wrong, the answer will be.",
            },
            {
              signature: "<work> / <reasoning>",
              description: "The model's step-by-step. The actual CoT.",
              returns: "Auditable; can be hidden from end users while still shaping the answer.",
            },
            {
              signature: "<evidence>",
              description: "Specific facts/quotes from the input the model is relying on.",
              returns: "Reduces hallucinated grounding. Surface this in the UI for trust.",
            },
            {
              signature: "<answer>",
              description: "The final response — the thing your application actually consumes.",
              returns: "Always the last section so parsing is robust against truncation.",
            },
            {
              signature: "<confidence>",
              description: "Self-reported confidence (high / medium / low or numeric).",
              returns: "Useful for routing low-confidence cases to human review, even though it's only as good as model calibration.",
            },
            {
              signature: "<uncertainty>",
              description: "What the model could not determine from the input.",
              returns: "Catches the 'confidently wrong' failure mode — the model is forced to articulate what it doesn't know.",
            },
          ],
        },
        {
          kind: "scenario_predict",
          label: "Few-shot vs explicit CoT",
          language: "text",
          scenario: `A team's prompt asks Claude to extract structured incident data from
free-form support tickets. Output format: severity, affected_system,
suspected_cause, customer_impact.

Current prompt has 'Think step by step before producing the JSON.'
Quality is okay but inconsistent — sometimes the reasoning leaks
into JSON fields ('looks like the user is saying database is down').`,
          question: "What's the most effective prompt change?",
          answer: "Switch from instructional CoT to few-shot CoT: 3 worked examples showing (ticket text → reasoning in a <work> block → clean JSON). The model imitates the example format, including keeping the reasoning *inside* <work> and *out of* the JSON fields.",
          explanation: "When CoT leaks into structured output, the fix is almost always to *show* the model what 'reasoning here, output here' looks like rather than tell it. Few-shot examples are more effective than instructions for format consistency. Combine with structured CoT (<work> tag) so the leaking has a designated place to go.",
        },
        {
          kind: "warm_up",
          title: "Where to put 'think step by step'",
          prompt: `In a prompt with task description, examples, the question, and an output format spec, where should "think step by step" go for best effect?`,
          answer: "Just before the question, after the format spec. The instruction works best when it's the last thing the model reads before responding — putting it at the top often gets diluted by intervening content.",
          explanation: "Anthropic's prompt engineering guidance: place steering instructions close to where they're acted on. 'Think step by step' at the top of a long prompt is fragile; immediately before the task it's robust.",
        },
        {
          kind: "flashcard",
          front: "How do you stop CoT reasoning from contaminating the final output?",
          back: "Three layers, most to least effective: (1) Use structured CoT with explicit <reasoning> and <answer> tags so the model has a place to put each. (2) Add a few-shot example showing the exact desired structure. (3) Use extended thinking instead — the reasoning is *internal* and physically cannot leak into the visible answer. If you're seeing leakage despite (1) and (2), that's the strongest signal to graduate to extended thinking.",
        },
      ],
    },
    // ─── Section 4: Extended thinking — when and how ─────────────────────
    {
      title: "Extended thinking — when and how",
      blocks: [
        {
          kind: "prose",
          markdown: `## What extended thinking does

Extended thinking is Claude's built-in reasoning mode. When enabled via the \`thinking\` parameter, the model produces internal reasoning tokens before producing the visible answer.

The full SDK mechanics — exact parameters, parsing \`ThinkingBlock\`, multi-turn preservation, budget vs max-tokens invariant — are covered in the **Extended thinking patterns** guide. This section focuses on **the prompt-engineering decision: when to reach for it.**

## The minimum mental model

- \`thinking={type:"enabled", budget_tokens: N}\` allocates up to N tokens of thinking.
- The model decides how much of the budget to actually use.
- \`max_tokens\` (the response cap) must be > budget_tokens.
- \`temperature\` must be 1 when thinking is enabled (the model controls its own sampling for reasoning).
- The response contains a \`ThinkingBlock\` followed by a \`TextBlock\`. Your application typically displays only the \`TextBlock\`.

## When extended thinking is the right knob

1. **Quality > visibility** — you benefit from the reasoning but don't need to show it.
2. **Hard reasoning tasks** — math, multi-hop logic, complex code, system design — where the marginal answer-quality gain justifies the extra latency.
3. **Tone-sensitive output** — extended thinking solves the CoT-leakage problem structurally because the reasoning is in its own block.
4. **Multi-turn assistance** — the \`ThinkingBlock\` carries forward through tool-use loops, helping the model maintain reasoning thread across turns.

## When extended thinking is the wrong knob

1. **Latency-bound tasks** — thinking adds seconds.
2. **Trivial tasks** — classification, formatting, recall. You're paying for thinking the model doesn't need.
3. **High-volume + cost-sensitive** — even at lower per-token cost, thinking tokens add up at scale.
4. **You need the reasoning visible** — tutoring, audit, debugging assistant. Use inline structured CoT instead.`,
        },
        {
          kind: "code_comparison",
          label: "Inline CoT vs extended thinking on the same task",
          left: {
            title: "Inline structured CoT",
            code: `prompt = """
You are debugging a production incident.

Logs:
{logs}

Use these sections:
<reasoning>step by step</reasoning>
<hypothesis>one sentence</hypothesis>
"""

r = client.messages.create(
    model="claude-opus-4-5",
    max_tokens=2048,
    messages=[{"role":"user","content":prompt}],
)
# Reasoning + answer in r.content[0].text
# Parse with regex on tags`,
            annotation: "Reasoning is visible & auditable. Format is yours. Latency = generate reasoning + answer.",
          },
          right: {
            title: "Extended thinking",
            code: `prompt = """
You are debugging a production incident.

Logs:
{logs}

State your single best hypothesis in one sentence.
"""

r = client.messages.create(
    model="claude-opus-4-5",
    max_tokens=3072,
    thinking={"type":"enabled", "budget_tokens":2048},
    temperature=1,
    messages=[{"role":"user","content":prompt}],
)
# r.content = [ThinkingBlock(...), TextBlock("hypothesis: ...")]
# Display TextBlock; preserve ThinkingBlock for multi-turn.`,
            annotation: "Reasoning hidden; answer is the one sentence. Latency higher (model thinks longer). Thinking tokens cheaper than output tokens.",
          },
          takeaway: "Both can produce the same quality of hypothesis. Inline CoT gives you the trace at the cost of a noisier response object. Extended thinking gives you a clean response at the cost of reasoning visibility. Pick based on whether your application needs to *use* the reasoning or just *benefit from* it.",
        },
        {
          kind: "scenario_predict",
          label: "When extended thinking changes the math",
          language: "text",
          scenario: `A team has a code-review prompt where Claude reads a diff and flags
issues across security, performance, and style. Current prompt uses
structured CoT with <security>, <performance>, <style>, <summary>
sections.

Latency is 8 seconds; quality is good. They're considering switching
to extended thinking with budget_tokens=4096 + a simpler prompt.`,
          question: "Should they switch? What's the trade-off?",
          answer: "Probably not yet — and here's why. Their current structure (4 sections) is exactly what the consumer needs to read. Extended thinking would make the reasoning internal, leaving them with just the summary. They'd lose the per-axis breakdown. If they were generating a 'fix it' code change instead of a review report, extended thinking would make sense (reasoning hidden, code clean). For a review report where the structure IS the product, stick with structured CoT.",
          explanation: "This is the canonical 'when not to switch' case. If the application consumes the reasoning (review reports, tutoring, structured audits), inline CoT is structurally correct. Extended thinking is for cases where reasoning quality is the goal but the reasoning itself isn't the deliverable.",
        },
        {
          kind: "method_ref",
          title: "Extended thinking — prompt-engineering checklist",
          importLine: "# Before flipping the switch",
          methods: [
            {
              signature: "Remove inline CoT instructions",
              description: "Strip 'think step by step' and similar from your prompt — extended thinking replaces them.",
              returns: "Leaving inline CoT in causes the model to either ignore thinking budget or double-reason.",
            },
            {
              signature: "Strip CoT scaffolding",
              description: "Remove <reasoning> tags or planning sections. The model now has a dedicated place for those.",
              returns: "Cleaner prompt; clearer output contract (just the answer).",
            },
            {
              signature: "Set budget_tokens conservatively",
              description: "Start at 1024-2048. Increase if quality benchmarks show it helps.",
              returns: "Budget is a ceiling, not a target — the model uses what it needs. But the ceiling caps cost on edge cases.",
            },
            {
              signature: "Ensure max_tokens > budget_tokens",
              description: "Hard SDK invariant. max_tokens must accommodate thinking + visible response.",
              returns: "Failure here returns an API error, not silent truncation. Easy to catch.",
            },
            {
              signature: "Set temperature = 1",
              description: "Required when thinking is enabled.",
              returns: "Other temperatures silently degrade (or in newer SDK versions, error). 1 is the supported value.",
            },
            {
              signature: "Preserve ThinkingBlock across turns",
              description: "When using extended thinking in tool-use loops, pass prior ThinkingBlocks back in the messages.",
              returns: "Without this, the model loses its reasoning thread between turns. Major quality regression.",
            },
            {
              signature: "Display only the TextBlock",
              description: "ThinkingBlock contains private reasoning; surfacing it bypasses the visibility-control benefit.",
              returns: "If you need to show reasoning, you wanted inline CoT — use that instead.",
            },
          ],
        },
        {
          kind: "warm_up",
          title: "Budget vs max_tokens",
          prompt: `If you set thinking budget_tokens=8192 and max_tokens=4096, what happens?`,
          answer: "API error. max_tokens must be greater than budget_tokens — the response budget needs room for both thinking and the final answer.",
          explanation: "This is the most common extended-thinking misconfiguration. Always set max_tokens = budget_tokens + room-for-visible-response (usually budget + 1024 to 4096 depending on expected answer length).",
        },
        {
          kind: "flashcard",
          context: "When does enabling extended thinking *not* help quality even on a hard task?",
          front: "When does extended thinking fail to improve quality?",
          back: "Three cases. (1) **Information bottleneck** — if the task is hard because the input lacks information (not because reasoning is hard), more thinking doesn't help. Fix the input, not the thinking. (2) **Tool-bottleneck** — if the model needs to call a tool to make progress, thinking-without-tool-access just spins. Give it tools. (3) **Prompt clarity bottleneck** — if the model misinterprets the task, thinking goes deeper into the wrong direction. Fix the prompt. Extended thinking amplifies reasoning capacity; it doesn't fix structural prompt problems.",
        },
      ],
    },
    // ─── Section 5: Choosing between them, in practice ───────────────────
    {
      title: "Choosing between them, in practice",
      blocks: [
        {
          kind: "prose",
          markdown: `## A decision tree you can actually use

\`\`\`
Is the task a clear classification / recall / formatting task?
├── Yes → no CoT, no extended thinking. Plain prompt + few-shot.
└── No → continue
    │
    Does it benefit from multi-step reasoning?
    ├── No → plain prompt; consider few-shot for consistency.
    └── Yes → continue
        │
        Does the *consumer of the output* need to see the reasoning?
        ├── Yes (tutoring, audit, review reports) → structured inline CoT.
        └── No → continue
            │
            Is the task hard enough that reasoning quality justifies extra latency?
            ├── No → structured inline CoT with <reasoning> + <answer>. Hide reasoning at display time if needed.
            └── Yes → extended thinking. Strip CoT scaffolding from prompt. Set budget conservatively.
\`\`\`

This decision tree is operationally simple but theoretically rich — each branch encodes a real trade-off (cost, latency, visibility, quality).`,
        },
        {
          kind: "code_comparison",
          label: "Same task, three configurations",
          left: {
            title: "Plain (no reasoning prompt)",
            code: `# Task: "Is this email phishing?"
prompt = f"Email:\\n{email}\\n\\nReturn 'phishing' or 'safe'."

r = client.messages.create(
    model="claude-haiku-4-5",
    max_tokens=10,
    messages=[{"role":"user","content":prompt}],
)
# Cheap, fast, sufficient for obvious cases.
# Errors on subtle phishing.`,
            annotation: "Right baseline for high-volume binary classification. Use Haiku, no reasoning prompt, tight max_tokens.",
          },
          right: {
            title: "Structured CoT",
            code: `# Same task, hard cases routed here
prompt = f"""
Email:
{email}

<analysis>
Examine sender domain, urgency cues, links, request pattern.
</analysis>
<verdict>
phishing | safe
</verdict>
"""

r = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=512,
    messages=[{"role":"user","content":prompt}],
)`,
            annotation: "Better on edge cases. Reasoning is auditable for analyst review. Cost ~10× the plain prompt; route only the cases that need it.",
          },
          takeaway: "Production systems rarely use one configuration for everything. Route easy cases to plain prompts, hard cases to CoT, hardest cases to extended thinking. Each tier is ~5-10× the previous in cost — you save money by only paying for reasoning when you need it.",
        },
        {
          kind: "scenario_predict",
          label: "Tiered routing for cost + quality",
          language: "text",
          scenario: `An ops team triages 10,000 alerts/day. Currently every alert goes
through a single extended-thinking prompt (budget_tokens=2048).
Quality is great. Daily cost is unsustainable.

Their data: 70% of alerts are obvious (clear root cause from the
log message), 25% require some analysis, 5% are genuinely hard
multi-system issues.`,
          question: "What's the tiered architecture and where do the savings come from?",
          answer: "Three tiers: (1) Haiku with plain prompt for obvious alerts (70% of volume). (2) Sonnet with structured CoT for medium alerts (25%). (3) Opus with extended thinking for hard alerts (5%). Router decides tier based on alert metadata + a fast initial classifier. Savings come from the 70% no longer using extended thinking. Risk: misrouting a hard alert to tier 1 produces a bad answer fast. Mitigate by having tier 1 emit a 'confidence' field; low confidence escalates to tier 2.",
          explanation: "Tiered routing is the single highest-ROI pattern when extended thinking is your default. Most volume doesn't need it; spend the budget on the cases where it actually changes the answer. This is the same idea as quality-routing from the workflow-vs-agent guide, applied to reasoning depth.",
        },
        {
          kind: "multiple_choice",
          title: "The wrong choice for the right reason",
          prompt: "A team's customer-facing chatbot is on Opus with extended thinking enabled (budget_tokens=4096) for every user message. They observe high quality but 6-second average latency. They want to ship better latency without quality regression. What's the highest-impact change?",
          choices: [
            {
              text: "Lower budget_tokens to 1024.",
              correct: false,
              rationale: "Reduces latency some, but most user messages don't need thinking at all. Still paying for reasoning on every turn.",
            },
            {
              text: "Add a fast classifier that routes routine messages to plain Sonnet prompts and only escalates hard reasoning to extended thinking.",
              correct: true,
              rationale: "70-90% of user messages are routine ('how do I reset my password,' 'what's my balance'). These don't need thinking at all. Routing to a plain prompt cuts latency to <1 second for most users while keeping extended thinking available for the queries that need it.",
            },
            {
              text: "Switch all traffic to inline structured CoT.",
              correct: false,
              rationale: "Inline CoT is still slow on every turn — you've moved the reasoning into the visible output but haven't reduced the *amount* of reasoning the model does on easy queries.",
            },
            {
              text: "Disable extended thinking and rely on Opus's base capability.",
              correct: false,
              rationale: "Will regress on hard queries. The right fix is per-query routing, not a global disable.",
            },
          ],
          explanation: "The pattern: when reasoning is expensive, the highest-leverage move is usually 'don't reason on queries that don't need it' rather than 'reason less per query.' A router that costs cents per million queries can save thousands of dollars in unnecessary reasoning. This is the most common production optimization for any reasoning-enabled chatbot.",
        },
        {
          kind: "warm_up",
          title: "Reasoning + tools",
          prompt: `In a tool-using agent loop with extended thinking enabled, what must your application do between turns to preserve reasoning quality?`,
          answer: "Pass the prior ThinkingBlock(s) back into the messages array on subsequent turns. Dropping them between turns causes the model to lose its reasoning thread, equivalent to restarting reasoning from scratch each turn.",
          explanation: "Extended thinking in multi-turn settings only works if you preserve the thinking blocks. The SDK is explicit about this; the failure mode is silent (quality regression, not API error). Always test multi-turn flows specifically when enabling thinking.",
        },
        {
          kind: "flashcard",
          front: "The single biggest mistake when adding extended thinking to a production prompt?",
          back: "Leaving the inline CoT scaffolding in place. Teams enable extended thinking on top of prompts that already say 'think step by step' with structured reasoning sections. The model now either (a) double-reasons (in the ThinkingBlock and in the visible response) wasting tokens, or (b) treats the visible reasoning section as the 'real' reasoning and underuses the thinking budget. **When you turn on extended thinking, strip the inline CoT.** Treat them as alternatives, not additives.",
        },
      ],
    },
    // ─── Section 6: Evaluating reasoning prompts ─────────────────────────
    {
      title: "Evaluating reasoning prompts",
      blocks: [
        {
          kind: "prose",
          markdown: `## How to actually tell if CoT (or extended thinking) is helping

The temptation is to read a few outputs and decide. That's how teams ship 'we added CoT' changes that actually hurt. The discipline:

### 1. Have a held-out eval set before you change the prompt
Minimum 50 examples, ideally 200+, with reference answers. Diverse — don't curate only the cases where you suspect CoT helps.

### 2. Run A/B: same model, same temperature, with vs without CoT
Or: with structured CoT vs with extended thinking. Same eval set, same scoring rubric.

### 3. Measure on multiple dimensions
- **Quality**: exact-match, LLM-judge, or human-rated.
- **Latency**: p50, p95, p99.
- **Cost**: total tokens × per-token price.
- **Output adherence**: did the output match the format you specified?

### 4. Stratify by task subtype
Aggregate scores hide segments. Math problems might be 20% better with CoT while factual lookups are 10% worse — net "no change" hides the asymmetric story you need.

### 5. Re-eval when models change
Reasoning behavior shifts across model releases. A prompt that benefited from CoT on the previous model may not need it on the current one (or vice versa). Re-run the A/B when you upgrade models.`,
        },
        {
          kind: "method_ref",
          title: "Eval rubric per reasoning-prompt change",
          importLine: "# Track these metrics for every CoT / extended-thinking change",
          methods: [
            {
              signature: "Quality delta (per subtype)",
              description: "Quality score on held-out set, broken down by task subtype.",
              returns: "Aggregate is misleading; the subtype delta tells you whether to ship.",
            },
            {
              signature: "Latency delta (p50, p95, p99)",
              description: "Wall-clock to first byte and to completion.",
              returns: "CoT and thinking shift the latency distribution; tail latency matters more than mean.",
            },
            {
              signature: "Cost delta (tokens × $/token)",
              description: "Compute total cost on held-out set for old vs new prompt.",
              returns: "Reasoning prompts can be 5-15× more expensive; ROI must justify.",
            },
            {
              signature: "Format adherence rate",
              description: "Fraction of outputs that match the requested format (parseable JSON, required sections present, etc.).",
              returns: "CoT can either help format adherence (forces structure) or hurt it (reasoning leaks into format).",
            },
            {
              signature: "Reasoning fidelity (when relevant)",
              description: "For tasks where the reasoning is consumed, score reasoning quality separately from answer quality.",
              returns: "A confident wrong answer with bad reasoning is worse than a confident wrong answer with good reasoning — the latter is debuggable.",
            },
          ],
        },
        {
          kind: "scenario_predict",
          label: "The A/B that says 'don't ship'",
          language: "text",
          scenario: `Eval results for adding extended thinking to a support-ticket
classifier (categories: billing, technical, sales, other):

                  Without thinking    With thinking (budget=2048)
  Accuracy:       89.2%               90.1%
  p50 latency:    420ms               2.8s
  p99 latency:    1.1s                6.4s
  Cost/request:   $0.0008             $0.0061`,
          question: "Should they ship extended thinking?",
          answer: "No. The accuracy gain (0.9 percentage points) is real but small; the latency and cost increases are large (6-7× latency, 7× cost). For a high-volume classification task, this is a clear 'don't ship.' If they care about the 0.9pp, the right move is tiered routing: route the ~10% of ambiguous tickets to a CoT or thinking-enabled prompt; keep the easy 90% on the fast path.",
          explanation: "This is the most common 'extended thinking didn't pay off' result. Classification rarely benefits enough from thinking to justify the cost. The eval discipline is what catches it — without the A/B, the team would have shipped 7× cost for 0.9pp of accuracy and not realized until the bill came in. Always demand the A/B before reasoning-prompt changes.",
        },
        {
          kind: "code_comparison",
          label: "Naive eval vs disciplined eval",
          left: {
            title: "Naive — 'looks good, ship it'",
            code: `# Spot-check 5 prompts
for q in ["how do I reset my password?",
          "why is my account locked?",
          "I need a refund"]:
    print(answer_with_cot(q))
    print(answer_without_cot(q))
# "CoT version sounds smarter, let's ship."`,
            annotation: "Selection bias (cherry-picked easy examples), confirmation bias (you wanted it to work), no quantification. This is how teams ship 7× cost regressions.",
          },
          right: {
            title: "Disciplined — quantified A/B",
            code: `# Held-out eval set
held_out = load_eval_set("v3", n=200)

results_no_cot = [answer_no_cot(ex.q) for ex in held_out]
results_cot    = [answer_cot(ex.q)    for ex in held_out]

for name, results in [("no_cot", results_no_cot),
                      ("cot",    results_cot)]:
    print(name,
          "acc:", accuracy(results, held_out),
          "p95_ms:", p95_latency(results),
          "cost:", total_cost(results))
# Decide based on numbers, broken down by subtype.`,
            annotation: "Numbers, not vibes. Latency, cost, and accuracy all considered. Subtype breakdown surfaces hidden asymmetries.",
          },
          takeaway: "Reasoning-prompt changes are exactly the kind of change where 'looks good in spot-checks' is most misleading. Spot-checks select for cases where reasoning helps; the eval set surfaces the cases where it doesn't. Always quantify before shipping.",
        },
        {
          kind: "flashcard",
          front: "Why is stratified eval more important for reasoning prompts than for plain prompts?",
          back: "Because reasoning effects are asymmetric across task subtypes. Aggregate accuracy can stay flat while math-subtype accuracy goes up 20% and factual-recall accuracy goes down 15%. If you ship based on aggregate, you've made some users much worse off. Stratified eval (per subtype) catches this and lets you route different subtypes to different prompts. The stratification breakdown is also what makes the case to the customer for tiered routing in the first place — 'CoT helps here, hurts here, here's the router that gets us the upside without the downside.'",
        },
      ],
    },
    // ─── Section 7: Interview drill ──────────────────────────────────────
    {
      title: "Interview drill: customer asks for 'reasoning'",
      blocks: [
        {
          kind: "prose",
          markdown: `## What customers actually mean when they ask for 'reasoning'

The word means different things to different customers. Untangling it is half the conversation.

**"We want the model to reason"** can mean:
- "Quality is bad on hard cases, we heard reasoning models help" → quality lever; reach for structured CoT or extended thinking and quantify the lift.
- "We want users to see the model's work" → visibility/UX feature; structured inline CoT with a rendered <reasoning> block.
- "We want auditability for compliance" → trickier; CoT is plausible-not-causal, so 'auditability' via reading CoT is weaker than they think. Real auditability needs deterministic checks on the answer.
- "We want the model to plan before acting" → agent-loop concern, not a reasoning-prompt concern. Use tools + planning prompts, not extended thinking per se.

The FDE move is to ask "what would change in your product if reasoning got better?" The answer maps to which knob.`,
        },
        {
          kind: "mini_challenge",
          title: "Design exercise: 'help our agents reason better'",
          prompt: `A customer says: "Our internal Q&A bot is great on easy questions but
fails on hard ones. Engineers ask things like 'why did our error rate
spike yesterday around 3pm, and what should we roll back?' Right now
the bot says generic things. We want it to actually reason about the
data."

Design the reasoning strategy. Specifically:
1. What's the right knob (no CoT / inline CoT / extended thinking / something else)?
2. Should every query use the same configuration, or different tiers?
3. How would you measure whether your change actually helps?
4. What's your minimum-shippable v1?

Write your answer as a 5-7 bullet brief.`,
          hints: [
            "The 'easy vs hard' split is the most important clue. Different queries probably need different configurations.",
            "Hard reasoning over logs + metrics is exactly where extended thinking earns its cost. Easy queries are exactly where it doesn't.",
            "What's the metric that proves a hard-question answer is good? You need a held-out eval set, not vibes.",
            "Tools matter here too — the bot may need to query the metrics system, not just reason from prior context.",
          ],
          solution: `### Brief: Reasoning Strategy for Q&A Bot

**1. Two-tier routing, not a global reasoning setting.**
   - Tier 1 (fast path): Haiku or Sonnet with plain prompt + few-shot examples. Handles the easy 70-80% (definitions, runbook lookups, simple status checks).
   - Tier 2 (reasoning path): Sonnet or Opus with **extended thinking** (budget_tokens=4096) + retrieval + metrics tools. Handles the hard ~20% (incident root-causing, multi-system queries).

**2. Router design.**
   - A lightweight classifier (small LLM or trained model) decides tier based on the question. Cues for tier 2: time references, "why" questions, multi-system mentions, requests for action ("what should we roll back").
   - On tier 1 misroute (low confidence in answer), escalate to tier 2 instead of returning a generic answer.

**3. Why extended thinking, not inline CoT, for tier 2.**
   - The engineer wants the *answer* clearly stated, not paragraphs of reasoning. ("Roll back the deploy at 14:52; the error rate spike correlates with config push.")
   - Tone for the answer matters; inline CoT leaks reasoning into the recommendation.
   - The reasoning is still preserved (ThinkingBlock) for debugging when an answer is wrong; we just don't surface it by default.

**4. Tools that matter as much as reasoning.**
   - Extended thinking without tools = the model speculates about data it can't see. Give it: \`query_metrics(metric, time_range)\`, \`search_logs(query, time_range)\`, \`get_recent_deploys(time_range)\`, \`get_runbook(topic)\`.
   - The combination "extended thinking + tool use" is where hard incident questions actually get answered.

**5. Measurement.**
   - Build a held-out eval set of 50 hard questions with reference answers (curated from past incident postmortems). Score on (a) correctness of root cause, (b) actionability of recommendation, (c) presence of supporting evidence.
   - A/B current bot vs new tier-2 path. Target: >40 percentage-point improvement on the eval set before shipping.
   - Track p95 latency on tier 2 (acceptable up to ~30 seconds for incident response, unacceptable for casual Q&A).

**6. Minimum-shippable v1.**
   - Tier 1 only with the new few-shot examples. Ship to engineers. Collect questions where tier 1 fails.
   - Use those failures to (a) curate the held-out set for tier 2, (b) define the tier-2 router's escalation rules, (c) decide tool set.
   - Tier 2 ships in v1.1 after eval-set validation.

**7. Explicit anti-goals.**
   - We will not enable extended thinking on tier 1 ("just add it everywhere"). It's expensive without quality justification on easy queries.
   - We will not surface ThinkingBlock to engineers by default. If they want to see reasoning, they can request "show your work" and we'll render the thinking. Default is clean answer.`,
          takeaway: "When a customer asks for 'better reasoning,' the answer is rarely 'turn on extended thinking globally.' It's usually: tier the workload, give the reasoning tier the tools it needs, measure on a held-out eval set, and ship the tier-1 improvements first. Extended thinking is a precision tool, not a default setting.",
        },
        {
          kind: "scenario_predict",
          label: "The 'transparency' trap",
          language: "text",
          scenario: `A regulated-industry customer says: "We need full transparency. We
want to see every step the model took in arriving at its answer.
Extended thinking gives us the ThinkingBlock — that's our audit trail."`,
          question: "What's the gentle pushback?",
          answer: "The ThinkingBlock is a record of what reasoning the model *articulated*, not necessarily what reasoning *caused* the answer. Research (including Anthropic's) shows model CoT can be post-hoc rationalization. For regulatory auditability, you want deterministic checks on the answer (schema validators, fact lookups against authoritative sources, human review for high-stakes decisions) — not reading thinking blocks. The thinking block is useful debugging context, not a compliance artifact.",
          explanation: "This is a critical FDE pushback to know. Customers in regulated industries often confuse 'visible reasoning' with 'auditable decisions.' These are not the same thing, and a customer relying on CoT for compliance has a vulnerability. The right architecture pairs reasoning (for quality) with deterministic verification (for trust). Anthropic publishes research on this — cite it when the conversation happens.",
        },
        {
          kind: "multiple_choice",
          title: "Customer says 'add reasoning everywhere'",
          prompt: "A customer pushes back when you suggest tiered routing: 'Reasoning makes things better, let's just turn it on everywhere and stop optimizing.' What's the strongest response?",
          choices: [
            {
              text: "'Agree, we can always optimize later if cost becomes an issue.'",
              correct: false,
              rationale: "Defers the problem. Costs from this decision can be 5-15× — by 'later,' the bill has already been bad for a while.",
            },
            {
              text: "'Let me show you the A/B: here are 10 query types where reasoning helps and 10 where it doesn't move the needle but costs 7× more. Tiering gets you the wins without the waste.'",
              correct: true,
              rationale: "Quantified pushback. The customer's framing is binary; yours is portfolio. Showing concrete subtype data shifts the conversation from 'reasoning yes/no' to 'reasoning for which queries.'",
            },
            {
              text: "'Reasoning models are still expensive; let's stick with the current prompt.'",
              correct: false,
              rationale: "Closes the conversation and doesn't address the customer's actual desire (better quality on hard queries). They'll either override you or go elsewhere.",
            },
            {
              text: "'Sure, but only on Opus — we'll save by using a smaller model.'",
              correct: false,
              rationale: "Doesn't solve the core problem. Smaller model + reasoning on every query is still expensive on easy queries; you've just shifted where the waste is.",
            },
          ],
          explanation: "The pattern: reasoning effects are uneven across task subtypes. Showing the customer the stratified A/B (where it helps, where it doesn't) is the most effective way to convert 'on everywhere' into 'on where it matters.' The conversation moves from a global setting to a routing problem — which is exactly the right place for it.",
        },
        {
          kind: "key_insight",
          label: "FDE checklist for any 'reasoning' customer ask",
          insight: `Before recommending a reasoning configuration, get answers to these 7 questions:

1. **What's failing today?** — Be specific. "Quality is bad" isn't enough; "category X queries get vague answers" is.
2. **Is the reasoning the product, or is the answer the product?** — Drives inline CoT vs extended thinking.
3. **What's the latency budget?** — Hard ceiling on what reasoning configurations are viable.
4. **What's the per-query cost budget?** — Limits how much thinking is affordable.
5. **What's the eval set?** — If they don't have one, building one is step zero.
6. **Can the workload be tiered?** — Almost always yes. This is the single highest-ROI architectural move.
7. **What deterministic checks exist on the answer?** — Reasoning improves quality but doesn't substitute for verification, especially in regulated contexts.

If 1, 5, and 6 are unanswered, the recommendation is to step back and answer them before changing prompts. Anything else is shooting in the dark.`,
        },
        {
          kind: "flashcard",
          context: "The fastest way to disarm 'just enable thinking everywhere.'",
          front: "What single demo flips a customer from 'reasoning on everything' to 'reasoning where it matters'?",
          back: "Show them the stratified A/B on their own queries. Take 50 of their representative queries, run with and without extended thinking, score quality + latency + cost, and segment by task subtype. Three rows of that table — 'category A: +15% quality, 6× cost'; 'category B: flat quality, 6× cost'; 'category C: -3% quality, 6× cost' — does more to land tiered routing than any architectural argument. Numbers from their own data are the most persuasive artifact in the FDE toolkit.",
        },
      ],
    },
  ],
};
