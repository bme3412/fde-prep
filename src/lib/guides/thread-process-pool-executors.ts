import type { StudyGuide } from "../guide-types";

export const threadProcessPoolExecutorsGuide: StudyGuide = {
  topicTitle: "ThreadPoolExecutor & ProcessPoolExecutor",
  topicSlug: "thread-process-pool-executors",
  sections: [
    // ─────────────────────────────────────────────────────────────────────
    // 1. When you reach for concurrent.futures
    // ─────────────────────────────────────────────────────────────────────
    {
      title: "When to reach for concurrent.futures",
      blocks: [
        {
          kind: "prose",
          markdown: `\`concurrent.futures\` is the stdlib answer to "I have N independent jobs; run them in parallel without writing async code." Two executors, same API:

- **\`ThreadPoolExecutor\`** runs callables in **threads** that share memory. Best for **I/O-bound work in sync code** — calls to a sync SDK, blocking HTTP, file I/O — when rewriting to asyncio is more effort than it's worth.
- **\`ProcessPoolExecutor\`** runs callables in **separate processes** that don't share memory. Best for **CPU-bound work** — embedding compute, NumPy operations, image processing, anything that holds the GIL.

Mental model for an FDE:
- **Async-native library available?** → asyncio (\`AsyncAnthropic\`, \`httpx\`).
- **Sync-only library, I/O-bound?** → \`ThreadPoolExecutor\`.
- **CPU work that the GIL holds back?** → \`ProcessPoolExecutor\`.
- **Async code needs to call something blocking?** → \`await asyncio.to_thread(fn, *args)\` (which uses a thread pool under the hood).

The unifying interface is \`Executor.submit(fn, *args) → Future\` and \`Executor.map(fn, iterable)\`. Same shape for both — pick the right pool, the rest of your code doesn't change.`,
        },
        {
          kind: "code_comparison",
          label: "asyncio vs ThreadPoolExecutor vs ProcessPoolExecutor",
          left: {
            title: "Same workload, three pools",
            code: `# asyncio — async-native lib
async with httpx.AsyncClient() as c:
    results = await asyncio.gather(
        *[c.get(u) for u in urls]
    )

# threads — sync lib
with ThreadPoolExecutor(max_workers=10) as ex:
    results = list(ex.map(requests.get, urls))`,
            annotation:
              "Both fan out HTTP requests with the same effective concurrency. asyncio uses ~one thread; threads use ten OS threads but the API is sync.",
          },
          right: {
            title: "CPU work needs processes",
            code: `# ProcessPoolExecutor — CPU-bound
with ProcessPoolExecutor(max_workers=8) as ex:
    embeddings = list(ex.map(
        compute_embedding, texts,
    ))

# ThreadPool would be NO faster
# (GIL serializes Python bytecode)`,
            annotation:
              "For CPU-bound Python code, threads give zero speedup — the GIL serializes them. Processes get true parallelism by running separate interpreters.",
          },
          takeaway:
            "Three tools, three jobs. asyncio for many I/O with async libs. ThreadPoolExecutor for I/O with sync libs. ProcessPoolExecutor for CPU work that the GIL holds back.",
        },
        {
          kind: "key_insight",
          label: "Decision tree",
          insight: `**Async-native lib + I/O-bound** → asyncio. **Sync lib + I/O-bound** → \`ThreadPoolExecutor\` (or \`asyncio.to_thread\` if you're already in async code). **Python code + CPU-bound** → \`ProcessPoolExecutor\`. **C-extension that releases the GIL (NumPy, scipy, PIL with the right ops)** → threads can work for CPU too. The GIL is the deciding factor.`,
        },
        {
          kind: "flashcard",
          front: "What's the single biggest reason to choose ProcessPoolExecutor over ThreadPoolExecutor?",
          back: "CPU-bound work in pure Python. The GIL serializes Python bytecode across threads, so a ThreadPool gives ~zero speedup for compute-heavy work. Processes each have their own interpreter and their own GIL, so they get true parallelism — at the cost of pickling overhead and no shared memory.",
        },
        {
          kind: "flashcard",
          front: "You have an async script that needs to call one slow sync function (e.g., `PIL.Image.open` + filter). What's the cleanest pattern?",
          back: "`await asyncio.to_thread(blocking_fn, *args)`. This dispatches to the default thread pool (`asyncio`'s built-in executor) and awaits the result without blocking the event loop. Don't construct your own `ThreadPoolExecutor` for one-off calls; just use `to_thread`.",
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 2. ThreadPoolExecutor — basics
    // ─────────────────────────────────────────────────────────────────────
    {
      title: "ThreadPoolExecutor — basics",
      blocks: [
        {
          kind: "prose",
          markdown: `\`ThreadPoolExecutor(max_workers=N)\` manages a pool of N worker threads. Two main entry points:

- **\`submit(fn, *args, **kwargs) → Future\`** — schedule one call, get a \`Future\` back. Use when you want to track individual jobs, attach callbacks, or interleave with other logic.
- **\`map(fn, iterable, timeout=None) → iterator\`** — apply \`fn\` to each item, yield results in input order. Use for "do this to every item" workloads.

The executor is a context manager. \`with ThreadPoolExecutor(max_workers=10) as ex:\` ensures the pool is shut down cleanly on exit (waits for in-flight work to finish; cancels queued work in 3.9+ with \`shutdown(cancel_futures=True)\`).

\`Future\` is the unit of pending work. \`future.result(timeout=None)\` blocks until the call completes (or re-raises its exception). \`future.add_done_callback(fn)\` schedules a sync callback when it's done. \`concurrent.futures.as_completed(futures)\` yields futures in finish order — the synchronous twin of \`asyncio.as_completed\`.`,
        },
        {
          kind: "method_ref",
          title: "ThreadPoolExecutor and Future",
          importLine: "from concurrent.futures import ThreadPoolExecutor, as_completed, wait",
          methods: [
            {
              signature: "ThreadPoolExecutor(max_workers=None, thread_name_prefix='', initializer=None, initargs=())",
              description: "Pool of worker threads. `max_workers` defaults to `min(32, os.cpu_count() + 4)`. `initializer` runs once per worker (useful for thread-local clients).",
            },
            {
              signature: "executor.submit(fn, *args, **kwargs) → Future",
              description: "Schedule one call. Returns immediately with a `Future`.",
            },
            {
              signature: "executor.map(fn, *iterables, timeout=None, chunksize=1) → iterator",
              description: "Apply `fn` to each item; yield results in input order. Eager: exhausts iterables before returning. Re-raises the first exception on its iteration.",
            },
            {
              signature: "executor.shutdown(wait=True, cancel_futures=False)",
              description: "Stop accepting new work. `wait=True` blocks until in-flight finishes. `cancel_futures=True` (3.9+) cancels queued-but-not-started work.",
            },
            {
              signature: "future.result(timeout=None)",
              description: "Block until done; return the value or re-raise the exception. Raises `TimeoutError` if `timeout` exceeded.",
            },
            {
              signature: "future.exception(timeout=None)",
              description: "Block until done; return the exception (or None on success). Doesn't re-raise.",
            },
            {
              signature: "future.done() / future.cancelled() / future.running()",
              description: "Status checks (non-blocking).",
            },
            {
              signature: "future.add_done_callback(fn)",
              description: "Sync callback when the future completes. Called with the future as the arg.",
            },
            {
              signature: "future.cancel()",
              description: "Try to cancel. Returns False if already running. Only effective for queued-but-not-started work.",
            },
            {
              signature: "as_completed(futures, timeout=None)",
              description: "Iterator yielding futures in finish order. Use with `for fut in as_completed(...): r = fut.result()`.",
            },
            {
              signature: "wait(futures, timeout=None, return_when=ALL_COMPLETED)",
              description: "Returns `(done, not_done)` sets. Lower-level than `as_completed`.",
            },
          ],
        },
        {
          kind: "code_predict",
          label: "submit + as_completed",
          code: `from concurrent.futures import ThreadPoolExecutor, as_completed
import time

def slow(name, delay):
    time.sleep(delay)
    return name

with ThreadPoolExecutor(max_workers=3) as ex:
    futures = [
        ex.submit(slow, "a", 0.3),
        ex.submit(slow, "b", 0.1),
        ex.submit(slow, "c", 0.2),
    ]
    finish_order = [f.result() for f in as_completed(futures)]

print(finish_order)`,
          output: `['b', 'c', 'a']`,
          explanation:
            "`as_completed` yields futures in finish order, not submit order. Shortest sleep (`b`, 0.1s) finishes first, then `c` (0.2s), then `a` (0.3s). For input-ordered results, use `executor.map` or collect futures and iterate in submit order.",
          runnable: true,
        },
        {
          kind: "code_predict",
          label: "map preserves input order",
          code: `from concurrent.futures import ThreadPoolExecutor
import time

def square_after_delay(x):
    time.sleep(0.1 - x * 0.02)  # smaller x = longer wait
    return x * x

with ThreadPoolExecutor(max_workers=5) as ex:
    results = list(ex.map(square_after_delay, range(5)))

print(results)`,
          output: `[0, 1, 4, 9, 16]`,
          explanation:
            "`map` yields results in input order regardless of finish order. Internally it submits all jobs, then waits on each future in submit order — so even if `square_after_delay(4)` finishes first, the iterator blocks at `0` until that one finishes. Use `map` when you want order; `as_completed` when you want speed-of-arrival.",
          runnable: true,
        },
        {
          kind: "code_comparison",
          label: "submit + as_completed vs map",
          left: {
            title: "submit + as_completed — finish order, can interleave",
            code: `with ThreadPoolExecutor(10) as ex:
    futs = [ex.submit(fetch, url)
            for url in urls]
    for fut in as_completed(futs):
        try:
            r = fut.result()
            process(r)
        except Exception as e:
            log(e)`,
            annotation:
              "Process results as they arrive. Per-future try/except. Good for streaming downstream work.",
          },
          right: {
            title: "map — input order, all-or-nothing",
            code: `with ThreadPoolExecutor(10) as ex:
    for r in ex.map(fetch, urls):
        process(r)
# First exception re-raises and
# stops iteration. Other in-flight
# work continues until pool exits.`,
            annotation:
              "Concise for 'apply fn to each item'. First exception aborts iteration; downstream work depends on shutdown semantics.",
          },
          takeaway:
            "`map` for the simple iteration shape. `submit + as_completed` for per-item error handling, streaming, or anything beyond 'apply fn'. Both are sync, both yield results, both compose with a context-managed pool.",
        },
        {
          kind: "scenario_predict",
          label: "Exception inside a worker",
          scenario: `def maybe_fail(x):
    if x == 5:
        raise ValueError(f"bad value {x}")
    return x * 10

with ThreadPoolExecutor(max_workers=3) as ex:
    futures = [ex.submit(maybe_fail, i) for i in range(10)]
    results = []
    for fut in futures:
        results.append(fut.result())`,
          language: "python",
          question:
            "What does this code do at item 5? Do items 6–9 still run?",
          answer:
            "At `fut.result()` for the future of `maybe_fail(5)`, the `ValueError` is **re-raised** in the main thread and propagates out of the loop. Items 6–9 likely already ran (they were submitted before iteration started) and their futures are abandoned. The `with` block waits for them on exit. To handle per-item failures, wrap `fut.result()` in `try/except` (and collect errors into a result struct) or use `fut.exception()` first.",
          explanation:
            "Futures re-raise their exception on `.result()`. There's no `return_exceptions=True` like `asyncio.gather`; you handle this yourself per future. The safe shape: `for fut in as_completed(futures): try: r = fut.result(); except Exception as e: errors.append((fut, e))`.",
        },
        {
          kind: "flashcard",
          front: "What does `executor.map(fn, iterable)` return, and how does it order results?",
          back: "Returns an iterator that yields **in input order** (not finish order). Internally submits all jobs, then waits on each future in submit order — so a slow first item blocks output even if later items finished. First exception re-raises and stops iteration.",
        },
        {
          kind: "flashcard",
          front: "Difference between `as_completed` and `wait`?",
          back: "`as_completed` yields futures one-by-one in finish order — natural for `for fut in as_completed(...): r = fut.result()` loops. `wait` returns the `(done, not_done)` sets at once — lower-level, used when you want to wait for `FIRST_COMPLETED` or `FIRST_EXCEPTION` and decide what to do next.",
        },
        {
          kind: "flashcard",
          front: "What's the default `max_workers` for `ThreadPoolExecutor`, and when would you override it?",
          back: "Default: `min(32, os.cpu_count() + 4)`. Override **upward** for I/O-bound work with many concurrent calls (the bottleneck is wait time, not CPU). Override **downward** for memory-heavy workers or when a downstream API has a tight rate limit. For CPU-bound work in C extensions that release the GIL, `os.cpu_count()` is typically right.",
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 3. ProcessPoolExecutor — basics
    // ─────────────────────────────────────────────────────────────────────
    {
      title: "ProcessPoolExecutor — basics",
      blocks: [
        {
          kind: "prose",
          markdown: `\`ProcessPoolExecutor(max_workers=N)\` has the **same API** as the thread version — \`submit\`, \`map\`, \`Future\` — but runs callables in **separate worker processes**, each with its own Python interpreter and its own GIL. That's how you escape the GIL for CPU-bound Python code.

The trade-offs:
- **Pickling.** Arguments and return values cross process boundaries, so they must be picklable. Closures, lambdas, locks, file handles, open SDK clients — not picklable.
- **Start-up cost.** Spawning a process takes ~50–200 ms (vs ~1 ms for a thread). For tiny jobs the overhead swamps the speedup.
- **No shared memory.** No globals shared across workers. Use \`initializer\` to set up per-worker state (load a model once per worker, not per call).
- **Spawn vs fork.** On macOS/Windows default is \`spawn\` (clean, slow, requires picklable code). On Linux historically \`fork\`, but Python 3.14 defaults to \`spawn\` everywhere. Code that relies on \`fork\` semantics (inherited file descriptors, etc.) will break.

Use it when the per-call work is non-trivial (>10 ms of CPU) and parallelism is the bottleneck.`,
        },
        {
          kind: "method_ref",
          title: "ProcessPoolExecutor — what's different",
          importLine: "from concurrent.futures import ProcessPoolExecutor",
          methods: [
            {
              signature: "ProcessPoolExecutor(max_workers=None, mp_context=None, initializer=None, initargs=(), max_tasks_per_child=None)",
              description: "Pool of worker **processes**. `max_workers` defaults to `os.cpu_count()`. `mp_context` lets you pick spawn/fork/forkserver. `max_tasks_per_child` (3.11+) recycles workers periodically to reclaim memory.",
            },
            {
              signature: "executor.submit(fn, *args) — pickle requirements",
              description: "`fn` must be importable by name (top-level function in a module, NOT a lambda or local function). All args must be picklable.",
            },
            {
              signature: "executor.map(fn, *iterables, chunksize=1)",
              description: "For ProcessPool, `chunksize > 1` batches multiple items per task to amortize pickling/IPC overhead. Set to 10–100 for tight loops over millions of items.",
            },
            {
              signature: "initializer=fn, initargs=(...)",
              description: "Called once per worker on startup. Use for expensive per-worker setup: load a model, open a DB connection, warm a cache.",
            },
            {
              signature: "max_tasks_per_child=N (3.11+)",
              description: "Recycle a worker after N tasks. Use when worker memory grows unbounded (e.g., a leaky C extension).",
            },
            {
              signature: "mp_context=multiprocessing.get_context('spawn')",
              description: "Explicit start method. `spawn` is safest cross-platform. `fork` is fast but shares state in ways that can deadlock.",
            },
          ],
        },
        {
          kind: "code_predict",
          label: "Picklability — what works",
          code: `# fine.py — module-level function
def square(x):
    return x * x

def main():
    from concurrent.futures import ProcessPoolExecutor
    with ProcessPoolExecutor(max_workers=2) as ex:
        results = list(ex.map(square, [1, 2, 3, 4]))
    return results

# main()  →  [1, 4, 9, 16]`,
          output: `[1, 4, 9, 16]`,
          explanation:
            "Module-level `square` is picklable by name. Each worker receives the args, looks up `square` in its own interpreter, calls it, returns the result. Arguments (ints) and return values (ints) are also picklable. Clean parallelism.",
        },
        {
          kind: "code_predict",
          label: "Picklability — what breaks",
          code: `from concurrent.futures import ProcessPoolExecutor

def main():
    multiplier = 7
    # Local function — NOT picklable
    def times_seven(x):
        return x * multiplier

    with ProcessPoolExecutor(max_workers=2) as ex:
        try:
            list(ex.map(times_seven, [1, 2, 3]))
        except Exception as e:
            return type(e).__name__, str(e)[:60]

print(main())`,
          output: `('PicklingError', "Can't pickle <function main.<locals>.times_seven at 0x")`,
          explanation:
            "Local (closure) functions can't be pickled — they don't have a stable importable name. Same goes for lambdas, instance methods of un-picklable objects, file handles, locks. Fix: define `times_seven` at module level and pass `multiplier` as an arg, or use `functools.partial(top_level_fn, 7)`.",
        },
        {
          kind: "code_comparison",
          label: "Thread pool vs process pool for CPU work",
          left: {
            title: "ThreadPool — GIL serializes",
            code: `def cpu_heavy(n):
    # Pure Python loop holds GIL
    total = 0
    for i in range(n):
        total += i * i
    return total

# 4 calls × 1s each
with ThreadPoolExecutor(4) as ex:
    list(ex.map(cpu_heavy, [10_000_000]*4))
# Wall: ~4s (sequential despite 4 threads)`,
            annotation:
              "Threads can't run Python bytecode in parallel — they take turns on the GIL. No speedup for pure-Python CPU work.",
          },
          right: {
            title: "ProcessPool — true parallelism",
            code: `# Same function, same workload
with ProcessPoolExecutor(4) as ex:
    list(ex.map(cpu_heavy, [10_000_000]*4))
# Wall: ~1s (4 cores actually busy)

# (Plus ~100ms process-startup overhead
# on first use — amortized over many calls)`,
            annotation:
              "Each worker has its own interpreter and GIL. Four cores genuinely working in parallel. ~4× speedup for CPU work.",
          },
          takeaway:
            "For pure-Python CPU work, threads give zero speedup, processes give linear speedup up to core count. The cost is pickling overhead and process startup time — only worth it when per-call work is >10 ms.",
        },
        {
          kind: "scenario_predict",
          label: "When ProcessPool is the wrong tool",
          scenario: `# Workload: 1,000,000 calls to a function
def add_one(x):
    return x + 1

with ProcessPoolExecutor(max_workers=8) as ex:
    results = list(ex.map(add_one, range(1_000_000)))`,
          language: "python",
          question:
            "Will this be faster or slower than a plain `list(map(add_one, range(1_000_000)))` in the main process? Why?",
          answer:
            "**Much slower.** Each `add_one(x)` takes nanoseconds, but each ProcessPool task incurs ~10–100 μs of pickling + IPC overhead. The overhead dominates by 1,000–10,000×. Fix: either don't use a pool (the sync version is the fastest), or set `chunksize=10_000` to batch many items per task and amortize the IPC cost. ProcessPool only wins when per-call work substantially exceeds the IPC overhead.",
          explanation:
            "Process pools are for jobs with non-trivial per-call work — embedding compute, image processing, large NumPy operations. For tiny per-call work, the right answer is usually 'don't parallelize' or 'use `chunksize` to batch.' Always profile before reaching for a process pool.",
        },
        {
          kind: "key_insight",
          label: "When to use a process pool",
          insight: `Three conditions, all required: (1) **CPU-bound** in pure Python or in C code that holds the GIL. (2) **Per-call work >10 ms** to amortize IPC overhead. (3) **Args and return values picklable** (no closures, no open files, no SDK clients). If any one fails, pick a different tool — threads, asyncio, or just sync.`,
        },
        {
          kind: "flashcard",
          front: "What kinds of values can be passed to / returned from a `ProcessPoolExecutor` worker?",
          back: "Only picklable values: ints, floats, strings, bytes, lists/dicts/tuples of picklable values, dataclasses with picklable fields, numpy arrays. **Not picklable**: lambdas, local functions, open file handles, locks, generator objects, SDK clients, anything with a `__reduce__` issue. Fix: use top-level functions and `functools.partial`.",
        },
        {
          kind: "flashcard",
          front: "Why does `chunksize` matter for `ProcessPoolExecutor.map`?",
          back: "Each task incurs ~10–100 μs of pickling + IPC overhead. `chunksize=N` batches N items per task, amortizing that overhead across N calls. For tight loops (millions of small items), `chunksize=1000+` can be 10–100× faster. Default of 1 is only right when per-call work is large.",
        },
        {
          kind: "flashcard",
          front: "What does `initializer=fn, initargs=(...)` do on an executor?",
          back: "Calls `fn(*initargs)` once per worker on startup, before any tasks run. Used for expensive per-worker setup: loading a model, opening a DB connection, warming a cache. Works on both `ThreadPoolExecutor` and `ProcessPoolExecutor`. For processes, the initialized state lives in worker memory — survives across tasks on the same worker.",
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 4. The GIL
    // ─────────────────────────────────────────────────────────────────────
    {
      title: "The GIL — what threads can and can't help with",
      blocks: [
        {
          kind: "prose",
          markdown: `The **Global Interpreter Lock (GIL)** is a mutex inside CPython that ensures only one thread executes Python bytecode at a time. Multiple threads exist, but they take turns. This makes single-thread code simpler (no need for fine-grained locking inside the interpreter) and faster, at the cost of bytecode-level parallelism.

What this means in practice:
- **Pure-Python CPU loops** → threads give zero speedup. Use processes.
- **I/O calls (sockets, files, subprocess)** → threads work great. The GIL is **released** during blocking I/O, so other threads can run.
- **C extensions that release the GIL** (NumPy, scipy, Pillow's compiled ops, hashlib for big buffers, \`time.sleep\`) → threads can give real parallelism for these specific operations.
- **C extensions that hold the GIL** (some legacy bindings, anything written without explicit \`Py_BEGIN_ALLOW_THREADS\`) → no thread parallelism.

**Python 3.13+ has experimental free-threaded mode** (the "no-GIL" PEP 703 build) which removes the GIL entirely. As of 2026 it's an opt-in build, not the default — assume the GIL exists unless you've explicitly opted in.`,
        },
        {
          kind: "code_predict",
          label: "Threads on CPU work — no speedup",
          code: `import threading, time

def cpu_loop(n):
    total = 0
    for i in range(n):
        total += i
    return total

def run_parallel():
    threads = [threading.Thread(target=cpu_loop, args=(10_000_000,)) for _ in range(4)]
    t0 = time.monotonic()
    for t in threads: t.start()
    for t in threads: t.join()
    return round(time.monotonic() - t0, 1)

def run_sequential():
    t0 = time.monotonic()
    for _ in range(4):
        cpu_loop(10_000_000)
    return round(time.monotonic() - t0, 1)

print("parallel:", run_parallel())
print("sequential:", run_sequential())`,
          output: `parallel: 2.5
sequential: 2.4`,
          explanation:
            "Four threads on a pure-Python CPU loop run essentially as fast as sequential. The GIL serializes bytecode execution. Sometimes parallel is even slower due to context-switching overhead. For real speedup, switch to `multiprocessing` / `ProcessPoolExecutor`.",
        },
        {
          kind: "code_predict",
          label: "Threads on I/O — real speedup",
          code: `from concurrent.futures import ThreadPoolExecutor
import time

def slow_io(_):
    time.sleep(1)   # releases the GIL
    return "done"

t0 = time.monotonic()
with ThreadPoolExecutor(max_workers=10) as ex:
    list(ex.map(slow_io, range(10)))
parallel = round(time.monotonic() - t0, 1)

t0 = time.monotonic()
for _ in range(10):
    slow_io(None)
sequential = round(time.monotonic() - t0, 1)

print("parallel:", parallel)
print("sequential:", sequential)`,
          output: `parallel: 1.0
sequential: 10.0`,
          explanation:
            "10 threads each sleeping 1s → 1s total. `time.sleep` (and any blocking syscall) **releases the GIL**, letting other threads run. This is why threads work for I/O even with the GIL — they're not competing for Python bytecode time, they're competing for kernel I/O.",
          runnable: true,
        },
        {
          kind: "code_comparison",
          label: "What releases the GIL",
          left: {
            title: "Releases — threads parallelize",
            code: `# I/O — sockets, files, subprocess
requests.get(url)            # yes
time.sleep(1)                # yes
open(path, 'rb').read(1_000_000)  # yes

# C extensions written to release
np.dot(big_matrix, big_matrix)    # yes
hashlib.sha256(big_buffer)        # yes
Image.open(...).filter(...)       # yes (for many ops)`,
            annotation:
              "Threads can run these in parallel. The GIL is released for the duration of the blocking call.",
          },
          right: {
            title: "Holds — threads serialize",
            code: `# Pure-Python computation
total = 0
for i in range(10_000_000):
    total += i

# Calling a Python function
many_python_calls()

# C extensions that don't release
some_old_c_binding()`,
            annotation:
              "Threads cannot parallelize these. The GIL is held continuously; only one thread makes progress at a time.",
          },
          takeaway:
            "Threads parallelize I/O and GIL-releasing C code. Threads serialize pure-Python computation. When in doubt, profile: if `ThreadPoolExecutor` shows no speedup, the GIL is the reason — switch to processes.",
        },
        {
          kind: "scenario_predict",
          label: "Mixed workload — which pool?",
          scenario: `# For each of 1,000 customer records:
#   1. Fetch from REST API (~200 ms, sync HTTP)
#   2. Run sentiment classifier (transformers, ~50 ms on GPU)
#   3. Write result to database (~10 ms, sync DB driver)`,
          language: "python",
          question:
            "Threads, processes, or asyncio? Which combination?",
          answer:
            "Mostly **threads** (or asyncio if you can switch to async libs). Step 1 (sync HTTP) is blocking I/O — threads parallelize fine since the network call releases the GIL. Step 2 (transformers/PyTorch) typically releases the GIL during the actual compute — threads work. Step 3 (sync DB) is blocking I/O — threads work. A `ThreadPoolExecutor(max_workers=20)` with each task doing all three steps gets you most of the way. Processes only help if step 2 turns out to hold the GIL (pure-Python preprocessing, etc.).",
          explanation:
            "Mixed I/O-heavy workloads with some compute almost always want threads (or asyncio with async libraries). Reach for processes only when profiling shows GIL-bound pure-Python compute is the bottleneck.",
        },
        {
          kind: "key_insight",
          label: "The GIL in one sentence",
          insight: `**The GIL serializes Python bytecode, not blocking syscalls or GIL-releasing C code.** That's why threads work fine for I/O (sockets, files) and for NumPy / PyTorch (which release the GIL during native ops), but give zero speedup for pure-Python CPU loops. The deciding test: 'Does this workload spend its time waiting, or executing Python bytecode?' Waiting → threads. Bytecode → processes.`,
        },
        {
          kind: "flashcard",
          front: "Why do threads work for I/O-bound work despite the GIL?",
          back: "Because blocking I/O syscalls (sockets, file reads, `time.sleep`, subprocess.wait) **release the GIL** for the duration of the call. While one thread is blocked waiting on a socket, other threads can run Python bytecode. The GIL only serializes execution of Python bytecode itself.",
        },
        {
          kind: "flashcard",
          front: "Name three operations that release the GIL.",
          back: "(1) Blocking I/O: socket reads, file reads, `time.sleep`. (2) NumPy / scipy ops on large arrays. (3) `hashlib` / `zlib` on buffers above a threshold (typically a few KB). Also: `subprocess.run`, `Pillow` image ops, anything in a C extension that uses `Py_BEGIN_ALLOW_THREADS`.",
        },
        {
          kind: "flashcard",
          front: "Why doesn't a 4-thread pool speed up `sum(i*i for i in range(10_000_000))` split into four pieces?",
          back: "Because the sum is **pure Python bytecode** — no I/O, no GIL-releasing C code. The four threads take turns on the GIL, completing the same total work in roughly the same wall time as one thread. To actually parallelize, use `ProcessPoolExecutor` (separate interpreters, separate GILs) or rewrite using NumPy (`np.arange` × `np.arange`, summed — runs in C, releases the GIL).",
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 5. Bridging asyncio ↔ executors
    // ─────────────────────────────────────────────────────────────────────
    {
      title: "Bridging asyncio ↔ executors",
      blocks: [
        {
          kind: "prose",
          markdown: `Most production code is mixed: an asyncio app that occasionally needs to call a sync library, or a sync app that wants concurrency without rewriting to async. Two bridges connect the two worlds:

**From async to sync:** \`await asyncio.to_thread(blocking_fn, *args)\` runs the function in asyncio's default thread pool and awaits the result. The event loop stays free; other coroutines keep running. Use this any time you must call a blocking sync function from async code.

**Lower-level:** \`loop.run_in_executor(executor, blocking_fn, *args)\` is the underlying primitive. Pass \`None\` for the executor to use the default thread pool, or pass your own \`ThreadPoolExecutor\` / \`ProcessPoolExecutor\` to dispatch elsewhere. \`asyncio.to_thread\` is just sugar over \`run_in_executor(None, ...)\`.

**Dispatching to a process pool from async code:** \`await loop.run_in_executor(process_pool, cpu_fn, *args)\` runs \`cpu_fn\` in a separate process and awaits the result — useful when an async service has occasional CPU-bound work (image resize, embedding compute) that would otherwise block the loop.`,
        },
        {
          kind: "method_ref",
          title: "The async ↔ sync bridges",
          importLine: "import asyncio\nfrom concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor",
          methods: [
            {
              signature: "await asyncio.to_thread(fn, *args, **kwargs)",
              description: "Run `fn(*args, **kwargs)` in the default thread pool; await the result. New in 3.9. The canonical way to call blocking code from async.",
            },
            {
              signature: "loop = asyncio.get_running_loop(); await loop.run_in_executor(executor, fn, *args)",
              description: "Lower-level primitive. `executor=None` uses default thread pool. Pass your own executor (Thread or Process) to dispatch elsewhere. Does NOT support kwargs — wrap with `functools.partial`.",
            },
            {
              signature: "asyncio.wrap_future(concurrent_future, loop=None)",
              description: "Wrap a `concurrent.futures.Future` in an `asyncio.Future` so you can `await` it. Use when integrating with existing thread-pool code that returns `concurrent` futures.",
            },
            {
              signature: "loop.set_default_executor(executor)",
              description: "Replace asyncio's default thread pool. Use to control its size or to give it a name prefix. Call once at startup.",
            },
          ],
        },
        {
          kind: "code_predict",
          label: "asyncio.to_thread — the common case",
          code: `import asyncio, time

def blocking_io(name):
    time.sleep(0.5)  # simulates sync HTTP / file read
    return name.upper()

async def main():
    t0 = time.monotonic()
    results = await asyncio.gather(
        asyncio.to_thread(blocking_io, "a"),
        asyncio.to_thread(blocking_io, "b"),
        asyncio.to_thread(blocking_io, "c"),
    )
    return results, round(time.monotonic() - t0, 1)

print(asyncio.run(main()))`,
          output: `(['A', 'B', 'C'], 0.5)`,
          explanation:
            "Three blocking calls run concurrently in asyncio's default thread pool. Wall time = max(delays) = 0.5s. The event loop stays unblocked the whole time. This is the right pattern for calling any sync library from async code.",
          runnable: true,
        },
        {
          kind: "code_predict",
          label: "Async + ProcessPoolExecutor for CPU work",
          code: `import asyncio
from concurrent.futures import ProcessPoolExecutor

def cpu_heavy(n):
    total = 0
    for i in range(n):
        total += i * i
    return total

async def main():
    loop = asyncio.get_running_loop()
    with ProcessPoolExecutor(max_workers=4) as ex:
        results = await asyncio.gather(*[
            loop.run_in_executor(ex, cpu_heavy, 1_000_000)
            for _ in range(4)
        ])
    return [r > 0 for r in results]

print(asyncio.run(main()))`,
          output: `[True, True, True, True]`,
          explanation:
            "Async code dispatches CPU-bound work to a process pool via `run_in_executor`. Each process runs in parallel (separate GIL). The loop stays free for other coroutines while waiting. Common pattern: async web service that occasionally needs to run a CPU-heavy task (image resize, embedding compute).",
        },
        {
          kind: "code_comparison",
          label: "Calling sync requests from async — wrong vs right",
          left: {
            title: "Wrong — blocks the event loop",
            code: `import requests

async def fetch(url):
    r = requests.get(url)   # SYNC! blocks loop!
    return r.json()

async def main():
    # Looks concurrent, ISN'T
    return await asyncio.gather(
        fetch("https://api.example.com/a"),
        fetch("https://api.example.com/b"),
        fetch("https://api.example.com/c"),
    )
# Wall time: sum of all requests`,
            annotation:
              "Each `requests.get` blocks the loop for the entire HTTP round-trip. The 'concurrent' gather is sequential. Worst of both worlds.",
          },
          right: {
            title: "Right — wrap with to_thread",
            code: `import requests

def _fetch_sync(url):
    return requests.get(url).json()

async def fetch(url):
    return await asyncio.to_thread(_fetch_sync, url)

async def main():
    return await asyncio.gather(
        fetch("https://api.example.com/a"),
        fetch("https://api.example.com/b"),
        fetch("https://api.example.com/c"),
    )
# Wall time: max(requests)`,
            annotation:
              "Each `requests.get` runs in a worker thread. The loop stays free. True concurrency achieved.",
          },
          takeaway:
            "Inside async code, any sync function that does I/O or non-trivial compute must go through `asyncio.to_thread` (or a custom executor). Never call `requests`, `time.sleep`, `open().read(large)`, or blocking SDK methods directly from a coroutine. Better still: use async-native libraries (`httpx`, `aiofiles`) when available.",
        },
        {
          kind: "scenario_predict",
          label: "Dispatching to a process pool from async",
          scenario: `# Async service handling 100 req/sec
# Each request: parse JSON, run sentiment model, return result
# Sentiment model: pure-Python preprocessing, ~50 ms per call, holds GIL

async def handle(req):
    text = req.json["text"]
    # WRONG:
    result = sentiment_model(text)
    return {"sentiment": result}`,
          language: "python",
          question:
            "What's the failure mode at scale, and what's the right fix?",
          answer:
            "**Failure mode:** Each 50 ms sentiment call blocks the entire event loop. While one request is being processed, every other request is stalled. Effective throughput collapses to ~20 req/sec regardless of how many handlers are async. **Fix:** Run the model in a `ProcessPoolExecutor` (separate processes escape the GIL) and dispatch via `loop.run_in_executor(process_pool, sentiment_model, text)`. The loop stays free; multiple sentiment calls run in parallel on different cores.",
          explanation:
            "Any CPU-bound work that holds the GIL is poison in an async service — it serializes the whole loop. The bridge is `run_in_executor` with a process pool. Construct the pool once at startup, reuse for the life of the service.",
        },
        {
          kind: "flashcard",
          front: "What's the difference between `asyncio.to_thread(fn, *args)` and `loop.run_in_executor(None, fn, *args)`?",
          back: "**Essentially none.** `asyncio.to_thread` (new in 3.9) is sugar over `run_in_executor(None, ...)`. Both dispatch `fn` to asyncio's default thread pool. `to_thread` supports `**kwargs` natively; `run_in_executor` doesn't (you need `functools.partial`). Use `to_thread` unless you're targeting Python <3.9 or dispatching to a custom executor.",
        },
        {
          kind: "flashcard",
          front: "How do you dispatch CPU-bound work from an async service without blocking the event loop?",
          back: "Construct a `ProcessPoolExecutor` at startup. In your async handler: `await loop.run_in_executor(process_pool, cpu_fn, *args)`. The loop stays free; the work runs in a worker process with its own GIL. Don't construct the pool per request — process startup is expensive.",
        },
        {
          kind: "flashcard",
          front: "What's `asyncio.wrap_future(concurrent_future)` for?",
          back: "Adapter: turn a `concurrent.futures.Future` (e.g., from a `ThreadPoolExecutor.submit` call) into an `asyncio.Future` you can `await`. Useful when integrating with existing thread-pool code that returns concurrent futures directly.",
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 6. Patterns — wrapping sync SDK, embedding compute
    // ─────────────────────────────────────────────────────────────────────
    {
      title: "Patterns — wrapping a sync SDK and CPU fan-out",
      blocks: [
        {
          kind: "prose",
          markdown: `Two patterns you'll write repeatedly.

**Pattern 1: Sync SDK in a thread pool.** You have a sync-only library (an older API client, a database driver, a legacy internal SDK). You want N concurrent calls. Construct a thread pool, submit each call, collect with \`as_completed\` or \`map\`. Optionally combine with a thread-safe rate limiter if the upstream has limits.

**Pattern 2: CPU work in a process pool.** Embedding compute, image processing, large data transforms. Construct a process pool sized to \`os.cpu_count()\`, use \`initializer\` to load expensive per-worker state (model weights, large lookup tables), \`map\` with \`chunksize\` to amortize IPC.

Both patterns share the same skeleton: construct the pool in a context manager, submit work, collect results, handle per-item exceptions. The only thing that changes is the pool type and the worker function.`,
        },
        {
          kind: "code_predict",
          label: "Pattern 1 — sync SDK fan-out with ThreadPoolExecutor",
          code: `from concurrent.futures import ThreadPoolExecutor, as_completed
from anthropic import Anthropic  # SYNC client

# In real code: client = Anthropic()

def summarize(text):
    # Each thread shares the client (it's thread-safe).
    r = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=200,
        messages=[{"role": "user", "content": text}],
    )
    return r.content[0].text

def batch_summarize(docs, max_workers=10):
    results = [None] * len(docs)
    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        future_to_idx = {ex.submit(summarize, doc): i for i, doc in enumerate(docs)}
        for fut in as_completed(future_to_idx):
            i = future_to_idx[fut]
            try:
                results[i] = fut.result()
            except Exception as e:
                results[i] = e
    return results

# results = batch_summarize(my_documents, max_workers=10)`,
          output: `# Up to 10 sync API calls inflight in parallel threads.
# results[i] is either a string (success) or an Exception (failure).
# Total wall time ≈ (num_docs / max_workers) × avg_call_time`,
          explanation:
            "Reverse-map `future → index` so results land in input-order positions. `as_completed` lets you process each result as it arrives (or collect errors). The sync Anthropic client is thread-safe — share one client across all workers. For most teams, this is the right pattern when the async client isn't an option.",
        },
        {
          kind: "code_predict",
          label: "Pattern 2 — embedding compute with ProcessPoolExecutor",
          code: `from concurrent.futures import ProcessPoolExecutor
import os

# Module-level — picklable. Each process imports and uses its own copy.
def init_worker():
    global _model
    # Heavy load — once per worker, not per call
    from sentence_transformers import SentenceTransformer
    _model = SentenceTransformer("all-MiniLM-L6-v2")

def embed_batch(texts):
    # Runs in worker process, uses worker-local _model
    return _model.encode(texts).tolist()

def parallel_embed(all_texts, batch_size=32, max_workers=None):
    max_workers = max_workers or os.cpu_count()
    # Split into batches
    batches = [all_texts[i:i+batch_size] for i in range(0, len(all_texts), batch_size)]
    with ProcessPoolExecutor(
        max_workers=max_workers,
        initializer=init_worker,
    ) as ex:
        embedded = list(ex.map(embed_batch, batches))
    # Flatten
    return [vec for batch in embedded for vec in batch]

# vectors = parallel_embed(10_000_strings, batch_size=64)`,
          output: `# 4–8 worker processes, each loading the model ONCE via init_worker.
# embed_batch runs in parallel across workers, true GIL escape.
# For 10,000 texts on 8 cores: ~8× speedup vs single-process.`,
          explanation:
            "Key moves: (1) Load the model once per worker via `initializer`, not once per batch. (2) Batch the input to amortize IPC overhead — sending one text per task would waste 99% of time pickling. (3) Module-level `embed_batch` so it's picklable. (4) Flatten the batched results at the end.",
        },
        {
          kind: "code_comparison",
          label: "Sync SDK: ThreadPool vs asyncio.to_thread",
          left: {
            title: "Sync caller — ThreadPoolExecutor",
            code: `def main():
    with ThreadPoolExecutor(10) as ex:
        results = list(ex.map(summarize, docs))
    return results

# Caller is sync. No event loop needed.`,
            annotation:
              "Use when the caller is sync. Plain function, no async ceremony.",
          },
          right: {
            title: "Async caller — asyncio.to_thread",
            code: `async def main():
    sem = asyncio.Semaphore(10)
    async def call(doc):
        async with sem:
            return await asyncio.to_thread(summarize, doc)
    return await asyncio.gather(*[call(d) for d in docs])

# Caller is async. Uses default thread pool.`,
            annotation:
              "Use when integrating into an existing async app. Same effective behavior, different idiom. Semaphore caps concurrency.",
          },
          takeaway:
            "Pick by your caller. Sync caller → `ThreadPoolExecutor`. Async caller → `asyncio.to_thread` with a `Semaphore` for concurrency cap. Both bottom out in a thread pool; the choice is purely about which idiom fits your codebase.",
        },
        {
          kind: "scenario_predict",
          label: "Choosing the right pool",
          scenario: `# Workload: 1,000 PDFs to process
# Per PDF:
#   - Download via boto3 (sync SDK, ~300 ms, S3 I/O)
#   - Extract text via PyMuPDF (~200 ms, mostly C code)
#   - Run Claude summarize via sync Anthropic SDK (~3 s)
#   - Insert summary to Postgres via psycopg (sync, ~50 ms)`,
          language: "python",
          question:
            "Single thread pool, single process pool, or both? What max_workers?",
          answer:
            "**Single `ThreadPoolExecutor(max_workers=20)`** does the whole thing. Every step is either I/O (boto3, psycopg, Anthropic — all release the GIL during the network call) or a C extension that releases the GIL (PyMuPDF). Threads parallelize all of them. 20 workers respects Anthropic rate limits (~6 req/s × 3s = ~20 inflight). Add a `Semaphore` inside the worker function if you need a tighter Anthropic-specific cap. ProcessPool only if profiling shows a CPU-bound Python step.",
          explanation:
            "Mixed I/O workloads almost always want a single thread pool sized to the upstream concurrency limit (usually the model API). Reach for processes only when profiling shows GIL-held Python compute as the bottleneck.",
        },
        {
          kind: "mini_challenge",
          title: "Build `parallel_map_with_retries(fn, items, max_workers, max_retries)`",
          prompt: `Write a sync utility \`parallel_map_with_retries(fn, items, max_workers=10, max_retries=3)\` that:

1. Uses a \`ThreadPoolExecutor\` to call \`fn(item)\` for each item concurrently.
2. Retries each call up to \`max_retries\` times on any \`Exception\` with exponential backoff + jitter.
3. Returns a list of results in **input order**, with failures represented as the final \`Exception\` instance.
4. Logs (\`print\` is fine) when retries happen.

Mirror the shape of \`asyncio\`'s \`bounded_gather\` from the previous guide, but synchronous.`,
          hints: [
            "Wrap `fn` in a `_with_retries(item)` helper that does the retry loop and returns either the result or the final exception.",
            "Use `as_completed` to log retry events as they happen, but reverse-map `future → index` so the final result list is input-ordered.",
            "Use `time.sleep(2**attempt + random.uniform(0, 1))` for the backoff. Cap the sleep at ~30s for sanity.",
            "Don't pass exceptions through `fut.result()` — catch them inside `_with_retries` so the future never raises.",
          ],
          solution: `from concurrent.futures import ThreadPoolExecutor, as_completed
import time, random

def parallel_map_with_retries(fn, items, max_workers=10, max_retries=3, max_backoff=30.0):
    def with_retries(idx, item):
        last_error = None
        for attempt in range(max_retries):
            try:
                return idx, fn(item), None
            except Exception as e:
                last_error = e
                if attempt == max_retries - 1:
                    break
                wait = min((2 ** attempt) + random.uniform(0, 1), max_backoff)
                print(f"item {idx} attempt {attempt + 1} failed: {e!r}; retrying in {wait:.1f}s")
                time.sleep(wait)
        return idx, None, last_error

    results = [None] * len(items)
    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        futures = [ex.submit(with_retries, i, item) for i, item in enumerate(items)]
        for fut in as_completed(futures):
            idx, value, error = fut.result()
            results[idx] = error if error is not None else value
    return results

# Usage:
def flaky(x):
    if random.random() < 0.3:
        raise ConnectionError(f"flaky on {x}")
    return x * 10

results = parallel_map_with_retries(flaky, list(range(20)), max_workers=5, max_retries=4)
errors = [r for r in results if isinstance(r, Exception)]
print(f"{len(results) - len(errors)} succeeded, {len(errors)} failed after retries")`,
          takeaway:
            "Same shape as the async `batched_gather` — bounded concurrency + retries + per-item isolation — but synchronous. Put it in a `utils` module. Most teams have both an async version and a sync version of this exact helper; pick based on your caller's idiom.",
        },
        {
          kind: "key_insight",
          label: "Sync SDK + threads = the 80% solution",
          insight: `When an async-native client isn't available (older API, internal sync SDK, blocking DB driver), **don't rewrite the library — wrap it in a thread pool.** A \`ThreadPoolExecutor(max_workers=10)\` calling a sync Anthropic SDK gets you 90% of the throughput of \`AsyncAnthropic\` with 10% of the rewrite effort. Reach for async-native only when the rewrite is small or the throughput gap matters.`,
        },
        {
          kind: "flashcard",
          front: "How do you reuse the same `Anthropic` client across multiple threads in a `ThreadPoolExecutor`?",
          back: "Just share it — the sync Anthropic SDK is thread-safe. Construct one `client = Anthropic()` at module level; all workers call `client.messages.create(...)` directly. Don't construct a new client per call (wastes connection-pool warmup).",
        },
        {
          kind: "flashcard",
          front: "Why use `initializer` on a `ProcessPoolExecutor` for ML inference?",
          back: "To load the model **once per worker**, not once per task. Each worker imports the model on startup via `initializer=init_worker`, stores it in a module-level variable, and reuses it across every task that worker handles. Without this, a 30-second model load happens for every call — destroying any speedup.",
        },
        {
          kind: "flashcard",
          front: "What's the canonical fix for a sync I/O call accidentally placed inside an async coroutine?",
          back: "Wrap the call: `result = await asyncio.to_thread(blocking_fn, *args)`. Better long-term fix: switch to an async-native library (`httpx` instead of `requests`, `asyncpg` instead of `psycopg`). Both unblock the loop; `to_thread` is the minimal-edit fix, async libraries are the principled one.",
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 7. Recap
    // ─────────────────────────────────────────────────────────────────────
    {
      title: "Recap",
      blocks: [
        {
          kind: "prose",
          markdown: `Mental checklist for any "I need concurrency" decision:

1. **Async-native lib + I/O-bound** → asyncio (\`AsyncAnthropic\`, \`httpx\`, \`asyncpg\`).
2. **Sync lib + I/O-bound** → \`ThreadPoolExecutor\` (or \`asyncio.to_thread\` if caller is async).
3. **Python CPU-bound** → \`ProcessPoolExecutor\` with picklable top-level functions.
4. **C extension that releases the GIL** (NumPy, PyTorch, Pillow ops) → threads also work.
5. **Async service with occasional CPU work** → \`loop.run_in_executor(process_pool, fn, ...)\`.

Common shape: construct the pool in a context manager, \`submit\` work or \`map\` over items, collect with \`as_completed\` or by iterating futures, wrap per-item failures in try/except. The skeleton is the same; only the pool type changes with the workload.

Two pools sized right (one ThreadPool for I/O, one ProcessPool for CPU), pre-initialized at startup, reused across the app's lifetime — that's the production shape for almost every Python service.`,
        },
        {
          kind: "flashcard",
          front: "Five-second recall: ThreadPoolExecutor vs ProcessPoolExecutor — when each?",
          back: "**ThreadPoolExecutor**: I/O-bound work in sync code, or anything that releases the GIL during execution (network I/O, NumPy ops). **ProcessPoolExecutor**: CPU-bound pure-Python code. The GIL is the deciding factor.",
        },
        {
          kind: "flashcard",
          front: "Five-second recall: how do you call a blocking sync function from async code?",
          back: "`result = await asyncio.to_thread(blocking_fn, *args, **kwargs)`. For CPU-bound work that should escape the GIL: `await loop.run_in_executor(process_pool, cpu_fn, *args)`.",
        },
        {
          kind: "flashcard",
          front: "Five-second recall: what does the GIL allow and prevent?",
          back: "**Prevents**: parallel execution of Python bytecode across threads. **Allows**: threads to run during blocking I/O (sockets, files, syscalls — GIL is released) and during C extensions that explicitly release it (NumPy, hashlib on big buffers, PyTorch ops). Processes have their own GIL each.",
        },
        {
          kind: "flashcard",
          front: "Five-second recall: what must be true for a function to work in `ProcessPoolExecutor`?",
          back: "**Picklable**: defined at module level (not a closure/lambda/local function), with picklable args and return values (no open file handles, locks, SDK clients, lambdas). Use `functools.partial(top_level_fn, fixed_arg)` to bind arguments without breaking picklability.",
        },
        {
          kind: "flashcard",
          front: "Five-second recall: how do you bound concurrency on a `ThreadPoolExecutor`?",
          back: "Set `max_workers=N` on construction. There's no per-call semaphore needed — the pool itself caps concurrency to N. For async callers using `asyncio.to_thread`, layer an `asyncio.Semaphore` on top since `to_thread` uses the shared default pool.",
        },
      ],
    },
  ],
};
