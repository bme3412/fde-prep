import type { StudyGuide } from "../guide-types";

export const whenToUseWhichConcurrencyModelGuide: StudyGuide = {
  topicTitle: "When to use which concurrency model",
  topicSlug: "when-to-use-which-concurrency-model",
  sections: [
    // ─────────────────────────────────────────────────────────────────────
    // 1. The three models at a glance
    // ─────────────────────────────────────────────────────────────────────
    {
      title: "The three models at a glance",
      blocks: [
        {
          kind: "prose",
          markdown: `Python gives you three concurrency models, and an FDE picks between them daily. The choice is not a matter of taste — each model has a workload it wins at and a workload it actively hurts. Picking wrong means your "parallel" batch is no faster than serial (or worse, deadlocks under load).

The three models:

- **asyncio** — single thread, single process. Coroutines yield at every \`await\`, the event loop multiplexes them. **Wins when:** you have many concurrent I/O operations and async-native libraries (\`AsyncAnthropic\`, \`httpx\`, \`aiofiles\`, \`asyncpg\`). **Loses when:** the libraries are sync-only, or the work is CPU-bound.
- **threads** — multiple threads, single process, shared memory. The GIL serializes Python bytecode but releases on I/O syscalls. **Wins when:** you need concurrent I/O but the library is sync. **Loses when:** the work is pure-Python CPU.
- **processes** — multiple processes, separate memory, separate GIL. **Wins when:** the work is CPU-bound in Python. **Loses when:** the work is small (pickling overhead dominates) or the data is huge (copying cost).

This guide is a decision framework — not new APIs. The mechanics live in the two prior topics (asyncio semaphore & gather patterns and ThreadPoolExecutor & ProcessPoolExecutor). Here we synthesize: **given a workload, which tool?**`,
        },
        {
          kind: "code_comparison",
          label: "Same problem, three tools — which is fastest?",
          left: {
            title: "I/O-bound: 100 API calls",
            code: `# asyncio (best — async lib)
async with AsyncAnthropic() as c:
    results = await asyncio.gather(
        *[call(c, p) for p in prompts]
    )
# Wall time: ~5s (10x speedup vs serial)

# threads (works — sync lib)
with ThreadPoolExecutor(20) as ex:
    results = list(ex.map(call, prompts))
# Wall time: ~5s (~same — both I/O-bound)

# processes (overkill, slower)
with ProcessPoolExecutor(20) as ex:
    results = list(ex.map(call, prompts))
# Wall time: ~8s (pickle overhead)`,
            annotation:
              "For many concurrent API calls, asyncio and threads both work. Processes add overhead with zero benefit — the workload is I/O-bound, not CPU-bound.",
          },
          right: {
            title: "CPU-bound: hash 1,000 files",
            code: `# asyncio (BAD — blocks the loop)
async def hash_all(paths):
    return [sha256(read(p)) for p in paths]
# Wall time: ~30s (no concurrency at all)

# threads (BAD — GIL serializes)
with ThreadPoolExecutor(8) as ex:
    results = list(ex.map(hash_file, paths))
# Wall time: ~29s (~no speedup)

# processes (CORRECT — true parallelism)
with ProcessPoolExecutor(8) as ex:
    results = list(ex.map(hash_file, paths))
# Wall time: ~4s (~8x speedup on 8 cores)`,
            annotation:
              "For CPU-bound Python code, only processes give real parallelism. asyncio and threads can't escape the GIL.",
          },
          takeaway:
            "Same problem shape, different right answer. The question is never 'which is fastest in general' — it's 'is this workload I/O-bound or CPU-bound, and is the library sync or async?'",
        },
        {
          kind: "key_insight",
          label: "The 30-second decision tree",
          insight: `1. **Is the work CPU-bound in pure Python?** → \`ProcessPoolExecutor\`. Done.
2. **Is the work I/O-bound and you have async-native libraries?** → \`asyncio\` + \`Semaphore\` for rate limits.
3. **Is the work I/O-bound but the library is sync-only?** → \`ThreadPoolExecutor\` (or \`asyncio.to_thread\` if you're already in async code).
4. **One slow blocking call inside otherwise-async code?** → \`await asyncio.to_thread(fn)\`. Don't restructure the whole thing.

Anything more nuanced is a refinement on these four lines.`,
        },
        {
          kind: "flashcard",
          front: "What are the three Python concurrency models and the one-line description of each?",
          back: "**asyncio**: single-thread event loop, coroutines yield on I/O — best for many concurrent I/O ops with async libs. **threads**: multiple OS threads sharing memory, GIL serializes Python bytecode but releases on I/O — best for concurrent I/O with sync libs. **processes**: separate interpreters, no shared memory, true parallelism — best for CPU-bound Python work.",
        },
        {
          kind: "flashcard",
          front: "If you only remember one rule for picking a concurrency model, what is it?",
          back: "**CPU-bound → processes. I/O-bound → asyncio (or threads if the lib is sync).** That single dichotomy gets you 90% of the way. The GIL is the reason: it serializes Python bytecode across threads, so threads can't speed up CPU work; but it releases during I/O syscalls, so threads (and asyncio) can multiplex I/O.",
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 2. I/O-bound vs CPU-bound — how to tell
    // ─────────────────────────────────────────────────────────────────────
    {
      title: "I/O-bound vs CPU-bound — how to tell",
      blocks: [
        {
          kind: "prose",
          markdown: `Everything in this guide hinges on the I/O-vs-CPU classification. Get it wrong and you'll pick the wrong tool. Definitions:

- **I/O-bound**: most of the wall time is waiting for something outside the process — network, disk, database, subprocess. CPU sits at near-zero utilization. Examples: HTTP requests, file reads, database queries, \`subprocess.run\` calls.
- **CPU-bound**: most of the wall time is Python (or C) instructions executing. CPU sits at 100% on at least one core. Examples: hashing, regex over large strings, NumPy matrix multiply, JSON parsing of huge blobs, embedding compute, image filtering.

**How to tell in 60 seconds:**
1. Time the operation on one item: \`time.perf_counter()\` before and after.
2. While it runs, watch CPU: \`top\` / Activity Monitor / \`htop\`. Pegged at 100% on one core = CPU-bound. Near zero = I/O-bound.
3. Or: read the code. If it's calling \`requests.get\`, \`open(...).read()\`, \`cursor.execute\`, \`subprocess.run\` — I/O. If it's looping over data, doing math, parsing text — CPU.

**The grey zones:** small CPU work between I/O calls (parsing JSON after an HTTP response — usually still net I/O-bound); huge file reads (technically I/O but the bottleneck might be the disk, not the network — same conclusion either way); calling a sync function that internally does both. When in doubt, **profile**: \`cProfile\` or \`py-spy\` tells the truth.`,
        },
        {
          kind: "method_ref",
          title: "Quick-check primitives for classifying workloads",
          importLine:
            "import time, cProfile  # or: $ pip install py-spy && py-spy top --pid <pid>",
          methods: [
            {
              signature: "time.perf_counter() → float",
              description:
                "Monotonic high-resolution clock. Wrap a one-item call to measure wall time. Compare against `time.process_time()` to estimate I/O wait.",
            },
            {
              signature: "time.process_time() → float",
              description:
                "CPU time consumed by this process (user + system). `wall - cpu = time spent waiting`. Big gap = I/O-bound.",
            },
            {
              signature: "cProfile.run(stmt, filename=None, sort=-1)",
              description:
                "Stdlib profiler. Output shows where the cumulative time is spent. `socket.recv`, `read`, `select.select` dominating = I/O. Pure-Python functions or `numpy.dot` dominating = CPU.",
            },
            {
              signature: "$ py-spy top --pid <pid>",
              description:
                "Sampling profiler that attaches to a running process. Best 'is this CPU-bound right now' check for live FDE workloads. Pip-install once, point it at any Python process.",
            },
          ],
        },
        {
          kind: "scenario_predict",
          label: "Classify: 100 calls to client.messages.create with light JSON parsing",
          scenario: `import time

start = time.perf_counter()
cpu_start = time.process_time()
results = [client.messages.create(...) for _ in range(100)]
wall = time.perf_counter() - start
cpu = time.process_time() - cpu_start
print(f"wall={wall:.1f}s  cpu={cpu:.1f}s  ratio={cpu/wall:.2f}")`,
          language: "python",
          question:
            "Each call is ~3s of network wait + ~10ms of CPU. Is this I/O-bound or CPU-bound, and which concurrency model wins?",
          answer:
            "Strongly I/O-bound. Wall ~300s, cpu ~1s, ratio ~0.003 — the CPU/wall ratio near zero is the definitive signal. Winner: asyncio + Semaphore (or ThreadPoolExecutor if you're stuck on the sync client).",
          explanation:
            "When per-call CPU is a tiny fraction of wall time, you have I/O-bound work and asyncio dominates. `AsyncAnthropic` is async-native, `Semaphore` caps concurrency to respect the rate limit, `return_exceptions=True` isolates failures. ProcessPoolExecutor would be strictly worse — pickling overhead with zero benefit, since the GIL isn't your bottleneck.",
        },
        {
          kind: "scenario_predict",
          label: "Classify: nightly re-embedding 100k docs on CPU",
          scenario: `# Serial baseline
for doc in documents:
    embedding = model.encode(doc.text)  # ~50ms pure CPU
    save(embedding)
# Wall: ~83 min. CPU pegged at 100% on 1 core.`,
          language: "python",
          question:
            "100,000 docs × ~50ms each via local sentence-transformers (no GPU). Classify and pick a concurrency model.",
          answer:
            "Strongly CPU-bound. CPU/wall ratio ≈ 1.0 on one core. Winner: ProcessPoolExecutor. On 8 cores, expect ~7x speedup (one core lost to coordination) → ~12 minutes.",
          explanation:
            "`model.encode` is matrix multiplies + activations — pure compute. Threads give zero speedup because the GIL serializes the encode calls. asyncio is irrelevant — no I/O to overlap. **Caveat:** if the model uses NumPy/PyTorch tensor ops that release the GIL internally, threads can sometimes match processes — measure both. For PyTorch, set `torch.set_num_threads(1)` per process to prevent oversubscription.",
        },
        {
          kind: "scenario_predict",
          label: "Mixed workload — partial speedup mystery",
          scenario: `# 1,000 page scrape: ~2s fetch + ~200ms BS4 parse per page
# Serial: ~37 min
# ThreadPoolExecutor(50): expected 50x speedup → got ~10x. Why?`,
          language: "text",
          question:
            "You wrap the fetch+parse pipeline in `ThreadPoolExecutor(50)` and get 10x, not 50x. Where's the missing speedup?",
          answer:
            "The parsing step (200ms × 1000 = 200s of pure CPU) hits the GIL. Fetches parallelize cleanly (GIL releases on socket reads), but BS4 parsing has to single-file through the GIL.",
          explanation:
            "Network wait (2,000s total) drops from ~40 min to ~40s with 50-way concurrency. Parsing (200s) stays serial-ish. Total ~240s ≈ 4 min ≈ 10x. **Fix:** decouple — fetch in threads/asyncio, then send the HTML to a ProcessPool for parsing. Or use `lxml` (C extension, releases the GIL more aggressively).",
        },
        {
          kind: "key_insight",
          label: "The CPU-vs-wall ratio test",
          insight: `**\`process_time / perf_counter\` is your single best diagnostic.** Ratio near 0 = pure I/O (asyncio or threads). Ratio near 1 = pure CPU on one core (processes). Ratio between = mixed, and the dominant component dictates the tool. Measure on one item, then plan.`,
        },
        {
          kind: "flashcard",
          front: "What's the difference between I/O-bound and CPU-bound work?",
          back: "**I/O-bound**: wall time dominated by waiting on external systems (network, disk, DB, subprocess). CPU near 0% during the wait. **CPU-bound**: wall time dominated by Python or C instructions executing. One CPU core pegged at 100%. The classification determines which concurrency model can actually speed up the workload.",
        },
        {
          kind: "flashcard",
          front: "Quick test: how do you tell if a Python function is I/O-bound or CPU-bound without reading the source?",
          back: "Time it with `wall = time.perf_counter()` and `cpu = time.process_time()`. If `cpu / wall ≈ 0`, it's I/O-bound (mostly waiting). If `cpu / wall ≈ 1`, it's CPU-bound on one core (mostly computing). If between, it's mixed. Or watch CPU% in `top` while it runs.",
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 3. The GIL — the unifying constraint
    // ─────────────────────────────────────────────────────────────────────
    {
      title: "The GIL — the unifying constraint",
      blocks: [
        {
          kind: "prose",
          markdown: `Every concurrency decision in CPython comes back to the **Global Interpreter Lock**. The GIL is a mutex that lets only one thread execute Python bytecode at a time within a single process. It exists because CPython's memory management (reference counting) isn't thread-safe.

**What the GIL means in practice:**
- **Threads can't parallelize pure-Python CPU work.** Two threads doing math? Serialized. Eight threads? Still serialized.
- **Threads can parallelize I/O.** The GIL is released during blocking syscalls (\`recv\`, \`read\`, \`select\`, \`time.sleep\`). One thread waits on the network, another runs.
- **C extensions can release the GIL voluntarily.** NumPy, PyTorch tensor ops, \`hashlib\`, \`zlib\`, image libraries — many drop the GIL around their hot loops. Threads can then parallelize those calls.
- **Processes each have their own GIL.** \`ProcessPoolExecutor\` sidesteps the issue entirely — N processes = N independent Pythons = true parallelism.
- **asyncio has the same GIL constraint as threads** (it's single-threaded), but never tries to fight it — it explicitly yields on I/O at each \`await\`.

**Free-threaded Python (PEP 703, 3.13+):** an experimental build of CPython without the GIL exists. It changes the calculus, but in 2026 production code it's not yet default and most libraries aren't validated for it. Until then: assume GIL.`,
        },
        {
          kind: "code_comparison",
          label: "GIL: when threads help vs when they don't",
          left: {
            title: "I/O — threads win",
            code: `def fetch(url):
    return requests.get(url).text  # releases GIL

with ThreadPoolExecutor(10) as ex:
    pages = list(ex.map(fetch, urls))
# 100 URLs × 1s each:
#   serial: ~100s
#   10 threads: ~10s (10x speedup)`,
            annotation:
              "requests.get spends ~99% of its time in `recv()` syscalls. GIL is released during the wait, so all 10 threads can be inflight simultaneously.",
          },
          right: {
            title: "CPU — threads useless",
            code: `def hash_one(data):
    return hashlib.sha256(data).hexdigest()
    # ^ hashlib DOES release GIL — fine!

def count_words(text):
    return len(text.split())
    # ^ pure Python — GIL held

with ThreadPoolExecutor(10) as ex:
    counts = list(ex.map(count_words, docs))
# 100 docs × 1s of pure-Python work each:
#   serial: ~100s
#   10 threads: ~100s (no speedup)`,
            annotation:
              "`text.split()` is pure Python bytecode. The GIL serializes it. Ten threads run no faster than one. Use ProcessPoolExecutor for this kind of work.",
          },
          takeaway:
            "Threads parallelize what releases the GIL (I/O, NumPy, hashlib, zlib, etc.). For pure-Python compute, threads give no speedup and add overhead.",
        },
        {
          kind: "scenario_predict",
          label: "NumPy in a ThreadPool — why no speedup?",
          scenario: `# np.dot(a, b) for 2000x2000 matrices
# Serial: 0.4s; CPU pegged at 800% (BLAS internal threading)

with ThreadPoolExecutor(8) as ex:
    results = list(ex.map(np.dot, mats_a, mats_b))
# 100 matmuls: expected ~8x speedup, got ~1x (or worse)`,
          language: "python",
          question:
            "Why does wrapping multi-threaded BLAS calls in ThreadPoolExecutor fail to speed things up?",
          answer:
            "CPU oversubscription. `np.dot` already uses multi-threaded BLAS and saturates your cores. 8 ThreadPool workers each spawning their own multi-threaded matmul creates 64+ logical threads fighting for 8 physical cores. Throughput stays flat or drops.",
          explanation:
            "GIL release isn't enough — also check whether the library is already saturating the CPU. **Fix:** either (a) keep the loop serial since BLAS already parallelizes, or (b) set `OMP_NUM_THREADS=1`/`MKL_NUM_THREADS=1` per worker and use ProcessPoolExecutor to get N processes each running single-threaded BLAS.",
        },
        {
          kind: "multiple_choice",
          title: "hashlib at scale",
          prompt:
            "You have a function that calls `hashlib.sha256(big_blob).hexdigest()` once per item, on 10,000 items. Each call takes 100ms. Which concurrency model gives the best speedup on an 8-core machine?",
          choices: [
            {
              text: "asyncio with `gather`",
              correct: false,
              rationale:
                "asyncio is single-threaded. It only helps when you can yield on I/O. `hashlib.sha256` is CPU work — even though it releases the GIL, asyncio has no way to run two CPU computations in parallel.",
            },
            {
              text: "ThreadPoolExecutor(8) — hashlib releases the GIL, so threads parallelize",
              correct: true,
              rationale:
                "`hashlib` is a C extension that explicitly releases the GIL around the hashing loop. With 8 threads on 8 cores, you get ~7-8x speedup with much lower overhead than processes (no pickling). This is the rare case where threads parallelize 'CPU-looking' work.",
            },
            {
              text: "ProcessPoolExecutor(8) — CPU work needs processes",
              correct: false,
              rationale:
                "It works and gives similar speedup, but the per-call pickling overhead (passing the big_blob into the worker process) eats into the win. Threads are cleaner here because hashlib already releases the GIL — no need to pay the IPC cost.",
            },
            {
              text: "Stay serial; the GIL means you can't parallelize Python",
              correct: false,
              rationale:
                "Not all 'Python' work holds the GIL. C extensions like `hashlib`, `zlib`, NumPy, and PIL drop the GIL around their compute. Knowing which is which is half of FDE concurrency.",
            },
          ],
          explanation:
            "The GIL is held by pure-Python bytecode, not C extension internals. `hashlib`, `zlib`, NumPy, and many image libraries voluntarily release the GIL around their hot loops — threads can parallelize them at the cost of one OS thread per worker (much cheaper than a process). Use this exception deliberately when the C extension is the bottleneck.",
        },
        {
          kind: "key_insight",
          label: "The GIL release rule",
          insight: `**Threads parallelize anything that releases the GIL.** That includes: every blocking I/O syscall, \`time.sleep\`, \`hashlib\`, \`zlib\`/\`gzip\`, NumPy/SciPy/PyTorch hot paths, PIL/Pillow image operations, \`re\` (sometimes), \`json\` (no — pure Python). For pure-Python compute (string manipulation, dict operations, list comprehensions), threads are useless — use processes.`,
        },
        {
          kind: "flashcard",
          front: "What is the GIL and why does it matter for concurrency model choice?",
          back: "The Global Interpreter Lock is a mutex in CPython that allows only one thread to execute Python bytecode at a time per process. It's why threads don't speed up pure-Python CPU work, but do speed up I/O (the GIL is released during blocking syscalls). Processes sidestep it entirely. It's the single biggest reason 'threads for CPU work' is the most common Python concurrency mistake.",
        },
        {
          kind: "flashcard",
          front: "Name three Python operations that release the GIL (so threads can parallelize them) and three that don't.",
          back: "**Release the GIL** (threads help): blocking I/O (`requests.get`, `socket.recv`, file reads), `hashlib.sha256(big_data)`, NumPy `np.dot` / `np.sum` on large arrays. **Hold the GIL** (threads useless): pure-Python loops/comprehensions, `dict`/`list` operations, `text.split()` / string slicing, `json.loads` (mostly Python). When unsure, time it under threads vs serial — if no speedup, it holds the GIL.",
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 4. asyncio — the sweet spot
    // ─────────────────────────────────────────────────────────────────────
    {
      title: "asyncio — when it's the right call",
      blocks: [
        {
          kind: "prose",
          markdown: `**asyncio wins when**: you have **many concurrent I/O operations** and **async-native libraries** for them. The canonical FDE workload: batching N calls through Claude, fetching M URLs with \`httpx\`, reading K files with \`aiofiles\`, or streaming from a database with \`asyncpg\`.

**Why it wins (vs threads):**
- **Cheaper than threads** — one thread, no OS-level context switches between tasks. You can have thousands of inflight coroutines; you can't have thousands of OS threads without thrashing.
- **Cleaner cancellation** — \`TaskGroup\` cancels siblings cleanly on first failure; \`asyncio.timeout\` is a context manager that just works.
- **Better backpressure primitives** — \`asyncio.Queue\`, \`asyncio.Semaphore\` are designed for this.
- **No GIL contention** — single thread, no fighting over the lock.

**Why it loses (when it does):**
- **Sync-only libraries kill it.** One \`requests.get\` inside a coroutine freezes the entire event loop. If your dependency tree is sync-only and you can't swap it (\`asyncio.to_thread\` is the escape hatch but it's threads under the hood — at that point, why not just use a ThreadPool?).
- **CPU work kills it.** A 500ms CPU computation in a coroutine blocks every other coroutine for 500ms. asyncio is single-threaded.
- **Onboarding cost.** Code is structurally different — every caller in the chain needs \`async\`/\`await\`. Mixing async and sync correctly takes practice.

**FDE rule of thumb:** if the upstream is \`AsyncAnthropic\` / \`httpx\` / \`aiohttp\` / \`asyncpg\` / \`aiofiles\` and you have ≥10 concurrent I/O ops, asyncio is almost always the right answer.`,
        },
        {
          kind: "scenario_predict",
          label: "One-shot cron: 50 URLs + Claude summarization, sync SDK only",
          scenario: `# The team uses sync Anthropic (no AsyncAnthropic approved yet)
# Option A: asyncio + httpx + asyncio.to_thread for client.messages.create
# Option B: ThreadPoolExecutor(20) for everything
# Which is the better call?`,
          language: "text",
          question:
            "One-shot daily cron script. Team uses sync `Anthropic`, sync `requests`. Pick the cleaner concurrency model.",
          answer:
            "ThreadPoolExecutor. The async version technically works but you'd pay the structural cost (every function becomes `async`) while bouncing the most important call back to a thread via `asyncio.to_thread` — worst of both worlds.",
          explanation:
            "asyncio's value is being native end-to-end. If any major dependency is sync-only and you can't migrate, just use threads. The one-shot cron also tilts toward simplicity — the async refactor doesn't pay back over the script's lifetime. **Exception:** if migration to `AsyncAnthropic` is planned and this is a longer-lived service, write async-first and accept the `to_thread` bridge for now.",
        },
        {
          kind: "scenario_predict",
          label: "FastAPI chatbot, 100 concurrent users, async libs available",
          scenario: `@app.post("/chat")
async def chat(req: ChatRequest):
    docs = await vector_db.query(req.message, top_k=5)
    response = await async_client.messages.create(
        model="claude-opus-4-5",
        max_tokens=1024,
        messages=[{"role": "user", "content": req.message}],
    )
    return {"reply": response.content[0].text}`,
          language: "python",
          question:
            "100 concurrent users, async-native libs available for both Claude and the vector DB. Right model?",
          answer:
            "asyncio — FastAPI is async-native. 100 users × ~5s/request = ~500 inflight coroutines at peak. Trivial for asyncio; a ThreadPool would need 500 OS threads (wasteful — each thread is ~1MB of stack).",
          explanation:
            "Anti-pattern to avoid: writing the handler as `async def` but calling sync libraries inside it. A single sync `requests.get` or `client.messages.create` blocks the entire uvicorn worker, throttling throughput to ~1 req at a time. Either use async libs throughout, or wrap blocking calls in `await asyncio.to_thread(...)`.",
        },
        {
          kind: "scenario_predict",
          label: "Throughput collapse on a FastAPI endpoint",
          scenario: `@app.get("/throttled")
async def throttled():
    time.sleep(0.1)  # "rate limit"
    return {"ok": True}

# Expected throughput: ~1000 req/sec on one worker
# Actual throughput: ~10 req/sec. Why?`,
          language: "python",
          question:
            "Why does `time.sleep(0.1)` inside an async handler collapse throughput from 1000/s to 10/s?",
          answer:
            "`time.sleep` is synchronous — it blocks the calling thread, which in a uvicorn async worker means it blocks the entire event loop. While the loop sleeps, no other request can make progress.",
          explanation:
            "Fix: `await asyncio.sleep(0.1)` — same delay, but yields to the loop. Other coroutines run during the wait. This is the canonical asyncio mistake — any blocking call (`time.sleep`, `requests`, `open().read()`, `subprocess.run`) inside an async function kills concurrency. Fix is always: use the async equivalent, or wrap in `asyncio.to_thread`.",
        },
        {
          kind: "key_insight",
          label: "asyncio's killer feature",
          insight: `**You can have thousands of inflight coroutines on one thread.** OS threads are heavy (~1 MB stack, ~10 μs context switch); coroutines are lightweight (~kilobytes, sub-microsecond switch). For workloads where N is large (a server with 10k concurrent connections, a batch with 100k items), asyncio is the only model that scales. Just respect the constraint: never block the loop.`,
        },
        {
          kind: "flashcard",
          front: "When is asyncio the right concurrency model?",
          back: "Many concurrent I/O-bound operations + async-native libraries available end-to-end. Typical wins: API batching with `AsyncAnthropic`, HTTP fan-out with `httpx`, async web servers (FastAPI, aiohttp), thousands of concurrent WebSocket connections. The bigger the N, the more decisively asyncio beats threads.",
        },
        {
          kind: "flashcard",
          front: "When is asyncio the WRONG choice (use threads or processes instead)?",
          back: "(1) Sync-only library you can't migrate — `to_thread` works but threads are cleaner. (2) CPU-bound work — single-threaded async can't parallelize compute. (3) Small one-shot scripts where the async overhead doesn't pay back. (4) Code that's already sync and works fine — don't async-ify for no reason.",
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 5. Threads — the sweet spot
    // ─────────────────────────────────────────────────────────────────────
    {
      title: "Threads — when they're the right call",
      blocks: [
        {
          kind: "prose",
          markdown: `**Threads win when**: you need **concurrent I/O** and the libraries are **sync-only** (or you don't want to async-ify the codebase). They also win for **GIL-releasing C extensions** doing compute (hashlib, zlib, NumPy hot paths).

**Why they win (vs asyncio):**
- **Drop-in concurrency for sync code.** \`with ThreadPoolExecutor(20) as ex: list(ex.map(fn, items))\` — three lines, works with any sync function. No \`async\` keyword infection.
- **Sync libraries just work.** \`requests\`, the sync \`Anthropic\` client, \`psycopg2\`, \`boto3\` — all sync, all fine in threads.
- **C extension parallelism.** Anything releasing the GIL (hashlib, NumPy, PyTorch) gets real parallelism in threads — sometimes the fastest option due to no pickling cost.

**Why they lose (when they do):**
- **OS thread limits.** ~1 MB stack each, scheduler overhead. Practical ceiling: ~hundreds to low thousands of threads, vs asyncio's tens of thousands of coroutines.
- **Pure-Python CPU work doesn't parallelize.** GIL.
- **Shared mutable state needs locks.** Easy to introduce race conditions if you mutate dicts/lists across threads.
- **Harder to cancel.** No \`TaskGroup\` equivalent. Cancelling a running thread is messy (no \`Thread.cancel()\`; you have to design cooperative cancellation with a flag or sentinel).

**FDE rule of thumb:** \`ThreadPoolExecutor(10–50)\` wrapping sync I/O calls is the most common shape. It's the right answer when you'd say "I just want to parallelize these calls without restructuring everything."`,
        },
        {
          kind: "scenario_predict",
          label: "Parallelize 200 boto3 S3 downloads",
          scenario: `import boto3
from concurrent.futures import ThreadPoolExecutor

s3 = boto3.client("s3")
keys = [...]  # 200 keys, ~3s each

def download(key):
    s3.download_file("bucket", key, f"/tmp/{key}")

with ThreadPoolExecutor(max_workers=20) as ex:
    list(ex.map(download, keys))`,
          language: "python",
          question:
            "boto3 is sync. Each download is ~3s of network wait. Right choice and expected speedup?",
          answer:
            "ThreadPoolExecutor is correct. With 20 workers and ~3s per call, expect ~30s total — 20x speedup. Threads parallelize cleanly because boto3 releases the GIL on network calls.",
          explanation:
            "Why not asyncio? `aioboto3` exists but isn't always available in restricted environments; the async-ification adds complexity for a one-shot script. Why not processes? Pure overhead — no CPU work to parallelize, pickling the boto3 client state is messy. Tune the worker count: 20 is fine; going to 100+ tends to hit S3-side throttling and gain little.",
        },
        {
          kind: "scenario_predict",
          label: "Hashing 10k PDFs — threads or processes?",
          scenario: `# 10,000 PDFs × 1MB each, on an 8-core box
# Option A: ThreadPoolExecutor(8) — hashlib releases the GIL
# Option B: ProcessPoolExecutor(8) — also valid

with ThreadPoolExecutor(8) as ex:
    hashes = list(ex.map(sha256_of_file, paths))`,
          language: "python",
          question:
            "Each hash is `hashlib.sha256(pdf_bytes).hexdigest()`. Threads or processes?",
          answer:
            "Threads, slightly. hashlib is a C extension that releases the GIL during hashing, so 8 threads on 8 cores get true parallelism — same as processes for the compute, but without the pickling overhead.",
          explanation:
            "If the function were pure-Python (a custom checksum loop), processes would win decisively. But hashlib releases the GIL, so this is a 'threads do CPU work' exception. Expected speedup: ~7x on 8 cores either way. Threads cost less to spin up and don't pickle inputs/outputs, so they edge out. **Caveat:** if reading the PDFs from disk inside the worker (typical), that's I/O-bound too — even more reason for threads.",
        },
        {
          kind: "scenario_predict",
          label: "500 threads crashes the script",
          scenario: `# 10,000 HTTP requests; teammate sets max_workers=500
with ThreadPoolExecutor(max_workers=500) as ex:
    list(ex.map(requests.get, urls))
# RuntimeError: can't start new thread`,
          language: "python",
          question: "Why does max_workers=500 crash on Linux, and what's the fix?",
          answer:
            "Thread stacks add up: each OS thread reserves ~1 MB of virtual address space. 500 threads = 500 MB just for stacks, plus per-thread kernel state. Combined with other process resources, you hit `ulimit -u` or OOM.",
          explanation:
            "Fixes in order of preference: (1) lower `max_workers` — 50–100 is plenty for HTTP; the bottleneck is the network/upstream, not your threads. (2) Use asyncio + httpx for tens of thousands of concurrent I/O ops — coroutines are kilobytes, not megabytes. (3) Raise ulimits — band-aid. **Rule:** if you're tempted to set `max_workers > 100`, asyncio is probably a better fit.",
        },
        {
          kind: "key_insight",
          label: "Threads' sweet spot",
          insight: `**Sync sync sync.** If the codebase is sync, the libraries are sync, and you have ≤ a few hundred concurrent I/O ops, ThreadPoolExecutor is the cleanest answer. The mental cost of asyncio (async-coloring the whole call chain) only pays back when N is large or you're already async.`,
        },
        {
          kind: "flashcard",
          front: "When are threads the right concurrency model?",
          back: "(1) Concurrent I/O in a sync codebase with sync libraries (the most common case). (2) CPU work via C extensions that release the GIL (hashlib, NumPy hot paths). (3) When you want minimal structural change to existing sync code. Best size: 10–100 workers; going much higher means asyncio is probably a better fit.",
        },
        {
          kind: "flashcard",
          front: "When are threads the WRONG choice?",
          back: "(1) Pure-Python CPU work — GIL serializes it, no speedup. Use processes. (2) Very high concurrency (thousands of inflight ops) — thread overhead dominates. Use asyncio. (3) Anywhere you're already in async code — use `asyncio.to_thread` for one-off sync calls, not a separate ThreadPool.",
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 6. Processes — the sweet spot
    // ─────────────────────────────────────────────────────────────────────
    {
      title: "Processes — when they're the right call",
      blocks: [
        {
          kind: "prose",
          markdown: `**Processes win when**: the work is **CPU-bound in pure Python** (or in a C extension that doesn't release the GIL), and the data per call is small enough that pickling overhead doesn't dominate.

**Why they win (vs threads/asyncio):**
- **True parallelism.** Each process has its own interpreter and its own GIL. On 8 cores, you get ~8x speedup for CPU work (minus coordination overhead).
- **Crash isolation.** A segfault in one process doesn't take down the others.
- **No GIL games.** You don't have to know which C extensions release the GIL — every process runs at full speed independently.

**Why they lose (when they do):**
- **Pickling overhead.** Arguments are pickled, sent across a pipe, unpickled in the worker. Results take the same trip back. For small payloads (numbers, short strings) this is fine. For large payloads (multi-MB DataFrames, big NumPy arrays), it can dominate.
- **No shared memory by default.** Workers can't see process-level state. You need \`initializer=\` to set up per-worker resources (loaded models, opened DB connections).
- **Startup cost.** Spawning a process is much slower than spawning a thread (~100ms vs ~1ms on Linux; worse on macOS/Windows where \`spawn\` is the default).
- **Picklability constraint.** The function and its args must be picklable. Closures, lambdas, locally-defined classes won't work.

**FDE rule of thumb:** if you measure CPU at 100% on one core (and your function isn't already using BLAS / multi-threaded C internals), ProcessPoolExecutor is the answer. For batch sizes < ~100 items or per-call work < ~10ms, threads might match or beat processes because of pickling overhead.`,
        },
        {
          kind: "scenario_predict",
          label: "Embedding 50k docs on 16 cores with a 500MB model",
          scenario: `from concurrent.futures import ProcessPoolExecutor
from sentence_transformers import SentenceTransformer

_MODEL = None

def init_worker():
    global _MODEL
    _MODEL = SentenceTransformer("all-MiniLM-L6-v2")

def embed(text: str) -> list[float]:
    return _MODEL.encode(text).tolist()

with ProcessPoolExecutor(
    max_workers=16,
    initializer=init_worker,
) as ex:
    embeddings = list(ex.map(embed, texts, chunksize=50))`,
          language: "python",
          question:
            "Walk through the four key choices in this code and why each matters for a 50k-doc embed job.",
          answer:
            "(1) ProcessPoolExecutor — pure-Python CPU work, GIL would serialize threads. (2) `initializer=init_worker` — model loads once per process (16×), not once per call. (3) `chunksize=50` — amortizes IPC over batches of 50. (4) Set `torch.set_num_threads(1)` in init to prevent CPU oversubscription. Expected: ~12–14x speedup → ~5 min from ~67 min serial.",
          explanation:
            "Each choice maps to a process-pool failure mode: forgetting `initializer=` re-loads the 500MB model 50k times. Skipping `chunksize=` lets IPC dominate. Forgetting `torch.set_num_threads(1)` means 16 processes × 4 PyTorch intra-op threads = 64 threads on 16 cores = oversubscription. These four together are the canonical 'CPU-bound batch with a heavy model' shape.",
        },
        {
          kind: "scenario_predict",
          label: "ProcessPool slower than serial — what's wrong?",
          scenario: `def cheap_compute(x):
    return x * x + 1  # ~5ms (toy)

with ProcessPoolExecutor(8) as ex:
    results = list(ex.map(cheap_compute, range(100_000)))
# Serial: ~500s (100k × 5ms)
# 8 processes: ~520s (!)`,
          language: "python",
          question:
            "8 workers, CPU-bound function, yet no speedup. Diagnose and fix.",
          answer:
            "Pickling overhead dominates. For each of 100k items, the parent pickles the int, sends it across a pipe, the worker unpickles, runs 5ms of work, pickles the result, sends it back. The dispatch rate is throttled by IPC bandwidth — for 5ms work, IPC is a wash.",
          explanation:
            "Fixes: (1) `chunksize=1000` in `ex.map` — IPC happens 100 times instead of 100,000. Usually fixes it. (2) Batch in the worker — change the function to `compute_many(xs: list) -> list` and call `ex.map(compute_many, batched(items, 500))`. (3) Reconsider — if each item is 5ms, just run serial (500s = 8 min isn't bad). Process pools shine when per-call work is ≥100ms or batches are large enough that startup amortizes.",
        },
        {
          kind: "scenario_predict",
          label: "FastAPI + ProcessPool: orphans and hangs under load",
          scenario: `# FastAPI service dispatches CPU work to a process pool per request
# Under load: occasional hangs, orphan processes, sporadic BrokenProcessPool`,
          language: "text",
          question:
            "List the four most common causes of process-pool flakiness in an async server and the fix for each.",
          answer:
            "(1) Pool created per request → spawn cost dominates; fix: create once at startup. (2) Worker crash poisons pool → `BrokenProcessPool`; fix: wrap submissions in try/except and rebuild. (3) Fork-after-thread on Linux deadlocks; fix: `mp_context=get_context('spawn')`. (4) Pickling failure on large args → silent hangs; fix: smaller args or shared memory.",
          explanation:
            "Diagnosis tools: `py-spy dump --pid <worker_pid>` shows what a worker is stuck on; `ps auxf` shows orphans. Sound production shape: one long-lived pool, sized to `os.cpu_count()`, with retry/rebuild on `BrokenProcessPool`, args passed as paths/IDs (not raw data), and `spawn` context explicit.",
        },
        {
          kind: "key_insight",
          label: "Processes' sweet spot",
          insight: `**Long-ish CPU work, small-ish args.** If per-call work is ≥ 100ms (so pickling is a small fraction) and args/results are small (so the pipe doesn't choke), \`ProcessPoolExecutor(max_workers=os.cpu_count())\` gives you near-linear speedup. For nightly batch jobs (embedding, image processing, log parsing) this is the right hammer.`,
        },
        {
          kind: "flashcard",
          front: "When are processes the right concurrency model?",
          back: "CPU-bound work in pure Python (the GIL prevents threads from helping). Best when per-call work is ≥100ms (amortizes pickling/startup) and args/results are small (pipe doesn't choke). Common wins: embedding compute on CPU, image processing, large regex over text, custom ML feature engineering.",
        },
        {
          kind: "flashcard",
          front: "What are the three biggest gotchas of ProcessPoolExecutor?",
          back: "(1) **Pickling overhead** — large args/results can dominate. Use `chunksize=`, batch in worker, or pass paths instead of data. (2) **Per-worker state** — anything global (loaded models, DB connections) must be set up in `initializer=`. (3) **Picklability** — top-level functions only; no closures, lambdas, or locally-defined classes.",
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 7. Hybrid patterns — combining models
    // ─────────────────────────────────────────────────────────────────────
    {
      title: "Hybrid patterns — async + executors",
      blocks: [
        {
          kind: "prose",
          markdown: `Real FDE workloads often mix shapes — async I/O with one blocking sync dependency, or async orchestration around CPU-bound preprocessing. asyncio gives you the bridges to do this without picking a single model for everything.

**The two bridges:**

- **\`await asyncio.to_thread(fn, *args)\`** (3.9+) — runs \`fn\` in the default thread pool, awaits the result. Best for one-off sync calls in an otherwise-async function. **Use for:** the one \`requests.get\` you can't avoid; a blocking \`PIL.Image.open\`; \`subprocess.run\`.
- **\`await loop.run_in_executor(executor, fn, *args)\`** — same idea but you supply the executor. Lets you dispatch to your own \`ThreadPoolExecutor\` or \`ProcessPoolExecutor\`. **Use for:** CPU-bound work from async code (give it a ProcessPool), or controlling the thread pool size separately from the default.

The pattern that comes up most: **async fan-out (asyncio.gather + AsyncAnthropic), with CPU-bound preprocessing offloaded to a ProcessPool.** You get async's lightweight concurrency for the I/O and processes' real parallelism for the compute.`,
        },
        {
          kind: "code_comparison",
          label: "Two bridges from async to blocking work",
          left: {
            title: "asyncio.to_thread — one-off blocking call",
            code: `import asyncio
import requests  # sync only

async def fetch_and_summarize(url):
    # Bounce the one sync call to a thread
    page = await asyncio.to_thread(requests.get, url)
    return await async_client.messages.create(
        model="claude-opus-4-5",
        max_tokens=512,
        messages=[{"role": "user",
                   "content": page.text[:5000]}],
    )

async def main():
    return await asyncio.gather(
        *[fetch_and_summarize(u) for u in urls]
    )`,
            annotation:
              "Default thread pool. Cheapest path for one-off blocking calls. No need to manage the pool yourself.",
          },
          right: {
            title: "run_in_executor — own ProcessPool for CPU",
            code: `import asyncio
from concurrent.futures import ProcessPoolExecutor

CPU_POOL = ProcessPoolExecutor(max_workers=8)

async def embed_and_index(text):
    loop = asyncio.get_running_loop()
    # CPU work goes to processes
    vec = await loop.run_in_executor(
        CPU_POOL, compute_embedding, text,
    )
    # I/O goes back to async
    await vector_db.upsert(text, vec)

async def main():
    await asyncio.gather(
        *[embed_and_index(t) for t in texts]
    )`,
            annotation:
              "Own executor — choose ProcessPool for CPU, ThreadPool for sync I/O. asyncio orchestrates the parallelism end-to-end.",
          },
          takeaway:
            "asyncio is the orchestration layer; executors handle the awkward bits. `to_thread` for one-offs, `run_in_executor` when you need control over the pool.",
        },
        {
          kind: "scenario_predict",
          label: "Canonical mixed pipeline: sync I/O + async I/O + CPU",
          scenario: `import asyncio
from concurrent.futures import ProcessPoolExecutor
import boto3

S3 = boto3.client("s3")
CPU_POOL = ProcessPoolExecutor(max_workers=16)
SEM = asyncio.Semaphore(20)  # cap inflight I/O

async def process_doc(key):
    async with SEM:
        loop = asyncio.get_running_loop()
        # Sync boto3 → thread
        body = await asyncio.to_thread(
            S3.get_object, Bucket="b", Key=key,
        )
        # Async extraction service
        text = await extract_text(body["Body"].read())
        # CPU embedding → process pool
        vec = await loop.run_in_executor(
            CPU_POOL, embed, text,
        )
        # Async vector DB
        await vdb.upsert(key, vec)

async def main():
    await asyncio.gather(
        *[process_doc(k) for k in keys],
        return_exceptions=True,
    )

asyncio.run(main())`,
          language: "python",
          question:
            "Why is each tool used where it is, and why is this the canonical mixed-workload shape?",
          answer:
            "asyncio orchestrates (1k coroutines on one thread — trivial). `to_thread` bridges sync boto3 cheaply. `run_in_executor(CPU_POOL, ...)` dispatches the 500ms CPU embedding to 16 processes that saturate the cores. Semaphore(20) caps inflight pipelines to protect downstream services. `return_exceptions=True` isolates per-item failures.",
          explanation:
            "This is **the** canonical FDE shape for mixed I/O + CPU pipelines. Each model is used where it wins; the bridges (`to_thread`, `run_in_executor`) glue them together. Worth memorizing — almost every FDE batch job that touches storage, an API, and a model fits this template.",
        },
        {
          kind: "scenario_predict",
          label: "asyncio.to_thread and time.sleep",
          scenario: `async def main():
    await asyncio.to_thread(time.sleep, 2)
    print("done")

asyncio.run(main())`,
          language: "python",
          question:
            "Does `time.sleep(2)` inside `asyncio.to_thread` block the event loop? What about a thousand concurrent ones?",
          answer:
            "No — `to_thread` runs the call in a background thread; the loop is free to run other coroutines during the wait. BUT: `to_thread` uses the default pool (`min(32, os.cpu_count()+4)` threads), so 1,000 concurrent `to_thread(time.sleep, 2)` calls only run ~32 at a time; the rest queue.",
          explanation:
            "For high-volume blocking I/O bridging, supply your own larger `ThreadPoolExecutor` via `loop.run_in_executor(my_pool, ...)`. Or — if a sleep was all you needed — just use `await asyncio.sleep(2)`, which is async-native and doesn't tie up a thread at all.",
        },
        {
          kind: "key_insight",
          label: "Mix when it pays",
          insight: `**Don't pick one model for everything when the workload has clearly different parts.** Async for the I/O orchestration, processes for the CPU step, threads for the one sync library. The bridges (\`to_thread\`, \`run_in_executor\`) are cheap; use them. The mistake is forcing a single model end-to-end and ending up with either blocked event loops or wasted process startups.`,
        },
        {
          kind: "flashcard",
          front: "How do you call a blocking sync function from async code without freezing the event loop?",
          back: "`await asyncio.to_thread(fn, *args, **kwargs)` (Python 3.9+). It dispatches `fn` to the default thread pool and awaits the result. The event loop runs other coroutines during the wait. For more control over the pool, use `await loop.run_in_executor(my_executor, fn, *args)`.",
        },
        {
          kind: "flashcard",
          front: "How do you run CPU-bound work from an async function?",
          back: "`await loop.run_in_executor(ProcessPoolExecutor(...), cpu_fn, *args)`. asyncio's default executor is a thread pool, which is useless for CPU work (GIL). You must supply a `ProcessPoolExecutor` explicitly. Typical pattern: create the pool once at module level, reuse across calls.",
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 8. FDE workload classifier — scenarios mapped to tools
    // ─────────────────────────────────────────────────────────────────────
    {
      title: "FDE workload classifier — scenarios mapped to tools",
      blocks: [
        {
          kind: "prose",
          markdown: `Run through these scenarios — they cover ~80% of the concurrency decisions you'll make at an FDE-style job. The goal is to recognize the **shape** of each workload so the tool selection becomes automatic.`,
        },
        {
          kind: "multiple_choice",
          title: "Scenario 1 — FastAPI chatbot with async libs",
          prompt:
            "A FastAPI endpoint calls Claude once per request, plus one query to a Postgres database. Expected: 200 concurrent users. Async-native libs available for both. What concurrency model?",
          choices: [
            {
              text: "asyncio — `AsyncAnthropic` + `asyncpg`, all `async def` handlers",
              correct: true,
              rationale:
                "Many concurrent I/O ops + async-native libs end-to-end = textbook asyncio. 200 inflight coroutines is light. FastAPI was built for this.",
            },
            {
              text: "ThreadPoolExecutor wrapping sync `Anthropic` and `psycopg2`",
              correct: false,
              rationale:
                "Works but unnecessary. You'd need 200 OS threads per worker, and you'd lose FastAPI's async optimizations. With async libs available, asyncio is cleaner.",
            },
            {
              text: "ProcessPoolExecutor — one process per request",
              correct: false,
              rationale:
                "Wildly wrong. The work is I/O-bound, not CPU-bound. Processes add pickling overhead and don't help with concurrent waits.",
            },
          ],
          explanation:
            "Async-native libs + I/O-bound + many concurrent ops = asyncio's home turf. The async ecosystem (FastAPI + AsyncAnthropic + asyncpg) is built for exactly this shape — use it end-to-end and don't bounce in and out of threads.",
        },
        {
          kind: "multiple_choice",
          title: "Scenario 2 — nightly CPU-bound embedding batch",
          prompt:
            "Nightly cron: re-embed 200,000 documents using a local `sentence-transformers` model on CPU. ~80ms per doc. Machine has 16 cores.",
          choices: [
            {
              text: "ProcessPoolExecutor(max_workers=16) with `initializer=` to load the model once per worker",
              correct: true,
              rationale:
                "Pure CPU-bound Python. Processes give true parallelism (the GIL would serialize threads). `initializer=` is critical so the 500MB model loads once per process, not once per call.",
            },
            {
              text: "asyncio + asyncio.gather — fastest in 2026",
              correct: false,
              rationale:
                "asyncio is single-threaded. It can't parallelize CPU work at all. You'd get serial performance.",
            },
            {
              text: "ThreadPoolExecutor(16) — threads are cheaper than processes",
              correct: false,
              rationale:
                "The GIL serializes Python bytecode. For PyTorch on CPU, some ops release the GIL but the per-call overhead and oversubscription typically lose vs processes. Worth measuring; processes are usually the right default.",
            },
          ],
          explanation:
            "CPU-bound Python ≈ processes. Expected ~14x speedup on 16 cores → ~20 min from ~270 min serial. The `initializer=` discipline (load heavy state once per worker) is what separates a working ProcessPool from a slow one.",
        },
        {
          kind: "multiple_choice",
          title: "Scenario 3 — one-shot mixed sync/async script",
          prompt:
            "One-shot script that downloads 50 PDFs (sync `requests`), each parsed with `pypdf` (Python, ~1s per PDF), text summarized via Claude (`AsyncAnthropic`).",
          choices: [
            {
              text: "asyncio for the Claude calls + `asyncio.to_thread` for the sync `requests` and `pypdf` work",
              correct: true,
              rationale:
                "Sync libs are unavoidable for download/parse; Anthropic part is async-native. Bridge with `to_thread` for the sync parts; orchestrate with asyncio for the Anthropic fan-out. Clean separation, no extra pools to manage.",
            },
            {
              text: "ThreadPoolExecutor(20) for everything — simpler",
              correct: false,
              rationale:
                "Also valid and arguably simpler — for a one-shot script, threads might be the better choice to avoid async-coloring. But you lose `Semaphore`'s clean rate-limit semantics for the Anthropic calls. Both work; the hybrid is slightly cleaner if rate control matters.",
            },
            {
              text: "ProcessPoolExecutor for `pypdf` parsing + asyncio for Claude calls",
              correct: false,
              rationale:
                "Overkill for 50 PDFs × 1s = 50s of CPU work. The pool startup cost (~1s per worker on macOS spawn) eats the win. Use threads or accept serial parsing.",
            },
          ],
          explanation:
            "When one part of a pipeline is async-native and another is sync-only, the hybrid (asyncio + to_thread) is the cleanest production shape. For one-shot scripts, the all-threads answer is also defensible — pick based on whether async rate-limit control matters.",
        },
        {
          kind: "multiple_choice",
          title: "Scenario 4 — 10k WebSocket connections",
          prompt:
            "WebSocket server expecting 10,000 concurrent connections, each idle most of the time, occasionally exchanging small messages. Pure I/O.",
          choices: [
            {
              text: "asyncio (with `uvicorn`/`hypercorn` and `websockets`)",
              correct: true,
              rationale:
                "10k inflight connections = the asyncio sweet spot. Each coroutine is kilobytes; 10k OS threads would consume ~10 GB just for stacks. The async-native server stack handles this trivially.",
            },
            {
              text: "ThreadPoolExecutor(10000) — one thread per connection",
              correct: false,
              rationale:
                "Doesn't scale. ~1 MB stack × 10,000 = ~10 GB just for thread stacks, plus kernel scheduler overhead. You'll hit ulimits or OOM long before reaching 10k threads.",
            },
            {
              text: "Synchronous server, fork a process per connection",
              correct: false,
              rationale:
                "Even worse than threads. Processes are heavier still. This is the C10k problem; asyncio (or epoll-based equivalents) is the only sane answer for high connection counts.",
            },
          ],
          explanation:
            "High-fan-out long-lived I/O = asyncio's killer use case. This is why every modern async server (uvicorn, hypercorn, aiohttp) is built on asyncio — coroutines scale to tens of thousands per worker; OS threads don't.",
        },
        {
          kind: "multiple_choice",
          title: "Scenario 5 — parallelize `git log` across 200 repos",
          prompt:
            "Internal tool: parallelize a `git log` parser across 200 repos to find first-commit dates. Each repo takes ~500ms of `subprocess.run('git log ...')` + ~50ms of Python regex parsing. 8-core box.",
          choices: [
            {
              text: "ThreadPoolExecutor(20) — subprocess wait releases the GIL",
              correct: true,
              rationale:
                "Each call is dominated by subprocess wait (I/O). Threads parallelize cleanly. The 50ms regex is small enough that GIL contention is tolerable. Simple, no library changes. Expected: ~5s vs ~110s serial.",
            },
            {
              text: "asyncio with `asyncio.create_subprocess_exec`",
              correct: false,
              rationale:
                "Works and is even more efficient, but for 200 items in a one-shot script the structural cost of asyncio isn't worth it. Threads are the simpler answer.",
            },
            {
              text: "ProcessPoolExecutor — true parallelism",
              correct: false,
              rationale:
                "Overkill. The work is I/O-bound (subprocess.run). Processes add pickling overhead with no benefit since the GIL isn't the bottleneck.",
            },
          ],
          explanation:
            "Internal tools and one-shot scripts favor the simplest model that works. ThreadPoolExecutor wrapping sync subprocess calls is three lines and gets near-optimal speedup. Reach for asyncio when N is large enough or the codebase is already async.",
        },
        {
          kind: "key_insight",
          label: "Pattern recognition over rule memorization",
          insight: `Notice the questions you actually asked across these scenarios: **(1) Is the work I/O or CPU?** **(2) Are async libs available?** **(3) How many concurrent ops?** **(4) One-shot or long-lived?** **(5) Is there mixed work that needs a hybrid?** Those five questions resolve almost every concurrency decision. Memorize the questions, not the answers.`,
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 9. Recap
    // ─────────────────────────────────────────────────────────────────────
    {
      title: "Recap",
      blocks: [
        {
          kind: "prose",
          markdown: `The decision framework, compressed:

1. **Classify the workload first.** \`process_time / perf_counter\` ≈ 0 → I/O. ≈ 1 → CPU. Mixed → identify the dominant part.
2. **CPU-bound in pure Python?** \`ProcessPoolExecutor\`. Use \`initializer=\` for heavy per-worker state. Use \`chunksize=\` if per-call work is < 100ms.
3. **I/O-bound with async libs available?** asyncio. \`Semaphore\` for rate limits, \`TaskGroup\` (3.11+) or \`gather(return_exceptions=True)\` for fan-out.
4. **I/O-bound with sync libs?** \`ThreadPoolExecutor(10–50)\`. Don't exceed a few hundred workers.
5. **Mixed workload?** asyncio orchestrates, \`asyncio.to_thread\` bridges to one-off sync calls, \`loop.run_in_executor(process_pool, ...)\` dispatches CPU work.
6. **GIL escape hatches** — \`hashlib\`, \`zlib\`, NumPy, PIL, PyTorch tensor ops, every blocking syscall. These let threads parallelize "CPU-looking" work.
7. **When in doubt, profile.** \`cProfile\` and \`py-spy\` tell the truth; intuition lies.

You don't need to memorize every API surface. The two prior topics covered the mechanics; this topic is about **picking the right hammer for the nail in front of you**.`,
        },
        {
          kind: "flashcard",
          front: "Decision framework in one sentence: how do you pick a Python concurrency model?",
          back: "**Classify the workload (I/O vs CPU), then pick: CPU → processes; I/O + async libs → asyncio; I/O + sync libs → threads. Mix with `asyncio.to_thread` and `run_in_executor` when parts differ.** Everything else is refinement.",
        },
        {
          kind: "flashcard",
          front: "What's the single most important diagnostic before picking a concurrency model?",
          back: "Measure `time.perf_counter()` (wall) vs `time.process_time()` (CPU) on one item. Ratio near 0 = I/O-bound (asyncio/threads). Ratio near 1 = CPU-bound on one core (processes). Or watch CPU% in `top` while it runs. Without this, you're guessing.",
        },
        {
          kind: "flashcard",
          front: "What's the biggest reason a Python concurrency choice goes wrong in production?",
          back: "Misclassifying CPU-bound work as I/O-bound (or vice versa) — leading to threads or asyncio applied to CPU work (no speedup, sometimes worse) or processes applied to I/O work (pickling overhead with no benefit). Always measure before parallelizing.",
        },
        {
          kind: "flashcard",
          front: "When does the hybrid pattern (asyncio + executors) win?",
          back: "When the pipeline has distinct phases — async I/O orchestration + occasional blocking sync calls (`asyncio.to_thread`) or CPU-bound steps (`loop.run_in_executor(process_pool, ...)`). Common shape: async fan-out over many docs, with embedding compute dispatched to a ProcessPool. asyncio is the conductor; executors handle the awkward bits.",
        },
        {
          kind: "flashcard",
          front: "What does the GIL imply for concurrency model choice?",
          back: "(1) Pure-Python CPU work doesn't parallelize across threads — use processes. (2) I/O calls release the GIL — threads (and asyncio) can multiplex I/O. (3) Some C extensions (hashlib, NumPy, zlib, PIL) release the GIL voluntarily — threads can parallelize their compute. (4) Processes each have their own GIL, so they bypass the issue entirely.",
        },
      ],
    },
  ],
};
