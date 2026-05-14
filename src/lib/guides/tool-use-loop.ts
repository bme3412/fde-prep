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
          markdown: `If you've worked through the **Messages API & structured output** guide you've already seen tool use as a way to force structured JSON. This guide is about the *other* job tools do: **calling real functions and feeding their results back to Claude in a loop**.

The pattern looks like this:

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

This is the primitive behind every "Claude does research", "Claude books a meeting", "Claude queries the database" feature. Get this loop right and most of agent design is just choosing which tools to expose.

> **Heads up — the runnable cells in this guide use a built-in mock of the \`anthropic\` SDK.** Tool definitions, the loop, parallel calls, error handling — all of that executes exactly as in production. The model's reply is rule-based, so you can run code without an API key.`,
        },
        {
          kind: "key_insight",
          label: "The loop invariant",
          insight: `Keep calling \`messages.create()\` and processing tool calls **as long as \`stop_reason == "tool_use"\`**. The first response with \`stop_reason == "end_turn"\` is your final answer. Everything else in agent design is layered on top of this single rule.`,
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

The \`description\` is the most important field. Claude reads it to decide *when* to call the tool. Vague descriptions cause the wrong tool to fire (or the right one not to fire). Treat the description like an internal API doc — say what the tool does, what it returns, and any quirks.`,
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
            "When two tools have overlapping surface area, the description is the only signal Claude has to disambiguate. Make each description specific: what data source it hits, what shape the result takes, when to prefer it over the alternative.",
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
    // 4. Building tool_result messages correctly
    // ================================================================
    {
      title: "Building tool_result messages correctly",
      blocks: [
        {
          kind: "prose",
          markdown: `Once you've executed the tool, you need to send the result back. There are three rules people get wrong:

1. The tool result goes in a **user** message (not assistant, not a new "tool" role).
2. The content of that user message is a **list** containing one \`tool_result\` block per tool call.
3. The \`tool_use_id\` field on each \`tool_result\` must match the \`.id\` of the corresponding \`ToolUseBlock\`.

Also: before sending the tool_result, you must append the **previous assistant turn** (with its tool_use blocks) to the messages list. The conversation history must be complete — the API rejects an orphan tool_result with no preceding tool_use.`,
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
          explanation: `Notice the role of the tool result is \`"user"\` even though *we* produced it. From Claude's view of the conversation, the tool's output is "the world responding" — and the world speaks through the user role. The \`tool_use_id\` links the result back to the specific call so Claude knows which tool the data is for (critical when there are parallel calls).`,
        },
        {
          kind: "flashcard",
          context: "tool_result wiring",
          front: "What role does a tool_result message have?",
          back: '"user" — even though your code produced the result. The Messages API has only "user" and "assistant" roles; the tool result lives in a list inside a user message.',
        },
        {
          kind: "flashcard",
          context: "tool_result wiring",
          front:
            "What field links a tool_result back to the tool call it answers?",
          back:
            "tool_use_id, which must equal the .id of the corresponding ToolUseBlock from the previous assistant turn.",
        },
        {
          kind: "flashcard",
          context: "tool_result wiring",
          front:
            "Before sending a tool_result, what other message must be appended to the messages list?",
          back:
            "The full assistant turn that contained the tool_use block. The history must be complete — the API rejects orphan tool_results.",
        },
      ],
    },

    // ================================================================
    // 5. Parallel tool calls
    // ================================================================
    {
      title: "Parallel tool calls",
      blocks: [
        {
          kind: "prose",
          markdown: `A single response can contain **multiple \`tool_use\` blocks**. When the user asks "What's AAPL's price and the weather in Boston?", Claude doesn't need to do those serially — it can request both tools in one round and let your code execute them in parallel.

The implication for your loop: don't assume \`content[0]\` is the only tool call. Iterate over every block, run each tool, and bundle **all** the results into a single \`user\` message before the next API call.`,
        },
        {
          kind: "code_predict",
          runnable: true,
          label: "two tool calls in one response",
          code: `import anthropic

client = anthropic.Anthropic()

tools = [
    {
        "name": "get_weather",
        "description": "Get weather for a city",
        "input_schema": {
            "type": "object",
            "properties": {"city": {"type": "string"}},
            "required": ["city"],
        },
    },
    {
        "name": "lookup_stock_price",
        "description": "Get the latest price for a ticker",
        "input_schema": {
            "type": "object",
            "properties": {"ticker": {"type": "string"}},
            "required": ["ticker"],
        },
    },
]

response = client.messages.create(
    model="claude-sonnet-4-5", max_tokens=1024,
    tools=tools,
    messages=[{"role": "user",
               "content": "What is the AAPL stock price and the weather in Boston?"}],
)

print(len(response.content))
for block in response.content:
    print(block.name, block.input)`,
          output: `2
get_weather {'city': 'Boston'}
lookup_stock_price {'ticker': 'AAPL'}`,
          explanation: `The response carries two ToolUseBlocks. Your code must walk the list, execute each tool, and append a single user message whose content is a list of *both* tool_result blocks. Splitting them across two user messages will be rejected — the API expects each assistant turn's tool_use blocks to be answered in the very next user turn.`,
        },
        {
          kind: "code_comparison",
          label: "wrong vs right: bundling results",
          left: {
            title: "Wrong — one user message per tool",
            code: `for block in r.content:
    if block.type == "tool_use":
        result = run(block.name, block.input)
        # ❌ each tool_result in its own user message
        messages.append({"role": "user", "content": [{
            "type": "tool_result",
            "tool_use_id": block.id,
            "content": result,
        }]})`,
            annotation:
              "API rejects this: roles must alternate, and parallel tool_use blocks must all be answered in one user turn.",
          },
          right: {
            title: "Right — bundle all results",
            code: `tool_results = []
for block in r.content:
    if block.type == "tool_use":
        result = run(block.name, block.input)
        tool_results.append({
            "type": "tool_result",
            "tool_use_id": block.id,
            "content": result,
        })
messages.append({"role": "user", "content": tool_results})`,
            annotation:
              "One user message with a list of tool_result blocks — one per tool_use in the previous assistant turn.",
          },
          takeaway:
            "Parallel tool calls = one assistant turn with N tool_use blocks → one user turn with N tool_result blocks. Don't break that 1:1 turn structure.",
        },
      ],
    },

    // ================================================================
    // 6. tool_choice: auto vs any vs forced
    // ================================================================
    {
      title: "tool_choice: auto, any, or forced",
      blocks: [
        {
          kind: "prose",
          markdown: `By default Claude decides whether a tool is needed. Sometimes you want to **force** the decision:

- \`{"type": "auto"}\` — default. Claude may answer directly or call a tool.
- \`{"type": "any"}\` — Claude must call *some* tool, but can pick which.
- \`{"type": "tool", "name": "..."}\` — Claude must call this specific tool.

Use \`auto\` for genuine agents (Claude picks). Use \`any\` when you want a tool call no matter what (e.g. classification flow). Use forced when you're using tools purely for structured output and the function call is decorative.`,
        },
        {
          kind: "code_predict",
          runnable: true,
          label: "forcing a specific tool",
          code: `import anthropic
client = anthropic.Anthropic()

tools = [{
    "name": "extract_person",
    "description": "Extract a person's name and age from text",
    "input_schema": {
        "type": "object",
        "properties": {
            "name": {"type": "string"},
            "age": {"type": "integer"},
        },
        "required": ["name", "age"],
    },
}]

response = client.messages.create(
    model="claude-sonnet-4-5", max_tokens=1024,
    tools=tools,
    tool_choice={"type": "tool", "name": "extract_person"},
    messages=[{"role": "user",
               "content": "Tell me about someone interesting."}],
)
print(response.stop_reason)
print(response.content[0].name)
print(list(response.content[0].input.keys()))`,
          output: `tool_use
extract_person
['name', 'age']`,
          explanation: `Even though the user prompt didn't mention "extract" or any tool keyword, \`tool_choice\` forced Claude to call \`extract_person\`. The returned \`.input\` dict has all the schema-required keys filled in. This is the standard recipe for "guaranteed structured output".`,
        },
        {
          kind: "flashcard",
          context: "tool_choice",
          front:
            "You're building a sentiment classifier and want every call to return a structured verdict. Which tool_choice value?",
          back:
            '{"type": "tool", "name": "<your_classifier>"} — force the specific tool every time so you never get free-form text back.',
        },
        {
          kind: "flashcard",
          context: "tool_choice",
          front:
            "You have three tools and want Claude to use exactly one of them but can pick which. Which tool_choice value?",
          back:
            '{"type": "any"} — must use a tool, free choice of which.',
        },
      ],
    },

    // ================================================================
    // 7. Errors inside tools
    // ================================================================
    {
      title: "Errors inside tools",
      blocks: [
        {
          kind: "prose",
          markdown: `Tools fail. The database is down, the ticker doesn't exist, the user asked for a city the API doesn't know. **Don't raise** — Claude can't see your stack trace and you'll just kill the loop.

Instead: catch the error and return it as the tool_result \`content\`, ideally as JSON with an \`error\` field. You can also set \`is_error: true\` on the tool_result block to flag it explicitly. Claude will see the error and either retry with different arguments, ask the user a clarifying question, or admit defeat gracefully.`,
        },
        {
          kind: "code_predict",
          runnable: true,
          label: "returning an error as tool_result",
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

def safe_get_weather(city):
    try:
        if city == "Atlantis":
            raise LookupError("city not found")
        return json.dumps({"city": city, "temp_f": 72})
    except Exception as e:
        # Return the error to Claude instead of raising
        return json.dumps({"error": str(e), "city": city})

messages = [{"role": "user", "content": "Weather in Atlantis?"}]
r1 = client.messages.create(
    model="claude-sonnet-4-5", max_tokens=1024,
    tools=tools, messages=messages,
)
tool_block = r1.content[0]
result = safe_get_weather(**tool_block.input)
messages.append({"role": "assistant", "content": r1.content})
messages.append({"role": "user", "content": [{
    "type": "tool_result",
    "tool_use_id": tool_block.id,
    "content": result,
    "is_error": True,
}]})

r2 = client.messages.create(
    model="claude-sonnet-4-5", max_tokens=1024,
    tools=tools, messages=messages,
)
print(r2.stop_reason)
print(r2.content[0].text)`,
          output: `end_turn
Final answer based on tool results: {"error": "city not found", "city": "Atlantis"}`,
          explanation: `The tool failure was *handled*: we returned a JSON payload describing the error. Claude saw the error in the next turn and produced a final answer instead of looping forever or crashing. The \`is_error: true\` hint tells Claude this wasn't a normal response so it's more likely to apologize / clarify rather than treat the data as fact.`,
        },
        {
          kind: "key_insight",
          label: "Don't raise inside the tool — return the error",
          insight: `Raising an exception kills *your* process. Returning an error as JSON keeps the loop alive, gives Claude visibility into what happened, and lets it choose a recovery strategy. This is the same principle as returning HTTP 4xx/5xx instead of crashing the server.`,
        },
      ],
    },

    // ================================================================
    // 8. Termination & safety
    // ================================================================
    {
      title: "Termination & safety: don't trust the loop to stop",
      blocks: [
        {
          kind: "prose",
          markdown: `In production your loop should always have:

1. **A max-iterations cap.** Even with good prompts and good tools, models can occasionally get stuck in a tool-calling loop (e.g. retrying the same query with slightly different args). Cap iterations at 5–20 depending on the task and break with a useful error.
2. **A timeout** on each tool execution. One slow tool shouldn't pin the whole agent.
3. **Per-tool argument logging.** When the loop misbehaves you'll want to see what Claude tried.
4. **A budget check** if cost matters. Each iteration is another API call; runaway loops cost real money.

The simplest safety net is a counter:

\`\`\`python
for _ in range(MAX_ITERATIONS):
    response = client.messages.create(...)
    if response.stop_reason == "end_turn":
        return response.content[0].text
    # ... process tool calls and append tool_result ...
raise RuntimeError("agent did not converge within iteration limit")
\`\`\``,
        },
        {
          kind: "code_predict",
          runnable: true,
          label: "the full loop with a max-iterations guard",
          code: `import anthropic, json

client = anthropic.Anthropic()

tools = [{
    "name": "get_weather",
    "description": "Get weather",
    "input_schema": {
        "type": "object",
        "properties": {"city": {"type": "string"}},
        "required": ["city"],
    },
}]

def get_weather(city):
    return json.dumps({"city": city, "temp_f": 72})

def run_agent(prompt, max_iters=5):
    messages = [{"role": "user", "content": prompt}]
    for i in range(max_iters):
        r = client.messages.create(
            model="claude-sonnet-4-5", max_tokens=1024,
            tools=tools, messages=messages,
        )
        if r.stop_reason == "end_turn":
            return r.content[0].text

        messages.append({"role": "assistant", "content": r.content})
        results = []
        for block in r.content:
            if block.type == "tool_use":
                results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": get_weather(**block.input),
                })
        messages.append({"role": "user", "content": results})
    return "(hit max iterations)"

print(run_agent("Weather in Tokyo?"))`,
          output: `Final answer based on tool results: {"city": "Tokyo", "temp_f": 72}`,
          explanation: `This is the canonical loop shape. Note the \`for _ in range(max_iters)\` instead of \`while True\` — even if something breaks, you're guaranteed to exit. The early \`return\` on \`end_turn\` is the only happy-path exit; the post-loop \`return\` is the safety valve.`,
        },
        {
          kind: "warm_up",
          title: "loop bound",
          prompt:
            "Why is `for _ in range(N)` preferred over `while True` for the agent loop?",
          answer:
            "Hard upper bound on iterations — the loop cannot run forever even if stop_reason logic has a bug.",
          explanation:
            "while True relies on stop_reason transitioning to end_turn. If the model keeps requesting tools (or you have a bug that prevents detecting end_turn), the loop runs until something else kills the process. A bounded for-loop fails fast.",
        },
      ],
    },

    // ================================================================
    // 9. Streaming with tool use
    // ================================================================
    {
      title: "Streaming with tool use",
      blocks: [
        {
          kind: "prose",
          markdown: `For chatbot-style UX you'll want streaming. The streaming API yields *events* (text deltas, tool_use deltas, message stop) instead of returning one complete \`Message\`. The tool-use loop still applies, but you assemble the final \`tool_use\` block by accumulating the input JSON across deltas.

Practical guidance:
- Use \`messages.stream()\` when you're showing tokens live to the user.
- Use plain \`messages.create()\` when you're inside a backend agent and only care about the final structured result. Streaming adds complexity without payoff if no human is watching the tokens.
- Either way the **shape of the loop is identical** — call → check stop_reason → handle tool calls → call again.`,
        },
        {
          kind: "flashcard",
          context: "streaming vs non-streaming in agents",
          front:
            "You're writing a backend evaluation harness that fires 1000 tool-using prompts. Stream or not?",
          back:
            "Don't stream. No human is watching tokens; streaming just adds event-handling overhead and complicates the loop. Use messages.create() and process the final Message.",
        },
        {
          kind: "flashcard",
          context: "streaming vs non-streaming in agents",
          front:
            "You're building a chat UI where Claude's reasoning should appear live. Stream or not?",
          back:
            "Stream. Use messages.stream() and yield text deltas to the UI. When the stream ends, check the final stop_reason and decide whether to enter another loop iteration for tool calls.",
        },
      ],
    },

    // ================================================================
    // 10. End-to-end mini-challenge: research agent
    // ================================================================
    {
      title: "Mini-challenge: a small research agent",
      blocks: [
        {
          kind: "prose",
          markdown: `Time to put it together. Build a tiny research agent with two tools: one to search for documents matching a query, one to read a specific document by id. The agent should be able to chain them — search first, pick a result, read it, then answer.`,
        },
        {
          kind: "mini_challenge",
          title: "Research agent",
          prompt: `Implement \`research_agent(question: str) -> str\` that:

1. Defines two tools:
   - \`search_docs(query: str) -> list[{id, title}]\` — returns matching docs
   - \`read_doc(doc_id: str) -> str\` — returns the full text of one doc
2. Runs the tool-use loop with a \`max_iters\` cap of 8
3. Returns Claude's final text answer

Use any fake data for the tools. Bundle parallel tool calls correctly. Handle the case where the loop hits \`max_iters\` without converging.`,
          hints: [
            "Your while/for loop body has three parts: (1) call API, (2) early return if stop_reason is end_turn, (3) execute every tool_use block in the response and append one user message with all results.",
            "Define a small dispatch dict like `{'search_docs': search_docs, 'read_doc': read_doc}` so you don't write a long if/elif chain inside the loop.",
            "Remember to append the assistant turn (with response.content) before appending the user turn with tool_results, otherwise the API will reject the next call.",
          ],
          solution: `import anthropic, json

client = anthropic.Anthropic()

DOCS = {
    "doc-1": "The tool-use loop terminates when stop_reason is end_turn.",
    "doc-2": "Parallel tool calls must be answered in one user message.",
    "doc-3": "Errors inside tools should be returned, not raised.",
}

def search_docs(query: str):
    hits = [
        {"id": doc_id, "title": text[:40]}
        for doc_id, text in DOCS.items()
        if query.lower() in text.lower()
    ]
    return json.dumps(hits or list(DOCS.items())[:1])

def read_doc(doc_id: str):
    return json.dumps({"doc_id": doc_id, "text": DOCS.get(doc_id, "(not found)")})

DISPATCH = {"search_docs": search_docs, "read_doc": read_doc}

tools = [
    {
        "name": "search_docs",
        "description": "Search the docs corpus for a query string. Returns a list of {id, title}.",
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
    },
    {
        "name": "read_doc",
        "description": "Read the full text of a specific document by id.",
        "input_schema": {
            "type": "object",
            "properties": {"doc_id": {"type": "string"}},
            "required": ["doc_id"],
        },
    },
]

def research_agent(question: str, max_iters: int = 8) -> str:
    messages = [{"role": "user", "content": question}]
    for _ in range(max_iters):
        r = client.messages.create(
            model="claude-sonnet-4-5", max_tokens=1024,
            tools=tools, messages=messages,
        )
        if r.stop_reason == "end_turn":
            return r.content[0].text

        messages.append({"role": "assistant", "content": r.content})
        results = []
        for block in r.content:
            if block.type == "tool_use":
                fn = DISPATCH[block.name]
                results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": fn(**block.input),
                })
        messages.append({"role": "user", "content": results})

    return "Agent did not converge within iteration limit"`,
          takeaway:
            "Every production agent — RAG, code reviewer, ticket triager, browsing assistant — is this same loop with different tools. Once the dispatch + tool_result + max_iters skeleton is solid, you swap tools without touching the loop.",
        },
      ],
    },

    // ================================================================
    // 11. Common bugs and how to spot them
    // ================================================================
    {
      title: "Common bugs and how to spot them",
      blocks: [
        {
          kind: "prose",
          markdown: `Most tool-loop bugs show up as one of three failure modes: the API rejects your request, the loop never terminates, or Claude ignores your tool entirely. The flashcards below cover the bugs that account for ~80% of debugging time.`,
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
            "Your loop runs forever — Claude keeps requesting the same tool with the same args. Likely cause?",
          back:
            "You're sending back tool_results that don't actually answer the question (e.g. always returning the same empty list). Claude retries assuming the tool will eventually return useful data. Add max_iters and inspect the tool_results being sent.",
        },
        {
          kind: "flashcard",
          context: "Tool ignored",
          front:
            "Claude responds with text instead of calling your tool, even though the tool is clearly relevant. Likely cause?",
          back:
            "The tool description is too vague or the input_schema is too loose. Tighten the description ('use this when X', 'returns Y'). If it still ignores the tool, set tool_choice to {'type': 'any'} or the specific tool to force it.",
        },
        {
          kind: "flashcard",
          context: "Subtle bug",
          front:
            "You crash on `response.content[0].text` even though stop_reason was end_turn last time. What changed?",
          back:
            "On a tool_use turn, content[0] is a ToolUseBlock with .name/.input/.id, not a TextBlock with .text. Always check stop_reason (or block.type) before accessing .text.",
        },
      ],
    },

    // ================================================================
    // 12. What to practice next
    // ================================================================
    {
      title: "What to practice next",
      blocks: [
        {
          kind: "prose",
          markdown: `You now have the full agent skeleton:

- Tool definition (name, description, input_schema)
- The loop invariant (call while \`stop_reason == "tool_use"\`)
- tool_result wiring (user role, list, tool_use_id matching)
- Parallel tool calls bundled into one user turn
- \`tool_choice\` for forcing structure
- Errors returned, not raised
- Bounded iterations as a safety valve

Where to go from here:

- **Streaming & prompt caching** — needed for low-latency chat agents and for caching tool definitions across a conversation.
- **Batch API** — when you have thousands of tool-use prompts, batch is 50% cheaper.
- **Observability** — log every iteration's tool calls and arguments. When agents misbehave in production, you need to be able to replay the loop.
- **Eval harnesses** — write golden traces of (prompt → expected tool sequence → expected final answer) and run them on every model upgrade.`,
        },
      ],
    },
  ],
};
