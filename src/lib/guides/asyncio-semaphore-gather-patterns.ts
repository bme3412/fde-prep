import type { StudyGuide } from "../guide-types";

export const asyncioSemaphoreGatherPatternsGuide: StudyGuide = {
  topicTitle: "asyncio semaphore & gather patterns",
  topicSlug: "asyncio-semaphore-gather-patterns",
  sections: [
    // ─────────────────────────────────────────────────────────────────────
    // 1. Why async, when async
    // ─────────────────────────────────────────────────────────────────────
    {
      title: "Why async, when async",
      blocks: [
        {
          kind: "prose",
          markdown: `You have 5,000 customer documents to summarize. Each call to Claude takes ~3 seconds. Sequentially that's **over four hours** of wall time — most of it spent doing nothing but waiting for the model to finish. Threading is awkward (GIL contention, sync-SDK locking, no shared connection pool). asyncio with **bounded concurrency** gets the same workload done in under five minutes, respects the rate limit, and uses ~50 MB of memory.

This is the canonical FDE workload: **fan out, throttle, collect, handle partial failure, report progress**. asyncio is the right tool when your code spends most of its time waiting on I/O — API calls, file reads, database queries, HTTP responses. It is the wrong tool for CPU-bound work (embedding compute, large JSON parsing, image processing) — that's what \`ProcessPoolExecutor\` is for.

Three rules of thumb:
- **I/O-bound, many calls** → asyncio. Network requests, file reads, DB queries.
- **CPU-bound** → \`multiprocessing\` / \`ProcessPoolExecutor\`. Embeddings, parsing, image work.
- **Blocking sync libs, can't avoid them** → \`asyncio.to_thread\` or a thread pool. Keep them off the event loop.

Get fluent in asyncio and your daily wall-time drops by an order of magnitude.`,
        },
        {
          kind: "code_comparison",
          label: "Sequential vs concurrent batch",
          left: {
            title: "Sequential — one call at a time",
            code: `# 100 documents, ~3s per call = ~5 minutes total
from anthropic import Anthropic

client = Anthropic()
results = []
for doc in documents:  # len = 100
    r = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=200,
        messages=[{"role": "user", "content": doc}],
    )
    results.append(r.content[0].text)`,
            annotation:
              "Total wall time: ~5 minutes. CPU usage: ~2%. The process is waiting for sockets.",
          },
          right: {
            title: "Concurrent — fan out with bounded gather",
            code: `# 100 documents, Semaphore(10) → ~40s total
from anthropic import AsyncAnthropic
import asyncio

client = AsyncAnthropic()
sem = asyncio.Semaphore(10)

async def call(doc):
    async with sem:
        r = await client.messages.create(
            model="claude-opus-4-5", max_tokens=200,
            messages=[{"role": "user", "content": doc}],
        )
        return r.content[0].text

results = await asyncio.gather(*[call(d) for d in documents])`,
            annotation:
              "Total wall time: ~40s. Up to 10 calls inflight at once. Rate-limit safe — Semaphore caps concurrency.",
          },
          takeaway:
            "Same workload, ~7× speedup. The new failure modes (rate limits, partial failures) are handled by Semaphore + return_exceptions — covered later in this guide.",
        },
        {
          kind: "key_insight",
          label: "Mental model",
          insight: `**Concurrency ≠ parallelism.** asyncio runs **one coroutine at a time on a single thread**; it just doesn't sit blocked on \`recv()\` syscalls. The win is in **not waiting** — not in using more CPU cores. If your work is CPU-bound, asyncio does nothing for you; reach for processes instead.`,
        },
        {
          kind: "flashcard",
          front: "When do you reach for asyncio vs threads vs processes?",
          back: "**asyncio**: many I/O-bound tasks (API calls, file reads, DB queries) with async-native libraries. **threads**: I/O-bound work in sync code you can't rewrite (`requests`, blocking SDKs) — wrap with `asyncio.to_thread`. **processes**: CPU-bound work (embeddings, parsing, image compute). The GIL makes threads useless for CPU work in CPython.",
        },
        {
          kind: "flashcard",
          front: "Why does the GIL matter (or not) for asyncio code?",
          back: "Doesn't matter much — asyncio runs one coroutine at a time on a single thread anyway, and yields to other coroutines at every `await`. The GIL only bites when you mix in threads doing CPU work. Pure asyncio code never contends for the GIL.",
        },
        {
          kind: "flashcard",
          front: "Your workload: parsing 10,000 PDFs with a CPU-heavy library. asyncio or processes?",
          back: "**Processes** (`ProcessPoolExecutor` or `multiprocessing`). PDF parsing is CPU-bound — asyncio would run them serially on one core. Fan out across cores with a process pool, then optionally coordinate the futures with `asyncio.wrap_future` if you want async semantics for the orchestration layer.",
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 2. Event loop & coroutines
    // ─────────────────────────────────────────────────────────────────────
    {
      title: "Event loop & coroutines — the mental model",
      blocks: [
        {
          kind: "prose",
          markdown: `Every \`async def\` function returns a **coroutine object** — a lazy, pausable computation. Calling \`coro()\` doesn't run anything; it just constructs the object. The coroutine starts running only when something awaits it.

The **event loop** is a single-threaded scheduler. It picks a coroutine, runs it until the next \`await\`, suspends it, picks another ready coroutine, runs it until the next \`await\`, and so on. When the awaited operation completes (a socket has data, a sleep expires), the loop resumes the corresponding coroutine.

\`asyncio.run(main())\` is the entry point: it creates a fresh event loop, runs \`main\` (a coroutine) to completion, then closes the loop. You almost never need anything more elaborate. In Python 3.11+, \`asyncio.Runner()\` gives you a context-manager version if you need to run multiple top-level coroutines on the same loop.`,
        },
        {
          kind: "method_ref",
          title: "asyncio — the entry points and language keywords",
          importLine: "import asyncio",
          methods: [
            {
              signature: "async def name(): ...",
              description: "Declares a coroutine function. Calling it returns a coroutine object — does not execute the body.",
            },
            {
              signature: "await aw",
              description: "Suspend until `aw` (coroutine, Task, or Future) completes; resume with its result. Only legal inside `async def`.",
            },
            {
              signature: "asyncio.run(coro, *, debug=False)",
              description: "Create a new event loop, run `coro` to completion, close the loop. Top-level entry point. Cannot be called when a loop is already running.",
            },
            {
              signature: "asyncio.Runner(*, debug=None) (3.11+)",
              description: "Context-manager runner. Use when you need to invoke `.run(coro)` multiple times on the same loop.",
            },
            {
              signature: "asyncio.get_running_loop()",
              description: "Return the running loop. Raises if no loop is running. Use inside coroutines that need to schedule low-level callbacks.",
            },
            {
              signature: "async for ... in aiter:",
              description: "Iterate an async iterator. Suspends between items.",
            },
            {
              signature: "async with cm:",
              description: "Async context manager. `__aenter__` and `__aexit__` are awaited.",
            },
            {
              signature: "asyncio.sleep(delay)",
              description: "Suspend for `delay` seconds. The canonical 'yield to the loop' primitive in examples.",
            },
          ],
        },
        {
          kind: "code_predict",
          label: "Forgetting to await",
          code: `import asyncio

async def greet():
    return "hi"

async def main():
    result1 = greet()           # no await
    result2 = await greet()     # awaited
    print(type(result1).__name__)
    print(result2)

asyncio.run(main())`,
          output: `coroutine
hi
sys:1: RuntimeWarning: coroutine 'greet' was never awaited`,
          explanation:
            "Calling a coroutine function returns a coroutine object — it does NOT run the body. Without `await`, the body never executes and Python emits a `RuntimeWarning` at GC time. This is the #1 async typo.",
          runnable: true,
        },
        {
          kind: "code_predict",
          label: "asyncio.run with a simple coroutine",
          code: `import asyncio

async def add(a, b):
    await asyncio.sleep(0.01)
    return a + b

async def main():
    x = await add(2, 3)
    y = await add(10, 20)
    return [x, y]

print(asyncio.run(main()))`,
          output: `[5, 23]`,
          explanation:
            "`asyncio.run(main())` creates a loop, runs `main` to completion, returns the result. Each `await add(...)` runs sequentially — no concurrency yet (that comes with `gather` / `create_task`).",
          runnable: true,
        },
        {
          kind: "scenario_predict",
          label: "Sequential vs concurrent timing",
          scenario: `async def slow(name, delay):
    await asyncio.sleep(delay)
    return name

# Variant A
async def main_a():
    a = await slow("a", 1)
    b = await slow("b", 1)
    return [a, b]

# Variant B
async def main_b():
    return await asyncio.gather(slow("a", 1), slow("b", 1))`,
          language: "python",
          question:
            "How long does each variant take, and why?",
          answer:
            "**Variant A**: ~2 seconds. Each `await` runs to completion before the next starts — there's nothing else for the loop to schedule. **Variant B**: ~1 second. `gather` schedules both coroutines concurrently; the loop runs `slow('a')` until its `sleep` suspends, then immediately starts `slow('b')`, then both sleeps expire at ~1s.",
          explanation:
            "Sequential `await` is sequential. Concurrency requires actively scheduling multiple coroutines with `gather`, `create_task`, or `TaskGroup`. The `await` keyword on its own is just 'wait for this one thing' — it doesn't fan out.",
        },
        {
          kind: "key_insight",
          label: "Yield points",
          insight: `Every \`await\` is a **yield point** — the only place the loop can switch coroutines. If a function never awaits anything, it monopolizes the loop for its entire duration. If it calls a **blocking sync function** (\`time.sleep\`, \`requests.get\`, a CPU loop), it blocks the entire loop — every other coroutine stops cold until the blocking call returns.`,
        },
        {
          kind: "flashcard",
          front: "What does `async def foo(): return 1` return when called as `foo()` (without await)?",
          back: "A **coroutine object** — type `<coroutine>`. The body has NOT executed. To run it, you must `await foo()` from inside another coroutine, or use `asyncio.run(foo())` at the top level. An un-awaited coroutine emits a `RuntimeWarning` when garbage collected.",
        },
        {
          kind: "flashcard",
          front: "What does `asyncio.run(coro)` actually do, in three steps?",
          back: "(1) Creates a new event loop. (2) Schedules `coro` and runs it (and any tasks it spawns) until `coro` returns. (3) Closes the loop. It will raise `RuntimeError` if a loop is already running in the current thread (the Jupyter / nested-loop gotcha).",
        },
        {
          kind: "flashcard",
          front: "What's the difference between `def f()` and `async def f()`?",
          back: "`def f()` is a regular function — calling `f()` runs the body immediately. `async def f()` is a coroutine function — calling `f()` returns a coroutine object without running the body. Inside `async def` you can use `await`, `async for`, `async with`. Outside, you can't.",
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 3. Tasks
    // ─────────────────────────────────────────────────────────────────────
    {
      title: "Tasks — coroutines that run concurrently",
      blocks: [
        {
          kind: "prose",
          markdown: `\`asyncio.create_task(coro)\` schedules a coroutine to run **concurrently** with the current one. It returns a \`Task\` object — a wrapper that lets you check status, await the result, or cancel it. The task starts executing on the next event-loop tick; you don't have to await it immediately.

This is the primitive that \`gather\` and \`TaskGroup\` are built on. Most of the time you want \`TaskGroup\` (structured) or \`gather\` (functional); use raw \`create_task\` for **background lifecycle** patterns — a listener, a periodic flusher, a heartbeat. Anything where "fire now, await later or never" is the right shape.

**The trap**: if you create a task and nothing keeps a reference to it, the garbage collector can collect it mid-flight. Python 3.11+ warns you with "Task was destroyed but it is pending!" but the silent version of this bug has bitten everyone. The fix: store the task in a set or assign it to a variable that lives long enough.`,
        },
        {
          kind: "method_ref",
          title: "asyncio.Task — the concurrency unit",
          importLine: "import asyncio",
          methods: [
            {
              signature: "asyncio.create_task(coro, *, name=None)",
              description: "Schedule `coro` to run concurrently. Returns a `Task` immediately; the task starts on the next loop tick.",
            },
            {
              signature: "task.result()",
              description: "Return the task's result. Raises if the task isn't done, or re-raises the task's exception.",
            },
            {
              signature: "task.done() / task.cancelled()",
              description: "Bool: is the task finished (success, exception, or cancellation)? Was it cancelled?",
            },
            {
              signature: "task.cancel(msg=None)",
              description: "Request cancellation. Raises `CancelledError` inside the task at the next `await`.",
            },
            {
              signature: "task.add_done_callback(callback)",
              description: "Schedule `callback(task)` to run when the task completes. The callback is sync — runs on the loop thread.",
            },
            {
              signature: "asyncio.current_task()",
              description: "Return the currently-running Task (or None if outside a task).",
            },
            {
              signature: "asyncio.all_tasks(loop=None)",
              description: "Return the set of all not-done tasks on the loop. Useful for debugging leaks.",
            },
            {
              signature: "await task",
              description: "Wait for the task to complete; resume with its result. Re-raises the task's exception if any.",
            },
          ],
        },
        {
          kind: "code_predict",
          label: "create_task fires immediately; await later",
          code: `import asyncio, time

async def work(name, delay):
    await asyncio.sleep(delay)
    return name

async def main():
    t0 = time.monotonic()
    task = asyncio.create_task(work("background", 1.0))
    # do other stuff while it runs
    await asyncio.sleep(0.5)
    result = await task
    return result, round(time.monotonic() - t0, 1)

print(asyncio.run(main()))`,
          output: `('background', 1.0)`,
          explanation:
            "`create_task` starts `work` running. The `await asyncio.sleep(0.5)` happens IN PARALLEL with the background task. By the time we `await task`, only 0.5 more seconds of the task's sleep remains. Total wall time = max(0.5, 1.0) = 1.0s, not 0.5 + 1.0 = 1.5s.",
          runnable: true,
        },
        {
          kind: "code_comparison",
          label: "await directly vs create_task + await",
          left: {
            title: "Sequential — await immediately",
            code: `async def main():
    a = await work("a", 1.0)
    b = await work("b", 1.0)
    return [a, b]
# Total: ~2.0s`,
            annotation:
              "Each `await` blocks until completion before the next starts. No overlap.",
          },
          right: {
            title: "Concurrent — create_task then await",
            code: `async def main():
    t_a = asyncio.create_task(work("a", 1.0))
    t_b = asyncio.create_task(work("b", 1.0))
    a = await t_a
    b = await t_b
    return [a, b]
# Total: ~1.0s`,
            annotation:
              "Both tasks start immediately on creation. The two awaits collect already-running work.",
          },
          takeaway:
            "`create_task` schedules. `await` collects. Splitting the two enables overlap. In practice, prefer `gather` or `TaskGroup` for this exact pattern — but understanding the underlying mechanics matters for debugging.",
        },
        {
          kind: "scenario_predict",
          label: "Fire-and-forget — when main exits early",
          scenario: `async def background():
    await asyncio.sleep(5)
    print("done!")

async def main():
    asyncio.create_task(background())
    print("main returning")
    # main returns immediately — does NOT await the task

asyncio.run(main())`,
          language: "python",
          question:
            "What gets printed? Does 'done!' ever appear?",
          answer:
            "Prints `main returning`, then `asyncio.run` cleans up the loop and the still-pending `background` task is cancelled. `done!` does NOT print. You'll typically see a `Task was destroyed but it is pending!` warning. To prevent this, either `await` the task before returning from `main`, or keep a strong reference and explicitly manage its lifecycle.",
          explanation:
            "`asyncio.run` cancels all not-done tasks when its main coroutine returns. Fire-and-forget only works if the parent context outlives the child task. For background work that must complete, use `TaskGroup` or explicitly `await` the task.",
        },
        {
          kind: "flashcard",
          front: "What does `asyncio.create_task(coro)` return, and when does the task start running?",
          back: "Returns an `asyncio.Task` immediately. The task starts on the **next event-loop tick** — i.e., the next time the current coroutine awaits anything (or returns). Until then it's queued but not running.",
        },
        {
          kind: "flashcard",
          front: "Why is `asyncio.create_task(foo())` without keeping a reference dangerous?",
          back: "The task is only weakly referenced by the loop. If no strong reference exists, the GC can collect the task **while it's still pending**, silently cancelling it. Fix: store in a set (`bg_tasks.add(task); task.add_done_callback(bg_tasks.discard)`), assign to a long-lived variable, or use `TaskGroup`.",
        },
        {
          kind: "flashcard",
          front: "When should you reach for raw `create_task` instead of `gather` or `TaskGroup`?",
          back: "**Background lifecycle**: listeners, heartbeats, periodic flushers, fire-and-forget log shippers. Anything where 'start now, await later or never' is the right shape. For 'fan out N work items and wait for results' use `TaskGroup` (3.11+) or `gather`.",
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 4. gather
    // ─────────────────────────────────────────────────────────────────────
    {
      title: "`gather` — fan out and collect",
      blocks: [
        {
          kind: "prose",
          markdown: `\`await asyncio.gather(c1, c2, c3)\` runs the three coroutines (or tasks, or futures) concurrently and returns a list of their results, **in input order** — not finish order. This is the workhorse for "fire N things, collect all results."

The default behavior on error is harsh: **the first exception cancels every other task in the gather, and the exception propagates up**. The other results are lost — even if they were successful. \`return_exceptions=True\` flips this: exceptions become return values, every task runs to completion, and the caller sorts successes from failures.

Three relatives to know:
- \`asyncio.wait(aws, return_when=...)\` — lower-level, returns \`(done, pending)\` sets. You'll rarely need it.
- \`asyncio.wait_for(aw, timeout)\` — wrap a single awaitable with a timeout. In 3.11+, prefer \`async with asyncio.timeout(t):\` for block-scoped timeouts.
- \`asyncio.as_completed(aws)\` — yields each awaitable as it finishes, in finish order. Use when you want to start processing results as soon as they arrive.`,
        },
        {
          kind: "method_ref",
          title: "Collection primitives",
          importLine: "import asyncio",
          methods: [
            {
              signature: "asyncio.gather(*aws, return_exceptions=False)",
              description: "Run aws concurrently, return results in input order. If any raises and `return_exceptions=False`, cancel siblings and re-raise. With `True`, exceptions become return values.",
            },
            {
              signature: "asyncio.wait(aws, *, timeout=None, return_when=ALL_COMPLETED)",
              description: "Returns `(done, pending)` task sets. `return_when` can be `FIRST_COMPLETED` or `FIRST_EXCEPTION`. Does NOT cancel pending tasks for you.",
            },
            {
              signature: "asyncio.wait_for(aw, timeout)",
              description: "Wait for `aw` with a timeout. Raises `TimeoutError` and cancels `aw` if it exceeds.",
            },
            {
              signature: "asyncio.timeout(delay) (3.11+)",
              description: "Async context manager that cancels everything inside on timeout. Modern replacement for `wait_for` in block scope.",
            },
            {
              signature: "asyncio.as_completed(aws, *, timeout=None)",
              description: "Returns an iterator of awaitables that resolve in finish order. Use with `for fut in as_completed(...): result = await fut`.",
            },
            {
              signature: "asyncio.shield(aw)",
              description: "Protect `aw` from cancellation by its caller. The inner task runs to completion even if the awaiter is cancelled.",
            },
          ],
        },
        {
          kind: "code_predict",
          label: "gather preserves input order, runs concurrently",
          code: `import asyncio, time

async def work(name, delay):
    await asyncio.sleep(delay)
    return name

async def main():
    t0 = time.monotonic()
    results = await asyncio.gather(
        work("a", 0.5),
        work("b", 1.0),
        work("c", 0.3),
    )
    return results, round(time.monotonic() - t0, 1)

print(asyncio.run(main()))`,
          output: `(['a', 'b', 'c'], 1.0)`,
          explanation:
            "Total time = max(0.5, 1.0, 0.3) = 1.0s (not the sum). Results come back in INPUT order regardless of finish order: 'a', 'b', 'c'. The slowest task determines wall time.",
          runnable: true,
        },
        {
          kind: "code_predict",
          label: "gather without return_exceptions — first failure wins",
          code: `import asyncio

async def ok(name):
    await asyncio.sleep(0.1)
    return name

async def bad():
    await asyncio.sleep(0.05)
    raise ValueError("boom")

async def main():
    try:
        results = await asyncio.gather(ok("a"), bad(), ok("c"))
    except ValueError as e:
        return f"caught: {e}"

print(asyncio.run(main()))`,
          output: `caught: boom`,
          explanation:
            "`bad()` raises after 0.05s; `gather` cancels `ok('a')` and `ok('c')` and re-raises `ValueError`. The successful results are inaccessible — the caller only sees the first exception. Use `return_exceptions=True` if you want all-or-nothing-ish semantics.",
          runnable: true,
        },
        {
          kind: "code_predict",
          label: "gather with return_exceptions=True",
          code: `import asyncio

async def ok(name):
    await asyncio.sleep(0.1)
    return name

async def bad():
    raise ValueError("boom")

async def main():
    results = await asyncio.gather(
        ok("a"), bad(), ok("c"),
        return_exceptions=True,
    )
    summary = [type(r).__name__ if isinstance(r, Exception) else r for r in results]
    return summary

print(asyncio.run(main()))`,
          output: `['a', 'ValueError', 'c']`,
          explanation:
            "With `return_exceptions=True`, exceptions become entries in the result list rather than propagating. All three coroutines complete. The caller separates successes from failures: `successes = [r for r in results if not isinstance(r, Exception)]`.",
          runnable: true,
        },
        {
          kind: "code_comparison",
          label: "gather vs as_completed",
          left: {
            title: "gather — wait for everything, get ordered list",
            code: `async def main():
    results = await asyncio.gather(
        slow("a", 3),
        slow("b", 1),
        slow("c", 2),
    )
    for r in results:
        print(r)
# Prints nothing until ~3s in,
# then "a", "b", "c" instantly.`,
            annotation:
              "Single barrier. Good when you need everything before proceeding.",
          },
          right: {
            title: "as_completed — process as they arrive",
            code: `async def main():
    aws = [slow("a", 3), slow("b", 1), slow("c", 2)]
    for fut in asyncio.as_completed(aws):
        r = await fut
        print(r)
# Prints "b" at 1s, "c" at 2s, "a" at 3s.`,
            annotation:
              "Streaming. Good when you want to start downstream work immediately on each result.",
          },
          takeaway:
            "`gather`: order-preserving barrier. `as_completed`: streaming, finish-order. Pick by whether the caller needs the full list or can pipeline.",
        },
        {
          kind: "scenario_predict",
          label: "Partial failure — which tasks ran?",
          scenario: `async def slow_ok(name, delay):
    await asyncio.sleep(delay)
    return name

async def quick_fail():
    await asyncio.sleep(0.1)
    raise RuntimeError("nope")

async def main():
    await asyncio.gather(
        slow_ok("long", 2.0),
        quick_fail(),
        slow_ok("medium", 1.0),
    )
# return_exceptions defaults to False`,
          language: "python",
          question:
            "When `quick_fail` raises at t=0.1s, what happens to the two `slow_ok` tasks?",
          answer:
            "Both `slow_ok` tasks are **cancelled** — they receive `CancelledError` at their next `await`. Neither finishes; neither returns a value. The caller only sees the `RuntimeError('nope')` propagating out of `gather`. The cancellation is immediate; no completed work is salvageable.",
          explanation:
            "Default `gather` semantics: first exception → cancel all siblings → re-raise. This is rarely what you want for batch processing (you lose 99 good results to 1 bad input). Always set `return_exceptions=True` for batch fan-out, or use `TaskGroup` for true all-or-nothing semantics with structured cleanup.",
        },
        {
          kind: "flashcard",
          front: "What does `asyncio.gather(*aws, return_exceptions=True)` return when one of N coroutines raises?",
          back: "A list of length N. Successful entries are the return values; failed entries are the **exception instances themselves** (not raised, just placed in the list). All N coroutines run to completion. The caller filters with `isinstance(r, Exception)`.",
        },
        {
          kind: "flashcard",
          front: "Difference between `asyncio.gather` and `asyncio.wait`?",
          back: "`gather` returns ordered results (or exceptions) and cancels siblings on first failure by default. `wait` returns `(done, pending)` task sets, never cancels for you, and you call `.result()` on each task yourself. `wait` is lower-level; reach for it only when you need the `FIRST_COMPLETED` / `FIRST_EXCEPTION` return modes.",
        },
        {
          kind: "flashcard",
          front: "When do you reach for `asyncio.as_completed` over `gather`?",
          back: "When you want to **start processing each result as it arrives** rather than waiting for the whole batch. Common case: streaming results to stdout or to a downstream consumer. Trade-off: results come in finish order, not input order.",
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 5. TaskGroup
    // ─────────────────────────────────────────────────────────────────────
    {
      title: "`TaskGroup` (3.11+) — the modern way",
      blocks: [
        {
          kind: "prose",
          markdown: `Python 3.11 added \`asyncio.TaskGroup\` — the **structured concurrency** replacement for \`gather\`. The shape:

\`\`\`python
async with asyncio.TaskGroup() as tg:
    t1 = tg.create_task(work_a())
    t2 = tg.create_task(work_b())
# both tasks done here; results in t1.result(), t2.result()
\`\`\`

Three reasons it's an upgrade:

1. **Scoped lifetime.** The group cannot outlive the \`async with\` block. No orphan tasks, no fire-and-forget leaks.
2. **Clean cancellation on error.** If any task raises, the group cancels its siblings, runs their cleanup (\`finally\`, \`async with\`), and surfaces all errors as an \`ExceptionGroup\` — preserving every failure rather than just the first.
3. **\`ExceptionGroup\` + \`except*\`.** You can catch specific exception types with \`except* TypeError: ...\` and let others bubble.

Pair it with \`async with asyncio.timeout(seconds):\` (also new in 3.11) for block-scoped timeouts. Together they're the modern shape for any "do N things concurrently with bounded time" pattern.`,
        },
        {
          kind: "method_ref",
          title: "TaskGroup and friends",
          importLine: "import asyncio",
          methods: [
            {
              signature: "async with asyncio.TaskGroup() as tg:",
              description: "Structured concurrency scope. Exit awaits all tasks. Any failure cancels siblings.",
            },
            {
              signature: "tg.create_task(coro, *, name=None)",
              description: "Schedule a coroutine inside the group. Returns a `Task`. Must be called inside the `async with`.",
            },
            {
              signature: "async with asyncio.timeout(delay):",
              description: "Cancel everything inside if the block doesn't finish in `delay` seconds. Surfaces as `TimeoutError`.",
            },
            {
              signature: "async with asyncio.timeout_at(when):",
              description: "Like `timeout` but takes an absolute deadline (loop time, from `loop.time()`).",
            },
            {
              signature: "ExceptionGroup(msg, [exc1, exc2, ...])",
              description: "Container for multiple exceptions. `TaskGroup` raises this when more than one task failed (or one failed and was wrapped).",
            },
            {
              signature: "except* ExceptionType as eg:",
              description: "Catch matching exceptions from an `ExceptionGroup`. The variable `eg` is itself an `ExceptionGroup` containing the matching ones.",
            },
          ],
        },
        {
          kind: "code_predict",
          label: "TaskGroup — clean fan-out with structured cleanup",
          code: `import asyncio

async def work(name, delay):
    await asyncio.sleep(delay)
    return f"{name}-done"

async def main():
    async with asyncio.TaskGroup() as tg:
        t1 = tg.create_task(work("a", 0.1))
        t2 = tg.create_task(work("b", 0.2))
        t3 = tg.create_task(work("c", 0.05))
    return [t1.result(), t2.result(), t3.result()]

print(asyncio.run(main()))`,
          output: `['a-done', 'b-done', 'c-done']`,
          explanation:
            "All three tasks run concurrently inside the group. The `async with` blocks at its exit until every task finishes. After the block, each `task.result()` gives the return value. Same outcome as `gather`, with structured cleanup guaranteed.",
          runnable: true,
        },
        {
          kind: "code_predict",
          label: "TaskGroup — one task raises, siblings cancelled",
          code: `import asyncio

async def ok(name, delay):
    await asyncio.sleep(delay)
    return name

async def bad():
    await asyncio.sleep(0.05)
    raise ValueError("boom")

async def main():
    try:
        async with asyncio.TaskGroup() as tg:
            tg.create_task(ok("a", 1.0))
            tg.create_task(bad())
            tg.create_task(ok("c", 1.0))
    except* ValueError as eg:
        return [str(e) for e in eg.exceptions]

print(asyncio.run(main()))`,
          output: `['boom']`,
          explanation:
            "`bad()` raises at 0.05s; the group cancels `ok('a')` and `ok('c')` at their next `await`. The group exits, packing the `ValueError` into an `ExceptionGroup`. `except* ValueError` catches it; `eg.exceptions` lists the matching exceptions.",
          runnable: true,
        },
        {
          kind: "code_predict",
          label: "TaskGroup + asyncio.timeout",
          code: `import asyncio

async def work(name, delay):
    try:
        await asyncio.sleep(delay)
        return name
    except asyncio.CancelledError:
        return f"{name}-cancelled"

async def main():
    try:
        async with asyncio.timeout(0.3):
            async with asyncio.TaskGroup() as tg:
                tg.create_task(work("fast", 0.1))
                tg.create_task(work("slow", 5.0))
    except TimeoutError:
        return "timed out"

print(asyncio.run(main()))`,
          output: `timed out`,
          explanation:
            "`asyncio.timeout(0.3)` cancels everything in its scope at 0.3s. `fast` finishes at 0.1s, but `slow` is still sleeping when the timeout fires. The group cancels `slow`, exits, and the timeout surfaces as `TimeoutError`. Structured timeout + structured concurrency — no manual cleanup required.",
          runnable: true,
        },
        {
          kind: "code_comparison",
          label: "gather vs TaskGroup — same workload",
          left: {
            title: "gather — works on every Python version",
            code: `async def main():
    try:
        results = await asyncio.gather(
            work_a(), work_b(), work_c(),
            return_exceptions=False,
        )
    except Exception as e:
        # only see the FIRST exception
        # other tasks already cancelled
        # but you don't have access to them
        ...`,
            annotation:
              "First-exception-wins. Other failures swallowed. Works back to Python 3.7.",
          },
          right: {
            title: "TaskGroup — Python 3.11+",
            code: `async def main():
    try:
        async with asyncio.TaskGroup() as tg:
            t_a = tg.create_task(work_a())
            t_b = tg.create_task(work_b())
            t_c = tg.create_task(work_c())
    except* ValueError as eg:
        # see ALL ValueErrors
        for e in eg.exceptions: ...
    except* RuntimeError as eg:
        # see ALL RuntimeErrors
        ...`,
            annotation:
              "All exceptions surfaced via `ExceptionGroup`. Structured cleanup. Use `except*` to filter by type.",
          },
          takeaway:
            "On Python 3.11+, default to `TaskGroup` for new code. Fall back to `gather` only when supporting 3.10 or older, or when `return_exceptions=True` (per-item isolation) is exactly what you want.",
        },
        {
          kind: "multiple_choice",
          title: "Picking the right primitive",
          prompt:
            "You're on Python 3.11+. Match each requirement to the best concurrency primitive:",
          choices: [
            {
              text: "Fan out 50 API calls; on the first failure, kill everything and report.",
              correct: false,
              rationale:
                "Closest is `TaskGroup` — but only one option can be correct in this format. See the full match below.",
            },
            {
              text: "TaskGroup for (a) fail-fast; gather(return_exceptions=True) for (b) keep-all; create_task for (c) background lifecycle.",
              correct: true,
              rationale:
                "The full mapping. TaskGroup gives structured cleanup and all-or-nothing semantics. `gather(return_exceptions=True)` is right when you want every result regardless of failures. Raw `create_task` is for long-lived background tasks (listeners, heartbeats) that outlive any single function call.",
            },
            {
              text: "Always use TaskGroup — it's a strict upgrade.",
              correct: false,
              rationale:
                "Not quite. TaskGroup requires structured scope (can't outlive the `async with`), so it doesn't fit background-lifecycle patterns. And for batch fan-out where you want per-item error isolation, `gather(return_exceptions=True)` is often a cleaner shape than `try/except*`.",
            },
            {
              text: "Use raw create_task everywhere and manage lifecycle yourself.",
              correct: false,
              rationale:
                "This is what TaskGroup/gather are designed to replace. Manual lifecycle is error-prone (orphan tasks, lost exceptions). Use the higher-level primitives unless you genuinely need fire-and-forget.",
            },
          ],
          explanation:
            "Three patterns, three tools. **TaskGroup**: all-or-nothing batch with structured cleanup (the modern default). **gather(return_exceptions=True)**: batch with per-item isolation, sort successes from failures yourself. **create_task**: background lifecycle that outlives the current function scope.",
        },
        {
          kind: "key_insight",
          label: "Three primitives, three jobs",
          insight: `Use **\`TaskGroup\`** when you want all tasks to succeed or none. Use **\`gather(return_exceptions=True)\`** when partial success is acceptable and you'll inspect per-task errors. Use raw **\`create_task\`** only for background lifecycle (listeners, heartbeats, periodic flushers) where "fire now, await later or never" is the right shape. Default to \`TaskGroup\` on 3.11+; the other two are for cases where structured scoping doesn't fit.`,
        },
        {
          kind: "flashcard",
          front: "What does `asyncio.TaskGroup` do on the first task exception?",
          back: "Cancels every other task in the group at their next `await`, runs their cleanup (`finally`, `async with __aexit__`), then exits the `async with` block raising an `ExceptionGroup` containing all exceptions (the original + any from cancellation/cleanup).",
        },
        {
          kind: "flashcard",
          front: "Why are orphan tasks bad?",
          back: "Three reasons: (1) GC can collect them mid-flight if no strong reference exists, silently cancelling work. (2) Exceptions raised in them are logged but not propagated to any caller. (3) Cleanup (`finally` blocks, async context managers) may not run if the loop closes first. `TaskGroup` prevents all three by enforcing scoped lifetime.",
        },
        {
          kind: "flashcard",
          front: "How do you catch one specific exception type from a TaskGroup's `ExceptionGroup`?",
          back: "Use `except*` syntax: `except* TypeError as eg: ...`. The variable `eg` is itself an `ExceptionGroup` containing matching exceptions. Non-matching exceptions are re-raised as a new `ExceptionGroup` to be caught by other handlers. Works on Python 3.11+.",
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 6. Semaphore
    // ─────────────────────────────────────────────────────────────────────
    {
      title: "`Semaphore` — bounded concurrency",
      blocks: [
        {
          kind: "prose",
          markdown: `\`asyncio.Semaphore(N)\` is a **counting permit**. \`async with sem:\` acquires one permit; \`__aexit__\` releases it. If all N permits are out, the next \`acquire()\` suspends until one is released.

The pattern for rate-limited fan-out is one line:

\`\`\`python
sem = asyncio.Semaphore(10)

async def call(item):
    async with sem:
        return await client.messages.create(...)
\`\`\`

With 100 items \`gather\`-ed, at most 10 are inflight at any time; the rest wait at \`async with sem\`. **This is the single most important asyncio pattern for FDE work** — it's how every batch script in production respects rate limits.

A common confusion: a semaphore caps **concurrency** (how many are inflight simultaneously), not **rate** (requests per minute). If each call takes 2s and you have \`Semaphore(10)\`, you'll do ~5 calls/sec — that's 300 RPM. If your tier allows 200 RPM, you're over. The semaphore doesn't help; you need a rate limiter (or just a smaller N). Tune N to keep \`(throughput × N) ≤ rate_limit\`.`,
        },
        {
          kind: "method_ref",
          title: "Synchronization primitives",
          importLine: "import asyncio",
          methods: [
            {
              signature: "asyncio.Semaphore(value=1)",
              description: "Counting semaphore. `acquire()` decrements; `release()` increments. Use as `async with sem:`.",
            },
            {
              signature: "asyncio.BoundedSemaphore(value=1)",
              description: "Like `Semaphore` but raises `ValueError` if `release()` would push the count above the initial value. Catches over-release bugs.",
            },
            {
              signature: "sem.acquire() / sem.release()",
              description: "Low-level: acquire blocks until a permit is available; release returns one. Prefer `async with sem:` for safety.",
            },
            {
              signature: "sem.locked()",
              description: "Returns True if the semaphore has zero permits left.",
            },
            {
              signature: "asyncio.Lock()",
              description: "Binary mutex. Semantically equivalent to `Semaphore(1)` but signals intent: 'one coroutine at a time in this critical section'.",
            },
            {
              signature: "asyncio.Event()",
              description: "One-shot flag. `await event.wait()` until `event.set()` is called from another coroutine.",
            },
            {
              signature: "asyncio.Condition()",
              description: "Lock + wait/notify. For producer/consumer patterns where `Queue` doesn't fit.",
            },
          ],
        },
        {
          kind: "code_predict",
          label: "Semaphore caps concurrency",
          code: `import asyncio, time

sem = asyncio.Semaphore(3)
inflight = []

async def work(name):
    async with sem:
        inflight.append(name)
        await asyncio.sleep(1.0)
        inflight.remove(name)
        return name

async def main():
    t0 = time.monotonic()
    await asyncio.gather(*[work(f"t{i}") for i in range(10)])
    return round(time.monotonic() - t0, 1)

print(asyncio.run(main()))`,
          output: `4.0`,
          explanation:
            "10 tasks, each sleeping 1s, capped at 3 inflight. Wall time = ceil(10/3) × 1s = 4s. The semaphore serializes batches of 3. Without it, total time would be ~1s (all 10 run concurrently) — but you'd melt the upstream API.",
          runnable: true,
        },
        {
          kind: "code_predict",
          label: "Without Semaphore — all concurrent",
          code: `import asyncio, time

async def work(name):
    await asyncio.sleep(1.0)
    return name

async def main():
    t0 = time.monotonic()
    await asyncio.gather(*[work(f"t{i}") for i in range(10)])
    return round(time.monotonic() - t0, 1)

print(asyncio.run(main()))`,
          output: `1.0`,
          explanation:
            "Without a semaphore all 10 tasks run concurrently — total wall time is ~max(delays) = 1s. Fine for `sleep`, disaster for real API calls (immediate rate-limit responses, possible IP throttling). Always cap fan-out against rate-limited services.",
          runnable: true,
        },
        {
          kind: "code_comparison",
          label: "Semaphore vs Lock",
          left: {
            title: "Semaphore(N) — N permits",
            code: `sem = asyncio.Semaphore(10)

async def call_api(x):
    async with sem:
        return await client.create(x)
# up to 10 inflight at once`,
            annotation:
              "Use for bounded concurrency: 'at most N of these at a time'.",
          },
          right: {
            title: "Lock — 1 permit, signals mutual exclusion",
            code: `lock = asyncio.Lock()
counter = 0

async def increment():
    async with lock:
        nonlocal counter
        counter += 1
# only one coroutine in critical section`,
            annotation:
              "Use for mutual exclusion: 'this section must be serialized'. Semantically `Semaphore(1)` but reads clearer.",
          },
          takeaway:
            "Same mechanism (counting permits), different intent. `Semaphore(N>1)` for throttling. `Lock` for critical sections. `BoundedSemaphore` if you want a safety net against over-release.",
        },
        {
          kind: "scenario_predict",
          label: "Peak inflight count",
          scenario: `sem = asyncio.Semaphore(20)

async def call(item):
    async with sem:
        await asyncio.sleep(2)
        return process(item)

async def main():
    await asyncio.gather(*[call(i) for i in range(100)])`,
          language: "python",
          question:
            "How many `call` coroutines are simultaneously inside the `async with sem:` block at peak?",
          answer:
            "At most **20** — that's what the semaphore guarantees. The other 80 are suspended at `async with sem:` waiting for a permit. As each of the first 20 completes its 2s sleep and exits the `with` block, a new one acquires the permit and proceeds. Total wall time: ceil(100/20) × 2 = 10s.",
          explanation:
            "Semaphore is a hard cap on simultaneous holders. It doesn't queue fairly across coroutines by default — order depends on the loop's scheduling, but in practice asyncio's semaphore is FIFO for awaiters.",
        },
        {
          kind: "key_insight",
          label: "Tuning the semaphore",
          insight: `**Tune N to the tightest constraint, usually the upstream rate limit.** If Anthropic gives you 200 RPM at your tier and each call averages 3s, sustainable concurrency is roughly: 200/60 × 3 ≈ 10 inflight. \`Semaphore(10)\` keeps you near the line. Going higher means you'll hit 429s and waste retries; going lower wastes throughput. **\`Semaphore(N) + retry-on-429\`** is the canonical safe pattern — N gets you close, retries absorb the rare spikes.`,
        },
        {
          kind: "flashcard",
          front: "What does `asyncio.Semaphore(N)` guarantee?",
          back: "At most **N coroutines** can be inside the `async with sem:` block (or have called `sem.acquire()` without `release()`) at the same time. Additional acquirers suspend until a permit is released. It's a concurrency cap, not a rate limiter.",
        },
        {
          kind: "flashcard",
          front: "Difference between `Semaphore` and `BoundedSemaphore`?",
          back: "Both count permits; `BoundedSemaphore` additionally raises `ValueError` if `release()` would push the count above the initial value. Use `BoundedSemaphore` to catch the bug where code releases twice without acquiring twice — a silent over-release inflates the cap.",
        },
        {
          kind: "flashcard",
          front: "Does `Semaphore(20)` limit your requests-per-minute?",
          back: "**No** — it limits **simultaneous** requests. RPM = `concurrency / avg_request_time × 60`. If each request takes 1s, `Semaphore(20)` permits ~1200 RPM. For true rate limiting (token bucket), use a library like `aiolimiter` or roll your own with a leaky-bucket pattern.",
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 7. Queue
    // ─────────────────────────────────────────────────────────────────────
    {
      title: "`Queue` — producer/consumer with worker pools",
      blocks: [
        {
          kind: "prose",
          markdown: `\`asyncio.Queue\` is the standard shape for **long-running batch jobs** with backpressure. One (or more) producer task puts items on the queue; N worker tasks each \`await queue.get()\` in a loop and process. Workers signal completion with \`queue.task_done()\`; the orchestrator calls \`await queue.join()\` to wait until every put item has been processed.

Two shutdown patterns:

1. **Sentinels.** Producer puts N \`None\` values (one per worker) at the end. Each worker checks \`if item is None: break\`. Clean, explicit.
2. **\`join()\` + cancel.** Producer puts items, calls \`await queue.join()\` to wait for processing, then cancels worker tasks. Slightly tidier on Python 3.11+ with \`TaskGroup\`.

**Set \`maxsize\` for backpressure.** An unbounded queue (\`maxsize=0\`) lets a fast producer outpace slow consumers and consume unbounded memory. \`Queue(maxsize=100)\` makes the producer block at \`put()\` once 100 items are queued — natural pacing.`,
        },
        {
          kind: "method_ref",
          title: "asyncio.Queue and friends",
          importLine: "import asyncio",
          methods: [
            {
              signature: "asyncio.Queue(maxsize=0)",
              description: "FIFO queue. `maxsize=0` is unbounded. Use a positive value for backpressure.",
            },
            {
              signature: "await queue.put(item)",
              description: "Put an item. Blocks if the queue is full (when `maxsize > 0`).",
            },
            {
              signature: "await queue.get()",
              description: "Get and remove the next item. Blocks if empty.",
            },
            {
              signature: "queue.put_nowait(item) / queue.get_nowait()",
              description: "Non-blocking variants. Raise `QueueFull` / `QueueEmpty` instead of waiting.",
            },
            {
              signature: "queue.task_done()",
              description: "Signal that a previously `get()`-ed item has been processed. Required for `join()` to work.",
            },
            {
              signature: "await queue.join()",
              description: "Block until every put item has had `task_done()` called for it. The 'wait for all work to finish' barrier.",
            },
            {
              signature: "queue.qsize() / queue.empty() / queue.full()",
              description: "Inspect state. Approximate under concurrency — don't rely on them for synchronization.",
            },
            {
              signature: "asyncio.PriorityQueue / asyncio.LifoQueue",
              description: "Same interface, different ordering. Priority items must be tuples `(priority, ...)`.",
            },
          ],
        },
        {
          kind: "code_predict",
          label: "Producer + N workers with sentinels",
          code: `import asyncio

async def worker(name, q, out):
    while True:
        item = await q.get()
        if item is None:
            q.task_done()
            return
        await asyncio.sleep(0.01)
        out.append(f"{name}:{item}")
        q.task_done()

async def main():
    q = asyncio.Queue()
    out = []
    workers = [asyncio.create_task(worker(f"w{i}", q, out)) for i in range(3)]
    for i in range(6):
        await q.put(i)
    for _ in range(3):
        await q.put(None)  # one sentinel per worker
    await asyncio.gather(*workers)
    return sorted(out)

print(asyncio.run(main()))`,
          output: `['w0:0', 'w0:3', 'w1:1', 'w1:4', 'w2:2', 'w2:5']`,
          explanation:
            "Three workers each pull from the queue. Sentinels (`None`) signal shutdown. The exact item→worker assignment depends on the loop scheduler — in CPython 3.10+ it's typically round-robin-ish for ready coroutines, so worker assignment looks orderly. Don't depend on this order in production code.",
          runnable: true,
        },
        {
          kind: "code_predict",
          label: "join() + cancel pattern (no sentinels)",
          code: `import asyncio

async def worker(q, out):
    while True:
        item = await q.get()
        await asyncio.sleep(0.01)
        out.append(item * 10)
        q.task_done()

async def main():
    q = asyncio.Queue()
    out = []
    workers = [asyncio.create_task(worker(q, out)) for _ in range(2)]
    for i in range(5):
        await q.put(i)
    await q.join()                  # wait for all task_done()s
    for w in workers:
        w.cancel()                   # then shut down workers
    await asyncio.gather(*workers, return_exceptions=True)
    return sorted(out)

print(asyncio.run(main()))`,
          output: `[0, 10, 20, 30, 40]`,
          explanation:
            "`q.join()` blocks until every put item has had `task_done()` called. Then we cancel the workers (each was looping forever on `q.get()`). `return_exceptions=True` swallows the `CancelledError`s from the cancelled workers. Cleaner than sentinels when worker count is dynamic.",
          runnable: true,
        },
        {
          kind: "code_comparison",
          label: "Bounded vs unbounded queue",
          left: {
            title: "Unbounded — producer can outpace",
            code: `q = asyncio.Queue()   # maxsize=0
async def producer():
    for item in giant_iterator():
        await q.put(item)   # never blocks`,
            annotation:
              "If consumers are slow, queue grows without bound → memory pressure → OOM.",
          },
          right: {
            title: "Bounded — natural backpressure",
            code: `q = asyncio.Queue(maxsize=100)
async def producer():
    for item in giant_iterator():
        await q.put(item)   # blocks when 100 queued
        # consumer rate now caps producer rate`,
            annotation:
              "Producer paces itself to consumer rate. Memory stays bounded; failure mode is 'slow' not 'OOM'.",
          },
          takeaway:
            "Default to bounded queues. Pick a maxsize that smooths over short bursts (typically 10×–100× the worker count) but doesn't hide a real consumer/producer rate mismatch.",
        },
        {
          kind: "scenario_predict",
          label: "Unbounded queue, slow consumer, long-running job",
          scenario: `q = asyncio.Queue()

async def producer():
    for item in stream_from_kafka():  # 10,000 items/sec
        await q.put(item)

async def consumer():
    while True:
        item = await q.get()
        await call_llm(item)   # ~3s per item
        q.task_done()

async def main():
    await asyncio.gather(producer(), consumer())`,
          language: "python",
          question:
            "What's the failure mode after ~10 minutes?",
          answer:
            "**OOM kill.** Producer puts 10K items/sec; one consumer processes ~0.33 items/sec. Queue grows by ~9,999 items per second. After 10 minutes, ~6 million items are in memory. Process gets killed by the OOM killer (or hangs swapping). Fixes: `maxsize=1000` for backpressure, or many more consumers (with a `Semaphore` to cap API concurrency), or both.",
          explanation:
            "Mismatched producer/consumer rates on an unbounded queue is the classic asyncio memory leak. Always set `maxsize` when there's any chance of rate mismatch. Bounded queue + many workers + Semaphore = the right shape for sustained ingestion.",
        },
        {
          kind: "mini_challenge",
          title: "Build `run_workers(items, worker_fn, n_workers)`",
          prompt: `Write an async helper \`run_workers(items, worker_fn, n_workers=10, maxsize=100)\` that:

1. Creates a bounded \`asyncio.Queue(maxsize=maxsize)\`.
2. Spawns \`n_workers\` worker tasks, each pulling items off the queue and calling \`await worker_fn(item)\`.
3. Puts each input item on the queue.
4. Waits for all items to be processed (\`queue.join()\`).
5. Cleanly cancels the workers and awaits their cleanup.

Use \`asyncio.TaskGroup\` for structured cleanup. Collect any per-item exceptions into a results list (success or exception, in input order).`,
          hints: [
            "TaskGroup auto-cancels its children when the `async with` exits — but you still need to break workers out of their `while True` loops. Use an `asyncio.Event` or sentinels.",
            "For ordered results, give each item an index and use a results list indexed by position.",
            "Wrap worker_fn calls in try/except so one bad item doesn't kill the worker — capture the exception and continue.",
            "Use `queue.task_done()` after every `get()`, including for sentinel items. Otherwise `join()` will hang.",
          ],
          solution: `import asyncio
from typing import Awaitable, Callable, Any

async def run_workers(
    items: list[Any],
    worker_fn: Callable[[Any], Awaitable[Any]],
    n_workers: int = 10,
    maxsize: int = 100,
) -> list[Any | Exception]:
    queue: asyncio.Queue = asyncio.Queue(maxsize=maxsize)
    results: list[Any | Exception] = [None] * len(items)

    async def worker():
        while True:
            entry = await queue.get()
            if entry is None:
                queue.task_done()
                return
            idx, item = entry
            try:
                results[idx] = await worker_fn(item)
            except Exception as e:
                results[idx] = e
            finally:
                queue.task_done()

    async with asyncio.TaskGroup() as tg:
        for _ in range(n_workers):
            tg.create_task(worker())
        for idx, item in enumerate(items):
            await queue.put((idx, item))
        for _ in range(n_workers):
            await queue.put(None)  # one sentinel per worker

    # TaskGroup awaits all workers on exit
    return results

# Usage:
async def fake_call(x):
    await asyncio.sleep(0.01)
    if x == 5:
        raise ValueError(f"bad item {x}")
    return x * 2

async def demo():
    out = await run_workers(list(range(10)), fake_call, n_workers=3)
    successes = [r for r in out if not isinstance(r, Exception)]
    errors = [r for r in out if isinstance(r, Exception)]
    return f"{len(successes)} ok, {len(errors)} errors"

# asyncio.run(demo())  →  '9 ok, 1 errors'
`,
          takeaway:
            "This is the production shape: bounded queue (backpressure), N workers (parallelism), TaskGroup (structured cleanup), per-item try/except (failure isolation), ordered results. Put this in a `utils` module and reuse it everywhere you need worker-pool semantics.",
        },
        {
          kind: "flashcard",
          front: "What's the contract between `queue.task_done()` and `queue.join()`?",
          back: "`join()` blocks until `task_done()` has been called once for every `put()`. Workers MUST call `task_done()` after each `get()` (even on errors — use `finally`), or `join()` will hang forever. The queue tracks an internal counter; each `put` increments, each `task_done` decrements.",
        },
        {
          kind: "flashcard",
          front: "What is the sentinel pattern in producer/consumer shutdown?",
          back: "After putting real items, the producer puts N `None` (or other sentinel) values — one per worker. Each worker, on seeing a sentinel, calls `task_done()` and returns. Guarantees clean shutdown without relying on cancellation. Works on any Python version.",
        },
        {
          kind: "flashcard",
          front: "When does `maxsize` matter on an `asyncio.Queue`?",
          back: "Whenever the producer might outpace the consumers. A bounded queue gives backpressure — the producer blocks at `put()` when full, naturally pacing it to the consumer rate. Default to bounded; pick a maxsize 10×–100× the worker count to absorb bursts without hiding chronic rate mismatch.",
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 8. The canonical batching pattern
    // ─────────────────────────────────────────────────────────────────────
    {
      title: "The canonical batching pattern — `AsyncAnthropic` + Semaphore + retries",
      blocks: [
        {
          kind: "prose",
          markdown: `Pull it together. The FDE workload: **you have N items to send through Claude. You want bounded concurrency (rate-limit safe), retries on 429/5xx (with backoff + jitter), per-item error isolation (one bad input shouldn't kill the batch), and progress visibility.**

The shape is the same every time:

\`\`\`python
async def bounded_gather(items, worker, n=10):
    sem = asyncio.Semaphore(n)
    async def guarded(item):
        async with sem:
            return await worker(item)
    return await asyncio.gather(
        *[guarded(i) for i in items],
        return_exceptions=True,
    )
\`\`\`

Four pieces, every time:
- **\`Semaphore\`** caps concurrency to your rate-limit budget.
- **Retries with jitter** absorb transient 429s and 5xxs.
- **\`return_exceptions=True\`** isolates per-item failures — one bad doc doesn't kill 99 good ones.
- **\`tqdm.asyncio\` or a counter** gives progress visibility for long batches.

If you write this more than twice, factor it into a \`batched_gather(items, worker, n=10)\` utility and import everywhere. Anthropic's SDK has a streaming \`with_streaming_response\` and a separate **Message Batches API** for non-real-time bulk work — but the bounded-gather pattern remains the default for real-time fan-out.`,
        },
        {
          kind: "code_predict",
          label: "The canonical bounded_gather helper",
          code: `import asyncio

async def bounded_gather(items, worker, n=3):
    sem = asyncio.Semaphore(n)
    async def guarded(item):
        async with sem:
            return await worker(item)
    return await asyncio.gather(
        *[guarded(i) for i in items],
        return_exceptions=True,
    )

async def fake_summarize(doc):
    await asyncio.sleep(0.01)
    if doc == "BAD":
        raise ValueError("can't summarize")
    return f"summary({doc})"

async def main():
    docs = ["doc1", "doc2", "BAD", "doc4"]
    results = await bounded_gather(docs, fake_summarize, n=2)
    return [type(r).__name__ if isinstance(r, Exception) else r for r in results]

print(asyncio.run(main()))`,
          output: `['summary(doc1)', 'summary(doc2)', 'ValueError', 'summary(doc4)']`,
          explanation:
            "All four items complete: three succeed, one raises. `return_exceptions=True` puts the exception in the result list. Caller splits successes from errors with `isinstance(r, Exception)`. With `Semaphore(2)`, at most 2 are inflight at a time.",
          runnable: true,
        },
        {
          kind: "code_predict",
          label: "Worker with retries and jittered backoff",
          code: `import asyncio, random

class RateLimitError(Exception): ...

async def call_with_retries(item, max_attempts=4):
    for attempt in range(max_attempts):
        try:
            await asyncio.sleep(0.01)  # simulate API
            if item == "rl" and attempt < 2:
                raise RateLimitError("429")
            return f"ok:{item}"
        except RateLimitError:
            if attempt == max_attempts - 1:
                raise
            wait = (2 ** attempt) + random.uniform(0, 0.5)
            await asyncio.sleep(wait)

print(asyncio.run(call_with_retries("rl")))`,
          output: `ok:rl`,
          explanation:
            "Exponential backoff with jitter: wait = 2^attempt + random(0, 0.5). First retry after ~1s, second after ~2s, third after ~4s. Jitter prevents thundering-herd retry storms when many workers hit a 429 simultaneously. The worker succeeds on attempt 3.",
          runnable: true,
        },
        {
          kind: "code_comparison",
          label: "Naive vs canonical batching",
          left: {
            title: "Naive — unbounded, no retries, fail-fast",
            code: `async def naive(items):
    return await asyncio.gather(
        *[client.messages.create(
            model="claude-opus-4-5",
            max_tokens=200,
            messages=[{"role":"user","content":i}],
        ) for i in items]
    )`,
            annotation:
              "Three failure modes: (1) 1000 concurrent → instant 429 storm. (2) any 429 kills entire batch. (3) one bad input loses 999 good results.",
          },
          right: {
            title: "Canonical — bounded, retries, isolated",
            code: `async def safe(items, n=10):
    sem = asyncio.Semaphore(n)
    async def call(item):
        async with sem:
            for attempt in range(4):
                try:
                    return await client.messages.create(
                        model="claude-opus-4-5",
                        max_tokens=200,
                        messages=[{"role":"user","content":item}],
                    )
                except (RateLimitError, APIStatusError):
                    if attempt == 3:
                        raise
                    await asyncio.sleep(
                        2**attempt + random.random()
                    )
    return await asyncio.gather(
        *[call(i) for i in items],
        return_exceptions=True,
    )`,
            annotation:
              "Semaphore caps inflight. Retry loop absorbs 429/5xx. return_exceptions=True isolates per-item failures.",
          },
          takeaway:
            "The naive version 'works' for 5 items and explodes for 500. The canonical version scales from 10 to 100,000 without re-architecture. Write it once, reuse forever.",
        },
        {
          kind: "scenario_predict",
          label: "Sizing a batch run",
          scenario: `# 100 documents to summarize
# Each Anthropic call: ~4s average
# Rate limit: 200 RPM
# Semaphore(10)
# No retries needed (no failures)`,
          language: "python",
          question:
            "Total wall time? Peak inflight? Are we under the 200 RPM limit?",
          answer:
            "**Wall time**: ceil(100/10) × 4s = **40s**. **Peak inflight**: 10. **RPM check**: 10 inflight / 4s avg = 2.5 req/s = 150 RPM, comfortably under 200. If you bumped to `Semaphore(15)`, you'd hit ~225 RPM and start seeing 429s — back off to 10 or 12 and let retries absorb the occasional spike.",
          explanation:
            "Capacity math: `RPM ≈ concurrency / avg_seconds × 60`. Solve for concurrency: `N = RPM × avg_seconds / 60`. For 200 RPM and 4s calls: N ≤ 200 × 4 / 60 ≈ 13. Round down to 10 for headroom and combine with retries for resilience.",
        },
        {
          kind: "key_insight",
          label: "The four-piece batching kit",
          insight: `**Semaphore + retries-with-jitter + \`return_exceptions=True\` + progress counter.** These four pieces together are the FDE batching kit. If you find yourself rewriting them for the third time, factor a \`batched_gather(items, worker, n=10, max_retries=4)\` utility into a shared module. Every team has one; once you have a good one, every batch script collapses to ~10 lines.`,
        },
        {
          kind: "mini_challenge",
          title: "Build `batched_gather` with timeout + retries + result struct",
          prompt: `Extend the basic \`bounded_gather\` into a production-ready \`batched_gather(items, worker, n=10, per_item_timeout=30.0, max_retries=4)\` that:

1. Caps concurrency with a Semaphore.
2. Wraps each worker call with \`asyncio.timeout(per_item_timeout)\` (3.11+).
3. Retries on \`RateLimitError\` / \`APIStatusError\` (5xx) with exponential backoff + jitter, up to \`max_retries\` attempts.
4. Returns a result list of \`BatchResult\` dataclass instances with \`{item, success, value, error}\` so the caller can iterate cleanly.

Don't retry on non-retryable errors (4xx other than 429, validation errors, timeouts).`,
          hints: [
            "Define `RETRYABLE = (RateLimitError, APIStatusError)` and check the exception type before backing off.",
            "Use `asyncio.timeout(per_item_timeout)` inside each retry attempt — a timeout shouldn't trigger a retry; treat it as a per-item failure.",
            "Backoff formula: `wait = min(2**attempt + random.uniform(0, 1), max_wait_cap)`. Cap at ~30s to avoid pathological waits.",
            "The result dataclass keeps the calling code clean: `for r in results: if r.success: process(r.value) else: log(r.error)`.",
          ],
          solution: `import asyncio
import random
from dataclasses import dataclass
from typing import Awaitable, Callable, Any

class RateLimitError(Exception): ...
class APIStatusError(Exception): ...

RETRYABLE = (RateLimitError, APIStatusError)

@dataclass
class BatchResult:
    item: Any
    success: bool
    value: Any = None
    error: Exception | None = None

async def batched_gather(
    items: list[Any],
    worker: Callable[[Any], Awaitable[Any]],
    n: int = 10,
    per_item_timeout: float = 30.0,
    max_retries: int = 4,
    max_backoff: float = 30.0,
) -> list[BatchResult]:
    sem = asyncio.Semaphore(n)

    async def run_one(item: Any) -> BatchResult:
        async with sem:
            last_error: Exception | None = None
            for attempt in range(max_retries):
                try:
                    async with asyncio.timeout(per_item_timeout):
                        value = await worker(item)
                    return BatchResult(item, success=True, value=value)
                except RETRYABLE as e:
                    last_error = e
                    if attempt == max_retries - 1:
                        break
                    wait = min(
                        (2 ** attempt) + random.uniform(0, 1),
                        max_backoff,
                    )
                    await asyncio.sleep(wait)
                except Exception as e:
                    # Non-retryable: timeout, validation, 4xx other than 429
                    return BatchResult(item, success=False, error=e)
            return BatchResult(item, success=False, error=last_error)

    return await asyncio.gather(*[run_one(i) for i in items])

# Usage:
async def fake_call(x):
    await asyncio.sleep(0.01)
    if x == 5: raise RateLimitError("429")
    if x == 9: raise ValueError("bad input")
    return x * 10

async def demo():
    rs = await batched_gather(list(range(10)), fake_call, n=3)
    ok = sum(1 for r in rs if r.success)
    err = sum(1 for r in rs if not r.success)
    return f"{ok} ok, {err} errors"

# asyncio.run(demo())  →  '8 ok, 2 errors'
`,
          takeaway:
            "Production batching = bounded concurrency + per-item timeout + selective retries with backoff/jitter + structured results. Once this exists in a utils module, every fan-out script becomes a 5-line caller: `results = await batched_gather(docs, summarize, n=10)`.",
        },
        {
          kind: "flashcard",
          front: "What are the four pieces of the canonical async batching kit?",
          back: "(1) **`Semaphore(N)`** — caps concurrency to your rate-limit budget. (2) **Retries with exponential backoff + jitter** — absorb transient 429/5xx. (3) **`return_exceptions=True`** (or per-item try/except) — isolate failures so one bad input doesn't kill the batch. (4) **Progress visibility** — `tqdm.asyncio` or a counter.",
        },
        {
          kind: "flashcard",
          front: "Why does `return_exceptions=True` matter for production batch jobs?",
          back: "Without it, the first failure cancels every other inflight task and you lose all completed-but-uncollected results. With it, every task runs to completion; failures become entries in the result list. For batches where partial success is acceptable (almost always for LLM workloads), it's essential.",
        },
        {
          kind: "flashcard",
          front: "Where should the `Semaphore` live relative to `TaskGroup`?",
          back: "The semaphore is acquired **inside each worker** (`async with sem:`), not around the `TaskGroup` itself. The group's job is task lifecycle; the semaphore's job is concurrency capping. They compose: create a TaskGroup, inside each task acquire the semaphore. Don't try to wrap the group itself.",
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 9. Gotchas
    // ─────────────────────────────────────────────────────────────────────
    {
      title: "Gotchas — what bites real code",
      blocks: [
        {
          kind: "prose",
          markdown: `Async failure modes are subtle. The most common, in roughly the order you'll hit them:

1. **Forgetting \`await\`.** Returns a coroutine object you accidentally use as a value. Warning at GC time; silent until then.
2. **Calling a blocking sync function inside async code.** \`time.sleep\`, \`requests.get\`, a CPU loop. Freezes the entire loop — every other coroutine stops cold.
3. **Fire-and-forget tasks getting GC'd.** No strong reference → garbage collector cancels mid-flight.
4. **Mixing event loops.** Calling \`asyncio.run\` from inside a running loop (Jupyter, framework-managed loops) → \`RuntimeError\`.
5. **Catching \`CancelledError\` accidentally.** Broad \`except Exception\` used to swallow cancellation in old Python; now it doesn't (since 3.8), but old code patterns persist.
6. **Default \`gather\` without \`return_exceptions=True\`** on batch work — one failure loses all results.

Each is a one-line fix once you know the pattern. Knowing them is the difference between "asyncio works great" and "asyncio is mysterious and breaks under load."`,
        },
        {
          kind: "code_predict",
          label: "Blocking sync call freezes the loop",
          code: `import asyncio, time

async def good(name):
    await asyncio.sleep(1)   # yields to loop
    return name

async def bad(name):
    time.sleep(1)            # blocks the loop!
    return name

async def main():
    t0 = time.monotonic()
    await asyncio.gather(good("a"), good("b"), good("c"))
    good_time = round(time.monotonic() - t0, 1)

    t0 = time.monotonic()
    await asyncio.gather(bad("a"), bad("b"), bad("c"))
    bad_time = round(time.monotonic() - t0, 1)

    return good_time, bad_time

print(asyncio.run(main()))`,
          output: `(1.0, 3.0)`,
          explanation:
            "`asyncio.sleep` yields to the loop; three concurrent sleeps overlap → 1s total. `time.sleep` blocks the OS thread — the loop can't switch coroutines → 3s sequential. Fix: any sync I/O or compute needs `await asyncio.to_thread(blocking_fn, args)`.",
          runnable: true,
        },
        {
          kind: "code_predict",
          label: "Fire-and-forget task gets GC'd",
          code: `import asyncio, gc

async def background():
    await asyncio.sleep(0.5)
    print("background done")
    return "x"

async def main():
    # No reference kept!
    asyncio.create_task(background())
    # Force GC to demonstrate the bug
    await asyncio.sleep(0)  # let task start
    gc.collect()
    await asyncio.sleep(1.0)
    return "main done"

print(asyncio.run(main()))`,
          output: `background done
main done`,
          explanation:
            "In this specific run, the loop happens to keep a reference long enough — but the pattern is fragile. Under real load (many concurrent tasks, GC pressure), the task can be collected before completion. The Python 3.11+ warning 'Task was destroyed but it is pending!' surfaces when this actually happens. **Fix:** `bg = set(); task = asyncio.create_task(coro()); bg.add(task); task.add_done_callback(bg.discard)`.",
          runnable: true,
        },
        {
          kind: "scenario_predict",
          label: "Broad except swallowing cancellation",
          scenario: `async def worker():
    try:
        await long_running_call()
    except Exception as e:
        log.error(f"worker failed: {e}")
        # Loop continues; CancelledError NOT re-raised

async def main():
    t = asyncio.create_task(worker())
    await asyncio.sleep(0.1)
    t.cancel()
    await asyncio.sleep(1)
    print("t.done():", t.done())
    print("t.cancelled():", t.cancelled())`,
          language: "python",
          question:
            "In Python 3.8+, what does this print? Does cancellation work?",
          answer:
            "Prints `t.done(): True` and `t.cancelled(): False` (the task finished normally because the `except Exception` caught and logged the `CancelledError`, then fell through without re-raising). Cancellation was silently swallowed — the cancel request became a no-op. In Python 3.8+, `CancelledError` inherits from `BaseException`, not `Exception`, **specifically to prevent this pattern** — but old code that uses `except BaseException` or `except (Exception, CancelledError)` still hits this. **Fix:** never catch `CancelledError` unless you re-raise it.",
          explanation:
            "Cancellation in asyncio works by injecting `CancelledError` at the next `await`. If your code catches it generically and continues, you've silently disabled cancellation. The 3.8 change moved `CancelledError` out of the `Exception` hierarchy specifically to make `except Exception` safe — but the gotcha persists in legacy code and in any handler explicitly catching `BaseException` or the cancellation type.",
        },
        {
          kind: "code_comparison",
          label: "Blocking call: time.sleep vs asyncio.sleep",
          left: {
            title: "time.sleep — blocks loop",
            code: `async def main():
    await asyncio.gather(
        *[task() for _ in range(10)]
    )

async def task():
    time.sleep(0.5)   # OS thread blocked
    return 1
# Total time: ~5s (sequential!)`,
            annotation:
              "Each `time.sleep(0.5)` blocks the loop for 500ms. Ten tasks → 5s wall time. The 'concurrency' is fake.",
          },
          right: {
            title: "asyncio.sleep — yields cooperatively",
            code: `async def main():
    await asyncio.gather(
        *[task() for _ in range(10)]
    )

async def task():
    await asyncio.sleep(0.5)  # yields
    return 1
# Total time: ~0.5s (concurrent)`,
            annotation:
              "`asyncio.sleep` yields to the loop. All 10 sleeps overlap; wall time = max delay = 0.5s.",
          },
          takeaway:
            "If you need to call a blocking sync function from async code, wrap it: `await asyncio.to_thread(blocking_fn, *args)`. The function runs in a thread pool; the loop stays free. Same for CPU-heavy compute that would otherwise hold the loop.",
        },
        {
          kind: "scenario_predict",
          label: "asyncio.run from inside Jupyter",
          scenario: `# In a Jupyter cell:
import asyncio

async def main():
    return 42

result = asyncio.run(main())
print(result)`,
          language: "python",
          question:
            "What happens, and what's the fix?",
          answer:
            "Raises `RuntimeError: asyncio.run() cannot be called from a running event loop`. Jupyter already has a loop running to serve cells. **Fixes:** (1) Use `result = await main()` directly at the top of a cell — Jupyter supports top-level `await`. (2) Install and call `import nest_asyncio; nest_asyncio.apply()` to allow nested `asyncio.run`. The first is cleaner.",
          explanation:
            "Same issue hits FastAPI / Starlette handlers, Tornado, and any framework that owns the loop. Inside such contexts, never call `asyncio.run`; await directly. Reserve `asyncio.run` for top-level entry points (`if __name__ == '__main__':`).",
        },
        {
          kind: "key_insight",
          label: "The async cardinal sin",
          insight: `**Never block the event loop.** Anything sync that takes more than ~1 ms — file I/O, \`requests\`, JSON parsing of large blobs, CPU loops — must run in a thread pool via \`asyncio.to_thread(blocking_fn, *args)\` (or use an async-native library: \`httpx\` instead of \`requests\`, \`aiofiles\` instead of \`open()\` for big files). Treat the loop like a single thread serving thousands of clients — never make it wait.`,
        },
        {
          kind: "flashcard",
          front: "How do you safely run a blocking sync function from async code?",
          back: "`result = await asyncio.to_thread(blocking_fn, *args, **kwargs)`. Runs `blocking_fn` in the default thread pool; awaits the result without blocking the loop. New in 3.9. Pre-3.9: `loop.run_in_executor(None, blocking_fn, *args)`.",
        },
        {
          kind: "flashcard",
          front: "Why can a fire-and-forget `asyncio.create_task(coro)` 'disappear'?",
          back: "The loop only weakly references tasks. If no strong reference exists in user code, the GC can collect the task while it's pending — silently cancelling it. Fix: store in a set, add a done-callback to remove on completion: `bg.add(t); t.add_done_callback(bg.discard)`. Or use `TaskGroup`, which strongly references its children.",
        },
        {
          kind: "flashcard",
          front: "Why does `except Exception` in async code NOT catch `CancelledError` in Python 3.8+?",
          back: "Because `asyncio.CancelledError` was moved to inherit from `BaseException` (not `Exception`) in 3.8 — specifically so that broad `except Exception` handlers don't accidentally swallow cancellation. If you must catch it, do so explicitly and re-raise: `except CancelledError: cleanup(); raise`.",
        },
        {
          kind: "flashcard",
          front: "Why does calling `asyncio.run()` inside a Jupyter cell fail?",
          back: "Jupyter has its own running event loop; `asyncio.run` insists on creating a fresh one and refuses if a loop is already running → `RuntimeError`. Fix: use top-level `await` directly (`result = await main()`) or call `nest_asyncio.apply()` to permit nesting.",
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 10. Recap
    // ─────────────────────────────────────────────────────────────────────
    {
      title: "Recap",
      blocks: [
        {
          kind: "prose",
          markdown: `Mental checklist for any async code:

1. **The event loop runs one coroutine at a time**, yielding to others at every \`await\`. Never block it.
2. **\`create_task\` schedules** concurrent work; **\`gather\` / \`TaskGroup\` collect** results.
3. On 3.11+, **default to \`TaskGroup\`** for fail-fast structured concurrency; fall back to \`gather(return_exceptions=True)\` for per-item isolation.
4. **\`Semaphore(N)\`** caps concurrency — the single most important pattern for rate-limited APIs.
5. **\`Queue\`** is for long-running producer/consumer with backpressure. Always bound it.
6. **Batching kit** = Semaphore + retries with jitter + \`return_exceptions=True\` + progress. Factor into a utility.
7. **Never block the loop.** Wrap sync calls with \`asyncio.to_thread\`.

When all of this is reflex, an FDE can take a "summarize 5,000 docs by tomorrow" ticket and ship a 20-line script before lunch.`,
        },
        {
          kind: "flashcard",
          front: "Five-second recall: concurrency vs parallelism in asyncio?",
          back: "asyncio is **concurrency**, not parallelism. One coroutine runs at a time on one thread; the loop switches between them at `await` points. Wins for I/O-bound work (no waiting). Loses for CPU-bound work (use processes for that).",
        },
        {
          kind: "flashcard",
          front: "Five-second recall: what does `gather(*aws, return_exceptions=True)` return?",
          back: "A list, same length and order as inputs. Successful tasks' return values fill their slots; failed tasks' exception **instances** fill theirs (not raised, just placed). Every task runs to completion. Caller filters with `isinstance(r, Exception)`.",
        },
        {
          kind: "flashcard",
          front: "Five-second recall: what does `asyncio.Semaphore(N)` guarantee?",
          back: "At most N coroutines simultaneously inside the `async with sem:` block. The N+1th awaiter suspends until a permit is released. Bounds concurrency, not rate.",
        },
        {
          kind: "flashcard",
          front: "Five-second recall: how does `TaskGroup` differ from `gather`?",
          back: "Structured: scoped to the `async with` block, can't outlive it. On failure: cancels siblings cleanly, runs their cleanup, surfaces ALL exceptions as `ExceptionGroup` (vs `gather`'s first-exception-wins). Use `except*` to filter by type. Python 3.11+.",
        },
        {
          kind: "flashcard",
          front: "Five-second recall: how do you call a blocking sync function from async code?",
          back: "`result = await asyncio.to_thread(blocking_fn, *args, **kwargs)`. Runs in the default thread pool, keeps the event loop free. New in 3.9. Or switch to an async-native library (`httpx`, `aiofiles`) where available.",
        },
      ],
    },
  ],
};

