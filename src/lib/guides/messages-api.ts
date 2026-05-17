import type { StudyGuide } from "../guide-types";

export const messagesApiGuide: StudyGuide = {
  topicTitle: "Messages API & structured output",
  topicSlug: "messages-api-structured-output",
  sections: [
    // ================================================================
    // 1. Your first API call
    // ================================================================
    {
      title: "Your first API call",
      blocks: [
        {
          kind: "prose",
          markdown: `The Anthropic Python SDK gives you one main method: \`client.messages.create()\`. Give it a model name, a max-token budget, and a list of messages. You get back a \`Message\` object.

\`\`\`python
import anthropic

client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env

message = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=1024,
    messages=[
        {"role": "user", "content": "What is 2 + 2?"}
    ],
)
\`\`\`

Three required parameters. That's it. Everything else — tools, system prompt, temperature, streaming, extended thinking — is optional and layered on top.`,
        },
        {
          kind: "scenario_predict",
          label: "what does the response look like?",
          scenario: `{
  "id": "msg_01XFDUDYJgAACzvnptvVoYEL",
  "type": "message",
  "role": "assistant",
  "content": [
    { "type": "text", "text": "2 + 2 = 4." }
  ],
  "model": "claude-sonnet-4-5",
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": { "input_tokens": 14, "output_tokens": 11 }
}`,
          language: "json",
          question: "Where in this JSON is the actual text of Claude's answer?",
          answer: 'content[0].text — it\'s "2 + 2 = 4."',
          explanation:
            "The response content is always a list of content blocks. For a plain text answer there's one block with type 'text'. In the Python SDK you access it as `message.content[0].text`.",
        },
        {
          kind: "key_insight",
          label: "Content is always a list",
          insight: `Claude's response \`content\` is always a **list of blocks**, not a plain string. Even for a one-sentence answer it's \`[{type: "text", text: "..."}]\`. This matters because when Claude uses tools or extended thinking, the same content list can contain multiple blocks of different types.`,
        },
        {
          kind: "warm_up",
          title: "extracting the text",
          prompt:
            "You have a response stored in `message`. Write the Python expression to get Claude's answer as a string.",
          answer: "message.content[0].text",
          explanation:
            "The SDK returns typed objects, so you access content as a list and read the `.text` attribute of the first block.",
        },
      ],
    },

    // ================================================================
    // 2. The three required parameters
    // ================================================================
    {
      title: "The three required parameters",
      blocks: [
        {
          kind: "prose",
          markdown: `Every \`messages.create()\` call needs exactly three things:

**\`model\`** — which Claude to use. As of late 2025 the live IDs are:
- \`"claude-haiku-4-5"\` — fast and cheap; classification, extraction, high-volume batch jobs
- \`"claude-sonnet-4-5"\` — balanced default; agent loops, coding, general reasoning
- \`"claude-opus-4-5"\` — most capable; deep reasoning, complex multi-step agents

**\`max_tokens\`** — the cap on Claude's *generated* tokens. One token ≈ 3/4 of an English word. If Claude hits this limit it stops mid-sentence and \`stop_reason\` becomes \`"max_tokens"\`. Set this **generously** — Claude almost always finishes before the cap via \`end_turn\`.

**\`messages\`** — a list of \`{role, content}\` dicts. Roles strictly alternate between \`"user"\` and \`"assistant"\`. The first message must be \`"user"\`.`,
        },
        {
          kind: "method_ref",
          title: "Current model IDs",
          importLine: "# pick one of these strings for `model=`",
          methods: [
            {
              signature: '"claude-haiku-4-5"',
              description:
                "Smallest, fastest, cheapest. Best for high-volume extraction, classification, simple summarization, retrieval reranking.",
              returns: "~$1 / $5 per MTok input/output",
            },
            {
              signature: '"claude-sonnet-4-5"',
              description:
                "The balanced default. Best for agent loops, coding, general reasoning, RAG over moderate-size docs.",
              returns: "~$3 / $15 per MTok input/output",
            },
            {
              signature: '"claude-opus-4-5"',
              description:
                "Most capable. Best for hard reasoning, long-horizon agents, code review, research planning.",
              returns: "~$15 / $75 per MTok input/output",
            },
          ],
        },
        {
          kind: "code_predict",
          label: "what happens when max_tokens is too low?",
          code: `import anthropic
client = anthropic.Anthropic()

message = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=10,
    messages=[{"role": "user", "content": "Write a haiku about Python"}],
)

print(message.content[0].text)
print(message.stop_reason)`,
          output: `Sil\nmax_tokens`,
          explanation:
            "With `max_tokens=10` Claude can only emit ~10 tokens before being cut off. The text is truncated and `stop_reason` is `\"max_tokens\"`. That's your signal: response was clipped, not finished. Bump the budget or split the work.",
        },
        {
          kind: "key_insight",
          label: "max_tokens is a cap, not a target",
          insight: `\`max_tokens\` is the **upper bound**, not the expected length. Claude stops as soon as it's done — usually well before the cap, with \`stop_reason="end_turn"\`. Set it high enough that you never hit it on a healthy response. A common choice: 1024 for short answers, 4096 for code, 8192+ for long-form writing.`,
        },
        {
          kind: "warm_up",
          title: "stop_reason check",
          prompt:
            "What are the two most common values of `stop_reason`, and what does each mean?",
          answer:
            '"end_turn" = Claude finished naturally. "max_tokens" = Claude was cut off by the token limit.',
          explanation:
            'A third value you\'ll see constantly in agent code is `"tool_use"` — Claude wants you to call a tool and send back a `tool_result`. Section 4 covers every possible value.',
        },
      ],
    },

    // ================================================================
    // 3. The response object: anatomy of a Message
    // ================================================================
    {
      title: "The response object: anatomy of a `Message`",
      blocks: [
        {
          kind: "prose",
          markdown: `Every \`messages.create()\` call returns a \`Message\` object. Same shape every time, whether you used tools, streaming, or extended thinking. Internalize this shape and the rest of the API stops surprising you.

\`\`\`python
message = client.messages.create(...)

message.id              # "msg_01XF…"  unique per call; log this
message.role            # always "assistant"
message.model           # which model actually ran (good for A/B logging)
message.content         # list[ContentBlock]  — text, tool_use, thinking, …
message.stop_reason     # "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | …
message.stop_sequence   # the literal string that triggered stop_sequence, or None
message.usage           # Usage(input_tokens, output_tokens, cache_*_tokens)
\`\`\`

The \`content\` field is the only one whose shape varies — and it always varies the same way: a list of typed blocks.`,
        },
        {
          kind: "method_ref",
          title: "Message attributes",
          importLine: "from anthropic.types import Message",
          methods: [
            {
              signature: "message.id",
              description:
                "Unique response ID. Log this with every call — it's how Anthropic support traces requests.",
              returns: "str",
            },
            {
              signature: "message.content",
              description:
                "List of content blocks. Iterate and dispatch on `block.type`. Possible types: `text`, `tool_use`, `thinking`, `redacted_thinking`.",
              returns: "list[TextBlock | ToolUseBlock | ThinkingBlock | …]",
            },
            {
              signature: "message.stop_reason",
              description:
                "Why Claude stopped. Drives every branch in your agent loop. Section 4 enumerates all values.",
              returns: 'Literal["end_turn", "max_tokens", "stop_sequence", "tool_use", "pause_turn", "refusal"]',
            },
            {
              signature: "message.usage.input_tokens",
              description:
                "Tokens in your prompt (messages + system + tools). What you pay on the input side.",
              returns: "int",
            },
            {
              signature: "message.usage.output_tokens",
              description:
                "Tokens Claude generated (text + tool_use args + thinking). What you pay on the output side — typically 5× the input price per token.",
              returns: "int",
            },
            {
              signature: "message.model",
              description:
                "The model that actually ran. Sometimes differs subtly from what you asked for (alias resolution). Always log the actual.",
              returns: "str",
            },
          ],
        },
        {
          kind: "code_predict",
          label: "iterating a mixed content list",
          code: `# message.content has both a text block and a tool_use block
for block in message.content:
    if block.type == "text":
        print("TEXT:", block.text)
    elif block.type == "tool_use":
        print("TOOL:", block.name, block.input)
    else:
        print("OTHER:", block.type)`,
          output: `TEXT: Let me look that up for you.\nTOOL: get_weather {'city': 'Paris'}`,
          explanation:
            "Claude can interleave text and tool_use in a single response — common when it narrates ('let me check that') before calling a tool. Never assume `content[0]` is the block you want; iterate and dispatch on `block.type`.",
        },
        {
          kind: "scenario_predict",
          label: "two text blocks in one response",
          scenario: `{
  "content": [
    {"type": "text", "text": "Here are the steps:"},
    {"type": "text", "text": "1. Open the file\\n2. Read the JSON\\n3. Validate"}
  ],
  "stop_reason": "end_turn"
}`,
          language: "json",
          question:
            "If you naively do `message.content[0].text` to display the answer, what does the user see?",
          answer:
            '"Here are the steps:" — you lose the actual steps in the second block.',
          explanation:
            'Always concatenate text blocks: `"".join(b.text for b in message.content if b.type == "text")`. Multiple text blocks are unusual but happen — especially after extended thinking or tool use.',
        },
        {
          kind: "key_insight",
          label: "Iterate, don't index",
          insight: `The content list is **the** thing you iterate. Don't assume one block. Don't assume text-only. The contract is "a list of typed blocks" — anything else is wishful thinking that will break the first time Claude uses a tool, streams, or thinks.`,
        },
      ],
    },

    // ================================================================
    // 4. `stop_reason` decoded
    // ================================================================
    {
      title: "`stop_reason` decoded",
      blocks: [
        {
          kind: "prose",
          markdown: `\`stop_reason\` is the single most important field in the response. It tells you what Claude did and what you need to do next. Every value demands a different branch:

| value | meaning | what you do |
|---|---|---|
| \`"end_turn"\` | Claude finished naturally | Extract text and return |
| \`"max_tokens"\` | Output capped — response is truncated | Raise budget, retry, or split work |
| \`"stop_sequence"\` | Your sentinel string was generated | Read \`message.stop_sequence\` to see which |
| \`"tool_use"\` | Claude wants a tool called | Run dispatch, return \`tool_result\`, loop |
| \`"pause_turn"\` | Long server-tool pause (rare in app code) | Resume the same conversation |
| \`"refusal"\` | Model declined for safety | Surface to user, don't retry blindly |

The single biggest bug in early Anthropic code: treating every response like \`end_turn\` and dropping the \`content[0].text\` straight into the UI. That breaks the moment Claude hits \`max_tokens\` mid-sentence or returns a \`tool_use\` block instead of text.`,
        },
        {
          kind: "method_ref",
          title: "stop_reason — every value, every response",
          importLine: "# message.stop_reason: one of these strings",
          methods: [
            {
              signature: '"end_turn"',
              description:
                "Natural completion. Safe to extract text. The happy path.",
              returns: "extract text → return",
            },
            {
              signature: '"max_tokens"',
              description:
                "Output budget exhausted. The content is truncated — DO NOT parse as JSON or trust as complete.",
              returns: "raise max_tokens → retry or chunk",
            },
            {
              signature: '"stop_sequence"',
              description:
                "Claude generated a string from your `stop_sequences` list. `message.stop_sequence` tells you which.",
              returns: "the stop string is NOT in the content",
            },
            {
              signature: '"tool_use"',
              description:
                "Claude wants you to call a tool. The content list contains one or more `tool_use` blocks. You MUST respond with matching `tool_result` blocks.",
              returns: "dispatch tools → continue loop",
            },
            {
              signature: '"pause_turn"',
              description:
                "Long-running server-side tool turn paused. Send the same messages back to resume. Rare in app code.",
              returns: "resume by re-posting",
            },
            {
              signature: '"refusal"',
              description:
                "Model declined the request on safety grounds. Surface to user; don't auto-retry — likely to refuse again.",
              returns: "show user → don't loop",
            },
          ],
        },
        {
          kind: "scenario_predict",
          label: "max_tokens + JSON parse = silent corruption",
          scenario: `# Claude was asked for a JSON object but hit max_tokens
message.content[0].text == '{"user": "alice", "items": [1, 2, '
message.stop_reason == "max_tokens"

# Caller code:
import json
data = json.loads(message.content[0].text)`,
          language: "python",
          question:
            "What happens, and what's the right defensive code?",
          answer:
            "`json.JSONDecodeError` — the string is a half-finished JSON object. The right defense is to check `stop_reason == \"end_turn\"` BEFORE parsing.",
          explanation:
            'Truncated JSON looks like valid JSON for a few characters and then explodes. The fix: guard every parse with `if message.stop_reason != "end_turn": raise TruncatedResponseError(...)`. Pydantic validation on a tool_use block is a better path anyway — section 14.',
        },
        {
          kind: "scenario_predict",
          label: "tool_use treated like end_turn",
          scenario: `# The user asked "what's the weather?", agent has a get_weather tool
message.content == [ToolUseBlock(name="get_weather", input={"city": "Paris"})]
message.stop_reason == "tool_use"

# Caller code:
return message.content[0].text`,
          language: "python",
          question: "What does the user see, and why?",
          answer:
            "`AttributeError: 'ToolUseBlock' object has no attribute 'text'` — the agent loop never advances and the user sees a crash or empty response.",
          explanation:
            'When `stop_reason == "tool_use"`, the content blocks are `ToolUseBlock`s, not `TextBlock`s. You MUST dispatch the tool, build a `tool_result`, and call `messages.create` again. Section 15 covers the loop.',
        },
        {
          kind: "code_comparison",
          label: "naive vs branch-on-stop_reason",
          left: {
            title: "Naive — assumes happy path",
            code: `def reply(messages):
    msg = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=1024,
        messages=messages,
    )
    return msg.content[0].text`,
            annotation:
              "Crashes on tool_use. Silently returns truncated text on max_tokens. Drops multi-block responses.",
          },
          right: {
            title: "Safe — branch on every stop_reason",
            code: `def reply(messages):
    msg = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=1024,
        messages=messages,
    )
    if msg.stop_reason == "max_tokens":
        raise TruncatedResponse(msg.id)
    if msg.stop_reason == "refusal":
        return "[refused]"
    if msg.stop_reason == "tool_use":
        return run_tool_round(msg, messages)
    # end_turn / stop_sequence — extract text
    return "".join(b.text for b in msg.content if b.type == "text")`,
            annotation:
              "Every branch handled explicitly. No silent data loss. Loop continues on tool_use.",
          },
          takeaway:
            "The safe version is ~10 lines longer and prevents every common production bug. Make a `safe_reply()` helper and use it everywhere.",
        },
        {
          kind: "flashcard",
          context: "stop_reason → action",
          front: "`stop_reason == \"end_turn\"` — what do you do?",
          back: "Extract text from the text blocks. The happy path. `\"\".join(b.text for b in msg.content if b.type == \"text\")`.",
        },
        {
          kind: "flashcard",
          context: "stop_reason → action",
          front: "`stop_reason == \"max_tokens\"` — what do you do?",
          back: "Treat the response as TRUNCATED. Don't parse JSON. Don't display half a sentence to the user. Raise, retry with bigger budget, or chunk the input.",
        },
        {
          kind: "flashcard",
          context: "stop_reason → action",
          front: "`stop_reason == \"tool_use\"` — what do you do?",
          back: "Find every `tool_use` block in `msg.content`, dispatch each to the matching function, return a user message containing one `tool_result` block per tool_use, then call `messages.create` again.",
        },
        {
          kind: "flashcard",
          context: "stop_reason → action",
          front: "`stop_reason == \"stop_sequence\"` — what does `message.stop_sequence` tell you?",
          back: "Which of YOUR `stop_sequences` strings Claude generated. The stop string itself is NOT in the content — you may need to append it back if downstream code expects it.",
        },
        {
          kind: "flashcard",
          context: "stop_reason → action",
          front: "`stop_reason == \"refusal\"` — what do you do?",
          back: "Surface to the user / log. Do NOT auto-retry the same prompt — refusals are deterministic for the same input. Adjust the request or escalate.",
        },
      ],
    },

    // ================================================================
    // 5. System prompts: setting the rules
    // ================================================================
    {
      title: "System prompts: setting the rules",
      blocks: [
        {
          kind: "prose",
          markdown: `A **system prompt** is standing instructions for the whole conversation. It goes in a separate \`system\` parameter — *not* inside the \`messages\` list:

\`\`\`python
message = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=512,
    system="You are a senior Python developer. Always include type hints. Keep explanations under 3 sentences.",
    messages=[{"role": "user", "content": "How do I read a JSON file?"}],
)
\`\`\`

The Anthropic API has only two message roles: \`user\` and \`assistant\`. There is no \`"system"\` role inside \`messages\`. If you're coming from OpenAI's API, this is the single biggest difference.`,
        },
        {
          kind: "code_comparison",
          label: "system as string vs system as list (caching)",
          left: {
            title: "Plain string — fine for short prompts",
            code: `client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=1024,
    system="You are a helpful assistant.",
    messages=[...],
)`,
            annotation:
              "Simple. Works. Not cacheable — re-tokenized on every call.",
          },
          right: {
            title: "List of blocks — enables prompt caching",
            code: `client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=1024,
    system=[
        {
            "type": "text",
            "text": LONG_INSTRUCTIONS,  # 10k+ tokens
            "cache_control": {"type": "ephemeral"},
        },
    ],
    messages=[...],
)`,
            annotation:
              "Required shape for `cache_control`. First call writes the cache; subsequent calls within the TTL pay ~10× less on those tokens.",
          },
          takeaway:
            "Use the string form for short prompts; switch to the list-of-blocks form the moment you want prompt caching. Full caching coverage in the streaming/caching guide.",
        },
        {
          kind: "flashcard",
          context: "API design",
          front: "Where does the system prompt go in `messages.create()`?",
          back: "In the top-level `system=` parameter — a separate argument. NOT inside `messages` as a `{\"role\": \"system\"}` entry; that role doesn't exist in Anthropic's API.",
        },
        {
          kind: "warm_up",
          title: "system prompt placement",
          prompt:
            'True or false: you can put the system prompt inside the messages list with `{"role": "system", "content": "..."}`.',
          answer: "False",
          explanation:
            "Anthropic's API has only `user` and `assistant` roles in `messages`. The system prompt is a top-level parameter. Sending `role: \"system\"` returns a 400 validation error.",
        },
      ],
    },

    // ================================================================
    // 6. Multi-turn conversations
    // ================================================================
    {
      title: "Multi-turn conversations",
      blocks: [
        {
          kind: "prose",
          markdown: `The Messages API is **stateless** — Anthropic does not store your conversation. To carry context across turns, your app maintains a \`messages\` list and sends the *full* history on every call.

\`\`\`python
messages = []

# Turn 1
messages.append({"role": "user", "content": "What's the capital of France?"})
resp = client.messages.create(model="claude-sonnet-4-5", max_tokens=512, messages=messages)
messages.append({"role": "assistant", "content": resp.content})

# Turn 2 — Claude sees turn 1
messages.append({"role": "user", "content": "What's its population?"})
resp = client.messages.create(model="claude-sonnet-4-5", max_tokens=512, messages=messages)
\`\`\`

Note the asymmetry: for the user message, \`content\` is usually a string. For the assistant message you echo back \`resp.content\` (the list of blocks) verbatim. This preserves tool_use, thinking, and citation blocks intact.`,
        },
        {
          kind: "key_insight",
          label: "Strict role alternation",
          insight: `Messages must strictly alternate: **user → assistant → user → assistant**. Two consecutive same-role messages return a 400 error. If you're building history, never append two user turns in a row — concatenate them, or insert an assistant turn between them.

The list must START with a \`user\` message. It usually ENDS with a \`user\` message (the one you want Claude to respond to), except in the prefilling pattern where the last message is a partial \`assistant\` turn.`,
        },
        {
          kind: "code_predict",
          label: "echoing assistant content back into history",
          code: `messages = [{"role": "user", "content": "Roll a d6 for me."}]
resp = client.messages.create(
    model="claude-sonnet-4-5", max_tokens=256, messages=messages,
)
# resp.content is something like [TextBlock(text="I rolled a 4.")]

messages.append({"role": "assistant", "content": resp.content})
messages.append({"role": "user", "content": "Roll again."})

# What does messages look like now?
import json
print(json.dumps([{"role": m["role"], "n_blocks": len(m["content"]) if isinstance(m["content"], list) else 1} for m in messages], indent=2))`,
          output: `[
  {
    "role": "user",
    "n_blocks": 1
  },
  {
    "role": "assistant",
    "n_blocks": 1
  },
  {
    "role": "user",
    "n_blocks": 1
  }
]`,
          explanation:
            "Append `resp.content` (the list of blocks) directly as the assistant's `content`. The SDK's typed blocks serialize correctly. If you instead did `resp.content[0].text` you'd lose any tool_use / thinking blocks Claude returned.",
        },
        {
          kind: "scenario_predict",
          label: "context window overflow",
          scenario: `# Long-running chat agent, no history pruning
messages = [...]  # 500 turns accumulated
messages.append({"role": "user", "content": new_question})

client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=1024,
    messages=messages,
)`,
          language: "python",
          question:
            "What's the failure mode, and what's the standard fix?",
          answer:
            "`anthropic.BadRequestError: prompt is too long` — the cumulative input_tokens exceed the model's context window (~200k for Sonnet 4.5). Standard fix: window the last N turns or summarize earlier turns into a compact `system` block.",
          explanation:
            "History grows linearly. At ~1000 tokens/turn you'll hit the context wall around turn 200. Pattern: keep last K turns verbatim, summarize anything older into a rolling summary you place in `system` or as the first user message.",
        },
        {
          kind: "warm_up",
          title: "message ordering",
          prompt: "Messages must alternate between which two roles?",
          answer: '"user" and "assistant"',
          explanation:
            "The list must start with a user message and alternate strictly. Two same-role messages in a row is a 400. There is no `system` role inside `messages` — that goes in the top-level `system=` parameter.",
        },
      ],
    },

    // ================================================================
    // 7. Prefilling: putting words in Claude's mouth
    // ================================================================
    {
      title: "Prefilling: putting words in Claude's mouth",
      blocks: [
        {
          kind: "prose",
          markdown: `End the \`messages\` list with a **partial assistant message** and Claude will continue from where you left off. This is **prefilling** — a lightweight tool for steering output shape without defining a real tool:

\`\`\`python
message = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=100,
    messages=[
        {"role": "user", "content": "What's 2 + 2? Reply with just the number."},
        {"role": "assistant", "content": "The answer is: "},
    ],
)
# message.content[0].text → "4"  (just the continuation)
\`\`\`

Two notes: (1) Claude does NOT repeat the prefill — \`message.content[0].text\` is everything *after* your prefill. (2) Trailing whitespace in the prefill matters; Claude continues from the exact character you left off.`,
        },
        {
          kind: "code_predict",
          label: "forcing a JSON object with prefill + stop_sequence",
          code: `import anthropic
client = anthropic.Anthropic()

message = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=256,
    stop_sequences=["}"],
    messages=[
        {"role": "user", "content": "Give me a person's first name and age as JSON."},
        {"role": "assistant", "content": "{"},
    ],
)
# Reconstruct the full JSON
full = "{" + message.content[0].text + "}"
print(full)
print(message.stop_reason)`,
          output: `{"name": "Alice", "age": 30}\nstop_sequence`,
          explanation:
            'Prefill `{` to force a JSON object opener; `stop_sequences=["}"]` cuts Claude off after the closing brace. Then concatenate the brackets back. This works for *one-shot* simple shapes — for anything multi-field or nested, tool use + Pydantic (sections 11–14) is dramatically more reliable.',
        },
        {
          kind: "key_insight",
          label: "Prefill concatenates",
          insight: `Prefilling **concatenates** — Claude does NOT repeat the prefill text. If you prefill \`"The answer is: "\`, then \`message.content[0].text\` is just the continuation (e.g. \`"4"\`). If you want the full string, reconstruct it: \`prefill + message.content[0].text\`.

Also: \`stop_reason\` will be whatever ended the generation (\`end_turn\`, \`stop_sequence\`, \`max_tokens\`) — prefilling doesn't change that contract.`,
        },
        {
          kind: "flashcard",
          context: "Quick extraction",
          front:
            "You want Claude to respond with ONLY a letter grade (A/B/C/D/F). How does prefilling guarantee this?",
          back: 'Prefill `{"role": "assistant", "content": "Grade: "}` and set `max_tokens=1`. Claude emits a single token — the letter. `stop_reason` will be `max_tokens` (which is OK here since you intended it).',
        },
      ],
    },

    // ── Section 8 ────────────────────────────────────────────────────────
    {
      title: "Temperature, stop sequences, top_p, top_k",
      blocks: [
        {
          kind: "prose",
          markdown: `Sampling parameters control **how Claude picks the next token**. The defaults are sensible — most FDE work only ever touches \`temperature\` and \`stop_sequences\`. Reach for \`top_p\` / \`top_k\` only when you have a specific reason and a way to measure the impact.

- **\`temperature\`** (0.0–1.0, default 1.0) — lower = more deterministic, higher = more creative. For extraction, classification, code, math: \`0.0\`. For brainstorming, prose: \`0.7\`–\`1.0\`.
- **\`stop_sequences\`** (list of strings, default \`[]\`) — generation halts the moment any sequence appears in the output. Useful for prefilling tricks and homemade structured output.
- **\`top_p\`** (0.0–1.0) — nucleus sampling. Restricts sampling to the smallest set of tokens whose cumulative probability ≥ \`top_p\`.
- **\`top_k\`** (int) — restricts sampling to the top *k* most likely tokens.

Anthropic's published guidance: prefer \`temperature\`; do not combine \`top_p\` and \`top_k\`.`,
        },
        {
          kind: "method_ref",
          title: "Sampling parameters",
          importLine: "client.messages.create(...)",
          methods: [
            {
              signature: "temperature: float = 1.0",
              description:
                "Range 0.0–1.0. 0.0 = greedy/deterministic-ish. Use 0.0 for extraction, code, math. Use 0.7–1.0 for prose.",
            },
            {
              signature: 'stop_sequences: list[str] = []',
              description:
                "Halt generation when any sequence appears. Useful for prefill + structured output tricks. Up to 4 sequences.",
            },
            {
              signature: "top_p: float | None = None",
              description:
                "Nucleus sampling. Smallest token set covering cumulative probability >= top_p. Prefer temperature instead.",
            },
            {
              signature: "top_k: int | None = None",
              description:
                "Sample only from top-k most likely tokens. Rarely needed. Do not combine with top_p.",
            },
          ],
        },
        {
          kind: "scenario_predict",
          label: "temperature=0.0 ≠ deterministic",
          scenario:
            "You set `temperature=0.0` and call the API twice with identical inputs. The outputs differ. Predict why and the right mental model.",
          language: "text",
          question:
            "Why is `temperature=0.0` not a determinism guarantee?",
          answer:
            "`temperature=0.0` produces *greedy* decoding (always pick the highest-probability token), but the underlying floating-point math in GPU kernels is not bit-exact across runs. Tie-breaking, batched inference, and infrastructure routing can all flip a token. Outputs will be *very similar* but not byte-identical. For true reproducibility you need a snapshot or a cached response — not a temperature setting.",
          explanation:
            "FDE consequence: never write tests that assert exact string equality on an API response. Assert structure (e.g. valid JSON, expected fields present, value in expected range) or use a mocked client. Save real-API determinism battles for batch jobs where you snapshot the output.",
        },
        {
          kind: "key_insight",
          label: "Stop sequences are surgical",
          insight: `Use \`stop_sequences\` when you want to cut Claude off at a precise marker — usually combined with prefill. Examples:

- Prefill \`{\`, stop on \`}\` → force a single-line JSON object.
- Prefill \`<analysis>\`, stop on \`</analysis>\` → force a single XML tag's content.
- Stop on \`\\n\\n\` → keep the response to a single paragraph.

The matched sequence is **not included** in the output. \`stop_reason="stop_sequence"\` and \`stop_sequence\` (on the response) tells you which sequence fired.`,
        },
      ],
    },

    // ── Section 9 ────────────────────────────────────────────────────────
    {
      title: "Token budgets, cost math, and `usage`",
      blocks: [
        {
          kind: "prose",
          markdown: `Every \`Message\` response carries a \`usage\` object. Log it. **Always log it.** This is the single most important habit for shipping LLM features without nasty cost surprises.

\`\`\`python
message.usage
# Usage(
#   input_tokens=1234,
#   output_tokens=456,
#   cache_creation_input_tokens=0,
#   cache_read_input_tokens=0,
# )
\`\`\`

**Cost math** (Sonnet 4.5 example pricing — confirm current rates):

| Field | Meaning | Rough $/MTok |
|---|---|---|
| \`input_tokens\` | Prompt tokens billed at input rate | $3 |
| \`output_tokens\` | Generated tokens billed at output rate | $15 |
| \`cache_creation_input_tokens\` | Tokens written into the prompt cache (one-time premium) | $3.75 |
| \`cache_read_input_tokens\` | Tokens served from cache (deep discount) | $0.30 |

**Cost per call** = \`(input × in_rate + output × out_rate) / 1_000_000\`. Output tokens dominate — they're ~5× the input rate.

The FDE rule: log \`usage\` per call, aggregate per request, and alarm on tail (p99 cost, not average). One runaway request can dwarf a day of normal traffic.`,
        },
        {
          kind: "method_ref",
          title: "Usage object",
          importLine: "message.usage  # anthropic.types.Usage",
          methods: [
            {
              signature: "input_tokens: int",
              description:
                "Total prompt tokens billed at the input rate (excludes cache reads).",
            },
            {
              signature: "output_tokens: int",
              description:
                "Tokens generated by the model. Billed at output rate (~5× input). Dominant cost driver.",
            },
            {
              signature: "cache_creation_input_tokens: int",
              description:
                "Tokens written into the prompt cache this call. Billed at ~1.25× input rate (one-time premium).",
            },
            {
              signature: "cache_read_input_tokens: int",
              description:
                "Tokens served from a prior cache write. Billed at ~10% of input rate (deep discount).",
            },
          ],
        },
        {
          kind: "code_predict",
          label: "Log usage per call",
          code: `import anthropic, logging

client = anthropic.Anthropic()
log = logging.getLogger("llm")

def call(messages, **kw):
    msg = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=1024,
        messages=messages,
        **kw,
    )
    log.info(
        "usage in=%d out=%d cache_w=%d cache_r=%d",
        msg.usage.input_tokens,
        msg.usage.output_tokens,
        msg.usage.cache_creation_input_tokens,
        msg.usage.cache_read_input_tokens,
    )
    return msg`,
          output: `# Example log line after one call:
# llm INFO usage in=1234 out=456 cache_w=0 cache_r=0`,
          explanation:
            "The helper wraps every call so usage logging is automatic. From here, ship the logs to your observability stack (Datadog, Honeycomb, etc.) and graph p50/p99 cost per endpoint. You'll catch a 10×-cost regression within hours of deploying it.",
          runnable: false,
        },
        {
          kind: "scenario_predict",
          label: "Cost math",
          scenario:
            "You call Sonnet 4.5 with 4,000 input tokens and 1,000 output tokens. Pricing: $3/MTok input, $15/MTok output. What's the cost?",
          language: "text",
          question: "Cost of one call?",
          answer:
            "Input cost: 4,000 × $3 / 1,000,000 = $0.012. Output cost: 1,000 × $15 / 1,000,000 = $0.015. **Total ≈ $0.027** per call.\n\nScaled: 10,000 such calls per day = $270/day = ~$8,100/month. This is why output length matters — capping `max_tokens` and tightening prompts is a real lever.",
          explanation:
            "Practice this math in your head until it's second nature. Most cost regressions come from: (1) accidentally bumping max_tokens, (2) verbose tool_result blobs that bloat input on every subsequent turn, (3) failing to use prompt caching on large stable prefixes.",
        },
        {
          kind: "key_insight",
          label: "Log usage. Always.",
          insight: `**Log \`usage\` per call. Sum per request. Alarm on tail.**

- Output tokens dominate $/call (5× the input rate).
- Input tokens dominate latency — Time-To-First-Token scales with prompt size, but the prompt cache cuts that dramatically when you use it correctly.
- The single highest-leverage observability you can add is per-call usage logging. Without it, a cost regression hides until your bill arrives.`,
        },
      ],
    },

    // ── Section 10 ───────────────────────────────────────────────────────
    {
      title: "Models: Sonnet 4.5 vs Opus 4.5 vs Haiku 4.5",
      blocks: [
        {
          kind: "prose",
          markdown: `Three live models, very different cost/capability profiles. Picking the wrong one is the most common 10× cost mistake in production LLM apps.

- **Haiku 4.5** — fast, cheap, smaller. Great for: classification, simple extraction, routing, high-volume RAG, lightweight tool use. The "is this in scope?" filter at the edge of your pipeline.
- **Sonnet 4.5** — the balanced default. Great for: agent loops, coding, general reasoning, structured extraction with complex schemas. Start here.
- **Opus 4.5** — most capable, slowest, most expensive. Great for: hard reasoning, multi-step planning, deep code review, long-horizon agentic tasks where mistakes cost more than tokens.

**The promotion rule:** start with Sonnet 4.5. If the task is simple and accuracy is fine, demote to Haiku 4.5 (cost win). If the task is hard and Sonnet is making real mistakes, promote to Opus 4.5 (quality win). Always A/B test against the cheaper tier before committing — the gap between Haiku and Opus is roughly 30×.`,
        },
        {
          kind: "method_ref",
          title: "Model IDs (late 2025)",
          importLine: 'model="claude-..."',
          methods: [
            {
              signature: '"claude-haiku-4-5"',
              description:
                "Fast and cheap (~$1/MTok in, ~$5/MTok out). Classification, routing, high-volume extraction.",
            },
            {
              signature: '"claude-sonnet-4-5"',
              description:
                "Balanced default (~$3/MTok in, ~$15/MTok out). Agent loops, coding, general reasoning.",
            },
            {
              signature: '"claude-opus-4-5"',
              description:
                "Most capable (~$15/MTok in, ~$75/MTok out). Deep reasoning, complex agents, long-horizon tasks.",
            },
          ],
        },
        {
          kind: "multiple_choice",
          title: "Pick the right model",
          prompt:
            "Match each workload to the model you'd ship to production. Multiple workloads — pick the *best fit* for the one described.",
          choices: [
            {
              text: "Workload: sentiment-classify 100k tweets/day → Haiku 4.5",
              correct: true,
              rationale:
                "Cheap, fast, schema is trivial. Haiku is the textbook fit. Sonnet works but you'll pay ~3× for marginal accuracy improvement on a simple task.",
            },
            {
              text: "Workload: multi-step debugging agent that reads stack traces and proposes patches → Sonnet 4.5",
              correct: true,
              rationale:
                "Sonnet is the default for agent loops with real reasoning. Try Opus only if Sonnet's patches are wrong often enough to justify the 5× cost.",
            },
            {
              text: "Workload: one-shot prose summary of a 500-word email → Opus 4.5",
              correct: false,
              rationale:
                "Wildly over-spec'd. Haiku handles this for pennies. Reach for Opus when the task actually needs deep reasoning, not for generic summarization.",
            },
            {
              text: "Workload: long-horizon research agent that plans, executes 50+ tool calls, and synthesizes findings → Opus 4.5",
              correct: true,
              rationale:
                "Long-horizon agentic work with planning is exactly Opus's sweet spot. The per-call premium is dwarfed by the cost of agent mistakes at this complexity.",
            },
          ],
          explanation:
            "Notice the pattern: complexity of reasoning + cost-of-mistake → model choice. A simple, high-volume task with cheap mistakes = Haiku. A nuanced agentic task where wrong = $$$ = Opus. Sonnet covers the middle, which is most production traffic.",
        },
        {
          kind: "key_insight",
          label: "30× gap = always A/B",
          insight: `**The cost gap between Haiku 4.5 and Opus 4.5 is roughly 30×.** That's enough that you should treat model selection as a tunable hyperparameter, not a one-time decision.

For every batch workload, run the same 100 inputs through Haiku, Sonnet, and Opus. Measure: (1) accuracy on a hand-labeled subset, (2) cost per call, (3) p95 latency. Most of the time the answer is "Haiku is good enough" — and that's a 5× cost win over the Sonnet default.`,
        },
      ],
    },

    // ── Section 11 ───────────────────────────────────────────────────────
    {
      title: "Structured output: why tool use is THE answer",
      blocks: [
        {
          kind: "prose",
          markdown: `Here's the honest framing: **Anthropic does not expose an OpenAI-style \`json_schema\` mode.** The structured-output story is tool use. You define a tool whose \`input_schema\` describes the shape you want, force the model to call it with \`tool_choice={"type": "tool", "name": ...}\`, and read \`tool_use.input\` — that block IS your structured output.

Everything else — "please respond with JSON" + \`json.loads(message.content[0].text)\`, regex-extracted code fences, prefill-with-\`{\` tricks — is a downgrade. They work *sometimes*. Tool use works *almost always*, and when it doesn't (rare), you catch it with \`pydantic.ValidationError\` and retry. That's the production pattern.

Why tool use is dramatically more reliable than ask-for-JSON:

1. The schema is *part of the request*, not buried in the prompt. The model is trained heavily on tool-call formatting.
2. The output is structurally guaranteed to be a single \`tool_use\` block with a JSON \`input\` object — no markdown fences, no preamble, no trailing prose.
3. \`stop_reason="tool_use"\` is your unambiguous signal that the call succeeded structurally.
4. Validation closes the loop: \`MyModel.model_validate(tool_use.input)\` gives you a typed Python object.`,
        },
        {
          kind: "code_comparison",
          label: "Ask-for-JSON vs forced tool use",
          left: {
            title: "Naive: ask for JSON, parse text",
            code: `msg = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=1024,
    messages=[{
        "role": "user",
        "content": "Extract name, age as JSON: 'Alice is 30'",
    }],
)
data = json.loads(msg.content[0].text)
#                        ^^^^^^^^^^^^^^^^^^
# Fails when Claude emits markdown fences,
# adds a preamble ("Sure! Here's the JSON:"),
# truncates mid-object on max_tokens, or
# uses single quotes / trailing commas.`,
            annotation:
              "Works ~85–95% of the time depending on model and prompt. The remaining 5–15% fails in ways that look like a model regression but are actually a fragile parsing layer.",
          },
          right: {
            title: "Robust: force tool use, validate input",
            code: `class Person(BaseModel):
    name: str
    age: int

msg = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=1024,
    tools=[{
        "name": "Person",
        "description": "Capture a person.",
        "input_schema": Person.model_json_schema(),
    }],
    tool_choice={"type": "tool", "name": "Person"},
    messages=[{
        "role": "user",
        "content": "Alice is 30",
    }],
)
tool_use = next(b for b in msg.content if b.type == "tool_use")
person = Person.model_validate(tool_use.input)`,
            annotation:
              "Near-zero structural failures. Any drift is caught by `model_validate` — handle it with a retry or fail-loud. This is the FDE-grade pattern.",
          },
          takeaway:
            "Forced tool use + Pydantic validation eliminates an entire class of bugs (parsing, fences, truncation, drift). Use it for every structured-output path.",
        },
        {
          kind: "key_insight",
          label: "The schema is the contract",
          insight: `**The schema you declare in your tool is the contract.** Claude is dramatically more reliable at filling a schema you've declared than at producing JSON that happens to match an undeclared one. Spend the few extra lines to define a Pydantic model + tool — it pays for itself within the first 100 calls.`,
        },
        {
          kind: "scenario_predict",
          label: "Failure rate over 1000 calls",
          scenario:
            "You ship a 'summarize this contract' workload that asks for a JSON object with `{summary, parties, effective_date}`. Two implementations: (A) ask Claude for JSON in the prompt and `json.loads(message.content[0].text)`, (B) define a Pydantic tool and force `tool_choice`. You run 1000 contracts through both.",
          language: "text",
          question:
            "Predict the failure-rate gap between implementation A and implementation B.",
          answer:
            "Implementation A: typically 1–10% structural failures (markdown fences, preamble, truncation, JSON with trailing comma, model adds an extra explanation field, etc.). Implementation B: near-zero structural failures — and the rare ones (a `ValidationError` from a typo in `effective_date`) are caught explicitly, not silently corrupted.\n\nIn production, the difference is real-money: 10–100 manual-review tickets per 1000 contracts vs essentially none.",
          explanation:
            "This is why structured output via tool use is the canonical FDE pattern. The cost is ~10 extra lines of code (a Pydantic model + the tool definition). The benefit is two orders of magnitude fewer downstream parsing bugs.",
        },
      ],
    },

    // ── Section 12 ───────────────────────────────────────────────────────
    {
      title: "The Pydantic → tool schema pipeline (the FDE recipe)",
      blocks: [
        {
          kind: "prose",
          markdown: `The canonical recipe in one diagram:

\`\`\`
Pydantic model  ──model_json_schema()──▶  tool definition
       │                                          │
       │                                          ▼
       │                                  client.messages.create(
       │                                      tools=[...],
       │                                      tool_choice={"type":"tool", "name":...},
       │                                  )
       │                                          │
       │                                          ▼
       └──model_validate(tool_use.input)──◀── tool_use block
                          │
                          ▼
                   typed Python object
\`\`\`

Write the Pydantic model once. Generate the tool schema from it. Validate the model's response with the same model. The model travels with the data — schema drift is impossible because there's only one source of truth.

Put a thin helper in your codebase and never hand-author JSON Schema again.`,
        },
        {
          kind: "code_predict",
          label: "Build a `pydantic_tool` helper",
          code: `from pydantic import BaseModel
from typing import Literal

class Sentiment(BaseModel):
    label: Literal["pos", "neu", "neg"]
    confidence: float

def pydantic_tool(model: type[BaseModel], description: str) -> dict:
    return {
        "name": model.__name__,
        "description": description,
        "input_schema": model.model_json_schema(),
    }

tool = pydantic_tool(Sentiment, "Tag the sentiment of a message.")
print(tool["name"])
print(sorted(tool["input_schema"]["properties"].keys()))
print(tool["input_schema"]["required"])`,
          output: `Sentiment
['confidence', 'label']
['label', 'confidence']`,
          explanation:
            "`pydantic_tool` is the single helper every FDE codebase needs. From here, every structured-output endpoint is three lines: define a model, call the helper, pass it to `tools=[...]`. The schema is generated by Pydantic — including JSON Schema bits like `enum` for `Literal` types and `type: number` for floats.",
          runnable: false,
        },
        {
          kind: "code_comparison",
          label: "Hand-written schema vs generated from Pydantic",
          left: {
            title: "Hand-written tool schema (drifts)",
            code: `tool = {
    "name": "Sentiment",
    "description": "Tag sentiment.",
    "input_schema": {
        "type": "object",
        "properties": {
            "label": {
                "type": "string",
                "enum": ["pos", "neu", "neg"],
            },
            "confidence": {"type": "number"},
        },
        "required": ["label", "confidence"],
    },
}

# Later: add a "rationale" field to the model
# but forget to update the tool schema.
# Production breaks silently.`,
            annotation:
              "Two sources of truth. Every model change is a hand-coordinated schema change. Drift is inevitable — and it's usually caught in production.",
          },
          right: {
            title: "Generated from Pydantic model",
            code: `class Sentiment(BaseModel):
    label: Literal["pos", "neu", "neg"]
    confidence: float

tool = pydantic_tool(Sentiment, "Tag sentiment.")

# Later: add a "rationale" field to the model.
class Sentiment(BaseModel):
    label: Literal["pos", "neu", "neg"]
    confidence: float
    rationale: str   # <-- one line, schema regenerates

# Tool schema, validation, type-checker, IDE
# autocomplete — all updated in one move.`,
            annotation:
              "One source of truth. Schema regenerates on every call. The model is the contract — type-checker and runtime validator both enforce it.",
          },
          takeaway:
            "If you find yourself hand-typing JSON Schema, you've taken a wrong turn. Generate it from the type that owns the contract.",
        },
        {
          kind: "method_ref",
          title: "Pydantic ↔ tool plumbing",
          importLine: "from pydantic import BaseModel",
          methods: [
            {
              signature: "Model.model_json_schema() -> dict",
              description:
                "Returns a JSON Schema dict for the model. Goes directly into tool `input_schema`.",
              returns: "dict (JSON Schema object)",
            },
            {
              signature: "Model.model_validate(data: Any) -> Model",
              description:
                "Validates a dict-or-other into a typed model instance. Raises `ValidationError` on schema drift.",
              returns: "Model instance",
            },
            {
              signature: "Model.model_dump() -> dict",
              description:
                "Inverse: typed model -> plain dict. Useful when round-tripping through JSON or appending to message history.",
              returns: "dict",
            },
            {
              signature: 'tool = {"name", "description", "input_schema"}',
              description:
                "The tool definition shape Anthropic expects in `tools=[...]`. `input_schema` is a JSON Schema dict.",
            },
          ],
        },
        {
          kind: "key_insight",
          label: "One source of truth",
          insight: `**Your Pydantic model is the contract. The tool schema is generated. Validation closes the loop.**

This is the difference between an FDE codebase that scales (one model = one schema = one validator) and one that doesn't (hand-coded schemas drift, validation is ad-hoc, "the API is broken" becomes "the schemas are out of sync"). Adopt the \`pydantic_tool\` helper on day one.`,
        },
      ],
    },

    // ── Section 13 ───────────────────────────────────────────────────────
    {
      title: "Forcing structured output with `tool_choice`",
      blocks: [
        {
          kind: "prose",
          markdown: `\`tool_choice\` controls *whether* and *which* tool Claude calls. It is the difference between "Claude might respond with text" and "Claude WILL call this specific tool."

The four shapes:

| \`tool_choice\` | Behavior |
|---|---|
| \`{"type": "auto"}\` | Default. Model decides whether to call a tool or respond with text. |
| \`{"type": "any"}\` | Model MUST call some tool from the list. |
| \`{"type": "tool", "name": "X"}\` | Model MUST call tool **X**. This is the structured-output hammer. |
| \`{"type": "none"}\` | Model MUST NOT call any tool this turn. |

Plus a sibling flag: \`disable_parallel_tool_use=True\` to forbid Claude from emitting multiple \`tool_use\` blocks in one turn (rare — usually you *want* parallel tool use).`,
        },
        {
          kind: "method_ref",
          title: "`tool_choice` shapes",
          importLine: 'client.messages.create(tool_choice=...)',
          methods: [
            {
              signature: '{"type": "auto"}',
              description:
                "Default. Use for conversational agents where Claude should sometimes respond directly and sometimes call a tool.",
            },
            {
              signature: '{"type": "any"}',
              description:
                "Forces SOME tool call (but Claude picks which). Use when you have multiple tools and want Claude to choose.",
            },
            {
              signature: '{"type": "tool", "name": "Extract"}',
              description:
                "Forces a specific tool. The canonical structured-output choice — guarantees one `tool_use` block named `Extract`.",
            },
            {
              signature: '{"type": "none"}',
              description:
                "Forbids tool use this turn. Useful when you have tools registered but want a text-only follow-up.",
            },
            {
              signature: "disable_parallel_tool_use: bool = False",
              description:
                "When True, Claude emits at most ONE tool_use block per turn. Default False (parallel tool use enabled).",
            },
          ],
        },
        {
          kind: "code_predict",
          label: "Single-tool forced extraction",
          code: `tool = pydantic_tool(Sentiment, "Tag sentiment.")

msg = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=256,
    tools=[tool],
    tool_choice={"type": "tool", "name": "Sentiment"},
    messages=[{"role": "user", "content": "I love this!"}],
)

print(msg.stop_reason)
for b in msg.content:
    print(b.type, getattr(b, "name", None), getattr(b, "input", None))`,
          output: `tool_use
tool_use Sentiment {'label': 'pos', 'confidence': 0.97}`,
          explanation:
            "With a forced single-tool `tool_choice`, the response is guaranteed to be exactly one `tool_use` block with `name='Sentiment'`, and `stop_reason='tool_use'`. There will be no leading text block, no preamble. This is the cleanest contract the Messages API offers.",
          runnable: false,
        },
        {
          kind: "code_comparison",
          label: "`auto` vs forced tool for extraction",
          left: {
            title: "`tool_choice={'type': 'auto'}`",
            code: `# Tool registered but choice is auto.
# Claude might:
#  - call the tool (good)
#  - respond with text ("Sure, here's the sentiment...")
#  - respond with text containing a JSON code fence

for block in msg.content:
    if block.type == "tool_use":
        sentiment = Sentiment.model_validate(block.input)
        break
else:
    # ??? Now what?
    # Fall back to ask-for-JSON parsing?
    # Retry? Fail loud?
    raise RuntimeError("Claude didn't call the tool")`,
            annotation:
              "Fine for conversational agents — bad for extraction. You've reintroduced the ambiguity tool use was supposed to remove.",
          },
          right: {
            title: 'tool_choice={"type": "tool", "name": "Sentiment"}',
            code: `# Forced. Response IS a single tool_use block.
tool_use = next(b for b in msg.content if b.type == "tool_use")
sentiment = Sentiment.model_validate(tool_use.input)
# Done. No fallbacks. No retries-on-format. No regex.`,
            annotation:
              "Guaranteed shape. The only failure modes left are network errors and `ValidationError` (rare — handle them with a retry policy).",
          },
          takeaway:
            "For pure extraction / structured output: always force the specific tool. `auto` is for agents that mix conversation and tool calls.",
        },
        {
          kind: "multiple_choice",
          title: "Pick the right `tool_choice`",
          prompt:
            "For each scenario, pick the best `tool_choice` value.",
          choices: [
            {
              text: 'Structured extraction with one Pydantic model → `{"type": "tool", "name": "Extract"}`',
              correct: true,
              rationale:
                "Single-tool forced choice is THE structured-output hammer. Guarantees one `tool_use` block of the right name.",
            },
            {
              text: 'Conversational customer-support agent with optional `lookup_order` tool → `{"type": "auto"}`',
              correct: true,
              rationale:
                "Most turns are text. Some turns warrant a tool call. `auto` lets Claude decide per turn — exactly what you want.",
            },
            {
              text: 'Agent that MUST call one of three search tools (web, docs, code) but you don\'t know which → `{"type": "any"}`',
              correct: true,
              rationale:
                "`any` forces a tool call but lets Claude pick which one based on the query. Right tool for a router-style agent.",
            },
            {
              text: 'Mid-conversation clarification turn ("Could you ask the user what city they meant?") → `{"type": "tool", "name": "any_tool"}`',
              correct: false,
              rationale:
                "Wrong shape — `{type: tool, name: X}` requires a real tool name. For \"no tools this turn,\" use `{\"type\": \"none\"}`.",
            },
          ],
          explanation:
            "The mental model: `auto` for conversational, `any` for forced-but-flexible routing, `{type: tool, name: X}` for structured extraction, `none` for explicit text-only turns.",
        },
      ],
    },

    // ── Section 14 ───────────────────────────────────────────────────────
    {
      title: "Validating tool input with Pydantic",
      blocks: [
        {
          kind: "prose",
          markdown: `Even with forced tool use, you should *always* validate the \`tool_use.input\` with your Pydantic model. Claude returns valid JSON for your schema **almost always** — but "almost" is not "always," and the failure modes are subtle (a number out of the \`Field(ge=0, le=1)\` range, an enum value that's slightly off, a nested object with a typo).

The full round-trip:

1. \`MyModel\` defines the contract.
2. \`pydantic_tool(MyModel, "...")\` derives the tool definition.
3. \`tool_choice={"type": "tool", "name": "MyModel"}\` forces the call.
4. Extract: \`tool_use = next(b for b in msg.content if b.type == "tool_use")\`.
5. Validate: \`obj = MyModel.model_validate(tool_use.input)\`.
6. On \`ValidationError\`: retry (with feedback), accept-and-clip, or fail-loud — depends on workload.

Validation is your last line of defense. Skip it and you've handed unvetted dict data to downstream code.`,
        },
        {
          kind: "code_predict",
          label: "Full round-trip in one function",
          code: `from pydantic import BaseModel, Field, ValidationError
from typing import Literal
import anthropic

class Sentiment(BaseModel):
    label: Literal["pos", "neu", "neg"]
    confidence: float = Field(ge=0, le=1)

client = anthropic.Anthropic()

def classify(text: str) -> Sentiment:
    msg = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=256,
        tools=[pydantic_tool(Sentiment, "Tag sentiment.")],
        tool_choice={"type": "tool", "name": "Sentiment"},
        messages=[{"role": "user", "content": text}],
    )
    tool_use = next(b for b in msg.content if b.type == "tool_use")
    return Sentiment.model_validate(tool_use.input)  # typed!

sentiment = classify("I love this product!")
print(type(sentiment), sentiment.label, sentiment.confidence)`,
          output: `<class '__main__.Sentiment'> pos 0.97`,
          explanation:
            "After this 15-line function, the rest of the codebase sees `Sentiment` instances — typed, validated, autocomplete-friendly. The boundary between \"raw LLM output\" and \"typed application data\" is one line: `Sentiment.model_validate(tool_use.input)`.",
          runnable: false,
        },
        {
          kind: "scenario_predict",
          label: "Validation catches drift",
          scenario:
            "Your `Sentiment` model has `confidence: float = Field(ge=0, le=1)`. Claude returns `{'label': 'pos', 'confidence': 1.2}`. What happens, and what's the right FDE response?",
          language: "text",
          question: "Failure mode + remedy?",
          answer:
            "`Sentiment.model_validate(tool_use.input)` raises `ValidationError`: `confidence: Input should be less than or equal to 1`.\n\nRemedy options, in increasing tolerance:\n1. **Fail loud** — re-raise and log. Right for low-volume, high-stakes calls.\n2. **Retry with feedback** — send a follow-up message: 'Your tool call had `confidence=1.2`, but the schema requires 0–1. Please retry.' Claude almost always self-corrects on the next attempt.\n3. **Accept-and-clip** — clip to `1.0`, log the drift, move on. Right for high-volume, low-stakes (e.g. sentiment over millions of tweets where 0.0001% drift doesn't matter).",
          explanation:
            "Pick the policy at design time based on the workload. The single worst choice is to skip validation and silently feed `1.2` to downstream code that assumes the contract holds.",
        },
        {
          kind: "key_insight",
          label: "Validation is non-negotiable",
          insight: `**Pydantic validation on tool input is the last line of defense.**

The pipeline — schema → forced tool → validation → typed object — is the boundary between a demo and a production agent. The 1–2 lines of code it costs are the cheapest insurance you'll buy all quarter.`,
        },
      ],
    },

    // ── Section 15 ───────────────────────────────────────────────────────
    {
      title: "Tool use loop: calling real functions",
      blocks: [
        {
          kind: "prose",
          markdown: `Forced tool use is *one* round-trip. A real agent loop is *many* round-trips:

1. You send \`messages\` to the API.
2. If \`stop_reason == "end_turn"\`: done — return the final assistant message.
3. If \`stop_reason == "tool_use"\`: extract *every* \`tool_use\` block in the assistant message, dispatch each to your real function, build the matching \`tool_result\` blocks.
4. Append the assistant message AND a new user message (containing the \`tool_result\` blocks) to history.
5. Call the API again. Go to step 2.

The loop terminates on \`end_turn\` or when you hit your **max-turn cap** (always set one — the model can occasionally call the same tool forever in pathological cases).`,
        },
        {
          kind: "code_predict",
          label: "`run_tool_loop` helper",
          code: `from typing import Callable

def run_tool_loop(
    client,
    *,
    model: str,
    tools: list[dict],
    dispatch: dict[str, Callable[[dict], str]],
    initial_user_message: str,
    max_turns: int = 8,
):
    history = [{"role": "user", "content": initial_user_message}]

    for turn in range(max_turns):
        msg = client.messages.create(
            model=model, max_tokens=1024, tools=tools, messages=history,
        )
        history.append({"role": "assistant", "content": msg.content})

        if msg.stop_reason == "end_turn":
            return msg, history

        if msg.stop_reason == "tool_use":
            tool_results = []
            for block in msg.content:
                if block.type == "tool_use":
                    fn = dispatch[block.name]
                    result = fn(block.input)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": str(result),
                    })
            history.append({"role": "user", "content": tool_results})
            continue

        raise RuntimeError(f"unexpected stop_reason: {msg.stop_reason}")

    raise RuntimeError(f"agent exceeded max_turns={max_turns}")`,
          output: `# Conversation history after one tool round looks like:
# [
#   {"role": "user", "content": "What's the weather in Paris?"},
#   {"role": "assistant", "content": [ToolUseBlock(name="get_weather", input={...})]},
#   {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "...", "content": "18°C, cloudy"}]},
#   {"role": "assistant", "content": [TextBlock(text="It's 18°C and cloudy in Paris.")]},
# ]`,
          explanation:
            "The history alternates user/assistant strictly. Tool results live in a USER message (counterintuitive but required). The assistant's `content` list is appended verbatim — including the `tool_use` blocks — because the next turn needs to see what the assistant requested.",
          runnable: false,
        },
        {
          kind: "code_comparison",
          label: "Fragile vs hardened tool loop",
          left: {
            title: "Fragile loop",
            code: `while True:
    msg = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=1024,
        tools=tools,
        messages=history,
    )
    history.append({"role": "assistant", "content": msg.content})
    if msg.stop_reason == "end_turn":
        break
    # Assume tool_use, dispatch blindly.
    tool_results = []
    for block in msg.content:
        if block.type == "tool_use":
            result = dispatch[block.name](block.input)
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": str(result),
            })
    history.append({"role": "user", "content": tool_results})`,
            annotation:
              "No max-turn cap (infinite loop risk). No validation on `block.input`. No `is_error` on dispatch failures. No timeout. No structured logging. Ships, breaks, you find out from a cost alert.",
          },
          right: {
            title: "Hardened loop",
            code: `for turn in range(MAX_TURNS):
    msg = client.messages.create(...)
    log.info("turn=%d stop=%s in=%d out=%d",
             turn, msg.stop_reason,
             msg.usage.input_tokens, msg.usage.output_tokens)
    history.append({"role": "assistant", "content": msg.content})
    if msg.stop_reason == "end_turn":
        return msg
    if msg.stop_reason != "tool_use":
        raise UnexpectedStopReason(msg.stop_reason)

    tool_results = []
    for block in msg.content:
        if block.type != "tool_use": continue
        try:
            validated = SCHEMAS[block.name].model_validate(block.input)
            result = dispatch[block.name](validated)
            tool_results.append({"type": "tool_result",
                                 "tool_use_id": block.id,
                                 "content": json.dumps(result)})
        except Exception as e:
            log.exception("tool %s failed", block.name)
            tool_results.append({"type": "tool_result",
                                 "tool_use_id": block.id,
                                 "content": f"error: {e}",
                                 "is_error": True})
    history.append({"role": "user", "content": tool_results})
raise MaxTurnsExceeded(MAX_TURNS)`,
            annotation:
              "Max-turn cap, per-turn logging, validation on every tool input, `is_error=True` on dispatch failures (Claude sees the error and self-corrects), explicit exception on unexpected `stop_reason`.",
          },
          takeaway:
            "Every agent loop needs: max-turn cap, input validation, is_error on failures, structured per-turn logging. Ship without these and the first production bug is invisible until your cost graph spikes.",
        },
        {
          kind: "mini_challenge",
          title: "Implement `run_tool_loop`",
          prompt:
            "Implement a tool-use loop helper. It should take (1) a configured Anthropic client, (2) a list of tool definitions, (3) a dispatch dict mapping tool names to Python callables, (4) an initial user message, (5) a `max_turns` cap. It should return the final assistant `Message` when `stop_reason == 'end_turn'`, and raise on max-turns exceeded or an unexpected `stop_reason`.",
          hints: [
            "Maintain a `history` list of messages. Start with the initial user message.",
            "Loop up to `max_turns` times. Each iteration: call the API, append the assistant content to history.",
            "On `end_turn`: return the message. On `tool_use`: iterate `msg.content`, dispatch each `tool_use` block, build matching `tool_result` blocks, append as a new USER message.",
            "Wrap each tool dispatch in try/except. On failure, return `tool_result` with `is_error=True` so Claude can self-correct.",
            "Log `usage` per turn — this is your single most useful observability hook.",
          ],
          solution: `def run_tool_loop(client, *, model, tools, dispatch, initial_user_message, max_turns=8):
    history = [{"role": "user", "content": initial_user_message}]
    for turn in range(max_turns):
        msg = client.messages.create(
            model=model, max_tokens=1024, tools=tools, messages=history,
        )
        log.info("turn=%d stop=%s in=%d out=%d", turn, msg.stop_reason,
                 msg.usage.input_tokens, msg.usage.output_tokens)
        history.append({"role": "assistant", "content": msg.content})

        if msg.stop_reason == "end_turn":
            return msg
        if msg.stop_reason != "tool_use":
            raise RuntimeError(f"unexpected stop_reason: {msg.stop_reason}")

        tool_results = []
        for block in msg.content:
            if block.type != "tool_use":
                continue
            try:
                result = dispatch[block.name](block.input)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": json.dumps(result),
                })
            except Exception as e:
                log.exception("tool %s failed", block.name)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": f"error: {e}",
                    "is_error": True,
                })
        history.append({"role": "user", "content": tool_results})
    raise RuntimeError(f"max_turns={max_turns} exceeded")`,
          takeaway:
            "Every production agent loop has the same skeleton: append to history, branch on stop_reason, dispatch tool calls, append tool_results as a user message. Cap the loop, log usage, mark dispatch failures with is_error. Memorize the pattern.",
        },
      ],
    },

    // ── Section 16 ───────────────────────────────────────────────────────
    {
      title: "The `tool_result` block: what to send back",
      blocks: [
        {
          kind: "prose",
          markdown: `A \`tool_result\` is a content block on a **user** message that closes a tool call. Counterintuitive but consistent — the conversation is "Claude asks (assistant turn) / you answer (user turn)" even when the answering is a function call.

Shape:

\`\`\`python
{
    "type": "tool_result",
    "tool_use_id": "toolu_01abcdef...",  # MUST match the tool_use.id
    "content": "string OR list of content blocks",
    "is_error": False,                    # optional, default False
}
\`\`\`

\`content\` can be:
- a **string** — the most common case (a JSON-encoded function return is fine).
- a **list of content blocks** — e.g. \`[{"type": "text", ...}, {"type": "image", ...}]\` for tools that return images.

\`is_error=True\` tells Claude the tool failed. Claude will see the error message and almost always self-correct (retry with different inputs, ask the user for clarification, or apologize and stop).`,
        },
        {
          kind: "method_ref",
          title: "`tool_result` block shape",
          importLine: 'content block on a user message',
          methods: [
            {
              signature: 'type: "tool_result"',
              description: "Discriminant — always the literal string.",
            },
            {
              signature: "tool_use_id: str",
              description:
                "MUST equal the `id` of the `tool_use` block this is responding to. The join key — order in the list does NOT matter.",
            },
            {
              signature: "content: str | list[ContentBlock]",
              description:
                "String for simple returns. List of blocks (text/image) for richer returns. Whatever you put here is what Claude sees on the next turn.",
            },
            {
              signature: "is_error: bool = False",
              description:
                "Flag the call as failed. Claude reads the content as an error message and adjusts. Use for any dispatch failure.",
            },
          ],
        },
        {
          kind: "code_predict",
          label: "Success vs error tool_result",
          code: `# Success
success_result = {
    "type": "tool_result",
    "tool_use_id": "toolu_01abc",
    "content": json.dumps({"temp_c": 18, "conditions": "cloudy"}),
}

# Failure
error_result = {
    "type": "tool_result",
    "tool_use_id": "toolu_01def",
    "content": "City 'Atlantis' not found in weather DB.",
    "is_error": True,
}

# Bundle into a user message
user_message = {
    "role": "user",
    "content": [success_result, error_result],
}

print(user_message["content"][0]["type"])
print(user_message["content"][1]["is_error"])`,
          output: `tool_result
True`,
          explanation:
            "Both results travel in ONE user message — the list contains a `tool_result` for every `tool_use` Claude emitted. On the next turn, Claude sees both: it'll integrate the weather data and address the lookup failure (retry with corrected city or apologize, depending on its training).",
          runnable: false,
        },
        {
          kind: "scenario_predict",
          label: "Oversized tool_result blows up cost",
          scenario:
            "Your `lookup_orders` tool returns 50 KB of JSON on the first turn. The agent loop runs another 5 turns after that. Predict what happens to per-turn input token count.",
          language: "text",
          question:
            "What's the cost shape, and what's the fix?",
          answer:
            "The 50 KB tool_result becomes part of the conversation history, which is sent IN FULL on every subsequent turn. By turn 6, you've paid for that 50 KB blob 5 extra times — and the input token count on the final turn includes the original blob plus every subsequent assistant/user message.\n\nFix options:\n1. **Summarize at the source** — make the tool return a 1 KB summary and store the full data externally (DB, blob storage) keyed by an ID Claude can reference.\n2. **Truncate at the boundary** — clip to top-N rows, indicate truncation.\n3. **Tiered retrieval** — first call returns metadata; a follow-up call fetches details for the rows Claude actually needs.",
          explanation:
            "Treat tool_result content as stdout — keep it terse. 'Returns all the data' is the wrong default. 'Returns just what's needed for this decision' is the right one.",
        },
        {
          kind: "key_insight",
          label: "tool_result = stdout",
          insight: `**Treat \`tool_result\` like the function's stdout. Keep it terse.**

Every byte you return is paid for on every subsequent turn. A noisy 50 KB blob in turn 1 costs you 50 KB × (remaining_turns) on every following round-trip. Summarize at the source, paginate, or store-and-reference for anything large.`,
        },
      ],
    },

    // ── Section 17 ───────────────────────────────────────────────────────
    {
      title: "Parallel tool use and multi-tool dispatching",
      blocks: [
        {
          kind: "prose",
          markdown: `Claude can return **multiple \`tool_use\` blocks in one assistant message**. This is parallel tool use — and it's on by default. Your dispatcher should call the tools concurrently and return ALL the matching \`tool_result\` blocks in ONE user message.

The join key is \`tool_use_id\`, not order. Claude doesn't care about the order of \`tool_result\` blocks — it pairs them by ID. This means you can dispatch in parallel and return as soon as all are done, without worrying about which finished first.

When to disable: set \`disable_parallel_tool_use=True\` if your tools have order dependencies (rare) or your dispatcher truly can't run in parallel.`,
        },
        {
          kind: "code_predict",
          label: "Async parallel dispatch",
          code: `import asyncio, anthropic, json

client = anthropic.AsyncAnthropic()

async def dispatch_one(block):
    fn = TOOL_REGISTRY[block.name]
    result = await fn(block.input)
    return {
        "type": "tool_result",
        "tool_use_id": block.id,
        "content": json.dumps(result),
    }

async def handle_tool_use_turn(msg):
    tool_blocks = [b for b in msg.content if b.type == "tool_use"]
    # Dispatch all tool calls in parallel
    results = await asyncio.gather(*[dispatch_one(b) for b in tool_blocks])
    return {"role": "user", "content": results}

# Example: assistant turn with two parallel get_weather calls
# msg.content == [
#   ToolUseBlock(id="t1", name="get_weather", input={"city": "Paris"}),
#   ToolUseBlock(id="t2", name="get_weather", input={"city": "Berlin"}),
# ]
# After handle_tool_use_turn(msg), the user message contains:
print([{"id": r["tool_use_id"]} for r in [
    {"tool_use_id": "t1"}, {"tool_use_id": "t2"}
]])`,
          output: `[{'id': 't1'}, {'id': 't2'}]`,
          explanation:
            "`asyncio.gather` fans out — total latency is `max(dispatch times)` instead of `sum(dispatch times)`. For an agent that does 5 parallel API lookups, that's a 5× latency win for free. The matching tool_result blocks travel in a single user message; Claude pairs them by `tool_use_id`.",
          runnable: false,
        },
        {
          kind: "code_comparison",
          label: "Sequential vs parallel dispatch",
          left: {
            title: "Sequential (slow)",
            code: `tool_results = []
for block in msg.content:
    if block.type == "tool_use":
        result = await dispatch[block.name](block.input)
        tool_results.append({
            "type": "tool_result",
            "tool_use_id": block.id,
            "content": json.dumps(result),
        })

# Total time = sum of all dispatch times
# 5 parallel weather lookups @ 200ms each = 1000ms`,
            annotation:
              "Each await blocks the loop. Fine for one tool call; pathological for parallel tool use. Most agent latency complaints come from this.",
          },
          right: {
            title: "Parallel via `asyncio.gather`",
            code: `tool_blocks = [b for b in msg.content if b.type == "tool_use"]

async def one(b):
    result = await dispatch[b.name](b.input)
    return {"type": "tool_result",
            "tool_use_id": b.id,
            "content": json.dumps(result)}

tool_results = await asyncio.gather(*[one(b) for b in tool_blocks])

# Total time = max of dispatch times
# 5 parallel weather lookups @ 200ms each = ~200ms`,
            annotation:
              "Fan-out. Total wall time = slowest dispatch. Add per-call timeouts via `asyncio.wait_for(...)` so one slow tool can't stall the whole turn.",
          },
          takeaway:
            "If your tools are I/O-bound (and most are), parallel dispatch is essentially free latency. Use `asyncio.gather` (or `concurrent.futures.ThreadPoolExecutor` for sync code) by default.",
        },
        {
          kind: "scenario_predict",
          label: "Order of tool_result blocks",
          scenario:
            "Your dispatcher runs two tool calls in parallel. The second one finishes first, so your tool_result list is ordered [tool_use_id_2, tool_use_id_1] — the REVERSE of the order in the assistant message. Predict Claude's behavior.",
          language: "text",
          question: "Does Claude care about the order?",
          answer:
            "No — Claude pairs `tool_result` to `tool_use` by `tool_use_id`, not by list position. Any order works. The reason: parallel dispatch naturally completes out-of-order, and forcing a specific order would penalize correct concurrent code.\n\nThis also means you can omit some tool_results (if you decide some calls shouldn't be answered) — though the API will likely complain about a missing pairing, so don't.",
          explanation:
            "Practical implication: don't waste cycles preserving order in your dispatcher. Use whatever pattern is simplest (`asyncio.gather` returns in original order anyway; ThreadPoolExecutor returns in completion order). Both are fine.",
        },
      ],
    },

    // ── Section 18 ───────────────────────────────────────────────────────
    {
      title: "Extended thinking",
      blocks: [
        {
          kind: "prose",
          markdown: `Sonnet 4.5 and Opus 4.5 support **extended thinking** — a mode where Claude reasons silently before producing the final response. Enable it with the \`thinking\` parameter:

\`\`\`python
client.messages.create(
    model="claude-opus-4-5",
    max_tokens=4096,
    thinking={"type": "enabled", "budget_tokens": 2048},
    messages=[...],
)
\`\`\`

The response \`content\` list now contains \`thinking\` blocks (a transcript of the model's internal reasoning) **before** the usual \`text\` / \`tool_use\` blocks. Thinking tokens are billed as output tokens.

**Use extended thinking for:** hard reasoning, math, code review, multi-step planning, complex agent decisions.

**Skip extended thinking for:** classification, simple extraction, summarization — you're paying for capacity you don't need.`,
        },
        {
          kind: "method_ref",
          title: "Extended thinking",
          importLine: "client.messages.create(thinking=...)",
          methods: [
            {
              signature: 'thinking={"type": "enabled", "budget_tokens": N}',
              description:
                "Enable extended thinking with a token budget for the silent reasoning phase. Counted against `max_tokens` and billed as output.",
            },
            {
              signature: 'thinking={"type": "disabled"}',
              description:
                "Explicitly disable (default behavior). Use to override a default-on configuration.",
            },
            {
              signature: "ThinkingBlock(type='thinking', thinking=str)",
              description:
                "Response content block carrying the model's internal reasoning transcript. Appears BEFORE text/tool_use blocks.",
            },
          ],
        },
        {
          kind: "code_predict",
          label: "Iterate a thinking response",
          code: `msg = client.messages.create(
    model="claude-opus-4-5",
    max_tokens=4096,
    thinking={"type": "enabled", "budget_tokens": 2048},
    messages=[{"role": "user", "content": "What's 17 * 23, step by step?"}],
)

for block in msg.content:
    print(block.type)`,
          output: `thinking
text`,
          explanation:
            "Extended thinking produces a `thinking` block (the silent reasoning) followed by the usual `text` block (the final answer). If tools are in play, you'll see `thinking` then `tool_use`. You can choose to display, log, or ignore the thinking content — it's there for transparency and debugging, not for users.",
          runnable: false,
        },
        {
          kind: "scenario_predict",
          label: "Thinking on a trivial task",
          scenario:
            "You enable `thinking={'type': 'enabled', 'budget_tokens': 8192}` for a sentiment-classification workload over 10,000 tweets. Each tweet is one line.",
          language: "text",
          question:
            "Predict the cost impact and the right fix.",
          answer:
            "Cost balloons 5–10× because every call now spends thinking tokens (billed as output) on a task that needs none. A no-thinking Haiku call might be $0.0001; the same call with Opus + 8k thinking budget might be $0.005. Over 10,000 tweets, you've turned a $1 batch into a $50 batch — for zero accuracy benefit.\n\nFix: disable thinking (`thinking={\"type\": \"disabled\"}`), demote to Haiku 4.5, and profile. Reach for thinking only when you can measure that it improves outputs on a held-out evaluation set.",
          explanation:
            "Extended thinking is a precision tool. It pays off when the task genuinely benefits from internal reasoning (math, complex planning, deep code review). For everything else, it's a tax.",
        },
        {
          kind: "multiple_choice",
          title: "When does extended thinking pay off?",
          prompt:
            "Mark each workload where extended thinking is a *good* default. Look for tasks where reasoning quality dominates per-call cost.",
          choices: [
            {
              text: "A debugging agent that reads a stack trace and proposes a patch.",
              correct: true,
              rationale:
                "Multi-step reasoning over stack traces and code. Wrong patches cost developer time. Thinking budget pays for itself.",
            },
            {
              text: "Sentiment classification over 1M tweets.",
              correct: false,
              rationale:
                "Trivial task at scale. Thinking is pure cost. Use Haiku, no thinking.",
            },
            {
              text: "Architecture review of a 2000-line module.",
              correct: true,
              rationale:
                "Deep code reasoning over a long context. Quality dominates. Extended thinking with Opus 4.5 is the right call.",
            },
            {
              text: "Summarizing a one-page customer email.",
              correct: false,
              rationale:
                "Routine summarization. Sonnet 4.5 without thinking handles it. Adding thinking buys nothing measurable.",
            },
          ],
          explanation:
            "Pattern: thinking pays when the task is non-trivial reasoning AND per-call quality matters more than per-call cost. Otherwise it's spend without measurable return.",
        },
        {
          kind: "key_insight",
          label: "Thinking is a precision tool",
          insight: `**Extended thinking is a precision tool, not a default.**

Enable it where reasoning quality matters more than per-call cost. Always profile both versions (thinking on vs off) against a held-out eval set before committing. The 5–10× cost overhead must show up as a measurable quality win — or you turn it off.`,
        },
        {
          kind: "flashcard",
          context: "Extended thinking",
          front: "How do you enable extended thinking?",
          back: 'Pass `thinking={"type": "enabled", "budget_tokens": N}` to `client.messages.create(...)`. Only supported on Sonnet 4.5 and Opus 4.5.',
        },
        {
          kind: "flashcard",
          context: "Extended thinking",
          front: "What appears in `message.content` when thinking is enabled?",
          back: "One or more `thinking` blocks first (the model's silent reasoning), then the usual `text` and/or `tool_use` blocks. Iterate by `block.type` as always.",
        },
        {
          kind: "flashcard",
          context: "Extended thinking",
          front: "How are thinking tokens billed?",
          back: "As **output tokens**, at the same per-token rate as regular output. So a 2048-token thinking budget on Sonnet 4.5 adds up to ~$0.03 per call before the final response.",
        },
        {
          kind: "flashcard",
          context: "Extended thinking",
          front: "When should you turn extended thinking OFF?",
          back: "Classification, simple extraction, summarization, routing — anything where the task is straightforward and you can't measure a quality win from the extra reasoning. Pay for thinking only when it earns its keep.",
        },
      ],
    },

    // ── Section 19 ───────────────────────────────────────────────────────
    {
      title: "Streaming preview",
      blocks: [
        {
          kind: "prose",
          markdown: `For interactive UX — chat UIs, agent trace viewers, anything where you want text to appear token-by-token — use streaming. The shape:

\`\`\`python
with client.messages.stream(
    model="claude-sonnet-4-5",
    max_tokens=1024,
    messages=[...],
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)

final_message = stream.get_final_message()  # full Message after streaming completes
\`\`\`

Streaming changes the UX, not the API contract. The \`final_message\` returned is the same shape as a non-streamed \`Message\` — same \`content\`, \`stop_reason\`, \`usage\`. You can still inspect \`stop_reason\`, run validation, branch on tool use.

Full coverage in the **Streaming & prompt caching** guide. Here we just want you to recognize the pattern.`,
        },
        {
          kind: "code_predict",
          label: "Minimal streaming loop",
          code: `import anthropic
client = anthropic.Anthropic()

with client.messages.stream(
    model="claude-sonnet-4-5",
    max_tokens=128,
    messages=[{"role": "user", "content": "List 3 colors."}],
) as stream:
    for chunk in stream.text_stream:
        print(chunk, end="", flush=True)
    print()

final = stream.get_final_message()
print("stop_reason:", final.stop_reason)
print("output_tokens:", final.usage.output_tokens)`,
          output: `1. Red
2. Blue
3. Green
stop_reason: end_turn
output_tokens: 18`,
          explanation:
            "Text arrives in chunks (often 1–5 tokens at a time). After the context manager exits, `get_final_message()` returns the assembled `Message` with full metadata. Use this for chat UIs where TTFT (time to first token) matters more than total latency.",
          runnable: false,
        },
        {
          kind: "key_insight",
          label: "Same contract, different UX",
          insight: `**Streaming changes the UX, not the API contract.**

The final \`Message\` you get back has the same shape as a non-streamed response. \`stop_reason\`, \`usage\`, and the full \`content\` list are all there. You can validate, branch on \`tool_use\`, and log usage exactly as before — the streaming layer is purely about *when* the bytes arrive.`,
        },
      ],
    },

    // ── Section 20 ───────────────────────────────────────────────────────
    {
      title: "Testing tool-use loops without the real API",
      blocks: [
        {
          kind: "prose",
          markdown: `**Never make real API calls in unit tests.** Real calls are slow (seconds per turn), flaky (network, rate limits), expensive (real money per run), and require credentials in CI. Mock \`client.messages.create\` and you get a test suite that's fast, deterministic, free, and credential-free.

For multi-turn agent tests, use \`side_effect=[msg1, msg2, ...]\` to script the whole conversation. Each call to \`messages.create\` pops the next message off the list. This lets you test the *agent loop logic* (does it handle \`tool_use\`? does it terminate on \`end_turn\`? does it cap at \`max_turns\`?) without touching the network.`,
        },
        {
          kind: "code_predict",
          label: "Mock a multi-turn agent test",
          code: `from unittest.mock import MagicMock
from types import SimpleNamespace

def fake_msg(stop_reason, content, in_tok=10, out_tok=10):
    return SimpleNamespace(
        stop_reason=stop_reason,
        content=content,
        usage=SimpleNamespace(input_tokens=in_tok, output_tokens=out_tok,
                              cache_creation_input_tokens=0, cache_read_input_tokens=0),
    )

def test_agent_loop_terminates_on_end_turn():
    client = MagicMock()
    client.messages.create.side_effect = [
        # Turn 1: model wants to call get_weather
        fake_msg("tool_use", [
            SimpleNamespace(type="tool_use", id="t1",
                            name="get_weather", input={"city": "Paris"}),
        ]),
        # Turn 2: model responds with final answer
        fake_msg("end_turn", [
            SimpleNamespace(type="text", text="It's 18°C in Paris."),
        ]),
    ]

    result = run_tool_loop(
        client, model="claude-sonnet-4-5",
        tools=[WEATHER_TOOL],
        dispatch={"get_weather": lambda inp: {"temp_c": 18}},
        initial_user_message="Weather in Paris?",
        max_turns=5,
    )
    assert client.messages.create.call_count == 2
    assert result.stop_reason == "end_turn"`,
          output: `# Test passes in <10ms. No API key. No network. No cost.`,
          explanation:
            "`side_effect=[...]` scripts the conversation. The first call returns the tool_use message; the second returns the end_turn message. This pattern covers ~80% of agent regressions: tool dispatch wiring, history threading, stop_reason branching, max-turn handling.",
          runnable: false,
        },
        {
          kind: "code_comparison",
          label: "Real-API test vs mocked test",
          left: {
            title: "Real-API test",
            code: `def test_extraction():
    client = anthropic.Anthropic()  # needs API key
    result = extract_person("Alice is 30")
    assert result.name == "Alice"
    assert result.age == 30

# Cost: real money per CI run.
# Speed: ~1-3 seconds per call.
# Flaky: network, rate limits, model drift.
# Credentials: API key in CI secret store.
# Determinism: none — model output can drift.`,
            annotation:
              "Useful as a small smoke-test suite (run nightly, not on every PR). Not how you cover unit-level behavior.",
          },
          right: {
            title: "Mocked test",
            code: `def test_extraction(monkeypatch):
    fake = MagicMock()
    fake.messages.create.return_value = fake_msg(
        "tool_use",
        [SimpleNamespace(type="tool_use", id="t1",
                         name="Person",
                         input={"name": "Alice", "age": 30})],
    )
    monkeypatch.setattr("myapp.client", fake)

    result = extract_person("Alice is 30")
    assert result.name == "Alice"
    assert result.age == 30

# Cost: $0.
# Speed: ms.
# Flaky: never.
# Credentials: none.
# Determinism: total.`,
            annotation:
              "Run on every PR. Covers wiring, validation, error handling. Pair with a small nightly smoke-test against the real API for end-to-end coverage.",
          },
          takeaway:
            "Mocked tests cover wiring; real-API smoke tests cover model behavior. You need both. The unit-test suite must be mocked or it won't survive contact with CI.",
        },
        {
          kind: "scenario_predict",
          label: "The test that lies",
          scenario:
            "Your test mocks `messages.create` to return a single `end_turn` response. Production hits a `tool_use` response (the prompt actually warrants a tool call). What breaks?",
          language: "text",
          question:
            "What's the bug and what's the fix?",
          answer:
            "The test never exercises the tool-use branch — so a regression in the tool-dispatch logic (forgetting to append `tool_results`, mis-matched `tool_use_id`, missing `is_error` handling) ships undetected. The test passes locally; production blows up on the first real tool call.\n\nFix: script the FULL tool-use flow in the mock chain. Always have at least one test that uses `side_effect=[tool_use_msg, end_turn_msg]` to cover the round-trip. Add a max-turns-exceeded test (`side_effect=[tool_use_msg] * 10`) and a tool-error test (dispatch raises) for completeness.",
          explanation:
            "Three mocked conversations cover ~80% of agent regressions: (1) happy path with one tool call → end_turn, (2) tool dispatch raises → is_error pathway, (3) infinite tool calls → max_turns cap fires. Build these three first; everything else is incremental.",
        },
        {
          kind: "key_insight",
          label: "Three mocked tests = 80% coverage",
          insight: `**The mocked-conversation test is the single most valuable test you'll write for an agent.**

Script the canonical happy path (tool_use → end_turn) AND one tool-error path (dispatch raises, is_error flows back to Claude) AND one max-turn-exceeded path. Three tests cover ~80% of the regressions you'll ever see in agent-loop code.`,
        },
      ],
    },

    // ── Section 21 ───────────────────────────────────────────────────────
    {
      title: "Failure modes & debugging the agent loop",
      blocks: [
        {
          kind: "prose",
          markdown: `Agents fail in a small number of recognizable ways. Recognize them, ship the fix, move on.

| Symptom | Root cause | Fix |
|---|---|---|
| Agent loops on the same tool call forever | Bad tool description or missing context | Improve description; add max-turn cap; de-dup consecutive identical tool calls |
| Cost spikes 10× without code changes | \`tool_result\` blobs growing; conversation history not windowed | Summarize tool returns; cap history length |
| \`ValidationError\` on tool input (intermittent) | Schema drift between Pydantic model and prompt expectations | Co-locate model + tool definition; re-derive schema from model |
| Response truncated mid-JSON | Hit \`max_tokens\` during a \`tool_use\` block | Bump max_tokens; or split the work; or switch to streaming |
| Agent runs for 5 min then errors | Tool dispatch timeout combined with no per-call cap | Add \`asyncio.wait_for\` per tool; lower max_turns |
| Different output every time at \`temperature=0\` | Greedy decoding ≠ determinism (kernel non-bit-exact) | Don't write tests that assume bit-exact output; snapshot or mock instead |

The single most common root cause across all of these: **no observability**. Logging \`usage\` per turn + per-tool latency + \`stop_reason\` per turn lets you spot all six within hours of deployment.`,
        },
        {
          kind: "code_comparison",
          label: "Fragile loop vs production-hardened loop",
          left: {
            title: "Fragile",
            code: `# - No max-turn cap
# - No timeout per tool
# - No validation on tool input
# - No is_error flow
# - No usage logging
while True:
    msg = client.messages.create(...)
    history.append({"role": "assistant", "content": msg.content})
    if msg.stop_reason == "end_turn":
        break
    results = []
    for b in msg.content:
        if b.type == "tool_use":
            results.append({
                "type": "tool_result",
                "tool_use_id": b.id,
                "content": str(dispatch[b.name](b.input)),
            })
    history.append({"role": "user", "content": results})`,
            annotation:
              "Every line is correct in the happy path. Every line is a production incident in the unhappy path.",
          },
          right: {
            title: "Hardened",
            code: `for turn in range(MAX_TURNS):
    msg = client.messages.create(...)
    log.info("turn=%d stop=%s in=%d out=%d",
             turn, msg.stop_reason,
             msg.usage.input_tokens, msg.usage.output_tokens)
    history.append({"role": "assistant", "content": msg.content})
    if msg.stop_reason == "end_turn":
        return msg
    if msg.stop_reason != "tool_use":
        raise UnexpectedStopReason(msg.stop_reason)

    results = []
    for b in (x for x in msg.content if x.type == "tool_use"):
        try:
            validated = SCHEMAS[b.name].model_validate(b.input)
            result = await asyncio.wait_for(
                dispatch[b.name](validated), timeout=DISPATCH_TIMEOUT,
            )
            results.append({"type": "tool_result", "tool_use_id": b.id,
                            "content": json.dumps(result)})
        except Exception as e:
            log.exception("tool %s failed", b.name)
            results.append({"type": "tool_result", "tool_use_id": b.id,
                            "content": f"error: {e}", "is_error": True})
    history.append({"role": "user", "content": results})
raise MaxTurnsExceeded(MAX_TURNS)`,
            annotation:
              "Max-turn cap, per-turn logging, validation, dispatch timeout, is_error on failure, explicit on unexpected stop_reason. Six failure modes prevented.",
          },
          takeaway:
            "The hardened loop is ~20 lines longer than the fragile one. It prevents every common production failure. Adopt it as the default skeleton; never ship the fragile version.",
        },
        {
          kind: "scenario_predict",
          label: "Agent calls the same tool 20 times",
          scenario:
            "Your agent runs against a real prompt and the logs show it called `lookup_user(id='123')` 20 times in a row before max-turns fired. The lookup always returned the same record. What's the root cause?",
          language: "text",
          question: "What's wrong, and what's the fix?",
          answer:
            "Almost always one of:\n1. **Bad tool description** — Claude doesn't realize the response already answered the question, so it retries.\n2. **Missing context in the tool_result** — the result was technically correct but didn't contain the fields Claude was looking for; it tries different args.\n3. **System prompt or user task is ambiguous** — Claude thinks it needs more data.\n\nFixes: rewrite the tool description to spell out what the response means; enrich `tool_result` with the fields the downstream task needs; tighten the user/system prompt. Add a de-duplication guard in the dispatcher (if the same tool+input was called in the last N turns, return a 'you already called this' tool_result) as a belt-and-braces measure.",
          explanation:
            "An infinite-loop agent is almost never a Claude bug — it's a tool-design bug. The model is doing its best with what you gave it. Fix the tool description and the tool_result shape, and the loop resolves.",
        },
        {
          kind: "multiple_choice",
          title: "Symptom → root cause",
          prompt: "Match each symptom to the most likely root cause.",
          choices: [
            {
              text: "Symptom: cost spikes 10× without code change. Cause: tool_result blobs ballooned.",
              correct: true,
              rationale:
                "By far the most common cost regression. A tool starts returning more data; that data is re-sent on every subsequent turn.",
            },
            {
              text: "Symptom: ValidationError on tool input intermittently. Cause: Anthropic API regression.",
              correct: false,
              rationale:
                "Almost never an API regression. Usually schema drift on YOUR side, or a `Field` constraint that's too tight for the model's natural output.",
            },
            {
              text: "Symptom: response truncated mid-JSON. Cause: hit `max_tokens` during a tool_use block.",
              correct: true,
              rationale:
                "Classic. `max_tokens` includes tool_use input tokens. Bump max_tokens or split the task.",
            },
            {
              text: "Symptom: agent runs for 5 minutes then errors. Cause: no per-tool timeout combined with a slow upstream.",
              correct: true,
              rationale:
                "Without `asyncio.wait_for` (or equivalent), one slow tool stalls the whole turn. Per-tool timeouts are non-negotiable in production.",
            },
          ],
          explanation:
            "The pattern: most agent failures are observability failures first. Log usage, dispatch latency, stop_reason per turn — then the root cause is obvious from the first repro.",
        },
        {
          kind: "flashcard",
          context: "Failure modes",
          front: "Infinite tool loops",
          back: "Symptom: agent retries the same tool with the same args. Cause: bad tool description or thin tool_result. Fix: enrich the description and the result; add a de-dup guard; set a low max_turns.",
        },
        {
          kind: "flashcard",
          context: "Failure modes",
          front: "Context bloat",
          back: "Symptom: input_tokens grow turn-over-turn until you hit the context window. Cause: history never trimmed; tool_results are large. Fix: window the last N turns; summarize old turns; shrink tool_results at the source.",
        },
        {
          kind: "flashcard",
          context: "Failure modes",
          front: "ValidationError on tool input",
          back: "Symptom: occasional `pydantic.ValidationError` from `model_validate(tool_use.input)`. Cause: schema constraint slightly tighter than the model's natural output. Fix: retry-with-feedback OR loosen the constraint OR fail-loud — pick by workload.",
        },
        {
          kind: "flashcard",
          context: "Failure modes",
          front: "Oversized tool_result",
          back: "Symptom: cost grows linearly with turn count. Cause: tool returns large blobs that re-ship on every turn. Fix: summarize at the tool, paginate, or store-and-reference by ID.",
        },
        {
          kind: "flashcard",
          context: "Failure modes",
          front: "Truncated mid-tool-call",
          back: "Symptom: `stop_reason='max_tokens'` and the tool_use input is partial JSON. Cause: max_tokens too low. Fix: bump max_tokens; or split the work; or for very large outputs, switch to streaming.",
        },
        {
          kind: "flashcard",
          context: "Failure modes",
          front: "Schema drift",
          back: "Symptom: ValidationError after a deploy that touched Pydantic models. Cause: tool definition built from a stale schema. Fix: derive the tool dict from the model in the same module (`pydantic_tool(Model, ...)`) — never hand-code.",
        },
      ],
    },

    // ── Section 22 ───────────────────────────────────────────────────────
    {
      title: "API quick reference",
      blocks: [
        {
          kind: "prose",
          markdown: `Cheat-sheet for \`client.messages.create(...)\`. Bookmark this section.`,
        },
        {
          kind: "method_ref",
          title: "`messages.create` parameters",
          importLine: "client.messages.create(**kwargs)",
          methods: [
            {
              signature: "model: str",
              description:
                "Model ID. e.g. `claude-haiku-4-5`, `claude-sonnet-4-5`, `claude-opus-4-5`.",
            },
            {
              signature: "messages: list[Message]",
              description:
                "Conversation history. Strict user→assistant alternation. Each message is `{role, content}`.",
            },
            {
              signature: "max_tokens: int",
              description:
                "Hard cap on output tokens (includes tool_use input tokens and thinking tokens). Required.",
            },
            {
              signature: "system: str | list[ContentBlock]",
              description:
                "Optional. System prompt. Use the list-of-blocks shape to attach `cache_control` for prompt caching.",
            },
            {
              signature: "temperature: float = 1.0",
              description:
                "Sampling temperature. 0.0 = greedy/deterministic-ish, 1.0 = creative.",
            },
            {
              signature: "top_p: float | None",
              description:
                "Nucleus sampling. Prefer temperature instead.",
            },
            {
              signature: "top_k: int | None",
              description:
                "Top-k sampling. Rarely needed. Don't combine with top_p.",
            },
            {
              signature: "stop_sequences: list[str]",
              description:
                "Up to 4 sequences. Generation halts on any match.",
            },
            {
              signature: "tools: list[ToolDef]",
              description:
                "Tool definitions. Each `{name, description, input_schema}` — input_schema is a JSON Schema dict (use `Model.model_json_schema()`).",
            },
            {
              signature: "tool_choice: ToolChoice | None",
              description:
                "Control tool calling: `auto`, `any`, `{type:tool, name:X}`, or `none`. Default `auto` when tools provided.",
            },
            {
              signature: "thinking: dict | None",
              description:
                "Extended thinking config: `{type: 'enabled'|'disabled', budget_tokens?: int}`. Sonnet 4.5 / Opus 4.5 only.",
            },
            {
              signature: "stream: bool = False",
              description:
                "Enable streaming (token-by-token). Usually prefer `client.messages.stream(...)` context manager instead.",
            },
            {
              signature: "metadata: dict | None",
              description:
                "Custom metadata passed back in dashboards. `{user_id: str}` is the conventional shape.",
            },
            {
              signature: 'service_tier: "auto" | "standard_only" | None',
              description:
                "Routing preference. `auto` lets Anthropic use priority tiers when available; `standard_only` forces the standard tier.",
            },
            {
              signature: "disable_parallel_tool_use: bool = False",
              description:
                "When True, restrict Claude to at most one tool_use block per turn.",
            },
          ],
        },
      ],
    },

    // ── Section 23 ───────────────────────────────────────────────────────
    {
      title: "When to use what — decision drills",
      blocks: [
        {
          kind: "multiple_choice",
          title: "System message vs first user message",
          prompt:
            "Where does each piece of content belong: system prompt or first user message?",
          choices: [
            {
              text: 'Persistent role ("You are a senior tax attorney...") → system',
              correct: true,
              rationale:
                "Persistent persona/role/constraints belong in `system`. They define behavior across turns.",
            },
            {
              text: "The actual question for this turn ('What's the deduction for a home office?') → user",
              correct: true,
              rationale:
                "Per-turn input belongs in the user message. The user message is what changes between requests.",
            },
            {
              text: "Output format spec ('Always respond in JSON with keys: x, y, z') → system",
              correct: true,
              rationale:
                "Format directives apply across turns and benefit from prompt caching when stable. Put them in `system`. (Better: use forced tool_choice for true structured output.)",
            },
            {
              text: "User's name and account ID → system",
              correct: false,
              rationale:
                "Per-request data belongs in the user message (or as a `metadata` field). It changes per call and shouldn't be cached.",
            },
          ],
          explanation:
            "Rule of thumb: stable across turns → system. Changes per turn → user message. Then layer prompt caching on the stable parts for cost wins.",
        },
        {
          kind: "multiple_choice",
          title: "Prefill vs tool_use for structured output",
          prompt:
            "You want the model to emit JSON. Pick the right approach.",
          choices: [
            {
              text: "Multi-field nested JSON with strict types → forced tool_use + Pydantic validation",
              correct: true,
              rationale:
                "Tool use is the only reliable path for non-trivial schemas. Pydantic validates the round-trip.",
            },
            {
              text: 'A single letter grade (A/B/C/D/F) → prefill `"Grade: "` + max_tokens=1',
              correct: true,
              rationale:
                "For trivial single-token outputs, prefill is a 1-line shortcut. Tool use is overkill.",
            },
            {
              text: "A list of 20 tagged entities from a 5000-word document → ask for JSON in the prompt and `json.loads`",
              correct: false,
              rationale:
                "Non-trivial, list-shaped, long output. This is exactly where ask-for-JSON breaks. Use tool_use + Pydantic.",
            },
            {
              text: "A boolean yes/no answer → prefill `\"Answer: \"` + stop_sequences=['\\n']",
              correct: true,
              rationale:
                "Single-token output, trivial parsing. Prefill is fine. For higher reliability or larger schemas, escalate to tool use.",
            },
          ],
          explanation:
            "Prefill for trivial single-token outputs. Tool use + Pydantic for everything else. Ask-for-JSON is almost never the right answer in production.",
        },
        {
          kind: "multiple_choice",
          title: "Parallel vs sequential tool dispatch",
          prompt:
            "Your assistant turn contains 4 tool_use blocks. Dispatch strategy?",
          choices: [
            {
              text: "4 independent HTTP lookups → parallel via asyncio.gather",
              correct: true,
              rationale:
                "I/O-bound + independent = textbook parallel dispatch case. ~4× latency win for free.",
            },
            {
              text: "Tool A's output feeds Tool B (e.g., lookup user → fetch user's orders) → sequential",
              correct: true,
              rationale:
                "Data dependency. Run A first, then B. (Better still: redesign so Claude makes two turns with one tool each — clearer agent semantics.)",
            },
            {
              text: "Mix of independent and dependent → parallel ALL, hope it works out",
              correct: false,
              rationale:
                "Dependent tools dispatched in parallel will see stale inputs. Either run in dependency order or restructure tools to be independent.",
            },
            {
              text: "All tools are read-only and side-effect-free → parallel by default",
              correct: true,
              rationale:
                "When tools have no side effects and no inter-dependencies, parallel is always safe. Default to gather.",
            },
          ],
          explanation:
            "Parallel dispatch is the default for I/O-bound, side-effect-free tools. Sequential only when there's a genuine data or side-effect dependency.",
        },
        {
          kind: "flashcard",
          context: "Decision drills",
          front: "Stop_reason is `tool_use`. Now what?",
          back: "Extract every `tool_use` block, dispatch each (in parallel if safe), build matching `tool_result` blocks in ONE user message, append, call the API again. Do NOT treat as `end_turn`.",
        },
        {
          kind: "flashcard",
          context: "Decision drills",
          front: "Stop_reason is `max_tokens`. Now what?",
          back: "The response is truncated. Either bump `max_tokens` and retry, or split the work into smaller calls, or — if this is a tool_use that got cut off — increase the budget and try again. Don't naively `json.loads` the partial output.",
        },
        {
          kind: "flashcard",
          context: "Decision drills",
          front: "When do you enable extended thinking?",
          back: "Hard reasoning, math, code review, multi-step planning — tasks where quality dominates per-call cost. Always profile on/off against an eval set before committing. Disable for classification/extraction/summarization.",
        },
        {
          kind: "flashcard",
          context: "Decision drills",
          front: "How do you guarantee Claude calls a specific tool?",
          back: '`tool_choice={"type": "tool", "name": "MyTool"}`. The response is then guaranteed to contain a `tool_use` block named `MyTool` with `stop_reason="tool_use"`.',
        },
        {
          kind: "flashcard",
          context: "Decision drills",
          front: "How do you keep an agent loop from running forever?",
          back: "Always set a `max_turns` cap (e.g. 8–12). Inside the loop, log per-turn `usage` and `stop_reason`. Optionally add a same-tool-same-input de-dup guard.",
        },
        {
          kind: "scenario_predict",
          label: "Choose your stack",
          scenario:
            "You're shipping a customer-support agent. Requirements: must use ~5 tools (order lookup, FAQ search, escalation, etc.), respond in <3 seconds p95, handle 10k requests/day, log everything for audit.",
          language: "text",
          question: "Sketch the stack. What model, what tool_choice, what observability?",
          answer:
            "Model: **Sonnet 4.5** (default for agent loops). Try Haiku 4.5 first as an A/B for cost win — if accuracy drops on your eval, fall back to Sonnet.\n\n`tool_choice`: **`auto`** (most turns are conversation, some warrant a tool call). Register all 5 tools.\n\nAgent loop: hardened skeleton — `max_turns=6`, async parallel dispatch via `asyncio.gather`, per-tool `asyncio.wait_for(timeout=2s)`, Pydantic validation on every tool input, `is_error=True` on dispatch failures.\n\nObservability: log per turn — `usage` (in/out/cache), `stop_reason`, `tool_calls` (name + latency), full request/response IDs for audit. Surface `p50/p99 cost-per-conversation` and `tool_call_latency_by_name` on a dashboard. Alarm on p99 cost > 5× p50.\n\nTesting: 3 mocked agent tests (happy path, dispatch-error, max-turns-exceeded) + 1 nightly real-API smoke test against 50 canned conversations.",
          explanation:
            "This is the boilerplate. Once you've shipped 2–3 of these, the stack becomes muscle memory. The points where teams burn time are: skipping per-tool timeouts (one slow upstream stalls everything), skipping the max-turns cap (one runaway prompt costs $$$), skipping usage logging (cost regressions invisible).",
        },
        {
          kind: "scenario_predict",
          label: "Cheap extractor over a million rows",
          scenario:
            "You need to extract `{intent, urgency}` from 1 million customer support emails — one-shot, no tools, no agent loop. Pick the stack.",
          language: "text",
          question: "Model, tool_choice, batching, validation?",
          answer:
            "Model: **Haiku 4.5** — high-volume, simple extraction. A 30× cost gap from Opus.\n\n`tool_choice`: `{\"type\": \"tool\", \"name\": \"Extraction\"}` with a Pydantic model `class Extraction(BaseModel): intent: Literal[...]; urgency: Literal['low','med','high']`.\n\nBatching: use the **Batch API** (separate guide) for ~50% additional cost savings on workloads tolerant of 24h turnaround. Send 1M requests in batches.\n\nValidation: `Extraction.model_validate(tool_use.input)` on every response. On `ValidationError`, retry once with feedback; on second failure, queue for manual review (1% queue is fine at this scale).\n\nObservability: aggregate usage per batch; alarm on validation failure rate >2%.\n\nCost estimate: ~$1k–$5k for the full run depending on input length, vs ~$30k–$150k if you'd used Opus.",
          explanation:
            "Lesson: model choice is the single biggest cost lever for batch extraction. Haiku + Batch API + forced tool_use + Pydantic validation is the canonical pattern.",
        },
      ],
    },

    // ── Section 24 ───────────────────────────────────────────────────────
    {
      title: "Mini-challenge: production-grade structured extractor",
      blocks: [
        {
          kind: "prose",
          markdown: `Time to wire the pieces together. You'll build a real-world structured extractor: given a list of customer support tickets, extract \`{intent, sentiment, urgency, summary}\` for each one using Sonnet 4.5 + Pydantic-validated tool use.

Requirements:
- One Pydantic model is the contract for the output shape.
- Forced \`tool_choice\` guarantees the call.
- \`ValidationError\` triggers one retry with feedback, then quarantines.
- Per-ticket isolation: one bad ticket cannot kill the batch.
- Structured logging of \`usage\` per call.

Reference solution is ~70 lines. Mark the snippet \`runnable: false\` because we don't ship a real API key.`,
        },
        {
          kind: "mini_challenge",
          title: "Build a production extractor",
          prompt:
            "Implement `extract_tickets(tickets: list[str]) -> list[TicketAnalysis | None]`. For each ticket, force a Pydantic-validated tool call. On `ValidationError`, retry once with feedback; on second failure, return `None` for that ticket (don't crash the batch). Log `usage` per call. Use Sonnet 4.5.",
          hints: [
            "Define `TicketAnalysis(BaseModel)` with `intent: Literal[...]`, `sentiment: Literal['pos','neu','neg']`, `urgency: Literal['low','med','high']`, `summary: str = Field(max_length=200)`.",
            "Use `pydantic_tool(TicketAnalysis, '...')` to build the tool dict.",
            "Per ticket: call `messages.create(...)` with `tool_choice={'type':'tool', 'name':'TicketAnalysis'}`. Extract the `tool_use` block. Validate.",
            "Wrap the per-ticket call in try/except. On `ValidationError`, send a follow-up message with the error and retry once. On the second failure or any other exception, log and return `None`.",
            "Log `usage` per call: `(in_tokens, out_tokens, cache_w, cache_r)`.",
            "Iterate the tickets sequentially or with `asyncio.gather` for the async client.",
          ],
          solution: `from pydantic import BaseModel, Field, ValidationError
from typing import Literal
import anthropic, json, logging

log = logging.getLogger("extractor")
client = anthropic.Anthropic()

class TicketAnalysis(BaseModel):
    intent: Literal["billing", "tech_support", "feature_request", "complaint", "other"]
    sentiment: Literal["pos", "neu", "neg"]
    urgency: Literal["low", "med", "high"]
    summary: str = Field(max_length=200)

def pydantic_tool(model, description):
    return {"name": model.__name__, "description": description,
            "input_schema": model.model_json_schema()}

TOOL = pydantic_tool(TicketAnalysis, "Analyze a support ticket.")

def _call(messages):
    msg = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=512,
        tools=[TOOL],
        tool_choice={"type": "tool", "name": "TicketAnalysis"},
        messages=messages,
    )
    log.info("usage in=%d out=%d cache_w=%d cache_r=%d",
             msg.usage.input_tokens, msg.usage.output_tokens,
             msg.usage.cache_creation_input_tokens, msg.usage.cache_read_input_tokens)
    return msg

def _extract_one(ticket: str) -> TicketAnalysis | None:
    messages = [{"role": "user", "content": ticket}]
    try:
        msg = _call(messages)
        tool_use = next(b for b in msg.content if b.type == "tool_use")
        return TicketAnalysis.model_validate(tool_use.input)
    except ValidationError as e:
        log.warning("validation failed, retrying: %s", e)
        # Append the failed assistant turn + a corrective user message
        messages.append({"role": "assistant", "content": msg.content})
        messages.append({"role": "user", "content": [{
            "type": "tool_result",
            "tool_use_id": tool_use.id,
            "content": f"Schema validation failed: {e}. Please retry with valid values.",
            "is_error": True,
        }]})
        try:
            msg2 = _call(messages)
            tool_use2 = next(b for b in msg2.content if b.type == "tool_use")
            return TicketAnalysis.model_validate(tool_use2.input)
        except (ValidationError, Exception) as e2:
            log.error("ticket quarantined after retry: %s", e2)
            return None
    except Exception as e:
        log.exception("unexpected error, quarantining ticket")
        return None

def extract_tickets(tickets: list[str]) -> list[TicketAnalysis | None]:
    return [_extract_one(t) for t in tickets]`,
          takeaway:
            "This is the FDE-grade structured-extractor skeleton. Pydantic contract + forced tool_use + ValidationError retry + per-item isolation + usage logging. Reuse it for every extraction workload — just swap the Pydantic model.",
        },
      ],
    },

    // ── Section 25 ───────────────────────────────────────────────────────
    {
      title: "Recap & what to practice next",
      blocks: [
        {
          kind: "prose",
          markdown: `**Mental checklist for any Messages-API call:**

1. **Pick the model deliberately.** Haiku for high-volume simple work, Sonnet for default agent loops, Opus for hard reasoning. Always A/B before committing.
2. **Decide stream vs non-stream.** Stream for chat UIs (TTFT matters). Non-stream for batch and tools.
3. **Decide thinking on/off.** Hard reasoning → on. Classification/extraction → off. Profile both.
4. **Structured output = tool use + Pydantic.** Never ask-for-JSON for non-trivial shapes.
5. **Handle every \`stop_reason\`.** \`end_turn\` done. \`tool_use\` dispatch. \`max_tokens\` retry or split. \`stop_sequence\` your sentinel. \`refusal\` log + alert. \`pause_turn\` resume.
6. **Cap the loop.** Always set \`max_turns\`. Always set per-tool timeouts.
7. **Log \`usage\`.** Per call. Per request. Alarm on tail.
8. **Mock the API in tests.** Three mocked tests (happy path, dispatch-error, max-turns) cover ~80%.

These eight rules are the difference between a demo and a production agent.`,
        },
        {
          kind: "flashcard",
          context: "Recap",
          front: "The canonical structured-output pattern in Anthropic-land?",
          back: "Pydantic model → `pydantic_tool(Model, description)` → `tool_choice={'type':'tool', 'name':'Model'}` → `Model.model_validate(tool_use.input)`. Schema, generation, validation — one source of truth.",
        },
        {
          kind: "flashcard",
          context: "Recap",
          front: "Output tokens are billed at how many times the input rate?",
          back: "~5×. (Sonnet 4.5: $3 input, $15 output per MTok.) Output length is the #1 cost lever.",
        },
        {
          kind: "flashcard",
          context: "Recap",
          front: "Where do `tool_result` blocks live?",
          back: "On a USER message, in the `content` list. Each `tool_result` carries a `tool_use_id` that pairs it with the prior assistant's `tool_use` block. Order doesn't matter — IDs are the join key.",
        },
        {
          kind: "flashcard",
          context: "Recap",
          front: "The agent loop terminates on what condition?",
          back: "`msg.stop_reason == 'end_turn'`. Always combine with a max-turn cap so a misbehaving agent can't run forever. Unexpected stop_reasons should raise.",
        },
        {
          kind: "flashcard",
          context: "Recap",
          front: "The single most valuable observability hook?",
          back: "Logging `msg.usage` per call: `(input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens)`. Without it, cost regressions are invisible.",
        },
        {
          kind: "prose",
          markdown: `**Next-topic pointers** (separate guides in this curriculum):

- **Streaming & prompt caching** — token-by-token UX, \`cache_control\`, the system-as-list-of-blocks shape.
- **Tool design patterns** — when to make a tool vs not, schema heuristics, description writing.
- **Error handling & retries** — \`anthropic.APIError\` taxonomy, retry policies, idempotency keys, circuit breakers.
- **Batch API** — 50% cost savings for workloads tolerant of 24h turnaround.
- **Vision & PDF inputs** — multimodal content blocks.
- **Computer use & long-horizon agents** — the next frontier above the basic tool loop.

You now have the Messages API in your hands. Build something with it.`,
        },
      ],
    },
  ],
};
