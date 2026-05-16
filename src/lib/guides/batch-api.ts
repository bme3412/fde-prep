import type { StudyGuide } from "../guide-types";

export const batchApiGuide: StudyGuide = {
  topicTitle: "Batch API",
  topicSlug: "batch-api",
  sections: [
    // ================================================================
    // 1. Why batch exists (cost & SLA tradeoffs)
    // ================================================================
    {
      title: "Why batch exists",
      blocks: [
        {
          kind: "prose",
          markdown: `You inherit a job ticket from product: "label the sentiment of every support ticket from the last six months." It's 50,000 tickets. Each one is a short message, maybe 200 input tokens, with a 30-token classification output.

You write the obvious thing: a Python script with \`messages.create\` in a loop, maybe an \`asyncio.Semaphore\` to fan out 20 at a time. It works. It will take roughly three hours of wall clock and burn through your sync-API rate limits the whole time. Worse: it costs *exactly* twice what it could.

There is a second API on Anthropic for this exact shape of work — a job, not a request. You hand over a JSONL of all 50,000 requests, walk away, and come back later (usually within an hour, **always** within 24 hours) to a JSONL of all 50,000 results. Same model, same prompts, same outputs. **Half the price.** Zero sync rate-limit pressure.

That API is called the **Message Batches API**. This guide is about when to reach for it, how the lifecycle works, and the production patterns that prevent foot-guns.`,
        },
        {
          kind: "scenario_predict",
          label: "the cost math",
          scenario: `Workload: 50,000 classification requests
  Each request: ~250 input tokens, ~30 output tokens
  Model:     Claude Sonnet 4.5

Sonnet 4.5 sync pricing:   $3.00 / MTok in,  $15.00 / MTok out
Sonnet 4.5 batch pricing:  $1.50 / MTok in,   $7.50 / MTok out

Sync total cost  = (50,000 * 250 / 1e6) * $3.00  + (50,000 * 30 / 1e6) * $15.00
                 = $37.50 + $22.50
                 = $60.00

Batch total cost = ?`,
          language: "text",
          question:
            "What is the batch total cost, and what is the dollar savings vs sync?",
          answer:
            "Batch total = (50,000 * 250 / 1e6) * $1.50 + (50,000 * 30 / 1e6) * $7.50 = $18.75 + $11.25 = **$30.00**. Savings = **$30.00**, exactly 50% of the sync cost.",
          explanation:
            "The discount is a flat 50% on *both* input and output tokens. Multiply your sync estimate by 0.5 to get the batch estimate — there's no per-MTok arithmetic to memorize beyond the standard prices.",
        },
        {
          kind: "key_insight",
          label: "Batch is a throughput/cost lever, not a latency lever",
          insight: `The single most important framing: **batch trades latency for price and headroom**. You pay 50% less. You no longer fight sync rate limits. In return, the API gives itself **up to 24 hours** to deliver results.

In practice most batches finish in under an hour, but **24 h is the hard SLA** — your code must tolerate it. If your workload has a human waiting at the other end, or a downstream system polling every 30 seconds, batch is the wrong tool no matter how good the price looks.`,
        },
        {
          kind: "code_comparison",
          label: "sync fan-out vs batch submission",
          left: {
            title: "Sync with semaphore (the loop you'd otherwise write)",
            code: `import anthropic, asyncio

client = anthropic.AsyncAnthropic()
sem = asyncio.Semaphore(20)

async def classify(ticket):
    async with sem:
        msg = await client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=30,
            messages=[{"role": "user", "content": ticket.body}],
        )
        return ticket.id, msg.content[0].text

async def main(tickets):
    return await asyncio.gather(*(classify(t) for t in tickets))`,
            annotation:
              "~3 h wall clock, full sync price, constant rate-limit pressure, requires async + retry plumbing you write yourself.",
          },
          right: {
            title: "Batch submission (one call, walk away)",
            code: `import anthropic
from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
from anthropic.types.messages.batch_create_params import Request

client = anthropic.Anthropic()

batch = client.messages.batches.create(
    requests=[
        Request(
            custom_id=f"ticket-{t.id}",
            params=MessageCreateParamsNonStreaming(
                model="claude-sonnet-4-5",
                max_tokens=30,
                messages=[{"role": "user", "content": t.body}],
            ),
        )
        for t in tickets
    ]
)
print(batch.id)  # msgbatch_...`,
            annotation:
              "One HTTP request. 50% discount. Up to 24 h SLA. No retry loop to write. Poll the batch id later for results.",
          },
          takeaway:
            "Same prompts, same model, same outputs. Half the cost, none of the orchestration. Batch wins any time you can wait.",
        },
        {
          kind: "flashcard",
          context: "Three workloads where batch is obviously the right call.",
          front: "Name three production workloads where the Message Batches API is the default tool, not sync.",
          back: "(1) **Eval runs** — thousands of test cases against a candidate prompt or model. (2) **Content moderation backfills / re-labeling** — large pools of UGC reclassified after a policy change. (3) **Bulk content generation** — product descriptions, summaries, embeddings prep, data labeling at corpus scale.",
        },
        {
          kind: "flashcard",
          context: "Three workloads where batch is the *wrong* call.",
          front: "When is the Batches API the wrong tool, even though the 50% discount is tempting?",
          back: "(1) **Anything user-facing** — chat, autocomplete, agent loops. The 24 h SLA disqualifies it. (2) **Small jobs (~< a few hundred requests)** — orchestration overhead dominates and the sync API already runs in seconds. (3) **Anything that needs streaming** — batch responses are not streamed; they land as a JSONL file when the whole batch ends.",
        },
      ],
    },

    // ================================================================
    // 2. Anatomy of a batch request
    // ================================================================
    {
      title: "Anatomy of a batch request",
      blocks: [
        {
          kind: "prose",
          markdown: `A batch is a thin wrapper around the Messages API. The request body has exactly one top-level field, \`requests\`, which is a list of objects, each with two fields:

\`\`\`json
{
  "requests": [
    { "custom_id": "ticket-42", "params": { /* a normal Messages API body */ } },
    { "custom_id": "ticket-43", "params": { /* a normal Messages API body */ } }
  ]
}
\`\`\`

Whatever you would have sent to \`POST /v1/messages\` synchronously — \`model\`, \`messages\`, \`system\`, \`max_tokens\`, \`tools\`, \`tool_choice\`, \`temperature\`, vision blocks, prompt caching, all of it — goes verbatim into \`params\`. The batch endpoint is just the *postal envelope*; the letters inside are unchanged.

The \`custom_id\` is yours. It's how you'll join results back to inputs once the batch ends.`,
        },
        {
          kind: "method_ref",
          title: "anthropic.Anthropic().messages.batches — the surface area",
          importLine: 'import anthropic\nclient = anthropic.Anthropic()',
          methods: [
            {
              signature: ".create(requests=[Request(custom_id, params), ...])",
              description:
                "POST /v1/messages/batches — submit a list of up to 100,000 requests (or 256 MB total). Returns a MessageBatch with id starting `msgbatch_`.",
              returns: "MessageBatch (processing_status=in_progress)",
            },
            {
              signature: ".retrieve(message_batch_id)",
              description:
                "GET /v1/messages/batches/{id} — fetch current state. Call this in your polling loop to detect when processing_status flips to `ended`.",
              returns: "MessageBatch",
            },
            {
              signature: ".list(limit=20)",
              description:
                "GET /v1/messages/batches — paginated list of all batches in the workspace. SDK auto-pages with after_id / last_id under the hood.",
              returns: "Iterator[MessageBatch]",
            },
            {
              signature: ".cancel(message_batch_id)",
              description:
                "POST /v1/messages/batches/{id}/cancel — request cancellation. Status moves through `canceling` to `ended`; in-flight requests may still land as `succeeded`.",
              returns: "MessageBatch (processing_status=canceling)",
            },
            {
              signature: ".results(message_batch_id)",
              description:
                "Stream the JSONL results file from results_url. Yields one MessageBatchIndividualResponse per line. Always prefer this over downloading the file whole.",
              returns: "Iterator[MessageBatchIndividualResponse]",
            },
            {
              signature: "DELETE /v1/messages/batches/{id}",
              description:
                "Hard-delete a batch (and its results). The batch must already be in a terminal state — cancel first if it's still in_progress.",
            },
          ],
        },
        {
          kind: "scenario_predict",
          label: "JSONL line shape",
          scenario: `One line from a batch's input JSONL:

{ "custom_id": "ticket_42-v3", "params": { "model": "claude-sonnet-4-5", "max_tokens": 100, "messages": [{ "role": "user", "content": "..." }] } }

The custom_id field must match the regex ^[a-zA-Z0-9_-]{1,64}$.`,
          language: "json",
          question:
            "Which of these custom_id values would be REJECTED by the API: 'ticket.42', 'ticket-42-v3', 'a' * 65, 'TICKET_42_v3'?",
          answer:
            "Rejected: 'ticket.42' (contains '.', which isn't in [a-zA-Z0-9_-]) and 'a' * 65 (exceeds the 64-character cap). Accepted: 'ticket-42-v3' and 'TICKET_42_v3' (both are within length and use only allowed characters).",
          explanation:
            "The regex `^[a-zA-Z0-9_-]{1,64}$` allows letters (either case), digits, hyphens, and underscores — and nothing else. No dots, slashes, colons, spaces, or unicode. Design your IDs around this from the start; sanitizing 50,000 IDs after the fact is painful.",
        },
        {
          kind: "warm_up",
          title: "Why custom_id is required",
          prompt:
            "Why does the Batches API force *you* to supply a `custom_id` instead of auto-assigning one server-side?",
          answer:
            "Because results stream back in an undefined order, and you need a stable join key that points back to your domain (ticket id, row id, eval case name).",
          explanation:
            "If results were ordered, you could match by position. They aren't, so the API forces every request to carry its own correlation handle. Treat custom_id as a foreign key into your application's data — that's literally its job.",
        },
        {
          kind: "code_predict",
          label: "what comes back the instant you submit",
          code: `import anthropic
from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
from anthropic.types.messages.batch_create_params import Request

client = anthropic.Anthropic()

batch = client.messages.batches.create(
    requests=[
        Request(
            custom_id=f"req-{i}",
            params=MessageCreateParamsNonStreaming(
                model="claude-sonnet-4-5",
                max_tokens=50,
                messages=[{"role": "user", "content": f"Number {i}"}],
            ),
        )
        for i in range(3)
    ]
)

print(batch.processing_status)
print(batch.request_counts.processing, batch.request_counts.succeeded)
print(batch.results_url is None, batch.ended_at is None)`,
          output: `in_progress
3 0
True True`,
          explanation:
            "Submission is synchronous, but processing is not. The API immediately returns a MessageBatch with `processing_status='in_progress'`, all N requests in `request_counts.processing`, and both `results_url` and `ended_at` unset (None). The actual work hasn't started yet — you've just registered the job.",
        },
        {
          kind: "key_insight",
          label: "Validation is asynchronous — dry-run first",
          insight: `When you submit a batch, the API performs **only a shallow check** on the envelope. It does not validate every request's \`params\` against the Messages API schema at submit time.

A bad \`params\` (typo in \`model\`, a tool schema that fails validation, missing required field) will not reject the batch. Instead, that single request will surface as \`result.type == "errored"\` with an \`invalid_request_error\` — *after the batch ends*, possibly hours later.

**Rule:** before submitting a 50,000-request batch, send a single request with the same \`params\` to the sync Messages API. If it succeeds, your shape is good. If it 400s, you've just saved yourself a several-hour round trip.`,
        },
        {
          kind: "flashcard",
          context: "Headers required on every batch call.",
          front: "Which three HTTP headers must accompany every Batches API request?",
          back: "`x-api-key: $ANTHROPIC_API_KEY`, `anthropic-version: 2023-06-01`, and `content-type: application/json`. (The `anthropic-version` header is the API version, not an SDK version — `2023-06-01` is current.)",
        },
      ],
    },

    // ================================================================
    // 3. The batch lifecycle
    // ================================================================
    {
      title: "The batch lifecycle",
      blocks: [
        {
          kind: "prose",
          markdown: `A batch lives in one of three top-level processing states, tracked on the \`processing_status\` field:

- **\`in_progress\`** — accepted, currently being worked on.
- **\`canceling\`** — you called \`.cancel()\`, the system is winding down. Transient.
- **\`ended\`** — terminal. Could mean fully succeeded, partially errored, fully canceled, or fully expired. The *batch* is done either way; the per-request outcomes are in \`request_counts\`.

That bulk state is too coarse for production. The \`request_counts\` object decomposes it into five buckets that always sum to the total number of requests you submitted:

\`\`\`json
"request_counts": {
  "processing": 0,    // not yet sent to the model
  "succeeded": 4823,  // got a model response
  "errored":   77,    // model or validation error
  "canceled":  0,     // you canceled before this one ran
  "expired":   100    // 24 h ticked over before this one ran
}
\`\`\`

When \`processing == 0\`, the batch transitions to \`ended\` and \`results_url\` becomes populated. The other four buckets are where the action is.`,
        },
        {
          kind: "scenario_predict",
          label: "is this batch done?",
          scenario: `{
  "id": "msgbatch_01HkcTjaV5uDC8jWR4ZsDV8d",
  "processing_status": "?????",
  "request_counts": {
    "processing": 0,
    "succeeded": 4823,
    "errored":   77,
    "canceled":  0,
    "expired":   100
  },
  "ended_at":     "2024-09-25T11:14:22Z",
  "results_url":  "https://api.anthropic.com/v1/messages/batches/msgbatch_.../results"
}`,
          language: "json",
          question:
            "What is the value of processing_status, and is it safe to start streaming from results_url?",
          answer:
            "`processing_status` is `ended`. Yes — `processing == 0`, `ended_at` is set, and `results_url` is populated. All three are the canonical signals that the batch is finalized and results are ready to stream.",
          explanation:
            "The contract is: when every request has moved out of the `processing` bucket, the batch transitions to `ended`, `ended_at` is stamped, and `results_url` is populated. A non-zero `errored` or `expired` count is normal — it means some individual requests didn't succeed, not that the batch itself failed.",
        },
        {
          kind: "method_ref",
          title: "MessageBatch — the fields you'll actually read",
          importLine: "# Returned by client.messages.batches.create / .retrieve",
          methods: [
            {
              signature: ".id",
              description:
                "The batch identifier (e.g. `msgbatch_01HkcTjaV5uDC8jWR4ZsDV8d`). Persist this — it's how you re-find the batch after a restart.",
              returns: "str",
            },
            {
              signature: ".processing_status",
              description:
                "One of `in_progress`, `canceling`, `ended`. The terminal state for any successful or failed batch lifecycle is `ended`.",
              returns: 'Literal["in_progress", "canceling", "ended"]',
            },
            {
              signature: ".request_counts",
              description:
                "Object with `processing`, `succeeded`, `errored`, `canceled`, `expired`. They always sum to the original request count.",
              returns: "MessageBatchRequestCounts",
            },
            {
              signature: ".created_at",
              description:
                "When the batch was submitted. The 24-hour expiration clock and the 29-day result-retention clock both tick from here.",
              returns: "datetime",
            },
            {
              signature: ".expires_at",
              description:
                "Exactly `created_at + 24h`. Any request still in `processing` at this time rolls to `expired`.",
              returns: "datetime",
            },
            {
              signature: ".ended_at",
              description:
                "Populated when the batch transitions to `ended`. `None` while in_progress or canceling.",
              returns: "datetime | None",
            },
            {
              signature: ".cancel_initiated_at",
              description:
                "Populated when you call `.cancel()`. Persists on the final ended batch so you can tell apart 'naturally ended' vs 'we canceled it'.",
              returns: "datetime | None",
            },
            {
              signature: ".results_url",
              description:
                "Presigned URL for the results JSONL file. `None` until the batch is `ended`. Prefer the SDK helper `.results(id)` over fetching this manually.",
              returns: "str | None",
            },
          ],
        },
        {
          kind: "multiple_choice",
          title: "Triage at end-of-batch",
          prompt:
            "Your batch reaches `processing_status: ended` with `request_counts: { succeeded: 9990, errored: 10, canceled: 0, expired: 0 }`. What's the correct next step?",
          choices: [
            {
              text: "Resubmit the entire 10,000-request batch since some failed.",
              correct: false,
              rationale:
                "You'd pay for the 9,990 already-succeeded requests a second time. The 'whole batch failed' model doesn't apply — each request is independent.",
            },
            {
              text: "Stream results, separate succeeded from errored, and decide how to handle each errored request based on its error type.",
              correct: true,
              rationale:
                "Right. Iterate the results, branch on `result.type`. For errored, branch again on `error.error.type` — `invalid_request_error` means fix the body, anything else is typically safe to resubmit in a smaller batch.",
            },
            {
              text: "Wait a few more minutes — `ended` may flip back to `in_progress`.",
              correct: false,
              rationale:
                "`ended` is terminal. The state machine is one-way: in_progress → (canceling) → ended. There is no path back.",
            },
            {
              text: "Open a support ticket — any errored requests indicate an API outage.",
              correct: false,
              rationale:
                "`errored` is normal and per-request. It usually reflects a bad params payload (your fault, not Anthropic's), occasionally a transient model error worth resubmitting.",
            },
          ],
          explanation:
            "Think of a batch as 10,000 independent jobs, not one monolithic job. The summary counters tell you what happened in aggregate; the streamed results tell you what to do per request. Always handle `errored` results individually, because the right response (fix vs retry vs ignore) depends entirely on the error class.",
        },
        {
          kind: "key_insight",
          label: "The 24-hour deadline is hard",
          insight: `When \`created_at + 24h\` arrives, anything still in the \`processing\` bucket rolls over to \`expired\` and the batch transitions to \`ended\`. There is no extension, no grace period, and no automatic retry.

The silver lining: **you are not billed for expired requests**, just like \`canceled\` and \`errored\` server errors. So expiration is annoying but not expensive.

The practical lever: for very large jobs (50k+) under heavy demand, split into multiple smaller batches submitted in parallel rather than one mega-batch. Smaller batches are less likely to bump the 24h ceiling, and you can resubmit any single failing batch independently.`,
        },
        {
          kind: "flashcard",
          context: "Memorize the five buckets.",
          front: "Name the five integer fields inside `request_counts` and explain what each means.",
          back: "`processing` (still in the queue, not yet sent to the model), `succeeded` (got a model response), `errored` (validation or server error — *not* billed if server-side, billed normally if your params produced a 200 response from the model), `canceled` (you called .cancel() before this request ran), `expired` (24 h elapsed before this request ran). They always sum to the total request count.",
        },
      ],
    },

    // ================================================================
    // 4. Polling for completion
    // ================================================================
    {
      title: "Polling for completion",
      blocks: [
        {
          kind: "prose",
          markdown: `The SDK does not "await" a batch for you. \`.create()\` returns the moment the API has accepted your submission — the batch is still \`in_progress\`. You're responsible for polling \`.retrieve(id)\` until \`processing_status == "ended"\`, then reading results.

This sounds primitive, and it is, but the design is intentional: real batches run for tens of minutes to several hours. You should never hold an HTTP connection open that long. Polling lets you crash, restart, hand off to another worker — anything — and resume just by remembering the batch id.

The only mistake you can make here is polling too aggressively. The SLA is hours; polling every second buys you nothing and burns API quota. **60 seconds is a sensible floor.**`,
        },
        {
          kind: "code_predict",
          label: "the canonical polling loop",
          code: `import anthropic, time

client = anthropic.Anthropic()
BATCH_ID = "msgbatch_01HkcTjaV5uDC8jWR4ZsDV8d"

batch = None
while True:
    batch = client.messages.batches.retrieve(BATCH_ID)
    if batch.processing_status == "ended":
        break
    print(f"still processing... {batch.request_counts.processing} left")
    time.sleep(60)

print("done:", batch.request_counts.succeeded, "succeeded")`,
          output: `still processing... 4923 left
still processing... 2104 left
still processing... 0 left
done: 10000 succeeded`,
          explanation:
            "The loop exits the *first* time it observes `processing_status == 'ended'`. Note `processing` can hit 0 *just before* the status flips — this is fine, the next iteration catches the transition and breaks. After break, `batch` holds the final terminal MessageBatch with `results_url` populated.",
        },
        {
          kind: "mini_challenge",
          title: "Build wait_for_batch with timeout and backoff",
          prompt: `Write a helper \`wait_for_batch(client, batch_id, *, poll_s=60, max_poll_s=600, timeout_s=24*3600)\` that:

1. Polls \`client.messages.batches.retrieve(batch_id)\` until \`processing_status == "ended"\`.
2. Doubles the sleep interval each iteration, capped at \`max_poll_s\`.
3. Raises \`TimeoutError\` if \`timeout_s\` elapses before the batch ends.
4. Returns the final \`MessageBatch\`.

It should be safe to call from any worker — no global state, no persisted file handles.`,
          hints: [
            "Track elapsed time with `time.monotonic()` not `time.time()` — monotonic is immune to clock skew during long waits.",
            "Use `min(poll_s * 2, max_poll_s)` to double-then-cap. Update the sleep after each retrieve, not before.",
            "Compute the *remaining* timeout each iteration: `remaining = timeout_s - elapsed`. If `remaining <= 0`, raise immediately. Otherwise sleep `min(poll_s, remaining)` so you don't oversleep past the timeout.",
          ],
          solution: `import time
from anthropic import Anthropic
from anthropic.types.messages.message_batch import MessageBatch


def wait_for_batch(
    client: Anthropic,
    batch_id: str,
    *,
    poll_s: float = 60,
    max_poll_s: float = 600,
    timeout_s: float = 24 * 3600,
) -> MessageBatch:
    start = time.monotonic()
    sleep = poll_s
    while True:
        batch = client.messages.batches.retrieve(batch_id)
        if batch.processing_status == "ended":
            return batch
        elapsed = time.monotonic() - start
        remaining = timeout_s - elapsed
        if remaining <= 0:
            raise TimeoutError(
                f"batch {batch_id} still {batch.processing_status} "
                f"after {timeout_s}s; counts={batch.request_counts}"
            )
        time.sleep(min(sleep, remaining))
        sleep = min(sleep * 2, max_poll_s)`,
          takeaway:
            "Two production hardening tricks worth internalizing: monotonic clocks for any wait longer than seconds, and cap-then-clip the sleep so the timeout is honored exactly, not 'within one poll interval'.",
        },
        {
          kind: "scenario_predict",
          label: "what happens right after .cancel()",
          scenario: `# Call sequence
batch = client.messages.batches.cancel("msgbatch_01abc...")
print(batch.processing_status)        # ?
print(batch.cancel_initiated_at)      # ?
print(batch.request_counts.canceled)  # ?

# Sometime later, after polling
final = client.messages.batches.retrieve("msgbatch_01abc...")
print(final.processing_status)        # ?`,
          language: "text",
          question:
            "Fill in each printed value (or describe it). What terminal state does the cancellation eventually land in?",
          answer:
            "Immediately after cancel(): `processing_status` is `canceling`, `cancel_initiated_at` is set to ~now, `request_counts.canceled` is typically still 0 (the system is just *starting* to cancel). After polling: `processing_status` becomes `ended` with some mix of `succeeded` (requests that landed before cancellation took effect) and `canceled` (requests stopped before they ran). `cancel_initiated_at` is preserved on the final object so you can distinguish a user-initiated stop from a natural finish.",
          explanation:
            "Cancellation is *cooperative*, not preemptive. The API drains in-flight work, marks the rest as canceled, then transitions the batch to `ended`. You poll the same way as for a natural completion — `cancel_initiated_at` is the breadcrumb that tells you *why* it ended.",
        },
        {
          kind: "warm_up",
          title: "HTTP shape of cancellation",
          prompt:
            "Which HTTP method and endpoint cancels a batch?",
          answer:
            "`POST /v1/messages/batches/{message_batch_id}/cancel`",
          explanation:
            "It's a POST (mutating action) with no body. The endpoint mirrors `retrieve` with a `/cancel` suffix. The response is the same `MessageBatch` shape you'd get from `retrieve`, with `processing_status: canceling` and `cancel_initiated_at` set.",
        },
        {
          kind: "flashcard",
          context: "Polling cadence — a rule of thumb worth memorizing.",
          front: "What's the recommended floor for batch polling interval, and why not poll every second?",
          back: "**60 seconds** is a sensible floor. Polling every second buys you sub-minute notification of completion on a job that takes hours, while burning API quota and money for no UX benefit. Use 60 s as a starting point and back off exponentially up to ~10 minutes for very long-running batches.",
        },
      ],
    },

    // ================================================================
    // 5. Streaming results (the .jsonl payload)
    // ================================================================
    {
      title: "Streaming results",
      blocks: [
        {
          kind: "prose",
          markdown: `When \`processing_status\` flips to \`ended\`, the \`results_url\` field becomes a presigned URL pointing at a JSONL file. Each line is a single \`MessageBatchIndividualResponse\` — the outcome for one of your submitted requests.

The SDK gives you \`client.messages.batches.results(id)\` which streams that file line-by-line. **Always prefer this over downloading the file whole** — a 100k-request batch can produce a multi-hundred-megabyte JSONL, and loading the whole thing into memory just to iterate it is wasteful.

Each result line has two top-level fields you care about:

- **\`custom_id\`** — the string you supplied at submission time. This is your join key.
- **\`result\`** — an object with a discriminated \`type\` field that is one of \`succeeded\`, \`errored\`, \`canceled\`, or \`expired\`.

That's the entire shape. Branch on \`result.type\` and you've handled the API.`,
        },
        {
          kind: "scenario_predict",
          label: "two lines from a results file",
          scenario: `{"custom_id":"ticket-1","result":{"type":"succeeded","message":{"id":"msg_01...","type":"message","role":"assistant","model":"claude-sonnet-4-5","content":[{"type":"text","text":"positive"}],"stop_reason":"end_turn","usage":{"input_tokens":24,"output_tokens":2}}}}
{"custom_id":"ticket-0","result":{"type":"errored","error":{"type":"error","error":{"type":"invalid_request_error","message":"messages.0.content: Input should be a valid string"}}}}`,
          language: "json",
          question:
            "Two things to notice: (a) the order versus the input order, and (b) which single field do you use to map each line back to the original request?",
          answer:
            "(a) Order is *not* preserved — `ticket-1` arrived before `ticket-0` even though `ticket-0` was submitted first. (b) `custom_id` is the only correlation field; never rely on line number or array index.",
          explanation:
            "Batches run requests in parallel under the hood, so completion order depends on scheduling, not submission order. Every consumer of results must look up the original request by `custom_id`. This is exactly why the API mandates a unique custom_id per request.",
        },
        {
          kind: "method_ref",
          title: "result.type — the four outcomes",
          importLine: "# match on result.result.type",
          methods: [
            {
              signature: 'result.type == "succeeded"',
              description:
                "The model produced a response. `result.message` carries a full Message object — same shape as a synchronous Messages API response. Billed normally (at the 50% batch discount).",
            },
            {
              signature: 'result.type == "errored"',
              description:
                "Per-request failure. `result.error.error.type` distinguishes `invalid_request_error` (your params were malformed — won't succeed on retry, fix and resubmit) from server-side errors like `overloaded_error` or `api_error` (safe to resubmit in a fresh batch). **Not billed.**",
            },
            {
              signature: 'result.type == "canceled"',
              description:
                "You called .cancel() and this request was stopped before it ran. **Not billed.** Indicates explicit caller intent — don't auto-resubmit.",
            },
            {
              signature: 'result.type == "expired"',
              description:
                "The 24-hour batch deadline elapsed before this request ran. **Not billed.** Typically caused by submitting a batch too large for current demand. Resubmit in smaller batches.",
            },
          ],
        },
        {
          kind: "code_predict",
          label: "branching on result.type with match",
          code: `import anthropic

client = anthropic.Anthropic()

succeeded, retryable, fix_then_retry, gave_up = 0, 0, 0, 0

for r in client.messages.batches.results("msgbatch_01..."):
    match r.result.type:
        case "succeeded":
            succeeded += 1
        case "errored":
            if r.result.error.error.type == "invalid_request_error":
                fix_then_retry += 1
            else:
                retryable += 1
        case "canceled" | "expired":
            gave_up += 1

print(succeeded, retryable, fix_then_retry, gave_up)
# given a batch with: 9000 succeeded, 50 invalid_request_error,
#                     30 overloaded_error, 20 expired, 0 canceled`,
          output: "9000 30 50 20",
          explanation:
            "`succeeded` counts the model-produced results. Among `errored`, the `invalid_request_error` branch (`fix_then_retry`) is bugs in *your* params — fix the schema before resubmitting. The other branch (`retryable`) is transient server-side — resubmit as-is. `canceled` and `expired` collapse together as 'gave up' — they share the property of being free and being safe to ignore or resubmit per business logic.",
        },
        {
          kind: "code_comparison",
          label: "iterating results — naive vs streaming",
          left: {
            title: "Naive: load everything into memory",
            code: `# Bad for large batches
results = list(client.messages.batches.results("msgbatch_01..."))

for r in results:
    handle(r)

# Process all results in memory after the list materializes`,
            annotation:
              "100k results × tens of KB each = a multi-GB allocation. OOMs on small workers, slow on big ones. The whole stream materializes before the first byte of useful work happens.",
          },
          right: {
            title: "Streaming: constant memory",
            code: `# Good for any batch size
for r in client.messages.batches.results("msgbatch_01..."):
    handle(r)

# Each result is processed and freed before the next is parsed`,
            annotation:
              "Constant memory regardless of result count. Handle one row, drop it, move on. Errors mid-stream are surfaced naturally and you've already processed the rows that came before.",
          },
          takeaway:
            "The SDK's `.results()` helper is an iterator on purpose. Use it as one. The only time you'd want a list is for an evals notebook with a few hundred rows — and even then, just call list() explicitly so future-you knows it's deliberate.",
        },
        {
          kind: "key_insight",
          label: "Two retry classes, two different responses",
          insight: `When you see \`result.type == "errored"\`, **always** look at \`error.error.type\` before deciding what to do:

- **\`invalid_request_error\`** → your \`params\` were structurally invalid (wrong model name, missing required field, malformed tool schema, content too long). Retrying with the same body will fail the same way. **Fix the body, then resubmit just the broken requests.**
- **Anything else** (\`overloaded_error\`, \`api_error\`, \`rate_limit_error\`, \`internal_server_error\`) → transient. **Safe to resubmit as-is in a fresh batch.**

Mixing the two classes is the #1 batch-handling bug. Blindly resubmitting all errored requests means re-running thousands of doomed validation failures forever. Filtering them all out means silently dropping requests that would have succeeded on retry.`,
        },
        {
          kind: "flashcard",
          context: "Format & retrieval semantics.",
          front: "What format is the batch results file, and via what mechanism is it served?",
          back: "**JSONL** (newline-delimited JSON, one result per line), served from a **presigned URL** in the `results_url` field of the ended batch. Use `client.messages.batches.results(id)` to stream it line-by-line; don't fetch the URL manually unless you have a specific reason.",
        },
        {
          kind: "flashcard",
          context: "Order semantics.",
          front: "Are batch results returned in submission order?",
          back: "**No.** Order is *unspecified* and may vary run-to-run. Always join results back to inputs by `custom_id`, never by line index or array position.",
        },
      ],
    },

    // ================================================================
    // 6. Production patterns: partial failure, idempotency, restart
    // ================================================================
    {
      title: "Production patterns",
      blocks: [
        {
          kind: "prose",
          markdown: `A batch in production is not an API call — it's a *job* with multiple persisted artifacts:

1. The **input JSONL**, keyed by \`custom_id\`. This is your source of truth for what was requested.
2. The **batch id** (\`msgbatch_...\`) returned at submission. Persist this in your job table the moment \`.create()\` returns.
3. The **results JSONL** (or the per-row results you've already processed into a database).

With those three things on disk, your worker can crash, be restarted on a different machine, or hand off to a downstream service, and another process can pick up exactly where you left off — by re-reading the batch id and either resuming polling or re-streaming results.

The lynchpin is choosing the right \`custom_id\` scheme. A good \`custom_id\` is:

- **Deterministic** — re-running the input pipeline produces the same IDs.
- **Domain-meaningful** — \`ticket-{id}\`, not a UUID. Future-you reading a stack trace will thank you.
- **Versioned** — \`ticket-{id}-v{schema_version}\` so a prompt change forces a re-batch and a results-table refresh.
- **Within the regex** — \`^[a-zA-Z0-9_-]{1,64}$\`.`,
        },
        {
          kind: "mini_challenge",
          title: "Build a 'retry only what didn't succeed' helper",
          prompt: `You submitted a batch with input file \`requests.jsonl\` (one \`{ "custom_id": ..., "params": ... }\` per line). After polling, you streamed results into \`results.jsonl\` (one result per line).

Some requests came back \`errored\` (with various error types), some \`expired\`, and the rest \`succeeded\`. Write a helper:

\`\`\`python
def build_retry_batch(
    input_path: str,
    results_path: str,
) -> list[dict]:
    """Return a fresh batch payload containing only requests that should be retried."""
\`\`\`

A request should be in the retry batch if its result was \`errored\` with a non-\`invalid_request_error\` cause, OR if its result was \`expired\`. Requests that \`succeeded\`, were \`canceled\`, or errored with \`invalid_request_error\` should be excluded.`,
          hints: [
            "Stream both files. Don't load 100k-row JSONLs into memory.",
            "Build a `set[str]` of custom_ids to retry by scanning `results.jsonl` once. Then make a second pass over `requests.jsonl`, emitting only requests whose custom_id is in that set.",
            "Be explicit about each result.type. The 'retry' set is exactly: errored-but-not-invalid_request_error, plus expired. Anything else is excluded.",
          ],
          solution: `import json

def build_retry_batch(input_path: str, results_path: str) -> list[dict]:
    retry_ids: set[str] = set()
    with open(results_path) as f:
        for line in f:
            row = json.loads(line)
            result = row["result"]
            if result["type"] == "expired":
                retry_ids.add(row["custom_id"])
            elif result["type"] == "errored":
                err_type = result["error"]["error"]["type"]
                if err_type != "invalid_request_error":
                    retry_ids.add(row["custom_id"])

    retry_requests: list[dict] = []
    with open(input_path) as f:
        for line in f:
            req = json.loads(line)
            if req["custom_id"] in retry_ids:
                retry_requests.append(req)

    return retry_requests`,
          takeaway:
            "Two passes, both streaming, no full-file loads. The same shape works for any 'reconcile inputs against outputs' job — checkpointed pipelines are just this helper applied recursively until the retry batch is empty.",
        },
        {
          kind: "scenario_predict",
          label: "diagnosing 7% expiration",
          scenario: `request_counts after a 100-request batch ended:

{
  "processing": 0,
  "succeeded": 93,
  "errored":   0,
  "canceled":  0,
  "expired":   7
}`,
          language: "json",
          question:
            "What does the expired count tell you about the batch, and what's the recommended remediation?",
          answer:
            "The batch hit the 24-hour deadline before all requests ran — likely a heavy-demand period where Anthropic's batch scheduler couldn't drain the queue in time. The remediation is to **resubmit the 7 expired requests in a fresh batch** (filtered by `custom_id`), and for the next run, split large workloads into smaller batches (e.g. 5 × 20k instead of 1 × 100k) so individual batches are less likely to bump the ceiling.",
          explanation:
            "Expiration is not billed, but it costs you wall-clock time. Treat any non-zero `expired` count as a signal to (a) resubmit the expired subset and (b) reduce per-batch size for future runs in that workspace.",
        },
        {
          kind: "multiple_choice",
          title: "Choosing a custom_id scheme",
          prompt:
            "You're building a nightly batch job that re-classifies all support tickets created in the last 24 h. Which custom_id scheme is the strongest production choice?",
          choices: [
            {
              text: "`uuid.uuid4().hex` — guaranteed unique and easy to generate.",
              correct: false,
              rationale:
                "Unique, yes — but opaque. When a debugger or a log line shows you a UUID, you have no way to map it back to a ticket without an external join table. Loses all the traceability the custom_id is meant to provide.",
            },
            {
              text: "The row index in the input file (`0`, `1`, `2`, ...).",
              correct: false,
              rationale:
                "Brittle. If the input pipeline ever changes ordering, deduplicates, or filters, your ids drift. The id is now a function of the input file's sort, not the domain object.",
            },
            {
              text: "`ticket-{ticket_id}-v{prompt_version}` (e.g. `ticket-48217-v3`).",
              correct: true,
              rationale:
                "Deterministic, domain-meaningful, and versioned. A prompt change bumps the version and naturally forces a re-batch; results tables can store the same id as a primary key. Stays well within the 64-char limit and the allowed character set.",
            },
            {
              text: "`prompt[:64]` — first 64 chars of the user prompt.",
              correct: false,
              rationale:
                "Two problems: collisions (any two tickets that start the same — common in support — produce duplicate ids, which the API rejects) and PII leakage (the id is logged in lots of places it shouldn't appear).",
            },
          ],
          explanation:
            "The custom_id is your foreign key from the API back into your domain. Make it deterministic so re-runs produce the same id; make it versioned so prompt changes invalidate cached results cleanly; make it domain-meaningful so error logs are immediately diagnosable. UUIDs and array indices both fail one or more of these.",
        },
        {
          kind: "flashcard",
          context: "Error-class triage cheat sheet.",
          front: "Match each per-request outcome to the production response: `invalid_request_error`, server-side errored (5xx, overloaded), `expired`, `canceled`.",
          back: "`invalid_request_error` → **fix the body** (don't auto-retry; the same payload will fail again). Server-side errored → **resubmit as-is** in a fresh batch (transient). `expired` → **resubmit** the leftover subset, and consider smaller batches next time. `canceled` → **don't auto-retry** (the cancellation reflects explicit caller intent; route to whoever called .cancel()).",
        },
        {
          kind: "flashcard",
          context: "Why join on custom_id, always.",
          front: "Why must you always match batch results back to inputs by `custom_id` rather than by stream order?",
          back: "Because the API does **not guarantee result order**. Requests run in parallel and complete in scheduling order, not submission order. The exact same input can produce a different output order across runs. `custom_id` is the only stable correlation handle.",
        },
      ],
    },

    // ================================================================
    // 7. Stacking features: prompt caching, extended output, what fits inside a batch
    // ================================================================
    {
      title: "Stacking features",
      blocks: [
        {
          kind: "prose",
          markdown: `A batch request supports **every** Messages API feature except streaming. Tool use, vision (image blocks), document blocks, PDFs, system prompts, multi-turn conversations, all the beta headers — all of it works inside a \`params\` object exactly the way it works in a sync call.

This means batches compose beautifully with two features that have outsized cost impact: **prompt caching** and the **extended output beta**.`,
        },
        {
          kind: "key_insight",
          label: "Use the 1-hour cache duration with batches",
          insight: `Prompt caching's default \`ephemeral\` TTL is **5 minutes**. That works great for sync chat, where conversation turns happen seconds apart. Inside a batch, it's a disaster: a 50k-request batch can take 30+ minutes to drain, so a 5-minute cache entry is *expired* by the time the second wave of requests reaches the model.

The fix: explicitly set the 1-hour cache duration on every \`cache_control\` block in your batch requests:

\`\`\`json
"cache_control": { "type": "ephemeral", "ttl": "1h" }
\`\`\`

Anthropic's docs report typical cache hit rates jump from ~30% (default 5 min) to up to ~98% (1-hour, well-structured batch) when this single change is made.`,
        },
        {
          kind: "code_comparison",
          label: "5-minute vs 1-hour cache inside a batch",
          left: {
            title: "Default 5-min cache — most hits expire mid-batch",
            code: `# system block reused across thousands of requests
{
  "type": "text",
  "text": "<large shared context>",
  "cache_control": { "type": "ephemeral" }
}

# By the time request #20,000 runs (~25 min later)
# the cache entry has expired — full re-tokenization cost.`,
            annotation:
              "Cache hit rate often lands around 30% in practice — only the early wave of requests hits the cache before it ages out.",
          },
          right: {
            title: "1-hour cache — hits sustain through the batch",
            code: `# same payload but with explicit 1h TTL
{
  "type": "text",
  "text": "<large shared context>",
  "cache_control": { "type": "ephemeral", "ttl": "1h" }
}

# All 50k requests share the same warmed cache entry,
# even if the batch takes 30-45 min to process.`,
            annotation:
              "Cache hit rates typically climb to 80-98%. Combined with the batch discount, total cost can drop another 70-80% on the shared portion of each request.",
          },
          takeaway:
            "Cache TTL choice should track the *expected wall-clock duration of the consumer*, not the gap between user turns. For batches, that's almost always 1 h, not 5 min.",
        },
        {
          kind: "scenario_predict",
          label: "extended output beta header",
          scenario: `curl https://api.anthropic.com/v1/messages/batches \\
  --header "x-api-key: $ANTHROPIC_API_KEY" \\
  --header "anthropic-version: 2023-06-01" \\
  --header "anthropic-beta: output-300k-2026-03-24" \\
  --header "content-type: application/json" \\
  --data '{
    "requests": [{
      "custom_id": "long-form",
      "params": {
        "model": "claude-opus-4-7",
        "max_tokens": 300000,
        "messages": [{ "role": "user", "content": "Write a book." }]
      }
    }]
  }'`,
          language: "bash",
          question:
            "Two questions: (1) What does the `output-300k-2026-03-24` beta header unlock? (2) Which models accept it, and does it work on the sync Messages API too?",
          answer:
            "(1) It raises the per-request `max_tokens` ceiling to **300,000** (up from the standard 64k-128k depending on model). (2) Supported on **Claude Opus 4.7, Opus 4.6, and Sonnet 4.6**, and **only on the Message Batches API** — the sync Messages API does *not* accept this beta.",
          explanation:
            "The header is batch-only by design: a single 300k-token generation can take over an hour, which would never fit a sync HTTP connection but fits comfortably inside the 24-hour batch window. Use it for book-length drafts, exhaustive structured extraction, and long reasoning chains.",
        },
        {
          kind: "warm_up",
          title: "Constraints unique to batched requests",
          prompt:
            "Name three things you can do in a sync Messages API call that you *cannot* do inside a batched request.",
          answer:
            "(1) **Stream the response** — batches return a full Message object only after the whole batch ends. (2) **Set `max_tokens: 0`** for cache pre-warming — batches require `max_tokens >= 1`. (3) **Submit more than 256 MB of request payload or more than 100,000 requests** in a single batch — either limit triggers rejection.",
          explanation:
            "These restrictions all derive from the batch model: async processing rules out streaming, ephemeral cache entries written during batch processing wouldn't survive long enough to warm a follow-up sync request, and per-batch size bounds keep scheduling tractable.",
        },
        {
          kind: "multiple_choice",
          title: "When you exceed the size limit",
          prompt:
            "You submit a batch whose total JSON payload is 280 MB. What does the API return?",
          choices: [
            {
              text: "`200 OK` — the batch is accepted and any oversize requests are dropped silently.",
              correct: false,
              rationale:
                "The API does not silently drop oversize work; size violations are surfaced immediately rather than failing later.",
            },
            {
              text: "`400 Bad Request` with `invalid_request_error`.",
              correct: false,
              rationale:
                "Close — but size errors have their own status code. 400 is what you get for malformed JSON or schema violations.",
            },
            {
              text: "`413 Payload Too Large` with `request_too_large`.",
              correct: true,
              rationale:
                "Correct. `413 request_too_large` is the canonical signal that you've blown either the 256 MB total or the 100,000 request count cap. Split the batch and resubmit.",
            },
            {
              text: "`429 Too Many Requests` — size limits manifest as rate limits.",
              correct: false,
              rationale:
                "429 is for true rate-limit violations (HTTP RPM/RPD on the batches endpoint). Size is a separate axis with its own error code.",
            },
          ],
          explanation:
            "The two hard caps to remember: **100,000 requests OR 256 MB**, whichever you hit first. Both surface as `413 request_too_large` at submission time, before any work has been queued. There's no partial acceptance — split and resubmit.",
        },
        {
          kind: "flashcard",
          context: "Results retention.",
          front: "How long are batch results downloadable after creation, and what's the clock measured from?",
          back: "**29 days**, measured from **`created_at`** (not `ended_at`). After that, the MessageBatch metadata is still viewable but the results JSONL is no longer downloadable. Persist results into your own store immediately after polling — don't rely on the API as a long-term archive.",
        },
      ],
    },

    // ================================================================
    // 8. Recap: when to reach for batch
    // ================================================================
    {
      title: "Recap: when to reach for batch",
      blocks: [
        {
          kind: "prose",
          markdown: `Bring it all together into a decision tree you can apply in seconds.

**Reach for the Batches API when all of these are true:**

- The workload is **offline or async-tolerable** — no human waiting at the other end.
- The volume is **at least a few hundred requests**, ideally thousands to millions.
- You can wait **up to 24 hours** for the last result (even if most arrive sooner).
- You want the **50% discount**, or you need to side-step sync rate limits.

**Stay on the sync Messages API when any of these are true:**

- The result is **user-facing** (chat, autocomplete, agent loops).
- The workload is **small** (< ~100 requests) — orchestration overhead dominates.
- You need **streaming** (token-by-token output).
- You need **sub-minute turnaround** with strong reliability.

If the answer is "batch", remember the four production hardening rules: (1) deterministic, versioned \`custom_id\`s. (2) Dry-run a single request against sync before submitting 50k. (3) Poll at 60 s minimum, not faster. (4) Stream results; never load the whole JSONL.`,
        },
        {
          kind: "flashcard",
          context: "Final recap deck — the six facts that should be on the tip of your tongue.",
          front: "What's the pricing discount on the Message Batches API, and what tokens does it apply to?",
          back: "**50%** off — applies to **both input and output tokens** at the standard per-model rates. (Also applies to cached tokens through prompt caching, which can stack with the batch discount.)",
        },
        {
          kind: "flashcard",
          context: "Final recap deck — SLA.",
          front: "What is the hard SLA on batch completion, and what's the realistic expectation?",
          back: "Hard SLA: **24 hours** (any request not run by then transitions to `expired`). Realistic expectation: **under 1 hour** for typical batches under typical demand. Plan for the hard SLA; enjoy the realistic one.",
        },
        {
          kind: "flashcard",
          context: "Final recap deck — size limits.",
          front: "What are the two hard size caps on a single batch?",
          back: "**100,000 requests** OR **256 MB total payload**, whichever is hit first. Exceeding either returns `413 request_too_large` at submission.",
        },
        {
          kind: "flashcard",
          context: "Final recap deck — results retention.",
          front: "How long after `created_at` are results downloadable?",
          back: "**29 days**. After that, the MessageBatch metadata persists but the results JSONL is gone. Always persist results into your own store the moment they stream in.",
        },
        {
          kind: "flashcard",
          context: "Final recap deck — order semantics.",
          front: "Are results returned in submission order? If not, what field correlates them back to inputs?",
          back: "**No** — order is unspecified and may differ across runs. The **`custom_id`** field on every result is the only correlation handle.",
        },
        {
          kind: "flashcard",
          context: "Final recap deck — error class triage.",
          front: "Three error response types worth distinguishing in production, and the response to each.",
          back: "(1) **`invalid_request_error`** — your params are malformed; fix the body before resubmitting. (2) **Retryable server errors** (`overloaded_error`, `api_error`, etc.) — resubmit as-is in a fresh batch. (3) **`expired`** — 24 h elapsed; resubmit the expired subset and consider splitting into smaller batches.",
        },
      ],
    },
  ],
};
