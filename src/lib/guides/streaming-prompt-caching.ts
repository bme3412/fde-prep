import type { StudyGuide } from "../guide-types";

export const streamingPromptCachingGuide: StudyGuide = {
  topicTitle: "Streaming & prompt caching",
  topicSlug: "streaming-prompt-caching",
  sections: [
    // ================================================================
    // 1. Why streaming exists
    // ================================================================
    {
      title: "Why streaming exists",
      blocks: [
        {
          kind: "prose",
          markdown: `Imagine a user types a question into a chat box. They hit enter. The model has to generate a 500-token reply. At Sonnet's speed that's roughly 8 seconds of total generation time.

Without streaming, the HTTP request hangs for the full 8 seconds, then dumps the whole reply at once. The user stares at a spinner. They wonder if it broke.

With streaming, the *first* token arrives in about 200 milliseconds. Then tokens trickle in as fast as the model produces them. The user starts reading immediately. The total wall-clock time is the *same* — but the **perceived** latency drops by an order of magnitude, because reading and generating now overlap.

That single benefit — turning a wait into a read — is why every chat product you've used streams.`,
        },
        {
          kind: "scenario_predict",
          label: "two response timelines",
          scenario: `Non-streaming:
0s ─────────── (spinner) ─────────── 8s [whole reply lands]
                                         "Sure, here's how OAuth works..."

Streaming:
0s [TTFT 200ms] "Sure," " here's" " how" " OAuth" " works" ... 8s [final token]
   ^ user starts reading here                                 ^ generation done`,
          language: "text",
          question:
            "Streaming sped up the user experience. Did it also reduce the total wall-clock time (8s) the model spent generating?",
          answer:
            "No. Total generation time is identical — about 8 seconds in both cases. Streaming overlaps reading time with generation time, so the perceived wait is much shorter, but the model itself does not produce tokens any faster.",
          explanation:
            "This is the #1 misconception about streaming. It is a UX optimization, not a throughput optimization. The model still has to produce every token. Streaming just stops you from blocking on the last one before you can show anything.",
        },
        {
          kind: "key_insight",
          label: "Time-to-first-token (TTFT) is the metric that matters",
          insight: `Streaming optimizes **TTFT** — how long until the user sees *something* — not total generation time. When a stakeholder asks "how do we make Claude faster?" for a chat interface, the answer is almost always "stream the response" before "pick a smaller model."

There are exactly two other reasons to stream, both important for FDE work:
- **Incremental tool-arg parsing.** A long tool input (say, 2KB of JSON) starts arriving piece by piece. You can validate it early or even start sub-tasks before the model finishes.
- **Early termination.** If you see "STOP" or a stop sequence in the partial output, you can close the connection without paying for the rest of the generation.`,
        },
        {
          kind: "flashcard",
          context: "Reasons to stream beyond chat UX.",
          front:
            "Name two reasons to stream a Claude response that are unrelated to making chat feel snappier.",
          back: "(1) **Incremental tool-arg parsing** — tool inputs arrive as partial JSON, so you can validate or pre-fetch dependencies before the call is complete. (2) **Early abort** — you can stop reading the stream the moment you see a stop condition (a sentinel word, a budget exceeded, a user navigates away), avoiding billable output you don't need.",
        },
      ],
    },

    // ================================================================
    // 2. Server-Sent Events: the wire format
    // ================================================================
    {
      title: "Server-Sent Events: the wire format",
      blocks: [
        {
          kind: "prose",
          markdown: `Anthropic streams use **Server-Sent Events** (SSE), a small, plain-text protocol that rides on top of an ordinary HTTP response. There is no WebSocket, no gRPC, no binary framing. You make a normal POST and the server flushes lines to you over a long-lived connection.

The format is dead simple. Each "event" is two lines:

\`\`\`
event: <event_name>
data: <json payload>

\`\`\`

Then a **blank line** — that's the delimiter. Then the next event. The connection stays open until the server sends \`message_stop\` or closes the socket.

That's it. No headers per event, no checksums, no length prefixes. If you can read a string and split on \`\\n\\n\`, you can parse an SSE stream.`,
        },
        {
          kind: "scenario_predict",
          label: "raw SSE bytes from the wire",
          scenario: `event: message_start
data: {"type":"message_start","message":{"id":"msg_01...","role":"assistant"}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"!"}}`,
          language: "text",
          question:
            "How does the parser know one event has ended and the next has begun? What single character (or pair) is the delimiter?",
          answer:
            "A blank line — i.e. the byte sequence `\\n\\n` (two consecutive newlines). The parser reads until it sees an empty line, then knows the event is complete and can be dispatched.",
          explanation:
            "This is the entire SSE protocol. `event:` and `data:` lines for the current event, then a blank line that signals 'this event is done.' The `data:` line is always JSON for Anthropic. Multi-line `data:` is technically allowed in SSE but Anthropic always uses single-line.",
        },
        {
          kind: "key_insight",
          label: "SSE is just text over HTTP",
          insight: `You don't need a special library. Any HTTP client that lets you read the response body as a *stream* (rather than buffering the whole thing) can consume SSE. The server sends \`Content-Type: text/event-stream\`. You request it by passing \`"stream": true\` in the JSON body of your \`POST /v1/messages\` call.

In practice you should still use the official SDK because it handles reconnection, partial-line buffering, and event accumulation — but the *wire* is so simple you could write a parser in twenty lines of Python.`,
        },
        {
          kind: "warm_up",
          title: "asking the API to stream",
          prompt:
            "What single field in the request JSON body tells the Anthropic API to stream the response as SSE?",
          answer: '`"stream": true`',
          explanation:
            'You add `"stream": true` to the top-level POST body alongside `model`, `messages`, and `max_tokens`. The server then responds with `Content-Type: text/event-stream` and starts emitting events. The Python SDK\'s `client.messages.stream(...)` context manager and `client.messages.create(stream=True)` both set this for you under the hood.',
        },
      ],
    },

    // ================================================================
    // 3. The seven event types (anatomy of one stream)
    // ================================================================
    {
      title: "The seven event types (anatomy of one stream)",
      blocks: [
        {
          kind: "prose",
          markdown: `Every Anthropic stream is built from a small, fixed alphabet of events. Once you know the seven types and the order they appear in, every stream you ever see will feel familiar.

Here is the canonical flow:

\`\`\`
message_start
  content_block_start  (index 0)
    content_block_delta  ×N
  content_block_stop  (index 0)

  content_block_start  (index 1)         ← optional, for additional blocks
    content_block_delta  ×N                (text, tool_use, thinking, etc.)
  content_block_stop  (index 1)

  ...

message_delta
message_stop
\`\`\`

Plus two interleaved events that can appear anywhere: \`ping\` (heartbeat) and \`error\` (something blew up mid-stream).`,
        },
        {
          kind: "method_ref",
          title: "Streaming event types",
          importLine: "// Wire format: event: <name>\\ndata: <json>\\n\\n",
          methods: [
            {
              signature: "message_start",
              description:
                "Sent once at the very beginning. Contains a `Message` object with empty `content: []` and an *initial* `usage` showing `input_tokens` and a placeholder `output_tokens` (often 1).",
              returns: "Message envelope; usage.input_tokens is final.",
            },
            {
              signature: "content_block_start",
              description:
                "Sent once per content block. Has an `index` (0, 1, 2…) and a `content_block` showing the block's type (`text`, `tool_use`, `thinking`, `server_tool_use`, etc.) with empty fields.",
              returns: "Tells you what kind of block is about to stream.",
            },
            {
              signature: "content_block_delta",
              description:
                "Sent many times per block. The `delta` carries the incremental update; its `type` is `text_delta`, `input_json_delta`, `thinking_delta`, or `signature_delta`.",
              returns: "Incremental piece of the block at the given `index`.",
            },
            {
              signature: "content_block_stop",
              description:
                "Sent once per content block, signalling that block is complete. After this event you can safely `json.loads` any accumulated `partial_json`.",
              returns: "Block at this `index` is finalized.",
            },
            {
              signature: "message_delta",
              description:
                "Top-level changes to the `Message` envelope: `stop_reason`, `stop_sequence`, and **cumulative** `usage.output_tokens` (this is the *final* output count).",
              returns: "Final stop_reason and cumulative output token count.",
            },
            {
              signature: "message_stop",
              description:
                "The very last event. Just `{\"type\":\"message_stop\"}`. After this the server closes the connection.",
              returns: "End of stream.",
            },
            {
              signature: "ping",
              description:
                "Heartbeat. Payload is `{\"type\":\"ping\"}`. Can appear at any point between other events. Ignore it.",
              returns: "Keeps the HTTP connection alive.",
            },
            {
              signature: "error",
              description:
                "Mid-stream failure. Payload is `{\"type\":\"error\",\"error\":{\"type\":\"overloaded_error\",\"message\":\"...\"}}`. The connection is then closed; no `message_stop` follows.",
              returns: "Stream terminated early.",
            },
          ],
        },
        {
          kind: "scenario_predict",
          label: "a fully labeled stream for a one-token reply",
          scenario: `event: message_start
data: {"type":"message_start","message":{"id":"msg_01...","type":"message","role":"assistant","content":[],"model":"claude-opus-4-7","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":25,"output_tokens":1}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: ping
data: {"type":"ping"}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"!"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":15}}

event: message_stop
data: {"type":"message_stop"}`,
          language: "text",
          question:
            "Two questions: (a) When does the FINAL, billable `output_tokens` count arrive? (b) The `message_start` event already had `output_tokens: 1` — was that the real count?",
          answer:
            "(a) The final billable output token count arrives in the `message_delta` event — `usage.output_tokens: 15` in this example. (b) No — the `1` in `message_start` is a placeholder that the streaming protocol always emits. Never use it for billing or budgeting. Always read the cumulative count from the *last* `message_delta`.",
          explanation:
            "This trips people up constantly. The `message_start.message.usage.output_tokens` is essentially `1` as a stub; the real count is in `message_delta`. The `input_tokens` in `message_start` IS final and accurate — only the output count is a placeholder.",
        },
        {
          kind: "key_insight",
          label: "message_start has placeholder output_tokens",
          insight: `If you're tracking token spend per request, read the **final** \`message_delta\` for \`output_tokens\` (and cache fields when applicable). The \`message_start.message.usage\` only gives you \`input_tokens\` as a final value; its \`output_tokens\` is a placeholder until \`message_delta\` arrives.

The SDK's \`stream.get_final_message()\` does this accumulation for you — but if you're parsing raw events, the rule is: **trust message_start for input_tokens; trust message_delta for output_tokens**.`,
        },
      ],
    },

    // ================================================================
    // 4. content_block_delta in depth: text_delta vs input_json_delta
    // ================================================================
    {
      title: "content_block_delta in depth (text_delta vs input_json_delta)",
      blocks: [
        {
          kind: "prose",
          markdown: `Almost everything interesting in a stream happens inside \`content_block_delta\`. You will see two delta shapes most of the time:

- **\`text_delta\`** — carries a string fragment of natural-language output. The field is \`delta.text\`.
- **\`input_json_delta\`** — carries a string fragment of a tool call's JSON arguments. The field is \`delta.partial_json\`.

There is a third you'll see when extended thinking is enabled, \`thinking_delta\` (\`delta.thinking\`), plus a one-shot \`signature_delta\` that closes a thinking block. We'll mostly ignore those — but knowing they exist means you won't be surprised when they show up.`,
        },
        {
          kind: "code_comparison",
          label: "the two delta shapes side by side",
          left: {
            title: "text_delta (concatenate as strings)",
            code: `event: content_block_delta
data: {
  "type": "content_block_delta",
  "index": 0,
  "delta": {
    "type": "text_delta",
    "text": "ello frien"
  }
}`,
            annotation:
              "Just append `delta.text` to your running buffer. Always valid UTF-8.",
          },
          right: {
            title: "input_json_delta (concatenate, parse at the END)",
            code: `event: content_block_delta
data: {
  "type": "content_block_delta",
  "index": 1,
  "delta": {
    "type": "input_json_delta",
    "partial_json": "{\\"location\\": \\"San Fra"
  }
}`,
            annotation:
              "Buffer the partial_json strings; do NOT json.loads until content_block_stop.",
          },
          takeaway:
            "Both deltas concatenate. The difference is when you can USE the buffer. Text is usable after every delta (you can render the partial reply). JSON is only valid after the content_block_stop for that index.",
        },
        {
          kind: "code_predict",
          label: "concatenating text deltas",
          code: `# Pretend these came from the wire one at a time.
events = [
    {"type": "content_block_delta", "index": 0,
     "delta": {"type": "text_delta", "text": "Hello"}},
    {"type": "content_block_delta", "index": 0,
     "delta": {"type": "text_delta", "text": ", "}},
    {"type": "content_block_delta", "index": 0,
     "delta": {"type": "text_delta", "text": "world"}},
    {"type": "content_block_delta", "index": 0,
     "delta": {"type": "text_delta", "text": "!"}},
]

buffer = ""
for event in events:
    if event["delta"]["type"] == "text_delta":
        buffer += event["delta"]["text"]

print(buffer)`,
          output: "Hello, world!",
          explanation:
            "The whole pattern is `buffer += delta.text` on every `text_delta`. No special handling, no parsing. The string is always valid mid-stream — you can render it directly in a UI as it grows.",
        },
        {
          kind: "warm_up",
          title: "why you cannot parse partial_json mid-stream",
          prompt:
            "You've accumulated `partial_json = '{\"location\": \"San Fra'` from three deltas so far. Why is it unsafe to call `json.loads(partial_json)` right now?",
          answer:
            "Because the string is mid-token: there is no closing quote on `\"San Fra`, no closing `}` for the object, and no value to follow. `json.loads` would raise `JSONDecodeError`.",
          explanation:
            "The partial JSON is byte-level fragments of what will eventually be a complete object. The model can split a key or value at any byte boundary. You MUST wait for `content_block_stop` for that index before parsing. (Pydantic has a partial-JSON parser if you really need to inspect args mid-flight, but for normal flows: wait.)",
        },
      ],
    },

    // ================================================================
    // 5. Using the SDK (the easy path)
    // ================================================================
    {
      title: "Using the SDK (the easy path)",
      blocks: [
        {
          kind: "prose",
          markdown: `In production you almost never hand-parse SSE bytes. The Python SDK gives you two ergonomic entry points:

1. **\`client.messages.stream(...)\`** — a *context manager* that auto-accumulates events. It exposes \`text_stream\` (a generator of text fragments) and \`get_final_message()\` (returns the full \`Message\` object after the stream ends). This is the path you want 90% of the time.

2. **\`client.messages.create(..., stream=True)\`** — returns a raw event iterator. Use this only when you need per-event hooks (custom tool-arg routing, mid-stream cancellation logic, fine-grained metrics).

Same network call under the hood. Same events on the wire. Different ergonomics on top.`,
        },
        {
          kind: "code_predict",
          label: "the high-level helper: text_stream",
          code: `import anthropic

client = anthropic.Anthropic()

with client.messages.stream(
    model="claude-opus-4-7",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Say hello world."}],
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)

print()  # newline at end`,
          output: "Hello, world!",
          explanation:
            "`stream.text_stream` is a generator that yields *just the text fragments* — it filters out non-text events (ping, content_block_start, etc.) and concatenates `text_delta.text` values for you. The `with` block opens the HTTP stream; exiting it cleanly closes the connection. This is the canonical chat-UI pattern: pipe `text_stream` into your renderer and forget the protocol exists.",
        },
        {
          kind: "code_comparison",
          label: "high-level vs low-level",
          left: {
            title: "messages.stream() — high level",
            code: `with client.messages.stream(
    model="claude-opus-4-7",
    max_tokens=1024,
    messages=msgs,
) as stream:
    for text in stream.text_stream:
        ui.append(text)

    final = stream.get_final_message()
    log(final.usage)`,
            annotation:
              "Context manager + helpers. text_stream yields strings. get_final_message() returns a complete Message.",
          },
          right: {
            title: "messages.create(stream=True) — raw events",
            code: `stream = client.messages.create(
    model="claude-opus-4-7",
    max_tokens=1024,
    messages=msgs,
    stream=True,
)
for event in stream:
    if event.type == "content_block_delta":
        if event.delta.type == "text_delta":
            ui.append(event.delta.text)
        elif event.delta.type == "input_json_delta":
            tool_buf += event.delta.partial_json`,
            annotation:
              "Plain iterator. You match on event.type and event.delta.type yourself.",
          },
          takeaway:
            "For chat: use `messages.stream` and `text_stream`. Drop to raw events only when you need fine-grained control (tool routing, per-event metrics, custom cancellation).",
        },
        {
          kind: "multiple_choice",
          title: "when should you drop to raw events?",
          prompt:
            "You're designing the stream-handling layer for a new agent harness. The harness needs to: route assistant text to a UI, accumulate tool args per index, emit a custom metric on every block_start, and support cancellation when a user navigates away. Which API surface is the right choice?",
          choices: [
            {
              text: "`messages.stream()` with `text_stream` — let the SDK do the work.",
              correct: false,
              rationale:
                "`text_stream` only yields text. It does not surface block_start events or expose tool_use input_json_deltas for routing. You'd lose visibility on the events you need.",
            },
            {
              text: "`messages.create(stream=True)` — iterate raw events.",
              correct: true,
              rationale:
                "Raw events give you per-event hooks for routing, metrics, and cancellation. You match on `event.type` and `event.delta.type` yourself. This is the right tier when you need fine-grained control.",
            },
            {
              text: "Two separate calls in parallel — one streaming and one not — to get both.",
              correct: false,
              rationale:
                "You'd pay double and duplicate generation. The same single stream can serve all your needs if you iterate raw events.",
            },
            {
              text: "Skip streaming entirely and poll for the final message.",
              correct: false,
              rationale:
                "You'd lose TTFT and the ability to cancel early. Streaming is a hard requirement for any agent that needs incremental visibility or early termination.",
            },
          ],
          explanation:
            "Rule of thumb: `messages.stream()` for chat-UI cases where you just want text rendered. `messages.create(stream=True)` when you need to react to specific events (tool routing, custom metrics, mid-stream branching). They are the same network call — only the Python surface differs.",
        },
      ],
    },

    // ================================================================
    // 6. Streaming + tool use: assembling input_json_delta
    // ================================================================
    {
      title: "Streaming + tool use: assembling input_json_delta",
      blocks: [
        {
          kind: "prose",
          markdown: `When Claude calls a tool, the arguments arrive piece by piece as \`input_json_delta\` events. You don't get the parsed object — you get *fragments of the JSON string* that you must concatenate, then parse once.

The trick is that multiple content blocks can stream in the same response. A typical tool-use stream looks like:

\`\`\`
content_block_start  index=0  (text: "Let me check the weather...")
content_block_delta  index=0  text_delta
content_block_delta  index=0  text_delta
content_block_stop   index=0

content_block_start  index=1  (tool_use: get_weather)
content_block_delta  index=1  input_json_delta  partial_json: "{\\"loc"
content_block_delta  index=1  input_json_delta  partial_json: "ation\\": \\""
content_block_delta  index=1  input_json_delta  partial_json: "San Francisco\\"}"
content_block_stop   index=1
\`\`\`

Each block has its own \`index\`. You buffer per index. You parse on \`content_block_stop\`.

(This guide does NOT re-teach the tool-use loop itself — see the "Tool use loop implementation" guide for the loop invariant, \`tool_result\` wiring, and parallel tool calls. Here we cover *only* how the args arrive over the wire.)`,
        },
        {
          kind: "scenario_predict",
          label: "interleaved deltas for two blocks",
          scenario: `event: content_block_delta
data: {"index":0,"delta":{"type":"text_delta","text":"Let me check"}}

event: content_block_delta
data: {"index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"loc"}}

event: content_block_delta
data: {"index":0,"delta":{"type":"text_delta","text":" the weather."}}

event: content_block_delta
data: {"index":1,"delta":{"type":"input_json_delta","partial_json":"ation\\":\\"SF\\"}"}}`,
          language: "text",
          question:
            "Two content blocks are streaming with overlapping deltas. What single field do you use to know which block each delta belongs to?",
          answer:
            "`index`. Block 0 is the text block; block 1 is the tool_use. You keep a per-index buffer (e.g. `buffers[0]` for text, `buffers[1]` for partial_json) and route each delta by `event.index`.",
          explanation:
            "`content_block_index` is the demultiplexing key. In practice most current models *don't* fully interleave deltas across blocks (they finish one before starting the next), but the protocol allows it and your parser MUST handle it. Future models may stream blocks more concurrently — code defensively now.",
        },
        {
          kind: "code_predict",
          label: "buffering tool args per index",
          code: `import json

# Pretend these came off the wire in order.
events = [
    {"type": "content_block_start", "index": 1,
     "content_block": {"type": "tool_use", "id": "toolu_01", "name": "get_weather", "input": {}}},
    {"type": "content_block_delta", "index": 1,
     "delta": {"type": "input_json_delta", "partial_json": "{\\"loc"}},
    {"type": "content_block_delta", "index": 1,
     "delta": {"type": "input_json_delta", "partial_json": "ation\\": \\"SF\\"}"}},
    {"type": "content_block_stop", "index": 1},
]

buffers = {}
parsed = {}
for event in events:
    if event["type"] == "content_block_start":
        buffers[event["index"]] = ""
    elif event["type"] == "content_block_delta" and event["delta"]["type"] == "input_json_delta":
        buffers[event["index"]] += event["delta"]["partial_json"]
    elif event["type"] == "content_block_stop":
        if event["index"] in buffers:
            parsed[event["index"]] = json.loads(buffers[event["index"]])

print(parsed)`,
          output: "{1: {'location': 'SF'}}",
          explanation:
            "Three rules: (1) on `content_block_start`, initialize `buffers[index] = \"\"`. (2) on every `input_json_delta`, append `partial_json` to `buffers[index]`. (3) on `content_block_stop`, run `json.loads` on the buffer. This is the entire pattern — it's the same shape for every tool, every model.",
        },
        {
          kind: "mini_challenge",
          title: "Build a complete event router",
          prompt: `Write a function \`route_stream(events)\` that takes an iterator of streaming event dicts and returns a tuple \`(final_text, tool_calls)\`.

- \`final_text\` is the concatenation of every \`text_delta.text\` (all text blocks joined).
- \`tool_calls\` is a list of dicts, each shaped \`{"id": str, "name": str, "input": dict}\`, in the order their content blocks started.

The function must handle:
- text blocks and tool_use blocks interleaved by \`index\`
- multiple tool_use blocks in one response (parallel tool calls)
- ignoring \`ping\` events
- empty inputs (a tool_use with no partial_json deltas — just \`content_block_start\` then \`content_block_stop\`; the input is \`{}\`)`,
          hints: [
            "Maintain three structures: a dict `tool_meta[index] = {id, name}` captured at content_block_start, a dict `tool_json[index] = ''` for buffered partial_json, and a list `text_pieces`.",
            "On `content_block_start`, look at `content_block.type`. If `text`, do nothing. If `tool_use`, record id and name in tool_meta and initialize tool_json[index] to ''.",
            "On `content_block_delta`, dispatch on `delta.type`: `text_delta` → append to text_pieces; `input_json_delta` → append to tool_json[index].",
            "On `content_block_stop`, if this index is a tool_use, parse tool_json[index] (default `{}` if buffer is empty) and append the assembled tool_call dict to your output list.",
            "Skip everything else (`message_start`, `message_delta`, `message_stop`, `ping`, unknown types).",
          ],
          solution: `import json

def route_stream(events):
    text_pieces = []
    tool_meta = {}     # index -> {"id": str, "name": str}
    tool_json = {}     # index -> accumulated partial_json string
    tool_order = []    # indices in start order

    for event in events:
        et = event.get("type")

        if et == "content_block_start":
            idx = event["index"]
            block = event["content_block"]
            if block["type"] == "tool_use":
                tool_meta[idx] = {"id": block["id"], "name": block["name"]}
                tool_json[idx] = ""
                tool_order.append(idx)

        elif et == "content_block_delta":
            delta = event["delta"]
            dt = delta["type"]
            if dt == "text_delta":
                text_pieces.append(delta["text"])
            elif dt == "input_json_delta":
                idx = event["index"]
                tool_json[idx] = tool_json.get(idx, "") + delta["partial_json"]

        elif et == "content_block_stop":
            idx = event["index"]
            if idx in tool_meta:
                raw = tool_json.get(idx, "")
                parsed = json.loads(raw) if raw else {}
                tool_meta[idx]["input"] = parsed

        # ignore message_start, message_delta, message_stop, ping, error

    tool_calls = [tool_meta[i] for i in tool_order]
    return "".join(text_pieces), tool_calls`,
          takeaway:
            "Two structures keyed by `index`, one list of text pieces, dispatch on `event.type` and `delta.type`. This same skeleton handles every tool-use stream you'll ever process. If you can write this from memory, you've internalized the streaming protocol.",
        },
        {
          kind: "key_insight",
          label: "content_block_index is the demux key",
          insight: `Multiple content blocks stream concurrently in principle, and even in practice when the model emits a text block AND a tool_use block in one turn. **\`index\` (0, 1, 2…) is what tells you which block a delta updates.** Always key your per-block state by \`index\`, not by order of arrival.

A common bug: treating the first \`input_json_delta\` you see as "the tool" without checking its index. If a model first streams text then a tool_use, the text deltas are index 0 and the tool args are index 1. Your buffer must be keyed correctly.`,
        },
      ],
    },

    // ================================================================
    // 7. Errors and aborts mid-stream
    // ================================================================
    {
      title: "Errors and aborts mid-stream",
      blocks: [
        {
          kind: "prose",
          markdown: `A live HTTP stream can fail in three distinct ways, and each has different recovery semantics. Mixing them up is one of the most common production bugs we see.

1. **The server sends an \`error\` event.** A typed payload arrives mid-stream (most commonly \`overloaded_error\`, the streaming equivalent of HTTP 529). The connection then closes; **no \`message_stop\` follows**.
2. **The network drops.** The TCP socket dies (timeout, proxy hiccup, client wifi). You may have received partial events; you got no terminator at all.
3. **You cancel.** The user navigates away, your timeout fires, or you hit a budget guard. You close the iterator and exit the \`with\` block.

In all three cases you may be sitting on partial text. The question is: **what is it safe to do with that text?**`,
        },
        {
          kind: "scenario_predict",
          label: "an error event in the wild",
          scenario: `event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" how OAuth"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" works"}}

event: error
data: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}

(connection closed — no content_block_stop, no message_delta, no message_stop)`,
          language: "text",
          question:
            "The previously-streamed text fragments (`...how OAuth works`) — are they (a) still valid output you can render, or (b) corrupt/should be discarded? And what is missing that you'd normally have at end-of-stream?",
          answer:
            "(a) The text is valid as-is — it's a literal prefix of what the model was generating. You can render it to the user. But you are missing the final `stop_reason` (so you don't know if the generation 'naturally ended' or hit length), and you never got a cumulative `output_tokens` for the partial run. Treat the response as INCOMPLETE — not corrupt, just unfinished.",
          explanation:
            "Anthropic does not retract or invalidate text it has already sent. When the stream errors out, what you've received is real model output. The risk isn't corrupt bytes; the risk is treating partial output as a complete answer. UX guidance: show what you have plus a 'response interrupted, retry?' affordance.",
        },
        {
          kind: "key_insight",
          label: "Treat partial output as suspect, not garbage",
          insight: `Partial streamed text is **factually correct** as a prefix of what the model intended to say — but it is **semantically incomplete** as an answer. Don't:

- store it as a final assistant message in your conversation history (you'll feed a half-thought back as context next turn)
- show it as the answer in an eval rubric
- treat the user's question as "answered"

Do:
- show it in the UI so the user knows progress was made
- flag the conversation as needing a retry
- log the partial response with the request_id for debugging
- decide whether to retry from scratch or use the **error-recovery resume pattern** (covered briefly below)`,
        },
        {
          kind: "flashcard",
          context: "Billing on early termination.",
          front:
            "Your stream got an `error` event after 5 seconds of streaming and disconnected. What are you billed for?",
          back: "**Input tokens** in full (you already sent them). **Output tokens** for whatever the model generated up to the error — but you only have a precise count if a `message_delta` arrived before the error. In the common case (error mid-block, no `message_delta`), check the **error response itself** and the request_id in headers; Anthropic's billing reflects actual generated tokens, not the count you happened to observe.",
        },
        {
          kind: "multiple_choice",
          title: "the safe abort pattern",
          prompt:
            "You're using `with client.messages.stream(...) as stream:` and a user just clicked 'cancel'. Which is the cleanest way to terminate streaming?",
          code: `with client.messages.stream(model="claude-opus-4-7", max_tokens=4096, messages=msgs) as stream:
    for text in stream.text_stream:
        ui.append(text)
        if cancel_event.is_set():
            ???`,
          choices: [
            {
              text: "`break` out of the for-loop. The `with` block's __exit__ will close the HTTP connection cleanly.",
              correct: true,
              rationale:
                "This is the canonical pattern. Breaking out of the iterator unwinds the `with`, which calls the SDK's cleanup logic, which closes the underlying HTTP response. The server stops generating on the next chunk attempt.",
            },
            {
              text: "Set a global flag and let the loop exit naturally on the next event.",
              correct: false,
              rationale:
                "Same effect as `break`, but more code and more chances for a bug (forgetting to check the flag, racy reads). Just `break`.",
            },
            {
              text: "Call `os._exit(0)` to terminate the process immediately.",
              correct: false,
              rationale:
                "Kills the whole process. You lose all in-flight work, all logging, and any other streams. Do not do this.",
            },
            {
              text: "Send a TCP RST manually via the socket layer.",
              correct: false,
              rationale:
                "Reaches under the SDK's abstractions, bypasses cleanup hooks, and is platform-dependent. `break` does the right thing with three characters.",
            },
          ],
          explanation:
            "The Pythonic and idiomatic answer: `break` to exit the iterator, let the `with` block close the connection via its `__exit__` method. The SDK handles the socket teardown. Servers will stop generating tokens within a few hundred milliseconds of the client disconnect.",
        },
        {
          kind: "prose",
          markdown: `**A note on error recovery.** For long generations that fail partway, Anthropic supports a "resume" pattern: capture the partial text, then issue a follow-up request with that text as context and ask the model to continue from where it left off. The exact wiring differs between Claude 4.5-and-earlier (prefill the partial as an assistant message) and Claude 4.6-and-later (send a user message instructing the model to continue). For most chat UIs, a simple retry-from-scratch is fine; resume becomes useful for very long generations (60k+ token analyses) where re-running is expensive.`,
        },
      ],
    },

    // ================================================================
    // 8. Prompt caching: the mental model
    // ================================================================
    {
      title: "Prompt caching: the mental model",
      blocks: [
        {
          kind: "prose",
          markdown: `Switch gears. We're done with streaming for a few sections; now we tackle **prompt caching** — a feature with very different mechanics but a similarly large impact on production deployments.

Here's the problem caching solves. Suppose your assistant has a 15,000-token system prompt (think: detailed role, tool descriptions, policy docs, retrieval context). Every single user turn re-sends those 15,000 tokens to Claude, and Claude re-processes them from scratch. You pay for them, and they slow down TTFT.

Caching lets you say: "I've already shown you these 15,000 tokens; remember them." On the next call, Claude reuses the pre-computed internal state for that prefix and only processes the *new* tokens. **You pay a small one-time write premium** (1.25× the base rate for 5-minute cache, 2× for 1-hour cache) and then **deeply discounted reads** (0.1× the base rate) on every subsequent call within the TTL.

It's the same model, the same output, the same API surface. The only thing that changes is how the prefix is processed.`,
        },
        {
          kind: "key_insight",
          label: "Caching is prefix-only",
          insight: `The cache works on a **prefix** of your request. You place a marker (\`cache_control\`) on a block; everything *up to and including* that block becomes a cacheable prefix. Anything *after* that block is fresh on every call.

This means:
- **Order matters.** Identical bytes in identical positions = cache hit. Re-order tool definitions and you get a miss.
- **You can only cache stable content.** A timestamp baked into the prompt before the cache breakpoint will defeat caching — every call will be a new prefix.
- **The cached state lives server-side as KV cache.** You don't see it, you don't manage it. You just send the same prefix again within the TTL and pay the discounted read rate.`,
        },
        {
          kind: "scenario_predict",
          label: "what gets cached?",
          scenario: `{
  "model": "claude-opus-4-7",
  "max_tokens": 1024,
  "tools": [
    { "name": "search_docs", "description": "...", "input_schema": {...} },
    { "name": "get_doc",     "description": "...", "input_schema": {...} }
  ],
  "system": [
    { "type": "text", "text": "You are a helpful research assistant..." },
    {
      "type": "text",
      "text": "[12,000 tokens of company policy documents]",
      "cache_control": {"type": "ephemeral"}
    }
  ],
  "messages": [
    { "role": "user", "content": "What is the parental leave policy?" }
  ]
}`,
          language: "json",
          question:
            "A `cache_control` breakpoint sits on the last system block. Which parts of this request get cached, and which are fresh on every call?",
          answer:
            "**Cached (the prefix up to and including the breakpoint):** both tool definitions, the 'You are a helpful research assistant...' system block, AND the 12,000-token policy document block. **Fresh on every call:** the user message in `messages`.",
          explanation:
            "Caching follows the canonical order `tools → system → messages`. A breakpoint on the last system block caches everything in tools AND everything in system up through that block. The user message comes *after* the breakpoint, so it's re-processed each call. This is exactly what you want: cache the stable prefix (tools + policy docs), pay full price only for the changing user turn.",
        },
        {
          kind: "warm_up",
          title: "the fingerprint rule",
          prompt:
            "You change a single word in your cached system prompt — say, 'helpful' → 'helpfull' (typo). What happens on the next call?",
          answer:
            "Cache miss. You pay the write premium again to populate a new cache entry with the new prefix bytes.",
          explanation:
            "Cache identity is byte-exact. Whitespace, casing, ordering, even trailing newlines — any change at all and the prefix hash differs and you get a miss. Build cached prefixes deterministically: same string serialization, same tool order, same JSON shape every time.",
        },
      ],
    },

    // ================================================================
    // 9. cache_control syntax and placement
    // ================================================================
    {
      title: "cache_control syntax and placement",
      blocks: [
        {
          kind: "prose",
          markdown: `The \`cache_control\` field is tiny. There are exactly two valid forms:

\`\`\`json
{"type": "ephemeral"}                    // 5-minute TTL (default)
{"type": "ephemeral", "ttl": "1h"}       // 1-hour TTL (2× write premium)
\`\`\`

\`"ephemeral"\` is currently the only supported \`type\`. The \`ttl\` field is optional; if you omit it you get 5 minutes.

You attach \`cache_control\` to a **block** in your request — not to the whole request. Valid placements:

- on a single **tool definition** (last tool in the array, to cache tools + everything before)
- on a single **system block** (when system is a list of typed blocks, e.g. \`[{"type":"text", "text":"..."}]\`)
- on a single **message content block** (text, image, document, tool_use, or tool_result block — image/document only on user turns)`,
        },
        {
          kind: "prose",
          markdown: `**Canonical order: \`tools → system → messages\`.** When you place a breakpoint, *everything earlier in the canonical order is also cached* — you can't skip ahead.

So a breakpoint on the *last system block* caches:
1. all of \`tools\` (canonical order — tools come first)
2. all of \`system\` up through that block

A breakpoint on the *last message content block* caches:
1. all of \`tools\`
2. all of \`system\`
3. all of \`messages\` up through that block (including the marked block itself)

This means **the placement of your breakpoint defines the size of your cached prefix.** Later breakpoint = bigger prefix = more cached tokens (but only if the bigger prefix is still stable).

**The hard cap:** up to **4 explicit \`cache_control\` breakpoints per request.** Hit a fifth and the API returns a 400. (There's also an "automatic" caching mode where you put \`cache_control\` at the top level and the system places the breakpoint on the last cacheable block for you — useful for growing conversations.)`,
        },
        {
          kind: "code_comparison",
          label: "where to place the breakpoint",
          left: {
            title: "Breakpoint on the system block",
            code: `{
  "tools": [tool_a, tool_b],
  "system": [
    {
      "type": "text",
      "text": "...big stable instructions...",
      "cache_control": {"type": "ephemeral"}
    }
  ],
  "messages": [
    {"role": "user", "content": "..."}
  ]
}`,
            annotation: "Caches: tools (a, b) + system. User msg is fresh.",
          },
          right: {
            title: "Breakpoint on a message content block",
            code: `{
  "tools": [tool_a, tool_b],
  "system": [{"type": "text", "text": "..."}],
  "messages": [
    {"role": "user", "content": [
      {"type": "text", "text": "...12k token retrieved doc..."},
      {"type": "text", "text": "Question: ...",
       "cache_control": {"type": "ephemeral"}}
    ]}
  ]
}`,
            annotation:
              "Caches: tools + system + the entire user message (doc + question).",
          },
          takeaway:
            "Push the breakpoint as late as possible — into the largest stable section — to maximize the cached prefix size. But not so late that you cache something that changes per call.",
        },
        {
          kind: "scenario_predict",
          label: "valid vs invalid placement",
          scenario: `{
  "model": "claude-opus-4-7",
  "max_tokens": 1024,
  "tools": [
    {"name": "t1", "input_schema": {}, "cache_control": {"type": "ephemeral"}}
  ],
  "system": [
    {"type": "text", "text": "...", "cache_control": {"type": "ephemeral"}}
  ],
  "messages": [
    {"role": "user", "content": [
      {"type": "text", "text": "...", "cache_control": {"type": "ephemeral"}},
      {"type": "text", "text": "...", "cache_control": {"type": "ephemeral"}},
      {"type": "text", "text": "...", "cache_control": {"type": "ephemeral"}}
    ]}
  ]
}`,
          language: "json",
          question:
            "Count the `cache_control` breakpoints in this request and predict what the API does.",
          answer:
            "Five breakpoints (1 on tool + 1 on system + 3 on user message blocks). The API rejects this request with a 400 error. The maximum is **4 explicit breakpoints per request**.",
          explanation:
            "When you genuinely need more than 4 cached segments, you can't get them — the limit is a hard cap. Most production requests need only 1–2 breakpoints: one on the system block to cache 'instructions + tools,' optionally one more on the last assistant turn to cache the conversation history.",
        },
        {
          kind: "method_ref",
          title: "cache_control",
          importLine: "// Field in a tool / system block / message content block",
          methods: [
            {
              signature: '{"type": "ephemeral"}',
              description:
                "Marks the block as a cache breakpoint with the default 5-minute sliding TTL. Cheapest write premium (1.25× base input rate).",
              returns: "5m cache entry.",
            },
            {
              signature: '{"type": "ephemeral", "ttl": "1h"}',
              description:
                "Same, but with a 1-hour sliding TTL. Higher write premium (2× base input rate); same read discount (0.1×).",
              returns: "1h cache entry.",
            },
            {
              signature: "Placement: last tool in tools[]",
              description:
                "Caches all tools. Useful when tool definitions are stable across requests.",
            },
            {
              signature: "Placement: a system block (in system[])",
              description:
                "Caches tools + system up through this block. The most common placement.",
            },
            {
              signature: "Placement: a message content block",
              description:
                "Caches tools + system + messages up through this block. Used for caching retrieved docs or growing conversation history.",
            },
            {
              signature: "Hard limits",
              description:
                "Maximum 4 breakpoints per request. Minimum cacheable prefix: 4,096 tokens (Opus 4.7, Haiku 4.5) or 1,024 tokens (Sonnet 4.6, 4.5). Prefixes shorter than the minimum are silently NOT cached — no error.",
            },
          ],
        },
      ],
    },

    // ================================================================
    // 10. TTLs, billing, and the usage object
    // ================================================================
    {
      title: "TTLs, billing, and the usage object",
      blocks: [
        {
          kind: "prose",
          markdown: `Two TTL options, two pricing tiers:

| TTL  | Write multiplier | Read multiplier | Use when                                     |
|------|------------------|-----------------|----------------------------------------------|
| 5m   | 1.25× base       | 0.1× base       | Default. Active chat sessions, frequent reuse. |
| 1h   | 2× base          | 0.1× base       | Less frequent reuse, e.g. a knowledge base hit a few times per hour. |

The TTL is **sliding**: every cache hit refreshes the entry to the full TTL, at no extra cost. So a popular 5-minute cache that gets a hit every minute will live for as long as traffic keeps coming.

The break-even math is straightforward. For 5m cache, you pay an extra 0.25× to write; each read saves you 0.9× vs an uncached call. So **two hits** make 5m caching profitable. For 1h cache (write costs an extra 1×), you need about **eleven hits** to break even.

That's why the default is 5m — almost any reuse pattern beats break-even quickly. You reach for 1h when traffic is sporadic but you still want hits.`,
        },
        {
          kind: "prose",
          markdown: `**The \`usage\` object — read it carefully.** A cached response looks like this:

\`\`\`json
"usage": {
  "input_tokens": 50,
  "cache_creation_input_tokens": 0,
  "cache_read_input_tokens": 12000,
  "output_tokens": 503,
  "cache_creation": {
    "ephemeral_5m_input_tokens": 0,
    "ephemeral_1h_input_tokens": 0
  }
}
\`\`\`

There are four token fields to decode:

- **\`input_tokens\`** — tokens **after the last cache breakpoint**. This is the *uncached* tail. NOT total input.
- **\`cache_creation_input_tokens\`** — tokens written to the cache on THIS call. Non-zero = you just paid the write premium.
- **\`cache_read_input_tokens\`** — tokens served from the cache on THIS call. Non-zero = you got the discounted read.
- **\`output_tokens\`** — same as always.

**Total input the model processed:** \`cache_read + cache_creation + input_tokens\`.

The most common mistake here is reading \`input_tokens\` and thinking it's the whole input. It's not — with caching, the cached portion has moved to \`cache_read_input_tokens\`. Treating \`input_tokens\` as the total will badly under-report your actual usage in budgeting code.`,
        },
        {
          kind: "scenario_predict",
          label: "reading the usage block",
          scenario: `"usage": {
  "input_tokens": 73,
  "cache_creation_input_tokens": 0,
  "cache_read_input_tokens": 14820,
  "output_tokens": 412
}`,
          language: "json",
          question:
            "Three questions: (a) Was this a cache hit or miss? (b) How many input tokens did the model process from scratch (not from cache)? (c) What was the total input to the model?",
          answer:
            "(a) Cache **hit** — `cache_read_input_tokens > 0` and `cache_creation_input_tokens == 0`. (b) Only **73** tokens were processed fresh (that's `input_tokens`, the tail after the breakpoint). (c) Total input was `14820 + 0 + 73 = 14,893` tokens.",
          explanation:
            "This is the readout you want to see in production. A tiny `input_tokens` (the per-call user turn) plus a large `cache_read_input_tokens` (your reused system prompt + tools + docs). The math you bill against: read tokens at 0.1× rate, plus the 73 fresh tokens at 1× rate.",
        },
        {
          kind: "multiple_choice",
          title: "is the cache paying off?",
          prompt:
            "You're caching a 20,000-token system prompt with the **1-hour TTL** on Claude Opus (base input $5/MTok, 1h write = $10/MTok, read = $0.50/MTok). Your workload hits this prompt 10 times per hour. Per hour, what does the cache cost vs no caching?",
          choices: [
            {
              text: "Cached: 1 write + 9 reads → (20k × $10/MTok) + (9 × 20k × $0.50/MTok) = $0.20 + $0.09 = $0.29.  Uncached: 10 × 20k × $5/MTok = $1.00. **Saving: $0.71/hr (~71%).**",
              correct: true,
              rationale:
                "Per hour you pay one write premium ($0.20) and nine discounted reads ($0.09). Without caching you'd pay $1.00 for ten full passes. Big win.",
            },
            {
              text: "Cached: 10 writes × $10/MTok × 20k = $2.00. Uncached: $1.00. Cache is more expensive.",
              correct: false,
              rationale:
                "Wrong — the cache is only written once and then refreshed by hits for free. You don't pay the write premium 10 times.",
            },
            {
              text: "Caching saves money only on the first call; subsequent calls cost the same as uncached.",
              correct: false,
              rationale:
                "Backwards. The cache write is more expensive than a normal input; the savings come from cache READS (0.1× base). Reuse is where the win is.",
            },
            {
              text: "Caching never beats 1× base for read-heavy workloads above 8 hits.",
              correct: false,
              rationale:
                "Reads are 0.1× base — they always beat a fresh pass at 1× base. The only question is whether you have enough reuse to amortize the write premium.",
            },
          ],
          explanation:
            "The mental model: caching is a prepayment. You overpay slightly on the first call (write premium) in exchange for 10× cheaper reads for the rest of the TTL window. The break-even point for 5m cache is ~2 hits; for 1h cache it's ~11 hits. Beyond that, the savings compound rapidly.",
        },
        {
          kind: "key_insight",
          label: "cache_creation = miss + write; cache_read = hit",
          insight: `Two fields, two states, no overlap *for a single breakpoint* — but you can see BOTH non-zero in one response if you have multiple breakpoints with mixed hit/miss outcomes. For example: tools+system cached and hit (\`cache_read\`), but a newly-added doc block missed and wrote (\`cache_creation\`).

**Quick read:**
- \`cache_creation_input_tokens > 0\` → you paid the 1.25× (or 2×) premium on those tokens this call.
- \`cache_read_input_tokens > 0\` → you got the 0.1× discount on those tokens this call.
- Both zero → no caching happened (prefix too short, or no \`cache_control\` placed).

The companion field \`cache_creation\` breaks down the write tokens by TTL: \`ephemeral_5m_input_tokens\` vs \`ephemeral_1h_input_tokens\`. Useful when you're caching with mixed TTLs and want to reconcile the bill.`,
        },
      ],
    },

    // ================================================================
    // 11. Caching in practice (production patterns)
    // ================================================================
    {
      title: "Caching in practice (production patterns)",
      blocks: [
        {
          kind: "prose",
          markdown: `Three patterns cover ~95% of real caching deployments:

**Pattern A: Cache the system prompt + tools.** Most common. Place one breakpoint on the last system block. Everything before (all tools, all system text) gets cached. The per-call user turn is fresh. This is the default for any agent with a non-trivial role or tool list.

**Pattern B: Cache a long RAG context.** For RAG, the retrieved document is usually large and stable for the duration of a session. Put the doc inside the user message and place a breakpoint on its block (or, in some patterns, on the system block if you embed the doc there). Subsequent follow-up questions on the same doc hit the cache.

**Pattern C: Cache the conversation history.** In a long chat, prior turns become eligible for caching. Place a breakpoint on the most recent assistant turn so the next user message is the only fresh tokens. Each new turn re-runs this — the breakpoint marches forward through the conversation.

Below we show A and C in code, since those generalize.`,
        },
        {
          kind: "code_predict",
          label: "Pattern A: system + tools cached (first call)",
          code: `import anthropic

client = anthropic.Anthropic()

SYSTEM = "You are a helpful research assistant for ACME Corp. " * 600  # ~12k tokens

response = client.messages.create(
    model="claude-opus-4-7",
    max_tokens=512,
    system=[
        {
            "type": "text",
            "text": SYSTEM,
            "cache_control": {"type": "ephemeral"},
        }
    ],
    messages=[{"role": "user", "content": "What's the parental leave policy?"}],
)

u = response.usage
print(
    f"input_tokens={u.input_tokens} "
    f"cache_creation={u.cache_creation_input_tokens} "
    f"cache_read={u.cache_read_input_tokens}"
)`,
          output:
            "input_tokens=18 cache_creation=12063 cache_read=0",
          explanation:
            "First call → cache miss → the 12k-token system prompt is written to cache (`cache_creation=12063`) and the 18-token user message is processed fresh (`input_tokens=18`). You paid 1.25× the base rate on those 12k tokens — the write premium. Now the cache is warm for the next 5 minutes (sliding).",
        },
        {
          kind: "code_predict",
          label: "Pattern A: same call repeated within the TTL window",
          code: `# Exact same call as before, run 30 seconds later
response = client.messages.create(
    model="claude-opus-4-7",
    max_tokens=512,
    system=[
        {
            "type": "text",
            "text": SYSTEM,  # byte-identical
            "cache_control": {"type": "ephemeral"},
        }
    ],
    messages=[{"role": "user", "content": "What about bereavement leave?"}],
)

u = response.usage
print(
    f"input_tokens={u.input_tokens} "
    f"cache_creation={u.cache_creation_input_tokens} "
    f"cache_read={u.cache_read_input_tokens}"
)`,
          output:
            "input_tokens=17 cache_creation=0 cache_read=12063",
          explanation:
            "Cache HIT. The 12,063-token prefix is served from cache at 0.1× the base rate (`cache_read`). The 17-token new user message is the only thing processed fresh. The TTL also resets — the cache will now live another 5 minutes from this moment. Repeat this 9 more times in the next 5 minutes and you've recouped the original write premium ~3× over.",
        },
        {
          kind: "mini_challenge",
          title: "Cache a growing conversation history",
          prompt: `Write a function \`chat_with_cached_history(client, system_text, history, new_user_message)\` that:

- Sends \`new_user_message\` as the latest user turn.
- Places a single \`cache_control\` breakpoint on the **most recent assistant message in \`history\`** (if there is one). This means: cache everything through the prior assistant turn; only the new user message is fresh.
- If \`history\` is empty (first turn), just cache the system prompt instead.
- Returns the response object.

\`history\` is a list of \`{"role": "user"|"assistant", "content": str}\` dicts.

The point: after each round, you append \`(user, assistant)\` to history; on the next round the breakpoint marches forward to the latest assistant turn. Token spend per round stays roughly flat as the conversation grows, instead of growing linearly.`,
          hints: [
            "Find the index of the most recent assistant message in `history` (the last one whose role is 'assistant').",
            "Convert that message's content from a plain string to a list-of-blocks form: `[{'type': 'text', 'text': msg['content'], 'cache_control': {'type': 'ephemeral'}}]`. All other messages can stay as `{'role': ..., 'content': str}`.",
            "If history has no assistant turns yet, put `cache_control` on the system block instead (so something still gets cached if the system prompt is big enough).",
            "Append the new_user_message as a normal `{'role': 'user', 'content': new_user_message}` at the end — NO cache_control on it (it changes every call).",
          ],
          solution: `def chat_with_cached_history(client, system_text, history, new_user_message):
    # Find the most recent assistant message
    last_assistant_idx = None
    for i in range(len(history) - 1, -1, -1):
        if history[i]["role"] == "assistant":
            last_assistant_idx = i
            break

    if last_assistant_idx is not None:
        # Mark the most recent assistant turn for caching;
        # everything before it (tools, system, all prior turns) is cached too.
        messages = []
        for i, msg in enumerate(history):
            if i == last_assistant_idx:
                messages.append({
                    "role": "assistant",
                    "content": [{
                        "type": "text",
                        "text": msg["content"],
                        "cache_control": {"type": "ephemeral"},
                    }],
                })
            else:
                messages.append(msg)
        messages.append({"role": "user", "content": new_user_message})
        system = system_text  # plain string is fine; the breakpoint is in messages
    else:
        # First turn — cache the system prompt
        messages = [{"role": "user", "content": new_user_message}]
        system = [{
            "type": "text",
            "text": system_text,
            "cache_control": {"type": "ephemeral"},
        }]

    return client.messages.create(
        model="claude-opus-4-7",
        max_tokens=1024,
        system=system,
        messages=messages,
    )`,
          takeaway:
            "Walking the cache breakpoint forward as the conversation grows is *the* pattern for keeping per-turn token cost constant. Without it, turn 20 of a chat re-processes 19 turns of history every call. With it, turn 20 reads 19 turns from cache at 0.1× and pays full freight only on the latest user message.",
        },
        {
          kind: "key_insight",
          label: "cache fingerprint is exact — bytes matter",
          insight: `When debugging a "why isn't my cache hitting?" mystery, check these in order:

1. **Did the prefix change byte-for-byte?** A timestamp, a request ID, a randomized example — anything inside the cached prefix that varies will cause a miss every time.
2. **Is the prefix at least the minimum size?** 4,096 tokens for Opus 4.7 / Haiku 4.5, 1,024 for Sonnet 4.6/4.5. Below that, caching silently doesn't happen.
3. **Did anything before your breakpoint change?** Even reordering tools, or changing a tool's \`description\`, invalidates the cache. Caching follows canonical order: \`tools → system → messages\`. Touch tools, and even your system cache dies.
4. **Did the model name change?** Cache entries are model-scoped. Switching from \`claude-opus-4-7\` to \`claude-sonnet-4-5\` produces a miss.
5. **Did the TTL expire?** 5 minutes from the last hit. In low-traffic windows, this kills caches you thought were warm.`,
        },
      ],
    },

    // ================================================================
    // 12. Streaming + caching together
    // ================================================================
    {
      title: "Streaming + caching together",
      blocks: [
        {
          kind: "prose",
          markdown: `Streaming and caching are orthogonal — caching is a request-time concern (which prefix bytes get cached) and streaming is a response-time concern (how the answer is delivered). You can combine them freely, and almost always should in production: caching cuts cost and improves TTFT; streaming improves perceived latency further.

The combination changes nothing about the wire format on either side. You still send \`"stream": true\` plus your \`cache_control\` markers in the same request. The events that come back are the same streaming events you already know — they just include cache fields in the \`usage\` blocks.`,
        },
        {
          kind: "scenario_predict",
          label: "where does cache usage appear in a stream?",
          scenario: `event: message_start
data: {"type":"message_start","message":{"id":"msg_01...","role":"assistant","content":[],"model":"claude-opus-4-7","stop_reason":null,"usage":{"input_tokens":18,"cache_creation_input_tokens":0,"cache_read_input_tokens":12063,"output_tokens":1}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Sure"}}

... (many text_deltas) ...

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":287}}

event: message_stop
data: {"type":"message_stop"}`,
          language: "text",
          question:
            "(a) In which event does `cache_read_input_tokens` first appear? (b) In which event does the FINAL `output_tokens` count appear?",
          answer:
            "(a) `cache_read_input_tokens` appears in **`message_start.message.usage`** — the same place `input_tokens` lives. The cache outcome (read vs creation vs neither) is known up front, before generation begins. (b) The final cumulative `output_tokens` appears in **`message_delta.usage`**, same as a non-cached stream.",
          explanation:
            "This is the practical pattern: read your cache fields from `message_start` (they're final there — the cache decision happened before generation), and read the final output_tokens from `message_delta`. `stream.get_final_message()` collapses both into a single Message.usage object for you.",
        },
        {
          kind: "code_predict",
          label: "stream + cache, all together",
          code: `import anthropic

client = anthropic.Anthropic()

with client.messages.stream(
    model="claude-opus-4-7",
    max_tokens=512,
    system=[
        {
            "type": "text",
            "text": "You are a helpful research assistant... " * 600,
            "cache_control": {"type": "ephemeral"},
        }
    ],
    messages=[{"role": "user", "content": "What's the bereavement policy?"}],
) as stream:
    for text in stream.text_stream:
        pass  # imagine rendering to a UI here

    final = stream.get_final_message()

u = final.usage
print(
    f"cache_read={u.cache_read_input_tokens} "
    f"cache_creation={u.cache_creation_input_tokens} "
    f"input={u.input_tokens} "
    f"output={u.output_tokens}"
)`,
          output:
            "cache_read=12063 cache_creation=0 input=17 output=287",
          explanation:
            "One call combines both wins. `cache_read=12063` means the model didn't re-process the 12k-token system prompt — it pulled the cached KV state at 0.1× cost. `input=17` is the only fresh-processed input (the user message). `output=287` is the generated answer. Meanwhile the user saw the first text fragment in ~200ms thanks to streaming. Caching cut your bill ~10× on the system prompt; streaming cut your perceived latency ~10× on the response.",
        },
        {
          kind: "multiple_choice",
          title: "the most common caching antipattern",
          prompt:
            "Your team is caching aggressively but cache hit rate is 0%. Inspecting requests, you see `cache_control` on the **last user message** in every request, varying per call. What's wrong?",
          choices: [
            {
              text: "The breakpoint is fine; the cache hit rate should be 100% on the second call.",
              correct: false,
              rationale:
                "The breakpoint is on a block that *changes every call* (the user message). The cached prefix INCLUDES that block's bytes — so each request fingerprints differently, and every call is a miss.",
            },
            {
              text: "The breakpoint is on a per-request-changing block (the user message). Move it to a stable block — typically the system prompt — so the cached prefix is identical across calls.",
              correct: true,
              rationale:
                "Exactly. Caching works on prefix identity. If the breakpoint is on a block that varies, the prefix varies, and you get a miss every time. Move the breakpoint earlier, onto something stable (system prompt, tools, retrieved doc).",
            },
            {
              text: "5-minute cache is too short for chat — switch to 1-hour TTL to fix it.",
              correct: false,
              rationale:
                "TTL is irrelevant here. The cache is never even written to a *reusable* prefix because the prefix changes every call. Switching TTLs would just make you pay a 2× write premium for the same 0% hit rate.",
            },
            {
              text: "Cache breakpoints don't work on user messages — only system blocks are cacheable.",
              correct: false,
              rationale:
                "Cache breakpoints work fine on user message content blocks. The issue is that the user message itself was changing, so the prefix wasn't stable. Caching a stable user-side payload (e.g. a retrieved doc inside a user turn) is a valid pattern.",
            },
          ],
          explanation:
            "Classic mistake: placing `cache_control` on something that varies. Cache identity is byte-exact on the prefix; if any byte in the cached prefix differs from the previous request, you miss. The fix is structural — place the breakpoint at the boundary between stable and changing content (typically end of system prompt or end of retrieved-doc block, never on the per-turn user message).",
        },
      ],
    },

    // ================================================================
    // 13. Lock it in: cold recall from memory
    // ================================================================
    {
      title: "Lock it in: cold recall from memory",
      blocks: [
        {
          kind: "prose",
          markdown: `Recognition is not learning. If you've been reading along nodding "yes, I get it" for the last 12 sections — good, but that's only the first step. Now close the guide in your head and answer the questions below **without scrolling back**. If you can reconstruct these answers from memory, you own this material. If you can't, scroll back, re-read the section, and come back.

The order below mirrors the guide: streaming first, then caching, then the combination.`,
        },
        {
          kind: "warm_up",
          title: "the canonical stream",
          prompt:
            "Name the canonical sequence of events for a streamed response with **one text content block**. (You can list event names in order; ignore ping.)",
          answer:
            "message_start → content_block_start → content_block_delta (×N) → content_block_stop → message_delta → message_stop",
          explanation:
            "Six events for a single-block response. The middle three are repeated per content block — so a response with text + tool_use becomes: message_start → (start, deltas, stop for block 0) → (start, deltas, stop for block 1) → message_delta → message_stop. `ping` and `error` can appear anywhere; everything else is in this fixed order.",
        },
        {
          kind: "warm_up",
          title: "the two delta variants you'll see most",
          prompt:
            "Inside `content_block_delta`, the `delta.type` field tells you the variant. Name the two most common variants and the field each carries.",
          answer:
            "`text_delta` carries `delta.text` (a string fragment of natural language). `input_json_delta` carries `delta.partial_json` (a string fragment of the tool's JSON arguments).",
          explanation:
            "Text deltas concatenate trivially and are always valid mid-stream. JSON deltas concatenate too but are only valid to `json.loads` after `content_block_stop` for that index. (Bonus: extended thinking adds `thinking_delta` and `signature_delta`.)",
        },
        {
          kind: "warm_up",
          title: "cache placement rule",
          prompt:
            "What is the maximum number of `cache_control` breakpoints per request, and in what canonical order are sections cached?",
          answer:
            "Maximum **4** breakpoints per request. Canonical caching order: **`tools → system → messages`**.",
          explanation:
            "A breakpoint caches everything earlier in this canonical order plus the marked block. So a system breakpoint caches tools + system; a message breakpoint caches tools + system + messages up through the marked block. Five or more breakpoints = 400 error.",
        },
        {
          kind: "warm_up",
          title: "decoding the usage block",
          prompt:
            "You see `cache_creation_input_tokens: 8000` in a response's `usage`. What just happened on this call, and what did you pay for those 8,000 tokens (in multiples of base input rate)?",
          answer:
            "You had a cache miss + write — those 8,000 tokens were processed AND written to the cache. You paid the write premium: **1.25× base** for 5m TTL, or **2× base** for 1h TTL. Next call within the TTL on the same prefix should show 8,000 in `cache_read_input_tokens` instead, at 0.1× base.",
          explanation:
            "`cache_creation_input_tokens` is the field that tells you 'I just paid the write premium today.' Non-zero on the first call you make with a new prefix; zero on subsequent hits within the TTL.",
        },
        {
          kind: "multiple_choice",
          title: "cold recall: where is final output token count?",
          prompt:
            "You're parsing a raw stream (`stream=True`) and want to log the final billable `output_tokens`. Which event holds it?",
          choices: [
            {
              text: "`message_start` — `message.usage.output_tokens`",
              correct: false,
              rationale:
                "`message_start` carries a placeholder `output_tokens` (typically 1). It is NOT the final count.",
            },
            {
              text: "The last `content_block_stop`",
              correct: false,
              rationale:
                "`content_block_stop` has no `usage` field at all. It just signals that a block is finalized.",
            },
            {
              text: "`message_delta` — `usage.output_tokens`",
              correct: true,
              rationale:
                "Correct. The `message_delta` event's `usage.output_tokens` is the cumulative, final, billable output count.",
            },
            {
              text: "`message_stop`",
              correct: false,
              rationale:
                "`message_stop` has no payload beyond `{\"type\":\"message_stop\"}`. The usage already arrived in the prior `message_delta`.",
            },
          ],
          explanation:
            "Two-event rule: trust `message_start.usage.input_tokens` for input (and cache fields), trust `message_delta.usage.output_tokens` for output. Or just use `stream.get_final_message().usage` and let the SDK do the bookkeeping.",
        },
        {
          kind: "multiple_choice",
          title: "cold recall: tool args mid-stream",
          prompt:
            "You're accumulating `input_json_delta.partial_json` strings into a buffer for index 1. When is it safe to call `json.loads(buffer)` to get the structured tool input?",
          choices: [
            {
              text: "After each `input_json_delta` event for index 1.",
              correct: false,
              rationale:
                "Partial JSON is byte-fragmented and almost always invalid mid-stream (mid-string, mid-key, mid-number). Parsing will raise `JSONDecodeError`.",
            },
            {
              text: "After `content_block_stop` for index 1.",
              correct: true,
              rationale:
                "Correct. `content_block_stop` for that index is the signal that the JSON is complete. Now `json.loads(buffer)` gives you the parsed input dict.",
            },
            {
              text: "After `message_stop`.",
              correct: false,
              rationale:
                "Works, but unnecessarily late — you could have parsed (and even dispatched the tool call) as soon as block 1's `content_block_stop` arrived.",
            },
            {
              text: "Never — `partial_json` is always raw text, not parseable JSON.",
              correct: false,
              rationale:
                "Wrong. The concatenated `partial_json` for an entire tool_use block is a complete JSON object once `content_block_stop` arrives.",
            },
          ],
          explanation:
            "The rule: concatenate `partial_json` on every delta; parse on `content_block_stop` for that index. This same pattern works for parallel tool calls — each index has its own buffer, each gets parsed on its own stop event.",
        },
        {
          kind: "code_predict",
          label: "BUG HUNT: why is this cache always missing?",
          code: `import anthropic, time

client = anthropic.Anthropic()
DOC = "[the same 10k-token internal handbook] " * 500

def ask(question: str):
    return client.messages.create(
        model="claude-opus-4-7",
        max_tokens=400,
        system="You are a helpful HR assistant.",
        messages=[
            {"role": "user", "content": [
                {"type": "text", "text": DOC},
                {"type": "text", "text": question,
                 "cache_control": {"type": "ephemeral"}},
            ]}
        ],
    )

r1 = ask("What's the parental leave policy?")
r2 = ask("What about bereavement?")
print("r1 cache_creation:", r1.usage.cache_creation_input_tokens,
      " cache_read:", r1.usage.cache_read_input_tokens)
print("r2 cache_creation:", r2.usage.cache_creation_input_tokens,
      " cache_read:", r2.usage.cache_read_input_tokens)`,
          output: `r1 cache_creation: 10037  cache_read: 0
r2 cache_creation: 10042  cache_read: 0`,
          explanation:
            "The breakpoint is on the `question` block — which CHANGES every call. The cached prefix includes the question, so 'What's the parental leave policy?' and 'What about bereavement?' produce different fingerprints, and every call misses + writes. You're paying the 1.25× write premium on the 10k doc every single call AND getting zero reads.\n\nThe fix: move `cache_control` onto the DOC block (or split DOC into the system prompt), and remove it from the question. Then the cached prefix is `system + DOC` — identical across calls — and the question is the only fresh tokens. r2 should then show `cache_creation: 0, cache_read: ~10037`.",
        },
        {
          kind: "key_insight",
          label: "Spaced practice plan",
          insight: `If you want this material to stick past tomorrow:

- **Day 1 (today):** Finish the guide. Take the cold-recall section seriously.
- **Day 2:** From a blank Python file, re-write the \`route_stream\` event router from Section 6 — no peeking. Compare against the solution; note anything you missed.
- **Day 3:** Wire a real streaming + caching call to the actual API. Print the \`usage\` block on every call. Force a cache hit by repeating the same request twice; verify \`cache_read_input_tokens\` jumps.
- **Day 5:** Take a real (or imagined) production prompt and audit it for cache placement. Where is the stable/changing boundary? Where would you put the breakpoint? Would two breakpoints help?
- **Day 7:** Re-do the bug-hunt from Section 13 and the breakpoint-placement scenario from Section 9 from memory.

These reps — not re-reading — are what move this from "I recognize it" to "I can build it under pressure."`,
        },
      ],
    },
  ],
};
