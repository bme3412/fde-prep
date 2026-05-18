import type { StudyGuide } from "../guide-types";

export const extendedThinkingPatternsGuide: StudyGuide = {
  topicTitle: "Extended thinking patterns",
  topicSlug: "extended-thinking-patterns",
  sections: [
    // ---------------------------------------------------------------
    // Section 1 — Mental model: when extended thinking is worth it
    // ---------------------------------------------------------------
    {
      title: "Mental model: when extended thinking is worth it",
      blocks: [
        {
          kind: "prose",
          markdown: `
**Extended thinking** is the \`thinking\` parameter on the Messages API. When enabled,
Claude emits a stream of \`thinking\` content blocks *before* the user-facing answer —
it's the model's *internal scratchpad*, surfaced as structured response content. The
thinking is **not** shown to your end-user automatically; you decide whether to
expose it (debug UI, "show reasoning" toggle) or just consume the final \`text\` blocks.

The customer-facing pitch: *"For hard problems, Claude can think longer before
answering."* The right mental analogy is **handing a problem to a senior engineer
who shuts their door for ten minutes** vs. asking a junior to fire back a quick reply.
You pay for the extra minutes in latency and tokens; you get back the answer the
senior would have given.

The cases where extended thinking actually moves accuracy:

- **Multi-constraint problems.** Scheduling with N hard + M soft constraints, allocating
  budget across competing priorities, picking SKUs that satisfy a complex eligibility
  rule.
- **Policy / contract interpretation.** "Given this 12-page policy and this scenario,
  does it cover X?" — the kind of question that needs careful reading and case analysis.
- **Math-heavy analysis.** Variance decompositions, unit-economics walk-throughs,
  reconciling numbers across messy inputs.
- **Code review / root-cause analysis.** Reasoning about why a system is broken, not
  just patching the symptom.

The cases where extended thinking is **wasted money**:

- **Factual recall.** "What's the capital of Argentina?" — extra thinking doesn't help.
- **Formatting / extraction.** Pull fields out of a doc — already a one-shot model task.
- **Short chat / customer support.** Latency cost > reasoning benefit.
- **Anything latency-sensitive in a UI loop.** Each thinking call can add 5–60s.
`,
        },
        {
          kind: "key_insight",
          label: "The 'senior engineer' heuristic",
          insight: `Ask: *if a senior engineer had to answer this, would they pause, sketch on a whiteboard, and verify before responding?* If yes → extended thinking earns its keep. If they'd just answer off the top of their head → plain prompting is faster and cheaper. The model behaves analogously: thinking budget is most valuable on problems with **multi-step reasoning or branching case analysis**, and least valuable on problems with a single retrievable answer.`,
        },
        {
          kind: "flashcard",
          front: "Three cases where you should NOT enable extended thinking.",
          back: `1. **Factual recall** ("what's the SLA on plan X?") — the answer is one lookup; extra thinking is dead tokens.
2. **Formatting / extraction** ("pull line items as JSON") — already a single-pass model task; thinking adds latency with no accuracy gain.
3. **Latency-sensitive UX** (chat-style support, autocomplete, anything live) — even a +5s p50 ruins the experience. Extended thinking is for *deliberate* turns the user expects to wait on, not for every message.`,
        },
      ],
    },

    // ---------------------------------------------------------------
    // Section 2 — The API surface
    // ---------------------------------------------------------------
    {
      title: "The API surface: enabling and budgeting thinking",
      blocks: [
        {
          kind: "method_ref",
          title: "The `thinking` parameter on Messages.create",
          importLine: "client.messages.create(... thinking={...}, ...)",
          methods: [
            {
              signature:
                'thinking={ "type": "enabled", "budget_tokens": N }',
              description:
                "Turn on extended thinking. `budget_tokens` is the maximum number of thinking tokens the model will spend on this turn. The model may use less; it will not exceed this cap. Typical values: 1024 (light), 8000 (default-ish), 32000+ (deep).",
            },
            {
              signature: "max_tokens > budget_tokens (required)",
              description:
                "`max_tokens` is the cap for *all* output tokens (thinking + text + tool_use). It MUST be strictly greater than `budget_tokens` — otherwise the request is rejected. Rule of thumb: set `max_tokens = budget_tokens + your_expected_answer_size`.",
            },
            {
              signature: "Supported models",
              description:
                "Available on Claude Opus 4+ and Sonnet 4+ (claude-opus-4-5, claude-sonnet-4, etc.). Not available on Haiku or legacy 3.x models — check the model card before assuming.",
            },
            {
              signature: "Temperature must be 1 when thinking is on",
              description:
                "Extended thinking requires `temperature=1` (the default). Lower temperatures are rejected. If your prompt previously relied on `temperature=0` for determinism, you'll need to accept some variance.",
            },
            {
              signature: "Compatible with tool_use",
              description:
                "Tools work fine with thinking — the model thinks, then either emits `tool_use` blocks or a final `text` answer. Multi-turn tool loops must preserve the thinking blocks; see Section 3.",
            },
          ],
        },
        {
          kind: "code_comparison",
          label: "Plain request vs. extended-thinking request",
          left: {
            title: "Plain — no thinking",
            code: `resp = client.messages.create(
    model="claude-opus-4-5",
    max_tokens=1024,
    messages=[{
        "role": "user",
        "content": "Given these 8 employees with availability + skill "
                   "constraints, design a 3-shift weekly schedule.",
    }],
)
# resp.content = [TextBlock(text="...")]
# Usage: ~150 input, ~600 output tokens.`,
            annotation:
              "Fast, cheap, but on a constraint-satisfaction problem like this the model often hand-waves through edge cases — you get a plausible-looking schedule that violates one or two of your constraints.",
          },
          right: {
            title: "Extended thinking enabled",
            code: `resp = client.messages.create(
    model="claude-opus-4-5",
    max_tokens=10000,                       # must exceed budget_tokens
    thinking={
        "type": "enabled",
        "budget_tokens": 8000,
    },
    messages=[{
        "role": "user",
        "content": "Given these 8 employees with availability + skill "
                   "constraints, design a 3-shift weekly schedule.",
    }],
)
# resp.content = [
#   ThinkingBlock(thinking="Let me enumerate constraints..."),
#   TextBlock(text="..."),
# ]
# Usage: ~150 input, ~5500 thinking + ~600 text tokens.`,
            annotation:
              "Slower (+10–30s) and ~10× more output tokens, but on a multi-constraint problem the answer is materially more correct — the model actually enumerates the constraints, tries assignments, and backtracks before committing.",
          },
          takeaway:
            "The decision isn't 'thinking on or off' in the abstract — it's 'is this turn worth the latency + token tax?'. Reach for it on the few turns where reasoning depth changes the answer, not on every message.",
        },
        {
          kind: "scenario_predict",
          label: "max_tokens vs. budget_tokens — what fails?",
          language: "python",
          scenario: `# Request A
client.messages.create(
    model="claude-opus-4-5",
    max_tokens=1024,
    thinking={"type": "enabled", "budget_tokens": 8000},
    messages=[...],
)

# Request B
client.messages.create(
    model="claude-opus-4-5",
    max_tokens=10000,
    thinking={"type": "enabled", "budget_tokens": 8000},
    temperature=0,
    messages=[...],
)`,
          question:
            "Which of A and B succeed, which fail, and why?",
          answer: `**A fails:** \`max_tokens=1024\` < \`budget_tokens=8000\`. \`max_tokens\` must strictly exceed \`budget_tokens\` because thinking tokens count against the same output cap — without headroom the model has no room to actually emit the answer. **B fails:** \`temperature=0\` is incompatible with extended thinking; it must be \`1\` (the default). Both return 400 errors. Fix A by raising \`max_tokens\` to e.g. 10000; fix B by removing the \`temperature\` override.`,
          explanation:
            "Two of the three most common 'I turned on thinking and now I get 400s' bugs. The third is using a model that doesn't support thinking (Haiku, legacy 3.x). Always check: max_tokens > budget_tokens, temperature=1, model supports thinking.",
        },
        {
          kind: "warm_up",
          title: "Fill in the thinking parameter",
          prompt: `Complete the missing fields so this request enables extended thinking with a 4,000-token budget:

\`\`\`python
client.messages.create(
    model="claude-opus-4-5",
    max_tokens=_______,         # must satisfy the budget invariant
    thinking={
        "type": "________",
        "____________": 4000,
    },
    messages=[...],
)
\`\`\``,
          answer:
            "`max_tokens` must be **strictly > 4000** (e.g., `5000` or `6000`). `type` is `\"enabled\"`. The key is `budget_tokens`.",
          explanation:
            "Three values to memorize: `type: \"enabled\"` (the only valid value today; future expansion is why it's a discriminated union), `budget_tokens: N`, and `max_tokens > budget_tokens`. Forget any of the three and you get a 400.",
        },
      ],
    },

    // ---------------------------------------------------------------
    // Section 3 — Parsing thinking + answer blocks
    // ---------------------------------------------------------------
    {
      title: "Parsing thinking + answer blocks",
      blocks: [
        {
          kind: "prose",
          markdown: `
With extended thinking enabled, \`response.content\` is **no longer a flat list of text
blocks**. It's a mixed sequence:

\`\`\`
content = [
  ThinkingBlock(thinking="...", signature="..."),   # the model's scratchpad
  TextBlock(text="..."),                            # the user-facing answer
]
\`\`\`

If tools are enabled, you may also see \`tool_use\` blocks interleaved. If Anthropic's
safety layer redacts a chunk of thinking, you'll see \`RedactedThinkingBlock(data=...)\`
instead of \`ThinkingBlock\` — the model's reasoning is preserved as an opaque token
sequence (you can't read it), but the block **must be passed back unchanged** on
multi-turn requests or the model loses reasoning continuity.

Two rules to internalize:

1. **The model's *answer* is in the \`text\` blocks, not the \`thinking\` block.** Naive
   code that concatenates every block's content (treating thinking as part of the
   answer) ships the scratchpad to your end-user. Don't do that.
2. **On multi-turn, preserve thinking blocks (including redacted ones) in
   conversation history.** Each thinking block carries a \`signature\` field that proves
   the block came from Anthropic. Stripping them — or worse, mutating them — breaks the
   integrity check on the next turn and the model's prior reasoning is discarded.
`,
        },
        {
          kind: "method_ref",
          title: "Block types in an extended-thinking response",
          importLine: "from anthropic.types import (...)  # SDK names approximate",
          methods: [
            {
              signature: 'type: "thinking" — { thinking: str, signature: str }',
              description:
                "The model's internal reasoning, in plain text. The `signature` is an Anthropic-issued integrity proof that must be sent back unchanged on the next turn for multi-turn conversations.",
            },
            {
              signature:
                'type: "redacted_thinking" — { data: str }',
              description:
                "A chunk of thinking the safety layer redacted. You can't read it; you also can't drop it without breaking multi-turn continuity. Forward it verbatim.",
            },
            {
              signature: 'type: "text" — { text: str }',
              description:
                "The user-facing answer. This is what you display. May appear after the thinking block (typical case) or interleaved with tool_use blocks (agentic loops).",
            },
            {
              signature: 'type: "tool_use" — { id, name, input }',
              description:
                "Same shape as without thinking. Tool loops work the same way — execute the tool, return a tool_result, send the next request *with the prior thinking blocks preserved*.",
            },
            {
              signature: "Block order is meaningful",
              description:
                "Always: zero or more `thinking`/`redacted_thinking` blocks first, then `text` and/or `tool_use` blocks. Don't reorder when echoing back to the API.",
            },
          ],
        },
        {
          kind: "code_comparison",
          label: "Naive concatenation vs. proper block separation",
          left: {
            title: "Naive — concatenate everything",
            code: `def render(resp):
    return "".join(
        getattr(b, "text", "") or getattr(b, "thinking", "")
        for b in resp.content
    )

# Ships the model's scratchpad to the user. Looks like:
# "Let me think... constraint 1 says... constraint 2...
#  okay so my answer is: Shift A = Alice, Bob, Carl;
#  Shift B = ..."`,
            annotation:
              "The user sees the model's stream-of-consciousness. Bad UX, sometimes confidential (the model may surface internal reasoning the customer shouldn't see).",
          },
          right: {
            title: "Proper — answer vs. reasoning, separated",
            code: `def render(resp):
    answer = "".join(
        b.text for b in resp.content if b.type == "text"
    )
    reasoning = "\\n".join(
        b.thinking for b in resp.content if b.type == "thinking"
    )
    return {"answer": answer, "reasoning": reasoning}

# UI shows answer by default; "Show reasoning" toggle
# reveals the thinking. Redacted blocks are simply
# not surfaced (you'd render "(reasoning redacted)" if
# you wanted to signal their existence).`,
            annotation:
              "Two clean fields: the answer for the user, the reasoning for debug/audit. Treat redacted blocks as opaque — don't try to display them.",
          },
          takeaway:
            "Extended thinking turns the response from 'a string' into 'a small structured document.' The user wants the answer; you (the developer) want the reasoning trace for debugging and audits. Keep them separate by branching on `block.type`, not by string-concatenating everything.",
        },
        {
          kind: "scenario_predict",
          label: "What breaks when you strip thinking from history?",
          language: "python",
          scenario: `# Turn 1: assistant responded with [ThinkingBlock(...), TextBlock("answer 1")]
# You stored only the text in your conversation history.

messages = [
    {"role": "user", "content": "Schedule shift A..."},
    {"role": "assistant", "content": [
        {"type": "text", "text": "Shift A = Alice, Bob, Carl. Shift B = ..."}
    ]},
    {"role": "user", "content": "Now reshuffle so Alice and Bob aren't on the same shift."},
]

resp = client.messages.create(
    model="claude-opus-4-5",
    max_tokens=10000,
    thinking={"type": "enabled", "budget_tokens": 8000},
    messages=messages,
)`,
          question:
            "Does this work? What does the model lose, and what's the fix?",
          answer: `It *runs* — no 400, the model produces an answer. But the model has **lost its prior reasoning chain**. From its perspective it sees only the final schedule, not the constraint enumeration that produced it; re-deriving the constraints from scratch may produce a different (and possibly contradictory) line of reasoning on turn 2. **Fix:** persist the full assistant content array — \`ThinkingBlock\`(s), \`RedactedThinkingBlock\`(s), \`TextBlock\`(s), each with their \`signature\` field intact — and replay it verbatim. The SDK's response objects serialize correctly via \`model_dump()\`; don't hand-build dicts that drop fields.`,
          explanation:
            "Thinking blocks are part of the assistant's persistent state for that conversation. Stripping them is like erasing your scratchpad between problems — you can keep going, but you're starting from less than the model had a moment ago. On multi-turn reasoning tasks (debugging, scheduling refinement) this is the difference between a coherent and a confused agent.",
        },
      ],
    },

    // ---------------------------------------------------------------
    // Section 4 — Latency, cost, and multi-turn realities
    // ---------------------------------------------------------------
    {
      title: "Latency, cost, and multi-turn realities",
      blocks: [
        {
          kind: "key_insight",
          label: "The latency and cost profile",
          insight: `**Latency:** extended thinking adds **5–60s** to the response, depending on \`budget_tokens\` and how much of the budget the model actually uses. p99 can be much worse on hard problems. Stream the response — \`thinking\` blocks stream incrementally, so you can show a "thinking..." UI affordance instead of a blank spinner.

**Cost:** thinking tokens are billed at the **standard output rate** for the model. An 8000-token thinking budget on Opus 4 is materially more expensive than a plain call. Estimate: \`(input_tokens × in_rate) + (thinking_tokens + answer_tokens) × out_rate\`.

**Prompt caching:** thinking is compatible with caching, but caching applies to the *input* (system prompt, prior messages). It does not cache the thinking itself — each turn re-computes the scratchpad.`,
        },
        {
          kind: "multiple_choice",
          title: "Pick the right reasoning strategy",
          prompt:
            "A customer has four AI features in their product. For which one is extended thinking the right tool?",
          choices: [
            {
              text: "Live chat for customer support — autocomplete-style replies, p50 target 1.5s.",
              correct: false,
              rationale:
                "Latency budget kills it. Even a 5s extra wait per message destroys the chat UX. Use plain prompting + a tight system prompt.",
            },
            {
              text: "Extract structured fields (name, address, total) from uploaded invoices.",
              correct: false,
              rationale:
                "Extraction is a single-pass task — the model finds the fields and returns them. Thinking adds latency and tokens with no accuracy gain.",
            },
            {
              text: "An 'eligibility checker' that takes a 12-page policy + a customer scenario and answers whether the scenario is covered.",
              correct: true,
              rationale:
                "Multi-constraint, branching case analysis, high stakes — exactly the senior-engineer-with-the-door-shut profile. Worth the 10–30s latency tax and the extra tokens; the accuracy delta on policy interpretation is large.",
            },
            {
              text: "Translate a paragraph from English to Spanish.",
              correct: false,
              rationale:
                "Translation is well-handled by the standard forward pass. Thinking might marginally improve idiom selection on very tricky passages, but for typical prose it's wasted spend.",
            },
          ],
          explanation:
            "The pattern: **multi-step reasoning + branching + high stakes** → extended thinking. **Single-pass tasks (extract, translate, classify, recall) + latency-sensitive UX** → plain prompting. Use thinking where reasoning depth genuinely changes the answer, not as a 'make it smarter' knob you turn on everywhere.",
        },
        {
          kind: "prose",
          markdown: `
**Tool-use loops + thinking — the integrity rule.**

When you run an agentic loop with thinking enabled, every assistant turn comes back as:

\`\`\`
[ThinkingBlock(thinking=..., signature=...), ToolUseBlock(name=..., input=...)]
\`\`\`

You execute the tool, append a \`tool_result\`, and send the next request. **The next
request must include the full prior assistant content** — thinking blocks, redacted
thinking blocks, tool_use blocks — exactly as Anthropic returned them. If you only echo
back the \`tool_use\` block (or worse, just the tool_use \`id\` and \`name\`), the model:

1. **Loses its reasoning trace.** Each subsequent turn re-derives the strategy from
   scratch.
2. **Fails the signature check** on its own prior thinking block, which surfaces as a
   400 error in some SDK versions, and as silent reasoning loss in others.

The SDK helpers (\`response.model_dump()\`, \`.to_dict()\`) preserve these fields by
default. Trouble usually starts when developers hand-roll a "store messages as text"
abstraction that strips the structure. **Don't.** Treat the assistant content array as
an opaque structure; persist it as-is.
`,
        },
        {
          kind: "prose",
          markdown: `
**Pre-flight checklist before turning on extended thinking in production:**

1. **Is this turn worth 10–60s of extra latency?** If the UX expects sub-3s, don't.
2. **Does reasoning depth actually move the needle on this task?** Recall / extract / format / translate → no. Multi-constraint / policy / math / RCA → yes.
3. **Have you set \`max_tokens > budget_tokens\` and \`temperature=1\`?** Both required.
4. **Are you on a thinking-capable model?** Opus 4+ / Sonnet 4+ only. Haiku and 3.x silently 400.
5. **Does your renderer separate \`thinking\` from \`text\`?** Don't ship the scratchpad to end-users by default. Provide a "show reasoning" toggle if you want it visible.
6. **Multi-turn: are you preserving \`ThinkingBlock\` and \`RedactedThinkingBlock\` in history?** With their \`signature\` fields intact. Use the SDK's serialization helpers, not hand-rolled dicts.
7. **Streaming?** Highly recommended. A streamed "thinking..." UI is far better than a blank spinner for 30s.
8. **Caching:** thinking is compatible with input prompt caching, but does not cache thinking itself. Budget cost accordingly.

Pass all eight, and extended thinking earns its place in the request.
`,
        },
      ],
    },
  ],
};
