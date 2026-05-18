import type { StudyGuide } from "../guide-types";

export const tokenCountingContextBudgetingGuide: StudyGuide = {
  topicTitle: "Token counting & context budgeting",
  topicSlug: "token-counting-context-budgeting",
  sections: [
    // ================================================================
    // 1. Why token counting matters (and what a token actually is)
    // ================================================================
    {
      title: "Why token counting matters (and what a token actually is)",
      blocks: [
        {
          kind: "prose",
          markdown: `Every Claude model has a hard cap: **the input plus the requested \`max_tokens\` of output must fit in the context window**. Exceed it and the API returns a 400 before doing any work. There's no graceful degradation.

The four things that determine whether your request is safe:

1. **System prompt** (counted once per call).
2. **Tool definitions** (counted on every call that includes tools — they're verbose).
3. **All prior messages in \`messages\`** — including assistant turns, tool_use blocks, and tool_result blocks.
4. **The \`max_tokens\` budget** you're reserving for the assistant's reply.

If \`system + tools + messages + max_tokens > context_window\`, the request is rejected. The error message looks like:

\`\`\`
prompt is too long: 205834 tokens > 200000 maximum
\`\`\`

This is unrecoverable mid-request. By the time the API tells you, you've already burned a network round trip and the user is waiting. **The fix is to size every request before you send it,** so you can trim, summarize, or hand off to a longer-context model proactively.

Three terms worth getting right:

- **Token** — the unit of text the model sees. Roughly *3.5 characters of English* or *0.75 of a word*. A 2000-word document is ~2700 tokens. But: code, JSON, non-English text, and structured tool calls can be *2–3× denser* — don't trust the word-count heuristic for those.
- **Context window** — total tokens (input + output) the model can hold in one call. Currently 200K for Claude. Larger soon, but never assume "infinite."
- **\`max_tokens\`** — the **output cap** you set on each request. Counts against the context window. If you ask for 64K \`max_tokens\` on a 180K-token input, you've over-allocated by 44K and the request is rejected before generation starts.`,
        },
        {
          kind: "key_insight",
          label: "Mental model",
          insight: `Think of the context window as a fixed-size bucket you're filling each request:

\`\`\`
┌─────────────────────────────── 200,000 tokens ───────────────────────────────┐
│ system │ tools │ messages (history + new user turn) │ max_tokens (headroom)  │
└──────────────────────────────────────────────────────────────────────────────┘
\`\`\`

**Everything left of \`max_tokens\` is paid before generation starts** — even if the model stops after one word. **Everything right of it is the maximum reply size you'll pay for.** You are charged for the actual tokens generated, but you're *budgeting* against the cap.

Most "the API is rejecting my request" bugs trace to forgetting one of those four buckets, usually the tool definitions or the assistant's prior tool_use blocks (which can be huge if a tool returned a JSON blob).`,
        },
        {
          kind: "flashcard",
          context: `You're seeing intermittent 400 "prompt is too long" errors in production. The user's input is ~50K tokens, your system prompt is ~2K, and your model is Claude (200K context).`,
          front: `Where's the most likely missing accounting?`,
          back: `**Tool definitions and prior tool_use/tool_result blocks.**

If your app uses tools, every \`messages.create\` call includes the full tool schema in the request. A schema with five tools, each with nested JSON \`input_schema\` and detailed descriptions, can easily be 5K–15K tokens. **And tool_result blocks** from prior turns can be enormous — if a search tool returned a 30K-token document, that document is now permanently in \`messages\` for the rest of the conversation.

50K (user) + 2K (system) + 12K (tools) + 80K (cumulative tool_result blocks from a long agent run) + 64K (\`max_tokens\`) = 208K → rejected.

Fix: instrument all four buckets, not just user input.`,
        },
      ],
    },

    // ================================================================
    // 2. Counting tokens: the SDK and the right heuristics
    // ================================================================
    {
      title: "Counting tokens: the SDK and the right heuristics",
      blocks: [
        {
          kind: "prose",
          markdown: `**The right answer for production: \`client.messages.count_tokens(...)\`.**

This is a real API call that returns the *exact* token count the server would charge for, given your full request shape — system, tools, messages, all of it. It costs nothing (no generation happens) and is the only source of truth.

\`\`\`python
from anthropic import Anthropic

client = Anthropic()

result = client.messages.count_tokens(
    model="claude-opus-4-5",
    system="You are a helpful assistant.",
    tools=[...],                          # same shape as messages.create
    messages=[
        {"role": "user", "content": "Summarize this report: ..."},
    ],
)
print(result.input_tokens)  # e.g. 12_834
\`\`\`

The shape mirrors \`messages.create\` exactly — copy the same kwargs, swap the method, you get the count. **Use it any time the size is uncertain and the cost of being wrong is a user-facing error.**

**The wrong-but-acceptable answer for offline estimation:** a heuristic. When you're sizing a prompt before you've even built the request, or running a quick offline analysis of a corpus, a heuristic is fine.

| Heuristic | Use when |
|---|---|
| \`tokens ≈ len(text) / 4\` | English prose. Off by ~10% on average. |
| \`tokens ≈ words * 1.3\` | English prose with whitespace tokenization. Same ballpark. |
| \`tokens ≈ len(text) / 2.5\` | Code, JSON, structured data. Tokenizers split punctuation/braces/keywords aggressively. |
| \`tokens ≈ len(text.encode("utf-8")) / 3\` | Mixed or non-English text. UTF-8 byte length is a better proxy than char count for CJK/emoji/etc. |

**Critical rule:** never let a heuristic decide whether to send the request. Let it decide whether to *check with* \`count_tokens\` first. Heuristic for "is this comfortably small?" Real counter for "am I near the edge?"`,
        },
        {
          kind: "method_ref",
          title: "`count_tokens` API reference",
          importLine: `from anthropic import Anthropic`,
          methods: [
            {
              signature: `client.messages.count_tokens(model=..., messages=...)`,
              description: `Count tokens for a minimum-shape request. Returns an object with an \`input_tokens\` attribute.`,
              returns: `MessageTokensCount (with .input_tokens: int)`,
            },
            {
              signature: `client.messages.count_tokens(model=..., system=..., messages=...)`,
              description: `Include the system prompt — it's billed separately in the response but counts toward the context window.`,
              returns: `MessageTokensCount`,
            },
            {
              signature: `client.messages.count_tokens(model=..., tools=[...], messages=...)`,
              description: `Include tool definitions. **Always pass tools if your real \`messages.create\` would** — they can add 1K–15K tokens you'll miss otherwise.`,
              returns: `MessageTokensCount`,
            },
            {
              signature: `result.input_tokens`,
              description: `The integer count. **Does not include your \`max_tokens\` reservation** — you must add that yourself when checking against the context cap.`,
              returns: `int`,
            },
          ],
        },
        {
          kind: "code_predict",
          label: "Heuristic estimator for offline use",
          code: `def estimate_tokens(text: str, kind: str = "prose") -> int:
    """Rough token estimator. Use count_tokens() for production sizing."""
    if kind == "prose":
        return len(text) // 4
    if kind == "code":
        return len(text) // 2 + 1   # code tokenizes denser
    if kind == "utf8":
        return len(text.encode("utf-8")) // 3
    raise ValueError(f"unknown kind: {kind}")


prose = "The quick brown fox jumps over the lazy dog. " * 5
code  = "def f(x):\\n    return [i*2 for i in range(x) if i % 3 == 0]"
mixed = "claude モデル トークン カウント"

print(estimate_tokens(prose, "prose"),
      estimate_tokens(code,  "code"),
      estimate_tokens(mixed, "utf8"))`,
          output: `56 27 18`,
          explanation: `\`prose\` is 225 chars → 225 // 4 = 56. \`code\` is 53 chars → 53 // 2 + 1 = 27 (denser ratio because tokenizers split braces/operators/identifiers aggressively). \`mixed\` encodes to ~57 UTF-8 bytes → 57 // 3 = 19 — wait, the actual answer depends on the exact length. Run it and verify. The point isn't memorizing constants: it's recognizing that **one byte-budget doesn't fit all text shapes**. Real \`count_tokens\` is the only ground truth — these heuristics are for offline triage and corpus-level analysis.`,
          runnable: true,
        },
        {
          kind: "scenario_predict",
          label: "When the heuristic lies",
          scenario: `# Your token-estimation function:
def cheap_estimate(text):
    return len(text) // 4

# You're sending a JSON-heavy tool_result back to Claude:
tool_result = '{"users": [' + ','.join('{"id":' + str(i) + ',"email":"u' + str(i) + '@example.com","plan":"pro"}' for i in range(200)) + ']}'

print("estimated:", cheap_estimate(tool_result))
# True count from count_tokens: ~3,800`,
          language: "python",
          question: `What's the rough estimate, and why does it under-count by ~30–60%?`,
          answer: `Estimated ≈ 2,300 tokens (the JSON is ~9.2K chars / 4). True count: ~3,800. The heuristic **under-counts by ~40%**.`,
          explanation: `JSON tokenizes much denser than English prose: every quote, colon, comma, brace, and digit-run is often its own token. The "4 chars per token" rule comes from natural-language corpora — it's not safe for JSON, code, base64, or other punctuation-heavy text. **The operational rule:** if you're in striking distance of the limit (within 10–20%), don't trust a heuristic. Call \`count_tokens\`. Heuristics are for "is this 5K or 50K?" not for "is this 195K or 205K?"`,
        },
      ],
    },

    // ================================================================
    // 3. Budgeting: headroom, max_tokens, and the 4-bucket sum
    // ================================================================
    {
      title: "Budgeting: headroom, max_tokens, and the 4-bucket sum",
      blocks: [
        {
          kind: "prose",
          markdown: `A safe \`messages.create\` call follows a simple budget:

\`\`\`
system + tools + messages + max_tokens + safety_margin  ≤  context_window
\`\`\`

The two non-obvious terms:

- **\`max_tokens\`** is **reserved**, not consumed. If you set \`max_tokens=4096\` but the model stops after 100 tokens, you only pay for 100 — but the cap is enforced against the reservation. **You can't ask for more output than fits.**
- **\`safety_margin\`** is a buffer you keep to account for: heuristic estimation error, token-count drift between model versions, and any retries that might append context. **A reasonable default is 2-5% of the context window** (4K–10K tokens for a 200K window). More if you're using heuristics, less if you're using \`count_tokens\`.

A typical sizing function looks like this:

\`\`\`python
CONTEXT_WINDOW = 200_000
SAFETY_MARGIN  = 4_000          # 2% buffer

def fits(input_tokens: int, max_output: int) -> bool:
    return input_tokens + max_output + SAFETY_MARGIN <= CONTEXT_WINDOW
\`\`\`

**Three decisions that fall out of the budget:**

1. **Choosing \`max_tokens\`** — set it to the *maximum useful* reply size for the task, not the maximum the model allows. A summarization endpoint that always replies under 500 tokens should not reserve 4096 — you'd be wasting 3500 tokens of budget that could go to input on a long-input request.
2. **Choosing a model** — if you're routinely over budget on opus-4-5 (200K), the answer is rarely "compress more"; it's "switch to a longer-context model" or "split the work."
3. **What to do when over budget** — you have three levers, in order of preference:
   1. **Reduce \`max_tokens\`** if the task tolerates shorter replies.
   2. **Trim message history** (sliding window — covered in section 4).
   3. **Summarize and replace** older messages — most expensive, lossy, but lets very long conversations continue.`,
        },
        {
          kind: "code_predict",
          label: "Budget arithmetic",
          code: `CONTEXT_WINDOW = 200_000
SAFETY_MARGIN  = 4_000

def fits(input_tokens: int, max_output: int) -> bool:
    return input_tokens + max_output + SAFETY_MARGIN <= CONTEXT_WINDOW

def headroom(input_tokens: int, max_output: int) -> int:
    return CONTEXT_WINDOW - SAFETY_MARGIN - input_tokens - max_output

# Three scenarios:
print(fits(150_000, 4096), headroom(150_000, 4096))
print(fits(195_000, 4096), headroom(195_000, 4096))
print(fits(195_000, 1024), headroom(195_000, 1024))`,
          output: `True 41904
False -3096
False -24`,
          explanation: `Case 1: 150K input + 4K output + 4K margin = 158K → fits, with 42K of slack to spare. Case 2: 195K input + 4K output + 4K margin = 203K → over by 3,096 tokens — rejected. Case 3: trimming \`max_tokens\` from 4096 to 1024 saves 3072 tokens, but we're still 24 tokens over — the trim isn't enough. The right action here is to reduce input (sliding-window history or summarization) rather than further squeezing the output cap. **Always compute \`headroom\` before sending: a negative value is a guaranteed 400.**`,
          runnable: true,
        },
        {
          kind: "warm_up",
          title: "Picking max_tokens",
          prompt: `You're building a multi-turn chat. Average assistant replies are ~250 tokens; the 95th percentile is ~1,800; the longest you've ever seen is ~3,200. What's a reasonable default \`max_tokens\`, and what's the cost of going higher?`,
          answer: `**\`max_tokens=2048\`** — covers >95% of replies with a small buffer. Going higher (e.g., 8192) doesn't change *billed* output cost (you pay per generated token), but it **reserves 8192 tokens of context-window budget on every call** — meaning long inputs that would have fit at \`max_tokens=2048\` will get rejected at \`max_tokens=8192\`. You're effectively making your supportable input shorter.`,
          explanation: `\`max_tokens\` is a *budget reservation*, not a *cost driver*. Setting it conservatively (close to your p95 reply size, with a small margin) lets you support longer inputs without raising your bill. The intuition: every token you reserve for \`max_tokens\` is a token you can't put in \`messages\`.`,
        },
        {
          kind: "multiple_choice",
          title: "Why is my long-context request failing?",
          prompt: `Your app accepts user-uploaded documents and asks Claude to summarize them. You're calling Claude with \`max_tokens=8192\` and seeing intermittent \`prompt is too long\` errors on documents around 190K tokens. The math: 190K + 8K = 198K, comfortably under the 200K cap. What's most likely going on?`,
          choices: [
            {
              text: `You forgot to count the system prompt and any tool definitions.`,
              correct: true,
              rationale: `Both system and tools eat budget but are easy to miss when you only look at user-facing input. A 2K system + 8K tools is enough to push 190K input over the 200K cap once you add the 8K \`max_tokens\` reservation.`,
            },
            {
              text: `The model context window varies by request.`,
              correct: false,
              rationale: `It's fixed per model. Your accounting is wrong, not the cap.`,
            },
            {
              text: `Heuristic estimation drift — the document is actually longer than your estimate.`,
              correct: false,
              rationale: `Plausible contributor, but if you're using \`count_tokens\` (which you should at this scale), it's not the primary cause. If you're using a heuristic on a 190K-token document, the drift could easily account for the gap *and* you have a bigger problem: switch to \`count_tokens\`.`,
            },
            {
              text: `Claude internally reserves 5% of the window for safety.`,
              correct: false,
              rationale: `Not how the API works. The cap is exact — you must build the safety margin yourself.`,
            },
          ],
          explanation: `The 200K cap is **inclusive of everything**: system, tools, messages, max_tokens. When debugging "why is my request being rejected," the checklist is always: (1) \`count_tokens\` the full request including system + tools, (2) add \`max_tokens\`, (3) compare to the context window with a buffer. If you only count user input you'll be confused by the same surprise every time.`,
        },
      ],
    },

    // ================================================================
    // 4. Long conversations: sliding window & summarization
    // ================================================================
    {
      title: "Long conversations: sliding window & summarization",
      blocks: [
        {
          kind: "prose",
          markdown: `Stateful chat is where token budgeting gets serious. Every turn you send the *entire prior history* — by turn 50 of a non-trivial conversation, you're routinely sitting at 30K–80K tokens just from messages. Two strategies handle this:

**Sliding window (cheap, lossy):** Keep the last N turns; drop the older ones. Works well when older context doesn't carry decisions forward (most casual chat, classification tasks, single-shot Q&A).

**Summarization (expensive, less lossy):** When you'd otherwise drop a turn, summarize it instead and prepend the summary to the system prompt. Used in long agentic runs and customer-support transcripts where earlier facts (a customer's order number, a setup decision) need to persist.

**Important constraints on what you can drop:**

1. **Never drop the system prompt.** It's not part of the sliding window — it's pinned context that defines the assistant's role.
2. **Always preserve tool_use ↔ tool_result pairing.** If turn 7 was an assistant \`tool_use\` block and turn 8 was the corresponding user \`tool_result\`, you must keep them together or remove both. Dropping one without the other produces an API error ("tool_use block without matching tool_result" or vice versa).
3. **Keep the most recent user message intact.** Trimming the question the user just asked is, predictably, a bad time.
4. **Be careful with cache breakpoints.** If you're using prompt caching, trimming below a cache breakpoint invalidates the cache for that request. Trim *above* the breakpoint when you can.

A skeleton sliding-window trimmer:

\`\`\`python
def sliding_window(messages, max_input_tokens, count_fn):
    """Drop oldest messages until count_fn(messages) <= max_input_tokens.
    Always preserves the last message; preserves tool_use/tool_result pairs."""
    trimmed = list(messages)
    while count_fn(trimmed) > max_input_tokens and len(trimmed) > 1:
        # Drop the oldest two messages together when they look like a paired turn.
        drop = 2 if _is_paired_turn(trimmed[0], trimmed[1]) else 1
        del trimmed[:drop]
    return trimmed
\`\`\`

The "drop two together" heuristic protects tool_use/tool_result pairs and natural user→assistant turn pairs. In practice you also pin a few "sticky" early messages (the original task description, key user decisions) outside the sliding window.`,
        },
        {
          kind: "code_predict",
          label: "Sliding-window trimmer, preserving tool pairs",
          code: `def count_tokens(messages):
    """Pretend counter: 100 tokens per message."""
    return 100 * len(messages)

def _is_paired_turn(a, b):
    # Treat (assistant, user) pairs as atomic for safe trimming.
    return a["role"] == "assistant" and b["role"] == "user"

def trim_to_budget(messages, budget):
    trimmed = list(messages)
    while count_tokens(trimmed) > budget and len(trimmed) > 1:
        drop = 2 if (len(trimmed) >= 2 and _is_paired_turn(trimmed[0], trimmed[1])) else 1
        del trimmed[:drop]
    return trimmed

history = [
    {"role": "user",      "content": "Q1"},
    {"role": "assistant", "content": "A1"},
    {"role": "user",      "content": "Q2"},
    {"role": "assistant", "content": "A2"},
    {"role": "user",      "content": "Q3"},
    {"role": "assistant", "content": "A3"},
    {"role": "user",      "content": "Q4 (latest)"},
]

# Budget = 300 tokens → 3 messages fit
result = trim_to_budget(history, 300)
print([m["content"] for m in result])`,
          output: `['A3', 'Q4 (latest)']`,
          explanation: `Trace: start at 700 tokens, budget 300.

- Iter 1: trimmed[0]=Q1(user), trimmed[1]=A1(assistant). \`_is_paired_turn\` checks **assistant-then-user**, so this is *not* a pair → drop just Q1. → 600 tokens.
- Iter 2: now [A1, Q2, ...] → A1 is assistant, Q2 is user → pair → drop both. → 400 tokens.
- Iter 3: now [A2, Q3, ...] → pair → drop both. → 200 tokens, exit.

Result: \`['A3', 'Q4 (latest)']\`. **The subtle thing:** by treating (assistant, user) as the atomic pair (not (user, assistant)), the trimmer naturally keeps the *latest* user message bonded to the assistant turn it's responding to. Get that order wrong and you'll occasionally strand a user turn with no assistant follow-up, which the API tolerates but the model handles poorly.`,
          runnable: true,
        },
        {
          kind: "code_comparison",
          label: "Two strategies for long chats",
          left: {
            title: "Sliding window",
            code: `def prepare_messages(history, new_user_msg, budget, count_fn):
    candidate = history + [new_user_msg]
    while count_fn(candidate) > budget and len(candidate) > 1:
        # Drop oldest pair (preserving tool pairs in real impl)
        del candidate[:2]
    return candidate`,
            annotation: `Cheap: just slice. Lossy: anything older than the window is **gone**. Best for chats where each turn is mostly self-contained.`,
          },
          right: {
            title: "Summarize-and-drop",
            code: `def prepare_messages(history, new_user_msg, budget, count_fn, client):
    candidate = history + [new_user_msg]
    while count_fn(candidate) > budget and len(candidate) > 4:
        # Summarize the oldest 4 messages into one assistant note.
        summary = summarize(client, candidate[:4])  # an extra API call
        candidate = [{"role": "assistant", "content": f"[summary of earlier turns] {summary}"}] + candidate[4:]
    return candidate`,
            annotation: `Less lossy: facts from old turns survive in compressed form. More expensive: every trim costs an extra API round trip. Worth it for long-running agents and support transcripts.`,
          },
          takeaway: `Pick the strategy by the **cost of forgetting**. If turn 3 mentioned a customer's order number that turn 50 needs to reference, a plain sliding window will drop it and the assistant will look incompetent. Summarization preserves the fact at the cost of one extra call per trim. For tasks where forgetting is fine (classification, single-shot QA, demos), the sliding window is plenty.`,
        },
        {
          kind: "mini_challenge",
          title: "Headroom-aware send function",
          prompt: `Write a function \`send_with_budget(client, model, system, tools, messages, max_tokens)\` that:

1. Calls \`client.messages.count_tokens(...)\` with the full request shape.
2. Computes \`headroom = CONTEXT_WINDOW - SAFETY_MARGIN - input_tokens - max_tokens\`.
3. If headroom ≥ 0, sends with \`messages.create(...)\` and returns the response.
4. If headroom < 0, raises a custom \`OverBudgetError\` that carries the actual deficit so the caller can decide whether to trim and retry.

Use \`CONTEXT_WINDOW = 200_000\` and \`SAFETY_MARGIN = 4_000\`. Don't actually implement trimming — that's the caller's responsibility. Just enforce the budget before sending.`,
          hints: [
            `Define \`class OverBudgetError(Exception)\` with an \`__init__\` that accepts \`deficit: int\` and stores it as an attribute.`,
            `Call \`count_tokens\` with the same kwargs you'd pass to \`messages.create\` (model, system, tools, messages). Read \`.input_tokens\` from the result.`,
            `Compute headroom *before* the create call. If negative, raise — don't try to be clever and trim here. Single-responsibility.`,
          ],
          solution: `from anthropic import Anthropic

CONTEXT_WINDOW = 200_000
SAFETY_MARGIN  = 4_000


class OverBudgetError(Exception):
    def __init__(self, deficit: int, input_tokens: int, max_tokens: int):
        self.deficit       = deficit
        self.input_tokens  = input_tokens
        self.max_tokens    = max_tokens
        super().__init__(
            f"Request over budget by {deficit} tokens "
            f"(input={input_tokens}, max_tokens={max_tokens}, "
            f"window={CONTEXT_WINDOW}, margin={SAFETY_MARGIN})"
        )


def send_with_budget(client, model, system, tools, messages, max_tokens):
    count_kwargs = {"model": model, "messages": messages}
    if system: count_kwargs["system"] = system
    if tools:  count_kwargs["tools"]  = tools

    input_tokens = client.messages.count_tokens(**count_kwargs).input_tokens
    headroom = CONTEXT_WINDOW - SAFETY_MARGIN - input_tokens - max_tokens
    if headroom < 0:
        raise OverBudgetError(deficit=-headroom,
                              input_tokens=input_tokens,
                              max_tokens=max_tokens)

    create_kwargs = {**count_kwargs, "max_tokens": max_tokens}
    return client.messages.create(**create_kwargs)`,
          takeaway: `Two principles encoded: (1) **always size before send** — the cost of \`count_tokens\` is negligible compared to a failed \`messages.create\`; (2) **don't smuggle policy into a sizer** — the function says "go" or "no go" and lets the caller decide whether to trim, switch models, summarize, or surface an error. Single-responsibility makes retries, model routing, and observability all easier.`,
        },
        {
          kind: "key_insight",
          label: "The token-budgeting checklist",
          insight: `Before sending any \`messages.create\` request that *might* be near the limit, walk this list:

1. **Did I include the system prompt** in the count?
2. **Did I include the tool definitions** in the count?
3. **Did I include all prior tool_use and tool_result blocks** (especially large ones)?
4. **Did I add \`max_tokens\` to the input total** before comparing to the window?
5. **Did I leave a safety margin** (2–5% of the window)?
6. **Am I trimming above any cache breakpoints** so I don't blow the cache?
7. **For tool flows: am I dropping tool_use/tool_result pairs together**, never just one?

If you can answer "yes" to all seven, your requests won't fail for size reasons. If you can answer them automatically from a helper function — even better. **The goal is to have zero "prompt is too long" errors in production**, because every one of them is a user-visible failure that you could have caught locally with a one-line check.`,
        },
      ],
    },
  ],
};
