import type { StudyGuide } from "../guide-types";

export const structuredOutputPatternsGuide: StudyGuide = {
  topicTitle: "Structured output patterns",
  topicSlug: "structured-output-patterns",
  sections: [
    // ─── Section 1: The structured-output problem ────────────────────────
    {
      title: "The structured-output problem",
      blocks: [
        {
          kind: "prose",
          markdown: `## Why this is harder than it looks

Production code wants JSON. Models emit text. Bridging the gap reliably is one of the most common engineering problems in any LLM-powered system, and it has more failure modes than teams expect:

- **Truncation** — \`max_tokens\` cut off mid-JSON. Closing brace missing. \`json.loads\` raises.
- **Escaping** — strings inside JSON contain unescaped quotes, newlines, or backslashes.
- **Schema drift** — model returns *almost* your schema: extra fields, missing fields, wrong types, slightly different key names.
- **Hallucinated fields** — model adds plausible-looking keys that aren't in your schema.
- **Markdown wrapping** — model returns valid JSON wrapped in \`\`\`json ... \`\`\` fences.
- **Prose preamble** — "Here's the JSON you asked for:" before the actual JSON.
- **Inconsistent enum values** — schema says "severity": "high" | "medium" | "low" and model returns "Medium" or "HIGH".

Anthropic provides three primary techniques to mitigate these, and we'll walk all three. Each has its own sweet spot.

## The three techniques

1. **Tool-use trick** — define a single tool whose input schema *is* your desired output schema. The model "calls" the tool with structured arguments. This is the highest-reliability option for JSON-shaped output.
2. **Prefilled assistant message** — start the assistant turn with \`{\` (or \`[\` or \`<some_tag>\`). Forces the model into the structure immediately.
3. **Schema in prompt** — describe the schema in natural language or paste a JSON schema; ask the model to comply.

Most production systems combine **technique 1 (tool-use) for high-stakes JSON** with **technique 2 (prefill) for partial-structure tasks** and **technique 3 (schema in prompt) as a baseline**.`,
        },
        {
          kind: "key_insight",
          label: "The core decision rule",
          insight: `**For full JSON objects with a fixed schema → tool-use trick.** Highest reliability; the API validates structure at the boundary.

**For partial structure or non-JSON formats (XML, markdown, code) → prefill.** Cheap, fast, no schema definition overhead.

**For exploratory / loose schemas → describe in prompt.** Lowest engineering investment; least reliable; appropriate for prototypes.

Never skip validation on the consuming side. Even with tool-use, you should parse with Pydantic (or similar) and have a recovery path.`,
        },
        {
          kind: "code_comparison",
          label: "Naive ask vs production approach",
          left: {
            title: "Naive — 'just return JSON'",
            code: `prompt = """
Summarize this support ticket and return JSON with keys:
severity, category, suspected_cause, customer_impact.

Ticket: {ticket}
"""

r = client.messages.create(...)
data = json.loads(r.content[0].text)  # 💥 sometimes`,
            annotation: "Will work most of the time. Fails on edge cases: markdown wrap, preamble prose, escaped quotes inside a string field. Production rate of failure: 1-10% depending on prompt and input.",
          },
          right: {
            title: "Production — tool-use + validation",
            code: `class TicketSummary(BaseModel):
    severity: Literal["high", "medium", "low"]
    category: str
    suspected_cause: str
    customer_impact: str

tool = {
    "name": "summarize_ticket",
    "description": "Return structured summary of a support ticket.",
    "input_schema": TicketSummary.model_json_schema(),
}

r = client.messages.create(
    model="claude-sonnet-4-5",
    tools=[tool],
    tool_choice={"type": "tool", "name": "summarize_ticket"},
    messages=[{"role": "user", "content": prompt_with_ticket}],
)
# Extract tool input from the response
tool_use = next(b for b in r.content if b.type == "tool_use")
data = TicketSummary.model_validate(tool_use.input)  # type-safe`,
            annotation: "Tool-use forces the model into a schema-validated arguments object. Pydantic validates the result on your side. Two-layer safety; failure rate <0.1% on typical tasks.",
          },
          takeaway: "Naive 'return JSON' costs you debugging time and ships flaky systems. Tool-use + Pydantic costs ~20 lines of setup and eliminates most failure modes. Use it for any JSON output you depend on.",
        },
        {
          kind: "method_ref",
          title: "Quick reference: three techniques compared",
          importLine: "# Pick by task shape and reliability needs",
          methods: [
            {
              signature: "Tool-use trick",
              description: "Single tool whose input_schema is your output schema; tool_choice forces the model to call it.",
              returns: "Most reliable. Best for: any JSON output with a fixed schema. Adds a layer of API-side validation.",
            },
            {
              signature: "Prefilled assistant message",
              description: "Start the assistant turn with the opening character of your structure ({, [, <tag>).",
              returns: "Cheap and fast. Best for: partial structure, non-JSON formats (XML, code), reducing preamble.",
            },
            {
              signature: "Schema in prompt",
              description: "Describe the schema (natural language, JSON schema, or example).",
              returns: "Lowest setup. Best for: prototyping, simple schemas, when you can't change the API call shape.",
            },
            {
              signature: "Tool-use + prefill (combined)",
              description: "Tool-use for the JSON; prefill the text portion for any accompanying response.",
              returns: "Use when you need both a structured object and a free-form message in the same response.",
            },
            {
              signature: "Pydantic validation (always)",
              description: "Parse model output with a Pydantic model on the consuming side, regardless of technique.",
              returns: "Non-negotiable. Even tool-use can produce slightly-off types; Pydantic is your guardrail.",
            },
          ],
        },
        {
          kind: "scenario_predict",
          label: "Pick the right technique",
          language: "text",
          scenario: `Three asks from product teams:

  A) "Extract 5 structured fields from each invoice we process — strict
     schema, downstream code parses with Pydantic."
  B) "Generate an XML config file for our legacy system based on a
     user's free-form description."
  C) "Prototype: ask Claude to suggest 3 alternative product names with
     a short rationale for each. We'll iterate on the format."`,
          question: "Which technique for each?",
          answer: "A) Tool-use trick — strict schema, production code, validation matters. B) Prefill with '<config>' — XML is not JSON, so tool-use is awkward; prefill is the natural fit. C) Schema in prompt — exploration phase, schema will change, no need for ceremony.",
          explanation: "Match the technique to the lifecycle phase and output shape. Tool-use is most rigorous but has highest setup cost — earn it with strict-schema production traffic. Prefill is general-purpose for non-JSON structure. Schema-in-prompt is the right choice during exploration, knowing you'll graduate as the format stabilizes.",
        },
        {
          kind: "flashcard",
          front: "Why does tool-use beat 'just ask for JSON' on reliability?",
          back: "Three reasons: (1) **Schema enforcement at the API layer** — the model is steered toward the tool's input schema, not raw text. (2) **No preamble or wrapping** — tool calls don't have 'Here's your JSON:' prefixes or markdown fences; the structured input is delivered as a typed tool_use content block. (3) **tool_choice forces invocation** — you can require the model to call the tool, eliminating the 'model decided to answer in prose' failure mode. The remaining work (Pydantic validation) catches type slips that the schema enforcement doesn't.",
        },
      ],
    },
    // ─── Section 2: Tool-use trick in depth ──────────────────────────────
    {
      title: "Technique 1 — Tool-use trick in depth",
      blocks: [
        {
          kind: "prose",
          markdown: `## The pattern, step by step

1. **Define your output schema as a Pydantic model** (or raw JSON schema).
2. **Wrap it as a tool definition** — \`name\`, \`description\`, \`input_schema\`.
3. **Force the model to call it** via \`tool_choice={"type": "tool", "name": "<tool_name>"}\`.
4. **Extract the tool_use block** from the response.
5. **Validate the input on your side** with the same Pydantic model.

## The non-obvious advantages

### The tool description teaches the schema
\`tool.description\` and per-field descriptions in the schema are exactly the place to put guidance the model needs. Examples:
- \`"severity": "high | medium | low — based on user impact, not number of users affected"\`
- \`"suspected_cause": "Cite the specific log line or error code when possible"\`

The model reads these descriptions when deciding values; they're often more effective than the same guidance in the user prompt.

### The tool name signals intent
\`extract_invoice_fields\` reads as "extract" to the model, which biases toward conservative, source-grounded values. \`generate_invoice_metadata\` biases toward more creative outputs. Name your tool for the task semantics.

### Strict mode (where available)
Some providers offer strict-schema mode that errors at decode time on schema violations. Use it when offered; it converts model-side slip-ups into immediate API errors instead of silent bad data.`,
        },
        {
          kind: "code_comparison",
          label: "Anemic tool definition vs descriptive",
          left: {
            title: "Anemic — schema only",
            code: `tool = {
    "name": "summarize",
    "description": "Summarize the ticket.",
    "input_schema": {
        "type": "object",
        "properties": {
            "severity":  {"type": "string"},
            "category":  {"type": "string"},
            "summary":   {"type": "string"},
        },
        "required": ["severity", "category", "summary"],
    },
}`,
            annotation: "Will work but the model has to infer everything. Expect inconsistent enum casing, vague summaries, category drift over time.",
          },
          right: {
            title: "Descriptive — guidance in schema",
            code: `tool = {
    "name": "summarize_ticket",
    "description": (
        "Extract a structured summary from a customer support ticket. "
        "Be conservative — only state what the ticket explicitly says."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "severity": {
                "type": "string",
                "enum": ["high", "medium", "low"],
                "description": (
                    "high = blocks core workflow, "
                    "medium = degrades but workable, "
                    "low = cosmetic or feature request"
                ),
            },
            "category": {
                "type": "string",
                "enum": ["billing", "technical", "account", "other"],
                "description": "Pick 'other' if uncertain.",
            },
            "summary": {
                "type": "string",
                "description": "1-2 sentences. Reference user-stated facts only.",
            },
        },
        "required": ["severity", "category", "summary"],
    },
}`,
            annotation: "Enums constrain values. Per-field descriptions teach the rubric. Tool description sets overall posture. The model has guidance where it actually reads it.",
          },
          takeaway: "Treat the tool's schema descriptions as prompt real estate. Per-field guidance reaches the model right where the decision is made — usually more effective than the same guidance buried in the user prompt.",
        },
        {
          kind: "scenario_predict",
          label: "Forcing the tool call",
          language: "json",
          scenario: `{
  "model": "claude-sonnet-4-5",
  "tools": [{
    "name": "extract_invoice",
    "input_schema": {...}
  }],
  "tool_choice": {"type": "auto"},
  "messages": [{
    "role": "user",
    "content": "Extract structured data from this invoice: ..."
  }]
}`,
          question: "What's wrong with this configuration if the goal is reliable structured output?",
          answer: "tool_choice is 'auto,' which lets the model decide whether to call the tool. For structured-output extraction, you want tool_choice={'type': 'tool', 'name': 'extract_invoice'} which forces the model to call exactly that tool. Without forcing, occasionally the model answers in prose and you have no tool_use block to parse.",
          explanation: "tool_choice modes: 'auto' (model decides), 'any' (must call some tool), {'type':'tool','name':...} (must call this specific tool). For structured output, you want the third — it's the difference between 99.9% reliability and ~95% reliability. Always force-call when the tool is your output mechanism.",
        },
        {
          kind: "method_ref",
          title: "tool_choice modes",
          importLine: "# tool_choice options for Anthropic Messages API",
          methods: [
            {
              signature: '{"type": "auto"}',
              description: "Model decides whether to call any tool. Default behavior.",
              returns: "Use when: tools are optional and you want natural conversation flow. NOT for forced structured output.",
            },
            {
              signature: '{"type": "any"}',
              description: "Model must call some tool, but it picks which.",
              returns: "Use when: multiple tools could produce the structured output you need and you want the model to pick.",
            },
            {
              signature: '{"type": "tool", "name": "..."}',
              description: "Model must call this exact tool. Standard pattern for structured output.",
              returns: "Use when: structured extraction with a single output schema. The reliability sweet spot.",
            },
            {
              signature: '{"type": "none"}',
              description: "Tools are visible but won't be called.",
              returns: "Use when: testing prompts without tool calls; debugging the prose response.",
            },
            {
              signature: "disable_parallel_tool_use",
              description: "Parameter on tool_choice that prevents parallel tool calls when forcing a tool.",
              returns: "Set true for single-output extraction so the model can't decide to call your tool multiple times.",
            },
          ],
        },
        {
          kind: "warm_up",
          title: "What does the response look like?",
          prompt: `When you force a tool call with tool_choice and the model calls it, what fields on the response object tell you (a) the tool was actually called and (b) the structured data the model produced?`,
          answer: "(a) response.stop_reason == 'tool_use'. (b) Iterate response.content; find the block where block.type == 'tool_use'; its .input is the structured object.",
          explanation: "Common bug: assuming response.content[0].input always exists. The response can have multiple content blocks (text + tool_use); always filter by block type. And stop_reason being 'tool_use' confirms the model actually invoked the tool rather than ending the turn.",
        },
        {
          kind: "multiple_choice",
          title: "When tool-use is the wrong choice",
          prompt: "For which of these tasks is the tool-use trick NOT the right pattern?",
          choices: [
            {
              text: "Extract 8 strict fields from each invoice for downstream Pydantic validation.",
              correct: false,
              rationale: "Textbook tool-use case. Strict schema, production code, Pydantic on the receiving side.",
            },
            {
              text: "Generate a long-form report with embedded JSON metadata at the top.",
              correct: true,
              rationale: "The output is mostly prose with a small JSON header. Tool-use turns the response into a tool_call result, making the prose awkward to retrieve. Prefill with a structure ('{\\n  ...metadata...\\n}\\n\\n# Report\\n...') is cleaner.",
            },
            {
              text: "Classify a ticket into one of 4 categories with a confidence score.",
              correct: false,
              rationale: "Small fixed schema → tool-use is ideal. Enums constrain the category; numeric field constrains the confidence.",
            },
            {
              text: "Extract structured action items from a meeting transcript.",
              correct: false,
              rationale: "Variable-length list of structured items → array of objects in tool input. Tool-use handles this cleanly.",
            },
          ],
          explanation: "Tool-use is purpose-built for *the response is structured data*. When the response is *mostly prose with a structured component*, prefill or hybrid patterns serve better. The tool-use trick treats every response as a tool call, which is the wrong frame when the prose is the main deliverable.",
        },
        {
          kind: "flashcard",
          context: "A common 'why doesn't this work' moment.",
          front: "Why might a forced tool call still return incorrect field types?",
          back: "Tool-use enforces the schema *shape* (presence of required keys, basic JSON types) but doesn't enforce semantic correctness. The model can still pass 'high' when the value should be a number, fail to follow an enum exactly ('Medium' vs 'medium'), or invent a category that wasn't in the prompt. Pydantic validation on your side catches these — its enum validators, type coercion, and custom validators are your second line of defense. Treat tool-use + Pydantic as one layered system, not as alternatives.",
        },
      ],
    },
    // ─── Section 3: Prefilled assistant messages ─────────────────────────
    {
      title: "Technique 2 — Prefilled assistant messages",
      blocks: [
        {
          kind: "prose",
          markdown: `## The pattern

Anthropic's Messages API lets you start the assistant turn with text — a "prefill." The model continues from there.

\`\`\`python
messages = [
    {"role": "user", "content": "Return JSON with name and email."},
    {"role": "assistant", "content": "{"},  # prefill
]
\`\`\`

The model picks up after the \`{\`, almost certainly produces JSON that fits the implied structure, and you concatenate the prefill with the response to get a complete object.

## Why prefill is so effective

1. **The model commits to the structure on token 1.** No room for "Here's the JSON:" preamble or markdown fences.
2. **It works with any structure** — JSON, XML, code, markdown, custom formats.
3. **No tool definition overhead.** Sometimes 5 lines of prompt is the whole change.
4. **Composes with system prompt + instructions.** You're not replacing other prompt engineering; you're adding a final commitment device.

## The non-obvious uses

- **Prefill XML tags** when you want structured output the tool-use schema can't easily express.
- **Prefill code fences** (\`\`\`python\\n) when you want a code-only response.
- **Prefill the first list item** ("1.") when you want a numbered list.
- **Prefill an opening quote** (") when you want a single-string response.

## The catch

Whatever you prefill, the API returns *only* the continuation — you concatenate yourself. And the prefill must end at a clean continuation point (don't prefill mid-word).`,
        },
        {
          kind: "code_comparison",
          label: "Without prefill vs with prefill",
          left: {
            title: "Without prefill — model adds preamble",
            code: `r = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=200,
    messages=[{
        "role": "user",
        "content": "Return JSON with name and city for: 'Alice in Paris'"
    }],
)
print(r.content[0].text)
# "Here's the JSON you requested:
#  \`\`\`json
#  {"name": "Alice", "city": "Paris"}
#  \`\`\`
#  Let me know if you need anything else!"`,
            annotation: "Markdown fence, preamble, postamble. json.loads fails. You write a parser that strips fences. The parser breaks on edge cases.",
          },
          right: {
            title: "With prefill — model commits to JSON",
            code: `r = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=200,
    messages=[
        {"role": "user",
         "content": "Return JSON with name and city for: 'Alice in Paris'"},
        {"role": "assistant", "content": "{"},
    ],
    stop_sequences=["}"],  # optional: stop at end of object
)

raw = "{" + r.content[0].text + "}"  # reattach prefill, possibly closing
data = json.loads(raw)
# {"name": "Alice", "city": "Paris"}`,
            annotation: "Model starts inside the JSON. No preamble possible. Optional stop_sequence cleanly ends generation. 5-line difference; orders-of-magnitude reliability improvement.",
          },
          takeaway: "Prefill is the highest leverage-per-line tool in the structured-output toolkit. Adding \`{\` as an assistant message eliminates an entire failure category (preamble + wrapping) at almost zero engineering cost.",
        },
        {
          kind: "method_ref",
          title: "Prefill patterns by output type",
          importLine: "# What to prefill for what shape",
          methods: [
            {
              signature: '{"role": "assistant", "content": "{"}',
              description: "Forces a JSON object response.",
              returns: "Pair with stop_sequences=['}'] for short objects; for nested objects, let the model close.",
            },
            {
              signature: '{"role": "assistant", "content": "["}',
              description: "Forces a JSON array response.",
              returns: "Best for list outputs. Stop on closing bracket for fixed-length lists; let model close for variable.",
            },
            {
              signature: '{"role": "assistant", "content": "<analysis>"}',
              description: "Forces an XML-tagged response. Pair with stop on closing tag.",
              returns: "Best for structured CoT or sectioned reasoning output that needs to be parsed.",
            },
            {
              signature: '{"role": "assistant", "content": "```python\\n"}',
              description: "Forces a Python code block. Stop on closing fence.",
              returns: "Eliminates the 'here is the code' preamble and the conversational postamble.",
            },
            {
              signature: '{"role": "assistant", "content": "1."}',
              description: "Forces a numbered list response.",
              returns: "Reliable list structure; great for enumeration tasks.",
            },
            {
              signature: 'stop_sequences=["</tag>"]',
              description: "Stops generation when the sequence is emitted; the sequence itself is NOT included in output.",
              returns: "Use to cleanly terminate prefilled structures. Note: the stop sequence is excluded, so you may need to reappend it for valid syntax.",
            },
          ],
        },
        {
          kind: "scenario_predict",
          label: "The trailing whitespace trap",
          language: "python",
          scenario: `messages = [
    {"role": "user", "content": "Return JSON with the user's age."},
    {"role": "assistant", "content": "{ "},   # note the trailing space
]
# Model responds with: "name": "Alice", "age": 30 }`,
          question: "What goes wrong and how do you fix it?",
          answer: "The prefill ends with a space, which the model continues from. The reconstructed string '{ \"name\": \"Alice\"...' parses fine, but if you'd prefilled '{ \\\"name\\\": \\\"' the model would have started with a value instead of a key — a different structure than intended. Fix: prefill at a clean structural boundary (just '{' or '{\\n  '), not mid-token.",
          explanation: "Prefill semantics: the model continues from exactly where you stopped. Trailing whitespace inside the prefill is usually fine; partial tokens (mid-key, mid-string) are dangerous because the model may interpret continuation differently than you expected. Stick to structural boundaries: braces, brackets, opening tags, newlines.",
        },
        {
          kind: "warm_up",
          title: "Reattaching the prefill",
          prompt: `You prefill the assistant turn with '{' and set stop_sequences=['}']. The model returns the string '"x": 1, "y": 2'. What's the full valid JSON you'd parse?`,
          answer: "'{' + '\"x\": 1, \"y\": 2' + '}' = '{\"x\": 1, \"y\": 2}'. You manually reattach both the prefill (start) and the stop sequence (end, since stop_sequences are NOT included in the response).",
          explanation: "This is the single most common prefill bug. The Anthropic API excludes the stop sequence from the response text (deliberately, so you can detect why generation stopped). You must reattach it for syntactic completeness. Wrap this in a helper if you use prefill broadly.",
        },
        {
          kind: "multiple_choice",
          title: "Prefill vs tool-use for the same task",
          prompt: "A team needs structured JSON output with a known schema. Their requirement: 'cheap and fast at high volume.' Which is preferable?",
          choices: [
            {
              text: "Tool-use — most reliable.",
              correct: false,
              rationale: "Most reliable yes, but tool definitions add tokens to every request. At very high volume, that overhead is non-trivial.",
            },
            {
              text: "Prefill with '{' — minimal tokens, structure on token 1.",
              correct: true,
              rationale: "Prefill costs almost zero extra tokens; tool-use adds a tool definition every call (~100-500 tokens). At high volume, prefill + Pydantic validation matches tool-use reliability on simple schemas at lower cost.",
            },
            {
              text: "Schema in prompt — most flexible.",
              correct: false,
              rationale: "Flexible but least reliable; flaky at high volume means more retry cost than the savings.",
            },
            {
              text: "Just use the model's default JSON behavior.",
              correct: false,
              rationale: "No commitment device. Will produce markdown fences and preamble. Don't.",
            },
          ],
          explanation: "Prefill shines when token efficiency matters: every request avoids paying for a tool definition. For very-high-volume structured output (millions of requests/day), prefill + Pydantic can outperform tool-use on cost while approaching its reliability. For lower-volume or complex schemas, tool-use is worth the per-request overhead.",
        },
        {
          kind: "flashcard",
          front: "Why can prefill produce technically-invalid JSON even when the model 'follows' the structure?",
          back: "Because the model can produce valid-looking JSON tokens that don't close properly when truncated by max_tokens, or that contain unescaped quotes/newlines inside string values. Prefill commits the model to start inside JSON; it doesn't guarantee a parse-clean exit. Mitigate by: (1) generous max_tokens; (2) stop_sequences on the closing brace for known-bounded outputs; (3) always validate with Pydantic on your side, with a recovery path that retries with a different prefill or asks the model to fix the output.",
        },
      ],
    },
    // ─── Section 4: Schema in prompt + Pydantic validation ───────────────
    {
      title: "Technique 3 — Schema in prompt + Pydantic validation",
      blocks: [
        {
          kind: "prose",
          markdown: `## The pattern

Describe your desired output schema in the user prompt. Three sub-flavors:

1. **Natural language description**: "Return JSON with fields: name (string), age (integer), tags (list of strings)."
2. **JSON Schema dump**: paste the actual JSON Schema as text in the prompt.
3. **Example-driven**: show one filled-in example, then ask the model to produce the same shape for the new input.

This is the lowest-reliability of the three primary techniques, but it has a real place: **prototyping, schemas that are about to change, schemas embedded in larger prose responses, and contexts where you can't use tool-use or prefill.**

## Pydantic is the load-bearing piece

When you're not using tool-use, Pydantic validation on the receiving side is what saves you. The pattern:

\`\`\`python
class Result(BaseModel):
    name: str
    age: int
    tags: list[str]

raw = extract_json_from_response(r.content[0].text)
data = Result.model_validate(raw)  # raises ValidationError on bad data
\`\`\`

The \`extract_json_from_response\` helper is also load-bearing: it strips markdown fences, removes preamble/postamble, and tries to recover from common failures before passing to Pydantic.

## Where this fails — and the recovery options

When validation fails, you have three recovery paths (in order of preference):

1. **Retry with prefill** — re-prompt with assistant prefill of \`{\` to force structure.
2. **Retry with tool-use** — escalate to the more reliable technique.
3. **Self-heal** — send the validation error back to the model and ask it to fix the output.

Self-healing works surprisingly well; it's a one-shot retry that often catches the simple slip-ups.`,
        },
        {
          kind: "code_comparison",
          label: "Example-driven vs prose-described schema",
          left: {
            title: "Prose schema — looser, more variation",
            code: `prompt = """
Extract structured data from this contact card:

{contact_text}

Return JSON with these fields:
- name (string)
- email (string)
- company (string, or null if not present)
- phone (string in E.164 format, or null)
"""`,
            annotation: "Will work, but the model will sometimes phrase things slightly differently — 'company': 'unknown' instead of null, e.g., or include extra fields it thinks are helpful.",
          },
          right: {
            title: "Example-driven — model imitates concrete shape",
            code: `prompt = """
Extract structured data from contact cards. Use this exact format:

Example input:
"Alice Chen, alice@example.com, +14155551234, Acme Corp"

Example output:
{
  "name": "Alice Chen",
  "email": "alice@example.com",
  "phone": "+14155551234",
  "company": "Acme Corp"
}

Now extract from this card:
{contact_text}
"""`,
            annotation: "One concrete example consistently outperforms multiple paragraphs of schema description. The model imitates the example's exact shape, including null handling and field ordering.",
          },
          takeaway: "Few-shot examples beat schema descriptions for output consistency. One worked example is worth several sentences of prose. When the schema is simple enough to fit in an example, show — don't tell.",
        },
        {
          kind: "method_ref",
          title: "Pydantic patterns for LLM output validation",
          importLine: "from pydantic import BaseModel, Field, ValidationError, field_validator",
          methods: [
            {
              signature: "BaseModel",
              description: "The base class for your output schema.",
              returns: "Subclass for each distinct output shape. Use Pydantic v2.",
            },
            {
              signature: "Field(..., description='...')",
              description: "Per-field metadata; description ends up in the auto-generated JSON Schema (great for tool-use).",
              returns: "Use description liberally — same string drives both tool-use schema and code documentation.",
            },
            {
              signature: "field_validator",
              description: "Per-field validation that runs after type coercion.",
              returns: "Use for: case-normalizing enums ('Medium' → 'medium'), trimming whitespace, validating ranges.",
            },
            {
              signature: "model_validator(mode='after')",
              description: "Whole-object validation (e.g., 'end_date must be after start_date').",
              returns: "Use for cross-field invariants that no single field can enforce.",
            },
            {
              signature: "model_validate(raw)",
              description: "Validate a dict (or compatible) into an instance; raises ValidationError on failure.",
              returns: "Catch ValidationError to trigger self-healing or escalation paths.",
            },
            {
              signature: "model_dump_json()",
              description: "Serialize back to JSON string.",
              returns: "Useful for round-tripping through the model in self-heal loops.",
            },
          ],
        },
        {
          kind: "scenario_predict",
          label: "Self-healing in practice",
          language: "python",
          scenario: `# First attempt
data = extract_and_validate(r.content[0].text)
# ValidationError: severity must be one of ['high', 'medium', 'low'], got 'High'

# Self-heal attempt
self_heal_prompt = f"""
Your previous response failed validation:
Error: severity must be one of ['high', 'medium', 'low'], got 'High'

Your previous output was:
{r.content[0].text}

Please return the corrected output.
"""`,
          question: "Will self-healing reliably fix this? What's the better long-term fix?",
          answer: "Self-healing usually fixes simple case-issues like this — the model sees the explicit error and corrects. But the better fix is a Pydantic field_validator that lowercases the enum before validation. That converts a 'failure + retry + cost' into 'silent success at zero extra cost.' Self-heal is the safety net; field_validator is the fix.",
          explanation: "Self-healing is a great recovery mechanism for *unanticipated* failures. For *anticipated* failures (case issues, whitespace, common synonyms), normalize in your validator so they never fail in the first place. The rule: anticipate the failures you've seen twice; let self-heal cover the long tail.",
        },
        {
          kind: "warm_up",
          title: "Why JSON Schema in the prompt is often worse than a Pydantic example",
          prompt: `A team pastes a JSON Schema spec into the prompt: '{"type": "object", "properties": {...}, "required": [...]}'. Output reliability is mediocre. They switch to one filled-in example. Reliability improves. Why?`,
          answer: "JSON Schema is a meta-description; the model has to read it, understand the schema language, and infer what filled-in values look like. A filled-in example shows the model exactly what to produce. Concrete > abstract for LLM imitation. JSON Schema is great for tool-use schemas (where the API consumes it), but for in-prompt schema description, examples win.",
          explanation: "Use JSON Schema where machines read it (tool input_schema). Use filled examples where the model is reading it (in-prompt schema description). Mixing them up is a common source of brittleness.",
        },
        {
          kind: "multiple_choice",
          title: "When schema-in-prompt is actually the right call",
          prompt: "For which scenario is schema-in-prompt (rather than tool-use or prefill) the most appropriate technique?",
          choices: [
            {
              text: "High-volume production extraction with strict downstream parsing.",
              correct: false,
              rationale: "Tool-use is the right choice — reliability and cost both favor it at scale.",
            },
            {
              text: "Rapid prototyping where the schema will change 5 times this week.",
              correct: true,
              rationale: "Lowest setup cost. Iterate on the schema in the prompt; graduate to tool-use once the shape stabilizes. The right pattern for the discovery phase.",
            },
            {
              text: "Long-form report generation with embedded JSON metadata header.",
              correct: false,
              rationale: "Prefill is the natural fit here ('{ \"meta\": ... }\\n\\n# Report\\n...').",
            },
            {
              text: "Strict 5-field extraction for production code.",
              correct: false,
              rationale: "Tool-use again. Strict + production = reach for the most reliable technique.",
            },
          ],
          explanation: "Schema-in-prompt is the right pattern when the cost of the technique (lower reliability) is dominated by the cost of changing it (high during exploration). It's a phase-appropriate choice, not a 'forever' choice. Most production prompts that started as schema-in-prompt graduate to tool-use or prefill once the schema is stable.",
        },
        {
          kind: "flashcard",
          context: "The single most useful Pydantic feature for LLM output handling.",
          front: "What's the highest-ROI Pydantic feature for LLM-output validation?",
          back: "**field_validator that normalizes before validation.** Lowercase enums, strip whitespace, coerce 'yes'/'no' to bool, parse 'YYYY-MM-DD' dates. The model produces small variations of correct answers — your validator absorbs those variations silently. This converts 'flaky pipeline that needs retries' into 'reliable pipeline that just works.' The cost is ~5 lines per field; the benefit is 1-5 percentage points of pipeline success rate. Stack it with Pydantic's automatic type coercion (str → int when possible, etc.) for compound effect.",
        },
      ],
    },
    // ─── Section 5: Failure modes & recovery ─────────────────────────────
    {
      title: "Failure modes & recovery",
      blocks: [
        {
          kind: "prose",
          markdown: `## The full catalog of failures, ranked by frequency

In rough order of how often you'll see them in production:

### 1. Truncation
\`max_tokens\` cut off mid-JSON. Closing brace missing. \`json.loads\` raises.

**Detect:** \`stop_reason == 'max_tokens'\` after the call.
**Fix:** retry with higher \`max_tokens\`; consider streaming + early validation to catch truncation faster.

### 2. Markdown wrapping
Model wraps JSON in \`\`\`json ... \`\`\`. \`json.loads\` fails on backticks.

**Detect:** raw text starts with \`\`\`.
**Fix:** prefill with \`{\`; or strip fences before parsing. Tool-use eliminates this entirely.

### 3. Preamble / postamble prose
"Here's the JSON you requested: { ... } Let me know if you need anything else!"

**Fix:** prefill with \`{\`; or write a recovery parser that finds the first \`{\` and the last matching \`}\`. Tool-use eliminates this entirely.

### 4. Schema drift
Model returns extra fields, missing fields, or close-but-not-exact keys ("user_name" vs "userName").

**Fix:** Pydantic validation catches; tool-use prevents most cases; explicit field naming in schema description prevents the rest.

### 5. Wrong type / wrong enum casing
"severity": "High" instead of "high"; "count": "3" instead of 3.

**Fix:** Pydantic field_validator with type coercion and case normalization.

### 6. Hallucinated fields
Model adds fields that aren't in your schema ("confidence_explanation", "metadata").

**Fix:** Pydantic by default rejects extras with \`extra='forbid'\` config; tool-use schema enforcement also catches.

### 7. String escaping issues
A string field contains a literal quote or newline that the model didn't escape. JSON invalid.

**Fix:** rare with tool-use; with prose-described JSON, use json5 or a tolerant parser as fallback; if persistent, restructure the prompt to encourage the model to escape (or use base64 for genuinely problematic content).`,
        },
        {
          kind: "code_comparison",
          label: "Defensive parsing vs naive parsing",
          left: {
            title: "Naive — single point of failure",
            code: `data = json.loads(r.content[0].text)
return Result(**data)
# Raises on:
#   - markdown wrapping
#   - preamble prose
#   - truncation
#   - escaping issues
# Every failure is unhandled.`,
            annotation: "First-day-of-prototype code. Will hit production failures the first hour after deploy.",
          },
          right: {
            title: "Defensive — multi-layer recovery",
            code: `def safe_parse(text: str, model: type[BaseModel]) -> BaseModel:
    # Layer 1: strip common wrappers
    cleaned = strip_markdown_fences(text).strip()

    # Layer 2: find JSON-like substring
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start < 0 or end < 0:
        raise ValueError("No JSON found in response")
    candidate = cleaned[start:end+1]

    # Layer 3: parse + validate with Pydantic
    try:
        return model.model_validate_json(candidate)
    except ValidationError as e:
        # Layer 4: self-heal once
        fixed = self_heal_via_llm(candidate, str(e), model)
        return model.model_validate(fixed)`,
            annotation: "Four lines of recovery before raising. Handles wrapping, preamble, schema drift, escaping. Self-heals once before giving up.",
          },
          takeaway: "Production parsers are defensive by default. Strip → locate → parse → self-heal → fail loudly. Each layer catches a class of failure. The investment is ~30 lines of helpers and pays back the first week of real traffic.",
        },
        {
          kind: "scenario_predict",
          label: "Diagnosing the failure",
          language: "text",
          scenario: `A team's invoice-extraction pipeline (using prompt-described JSON, no
tool-use) fails on ~3% of invoices with json.JSONDecodeError. Sampling
the failures:
  - 40% have markdown fences in the output
  - 30% have unescaped quotes in the "description" field
  - 20% are truncated (response.stop_reason == 'max_tokens')
  - 10% are mixed`,
          question: "What single change has the highest ROI?",
          answer: "Migrate to tool-use. Tool-use eliminates the 40% markdown-fence cases (no fences in tool_use blocks) and the 30% escaping cases (the API serializes string values correctly). The 20% truncation cases need a separate fix (higher max_tokens) but tool-use addresses 70% of failures with one change.",
          explanation: "When you're seeing structured-output failures cluster like this, the diagnostic is to ask 'which failure modes does the next-best technique eliminate?' Tool-use is purpose-built for the wrapping + escaping classes; prefill addresses preamble + markdown but not escaping; max_tokens helps truncation but nothing else. Cluster the failures, then pick the technique that addresses the largest cluster.",
        },
        {
          kind: "method_ref",
          title: "Recovery strategies, ranked",
          importLine: "# When parsing fails, do these in order",
          methods: [
            {
              signature: "Strip + normalize",
              description: "Remove markdown fences, leading/trailing prose, common preamble patterns ('Here is the JSON:').",
              returns: "Fixes 50%+ of failures with no API cost. Always layer 1.",
            },
            {
              signature: "JSON substring extraction",
              description: "Find first '{' and last matching '}' (or '[' and ']'); parse only that substring.",
              returns: "Handles arbitrary surrounding prose. Trade-off: fails on nested structures with surrounding text containing braces.",
            },
            {
              signature: "Tolerant parser (json5 / dirty-json)",
              description: "Use a parser that accepts JavaScript-style JSON (trailing commas, unquoted keys, single quotes).",
              returns: "Catches a long tail of escaping/quoting failures. Be careful: increases risk of accepting malformed-but-recoverable inputs that would have surfaced real issues.",
            },
            {
              signature: "Self-heal via LLM",
              description: "Send the raw output + the parse/validation error back to the model and ask it to fix.",
              returns: "Fixes most semantic failures (wrong enum, missing field) on one extra call. Cost is one extra API call per failure.",
            },
            {
              signature: "Technique escalation",
              description: "Retry with a more reliable technique (schema-in-prompt → prefill → tool-use).",
              returns: "Use as fallback when self-heal fails. Costs another API call but a different code path is more likely to succeed.",
            },
            {
              signature: "Fail loudly",
              description: "After 1 or 2 recovery attempts, raise a clear error to your application.",
              returns: "Critical. Silently dropping failed extractions hides systemic issues. Surface failures to monitoring + dashboards.",
            },
          ],
        },
        {
          kind: "warm_up",
          title: "Truncation detection",
          prompt: `What field on the Anthropic Messages API response tells you the model was cut off by max_tokens before finishing?`,
          answer: "response.stop_reason == 'max_tokens'. Other values: 'end_turn' (model finished naturally), 'stop_sequence' (hit a stop_sequence), 'tool_use' (called a tool).",
          explanation: "Always check stop_reason after parsing fails. Truncation is silent in the JSON parser ('unexpected end of input') but explicit in the API response. Logging stop_reason on every call helps you triage failure causes in production.",
        },
        {
          kind: "flashcard",
          context: "What you should NOT do when structured output fails.",
          front: "What's the worst recovery strategy for structured output failure?",
          back: "Silently substituting defaults. ('JSON parse failed, return empty dict.') This hides systemic prompt issues, ships bad data downstream, and trains your team to not trust the pipeline. The right escalation: strip + normalize → self-heal → technique escalation → fail loudly. 'Fail loudly' is non-negotiable as the terminal case — every silent failure is debugging debt with interest.",
        },
      ],
    },
    // ─── Section 6: Evaluating structured-output reliability ─────────────
    {
      title: "Evaluating structured-output reliability",
      blocks: [
        {
          kind: "prose",
          markdown: `## What to measure

Two distinct quality questions:

### 1. Structural quality
Does the output parse and validate?
- Parse success rate (% of responses where \`json.loads\` succeeds).
- Validation success rate (% of parsed responses that pass Pydantic).
- Truncation rate (% where stop_reason == max_tokens).

### 2. Semantic quality
Are the values correct?
- Exact-match accuracy per field (where ground truth exists).
- Distributional sanity (do the enums distribute reasonably; are there outliers in numeric fields).
- Cross-field consistency (does \`end_date\` come after \`start_date\`).

**Structural quality is necessary, not sufficient.** A pipeline can have 100% parse success but 30% wrong values. You must measure both.

## Held-out eval set design

For structured output specifically, your eval set should include:
- **Easy cases** — clean input, obvious answers. Baseline.
- **Edge cases** — null-valued fields, optional fields, special characters in strings, multilingual content.
- **Adversarial cases** — inputs that historically caused failures (truncation triggers, escaping triggers).

Maintain the eval set in version control alongside the prompts. When you change the prompt, re-run the eval — every change.

## Specific metrics worth tracking

- **First-attempt parse success rate** (no recovery) — measures the *technique's* reliability.
- **Final success rate** (after recovery) — measures the *pipeline's* reliability.
- **Cost per success** — pipeline cost / successful extractions. Self-heal isn't free.
- **Per-field accuracy** — surfaces specific fields where the model struggles (often the prompt for that field needs work).`,
        },
        {
          kind: "code_comparison",
          label: "Eval as production smoke test",
          left: {
            title: "No eval — ship and hope",
            code: `# Deploy prompt change to prod
# Wait for support tickets
# Hopefully someone notices`,
            annotation: "Common pattern. Reality of how most teams catch prompt regressions: customers do it for them.",
          },
          right: {
            title: "Eval gate in CI",
            code: `def test_extraction_quality():
    held_out = load_eval_set("invoice_extraction_v3")
    results = [run_pipeline(ex.input) for ex in held_out]
    parse_rate = sum(r.parsed for r in results) / len(results)
    accuracy  = sum(r.matches_ground_truth() for r in results) / len(results)
    assert parse_rate >= 0.99, f"Parse rate regression: {parse_rate}"
    assert accuracy   >= 0.92, f"Accuracy regression: {accuracy}"

# Run on every prompt change before merge.`,
            annotation: "Two hard thresholds, run in CI on every prompt PR. Catches regressions before they hit prod.",
          },
          takeaway: "Structured-output pipelines decay silently when prompts change. CI-gated eval thresholds are the cheapest, most reliable defense. The investment is one-time (set up the eval); the payback is every prompt change.",
        },
        {
          kind: "scenario_predict",
          label: "What does this distribution say?",
          language: "text",
          scenario: `A team's pipeline metrics over the last 30 days:
  First-attempt parse success: 97.2%
  After self-heal: 99.4%
  After technique escalation (prefill → tool-use): 99.9%
  Failures requiring human review: 0.1%

Cost breakdown:
  Self-heal contributes 18% of total token cost.
  Technique escalation contributes 4%.`,
          question: "Where should the team invest engineering effort next?",
          answer: "Self-heal is doing a lot of work (18% of cost catching 2.2 percentage points). The team should investigate what's failing first-attempt parse — likely a small number of input patterns or a specific field. Fixing those at the prompt level (e.g., adding examples for the problematic patterns) would convert self-heal volume into first-attempt success at a fraction of the cost.",
          explanation: "Self-heal economics: each invocation is a full extra API call. If self-heal is meaningfully > 5% of cost, you're paying repeatedly for failures that the prompt could prevent. The right move is usually 'analyze the self-heal-recovery cases, find the patterns, fix the prompt' — convert recurring failures into prompt improvements until self-heal is a true safety net (not a primary code path).",
        },
        {
          kind: "method_ref",
          title: "Structured-output eval metrics",
          importLine: "# What to track per prompt version",
          methods: [
            {
              signature: "first_attempt_parse_rate",
              description: "% of responses where the raw output parses (json.loads succeeds) on first try.",
              returns: "Measures technique reliability. Target: >99% for tool-use, >95% for prefill, >85% for schema-in-prompt.",
            },
            {
              signature: "first_attempt_validation_rate",
              description: "% of responses that parse AND pass Pydantic validation on first try.",
              returns: "Tighter than parse rate. Captures schema-drift and enum-casing failures.",
            },
            {
              signature: "final_success_rate",
              description: "% of pipeline runs that produce a valid output (after all recovery).",
              returns: "Bottom line for the pipeline as a whole.",
            },
            {
              signature: "cost_per_success",
              description: "Total token cost / number of successful extractions.",
              returns: "Captures the cost of recovery loops. Watch for self-heal making this metric balloon.",
            },
            {
              signature: "per_field_accuracy[field]",
              description: "Fraction of outputs where field's value matches ground truth.",
              returns: "Surfaces which fields are hardest. Usually concentrates 'free-form text' or 'ambiguous enum' fields.",
            },
            {
              signature: "truncation_rate",
              description: "% of responses where stop_reason == 'max_tokens'.",
              returns: "Should be near zero. If non-trivial, raise max_tokens or restructure the schema for shorter outputs.",
            },
          ],
        },
        {
          kind: "warm_up",
          title: "Per-field accuracy",
          prompt: `Per-field accuracy shows: 'severity' = 98%, 'category' = 96%, 'summary' = 99%, 'suspected_cause' = 71%. What's the most likely problem and the most likely fix?`,
          answer: "'suspected_cause' is a free-form synthesis field with weak guardrails — the model has too much latitude. Likely fix: tighten the field description ('1 sentence; cite the specific log line or error code; do NOT speculate'), provide 2-3 examples of good outputs, and consider splitting into structured sub-fields (error_code: str, supporting_evidence: str) if the field is being asked to do too much.",
          explanation: "Free-form text fields are usually the failure source in structured extraction. The fix is rarely 'tell the model to be better'; it's 'constrain the field with better guidance, examples, or sub-fields.' Per-field accuracy is the most actionable structured-output metric because it points directly at the prompt change you need.",
        },
        {
          kind: "flashcard",
          front: "Why measure parse rate AND validation rate (not just one)?",
          back: "Parse rate measures syntactic validity (is it JSON at all). Validation rate measures schema compliance (does it match your expected structure and types). A response can parse fine but fail validation ('severity' is a string, but not in the enum). A response can fail to parse but be semantically close (one missing comma). You need both numbers because they point to different fixes: parse failures → technique change (prefill, tool-use); validation failures → schema description, examples, or Pydantic validators. Conflating them hides the actionable signal.",
        },
      ],
    },
    // ─── Section 7: Interview drill ──────────────────────────────────────
    {
      title: "Interview drill: ship reliable JSON",
      blocks: [
        {
          kind: "prose",
          markdown: `## The customer ask you'll actually get

A team comes to you with: "Our pipeline extracts structured data from documents and feeds it into our app. It works ~95% of the time but every week we have weird failures. We've added retries everywhere but the cost is climbing and we still have outages."

The diagnosis isn't 'add more retries.' It's that they're running schema-in-prompt at production scale without the surrounding infrastructure. The fix is the migration ladder:

1. **Add Pydantic validation** to surface what's actually failing.
2. **Add field_validators** to absorb common case/whitespace slips.
3. **Adopt prefill** to eliminate markdown wrapping and preamble.
4. **Adopt tool-use** for the strict-schema parts.
5. **Add self-heal** as the recovery layer.
6. **CI-gate the prompt** with a held-out eval.

You don't ship all six at once. You ship them in order, measuring after each.`,
        },
        {
          kind: "mini_challenge",
          title: "Design exercise: 'extract structured data from invoices'",
          prompt: `A customer says: "We process 50,000 invoices/day. Each invoice is a PDF
that we OCR into text. We need 8 structured fields extracted per invoice:
vendor_name, invoice_number, invoice_date, due_date, line_items (list of
{description, quantity, unit_price, line_total}), subtotal, tax, total.

Our current approach: prompt Claude with the schema description in prose,
parse JSON from the response, retry once on failure. Failure rate is 4-7%
depending on the day. Cost is climbing because of retries. We want
<0.5% failure rate."

Design the system. Specifically:
1. Which technique(s) to use?
2. Where does Pydantic fit in?
3. How do you handle the line_items list (variable length)?
4. What's the recovery strategy?
5. What CI / eval discipline?
6. What's the minimum-shippable v1?

Write your answer as a 6-8 bullet brief.`,
          hints: [
            "8 strict fields, production code, downstream parsing — this is the textbook tool-use case.",
            "line_items is a variable-length list of structured items. Tool-use input schemas handle this natively.",
            "What's the difference between 4-7% failure and <0.5% failure? Often: one prompt change + one validation change + better recovery.",
            "The 50k/day volume means cost matters — every recovery API call is real money. Aim for high first-attempt success.",
          ],
          solution: `### Brief: Invoice Extraction Pipeline

**1. Primary technique: tool-use trick.**
   - Define a single \`extract_invoice\` tool whose input schema is the 8-field structure.
   - tool_choice={'type': 'tool', 'name': 'extract_invoice'} to force invocation.
   - Use Sonnet (cost-appropriate for 50k/day; Opus only if quality eval justifies).
   - This single change typically takes 4-7% failure to <1% on its own.

**2. Pydantic schema (single source of truth):**
   \`\`\`python
   class LineItem(BaseModel):
       description: str
       quantity: float
       unit_price: float
       line_total: float

   class Invoice(BaseModel):
       vendor_name: str
       invoice_number: str
       invoice_date: date
       due_date: date | None
       line_items: list[LineItem]
       subtotal: float
       tax: float
       total: float
   \`\`\`
   - Use \`Invoice.model_json_schema()\` to populate the tool's input_schema. One schema definition, two uses.

**3. Validators that absorb common slip-ups:**
   - field_validator on dates: parse common formats ('2024-01-15', '01/15/2024', '15-Jan-2024').
   - field_validator on currency fields: strip '$', ',', whitespace before float conversion.
   - model_validator (after): assert abs(subtotal + tax - total) < 0.01; warn (not error) on mismatch — preserves the data but logs the inconsistency.

**4. Recovery ladder (in order):**
   - L1: \`safe_parse\` strips markdown/prose (defensive, even though tool-use shouldn't produce it).
   - L2: Pydantic validation with helpful error messages.
   - L3: Self-heal — one retry with validation error fed back to the model.
   - L4: Fail loudly — write to a "needs human review" queue with the raw response + error.

**5. CI / eval discipline:**
   - Held-out set: 200 invoices with hand-labeled ground truth. Diverse vendors, edge cases (multi-page, multi-currency, line-item variation).
   - Metrics tracked per prompt change: first_attempt_validation_rate (target >99%), per_field_accuracy (target >97% per field), final_success_rate (target >99.5%), cost_per_success (target ≤ $0.02).
   - CI fails the PR if any metric regresses.

**6. Minimum-shippable v1:**
   - Tool-use + Pydantic + safe_parse + self-heal (one retry) + the held-out eval set + CI gate.
   - Ship behind a feature flag with 1% canary; ramp to 100% as the metrics hold.
   - Do NOT add the "human review queue" UI in v1; just log + alert on failures and review them manually for the first week.

**7. Cost model:**
   - Sonnet at typical invoice token sizes: ~$0.005/invoice first attempt.
   - Self-heal at 0.5% triggers ~$0.000025/invoice average overhead — negligible.
   - 50k/day → ~$250/day, ~$7,500/month. Within typical mid-market budget.

**8. What we explicitly won't do in v1:**
   - We won't try to handle non-English invoices (separate prompt + eval needed).
   - We won't process scanned-PDF directly (OCR upstream stays as-is).
   - We won't add field-level confidence scores (useful but out of scope for v1).

**Expected outcome:** First-attempt validation >99%, after-self-heal >99.5%, cost per successful extraction ~$0.005-0.01.`,
          takeaway: "Real structured-output pipelines have four parts: the technique (tool-use here), the schema (Pydantic as single source of truth), the recovery layer (safe_parse + self-heal + fail-loudly queue), and the eval discipline (CI-gated held-out set). Skipping any one of these is why the customer is at 4-7% failure. Add them in order and measure.",
        },
        {
          kind: "scenario_predict",
          label: "When to NOT use tool-use",
          language: "text",
          scenario: `A customer is building a chatbot that occasionally needs to log
structured events when the user mentions one (e.g., "I'd like to
report a bug" → log {type: 'bug_report', summary: ...}). 95% of the
time the bot just responds in prose.`,
          question: "Should they use tool-use for the structured logging?",
          answer: "Yes — but with tool_choice='auto' rather than forced. Tool-use is the natural fit because the structured logging is sometimes-needed; auto-mode lets the model decide. Forced tool-use would convert every response into a tool call, which is wrong for the 95% prose case. This is the textbook 'tool-use with auto' pattern: model has the tool available, calls it when relevant, otherwise responds in prose.",
          explanation: "tool_choice='auto' (rather than forcing) is the right pattern when structured output is *conditional*, not *always*. Many teams reflexively force tool calls and break their conversational flows. Reserve forcing for 'every response is structured'; use auto for 'sometimes structured.'",
        },
        {
          kind: "multiple_choice",
          title: "The 99%-to-99.9% gap",
          prompt: "A team has gotten their structured-output pipeline to 99% first-attempt validation rate using tool-use + Pydantic. The remaining 1% is a long tail. What's the single highest-leverage improvement to push toward 99.9%?",
          choices: [
            {
              text: "Switch to a stronger model (Sonnet → Opus).",
              correct: false,
              rationale: "Will help but is expensive across all traffic; the 1% might not concentrate where Opus's marginal capability matters.",
            },
            {
              text: "Add self-heal as a single-retry recovery layer.",
              correct: true,
              rationale: "Single retry with the validation error fed back catches most of the long tail (semantic slips, unusual inputs). Costs ~0.5% extra API calls (only the failing 1%), brings final rate to ~99.9%. Highest ROI for that range.",
            },
            {
              text: "Add more retries (3-5) of the same prompt.",
              correct: false,
              rationale: "Re-rolling the dice on the same approach is less effective than self-heal (which gives the model the specific error to fix). And cost grows linearly with retry count.",
            },
            {
              text: "Hand-curate prompt examples for the failing cases.",
              correct: false,
              rationale: "Valuable long-term — particularly if failures cluster — but slower to implement and the 1% may not concentrate enough to justify case-by-case examples.",
            },
          ],
          explanation: "Self-heal is the single highest-ROI move in the 99%-to-99.9% range. It addresses the *semantic* failures (close-but-wrong outputs) that the technique itself can't catch, at a marginal cost proportional to the failure rate (not the total volume). Beyond 99.9%, the next moves are: analyze the residual failures, find clusters, and either fix at the prompt level or accept them as 'needs human review.'",
        },
        {
          kind: "key_insight",
          label: "FDE checklist for any structured-output ask",
          insight: `Before recommending an architecture for structured output:

1. **What's the schema?** — If it's stable and strict, tool-use. If it's exploratory, schema-in-prompt + plan to migrate.
2. **What's the volume?** — Affects cost-sensitivity to technique overhead and to self-heal calls.
3. **What's the consuming code?** — Downstream Pydantic? Spreadsheet import? Direct DB insert? Drives validation strictness.
4. **What's the current failure rate?** — Anchors the improvement goal. 5% → 1% is a different project than 1% → 0.1%.
5. **What recovery is in place?** — Many teams have none. Adding self-heal alone is often a 5x reliability improvement.
6. **What's the eval set?** — If no held-out set, build one in week 1. Without it you can't tell which changes help.
7. **How does the pipeline fail today?** — Cluster the failures. The right next move depends on which class dominates.
8. **What's the budget?** — Self-heal costs real money at high volume; sometimes the right answer is to invest in prompt improvements instead of safety nets.

If questions 1, 4, and 6 are unanswered, build the eval set and characterize failures *before* changing techniques.`,
        },
        {
          kind: "flashcard",
          context: "The single sentence that lands tool-use as the default.",
          front: "What's the one-line case for tool-use being your default technique for structured JSON?",
          back: "'Tool-use makes the schema part of the API contract — the model is steered toward your structure at the decoding boundary, not just instructed in prose to follow it.' That single sentence explains why tool-use beats schema-in-prompt for reliability: instructions are negotiable; schemas baked into the tool-use protocol are not. Pair this with 'and we'll layer Pydantic validation on the consuming side for the semantic-correctness checks the schema can't enforce' and you've delivered the full architecture in two sentences.",
        },
      ],
    },
  ],
};
