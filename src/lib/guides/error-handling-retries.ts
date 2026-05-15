import type { StudyGuide } from "../guide-types";

export const errorHandlingRetriesGuide: StudyGuide = {
  topicTitle: "Error handling, retries & rate limits",
  topicSlug: "error-handling-retries-rate-limits",
  sections: [
    // ================================================================
    // 1. The SDK error hierarchy
    // ================================================================
    {
      title: "The SDK error hierarchy",
      blocks: [
        {
          kind: "prose",
          markdown: `Every error the Anthropic Python SDK raises descends from one root: \`anthropic.APIError\`. You almost never catch \`APIError\` directly — you catch one of its subclasses, because the action you take depends on **which** failure occurred.

The hierarchy splits in two:

\`\`\`
APIError                          # root
├── APIConnectionError            # network never reached the server
│   └── APITimeoutError           # network reached but no response in time
└── APIStatusError                # server replied with non-2xx
    ├── BadRequestError           # 400  — your request is malformed
    ├── AuthenticationError       # 401  — bad / missing API key
    ├── PermissionDeniedError     # 403  — key lacks access to this resource
    ├── NotFoundError             # 404  — model or endpoint doesn't exist
    ├── UnprocessableEntityError  # 422  — semantically invalid (rare)
    ├── RateLimitError            # 429  — you hit a quota
    ├── InternalServerError       # 500  — Anthropic side broke
    └── OverloadedError           # 529  — Anthropic is at capacity
\`\`\`

The split that matters most: \`APIConnectionError\` (your packets never came back) vs \`APIStatusError\` (the server answered, but with bad news). Treat these differently in your except blocks.`,
        },
        {
          kind: "method_ref",
          title: "anthropic exception classes",
          importLine: "import anthropic",
          methods: [
            {
              signature: "anthropic.APIError",
              description: "Root of the hierarchy. Catch only as a last-resort fallback.",
            },
            {
              signature: "anthropic.APIConnectionError",
              description: "Network failure before a response was received (DNS, TLS, socket reset).",
            },
            {
              signature: "anthropic.APITimeoutError",
              description: "Subclass of APIConnectionError raised when the request exceeds the configured timeout.",
            },
            {
              signature: "anthropic.APIStatusError",
              description: "Server responded with a non-2xx status. Has .status_code, .response, .request_id.",
            },
            {
              signature: "anthropic.RateLimitError",
              description: "429 — token, request, or input-token rate limit was exceeded. Honor `retry-after` if present.",
            },
            {
              signature: "anthropic.OverloadedError",
              description: "529 — Anthropic infrastructure is temporarily overloaded. Retry with backoff.",
            },
            {
              signature: "anthropic.BadRequestError",
              description: "400 — request is malformed (e.g. invalid JSON, bad message format). Do NOT retry.",
            },
            {
              signature: "anthropic.AuthenticationError",
              description: "401 — API key is missing, invalid, or revoked. Do NOT retry.",
            },
          ],
        },
        {
          kind: "scenario_predict",
          label: "exception class from a stack trace",
          scenario: `Traceback (most recent call last):
  File "main.py", line 12, in <module>
    msg = client.messages.create(
  File ".../anthropic/_base_client.py", line 1042, in _request
    raise self._make_status_error_from_response(err.response) from None
anthropic.???: Error code: 429 - {'type': 'error', 'error': {'type': 'rate_limit_error',
  'message': 'Number of input tokens has exceeded your per-minute rate limit'}}`,
          language: "text",
          question: "Which exception class fills in the ??? on the last line?",
          answer: "RateLimitError",
          explanation:
            "Status code 429 always maps to anthropic.RateLimitError. The error.type field 'rate_limit_error' confirms it — but you should branch on the Python class, not parse the message body.",
        },
      ],
    },

    // ================================================================
    // 2. Retry-worthy vs not-worthy
    // ================================================================
    {
      title: "Retry-worthy vs not-worthy",
      blocks: [
        {
          kind: "prose",
          markdown: `Before writing any retry code, internalize this taxonomy. **Retrying a non-transient error is worse than not retrying at all** — it wastes quota, delays the user-visible failure, and obscures the real problem in your logs.`,
        },
        {
          kind: "key_insight",
          label: "Retry-worthy taxonomy",
          insight: `**Retry these (transient):** \`429\` RateLimitError, \`500\` InternalServerError, \`502\`, \`503\`, \`529\` OverloadedError, and any \`APIConnectionError\` / \`APITimeoutError\`.

**Never retry these (your bug, not theirs):** \`400\` BadRequestError, \`401\` AuthenticationError, \`403\` PermissionDeniedError, \`404\` NotFoundError, \`422\` UnprocessableEntityError.

A retry on a 400 will return another 400 forever. A retry on a 401 won't fix your missing API key.`,
        },
        {
          kind: "multiple_choice",
          title: "classify these status codes",
          prompt: "Which of the following sets contains **only** retry-worthy errors?",
          choices: [
            {
              text: "400, 401, 403, 404",
              correct: false,
              rationale: "These are all client errors caused by your request — retrying won't change the outcome.",
            },
            {
              text: "429, 500, 503, 529",
              correct: true,
              rationale: "All four are transient: rate limit, generic server error, service unavailable, and overload. All retry-worthy with backoff.",
            },
            {
              text: "401, 429, 500, 503",
              correct: false,
              rationale: "401 (auth) is not retry-worthy — your key is wrong. The other three are.",
            },
            {
              text: "404, 422, 500, 502",
              correct: false,
              rationale: "404 (not found) and 422 (unprocessable) are client errors — retrying won't help.",
            },
          ],
          explanation:
            "Memorize: 429, 5xx (especially 500/502/503/529), and any connection error are retry-worthy. Everything in the 4xx range except 429 is on you to fix.",
        },
        {
          kind: "flashcard",
          context: "Decide whether to retry, given a status code",
          front: "HTTP 400 — BadRequestError",
          back: "**Don't retry.** Your request body is malformed. Fix the payload.",
        },
        {
          kind: "flashcard",
          context: "Decide whether to retry, given a status code",
          front: "HTTP 429 — RateLimitError",
          back: "**Retry** with backoff. Honor `retry-after` header if present.",
        },
        {
          kind: "flashcard",
          context: "Decide whether to retry, given a status code",
          front: "HTTP 401 — AuthenticationError",
          back: "**Don't retry.** Your API key is missing/invalid. Fail fast and surface the error.",
        },
        {
          kind: "flashcard",
          context: "Decide whether to retry, given a status code",
          front: "HTTP 529 — OverloadedError",
          back: "**Retry** with exponential backoff. Anthropic is at capacity; back off generously.",
        },
        {
          kind: "flashcard",
          context: "Decide whether to retry, given a status code",
          front: "anthropic.APIConnectionError (no status code)",
          back: "**Retry** — packets never made the round trip. Network blip is the most likely cause.",
        },
      ],
    },

    // ================================================================
    // 3. The SDK's built-in retries
    // ================================================================
    {
      title: "The SDK's built-in retries",
      blocks: [
        {
          kind: "prose",
          markdown: `Before you write your own retry loop, know this: the SDK already retries for you. By default, \`anthropic.Anthropic()\` will retry transient errors **2 times** with exponential backoff and jitter. You only get an exception if all retries fail.

You can change this globally on the client, or per-request:

\`\`\`python
import anthropic

# Global default: retry 5 times instead of 2
client = anthropic.Anthropic(max_retries=5)

# Or override for a single call:
msg = client.with_options(max_retries=0).messages.create(
    model="claude-sonnet-4-5",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello"}],
)
\`\`\`

Set \`max_retries=0\` when you need a hard fail (e.g. a debug script where you want to see the raw error). Set it higher for batch jobs where latency doesn't matter but completion does.`,
        },
        {
          kind: "code_predict",
          label: "what does the SDK actually retry on?",
          code: `import anthropic

client = anthropic.Anthropic(max_retries=3)

# Suppose the API returns 400 BadRequestError every time.
# How many requests does the SDK send before raising?

try:
    client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=10,
        messages=[{"role": "user", "content": ""}],  # empty content -> 400
    )
except anthropic.BadRequestError:
    pass`,
          output: "1 request (no retries)",
          explanation:
            "max_retries only governs RETRIABLE errors (429/5xx/connection errors). A 400 is a non-retriable client error, so the SDK raises immediately on the first attempt without retrying.",
        },
        {
          kind: "warm_up",
          title: "configure a high-retry client",
          prompt:
            "Write the one-line construction of an anthropic client that retries up to 5 times.",
          answer: "client = anthropic.Anthropic(max_retries=5)",
          explanation:
            "The max_retries kwarg on the client constructor sets the default for every request. Override per-call with client.with_options(max_retries=N).",
        },
        {
          kind: "key_insight",
          label: "Don't double-retry",
          insight: `If the SDK is already retrying for you, **wrapping calls in your own retry loop multiplies the attempts**. With \`max_retries=3\` on the client and your own outer loop of 3, a transient burst can trigger 9 calls.

Pick one layer to own retries. For most apps, the SDK's built-in retry is enough. Reach for a custom loop only when you need *adaptive* backoff (e.g. honoring per-tenant rate limits) or *circuit breaking* across many requests.`,
        },
      ],
    },

    // ================================================================
    // 4. Writing backoff from scratch
    // ================================================================
    {
      title: "Writing backoff from scratch",
      blocks: [
        {
          kind: "prose",
          markdown: `Sometimes you need a retry loop you control — for example, when batching across many tenants where one tenant's 429 shouldn't poison the others, or when you want to integrate with a circuit breaker.

The textbook formula is **exponential backoff with full jitter**:

\`\`\`
delay_n = uniform(0, min(cap, base * 2 ** n))
\`\`\`

Where \`n\` is the attempt number (0, 1, 2, ...), \`base\` is the starting delay (e.g. 1.0s), and \`cap\` is the maximum delay (e.g. 30s).

**Why jitter?** Without it, every client that fails simultaneously retries simultaneously — that's the *thundering herd*. Full jitter (uniform 0..max) gives the best decorrelation; the AWS Architecture Blog has the canonical analysis.

**Why exponential?** Linear backoff doesn't give an overloaded server enough time to recover. Doubling the wait each round is harsh enough to actually relieve load.`,
        },
        {
          kind: "code_predict",
          label: "how long do you wait at attempt 4?",
          code: `import random

def delay(n: int, base: float = 1.0, cap: float = 30.0) -> float:
    return random.uniform(0, min(cap, base * 2 ** n))

# What is the MAXIMUM possible value of delay(4)?`,
          output: "16.0 seconds",
          explanation:
            "base * 2**4 = 1.0 * 16 = 16.0, which is less than the cap of 30.0. With full jitter the actual delay is uniform between 0 and 16.0, so the max is 16.0s.",
        },
        {
          kind: "mini_challenge",
          title: "implement retry_with_backoff",
          prompt: `Write a generic helper:

\`\`\`python
def retry_with_backoff(
    fn,
    *,
    max_retries: int = 5,
    base: float = 1.0,
    cap: float = 30.0,
    retry_on: tuple = (anthropic.RateLimitError, anthropic.OverloadedError, anthropic.APIConnectionError),
):
    ...
\`\`\`

It should call \`fn()\` up to \`max_retries\` times, sleeping \`uniform(0, min(cap, base * 2**n))\` between attempts. If \`fn\` raises an exception not in \`retry_on\`, re-raise immediately. If all retries are exhausted, re-raise the last exception.

Disable the SDK's own retries when calling \`fn\` (otherwise you'll multiply attempts).`,
          hints: [
            "Loop n in range(max_retries + 1) so you get one initial attempt plus max_retries retries.",
            "Use a try/except inside the loop. Catch only the retry_on tuple; let other exceptions propagate.",
            "On the LAST attempt, don't sleep — just re-raise.",
            "Have callers do: retry_with_backoff(lambda: client.with_options(max_retries=0).messages.create(...))",
          ],
          solution: `import random
import time
import anthropic

def retry_with_backoff(
    fn,
    *,
    max_retries: int = 5,
    base: float = 1.0,
    cap: float = 30.0,
    retry_on: tuple = (
        anthropic.RateLimitError,
        anthropic.OverloadedError,
        anthropic.APIConnectionError,
        anthropic.InternalServerError,
    ),
):
    last_exc = None
    for n in range(max_retries + 1):
        try:
            return fn()
        except retry_on as e:
            last_exc = e
            if n == max_retries:
                break
            sleep_for = random.uniform(0, min(cap, base * 2 ** n))
            time.sleep(sleep_for)
    raise last_exc

# Usage — disable SDK retries so we own the policy:
msg = retry_with_backoff(
    lambda: client.with_options(max_retries=0).messages.create(
        model="claude-sonnet-4-5",
        max_tokens=1024,
        messages=[{"role": "user", "content": "Hi"}],
    ),
    max_retries=5,
    base=1.0,
    cap=30.0,
)`,
          takeaway:
            "Full jitter + exponential growth + a tight retry_on tuple is the boring, correct solution. Always pass max_retries=0 to the SDK when wrapping it, so you don't double-count attempts.",
        },
      ],
    },

    // ================================================================
    // 5. Rate-limit headers & adaptive backoff
    // ================================================================
    {
      title: "Rate-limit headers & adaptive backoff",
      blocks: [
        {
          kind: "prose",
          markdown: `Anthropic returns rich rate-limit metadata on every response. When you get a 429, **the server tells you when to retry** — don't guess with backoff if you have a real number.

The relevant headers:

| Header | Meaning |
| --- | --- |
| \`retry-after\` | Seconds (or HTTP-date) until you may retry. **Honor this.** |
| \`anthropic-ratelimit-requests-limit\` | Per-minute request budget. |
| \`anthropic-ratelimit-requests-remaining\` | Requests left this minute. |
| \`anthropic-ratelimit-requests-reset\` | When the request bucket refills (RFC 3339 timestamp). |
| \`anthropic-ratelimit-tokens-limit\` | Per-minute input-token budget. |
| \`anthropic-ratelimit-tokens-remaining\` | Tokens left this minute. |
| \`anthropic-ratelimit-tokens-reset\` | When the token bucket refills. |

Even on **successful** responses, the \`*-remaining\` headers let you proactively slow down before you hit a 429. This is *adaptive* backoff: shape your traffic to the server's announced budget.`,
        },
        {
          kind: "scenario_predict",
          label: "when do you retry?",
          scenario: `HTTP/1.1 429 Too Many Requests
retry-after: 12
anthropic-ratelimit-tokens-limit: 80000
anthropic-ratelimit-tokens-remaining: 0
anthropic-ratelimit-tokens-reset: 2026-05-14T19:30:00Z
content-type: application/json

{"type":"error","error":{"type":"rate_limit_error","message":"..."}}`,
          language: "text",
          question:
            "You caught a RateLimitError carrying these headers. What is the simplest correct retry strategy?",
          answer:
            "Sleep 12 seconds (the retry-after value), then retry once. Fall back to exponential backoff only if retry-after is missing.",
          explanation:
            "When retry-after is present, it's an authoritative hint from the server — your jittered exponential backoff might wait longer or shorter than necessary. Always prefer the server's number when available.",
        },
        {
          kind: "key_insight",
          label: "retry-after wins over your formula",
          insight: `Order of precedence when deciding how long to wait after a 429:

1. \`retry-after\` header (if present) — use exactly this value.
2. Compute from \`anthropic-ratelimit-tokens-reset\` if you're being throttled on tokens.
3. Fall back to exponential backoff with full jitter.

Your formula is the floor, not the ceiling.`,
        },
        {
          kind: "mini_challenge",
          title: "honor retry-after in your retry loop",
          prompt: `Modify \`retry_with_backoff\` from the previous section so that on a \`RateLimitError\`, it reads \`e.response.headers["retry-after"]\` and uses that as the sleep value (parsed as a float number of seconds). Fall back to the jittered formula if the header is missing.

Hints: \`anthropic.RateLimitError\` exposes the underlying httpx response as \`e.response\`. Headers are case-insensitive.`,
          hints: [
            "Inside the except clause, branch on isinstance(e, anthropic.RateLimitError).",
            "Use e.response.headers.get('retry-after') — it's a string or None.",
            "If the header is set, sleep_for = float(retry_after). Otherwise compute the jittered delay.",
          ],
          solution: `import random
import time
import anthropic

def retry_with_backoff(fn, *, max_retries=5, base=1.0, cap=30.0):
    retry_on = (
        anthropic.RateLimitError,
        anthropic.OverloadedError,
        anthropic.APIConnectionError,
        anthropic.InternalServerError,
    )
    last_exc = None
    for n in range(max_retries + 1):
        try:
            return fn()
        except retry_on as e:
            last_exc = e
            if n == max_retries:
                break

            sleep_for = None
            if isinstance(e, anthropic.RateLimitError):
                ra = e.response.headers.get("retry-after")
                if ra is not None:
                    try:
                        sleep_for = float(ra)
                    except ValueError:
                        sleep_for = None  # could be HTTP-date; fall through

            if sleep_for is None:
                sleep_for = random.uniform(0, min(cap, base * 2 ** n))

            time.sleep(sleep_for)
    raise last_exc`,
          takeaway:
            "When the server hands you a number, use the number. Your jitter formula is a fallback for cases where retry-after isn't present (e.g. APIConnectionError, where there's no response at all).",
        },
      ],
    },

    // ================================================================
    // 6. Streaming-specific failures
    // ================================================================
    {
      title: "Streaming-specific failures",
      blocks: [
        {
          kind: "prose",
          markdown: `Streaming is where retry logic gets interesting, because **the failure can happen mid-response**. You may have already shown the user 800 tokens before the connection drops on the 801st.

\`\`\`python
import anthropic

client = anthropic.Anthropic()

with client.messages.stream(
    model="claude-sonnet-4-5",
    max_tokens=4096,
    messages=[{"role": "user", "content": "Write a long poem"}],
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)
\`\`\`

If the network drops mid-stream, you'll get an \`anthropic.APIConnectionError\` raised from inside the iterator. The partial text is *gone* — it lives in your terminal, not in any object you can replay.

You can't resume a stream. The only retry strategy is **start over**, optionally pre-filling the assistant's prior partial text using \`messages: [..., {"role": "assistant", "content": partial}]\` so Claude continues from where it left off.`,
        },
        {
          kind: "code_predict",
          label: "what's in stream.get_final_message() after a connection drop?",
          code: `import anthropic

client = anthropic.Anthropic()

try:
    with client.messages.stream(
        model="claude-sonnet-4-5",
        max_tokens=4096,
        messages=[{"role": "user", "content": "Long answer please"}],
    ) as stream:
        for text in stream.text_stream:
            print(text, end="")
            # Network drops 200 tokens in...
except anthropic.APIConnectionError:
    # We never reached stream.get_final_message().
    print("Stream dropped")`,
          output: "Stream dropped (no final message; partial text only printed to stdout)",
          explanation:
            "When the connection dies mid-stream, the exception propagates out of the iterator. You can't call get_final_message() on a broken stream. Anything you didn't print/buffer yourself is lost — there's no server-side resume.",
        },
        {
          kind: "key_insight",
          label: "Buffer streamed text yourself if you'll need to retry",
          insight: `If your retry strategy involves prefilling Claude with the partial response, **you must collect the streamed text into a buffer as it arrives**. The stream object itself doesn't preserve text after a failure.

\`\`\`python
buf = []
try:
    with client.messages.stream(...) as stream:
        for text in stream.text_stream:
            buf.append(text)
            print(text, end="")
except anthropic.APIConnectionError:
    partial = "".join(buf)
    # Retry with messages = [..., {"role":"assistant", "content": partial}]
\`\`\``,
        },
      ],
    },

    // ================================================================
    // 7. Production patterns
    // ================================================================
    {
      title: "Production patterns",
      blocks: [
        {
          kind: "prose",
          markdown: `Once your app handles single-request failures correctly, you face a new class of problem: **cascading failure** under sustained errors. A few patterns to keep in your toolkit.

**1. Circuit breaker.** If 50% of requests in the last minute return 5xx, stop sending new requests for 30 seconds. This protects upstream and gives the failing service room to recover. Libraries: \`pybreaker\`, \`circuitbreaker\`.

**2. Dead-letter queue (for batch jobs).** When a batch worker exhausts retries on an item, don't drop it on the floor — write it to a DLQ (an SQS queue, a database table, a JSONL file) so you can replay later after fixing the bug.

**3. Per-tenant token-bucket on top of the SDK.** When you're multiplexing many customers through one API key, one customer's runaway usage shouldn't starve the others. Apply a per-tenant rate limit *before* the SDK call.

**4. Structured logging.** Log the error class, the request body summary, and — most importantly — the **request ID**.`,
        },
        {
          kind: "key_insight",
          label: "Always log the request-id",
          insight: `Every Anthropic API response (success OR error) carries a unique \`request-id\`. If you ever need to ask Anthropic support to investigate, the **first thing they'll ask for is the request ID**. Without it they cannot find your request in their logs.

\`\`\`python
try:
    msg = client.messages.create(...)
    log.info("ok", extra={"request_id": msg._request_id})
except anthropic.APIStatusError as e:
    log.error(
        "anthropic_error",
        extra={
            "request_id": e.response.headers.get("request-id"),
            "status": e.status_code,
            "type": e.__class__.__name__,
            "message": str(e),
        },
    )
\`\`\`

The SDK exposes the request id as \`message._request_id\` on success, and on errors via \`e.response.headers["request-id"]\` (or \`e.request_id\` on newer SDK versions). Log it on both paths.`,
        },
        {
          kind: "scenario_predict",
          label: "what should this batch worker do?",
          scenario: `# Batch worker processing 10,000 customer support tickets through Claude.
# At ticket #4,217 you start getting:
#
#   anthropic.OverloadedError: 529 - {"type":"overloaded_error", ...}
#
# It happens on tickets 4217..4230, then disappears for 100 tickets,
# then comes back, and so on, for 20 minutes.
#
# Your current code: a simple try/except that retries 3 times with backoff,
# then drops the ticket and continues.`,
          language: "text",
          question:
            "What's the single most important change to make this worker production-ready?",
          answer:
            "Send dropped tickets to a dead-letter queue (DLQ) instead of silently skipping them, so they can be replayed after the overload resolves.",
          explanation:
            "OverloadedError is transient infrastructure capacity. Silently dropping items means your output is incomplete and you have no record of what was lost. A DLQ (file, database table, queue) lets you reprocess once Anthropic has capacity, with no human intervention beyond rerunning the worker.",
        },
        {
          kind: "flashcard",
          context: "Production hygiene",
          front: "Where do you read the request ID on a successful response?",
          back: "`message._request_id` (or the `request-id` HTTP header from the response).",
        },
        {
          kind: "flashcard",
          context: "Production hygiene",
          front: "What's the default max_retries on `anthropic.Anthropic()`?",
          back: "**2.** The SDK retries up to 2 times on transient errors with exponential backoff and jitter.",
        },
        {
          kind: "flashcard",
          context: "Production hygiene",
          front: "Why prefer full jitter over fixed exponential backoff?",
          back: "Avoids the **thundering herd**: many clients failing at the same instant would otherwise all retry at exactly the same instant.",
        },
        {
          kind: "flashcard",
          context: "Production hygiene",
          front: "Can you resume an Anthropic stream that dropped mid-response?",
          back: "**No.** Restart with the partial text prefilled as an assistant message so Claude continues. Buffer text as it arrives if you'll need this.",
        },
      ],
    },

    // ================================================================
    // 8. Recap
    // ================================================================
    {
      title: "Recap",
      blocks: [
        {
          kind: "prose",
          markdown: `Quick mental checklist for any new Claude integration:

1. Catch \`anthropic.APIStatusError\` and \`anthropic.APIConnectionError\` separately.
2. Decide retry vs not based on the **class**, not the message text.
3. Trust the SDK's built-in \`max_retries\` (default 2) for the simple case.
4. When you need adaptive behavior, set \`max_retries=0\` on the SDK and own the loop.
5. Honor \`retry-after\` before falling back to your jitter formula.
6. Log the \`request-id\` on every call — success and failure.
7. For batch jobs: dead-letter queue + circuit breaker.
8. For streaming: buffer the partial text yourself if you might need to retry.`,
        },
        {
          kind: "flashcard",
          context: "Recap",
          front: "Three retry-worthy status codes you must know",
          back: "**429** RateLimitError, **5xx** (especially 500/502/503), **529** OverloadedError. Plus any APIConnectionError.",
        },
        {
          kind: "flashcard",
          context: "Recap",
          front: "Three never-retry status codes you must know",
          back: "**400** BadRequestError, **401** AuthenticationError, **404** NotFoundError. Retrying these wastes quota and obscures bugs.",
        },
        {
          kind: "flashcard",
          context: "Recap",
          front: "Formula: full-jitter exponential backoff",
          back: "`delay_n = uniform(0, min(cap, base * 2 ** n))` where n is the attempt index.",
        },
      ],
    },
  ],
};
