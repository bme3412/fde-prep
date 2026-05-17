import type { StudyGuide } from "../guide-types";

export const toolUseLoopGuide: StudyGuide = {
  topicTitle: "Tool use loop implementation",
  topicSlug: "tool-use-loop-implementation",
  sections: [
    // ================================================================
    // 1. What we're building and why
    // ================================================================
    {
      title: "What we're building and why",
      blocks: [
        {
          kind: "prose",
          markdown: `If you've worked through the **Messages API & structured output** guide you've already seen the tool-use loop at the API level: send tools, branch on \`stop_reason\`, attach a \`tool_result\`, send again. This guide goes deeper into the engineering around that loop — the part you actually iterate on once an agent is in production.

The mechanical shape of the loop is short:

\`\`\`
user question
   │
   ▼
Claude ── stop_reason="tool_use" ──▶ your code runs the tool
   ▲                                           │
   │                                           ▼
   └────────── tool_result message ◀────────  you
   │
   ▼
Claude ── stop_reason="end_turn" ──▶ final answer
\`\`\`

The engineering around it is long. **How do you describe a tool so Claude actually picks it?** **How granular should each tool be?** **How do you keep the loop from running away, blowing the context window, or silently looping on the same arguments?** **How do you log it, test it, debug it when a customer ticket arrives?**

This guide is the answer to those questions. We recap the loop mechanics quickly in §1-4, then spend the rest of the guide on tool design (§5-9), production loop engineering (§10-15), and real agent walkthroughs (§16-18).

> **Cross-reference.** The Messages API guide (§15-17) is the right place for the bare loop skeleton, parallel dispatch with \`asyncio.gather\`, and the \`tool_result\` block schema. We don't repeat those here — we go deeper on the design and engineering decisions layered on top.

> **Heads up — the runnable cells in this guide use a built-in mock of the \`anthropic\` SDK.** The mock supports tool definitions, the loop, parallel calls, \`tool_choice\`, and basic error handling. It does NOT simulate Pydantic ValidationError, streaming, or real model reasoning, so advanced sections are display-only.`,
        },
        {
          kind: "key_insight",
          label: "The loop invariant",
          insight: `Keep calling \`messages.create()\` and processing tool calls **as long as \`stop_reason == "tool_use"\`**. The first response with \`stop_reason == "end_turn"\` is your final answer. Everything else in agent design — descriptions, schemas, dispatch tables, observability, dedup, eval — is layered on top of this single rule.`,
        },
      ],
    },

    // ================================================================
    // 2. Anatomy of a tool definition
    // ================================================================
    {
      title: "Anatomy of a tool definition",
      blocks: [
        {
          kind: "prose",
          markdown: `A tool is a Python dict with three keys: \`name\`, \`description\`, and \`input_schema\`. The schema is a JSON Schema object that tells Claude what arguments to pass.

\`\`\`python
{
    "name": "get_weather",
    "description": "Get the current weather for a city. Returns temp_f and condition.",
    "input_schema": {
        "type": "object",
        "properties": {
            "city": {"type": "string", "description": "City name, e.g. 'Boston'"},
        },
        "required": ["city"],
    },
}
\`\`\`

The \`description\` is the most important field. Claude reads it to decide *when* to call the tool. Vague descriptions cause the wrong tool to fire (or the right one not to fire). Treat the description like an internal API doc — say what the tool does, what it returns, and any quirks.

We'll go much deeper on description authoring in §5 and on schema design in §6. For now, internalize the three-field shape; everything else is structure on top.`,
        },
        {
          kind: "method_ref",
          title: "tool definition: required and useful fields",
          importLine: "# Anthropic Messages API tool spec",
          methods: [
            {
              signature: "name: str",
              description:
                "Tool identifier. Must be unique within the tools list, ≤64 chars, [a-zA-Z0-9_-]. Claude references this when emitting tool_use blocks.",
            },
            {
              signature: "description: str",
              description:
                "Prose telling Claude what the tool does, what it returns, and when to call it. The single most important field for whether Claude picks the right tool.",
            },
            {
              signature: "input_schema: dict (JSON Schema)",
              description:
                "JSON Schema object constraining the input. Top-level must be {\"type\": \"object\", \"properties\": {...}, \"required\": [...]}.",
            },
            {
              signature: 'properties[field]["type"]',
              description:
                "JSON Schema types Claude handles well: string, integer, number, boolean, array, object. Avoid \"null\" type — use optional + omission instead.",
            },
            {
              signature: 'properties[field]["enum"]',
              description:
                "List of allowed string values. Claude respects enums tightly; prefer over free-form strings whenever the value space is finite.",
            },
            {
              signature: 'properties[field]["pattern"]',
              description:
                "Regex constraint on string format (e.g. ISO date). Tightens schema where enum doesn't apply.",
            },
            {
              signature: 'properties[field]["description"]',
              description:
                "Per-field description. Use these — Claude reads them when picking values, especially for ambiguous fields (\"date format YYYY-MM-DD\").",
            },
          ],
        },
        {
          kind: "scenario_predict",
          label: "spotting a weak description",
          scenario: `tools = [
    {
        "name": "lookup",
        "description": "Look something up.",
        "input_schema": {
            "type": "object",
            "properties": {"q": {"type": "string"}},
            "required": ["q"],
        },
    },
    {
        "name": "search",
        "description": "Search.",
        "input_schema": {
            "type": "object",
            "properties": {"q": {"type": "string"}},
            "required": ["q"],
        },
    },
]`,
          language: "python",
          question: "Why will Claude struggle to choose between these tools?",
          answer:
            "Both descriptions are nearly identical and say nothing about what each tool actually does or returns.",
          explanation:
            "When two tools have overlapping surface area, the description is the only signal Claude has to disambiguate. Make each description specific: what data source it hits, what shape the result takes, when to prefer it over the alternative. §5 covers description authoring in depth.",
        },
        {
          kind: "key_insight",
          label: "Schemas are contracts, descriptions are prompts",
          insight: `\`input_schema\` constrains the *shape* of the call (Claude can't pass a string when the schema says integer). The \`description\` controls the *decision* of whether to call at all. You need both to be tight.`,
        },
      ],
    },

    // ================================================================
    // 3. The loop invariant in code
    // ================================================================
    {
      title: "The loop invariant in code",
      blocks: [
        {
          kind: "prose",
          markdown: `Let's see one round trip. We send a question with a tool defined; we expect Claude to return a \`tool_use\` block instead of a final answer.`,
        },
        {
          kind: "code_predict",
          runnable: true,
          label: "first response in the loop",
          code: `import anthropic

client = anthropic.Anthropic()

tools = [{
    "name": "get_weather",
    "description": "Get current weather",
    "input_schema": {
        "type": "object",
        "properties": {"city": {"type": "string"}},
        "required": ["city"],
    },
}]

response = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=1024,
    tools=tools,
    messages=[{"role": "user", "content": "What is the weather in Boston?"}],
)

print(response.stop_reason)
print(response.content[0].type)
print(response.content[0].name)
print(response.content[0].input)`,
          output: `tool_use
tool_use
get_weather
{'city': 'Boston'}`,
          explanation: `The response has \`stop_reason="tool_use"\` — Claude is asking you to run \`get_weather\` with \`{"city": "Boston"}\`. The content is a \`ToolUseBlock\` (not a \`TextBlock\`), so \`content[0].text\` would crash. Always branch on \`stop_reason\` before reaching for \`.text\`.`,
        },
        {
          kind: "warm_up",
          title: "branching on stop_reason",
          prompt:
            "After a `messages.create()` call, what's the safe field to check before assuming `content[0].text` exists?",
          answer: 'response.stop_reason — must be "end_turn" before reading text.',
          explanation:
            "When stop_reason is 'tool_use', content[0] is a ToolUseBlock with .name/.input/.id, not a TextBlock. Reading .text on it raises AttributeError.",
        },
      ],
    },

    // ================================================================
    // 4. Building tool_result messages (recap)
    // ================================================================
    {
      title: "Building tool_result messages (recap)",
      blocks: [
        {
          kind: "prose",
          markdown: `Once you've executed the tool, you send the result back. Three rules:

1. The tool result goes in a **user** message (not assistant, not a new "tool" role).
2. The content of that user message is a **list** containing one \`tool_result\` block per tool call.
3. The \`tool_use_id\` field on each \`tool_result\` must match the \`.id\` of the corresponding \`ToolUseBlock\`.

Before sending the tool_result, you must append the **previous assistant turn** (with its tool_use blocks) to the messages list. Orphan tool_results are rejected.`,
        },
        {
          kind: "code_predict",
          runnable: true,
          label: "one full round trip",
          code: `import anthropic, json

client = anthropic.Anthropic()

tools = [{
    "name": "get_weather",
    "description": "Get current weather",
    "input_schema": {
        "type": "object",
        "properties": {"city": {"type": "string"}},
        "required": ["city"],
    },
}]

messages = [{"role": "user", "content": "Weather in Boston?"}]

# Round 1: Claude asks for the tool
r1 = client.messages.create(
    model="claude-sonnet-4-5", max_tokens=1024,
    tools=tools, messages=messages,
)
tool_block = r1.content[0]

# Append assistant turn (full content, including the tool_use block)
messages.append({"role": "assistant", "content": r1.content})

# Append the tool result as a USER message with a list of tool_result blocks
messages.append({"role": "user", "content": [{
    "type": "tool_result",
    "tool_use_id": tool_block.id,
    "content": json.dumps({"city": "Boston", "temp_f": 54}),
}]})

# Round 2: Claude turns the tool data into a final answer
r2 = client.messages.create(
    model="claude-sonnet-4-5", max_tokens=1024,
    tools=tools, messages=messages,
)
print(r2.stop_reason)
print(r2.content[0].text)`,
          output: `end_turn
Final answer based on tool results: {"city": "Boston", "temp_f": 54}`,
          explanation: `The role of the tool result is \`"user"\` even though *we* produced it. The Messages API has only "user" and "assistant" roles; tool output lives inside a user-role message. The \`tool_use_id\` links the result back to the specific call (critical when there are parallel calls).`,
        },
        {
          kind: "flashcard",
          context: "tool_result wiring",
          front:
            "Before sending a tool_result, what other message must be appended to the messages list?",
          back:
            "The full assistant turn that contained the tool_use block. The history must be complete — the API rejects orphan tool_results.",
        },
        {
          kind: "key_insight",
          label: "Cross-reference: full tool_result deep dive",
          insight: `For the full schema of \`tool_result\` (including \`is_error\`, string vs structured \`content\`, multi-block content with images), see Messages API guide §16. The recap here is enough to follow the rest of this guide; we focus from §5 onward on the *engineering* layered on top of the wire format.`,
        },
      ],
    },

    // ================================================================
    // 5. Writing great tool descriptions
    // ================================================================
    {
      title: "Writing great tool descriptions",
      blocks: [
        {
          kind: "prose",
          markdown: `The \`description\` field is not documentation. It's a **prompt**. Claude reads it on every turn to decide whether to fire this tool, and it has no other source of truth about what your tool does. A great description gets the right tool called; a bad one causes Claude to skip your tool entirely or pick a sibling tool that's slightly more confident-sounding.

Three common anti-patterns:

- **Too vague.** "Look something up." → Claude doesn't know what data source, what kind of query, or when to prefer this over guessing from its own knowledge.
- **Too internal.** "Hits the \`gimli_v3\` service for SKU lookups." → Claude doesn't know what gimli is. Use external-facing language.
- **Overlapping with siblings.** Two tools whose descriptions could each plausibly answer the same query. Claude will pick one, often the wrong one, with no signal to disambiguate.

A great description has roughly four parts:

1. **What it does** — a one-line action statement, leading with the verb.
2. **What it returns** — the shape and what's inside (list of records? JSON blob? a single value?).
3. **When to prefer it** over alternatives — "use this for X, not Y."
4. **Optional: in/out-of-scope examples** — concrete queries it should/shouldn't handle.

The cost of writing a 10-line description vs a 2-line one is rounding error in input tokens. The cost of Claude picking the wrong tool on a customer query is real.`,
        },
        {
          kind: "code_comparison",
          label: "weak vs strong tool description",
          left: {
            title: "Weak (3 lines, vague)",
            code: `{
    "name": "search",
    "description": "Search for stuff.",
    "input_schema": {
        "type": "object",
        "properties": {"q": {"type": "string"}},
        "required": ["q"],
    },
}`,
            annotation:
              "No verb. No data source. No return shape. Claude has no basis to pick this over any other 'search' tool.",
          },
          right: {
            title: "Strong (description carries its weight)",
            code: `{
    "name": "search_internal_docs",
    "description": (
        "Full-text search across our internal product documentation "
        "(handbooks, RFCs, design docs). Returns a list of "
        "{doc_id, title, snippet} objects, max 10 hits. "
        "Use this for questions about internal processes, "
        "architecture, or company-specific terminology. "
        "Do NOT use for public web content — use web_search instead. "
        "Example in-scope: 'how do we provision new tenants'. "
        "Example out-of-scope: 'who is the CEO of Anthropic'."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "q": {"type": "string", "description": "Natural-language query"},
        },
        "required": ["q"],
    },
}`,
            annotation:
              "Verb, scope, return shape, when-to-prefer, examples. Claude can route correctly without guessing.",
          },
          takeaway:
            "The description is your tool's pitch to Claude. Lead with the verb, name the return shape, draw the line against siblings, give an example or two.",
        },
        {
          kind: "scenario_predict",
          label: "overlapping descriptions",
          scenario: `tools = [
    {
        "name": "web_search",
        "description": "Search the web for information.",
        "input_schema": {"type": "object",
            "properties": {"q": {"type": "string"}},
            "required": ["q"]},
    },
    {
        "name": "search_internal_docs",
        "description": "Search documents.",
        "input_schema": {"type": "object",
            "properties": {"q": {"type": "string"}},
            "required": ["q"]},
    },
]
# User asks: "What does our handbook say about parental leave?"`,
          language: "python",
          question: "Predict the failure mode and the fix.",
          answer:
            "Claude will frequently pick web_search instead of search_internal_docs because 'documents' is too vague to claim ownership of the 'handbook' query — and 'web' sounds authoritative. Fix: tighten search_internal_docs to say 'company handbooks, RFCs, internal docs — use this for any company-specific question' and tighten web_search to say 'public web content only; never for internal/company questions'.",
          explanation:
            "When two tools have overlapping surface area, Claude doesn't run an arbiter — it just picks. Tight, contrastive descriptions are the only way to steer the routing decision. Anytime you have N tools that *could* answer the same query, write each description as if it has to defend itself against the others.",
        },
        {
          kind: "key_insight",
          label: "Description = decision, schema = shape",
          insight: `The description is the only signal Claude has to decide **whether** to call. The schema controls **how** to call. Both must be tight — a tight schema can't save a weak description (Claude just won't call the tool), and a great description can't save a sloppy schema (Claude calls it with garbage inputs).`,
        },
        {
          kind: "flashcard",
          context: "description authoring",
          front:
            "First thing every tool description should start with?",
          back:
            "The verb. 'Search…', 'Look up…', 'Create…', 'Fetch…'. Verbs give Claude an instant grasp of what the tool *does*, not what it *is*.",
        },
        {
          kind: "flashcard",
          context: "description authoring",
          front:
            "Why explicitly name the return shape in the description?",
          back:
            "Because Claude uses the return shape to plan downstream steps. Knowing the tool returns 'a list of {doc_id, title}' lets Claude plan to call read_doc next; knowing it returns 'a string' tells Claude it's the final answer.",
        },
        {
          kind: "flashcard",
          context: "description authoring",
          front:
            "Tool A and tool B have similar names and overlapping scope. What single technique disambiguates them?",
          back:
            "Add a 'when to prefer this / do NOT use this for' line to each description, naming the sibling. Explicit contrast steers Claude better than longer prose.",
        },
        {
          kind: "flashcard",
          context: "description authoring",
          front:
            "Should you mention internal codenames or service names (e.g. 'gimli_v3') in tool descriptions?",
          back:
            "No. Claude has never heard of your codenames. Use external-facing nouns ('the SKU service', 'the customer database') so Claude can reason about the tool's purpose, not memorize internal trivia.",
        },
      ],
    },

    // ================================================================
    // 6. Input schema design patterns
    // ================================================================
    {
      title: "Input schema design patterns",
      blocks: [
        {
          kind: "prose",
          markdown: `The \`input_schema\` is a JSON Schema. Most of JSON Schema works, but some features Claude respects more reliably than others.

**Use freely:** \`type\` (string/integer/number/boolean/array/object), \`properties\`, \`required\`, \`enum\`, \`pattern\`, \`minimum\`/\`maximum\`, \`minLength\`/\`maxLength\`, per-field \`description\`, \`items\` (for arrays).

**Use sparingly:** \`oneOf\`/\`anyOf\` (Claude sometimes picks the wrong branch), deeply nested object trees (depth >3 starts to cost reliability), \`additionalProperties: false\` with strict mode (good for safety but may force Claude to leave fields blank instead of guessing usefully).

**Avoid:** \`null\` type (use optional fields by omitting from \`required\`), recursive schemas, schemas that depend on side-channel state.

Every constraint you add to the schema is one less chance Claude has to hand you bad data. The discipline is to be **specific, not permissive** — schemas exist to lock in valid shapes, not to express maximum flexibility.`,
        },
        {
          kind: "method_ref",
          title: "JSON Schema cheat sheet for tool authors",
          importLine: "# JSON Schema features Claude handles well",
          methods: [
            {
              signature: '{"type": "string"}',
              description:
                "Free-form string. Pair with pattern or enum whenever the value space is constrained.",
            },
            {
              signature: '{"type": "string", "enum": ["a", "b", "c"]}',
              description:
                "String must be one of the listed values. Best tool for finite categorical fields.",
            },
            {
              signature: '{"type": "string", "pattern": "^\\\\d{4}-\\\\d{2}-\\\\d{2}$"}',
              description:
                "Regex constraint. Use for ISO dates, UUIDs, ticker symbols, anything format-bound.",
            },
            {
              signature: '{"type": "integer", "minimum": 0, "maximum": 100}',
              description:
                "Bounded integer. Claude respects bounds; use for confidence scores, page numbers, counts.",
            },
            {
              signature: '{"type": "array", "items": {"type": "string"}}',
              description:
                "Array with item schema. Keep item type primitive when possible; arrays of complex objects increase failure rate.",
            },
            {
              signature: '{"type": "object", "properties": {...}, "required": [...]}',
              description:
                "Nested object. Fine at depth ≤3; consider flattening if deeper.",
            },
            {
              signature: '"description": "..."',
              description:
                "Per-field description. Underused. Use to convey format, examples, or business meaning Claude can't infer from the name.",
            },
          ],
        },
        {
          kind: "code_comparison",
          label: "loose vs tight schema for a query tool",
          left: {
            title: "Loose — invites garbage inputs",
            code: `{
    "name": "query_sales",
    "description": "Query sales data.",
    "input_schema": {
        "type": "object",
        "properties": {
            "q": {"type": "string"},
            "limit": {"type": "integer"},
        },
        "required": ["q"],
    },
}

# Claude can send anything:
# {"q": "all sales", "limit": -5}
# {"q": "🤷", "limit": 1000000}`,
            annotation:
              "No constraints. Claude can send nonsensical queries, negative limits, or no limit at all. Your handler now has to defend against everything.",
          },
          right: {
            title: "Tight — Claude can only send valid shapes",
            code: `{
    "name": "query_sales",
    "description": (
        "Query sales by region and period. Returns a list "
        "of {region, period, revenue_usd}, max 50 rows."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "region": {"type": "string",
                "enum": ["NA", "EMEA", "APAC", "LATAM"]},
            "period": {"type": "string",
                "pattern": "^\\\\d{4}-Q[1-4]$",
                "description": "ISO quarter, e.g. '2025-Q3'"},
            "limit": {"type": "integer",
                "minimum": 1, "maximum": 50, "default": 10},
        },
        "required": ["region", "period"],
    },
}`,
            annotation:
              "Region is enum-bound. Period must match the quarter regex. Limit is range-bounded with a default. Claude's only options are valid options.",
          },
          takeaway:
            "Schema constraints are free risk reduction. Replace open strings with enums; replace 'integer' with 'integer, 1-50'; replace open dates with ISO patterns.",
        },
        {
          kind: "code_predict",
          label: "Pydantic model → tool schema (cross-ref messages-api §12)",
          code: `from pydantic import BaseModel, Field
from typing import Literal

class QuerySales(BaseModel):
    region: Literal["NA", "EMEA", "APAC", "LATAM"]
    period: str = Field(pattern=r"^\\d{4}-Q[1-4]$")
    limit: int = Field(default=10, ge=1, le=50)

def pydantic_tool(Model, description: str) -> dict:
    schema = Model.model_json_schema()
    schema.pop("title", None)
    return {
        "name": Model.__name__.lower(),
        "description": description,
        "input_schema": schema,
    }

tool = pydantic_tool(QuerySales, "Query sales by region and period.")
print(tool["input_schema"]["required"])
print(tool["input_schema"]["properties"]["region"]["enum"])`,
          output: `['region', 'period']
['NA', 'EMEA', 'APAC', 'LATAM']`,
          explanation: `Pydantic v2's \`model_json_schema()\` emits a tool-compatible JSON Schema for free. Define the Pydantic model once, get a tool schema *and* runtime validation (see §11) without writing the schema dict by hand. Cross-reference: Messages API guide §12 introduces the \`pydantic_tool\` helper; Pydantic v2 fundamentals guide covers \`model_validate\` mechanics.`,
        },
        {
          kind: "scenario_predict",
          label: "unconstrained date field",
          scenario: `{
    "name": "find_appointments",
    "description": "Find appointments on a given date.",
    "input_schema": {
        "type": "object",
        "properties": {
            "date": {"type": "string"},
        },
        "required": ["date"],
    },
}
# User: "What's on my calendar yesterday and the day before?"`,
          language: "python",
          question:
            "Predict the symptom you'll see in production and the fix.",
          answer:
            "Claude will send 'date' values in inconsistent formats: 'yesterday', 'March 5', '3/5/24', '2026-03-05'. Your handler crashes on the non-ISO ones. Fix: add pattern='^\\d{4}-\\d{2}-\\d{2}$' OR a description like 'ISO date YYYY-MM-DD' OR use a Pydantic Field(..., examples=['2026-03-15']) — any one of these tells Claude the expected format.",
          explanation:
            "A bare 'string' type field with no description gives Claude no way to know your format expectation. The model defaults to whatever feels natural for the phrase it's translating, which is whatever the user said. Constrain at the schema level (pattern), the description level ('ISO date'), or both. Validation in your handler is a backstop, not a substitute for telling Claude the format up front.",
        },
        {
          kind: "key_insight",
          label: "Every constraint is one less surprise",
          insight: `Every \`enum\`, \`pattern\`, \`minimum\`, \`description\` you add to a field is one fewer way Claude can hand you bad data. The cost is a few lines of schema; the benefit is a tool that doesn't need defensive parsing at the handler layer. Be specific, not permissive.`,
        },
      ],
    },

    // ================================================================
    // 7. Tool granularity: one big tool vs many small ones
    // ================================================================
    {
      title: "Tool granularity: one big tool vs many small ones",
      blocks: [
        {
          kind: "prose",
          markdown: `Tool granularity is one of the highest-leverage design decisions in an agent. The tradeoff:

- **Too many tools** → decision paralysis. Claude has to pick from 20+ options on every turn; selection becomes slower and the picks get worse. Past ~12 tools, the per-call accuracy of routing drops noticeably.
- **Too few tools** → bloated schemas. One mega-tool with an \`operation\` enum that flips required fields ("if operation=create then name+email required; if operation=update then id+changes required") loses all of JSON Schema's type-safety benefit. Claude can send \`{"operation": "create", "id": "x"}\` and the schema can't catch it.

The middle ground:

- **One verb per tool.** \`create_user\`, \`list_users\`, \`update_user\` rather than \`user_op(operation=...)\`.
- **Group tools that share auth/state.** All "DB write" tools can live in one module; their tool definitions remain separate so Claude routes cleanly.
- **Cap at ~12 tools per agent** as a rule of thumb. If you need more, split into specialist agents (one agent per domain) and have a router agent dispatch.

A useful test: if two tools share most of their schema, they're probably one tool with a parameter. If one tool has an \`operation\` enum that completely changes the required fields, it's probably several tools.`,
        },
        {
          kind: "code_comparison",
          label: "mega-tool vs split tools",
          left: {
            title: "Mega-tool — verbose, weak types",
            code: `{
    "name": "user_op",
    "description": (
        "Perform an operation on the users table. "
        "operation must be one of list, create, update, delete. "
        "For list, filters is optional. "
        "For create, data is required. "
        "For update, id and changes are required. "
        "For delete, id is required."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "operation": {"enum": ["list", "create", "update", "delete"]},
            "filters": {"type": "object"},
            "data": {"type": "object"},
            "id": {"type": "string"},
            "changes": {"type": "object"},
        },
        "required": ["operation"],
    },
}
# Claude can send {"operation": "create"} with no data and the schema won't catch it.`,
            annotation:
              "Conditional requirements live in the prose description, not the schema. Type safety is gone. Description is hard to read.",
          },
          right: {
            title: "Split tools — narrow, type-safe",
            code: `[
    {
        "name": "list_users",
        "description": "List users matching optional filters.",
        "input_schema": {"type": "object",
            "properties": {"filters": {"type": "object"}}},
    },
    {
        "name": "create_user",
        "description": "Create a new user with the given attributes.",
        "input_schema": {"type": "object",
            "properties": {
                "name": {"type": "string"},
                "email": {"type": "string"}},
            "required": ["name", "email"]},
    },
    {
        "name": "update_user",
        "description": "Update an existing user's attributes by id.",
        "input_schema": {"type": "object",
            "properties": {
                "id": {"type": "string"},
                "changes": {"type": "object"}},
            "required": ["id", "changes"]},
    },
]`,
            annotation:
              "Each tool's required fields are enforced by the schema. Descriptions are short and unambiguous. Claude routes by verb.",
          },
          takeaway:
            "If your schema needs prose to explain which fields are required when, it's actually multiple tools fused together. Split them.",
        },
        {
          kind: "multiple_choice",
          title: "picking the right granularity",
          prompt:
            "For each agent below, choose the recommended tool granularity:",
          choices: [
            {
              text: "Customer service triage agent that needs to look up customers, search a knowledge base, escalate to humans, and reply. → 4 separate tools (lookup_customer, search_kb, escalate, respond).",
              correct: true,
              rationale:
                "Four distinct verbs, each with a different schema and return shape. Splitting keeps each tool's schema tight.",
            },
            {
              text: "Calculator agent. → One tool calc(operation: enum, a: float, b: float).",
              correct: true,
              rationale:
                "All operations share the same shape (two numbers). Splitting into add/sub/mul/div would be tool pollution for no schema benefit.",
            },
            {
              text: "DB-backed CRM with 30 tables, all needing CRUD. → One mega-tool db_op(table, operation, ...).",
              correct: false,
              rationale:
                "Too many tools is bad, but a mega-tool is worse — required fields would be impossible to express. The right answer is one agent per domain (customers, deals, contacts) with ~3-5 tools each, with a router agent on top.",
            },
            {
              text: "Calendar agent. → Three tools (read_events, create_event, search_events) instead of one calendar_op(operation, ...).",
              correct: true,
              rationale:
                "Each operation has a different schema (read needs a date range, create needs full event fields, search needs a query). Splitting is correct.",
            },
          ],
          explanation:
            "Granularity follows from schema shape: when operations share a shape (calc), fuse. When operations have different required fields (CRM, calendar), split. When the surface is huge (30-table CRM), split *and* layer agents.",
        },
        {
          kind: "flashcard",
          context: "granularity heuristics",
          front:
            "Rule of thumb: how many tools before an agent starts routing badly?",
          back:
            "Past ~12 tools per agent, per-turn selection accuracy drops noticeably. Beyond that, consider splitting into specialist agents (one per domain) with a router agent on top.",
        },
        {
          kind: "flashcard",
          context: "granularity heuristics",
          front:
            "When *should* you fuse two operations into one tool with an enum parameter?",
          back:
            "When the operations share the *same* input schema (e.g., calc(op, a, b) where every op needs two numbers). If different operations need different required fields, split.",
        },
        {
          kind: "flashcard",
          context: "granularity heuristics",
          front:
            "Quick test: 'if two tools share most of their schema, they're probably ___; if one tool has an operation enum that flips required fields, it's probably ___.'",
          back:
            "one tool with a parameter; several tools fused. The schema shape decides.",
        },
        {
          kind: "key_insight",
          label: "Granularity follows the schema",
          insight: `If two tools share most of their schema, they're probably one tool with a parameter. If one tool has an \`operation\` enum that completely changes the required fields, it's probably several tools. Let the schema shape decide, not aesthetics.`,
        },
      ],
    },

    // ================================================================
    // 8. Tool dependencies and routing
    // ================================================================
    {
      title: "Tool dependencies and routing",
      blocks: [
        {
          kind: "prose",
          markdown: `Agents naturally chain tools: \`search → read → answer\`, \`auth → lookup → update\`. Some chains are flexible (Claude can pick the order); others are strict (you *must* call \`auth\` before any data tool).

You have three places to enforce ordering:

1. **Tool descriptions.** "Always call \`search_docs\` first to get doc_ids before calling \`read_doc\`." This is the lightest-touch fix and usually enough.
2. **System prompt.** A routing policy paragraph: "Use \`quick_lookup\` for single-record reads, \`bulk_search\` for multi-record queries. Never use both in the same turn."
3. **Code-side enforcement.** If Claude calls \`read_doc\` before \`search_docs\`, your dispatch table can return an error tool_result: \`{"error": "doc_id unknown — call search_docs first"}\`. Claude sees the error and reroutes.

The lightest-weight enforcement that works is best. Most ordering problems are solved by adding one line to the description ("call X before Y") or two lines to the system prompt.`,
        },
        {
          kind: "scenario_predict",
          label: "missing dependency hint",
          scenario: `tools = [
    {"name": "search_docs",
     "description": "Search the docs corpus.",
     "input_schema": {"type": "object",
        "properties": {"q": {"type": "string"}},
        "required": ["q"]}},
    {"name": "read_doc",
     "description": "Read the full text of a document by id.",
     "input_schema": {"type": "object",
        "properties": {"doc_id": {"type": "string"}},
        "required": ["doc_id"]}},
]
# User: "Find the section in our handbook about expense policy."
# Claude immediately calls read_doc(doc_id="expense_policy") instead of searching first.`,
          language: "python",
          question:
            "Predict the cause and the smallest fix.",
          answer:
            "Cause: neither description establishes the dependency. Claude assumes 'expense_policy' is a reasonable doc_id because nothing tells it otherwise. Fix: change read_doc's description to 'Read the full text of a document by id. You MUST call search_docs first to obtain a valid doc_id.' One line, problem solved.",
          explanation:
            "Tool dependency is a prompt-engineering problem, not an API feature. The model has no concept of 'tool A must come before tool B' unless you say so. Encode order in descriptions and/or the system prompt; both are free.",
        },
        {
          kind: "code_predict",
          label: "system prompt as routing policy",
          code: `SYSTEM_PROMPT = """\\
You have access to two lookup tools:

- quick_lookup(id): single-record lookup by exact id. Fast, cheap.
- bulk_search(query): multi-record search by query string. Slower.

Routing policy:
- If the user gives you a specific id (UUID, ticket #, SKU), use quick_lookup.
- If the user describes records ("all tickets from last week"), use bulk_search.
- Never call both in the same turn — pick one, see the result, then decide.

If a quick_lookup returns not_found, do NOT fall back to bulk_search in the same chain — ask the user to clarify the id instead.
"""

response = client.messages.create(
    model="claude-sonnet-4-5", max_tokens=1024,
    system=SYSTEM_PROMPT,
    tools=tools,
    messages=[{"role": "user", "content": "Find ticket T-12345"}],
)
print(response.content[0].name)  # quick_lookup`,
          output: `quick_lookup`,
          explanation: `System prompts are where routing policy lives. The tool descriptions handle "what does this tool do"; the system prompt handles "when to pick which, in what order, with what fallbacks." Production agents usually have 5-20 lines of routing policy in the system prompt.`,
        },
        {
          kind: "key_insight",
          label: "Dependency = prompt engineering",
          insight: `Tool dependency and ordering are not API features. They are prompt-engineering problems. Encode order in tool descriptions ("call X before Y") or in the system prompt as a routing policy. Code-side enforcement (returning error tool_results) is a backstop for the cases the prompts miss.`,
        },
      ],
    },

    // ================================================================
    // 9. Dispatch table pattern
    // ================================================================
    {
      title: "Dispatch table pattern",
      blocks: [
        {
          kind: "prose",
          markdown: `Every production agent loop should have an explicit **dispatch table**: a \`dict[str, Callable]\` mapping tool names to handler functions. The loop body becomes a single lookup:

\`\`\`python
handler = DISPATCH[block.name]
result = handler(**block.input)
\`\`\`

The benefits:

- **One canonical place** where the tool→handler mapping lives. Adding a tool = one new row.
- **No if/elif sprawl** inside the loop. The loop body stays under 20 lines forever.
- **Fail loudly on unknown tool names.** If Claude returns a tool name not in the dict, you get a \`KeyError\` immediately rather than silently doing nothing.
- **Easy to test.** Mock the dispatch table by passing in a stub dict.

The cost is one line of code (\`DISPATCH = {...}\`). The benefit compounds for every tool you add.`,
        },
        {
          kind: "code_predict",
          runnable: true,
          label: "dispatch table in the loop body",
          code: `import anthropic, json

client = anthropic.Anthropic()

def get_weather(city):
    return json.dumps({"city": city, "temp_f": 72})

def lookup_stock_price(ticker):
    return json.dumps({"ticker": ticker, "price_usd": 195.34})

DISPATCH = {
    "get_weather": get_weather,
    "lookup_stock_price": lookup_stock_price,
}

tools = [
    {"name": "get_weather", "description": "Get weather",
     "input_schema": {"type": "object",
        "properties": {"city": {"type": "string"}},
        "required": ["city"]}},
    {"name": "lookup_stock_price", "description": "Get stock price",
     "input_schema": {"type": "object",
        "properties": {"ticker": {"type": "string"}},
        "required": ["ticker"]}},
]

messages = [{"role": "user",
             "content": "Weather in Boston and AAPL price?"}]
r = client.messages.create(
    model="claude-sonnet-4-5", max_tokens=1024,
    tools=tools, messages=messages,
)

# Dispatch is one line:
for block in r.content:
    if block.type == "tool_use":
        handler = DISPATCH[block.name]
        result = handler(**block.input)
        print(block.name, "→", result)`,
          output: `get_weather → {"city": "Boston", "temp_f": 72}
lookup_stock_price → {"ticker": "AAPL", "price_usd": 195.34}`,
          explanation: `One \`DISPATCH[name]\` lookup replaces the \`if name == "get_weather": ... elif name == "lookup_stock_price": ...\` chain. Adding a third tool is a one-line dict insertion plus the tool definition — the loop doesn't change.`,
        },
        {
          kind: "code_comparison",
          label: "if/elif chain vs dispatch table",
          left: {
            title: "if/elif chain (grows linearly)",
            code: `for block in r.content:
    if block.type != "tool_use":
        continue
    if block.name == "get_weather":
        result = get_weather(**block.input)
    elif block.name == "lookup_stock_price":
        result = lookup_stock_price(**block.input)
    elif block.name == "search_docs":
        result = search_docs(**block.input)
    elif block.name == "read_doc":
        result = read_doc(**block.input)
    # ... add a new tool, forget to add an elif,
    # silently fall through to nothing.
    else:
        result = json.dumps({"error": "unknown tool"})`,
            annotation:
              "Every new tool needs a new elif. Forgetting one fails silently. No type guarantees.",
          },
          right: {
            title: "dispatch table (declarative)",
            code: `DISPATCH = {
    "get_weather": get_weather,
    "lookup_stock_price": lookup_stock_price,
    "search_docs": search_docs,
    "read_doc": read_doc,
}

for block in r.content:
    if block.type != "tool_use":
        continue
    handler = DISPATCH[block.name]  # KeyError if missing
    result = handler(**block.input)`,
            annotation:
              "Adding a tool = one dict row. Missing handler raises KeyError immediately — loud failure, never silent.",
          },
          takeaway:
            "Dispatch tables are declarative. The if/elif chain is imperative and grows with N. Same line count for 2 tools; the table wins decisively past 4.",
        },
        {
          kind: "flashcard",
          context: "dispatch table",
          front:
            "Claude returns a tool_use block with a name not in your DISPATCH dict. What's the right error policy?",
          back:
            "Two reasonable choices: (a) Let the KeyError bubble up — this is a code bug, fail loud. (b) Catch and return tool_result with is_error=True saying 'unknown tool name'. Choice (b) keeps the loop alive; (a) catches programmer error faster. Use (b) in production with metrics on the error path.",
        },
        {
          kind: "flashcard",
          context: "dispatch table",
          front:
            "Why does the dispatch table pattern make adding a new tool a 'one-row' change?",
          back:
            "The loop body has no per-tool branching. Adding a tool = add a tool definition to the tools list + add one row to DISPATCH. The loop itself never changes shape.",
        },
      ],
    },

    // ================================================================
    // 10. Production loop skeleton
    // ================================================================
    {
      title: "Production loop skeleton",
      blocks: [
        {
          kind: "prose",
          markdown: `The 15-line loop you see in tutorials is fine for a demo and a liability in production. A production loop has a checklist of guards, each of which exists because someone, somewhere, got paged at 2 AM:

1. **Max-iterations cap.** Hard upper bound — \`for _ in range(max_iters)\` instead of \`while True\`. Even with perfect prompts, models can occasionally loop.
2. **Per-tool timeout.** One slow tool shouldn't pin the whole agent. Wrap handlers in \`asyncio.wait_for\` or \`concurrent.futures\` with a timeout.
3. **Dispatch table.** Explicit \`{name: handler}\` map — see §9.
4. **Pydantic validation on tool input** (§11). Claude *almost always* returns valid JSON; the validation layer turns "almost" into "guaranteed-typed-or-error."
5. **\`is_error=True\` on failures.** Surface tool failures back to Claude as structured errors, not exceptions.
6. **Structured logging per iteration.** \`(turn, stop_reason, tools_called, in_tokens, out_tokens)\` minimum — see §13.
7. **Cost budget check.** Track cumulative tokens; abort if a single run exceeds the budget.
8. **History pruning hook.** Watch input-token growth turn-over-turn; truncate or summarize when it grows too fast — see §12.

Every guard you skip is a future incident. Write the hardened skeleton once and copy it forward to every new agent.`,
        },
        {
          kind: "code_predict",
          label: "production-hardened loop (all guards in ~50 lines)",
          code: `import anthropic, json, time, logging
from pydantic import BaseModel, ValidationError

log = logging.getLogger("agent")

def run_agent(
    prompt: str,
    tools: list[dict],
    dispatch: dict,
    schemas: dict[str, type[BaseModel]],
    *,
    max_iters: int = 8,
    max_input_tokens: int = 50_000,
    tool_timeout_s: float = 10.0,
) -> str:
    client = anthropic.Anthropic()
    messages = [{"role": "user", "content": prompt}]
    total_in = total_out = 0

    for turn in range(max_iters):
        r = client.messages.create(
            model="claude-sonnet-4-5", max_tokens=1024,
            tools=tools, messages=messages,
        )
        total_in += r.usage.input_tokens
        total_out += r.usage.output_tokens
        log.info({"turn": turn, "stop": r.stop_reason,
                  "in": r.usage.input_tokens, "out": r.usage.output_tokens})

        if total_in > max_input_tokens:
            raise RuntimeError(f"input token budget exceeded at turn {turn}")

        if r.stop_reason == "end_turn":
            return r.content[0].text

        messages.append({"role": "assistant", "content": r.content})
        results = []
        for block in r.content:
            if block.type != "tool_use":
                continue
            try:
                Schema = schemas.get(block.name)
                validated = (Schema.model_validate(block.input).model_dump()
                             if Schema else block.input)
                t0 = time.monotonic()
                result = dispatch[block.name](**validated)
                log.info({"tool": block.name, "ms": int((time.monotonic()-t0)*1000)})
                results.append({"type": "tool_result",
                                "tool_use_id": block.id,
                                "content": json.dumps(result)})
            except (ValidationError, KeyError, Exception) as e:
                log.warning({"tool": block.name, "error": str(e)})
                results.append({"type": "tool_result",
                                "tool_use_id": block.id,
                                "content": json.dumps({"error": str(e)}),
                                "is_error": True})
        messages.append({"role": "user", "content": results})

    raise RuntimeError(f"agent did not converge in {max_iters} turns")`,
          output: `(no output — function definition)`,
          explanation: `Every defensive guard is annotated:
- \`for turn in range(max_iters)\` — bounded loop.
- \`total_in > max_input_tokens\` — budget check.
- \`Schema.model_validate(...)\` — Pydantic enforces tool input shape.
- \`try / except\` — handler exceptions become \`is_error=True\` tool_results, never crash the loop.
- \`log.info({...})\` — structured per-turn and per-tool-call logging.
- Final \`raise\` — explicit non-convergence instead of returning a possibly-wrong answer.`,
        },
        {
          kind: "code_comparison",
          label: "minimal loop vs production-hardened loop",
          left: {
            title: "Minimal loop (fine for demos)",
            code: `def run(prompt):
    msgs = [{"role": "user", "content": prompt}]
    while True:
        r = client.messages.create(
            model="claude-sonnet-4-5",
            tools=tools, messages=msgs,
        )
        if r.stop_reason == "end_turn":
            return r.content[0].text
        msgs.append({"role": "assistant",
                     "content": r.content})
        results = [{"type": "tool_result",
                    "tool_use_id": b.id,
                    "content": run_tool(b)}
                   for b in r.content
                   if b.type == "tool_use"]
        msgs.append({"role": "user", "content": results})`,
            annotation:
              "while True (no bound), no validation, no error handling, no logging, no budget. One bad turn = infinite loop and surprise invoice.",
          },
          right: {
            title: "Production-hardened (every guard)",
            code: `def run_agent(prompt, ..., max_iters=8,
              max_input_tokens=50_000,
              tool_timeout_s=10.0):
    for turn in range(max_iters):
        r = client.messages.create(...)
        total_in += r.usage.input_tokens
        log.info({"turn": turn,
                  "stop": r.stop_reason, ...})
        if total_in > max_input_tokens:
            raise RuntimeError("budget exceeded")
        if r.stop_reason == "end_turn":
            return r.content[0].text
        # ... validated dispatch with try/except,
        #     timeout, is_error=True on failure,
        #     structured logs per tool call.`,
            annotation:
              "Each guard exists because of a real incident class: runaway loop → max_iters; surprise bill → budget; broken handler → try/except + is_error; debug-after-the-fact → logs.",
          },
          takeaway:
            "The minimal loop teaches the pattern. The hardened loop survives production. Write the hardened version once into a shared module and import it for every new agent.",
        },
        {
          kind: "key_insight",
          label: "Guards aren't optional, they're incidents-deferred",
          insight: `Every guard the production skeleton has — max_iters, budget, validation, is_error, logging — exists because someone shipped without it and got paged. Write the hardened skeleton once. Copy it forward. The cost is ~40 lines; the value is every incident you never have.`,
        },
      ],
    },

    // ================================================================
    // 11. Pydantic validation at the tool boundary
    // ================================================================
    {
      title: "Pydantic validation at the tool boundary",
      blocks: [
        {
          kind: "prose",
          markdown: `Claude *almost always* returns JSON that matches your tool schema. "Almost" is not "always" — and the difference shows up at 3 AM as a \`KeyError\` deep inside your handler.

The fix is a one-line validation step between receiving \`tool_use.input\` and calling the handler:

\`\`\`python
validated = MyModel.model_validate(tool_use.input)
result = handler(validated)
\`\`\`

The handler now receives a typed Pydantic instance. Attribute access, autocomplete, and \`mypy\` all work. Field constraints (\`ge=0\`, \`pattern=...\`, \`Literal[...]\`) are enforced at the boundary, not deep inside the handler.

When \`ValidationError\` fires, you have three policies:

1. **Fail loud.** Raise the error, log it, return an error to the caller. Use for unrecoverable bugs (your schema is wrong).
2. **Retry with feedback.** Send a \`tool_result\` with \`is_error=True\` and the validation error as content. Claude reads the error, adjusts the inputs, calls the tool again. This is the right default for most agents.
3. **Accept and coerce.** Use Pydantic's \`@field_validator\` with \`mode="before"\` to clean up known-bad inputs (lowercase strings, strip whitespace, parse loose dates). Use sparingly — coercion hides bugs.

Cross-reference: the Pydantic v2 fundamentals guide covers \`BaseModel\`, \`Field\`, and \`model_validate\` in depth. The Messages API guide §14 covers the validation step inside the loop at a higher level; this section covers the *policy* of what to do when validation fails.`,
        },
        {
          kind: "code_predict",
          label: "dispatch_with_validation helper",
          code: `from pydantic import BaseModel, ValidationError
from typing import Callable
import json

def dispatch_with_validation(
    tool_name: str,
    raw_input: dict,
    schemas: dict[str, type[BaseModel]],
    handlers: dict[str, Callable],
) -> tuple[str, bool]:
    """Returns (result_content_json, is_error)."""
    Schema = schemas.get(tool_name)
    handler = handlers.get(tool_name)
    if handler is None:
        return json.dumps({"error": f"unknown tool: {tool_name}"}), True

    if Schema is not None:
        try:
            validated = Schema.model_validate(raw_input)
        except ValidationError as e:
            return json.dumps({"error": "validation_failed",
                               "detail": e.errors()}), True
        result = handler(**validated.model_dump())
    else:
        result = handler(**raw_input)

    return json.dumps(result), False

# Usage in the loop:
# content, is_err = dispatch_with_validation(block.name, block.input, ...)
# results.append({"type": "tool_result", "tool_use_id": block.id,
#                 "content": content, "is_error": is_err})`,
          output: `(no output — function definition)`,
          explanation: `One helper does three jobs: (1) checks the tool name is known, (2) validates input shape against the registered Pydantic model, (3) calls the handler with typed kwargs. The return shape \`(content, is_error)\` lets the loop dispatch logic stay one-liner clean.`,
        },
        {
          kind: "code_comparison",
          label: "no validation vs validation",
          left: {
            title: "No validation — defensive handler",
            code: `def query_sales(input: dict) -> dict:
    # Defensive unpacking everywhere
    region = input.get("region")
    if not region or region not in ALLOWED_REGIONS:
        return {"error": "bad region"}
    period = input.get("period")
    if not period or not PERIOD_RE.match(period):
        return {"error": "bad period"}
    limit = input.get("limit", 10)
    if not isinstance(limit, int) or limit < 1:
        limit = 10

    # ... finally the actual query ...
    return run_query(region, period, limit)`,
            annotation:
              "Half the handler is dict-unpacking and validation. No IDE help. Easy to forget a field. Cluttered.",
          },
          right: {
            title: "With Pydantic validation",
            code: `from pydantic import BaseModel, Field
from typing import Literal

class QuerySales(BaseModel):
    region: Literal["NA", "EMEA", "APAC", "LATAM"]
    period: str = Field(pattern=r"^\\d{4}-Q[1-4]$")
    limit: int = Field(default=10, ge=1, le=50)

def query_sales(req: QuerySales) -> dict:
    # All fields typed, all constraints enforced.
    return run_query(req.region, req.period, req.limit)`,
            annotation:
              "Handler is a one-liner. Schema is declarative. IDE autocompletes req.region. Constraints enforced at the boundary, once.",
          },
          takeaway:
            "Without validation, every handler reinvents argument parsing. With validation, the schema is the contract and the handler does the actual work.",
        },
        {
          kind: "scenario_predict",
          label: "Field(ge=0, le=1) + out-of-bounds value",
          scenario: `from pydantic import BaseModel, Field

class Sentiment(BaseModel):
    label: str
    confidence: float = Field(ge=0.0, le=1.0)

# Claude returns:
{"label": "positive", "confidence": 1.2}`,
          language: "python",
          question:
            "What happens at model_validate, and what's the right loop-level recovery?",
          answer:
            "ValidationError fires: 'confidence: Input should be less than or equal to 1.0'. Right recovery: return a tool_result with is_error=True and content={'error': 'confidence must be 0..1, got 1.2'}. Claude reads the error and retries with a clamped value. This is the retry-with-feedback policy.",
          explanation:
            "Pydantic catches the violation before your handler sees garbage. Sending the structured error back as a tool_result lets Claude self-correct — the next turn typically arrives with confidence=1.0 (or whatever the right value would have been). Raising the error instead would kill the loop and lose the recovery opportunity.",
        },
        {
          kind: "flashcard",
          context: "validation policy",
          front:
            "Three policies when ValidationError fires inside an agent loop. Name them.",
          back:
            "(1) Fail loud — raise and exit; (2) Retry with feedback — return is_error=True tool_result with the error detail, let Claude self-correct; (3) Accept and coerce — use @field_validator(mode='before') to clean common bad inputs. Default to (2).",
        },
        {
          kind: "flashcard",
          context: "validation policy",
          front:
            "When should you 'fail loud' on ValidationError instead of retrying?",
          back:
            "When the validation failure indicates a bug in your code (schema doesn't match tool definition; impossible constraint; etc.), not a model mistake. Fail loud surfaces real bugs faster; retry-with-feedback hides them.",
        },
        {
          kind: "flashcard",
          context: "validation policy",
          front:
            "How do you surface a ValidationError back to Claude inside the loop?",
          back:
            "Return a tool_result block with is_error=True and content=json.dumps({'error': str(e), 'detail': e.errors()}). Claude treats it as a tool failure and adjusts the next attempt.",
        },
        {
          kind: "key_insight",
          label: "Validation = contract enforcement",
          insight: `The validation layer is your contract enforcement. Skip it and every tool handler becomes a dict-juggling exercise with runtime surprises. With Pydantic, the schema is the contract, the handler does the work, and bad inputs fail at a predictable boundary you control.`,
        },
      ],
    },

    // ================================================================
    // 12. Conversation memory & context management
    // ================================================================
    {
      title: "Conversation memory & context management",
      blocks: [
        {
          kind: "prose",
          markdown: `Agents accumulate history fast. Each turn appends:

- The full assistant response (text + tool_use blocks)
- A user turn carrying one tool_result block per tool call

And **every prior turn ships on every subsequent request**. A 20-turn research agent can easily push 50k+ input tokens by turn 20. At Sonnet pricing that's ~\$0.15 per *single agent run* in input cost alone — and it grows quadratically (each turn is bigger AND there are more of them).

Three strategies for managing this:

1. **Window** — keep the last N turns (e.g., last 8). Drop everything older. Cheap, simple, fine for stateless task agents. Bad for "remember what we discussed an hour ago" agents.
2. **Summarize** — replace early turns with a short summary message generated by a cheap model (Haiku). Preserves continuity. Best for long-running conversational agents.
3. **Shrink at source** — make \`tool_result\` content small. Return \`{"doc_id": "abc", "summary": "..."}\` instead of 30 KB of HTML; store the full text externally, fetch by id only when needed. This is the highest-leverage strategy for tool-heavy agents.

The key intuition: **tool_result content lives in input for every subsequent turn**. Treat it like stdout — be terse.`,
        },
        {
          kind: "code_predict",
          label: "prune_history (windowed)",
          code: `def prune_history(messages: list[dict],
                  *, max_turns: int = 8,
                  keep_system_messages: bool = True) -> list[dict]:
    """Keep only the last \`max_turns\` (user, assistant) pairs.
    System messages, if any, are preserved at the top."""
    if len(messages) <= max_turns:
        return messages

    head = []
    body = messages
    if keep_system_messages and messages and messages[0].get("role") == "system":
        head = [messages[0]]
        body = messages[1:]

    # Always keep the most recent user turn (the current prompt)
    return head + body[-max_turns:]

# Usage inside the loop, after appending tool_results:
# messages = prune_history(messages, max_turns=8)

before = [
    {"role": "user", "content": "q1"},
    {"role": "assistant", "content": "a1"},
    {"role": "user", "content": "q2"},
    {"role": "assistant", "content": "a2"},
    {"role": "user", "content": "q3"},
    {"role": "assistant", "content": "a3"},
    {"role": "user", "content": "q4"},
]
print(len(prune_history(before, max_turns=4)))`,
          output: `4`,
          explanation: `Windowed pruning is the cheapest strategy: drop everything older than the window. The function preserves system messages (always sent) and keeps the most recent user turn (the active question). For long-running conversational agents you'd swap windowing for summarization — call a cheap model on the dropped turns and store the summary as a single system-style message.`,
        },
        {
          kind: "code_comparison",
          label: "naive vs windowed history",
          left: {
            title: "Naive — keep everything",
            code: `messages = [{"role": "user", "content": prompt}]
for turn in range(20):
    r = client.messages.create(
        model="claude-sonnet-4-5",
        tools=tools, messages=messages,
    )
    if r.stop_reason == "end_turn":
        return r.content[0].text
    messages.append({"role": "assistant",
                     "content": r.content})
    messages.append({"role": "user",
                     "content": tool_results})
# Turn 20 input ≈ 20× turn 1 input.
# Quadratic cost growth, fast context-window blow-up.`,
            annotation:
              "Input token growth is unbounded. A 20-turn agent on a tool-heavy task can easily hit context limits and certainly hits a surprise invoice.",
          },
          right: {
            title: "Windowed — constant per-turn cost",
            code: `messages = [{"role": "user", "content": prompt}]
for turn in range(20):
    r = client.messages.create(...)
    if r.stop_reason == "end_turn":
        return r.content[0].text
    messages.append({"role": "assistant",
                     "content": r.content})
    messages.append({"role": "user",
                     "content": tool_results})
    messages = prune_history(messages, max_turns=8)
# Past turn 8, input stays roughly flat.`,
            annotation:
              "After the window fills, per-turn input cost stabilizes. Tradeoff: agent 'forgets' turns older than the window. Pair with summarization for long-running chats.",
          },
          takeaway:
            "Default to windowed pruning for stateless tool agents; layer summarization on top when continuity matters. Never ship a multi-turn agent without one or the other.",
        },
        {
          kind: "scenario_predict",
          label: "30 KB tool_result blowing up the context window",
          scenario: `# read_doc returns the full HTML of a wiki page (~30 KB).
def read_doc(doc_id: str) -> str:
    return fetch_wiki_page(doc_id)  # returns full HTML string

# Agent calls read_doc 6 times across 8 turns,
# then runs 3 more turns of analysis.`,
          language: "python",
          question:
            "Sketch the input-token growth across the 11 turns and the right fix.",
          answer:
            "Turn 1: ~500 tokens. Each read_doc adds ~7,500 tokens to the history (30 KB ≈ 7.5k tokens), and that history ships on every subsequent turn. By turn 8, input is ~45k tokens; by turn 11, ~60k tokens. Fix: shrink at source — read_doc returns {doc_id, summary}; store the full HTML in a side-channel cache keyed by doc_id; only fetch full text on explicit request from a new get_doc_section(doc_id, section) tool. Cuts per-turn input by 10×.",
          explanation:
            "Big tool_results are the #1 source of context-window pain in production agents. The fix is almost always 'return less, store more externally.' The agent shouldn't be carrying 30 KB of HTML in its working memory — it should be carrying a doc_id and the option to read it again.",
        },
        {
          kind: "multiple_choice",
          title: "picking the right context strategy",
          prompt:
            "Match each agent shape to the best context-management strategy:",
          choices: [
            {
              text: "Short single-turn Q&A (1-2 tool calls). → No strategy needed; default loop is fine.",
              correct: true,
              rationale:
                "Context won't grow past a few KB. Adding pruning adds complexity for zero benefit.",
            },
            {
              text: "Long research agent (10-30 turns, many doc reads). → Shrink at source + windowed pruning.",
              correct: true,
              rationale:
                "Tool_results are the main bloat source; shrinking them is highest-leverage. Pruning catches what shrinking doesn't.",
            },
            {
              text: "Multi-step debugging agent (sequential tool calls, intermediate state matters). → Summarization, not windowing.",
              correct: true,
              rationale:
                "Windowing loses context the agent needs to remember (earlier steps in the debug chain). Summarization preserves continuity at lower token cost.",
            },
            {
              text: "Document-heavy summarization agent (read many docs, produce one summary). → Stuff all docs into one prompt.",
              correct: false,
              rationale:
                "If 'all docs' fits in context, fine — but at that point you don't need tool-use, just a long prompt. Real doc-heavy agents need shrink-at-source (read selectively).",
            },
          ],
          explanation:
            "Strategy choice follows agent shape. Short = nothing. Long with big tool returns = shrink+window. Long with stateful debug = summarize. There's no single answer; pick by what bloats your context most.",
        },
        {
          kind: "key_insight",
          label: "tool_result is stdout — keep it terse",
          insight: `Tool_result content lives in input for every subsequent turn. Treat it like stdout: be terse. Return ids and summaries; store full payloads externally; let the agent fetch detail explicitly when it needs it. This single discipline keeps tool-heavy agents from quadratic context growth.`,
        },
      ],
    },

    // ================================================================
    // 13. Per-iteration observability
    // ================================================================
    {
      title: "Per-iteration observability",
      blocks: [
        {
          kind: "prose",
          markdown: `When (not if) an agent misbehaves in production, the question is always the same: **what did Claude try and why?** Without logs you're guessing. With the right logs, you replay the run in your head in 30 seconds.

The metrics you want per agent run:

1. **Per iteration:** \`(turn_index, stop_reason, input_tokens, output_tokens, tool_calls)\`. One log line per loop iteration.
2. **Per tool call:** \`(tool_name, input_args, output_or_error, latency_ms, status)\`. One log line per dispatch.
3. **Cumulative:** \`(total_input, total_output, total_cost_usd, total_iterations, request_id_chain)\`. One log line at run completion.
4. **Request IDs.** Anthropic's response carries an \`x-request-id\` header (also on \`response.id\`). Chain them across iterations so a customer ticket → log search → replayable conversation is one step.

Cheap structured logging beats clever observability frameworks. \`logger.info(json.dumps({...}))\` to stdout, ingested into your usual log pipeline, gives you 90% of what you need.`,
        },
        {
          kind: "code_predict",
          label: "LoopLogger wrapper",
          code: `import logging, json, time, uuid

class LoopLogger:
    def __init__(self, agent_name: str):
        self.run_id = str(uuid.uuid4())
        self.agent = agent_name
        self.turn = 0
        self.total_in = self.total_out = 0
        self.t_start = time.monotonic()
        self.log = logging.getLogger("agent")

    def iteration(self, response):
        self.turn += 1
        self.total_in += response.usage.input_tokens
        self.total_out += response.usage.output_tokens
        self.log.info(json.dumps({
            "evt": "iteration",
            "run_id": self.run_id,
            "agent": self.agent,
            "turn": self.turn,
            "stop": response.stop_reason,
            "in": response.usage.input_tokens,
            "out": response.usage.output_tokens,
            "request_id": response.id,
        }))

    def tool_call(self, name: str, input_args: dict,
                  output: str, latency_ms: int, status: str):
        self.log.info(json.dumps({
            "evt": "tool_call",
            "run_id": self.run_id,
            "turn": self.turn,
            "name": name,
            "input": input_args,
            "output_size": len(output),
            "ms": latency_ms,
            "status": status,
        }))

    def finish(self, reason: str):
        self.log.info(json.dumps({
            "evt": "finish",
            "run_id": self.run_id,
            "agent": self.agent,
            "reason": reason,
            "turns": self.turn,
            "total_in": self.total_in,
            "total_out": self.total_out,
            "duration_ms": int((time.monotonic()-self.t_start)*1000),
        }))`,
          output: `(no output — class definition)`,
          explanation: `Three methods cover the surface: \`iteration\` for the per-turn metadata, \`tool_call\` for each dispatch, \`finish\` for the run summary. The \`run_id\` ties everything together; if a user reports a bad answer, you grep \`run_id=abc\` and see the entire run in chronological order.`,
        },
        {
          kind: "code_comparison",
          label: "print-debug vs structured logs",
          left: {
            title: "print-debug (good for first iteration only)",
            code: `print("turn", turn, "stop_reason", r.stop_reason)
print("called", block.name, block.input)
print("result", result[:80])
# Lost on next restart.
# Not queryable.
# No correlation across turns.
# Production: not useful.`,
            annotation:
              "Fine for the first hour of building. Useless when you need to debug a single bad run out of millions.",
          },
          right: {
            title: "Structured JSON logs",
            code: `log.info(json.dumps({
    "evt": "iteration",
    "run_id": run_id,
    "turn": turn,
    "stop": r.stop_reason,
    "in": r.usage.input_tokens,
    "out": r.usage.output_tokens,
    "request_id": r.id,
}))
# Queryable: run_id=X AND evt=tool_call
# Aggregate-able: avg(out) by tool_name
# Re-playable: full chronological trace`,
            annotation:
              "One log line per event, JSON-encoded, queryable in any log tool. Find any run by run_id; replay the conversation from logs alone.",
          },
          takeaway:
            "Structured logs cost one extra call per event and pay for themselves the first time you debug a real production bug. Use them from day one.",
        },
        {
          kind: "flashcard",
          context: "observability",
          front:
            "Bare minimum log fields per loop iteration?",
          back:
            "(run_id, turn_index, stop_reason, input_tokens, output_tokens, request_id). Anything less and you can't replay or aggregate cost; anything more is bonus.",
        },
        {
          kind: "flashcard",
          context: "observability",
          front:
            "Sign in the logs that an agent is in a runaway loop?",
          back:
            "Same (tool_name, input_args) appearing on consecutive turns. Pair logs with a detect_repetition() guard (see §14) to catch this in-flight, not just in post-mortems.",
        },
        {
          kind: "flashcard",
          context: "observability",
          front:
            "Why chain Anthropic request_ids across loop iterations in your logs?",
          back:
            "Support tickets and Anthropic-side debugging start from request_id. Chained ids let you (and Anthropic Support) trace every API call in the run from a single user complaint.",
        },
      ],
    },

    // ================================================================
    // 14. Failure modes & agent-specific debugging
    // ================================================================
    {
      title: "Failure modes & agent-specific debugging",
      blocks: [
        {
          kind: "prose",
          markdown: `Beyond the wire-level failures the Messages API guide §21 covers (overload, bad request, rate limit), agent loops have their own family of failure modes. Four of them account for most production incidents:

1. **Same-tool-same-input loops.** Model keeps re-calling \`lookup_user(id='123')\` because the tool_result didn't answer the actual question — and Claude has nothing else to try. Symptom: max_iters fires; logs show identical \`(name, input)\` on consecutive turns.

2. **No-progress loops.** Different tools each turn, but the conversation isn't converging — usually a missing tool ("if only I had \`search_kb\`...") or a poorly described one ("\`lookup\` returns nothing useful for this query"). Symptom: max_iters fires; tool sequence varies but final answer never appears.

3. **Tool fatigue.** Too many tools registered (>12). Claude picks badly, prefers one tool when another is right, ignores rarely-used ones entirely. Symptom: production-only quality regressions; eval traces show wrong tool picks.

4. **History bloat.** Turn 20 input is 50× turn 1. Eventually you hit the context window or burn through the budget. Symptom: cost-per-run climbs; latency climbs; eventually 400-error from API.

For each, the detection signal and the fix are concrete — covered in the blocks below.`,
        },
        {
          kind: "code_predict",
          label: "detect_repetition guard",
          code: `from collections import deque
import json

def detect_repetition(history: list[dict],
                      window: int = 3) -> bool:
    """Return True if the last \`window\` tool_use blocks
    have identical (name, input)."""
    recent_calls = deque(maxlen=window)
    for msg in history:
        if msg.get("role") != "assistant":
            continue
        content = msg.get("content", [])
        if not isinstance(content, list):
            continue
        for block in content:
            # block is either a dict or a ToolUseBlock; handle both
            name = getattr(block, "name", None) or (block.get("name") if isinstance(block, dict) else None)
            inp  = getattr(block, "input", None) or (block.get("input") if isinstance(block, dict) else None)
            if name is None:
                continue
            recent_calls.append((name, json.dumps(inp, sort_keys=True)))

    return len(recent_calls) == window and len(set(recent_calls)) == 1

# Inside the loop, after appending the assistant turn:
# if detect_repetition(messages, window=3):
#     results.append({"type": "tool_result", "tool_use_id": block.id,
#                     "content": json.dumps({"error":
#                       "no further progress; ask the user to clarify"}),
#                     "is_error": True})`,
          output: `(no output — function definition)`,
          explanation: `The guard scans the last \`window\` tool_use blocks and returns True if they're identical. When triggered, the loop sends a synthetic \`is_error=True\` tool_result that nudges Claude out of the loop — either by asking the user to clarify, or by emitting \`end_turn\` with what it knows. Either is better than burning iterations.`,
        },
        {
          kind: "code_comparison",
          label: "no dedup vs dedup guard",
          left: {
            title: "No dedup — loops to max_iters",
            code: `for turn in range(max_iters):
    r = client.messages.create(...)
    if r.stop_reason == "end_turn":
        return r.content[0].text
    # ... dispatch and append tool_results ...
    # If Claude keeps calling lookup_user(id='123'),
    # the loop runs until max_iters, then raises.
    # User waits 30s for a max_iters error.`,
            annotation:
              "Burns the full max_iters budget on a deterministic loop. Wastes tokens and customer time.",
          },
          right: {
            title: "Dedup guard — early intervention",
            code: `for turn in range(max_iters):
    r = client.messages.create(...)
    if r.stop_reason == "end_turn":
        return r.content[0].text
    messages.append({"role": "assistant",
                     "content": r.content})

    if detect_repetition(messages, window=3):
        results = [{"type": "tool_result",
            "tool_use_id": r.content[0].id,
            "content": json.dumps({"error":
                "no further progress; ask user to clarify"}),
            "is_error": True}]
    else:
        results = [...]  # normal dispatch
    messages.append({"role": "user",
                     "content": results})`,
            annotation:
              "After 3 identical tool calls, force Claude to either ask the user or stop. Saves 5+ iterations of wasted tokens.",
          },
          takeaway:
            "Dedup guards trade one helper function for early exit from runaway loops. Every production agent should have one.",
        },
        {
          kind: "scenario_predict",
          label: "post-mortem on a real ticket",
          scenario: `# Ticket: "Agent took 45s and returned 'I couldn't help with that.'"
# Logs show:
#   run_id=abc turn=1 stop=tool_use tools=[search_kb(q='Refund policy')]
#   run_id=abc turn=2 stop=tool_use tools=[search_kb(q='refund policy 2024')]
#   run_id=abc turn=3 stop=tool_use tools=[search_kb(q='customer refund')]
#   run_id=abc turn=4 stop=tool_use tools=[search_kb(q='return policy')]
#   ... 4 more search_kb calls ...
#   run_id=abc turn=8 stop=end_turn  total_in=18234 total_out=312`,
          language: "text",
          question:
            "Walk through the debug. What kind of failure is this and what's the fix?",
          answer:
            "No-progress loop — different inputs but always the same tool (search_kb). Most likely cause: the KB doesn't actually have refund policy content, so search_kb returns empty hits on every query and Claude keeps reformulating. Fixes (in priority order): (1) add a tool description note 'returns empty if no docs match' so Claude treats consecutive empties as 'topic absent'; (2) add a fallback escalate(reason) tool so Claude has somewhere to go when search yields nothing; (3) add a detect_no_progress guard counting consecutive empty tool_results.",
          explanation:
            "The fingerprint of a no-progress loop is: same tool, varying inputs, no end_turn. The fingerprint of a same-tool-same-input loop is: same tool, identical inputs. They look similar in summary; the input pattern in the logs disambiguates them.",
        },
        {
          kind: "multiple_choice",
          title: "matching symptoms to failure modes",
          prompt: "Match each symptom to its likely cause:",
          choices: [
            {
              text: "Agent took 45s, hit max_iters, called lookup_user(id='42') 6 times in a row. → Same-tool-same-input loop; add detect_repetition guard.",
              correct: true,
              rationale:
                "Identical (name, input) on consecutive turns is the signature of same-tool-same-input. Dedup guard solves it.",
            },
            {
              text: "Agent called 8 different tools across 8 turns but never end_turned. → No-progress loop; check whether a needed tool is missing or poorly described.",
              correct: true,
              rationale:
                "Tool variety + no convergence usually means the agent has the wrong toolbox for the question. Add the missing tool or improve descriptions.",
            },
            {
              text: "New agent with 18 registered tools picks wrong tools in 25% of evals. → Tool fatigue; split into specialist agents or trim the toolbox.",
              correct: true,
              rationale:
                "Past ~12 tools, routing accuracy degrades. The fix is fewer tools per agent, layered with a router agent if total surface is large.",
            },
            {
              text: "Agent input_tokens are 50k by turn 20 and cost-per-run is climbing. → Context window is fine, ignore.",
              correct: false,
              rationale:
                "This is history bloat. Tool_results are too big or you're keeping too many turns. Apply the §12 strategies (shrink, window, summarize).",
            },
          ],
          explanation:
            "Each failure mode has a distinct fingerprint in the logs. Naming them in the team helps debugging: 'this is a same-tool-same-input loop' is faster than 'I think it's calling the same thing over and over.'",
        },
        {
          kind: "flashcard",
          context: "agent failure modes",
          front:
            "Signal: 3+ consecutive turns with identical (tool_name, input). Failure mode and fix?",
          back:
            "Same-tool-same-input loop. Fix: add detect_repetition guard that returns an is_error=True tool_result forcing Claude to break the pattern (ask user or end_turn).",
        },
        {
          kind: "flashcard",
          context: "agent failure modes",
          front:
            "Signal: input_tokens climb every turn, no end_turn in sight. Failure mode and fix?",
          back:
            "History bloat. Fix (priority order): shrink tool_result content; add windowed pruning; add summarization for older turns. See §12.",
        },
        {
          kind: "flashcard",
          context: "agent failure modes",
          front:
            "Signal: production evals show wrong tool picks, but each tool definition looks fine in isolation. Failure mode and fix?",
          back:
            "Tool fatigue (>12 tools per agent). Fix: split into specialist agents (one per domain) with a thin router agent on top. Per-agent toolbox stays ≤ ~8.",
        },
        {
          kind: "flashcard",
          context: "agent failure modes",
          front:
            "Signal: agent uses many different tools, varying inputs, but never converges. Failure mode and fix?",
          back:
            "No-progress loop. Usually a missing tool ('if only it had X') or a tool whose description doesn't say what to do on empty results. Add the missing tool or update descriptions to handle the empty-result case explicitly.",
        },
      ],
    },

    // ================================================================
    // 15. Testing the agent loop
    // ================================================================
    {
      title: "Testing the agent loop",
      blocks: [
        {
          kind: "prose",
          markdown: `Agent loops are testable. The trick is recognizing that three different kinds of tests cover ~80% of regression risk:

1. **Loop logic tests.** Mock \`messages.create\` with \`side_effect=[turn1_msg, turn2_msg, ...]\` and assert the loop dispatches the right tools, terminates on end_turn, and caps at max_iters when it should. These tests run in milliseconds and cover all the structural bugs (forgot to append assistant turn, mis-bundled tool_results, exited early on tool_use).

2. **Tool handler tests.** Test each handler in isolation with real inputs. Standard unit tests; no Claude involved. Use Pydantic models as fixture inputs to also exercise the validation layer.

3. **Golden trace tests.** Record \`(prompt, expected_tool_sequence, expected_final_answer)\` triples by running the real agent against the real API once, then assert on each model upgrade. These are slow and expensive (real API hits) — run them on PR merge and on model upgrades, not on every test run.

Cross-reference: \`testing-pytest-fixtures-mocking.ts\` covers Mock, MagicMock, side_effect mechanics in depth. Messages API guide §20 has a scripted-mock pattern for tool loops; here we extend it with the multi-turn fixture and golden-trace recipes.`,
        },
        {
          kind: "code_predict",
          label: "mock_agent_conversation fixture",
          code: `import pytest
from unittest.mock import MagicMock

def fake_tool_use(name, input_dict, id="tu_x"):
    block = MagicMock()
    block.type = "tool_use"
    block.name = name
    block.input = input_dict
    block.id = id
    return block

def fake_text(text):
    block = MagicMock()
    block.type = "text"
    block.text = text
    return block

def fake_response(content, stop_reason, in_t=100, out_t=50, id="msg_x"):
    r = MagicMock()
    r.content = content
    r.stop_reason = stop_reason
    r.usage.input_tokens = in_t
    r.usage.output_tokens = out_t
    r.id = id
    return r

@pytest.fixture
def mock_agent_conversation(monkeypatch):
    """Script a multi-turn conversation. Pass a list of fake_response."""
    def _setup(responses):
        client = MagicMock()
        client.messages.create.side_effect = responses
        return client
    return _setup`,
          output: `(no output — fixture definition)`,
          explanation: `The fixture lets each test script the exact sequence of model responses: \`responses=[turn1_tool_use, turn2_tool_use, turn3_end_turn]\`. The loop under test runs against the scripted mock and produces deterministic, replayable behavior. No API key, no real network, no flakiness.`,
        },
        {
          kind: "code_comparison",
          label: "testing against real API vs scripted mock",
          left: {
            title: "Real API tests",
            code: `def test_research_agent_real():
    # Hits real API
    answer = research_agent(
        "What does our handbook say about PTO?")
    assert "vacation" in answer.lower() or "leave" in answer.lower()
    # - Slow (5+ seconds per test)
    # - Flaky (model variance)
    # - Expensive ($)
    # - Requires API key in CI
    # - Hard to test edge cases
    #   (max_iters, validation errors)`,
            annotation:
              "Real API tests are useful but expensive. Keep ~5 as smoke tests on PR merge; not your main coverage tool.",
          },
          right: {
            title: "Scripted-mock tests",
            code: `def test_research_loop_dispatches_correctly(
        mock_agent_conversation):
    client = mock_agent_conversation([
        fake_response([fake_tool_use("search_docs",
            {"query": "PTO"}, id="tu_1")],
            stop_reason="tool_use"),
        fake_response([fake_tool_use("read_doc",
            {"doc_id": "doc-2"}, id="tu_2")],
            stop_reason="tool_use"),
        fake_response([fake_text("PTO policy is ...")],
            stop_reason="end_turn"),
    ])
    answer = research_agent(client, "PTO policy?")
    assert "PTO policy is" in answer
    assert client.messages.create.call_count == 3`,
            annotation:
              "Fast (~5ms), deterministic, free, runs in CI without keys. Tests the loop structure, not the model.",
          },
          takeaway:
            "Scripted mocks cover loop logic at ~80% of the value for ~5% of the cost. Reserve real-API tests for smoke tests and golden traces.",
        },
        {
          kind: "scenario_predict",
          label: "test that ships but breaks in prod",
          scenario: `def test_agent():
    client = mock_agent_conversation([
        fake_response([fake_text("Hello!")],
                     stop_reason="end_turn"),
    ])
    answer = my_agent(client, "Hi")
    assert answer == "Hello!"
# Test passes. Ship to prod. Prod immediately hits a tool_use
# response and the agent crashes with AttributeError.`,
          language: "python",
          question:
            "Predict the production bug and the right test pattern.",
          answer:
            "Bug: the agent code probably does `response.content[0].text` on every turn without branching on stop_reason. The test only covered the end_turn path, so the missing branch wasn't exercised. Right test pattern: at minimum, write three tests — (1) immediate end_turn (single-turn happy path), (2) one tool_use → tool_result → end_turn (canonical loop), (3) tool_use repeating until max_iters fires (loop exit). These three cover ~80% of structural bugs.",
          explanation:
            "Loop-logic tests are only as good as the response sequences they script. A test that only mocks end_turn responses won't catch the missing tool_use branch. Always include at least one multi-turn tool_use sequence and one max_iters exit case.",
        },
        {
          kind: "mini_challenge",
          title: "Three-turn agent loop test",
          prompt: `Write a pytest that:

1. Mocks a 3-turn conversation: (a) tool_use \`search_docs("payroll")\`, (b) tool_use \`read_doc("doc-7")\`, (c) end_turn with text "Payroll runs every Friday."
2. Calls the agent under test (assume \`run_agent(client, prompt, tools, dispatch) -> str\`).
3. Asserts that:
   - \`client.messages.create\` was called exactly 3 times.
   - The dispatch was called for \`search_docs\` with \`query="payroll"\`, then for \`read_doc\` with \`doc_id="doc-7"\`.
   - The returned answer equals "Payroll runs every Friday."
   - \`max_iters=8\` was not hit (no RuntimeError).

Use the \`fake_tool_use\` / \`fake_text\` / \`fake_response\` helpers from the fixture above.`,
          hints: [
            "Build a `MagicMock()` dispatch dict where `dispatch['search_docs']` and `dispatch['read_doc']` are MagicMocks returning strings (e.g. JSON-encoded results).",
            "Use `client.messages.create.side_effect = [r1, r2, r3]` to script the conversation. The 3rd response should have `stop_reason='end_turn'` and content `[fake_text('Payroll runs every Friday.')]`.",
            "After running, assert with `dispatch['search_docs'].assert_called_once_with(query='payroll')` and `dispatch['read_doc'].assert_called_once_with(doc_id='doc-7')`.",
          ],
          solution: `from unittest.mock import MagicMock

def test_three_turn_agent_loop():
    dispatch = {
        "search_docs": MagicMock(return_value='[{"id": "doc-7"}]'),
        "read_doc":    MagicMock(return_value='{"text": "..."}'),
    }
    tools = [
        {"name": "search_docs", "description": "...",
         "input_schema": {"type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"]}},
        {"name": "read_doc", "description": "...",
         "input_schema": {"type": "object",
            "properties": {"doc_id": {"type": "string"}},
            "required": ["doc_id"]}},
    ]

    client = MagicMock()
    client.messages.create.side_effect = [
        fake_response(
            [fake_tool_use("search_docs", {"query": "payroll"}, id="tu_1")],
            stop_reason="tool_use"),
        fake_response(
            [fake_tool_use("read_doc", {"doc_id": "doc-7"}, id="tu_2")],
            stop_reason="tool_use"),
        fake_response(
            [fake_text("Payroll runs every Friday.")],
            stop_reason="end_turn"),
    ]

    answer = run_agent(client, "When is payroll?",
                       tools=tools, dispatch=dispatch, max_iters=8)

    assert client.messages.create.call_count == 3
    dispatch["search_docs"].assert_called_once_with(query="payroll")
    dispatch["read_doc"].assert_called_once_with(doc_id="doc-7")
    assert answer == "Payroll runs every Friday."`,
          takeaway:
            "Scripted-mock tests are the workhorse of agent regression coverage. A 30-line test exercises the loop structure end-to-end, runs in 5ms, and catches the structural bugs that account for most production incidents.",
        },
        {
          kind: "flashcard",
          context: "testing strategy",
          front:
            "What three test categories cover ~80% of agent regression risk?",
          back:
            "(1) Loop-logic tests with scripted mock — structural correctness. (2) Tool-handler unit tests — handler logic and validation. (3) Golden-trace tests against real API — model-upgrade regression catch.",
        },
        {
          kind: "flashcard",
          context: "testing strategy",
          front:
            "When do you run golden-trace (real-API) tests vs. scripted-mock tests?",
          back:
            "Mock tests on every commit (fast, free). Golden traces on PR merge to main, on model upgrades, and on tool-definition changes. They cost real money and are flaky; don't run them in every CI loop.",
        },
        {
          kind: "flashcard",
          context: "testing strategy",
          front:
            "What's the minimum set of loop-logic tests every new agent should have?",
          back:
            "(1) Immediate end_turn (single-turn happy path), (2) one tool_use → tool_result → end_turn (canonical loop), (3) tool_use repeating until max_iters fires (exit guard). Add domain-specific tests on top.",
        },
      ],
    },

    // ================================================================
    // 16. Pattern: RAG with tool-use
    // ================================================================
    {
      title: "Pattern: RAG with tool-use",
      blocks: [
        {
          kind: "prose",
          markdown: `RAG — retrieval-augmented generation — is the most common tool-use agent in production. The shape is always the same:

- **Tools:** \`search(query) -> [{doc_id, snippet}]\` and \`read(doc_id) -> str\`.
- **System prompt:** "Search first; read selectively; cite sources." Plus any domain-specific instructions (which corpus, what counts as authoritative, citation format).
- **Loop:** Standard loop. Usually converges in 2-5 turns for small corpora, 5-15 for large ones.

Tool-use RAG beats "stuff the corpus into the prompt" RAG once the corpus is more than a few thousand tokens. The model becomes the retrieval planner: it picks queries based on the question, refines based on results, and reads only what matters. You pay only for the documents actually read, not the entire corpus on every query.

The two engineering pitfalls (covered above) hit hardest here:
- **Big tool_results.** \`read(doc_id)\` returning full HTML blows up the context window — return a summary, store full text externally.
- **No-progress loops.** When \`search\` returns empty for legitimately absent topics, Claude keeps reformulating queries forever. Tool description must say "returns empty if no docs match" so Claude treats consecutive empties as "topic absent."`,
        },
        {
          kind: "code_predict",
          label: "minimal RAG agent",
          code: `import anthropic, json

client = anthropic.Anthropic()

DOCS = {
    "doc-1": "Vacation accrues at 1.5 days per month.",
    "doc-2": "Health insurance enrollment opens in November.",
    "doc-3": "Expense reports are due on the 5th of each month.",
}

def search(query: str) -> str:
    hits = [{"doc_id": k, "snippet": v[:60]}
            for k, v in DOCS.items()
            if query.lower() in v.lower()]
    return json.dumps(hits or [])

def read(doc_id: str) -> str:
    return json.dumps({"doc_id": doc_id,
                       "text": DOCS.get(doc_id, "(not found)")})

DISPATCH = {"search": search, "read": read}

tools = [
    {"name": "search",
     "description": ("Search the company handbook. Returns a list of "
                     "{doc_id, snippet}. Returns [] if no docs match — "
                     "treat consecutive empty results as 'topic absent'."),
     "input_schema": {"type": "object",
        "properties": {"query": {"type": "string"}},
        "required": ["query"]}},
    {"name": "read",
     "description": ("Read the full text of a doc by id. Call search first "
                     "to get valid doc_ids. Returns {doc_id, text}."),
     "input_schema": {"type": "object",
        "properties": {"doc_id": {"type": "string"}},
        "required": ["doc_id"]}},
]

SYSTEM_PROMPT = ("Answer questions using the company handbook. "
                 "Always search first; read selectively; cite doc_ids in "
                 "your answer like [doc-1]. If a topic isn't in the corpus, "
                 "say so plainly — don't hallucinate.")

def rag_agent(question: str, max_iters: int = 6) -> str:
    messages = [{"role": "user", "content": question}]
    for _ in range(max_iters):
        r = client.messages.create(
            model="claude-sonnet-4-5", max_tokens=1024,
            system=SYSTEM_PROMPT, tools=tools, messages=messages,
        )
        if r.stop_reason == "end_turn":
            return r.content[0].text
        messages.append({"role": "assistant", "content": r.content})
        results = [{"type": "tool_result",
                    "tool_use_id": b.id,
                    "content": DISPATCH[b.name](**b.input)}
                   for b in r.content if b.type == "tool_use"]
        messages.append({"role": "user", "content": results})
    return "(agent did not converge)"`,
          output: `(no output — function definition)`,
          explanation: `The shape is the standard loop. The work is in the tool descriptions and the system prompt: they encode the routing policy (search first, read selectively), the response shape (cite doc_ids), and the empty-result handling (don't hallucinate, say so). RAG quality lives more in those prompts than in the loop mechanics.`,
        },
        {
          kind: "code_comparison",
          label: "stuff-the-prompt RAG vs tool-use RAG",
          left: {
            title: "Stuff-the-prompt RAG",
            code: `def stuffed_rag(question: str) -> str:
    full_corpus = "\\n\\n".join(DOCS.values())
    return client.messages.create(
        model="claude-sonnet-4-5", max_tokens=1024,
        messages=[{"role": "user",
            "content": f"{full_corpus}\\n\\nQ: {question}"}],
    ).content[0].text
# Pays for the full corpus on every query.
# Hits context limits with even a medium corpus.
# Model has to scan all docs to find the answer.`,
            annotation:
              "Fine for tiny corpora (<5k tokens) and one-shot prototypes. Quickly becomes expensive and slow.",
          },
          right: {
            title: "Tool-use RAG",
            code: `def rag_agent(question: str) -> str:
    # ... (loop with search + read tools, per §16) ...
# Pays only for the docs actually read.
# Scales to arbitrarily large corpora (search picks).
# Model decides what's relevant — RAG quality
# becomes a function of the search tool's quality.`,
            annotation:
              "Selective retrieval. Cost is bounded by what the model chooses to read. Works for 10-doc corpora and 10M-doc corpora alike.",
          },
          takeaway:
            "Tool-use RAG scales better than prompt-stuffing past trivial corpora. The model becomes the retrieval planner; you just have to give it a good search tool.",
        },
        {
          kind: "key_insight",
          label: "RAG quality = tool description + system prompt",
          insight: `In RAG, loop mechanics are 5% of the work. The other 95% is: the search tool's description (when to call, what it returns, how to handle empties), the read tool's description (must come after search, returns what), and the system prompt's routing policy (search first, cite sources, admit absence). Iterate on those, not on the loop.`,
        },
      ],
    },

    // ================================================================
    // 17. Pattern: Code-review agent
    // ================================================================
    {
      title: "Pattern: Code-review agent",
      blocks: [
        {
          kind: "prose",
          markdown: `A code-review agent reads a diff, gathers context from the surrounding code, and produces a structured review. Typical tools:

- \`list_files()\` — what's in the PR.
- \`read_file(path)\` — read one file.
- \`grep(pattern)\` — find usages elsewhere in the repo.
- \`git_blame(path, line)\` — who wrote this line and when.

The system prompt is checklist-driven: "Review for (1) correctness, (2) security, (3) tests, (4) style. For each finding, cite path:line." The loop runs 10-20 turns gathering evidence, then produces the final review in one big text response.

The dominant failure mode is **history bloat from reading too much code**. A 500-line file in a tool_result is ~10k tokens; reading 10 files puts you at 100k+ input on every subsequent turn. Mitigations: \`read_file_section(path, start_line, end_line)\` instead of full \`read_file\`; summarize-then-discard intermediate reads; or use a separate "research" agent that reduces files to bullet summaries before passing to a "reviewer" agent.`,
        },
        {
          kind: "code_predict",
          label: "code-review agent skeleton",
          code: `SYSTEM_PROMPT = """\\
You are a code reviewer for the company's main Python service.

Review checklist (in order):
1. Correctness: does the change do what the PR description claims?
2. Security: input validation, auth, secrets handling.
3. Tests: are new code paths covered?
4. Style: matches project conventions (we use ruff + mypy strict).

For each finding, cite path:line. Group findings by severity:
BLOCKING / SUGGESTED / NIT.

Routing policy:
- Start by listing changed files.
- Read each changed file in full (use read_file).
- Use grep to find callers of changed functions.
- Use git_blame only if context-of-change matters.
- Stop reading once you have enough evidence — don't exhaust max_iters
  gathering more files.
"""

tools = [
    {"name": "list_files", "description": "List files changed in the PR.",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "read_file",
     "description": "Read full text of one file. Be selective — large files bloat context.",
     "input_schema": {"type": "object",
        "properties": {"path": {"type": "string"}},
        "required": ["path"]}},
    {"name": "grep",
     "description": "Search for a regex pattern across the repo. Returns {path, line, text}.",
     "input_schema": {"type": "object",
        "properties": {"pattern": {"type": "string"}},
        "required": ["pattern"]}},
    {"name": "git_blame",
     "description": "Get author + timestamp for path:line.",
     "input_schema": {"type": "object",
        "properties": {"path": {"type": "string"},
                       "line": {"type": "integer"}},
        "required": ["path", "line"]}},
]

# Run the standard loop with these tools + system prompt + max_iters=20.`,
          output: `(no output — skeleton)`,
          explanation: `The tools are commodity. The system prompt is where the agent's quality lives — the checklist, the routing policy (read before grep, grep before blame), the stop heuristic ("don't exhaust max_iters gathering more files"). Iterate on the prompt with golden traces over a corpus of representative PRs.`,
        },
        {
          kind: "scenario_predict",
          label: "code-review agent burning iterations",
          scenario: `# A code-review agent on a 500-line PR runs 25 turns, hits max_iters=25,
# returns a partial review. Logs show:
#   turn 1-3: list_files + read_file(small_file)  — fine
#   turn 4-12: read_file(big_file_A), read_file(big_file_B), ...
#              — each tool_result ~8k tokens
#   turn 13-25: grep + read_file repeatedly,
#               input_tokens climbing 8k per turn`,
          language: "text",
          question:
            "What's the bottleneck and the fix?",
          answer:
            "Bottleneck: history bloat from full-file reads. Each read_file dumps 8k+ tokens into the tool_result, which then ships on every subsequent turn — input bloats faster than the agent can find what it needs. Fix (priority): (1) add a read_file_section(path, start, end) tool and update system prompt to 'read only the changed lines + 20 lines of context'; (2) summarize-then-discard — after reading a file, ask the agent to summarize it and use the summary in place of the full read for later turns; (3) split into research + review agents so the research agent reduces files to summaries before the reviewer sees them.",
          explanation:
            "Code-review and other 'read-heavy' agents are the canonical context-bloat case. The fix is almost always to read less (sections instead of full files), not to read more efficiently. Section-based reading typically cuts input by 5-10× with no quality loss.",
        },
      ],
    },

    // ================================================================
    // 18. Pattern: Ticket-triage agent
    // ================================================================
    {
      title: "Pattern: Ticket-triage agent",
      blocks: [
        {
          kind: "prose",
          markdown: `A ticket-triage agent classifies inbound support tickets and routes them: look up customer, check known issues, decide to respond or escalate. Typical tools:

- \`lookup_customer(id) -> {plan, region, recent_issues}\`
- \`search_kb(query) -> [{kb_id, title, snippet}]\`
- \`escalate(reason: str) -> {ack}\`
- \`respond(message: str) -> {ack}\`

Two design choices distinguish this from RAG:

1. **Forced action via tool_choice.** Set \`tool_choice={"type": "any"}\` so Claude must emit an action (escalate or respond) — no chatty replies that fall through the cracks.
2. **Per-ticket isolation.** When processing a batch of tickets, wrap each one in try/except so a single bad ticket can't kill the batch. Log the failure and continue.

The triage agent is also a natural fit for **Pydantic-validated structured output**: the final action is a typed \`Triage\` model (\`{action: Literal[...], priority: int, summary: str}\`) emitted via a forced tool call. Validation at the boundary means downstream systems get a guaranteed shape.`,
        },
        {
          kind: "code_predict",
          label: "triage agent with per-ticket isolation",
          code: `import anthropic, json, logging

log = logging.getLogger("triage")

def triage_one(client, ticket: dict, tools, dispatch,
               *, max_iters: int = 4) -> dict:
    """Triage a single ticket. Returns the final action dict."""
    messages = [{"role": "user",
                 "content": f"Triage this ticket: {json.dumps(ticket)}"}]
    for _ in range(max_iters):
        r = client.messages.create(
            model="claude-sonnet-4-5", max_tokens=512,
            tools=tools,
            tool_choice={"type": "any"},  # force an action
            messages=messages,
        )
        if r.stop_reason == "end_turn":
            # Shouldn't happen with tool_choice=any, but be safe
            return {"action": "noop", "reason": "no tool called"}
        action_block = next(
            (b for b in r.content if b.type == "tool_use"
             and b.name in {"escalate", "respond"}),
            None,
        )
        if action_block:
            return {"action": action_block.name, **action_block.input}
        # Dispatch lookup/search tools and continue
        messages.append({"role": "assistant", "content": r.content})
        messages.append({"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": b.id,
             "content": dispatch[b.name](**b.input)}
            for b in r.content if b.type == "tool_use"
        ]})
    return {"action": "escalate", "reason": "agent did not converge"}

def triage_batch(client, tickets, tools, dispatch) -> list[dict]:
    results = []
    for t in tickets:
        try:
            results.append({"ticket_id": t["id"],
                            "result": triage_one(client, t, tools, dispatch)})
        except Exception as e:
            log.exception({"ticket_id": t["id"], "error": str(e)})
            results.append({"ticket_id": t["id"],
                            "result": {"action": "escalate",
                                       "reason": f"agent crashed: {e}"}})
    return results`,
          output: `(no output — function definitions)`,
          explanation: `Two things to notice. (1) \`tool_choice={"type": "any"}\` guarantees an action — no chatty replies. (2) \`triage_batch\` wraps each \`triage_one\` in try/except, logs failures, falls back to "escalate to human." A single bad ticket can't poison the batch. This pattern is the backbone of production batch agents.`,
        },
        {
          kind: "mini_challenge",
          title: "Pydantic-validated triage agent",
          prompt: `Extend the triage skeleton above with a Pydantic-validated final action.

1. Define a \`Triage\` Pydantic model:
   - \`action: Literal["respond", "escalate"]\`
   - \`priority: Literal["P0", "P1", "P2", "P3"]\`
   - \`customer_id: str\`
   - \`summary: str = Field(max_length=200)\`

2. Convert the Pydantic model into a tool via the \`pydantic_tool\` helper (from the Pydantic guide / §6).

3. Force the agent to call exactly that tool via \`tool_choice={"type": "tool", "name": "triage"}\`.

4. Validate the agent's call with \`Triage.model_validate(tool_use.input)\` and return the typed object.

5. Log the structured triage on success and on validation failure.`,
          hints: [
            "Wrap the model_validate call in try/except ValidationError. On failure, return is_error=True tool_result and let the agent retry (the retry-with-feedback policy from §11).",
            "The forced tool_choice means stop_reason will be 'tool_use' on the final turn, not 'end_turn'. Branch on `block.name == 'triage'` to detect the final action.",
            "For logging, include both the run_id and the ticket_id in every log line so you can search either dimension.",
          ],
          solution: `from pydantic import BaseModel, Field, ValidationError
from typing import Literal

class Triage(BaseModel):
    action: Literal["respond", "escalate"]
    priority: Literal["P0", "P1", "P2", "P3"]
    customer_id: str
    summary: str = Field(max_length=200)

def pydantic_tool(Model, description: str) -> dict:
    schema = Model.model_json_schema()
    schema.pop("title", None)
    return {"name": Model.__name__.lower(),
            "description": description,
            "input_schema": schema}

triage_tool = pydantic_tool(Triage,
    "Emit the final triage decision. Always call this exactly once.")
all_tools = [triage_tool] + lookup_tools  # lookup_customer, search_kb, etc.

def triage_one_validated(client, ticket, dispatch, *, max_iters=4):
    messages = [{"role": "user",
                 "content": f"Triage: {json.dumps(ticket)}"}]
    for turn in range(max_iters):
        r = client.messages.create(
            model="claude-sonnet-4-5", max_tokens=512,
            tools=all_tools, messages=messages,
            tool_choice={"type": "any"},
        )
        messages.append({"role": "assistant", "content": r.content})
        final_block = next((b for b in r.content
                            if b.type == "tool_use" and b.name == "triage"),
                           None)
        if final_block:
            try:
                triage = Triage.model_validate(final_block.input)
                log.info({"evt": "triage", "ticket_id": ticket["id"],
                          "result": triage.model_dump()})
                return triage
            except ValidationError as e:
                log.warning({"evt": "validation_error",
                             "ticket_id": ticket["id"],
                             "detail": e.errors()})
                messages.append({"role": "user", "content": [{
                    "type": "tool_result",
                    "tool_use_id": final_block.id,
                    "content": json.dumps({"error": e.errors()}),
                    "is_error": True,
                }]})
                continue
        # Otherwise dispatch lookup tools and loop
        messages.append({"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": b.id,
             "content": dispatch[b.name](**b.input)}
            for b in r.content if b.type == "tool_use"]})
    raise RuntimeError("triage did not converge")`,
          takeaway:
            "Forced tool_choice + Pydantic validation + per-ticket isolation = a production-grade triage agent in ~40 lines. The pattern generalizes: any 'agent must emit one structured action' workload follows the same shape.",
        },
      ],
    },

    // ================================================================
    // 19. tool_use vs other structured-output approaches
    // ================================================================
    {
      title: "tool_use vs other structured-output approaches",
      blocks: [
        {
          kind: "prose",
          markdown: `tool_use is one way to get structured output. It's not always the right one. Quick decision matrix:

- **tool_use (forced)** — best for multi-step agents *and* for "one structured output" cases when you also have real tools in the loop. Schema is enforced; Pydantic validation rounds out the contract.
- **tool_use (auto)** — best when Claude should *decide* whether the structured output is appropriate (chatty UX where 80% of replies are free text, 20% are structured).
- **prefill + stop_sequences** — best for trivial single-value outputs (one token, one short string). Lightest weight, no tools overhead.
- **plain text + json.loads** — prototype only. No schema enforcement; production breakage when the model wraps JSON in prose, uses different field names, or returns malformed JSON.

Cross-reference: Messages API guide §11 covers prefill-as-structured-output and the comparison in more depth.`,
        },
        {
          kind: "multiple_choice",
          title: "picking the right structured-output approach",
          prompt: "For each task, pick the best approach:",
          choices: [
            {
              text: "Customer-support triage agent that must always emit a structured decision. → tool_use with forced tool_choice.",
              correct: true,
              rationale:
                "You want a guaranteed schema, you have related lookup tools in the loop, and forcing the tool guarantees an action. tool_use with forced choice + Pydantic validation is the standard recipe.",
            },
            {
              text: "Sentiment classifier that needs to return 'positive' / 'negative' / 'neutral'. → prefill + stop_sequences.",
              correct: true,
              rationale:
                "Trivial output; no tools needed. Prefill with 'Sentiment: ' and stop at newline — fastest, cheapest, no overhead.",
            },
            {
              text: "RAG agent that searches docs and answers questions in prose. → tool_use with auto choice.",
              correct: true,
              rationale:
                "You want Claude to call search/read tools as needed and return free-text prose. Auto choice lets it pick; no need to force structured output.",
            },
            {
              text: "Production extraction pipeline pulling structured records from documents. → plain text + json.loads.",
              correct: false,
              rationale:
                "json.loads on free-text output is fragile (prose wrappers, malformed JSON, drifted field names). Use forced tool_use with a Pydantic model — schema enforced, validation at boundary.",
            },
          ],
          explanation:
            "Match the technique to the task. Tools cost a little overhead; prefill is lightest; json.loads is convenient but unreliable. When in doubt for any production structured-output case: use forced tool_use with a Pydantic-derived schema.",
        },
      ],
    },

    // ================================================================
    // 20. Common bugs and how to spot them
    // ================================================================
    {
      title: "Common bugs and how to spot them",
      blocks: [
        {
          kind: "prose",
          markdown: `A consolidated bug-spotting card-set. The first five are wire-level mistakes; the next four are agent-specific patterns introduced in §14. If you internalize these nine fingerprints, you'll diagnose most production agent bugs in under a minute.`,
        },
        {
          kind: "flashcard",
          context: "API rejection",
          front:
            'You get "tool_use_id does not match any tool_use" — what did you forget?',
          back:
            "You forgot to append the assistant turn (containing the original tool_use block) before appending the user turn with the tool_result. The API needs to see the matching tool_use in the conversation history.",
        },
        {
          kind: "flashcard",
          context: "API rejection",
          front:
            'You get "messages must alternate roles" after a tool result — what did you do wrong?',
          back:
            "You probably appended two consecutive user messages (e.g., one tool_result message per tool call instead of bundling all results into a single user message).",
        },
        {
          kind: "flashcard",
          context: "Loop never terminates",
          front:
            "Your loop runs forever — Claude keeps requesting the same tool with the same args. Likely cause and fix?",
          back:
            "Same-tool-same-input loop. Cause: tool_result doesn't answer the question and Claude has nothing else to try. Fix: detect_repetition guard (§14) that returns is_error=True after N identical calls.",
        },
        {
          kind: "flashcard",
          context: "Tool ignored",
          front:
            "Claude responds with text instead of calling your tool, even though the tool is clearly relevant. Likely cause and fix?",
          back:
            "Description too vague or schema too loose. Fix: tighten the description ('use this when X', 'returns Y'); if it still ignores the tool, force it via tool_choice={'type': 'any'} or specific.",
        },
        {
          kind: "flashcard",
          context: "Subtle bug",
          front:
            "You crash on `response.content[0].text` even though stop_reason was end_turn last time. What changed?",
          back:
            "On a tool_use turn, content[0] is a ToolUseBlock with .name/.input/.id, not a TextBlock with .text. Always check stop_reason (or block.type) before accessing .text.",
        },
        {
          kind: "flashcard",
          context: "agent failure modes",
          front:
            "Logs show 3+ consecutive turns with identical (tool_name, input). Diagnosis?",
          back:
            "Same-tool-same-input loop. Add detect_repetition guard (§14) so the loop sends an is_error=True tool_result after the third repeat, forcing Claude to break the pattern.",
        },
        {
          kind: "flashcard",
          context: "agent failure modes",
          front:
            "Cost-per-run is climbing week over week. Most likely root cause?",
          back:
            "History bloat — tool_result payloads getting larger, or longer conversations, or both. Apply §12 strategies: shrink at source, windowed pruning, summarize early turns.",
        },
        {
          kind: "flashcard",
          context: "agent failure modes",
          front:
            "Quality regression after adding the 13th tool to an agent. Diagnosis?",
          back:
            "Tool fatigue (>~12 tools). Routing accuracy drops as toolbox grows. Fix: split into specialist agents by domain with a router agent on top; keep per-agent toolbox ≤ ~8.",
        },
        {
          kind: "flashcard",
          context: "agent failure modes",
          front:
            "Agent calls many *different* tools across many turns but never end_turns. Diagnosis?",
          back:
            "No-progress loop. Usually missing tool ('if only it had X') or a tool whose description doesn't say what to do on empty results. Add the missing tool or update descriptions to handle empties explicitly.",
        },
      ],
    },

    // ================================================================
    // 21. API quick reference
    // ================================================================
    {
      title: "API quick reference",
      blocks: [
        {
          kind: "method_ref",
          title: "tool_choice values",
          importLine: "# Passed as tool_choice= to messages.create",
          methods: [
            {
              signature: '{"type": "auto"}',
              description:
                "Default. Claude may call any tool or none — picks freely. Use for genuine agents and chatty UX.",
            },
            {
              signature: '{"type": "any"}',
              description:
                "Claude must call some tool, can pick which. Use when you need a tool call but flexibility on which (e.g. classification flow).",
            },
            {
              signature: '{"type": "tool", "name": "..."}',
              description:
                "Claude must call this specific tool. Use for forced structured output or single-action workflows.",
            },
            {
              signature: '{"type": "none"}',
              description:
                "Claude may not call any tool, even if tools are defined. Useful for finalizer turns where you want text only.",
            },
            {
              signature: 'disable_parallel_tool_use: bool = False',
              description:
                "Optional sibling field. Set True to force one tool call per response (serial dispatch). Default False allows parallel tool calls.",
            },
          ],
        },
        {
          kind: "method_ref",
          title: "tool_result block shape",
          importLine: '# Inside a user message: {"role": "user", "content": [<tool_result blocks>]}',
          methods: [
            {
              signature: '"type": "tool_result"',
              description:
                "Required. Identifies the block as a tool result.",
            },
            {
              signature: '"tool_use_id": str',
              description:
                "Required. Must equal the .id of the corresponding ToolUseBlock from the previous assistant turn.",
            },
            {
              signature: '"content": str | list[content block]',
              description:
                "Required. Either a string (typically json.dumps of the result) or a list of content blocks (for multimodal results like images).",
            },
            {
              signature: '"is_error": bool = False',
              description:
                "Optional. Set True to signal tool failure — Claude will treat the result as an error and adjust accordingly.",
            },
          ],
        },
        {
          kind: "method_ref",
          title: "messages.create — essential params for agent loops",
          importLine: "client.messages.create(...)",
          methods: [
            {
              signature: 'model: str',
              description:
                "Required. Use claude-sonnet-4-5 for most agents; claude-opus-4-5 for tricky reasoning; claude-haiku-4-5 for cheap routing.",
            },
            {
              signature: 'max_tokens: int',
              description:
                "Required. Cap on output per turn. Set high enough to fit one tool_use + reasoning (1024 is a safe default for most tools).",
            },
            {
              signature: 'tools: list[dict]',
              description:
                "List of tool definitions. Repeated identically on every turn of the loop; consider prompt caching for large tool sets (see streaming-prompt-caching guide).",
            },
            {
              signature: 'tool_choice: dict',
              description:
                "How Claude picks tools. See the tool_choice reference card above.",
            },
            {
              signature: 'messages: list[dict]',
              description:
                "Full conversation history. Includes prior assistant turns (with tool_use blocks) and user turns (with tool_result blocks).",
            },
            {
              signature: 'system: str',
              description:
                "Optional system prompt — where your routing policy and behavioral instructions live. Repeated on every turn.",
            },
            {
              signature: 'response.stop_reason: str',
              description:
                'One of "end_turn", "tool_use", "max_tokens", "stop_sequence". The loop continues while stop_reason == "tool_use".',
            },
            {
              signature: 'response.usage.input_tokens / .output_tokens',
              description:
                "Per-turn token usage. Aggregate across iterations for cost-per-run metrics and budget checks.",
            },
            {
              signature: 'response.id',
              description:
                "Per-turn request id. Chain across iterations in your logs to make support tickets replayable.",
            },
          ],
        },
      ],
    },

    // ================================================================
    // 22. What to practice next
    // ================================================================
    {
      title: "What to practice next",
      blocks: [
        {
          kind: "prose",
          markdown: `You now have the full agent-engineering toolbox:

**Tool design (§5-9)**
- Descriptions that route correctly (verb-led, return-shape-aware, contrast-aware).
- Schemas that lock in valid shapes (enum, pattern, bounds, per-field description).
- Right-sized tools (one verb per tool; ~8 tools per agent).
- Tool dependencies encoded in descriptions and system prompts.
- Dispatch tables, not if/elif sprawl.

**Production loop engineering (§10-15)**
- Hardened skeleton with all guards (max_iters, budget, validation, is_error, structured logging).
- Pydantic validation at the tool boundary with retry-with-feedback.
- Context management (shrink at source, windowed pruning, summarization).
- Per-iteration observability (run_id, request_id chain, structured JSON logs).
- Failure-mode fingerprints (same-tool-same-input, no-progress, fatigue, bloat).
- Three-category testing (loop-logic mocks, handler units, golden traces).

**Real agent patterns (§16-18)**
- RAG, code-review, ticket-triage walkthroughs.

**Where to go from here**

- **Messages API guide** — the API-level reference; §11 (prefill), §17 (parallel dispatch with asyncio.gather), §18 (extended thinking) extend this guide's content.
- **Streaming & prompt caching guide** — needed for low-latency chat agents and for caching large tool definitions across a conversation.
- **Batch API guide** — for non-real-time workloads, batch is 50% cheaper. Note: batch and agent loops don't mix cleanly (each agent turn is a separate request); use batch for the *outer* loop over many independent tickets, not for the inner agent loop.
- **Error handling & retries guide** — wire-level reliability layered under your agent loop.
- **Pydantic v2 fundamentals** — the type system underneath every validated tool boundary.
- **Testing pytest fixtures & mocking** — the mocking mechanics the §15 scripted-mock tests build on.

Build one real agent end-to-end (the triage agent in §18 is a good starter): tool design → production loop → tests → logs → eval on 20 hand-labeled tickets. Then iterate on whichever layer is weakest. That's how agent engineering compounds.`,
        },
      ],
    },

  ],
};
