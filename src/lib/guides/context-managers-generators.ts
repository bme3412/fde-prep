import type { StudyGuide } from "../guide-types";

export const contextManagersGeneratorsGuide: StudyGuide = {
  topicTitle: "Context managers & generators",
  topicSlug: "context-managers-generators",
  sections: [
    // ================================================================
    // 1. The with statement
    // ================================================================
    {
      title: "The with statement",
      blocks: [
        {
          kind: "prose",
          markdown: `\`with\` is Python's answer to "I need this thing set up, used, and then *always* torn down — even if an exception happens in the middle." Open files, acquired locks, database transactions, started timers, streaming HTTP responses — anywhere you have a setup/teardown pair, a context manager is the right shape.

\`\`\`python
with open("data.jsonl") as f:
    for line in f:
        ...
# f.close() has already been called by here — even if the loop raised.
\`\`\`

Any object that implements two dunder methods is a context manager:

- **\`__enter__(self)\`** — runs at the top of the \`with\` block. Whatever it returns becomes the variable after \`as\`.
- **\`__exit__(self, exc_type, exc_val, exc_tb)\`** — runs when the block exits, **no matter how**. If the block raised, the three \`exc_*\` args describe the exception; if it exited normally, they're all \`None\`. Return truthy to **suppress** the exception (rare); return falsy (or \`None\`, the default) to let it propagate.

The desugaring is concrete and worth memorizing:

\`\`\`python
# with cm as x:    is equivalent to:
#     body

mgr = cm
x = mgr.__enter__()
try:
    body
finally:
    mgr.__exit__(*sys.exc_info())  # or (None, None, None) on clean exit
\`\`\`

The \`try/finally\` is why cleanup runs even on exceptions — you can't accidentally forget it. That's the whole reason this construct exists.`,
        },
        {
          kind: "code_predict",
          label: "__enter__ return value becomes the as-variable",
          code: `class Greeter:
    def __enter__(self):
        print("entering")
        return "hello"

    def __exit__(self, *exc):
        print("exiting")
        return False

with Greeter() as msg:
    print(msg)`,
          output: "entering\nhello\nexiting",
          explanation:
            "`__enter__` runs first and its return value (here `'hello'`) is bound to the `as` variable. The body runs. Then `__exit__` runs unconditionally. Note that the *object itself* isn't required to be what `__enter__` returns — `open()` returns the file, but you could return a tuple, a different object, or nothing (None).",
          runnable: true,
        },
        {
          kind: "code_predict",
          label: "__exit__ runs even on exception",
          code: `class Trace:
    def __enter__(self):
        print("enter")
        return self

    def __exit__(self, exc_type, exc, tb):
        print(f"exit, exc_type={exc_type.__name__ if exc_type else None}")
        return False  # don't suppress

try:
    with Trace():
        print("body")
        raise RuntimeError("boom")
except RuntimeError as e:
    print(f"caught: {e}")`,
          output: "enter\nbody\nexit, exc_type=RuntimeError\ncaught: boom",
          explanation:
            "Even when the body raises, `__exit__` runs — that's the contract. `exc_type` is the exception class (`RuntimeError`), `exc` is the instance, `tb` is the traceback. Returning falsy from `__exit__` lets the exception propagate out of the `with`; the outer `try/except` catches it. This is exactly the behavior you want for resource cleanup: the file always closes, even when something blew up mid-loop.",
          runnable: true,
        },
        {
          kind: "code_predict",
          label: "returning True from __exit__ suppresses",
          code: `class Suppress:
    def __exit__(self, exc_type, exc, tb):
        return exc_type is ValueError

    def __enter__(self):
        return self

with Suppress():
    raise ValueError("oops")

print("survived")`,
          output: "survived",
          explanation:
            "Returning a truthy value from `__exit__` swallows the exception. The stdlib `contextlib.suppress(ValueError)` is exactly this pattern. **Use sparingly** — silently eating exceptions is a great way to hide bugs. The legitimate use cases are narrow: opt-in 'best-effort' cleanup, the `suppress` helper for ignoring expected races (e.g. removing a file that may not exist).",
          runnable: true,
        },
        {
          kind: "method_ref",
          title: "Context manager protocol",
          importLine: "# Any class can implement these two methods.",
          methods: [
            {
              signature: "__enter__(self)",
              description:
                "Called at the top of `with`. Return value is bound to the `as` target. Often returns `self`, but doesn't have to.",
            },
            {
              signature: "__exit__(self, exc_type, exc_val, exc_tb)",
              description:
                "Called when the block exits. Args are `(None, None, None)` on clean exit, or `(cls, instance, traceback)` if the body raised. Return truthy to suppress the exception.",
              returns: "bool | None",
            },
            {
              signature: "with cm1 as a, cm2 as b: ...",
              description:
                "Multiple context managers in one `with`. Equivalent to nested `with` blocks; `cm1.__exit__` runs after `cm2.__exit__`.",
            },
            {
              signature: "with (cm1 as a, cm2 as b): ...   # Python 3.10+",
              description:
                "Parenthesized form for splitting a long `with` across lines. Same semantics as the comma form.",
            },
          ],
        },
        {
          kind: "key_insight",
          label: "The mental model",
          insight: `\`with cm as x:\` is the **try/finally** you don't have to write. Any setup/teardown pair belongs in a context manager — files, locks, HTTP sessions, database transactions, timers, mocked-out globals in tests, temporary directories. If you find yourself writing \`try: ... finally: cleanup()\` more than once with the same cleanup, that's a context manager waiting to be extracted.`,
        },
        {
          kind: "flashcard",
          context: "with statement",
          front: "What does `with cm as x:` desugar to?",
          back: "`mgr = cm; x = mgr.__enter__(); try: body finally: mgr.__exit__(exc_type, exc_val, exc_tb)`. The `try/finally` is why cleanup is guaranteed.",
        },
        {
          kind: "flashcard",
          context: "with statement",
          front: "When does `__exit__` run?",
          back: "**Always** — on normal exit, on `return` from inside the block, on an exception. The four exception args are `(None, None, None)` on a clean exit.",
        },
        {
          kind: "flashcard",
          context: "with statement",
          front: "What happens if `__exit__` returns `True`?",
          back: "The exception that was propagating is **suppressed** (silently swallowed). Default is `None` (falsy), which lets the exception propagate.",
        },
      ],
    },

    // ================================================================
    // 2. contextlib — the generator-based shortcut
    // ================================================================
    {
      title: "contextlib.contextmanager",
      blocks: [
        {
          kind: "prose",
          markdown: `Writing \`__enter__\` and \`__exit__\` is fine for stateful objects, but for *one-shot* context managers — start a timer, set an env var, swap out a global — it's a lot of class boilerplate for what's really just "setup, yield, teardown". \`contextlib.contextmanager\` lets you write the same thing as a single generator function:

\`\`\`python
from contextlib import contextmanager
import time

@contextmanager
def timer(label):
    start = time.perf_counter()
    try:
        yield                       # <-- the body of \`with\` runs here
    finally:
        elapsed = time.perf_counter() - start
        print(f"{label}: {elapsed:.3f}s")

with timer("eval"):
    do_work()
\`\`\`

The pattern:

1. Code **before** \`yield\` runs at \`__enter__\` time.
2. The value you \`yield\` becomes the \`as\` variable. \`yield\` (no value) binds \`None\`.
3. Code **after** \`yield\` runs at \`__exit__\` time.
4. Wrap the yield in \`try/finally\` to guarantee cleanup runs on exceptions.

If the body raises, the exception is re-raised **at the \`yield\` line** inside the generator. Catch it there if you need to react; let it propagate to suppress nothing.

\`\`\`python
@contextmanager
def swallow(exc_type):
    try:
        yield
    except exc_type:
        pass  # suppress
\`\`\`

This is the same as a class \`__exit__\` returning \`True\` for that exception type — much terser to read.`,
        },
        {
          kind: "code_predict",
          label: "before-yield + after-yield ordering",
          code: `from contextlib import contextmanager

@contextmanager
def steps():
    print("1: before yield")
    yield "yielded value"
    print("3: after yield")

with steps() as v:
    print(f"2: body, got {v!r}")`,
          output: "1: before yield\n2: body, got 'yielded value'\n3: after yield",
          explanation:
            "The generator function runs top-down up to the `yield`. Then control jumps back to the `with` body. When the body ends, control returns to the generator at the line after `yield`. The yielded value becomes the `as` target. This is what `@contextmanager` is doing behind the scenes — wrapping a generator in a class that implements `__enter__`/`__exit__` for you.",
          runnable: true,
        },
        {
          kind: "code_predict",
          label: "exceptions resurface at yield",
          code: `from contextlib import contextmanager

@contextmanager
def trace():
    print("setup")
    try:
        yield
    except ValueError as e:
        print(f"caught at yield: {e}")
        # re-raise; we don't actually want to suppress
        raise
    finally:
        print("teardown")

try:
    with trace():
        raise ValueError("body raised")
except ValueError:
    print("caught outside")`,
          output:
            "setup\ncaught at yield: body raised\nteardown\ncaught outside",
          explanation:
            "When the `with` body raises, the exception is re-raised inside the generator *at the yield line*. You can catch it there to inspect or transform; you can suppress it by not re-raising; or you can let it propagate. `finally` runs after the except block regardless. This is more flexible than the class-based form because the cleanup logic and the exception handler can share local variables naturally.",
          runnable: true,
        },
        {
          kind: "code_comparison",
          label: "class form vs decorator form",
          left: {
            title: "Class-based __enter__/__exit__",
            code: `import time

class Timer:
    def __init__(self, label):
        self.label = label

    def __enter__(self):
        self.start = time.perf_counter()
        return self

    def __exit__(self, *exc):
        elapsed = time.perf_counter() - self.start
        print(f"{self.label}: {elapsed:.3f}s")
        return False`,
            annotation:
              "More ceremony, but useful when the context manager has methods you want to call on the `as` variable (e.g. `with timer as t: t.lap()`), or when you need state that outlives one use.",
          },
          right: {
            title: "@contextmanager decorator",
            code: `from contextlib import contextmanager
import time

@contextmanager
def timer(label):
    start = time.perf_counter()
    try:
        yield
    finally:
        elapsed = time.perf_counter() - start
        print(f"{label}: {elapsed:.3f}s")`,
            annotation:
              "Half the lines. The shape — 'setup, yield, teardown' — matches your mental model of the use case directly. Reach for this 90% of the time.",
          },
          takeaway:
            "Decorator form wins by default. Reach for the class form when you need methods on the manager, multiple `with` re-uses of the same instance, or a non-trivial amount of state.",
        },
        {
          kind: "method_ref",
          title: "contextlib essentials",
          importLine: "from contextlib import contextmanager, suppress, ExitStack, asynccontextmanager",
          methods: [
            {
              signature: "@contextmanager",
              description:
                "Turn a generator into a context manager. Generator must yield exactly once. Code before yield is enter; code after is exit.",
            },
            {
              signature: "suppress(*exceptions)",
              description:
                "Context manager that swallows the listed exceptions inside its block. Replaces noisy `try: ... except: pass` blocks.",
            },
            {
              signature: "ExitStack()",
              description:
                "Dynamic stack of context managers. Use when the number of managers isn't known at write time (e.g. opening N files from a list).",
            },
            {
              signature: "@asynccontextmanager",
              description:
                "Async version of `@contextmanager`. Used with `async with`. See the async section.",
            },
            {
              signature: "nullcontext(enter_result=None)",
              description:
                "A no-op context manager. Useful as a conditional placeholder: `cm = real_cm() if condition else nullcontext()`.",
            },
            {
              signature: "closing(thing)",
              description:
                "Wraps any object with a `.close()` method into a context manager that calls it on exit. For old-style APIs that have close() but no `__exit__`.",
            },
          ],
        },
        {
          kind: "code_predict",
          label: "ExitStack for dynamic managers",
          code: `from contextlib import ExitStack

class FakeFile:
    def __init__(self, name):
        self.name = name
    def __enter__(self):
        print(f"open {self.name}")
        return self
    def __exit__(self, *exc):
        print(f"close {self.name}")
        return False

with ExitStack() as stack:
    files = [stack.enter_context(FakeFile(n)) for n in ["a", "b", "c"]]
    print("body")`,
          output: "open a\nopen b\nopen c\nbody\nclose c\nclose b\nclose a",
          explanation:
            "`ExitStack` lets you push context managers dynamically. Each `enter_context(cm)` calls `cm.__enter__()` and registers `cm.__exit__` to run on stack unwind. Cleanup happens in LIFO order — the last manager opened is the first one closed. Use this when you have N managers determined at runtime: opening a variable list of files, holding several locks, layering decorators dynamically.",
          runnable: true,
        },
        {
          kind: "scenario_predict",
          label: "the @contextmanager constraint",
          scenario: `@contextmanager
def buggy():
    print("first")
    yield 1
    print("middle")
    yield 2
    print("last")

with buggy() as v:
    print(v)`,
          language: "python",
          question:
            "What goes wrong, and why? (One sentence each.)",
          answer:
            "Pydantic-style: it raises `RuntimeError: generator didn't stop`. A `@contextmanager` generator must yield exactly once — Python's contextlib advances the generator after the body and expects `StopIteration`; a second `yield` violates the contract.",
          explanation:
            "Mental model: one `yield` is the boundary between setup and teardown. Two `yield`s means there's no clear boundary, and contextlib raises a `RuntimeError` to tell you the contract was broken. If you need a generator with multiple yields, use a plain generator (next section), not a context manager.",
        },
        {
          kind: "flashcard",
          context: "@contextmanager",
          front: "How many times must a `@contextmanager` generator yield?",
          back: "**Exactly once.** Zero yields → `RuntimeError: generator didn't yield`. Two or more yields → `RuntimeError: generator didn't stop`.",
        },
        {
          kind: "flashcard",
          context: "@contextmanager",
          front: "Where does an exception in the `with` body resurface inside the generator?",
          back: "At the `yield` line. Use `try: yield except E: ...` to react to specific exception types; let them propagate to not suppress.",
        },
        {
          kind: "flashcard",
          context: "@contextmanager",
          front: "When do you reach for `ExitStack` over plain `with cm1, cm2:`?",
          back: "When the number of managers isn't known at write time — e.g. opening a list of files whose length is runtime-determined.",
        },
        {
          kind: "flashcard",
          context: "@contextmanager",
          front: "What is `contextlib.nullcontext()` for?",
          back: "A no-op stand-in. Lets you write `cm = real() if condition else nullcontext()` so a `with cm:` always works without branching.",
        },
      ],
    },

    // ================================================================
    // 3. Generators 101
    // ================================================================
    {
      title: "Generators 101",
      blocks: [
        {
          kind: "prose",
          markdown: `A generator function is any \`def\` containing \`yield\`. Calling it doesn't run the body — it returns a **generator object** that runs the body lazily, one \`yield\` at a time.

\`\`\`python
def counter(n):
    print(f"starting at {n}")
    while True:
        yield n
        n += 1

g = counter(10)          # body has NOT run yet
print(next(g))           # prints 'starting at 10', then yields 10
print(next(g))           # yields 11
print(next(g))           # yields 12
\`\`\`

Three properties that change how you write code once you internalize them:

1. **Lazy.** Nothing computes until you ask for the next value. Process a 10 GB file by iterating; never load it into a list.
2. **Stateful.** Local variables persist across yields. The generator pauses at \`yield\` and resumes on the next \`next()\`.
3. **Single-pass.** A generator is consumed once — once it's exhausted, it's done. If you need to iterate twice, wrap in \`list(...)\` or define a generator *function* that you call again to get a fresh iterator.

For an FDE, generators are the right shape for:

- **Streaming responses.** \`for event in stream:\` is iterating a generator. You don't buffer the whole response.
- **Pagination.** Hide the page-fetching loop behind a generator that yields one item at a time.
- **Pipelines.** Stack \`filter → transform → batch\` as composable generators that never materialize intermediate lists.
- **Bounded memory.** Process millions of rows with constant memory footprint.

The \`yield\` keyword turns "I am a function that returns one value" into "I am a function that pauses and resumes, producing a sequence of values."`,
        },
        {
          kind: "code_predict",
          label: "generator state persists across yields",
          code: `def fib():
    a, b = 0, 1
    while True:
        yield a
        a, b = b, a + b

g = fib()
print([next(g) for _ in range(7)])`,
          output: "[0, 1, 1, 2, 3, 5, 8]",
          explanation:
            "Each `next(g)` resumes the generator from where it last paused (at the `yield`). The local variables `a` and `b` persist across yields — the function is *paused*, not restarted. When the loop body runs again, it picks up with whatever `a` and `b` were when control left. This is what makes `fib` work without an explicit class with `self.a` and `self.b`.",
          runnable: true,
        },
        {
          kind: "code_predict",
          label: "exhaustion → StopIteration",
          code: `def three():
    yield "a"
    yield "b"
    yield "c"

g = three()
print(next(g), next(g), next(g))
try:
    next(g)
except StopIteration:
    print("done")`,
          output: "a b c\ndone",
          explanation:
            "When the generator function returns (implicitly at the end, or via a `return` statement), `next()` raises `StopIteration`. `for x in gen:` catches this automatically and exits the loop. You only see `StopIteration` when you call `next()` manually past the end. Generators are **single-pass**: once exhausted, calling `next(g)` raises `StopIteration` forever — there's no rewind.",
          runnable: true,
        },
        {
          kind: "code_comparison",
          label: "list comprehension vs generator expression",
          left: {
            title: "List — eager, materialized",
            code: `# Reads ALL lines into memory before filtering.
errors = [
    line for line in open("huge.log")
    if "ERROR" in line
]
print(len(errors))
# If the file is 10 GB, you just bought a 10 GB Python process.`,
            annotation:
              "Builds the full list before returning it. Memory usage scales with input size, not output size. Wrong choice when the input is large.",
          },
          right: {
            title: "Generator — lazy, streaming",
            code: `# Yields one line at a time; only the current line is in memory.
errors = (
    line for line in open("huge.log")
    if "ERROR" in line
)
for line in errors:
    process(line)
# Constant memory regardless of file size.`,
            annotation:
              "Parens instead of brackets. Same syntax, lazy semantics. Iterates once. Compose with other generators / `sum`/`max`/`any`/`all` without ever materializing the intermediate.",
          },
          takeaway:
            "Default to generator expressions for any chain of filter/map steps over a large source. Switch to a list comprehension only when you need to iterate the result more than once or index into it.",
        },
        {
          kind: "code_predict",
          label: "pipeline of generators",
          code: `def read_lines():
    yield "INFO ok"
    yield "ERROR boom"
    yield "INFO done"
    yield "ERROR crash"

def only_errors(lines):
    for line in lines:
        if "ERROR" in line:
            yield line

def first_word(lines):
    for line in lines:
        yield line.split()[0]

pipeline = first_word(only_errors(read_lines()))
print(list(pipeline))`,
          output: "['ERROR', 'ERROR']",
          explanation:
            "Each generator wraps the previous one and yields the transformed stream lazily. Nothing computes until `list(pipeline)` pulls values through. Memory is bounded — at any moment, only one line is being processed across the whole pipeline. This is how you build streaming data pipelines in stdlib Python; no need for a framework.",
          runnable: true,
        },
        {
          kind: "method_ref",
          title: "Generator builtins & idioms",
          importLine: "# Stdlib",
          methods: [
            {
              signature: "def gen(): yield x",
              description:
                "Any function with `yield` becomes a generator function. Calling it returns a generator object; the body doesn't run yet.",
            },
            {
              signature: "next(g) / next(g, default)",
              description:
                "Pull the next value. Raises StopIteration when exhausted. The two-arg form returns `default` instead of raising.",
            },
            {
              signature: "for x in g: ...",
              description:
                "Idiomatic consumption — calls `next(g)` until StopIteration is raised, then exits cleanly.",
            },
            {
              signature: "(expr for x in src if cond)",
              description:
                "Generator expression. Like a list comprehension but lazy and one-pass. Use as a function arg without extra parens: `sum(x*x for x in nums)`.",
            },
            {
              signature: "g.send(value)",
              description:
                "Resume the generator and inject `value` as the result of the current `yield` expression. The coroutine pattern. Rarely used today — async/await replaces most uses.",
            },
            {
              signature: "g.throw(ExcType)",
              description:
                "Raise an exception at the current `yield` line. Used by frameworks (asyncio, contextlib); rarely written by hand.",
            },
            {
              signature: "g.close()",
              description:
                "Inject `GeneratorExit` at the `yield`. Causes any `try/finally` to run. Happens automatically when the generator is garbage-collected.",
            },
          ],
        },
        {
          kind: "scenario_predict",
          label: "single-pass exhaustion",
          scenario: `g = (x * 2 for x in [1, 2, 3])
total1 = sum(g)
total2 = sum(g)
print(total1, total2)`,
          language: "python",
          question: "What does this print? Why?",
          answer:
            "`12 0`. The first `sum(g)` exhausts the generator; the second `sum(g)` gets nothing because the generator has no rewind.",
          explanation:
            "This is the canonical generator gotcha. Generators are single-pass — once iterated to exhaustion, they yield no more values. If you need to iterate twice, either materialize to a list (`vals = list(g); sum(vals); sum(vals)`) or define a generator *function* and call it twice to get two fresh iterators. The 'function vs object' distinction: `gen_fn()` returns a fresh generator object each call.",
        },
        {
          kind: "key_insight",
          label: "When to reach for a generator",
          insight: `Three signals:

1. **The input is big.** Streaming a file, paginated API, multi-GB JSON — anywhere materializing the whole thing would blow up memory.
2. **You want composability.** Pipelines of \`filter → map → batch\` read top-down and require no intermediate lists.
3. **Production is asynchronous.** Streaming HTTP responses, server-sent events, async iteration — all generator-shaped. You'll write \`async for event in stream:\` constantly.

If none of those apply, a regular function returning a list is fine. Don't generator-ify everything; the lazy semantics also make stack traces longer and exceptions harder to localize.`,
        },
        {
          kind: "flashcard",
          context: "Generators 101",
          front: "What does calling a generator function do?",
          back: "**Nothing happens yet.** It returns a generator *object* whose body runs lazily on each `next()`. The first line of code in the function doesn't execute until you ask for a value.",
        },
        {
          kind: "flashcard",
          context: "Generators 101",
          front: "How do you iterate a generator twice?",
          back: "You can't — they're single-pass. Either materialize once with `list(g)` and reuse the list, or define a generator function and call it twice to get two fresh iterators.",
        },
        {
          kind: "flashcard",
          context: "Generators 101",
          front: "List comprehension vs generator expression syntax?",
          back: "`[x for x in src]` (list, eager). `(x for x in src)` (generator, lazy). Inside a function call you can drop the parens: `sum(x*x for x in nums)`.",
        },
        {
          kind: "flashcard",
          context: "Generators 101",
          front: "What signal tells `for` to stop iterating?",
          back: "The generator raises `StopIteration` (implicit on reaching the end of the function, or via an explicit `return`). `for` catches it and exits the loop.",
        },
      ],
    },

    // ================================================================
    // 4. yield from
    // ================================================================
    {
      title: "yield from — delegation",
      blocks: [
        {
          kind: "prose",
          markdown: `\`yield from\` is the "I want to delegate this section of my generator to another iterable" operator. Without it, you write:

\`\`\`python
def outer():
    yield "header"
    for x in inner():
        yield x
    yield "footer"
\`\`\`

With it, you write:

\`\`\`python
def outer():
    yield "header"
    yield from inner()
    yield "footer"
\`\`\`

Same result for the simple case. But \`yield from\` does **more** than the equivalent \`for\` loop:

1. It forwards \`.send()\`, \`.throw()\`, and \`.close()\` to the delegated generator, so co-routine semantics work transparently.
2. It propagates the delegated generator's \`return\` value as the value of the \`yield from\` expression itself (\`value = yield from sub()\`).
3. It composes cleanly — \`yield from\` chains are flat to read and debug.

The most common everyday use is **flattening**:

\`\`\`python
def flatten(nested):
    for item in nested:
        if isinstance(item, list):
            yield from flatten(item)  # recurse
        else:
            yield item

list(flatten([1, [2, [3, 4]], 5]))   # [1, 2, 3, 4, 5]
\`\`\`

And **iterable chaining**, which is what \`itertools.chain\` does:

\`\`\`python
def chain(*iterables):
    for it in iterables:
        yield from it
\`\`\``,
        },
        {
          kind: "code_predict",
          label: "yield from flattening",
          code: `def flatten(nested):
    for item in nested:
        if isinstance(item, list):
            yield from flatten(item)
        else:
            yield item

print(list(flatten([1, [2, [3, [4, 5]]], 6])))`,
          output: "[1, 2, 3, 4, 5, 6]",
          explanation:
            "Recursive flattening reads beautifully with `yield from`. The non-recursive version would need an explicit stack and a loop — much harder to follow. Each call to `flatten` returns a generator, and `yield from` plugs its output directly into the outer generator's stream. The recursion is lazy: nothing materializes until the consumer pulls.",
          runnable: true,
        },
        {
          kind: "code_predict",
          label: "yield from preserves return value",
          code: `def collect_and_return(n):
    total = 0
    for i in range(n):
        yield i
        total += i
    return total  # generator return -> captured by 'yield from'

def driver():
    result = yield from collect_and_return(4)
    yield f"total was {result}"

print(list(driver()))`,
          output: "[0, 1, 2, 3, 'total was 6']",
          explanation:
            "A generator's `return value` is normally invisible — `for` loops never see it. But `yield from sub_gen()` captures the inner generator's return value as the value of the `yield from` expression itself. This is how PEP 380 lets you use generators as lightweight coroutines: child gen returns a result; parent gen receives it via `value = yield from child()`. Async/await later replaced most of this pattern, but `yield from` remains the cleanest way to delegate a chunk of iteration.",
          runnable: true,
        },
        {
          kind: "code_comparison",
          label: "manual loop vs yield from",
          left: {
            title: "Manual relay (works, but verbose)",
            code: `def stream_then_summary(lines, summary):
    for line in lines:
        yield line
    for s in summary:
        yield s

# Doesn't forward .send/.throw/.close to the inner
# generators correctly if you ever need them.`,
            annotation:
              "Repetitive. Doesn't transparently forward coroutine methods. Each inner generator's `return` value is silently discarded.",
          },
          right: {
            title: "yield from (idiomatic)",
            code: `def stream_then_summary(lines, summary):
    yield from lines
    yield from summary

# Forwards send/throw/close. Captures return values.
# Reads like 'splice these iterables into my output'.`,
            annotation:
              "Half the code. Correct semantics for coroutine-style use. Reads as 'inline this iterable into my output stream'.",
          },
          takeaway:
            "If you find yourself writing `for x in sub_iter: yield x`, replace it with `yield from sub_iter`. Always more correct, always more readable.",
        },
        {
          kind: "code_predict",
          label: "chaining with yield from",
          code: `def merge(*streams):
    for s in streams:
        yield from s

result = list(merge([1, 2], (3, 4), range(5, 8)))
print(result)`,
          output: "[1, 2, 3, 4, 5, 6, 7]",
          explanation:
            "`yield from` works on any iterable — lists, tuples, ranges, other generators, file objects. This `merge` is a hand-rolled version of `itertools.chain`. The composability is the whole point: one generator can splice in any number of other iterables without manually re-yielding their elements.",
          runnable: true,
        },
        {
          kind: "method_ref",
          title: "yield from",
          importLine: "# Built-in syntax",
          methods: [
            {
              signature: "yield from iterable",
              description:
                "Splice the iterable into the surrounding generator's output stream. Works with any iterable, not just generators.",
            },
            {
              signature: "value = yield from sub_generator()",
              description:
                "Captures the sub-generator's `return value` as the expression value. Only meaningful when the inner is a generator that does `return x`.",
            },
            {
              signature: "yield from <send/throw/close forwarded>",
              description:
                "Coroutine methods called on the outer generator are transparently forwarded to the inner. Matters for libraries like asyncio (pre-async/await) and contextlib internals.",
            },
          ],
        },
        {
          kind: "flashcard",
          context: "yield from",
          front: "What's wrong with `for x in inner(): yield x`?",
          back: "It works for plain iteration, but doesn't forward `.send/.throw/.close` to the inner generator and discards its `return` value. Use `yield from inner()` instead.",
        },
        {
          kind: "flashcard",
          context: "yield from",
          front: "What does `value = yield from sub()` capture?",
          back: "The sub-generator's `return value` (from `return x` inside `sub`). Plain `for x in sub():` would discard it; `yield from` exposes it as the expression value.",
        },
        {
          kind: "flashcard",
          context: "yield from",
          front: "Can `yield from` accept a list or only a generator?",
          back: "Any **iterable** — list, tuple, range, set, dict, file object, generator. The coroutine-forwarding behavior only matters when the source is a generator.",
        },
      ],
    },

    // ================================================================
    // 5. Async generators & async context managers
    // ================================================================
    {
      title: "Async generators & async context managers",
      blocks: [
        {
          kind: "prose",
          markdown: `Streaming an Anthropic response is the canonical example of both async patterns at once:

\`\`\`python
async with client.messages.stream(...) as stream:    # async context manager
    async for event in stream:                       # async iteration
        ...
\`\`\`

That single block uses **\`async with\`** (an async context manager — \`__aenter__\`/\`__aexit__\` are coroutines) and **\`async for\`** (an async iterator — \`__aiter__\`/\`__anext__\` are coroutines or return awaitables). Both exist for the same reason: setup, teardown, or "wait for the next item" might need to await network I/O.

**Async generators** are how you write your own async iterables:

\`\`\`python
import asyncio

async def slow_count(n):
    for i in range(n):
        await asyncio.sleep(0.1)
        yield i

async def main():
    async for x in slow_count(3):
        print(x)

asyncio.run(main())
\`\`\`

The rules:

1. \`async def\` containing \`yield\` is an **async generator function**. Calling it returns an async generator object.
2. You iterate with \`async for\`, **not** plain \`for\`. Each step awaits \`__anext__\`.
3. \`await\` is allowed between yields; that's the whole reason async generators exist (mix awaitable work with yielding).
4. **Don't \`yield from\`** an async generator — that's a syntax error. Loop with \`async for x in inner(): yield x\` instead (or wait for PEP 525's recommendations).

**Async context managers** mirror the sync version with async dunders:

\`\`\`python
from contextlib import asynccontextmanager

@asynccontextmanager
async def session():
    s = await open_session()        # awaitable setup
    try:
        yield s
    finally:
        await s.close()             # awaitable teardown

async def main():
    async with session() as s:
        await s.fetch("/data")
\`\`\`

The \`@asynccontextmanager\` decorator is the async analog of \`@contextmanager\` — same "setup, yield, teardown" shape, but the body runs in an async function and can \`await\`.`,
        },
        {
          kind: "code_comparison",
          label: "sync iteration vs async iteration",
          left: {
            title: "Sync — plain generator",
            code: `def counter(n):
    for i in range(n):
        yield i

for x in counter(3):
    print(x)`,
            annotation:
              "Each `next` is a synchronous call. No I/O between yields (or if there is, it blocks the thread).",
          },
          right: {
            title: "Async — async generator",
            code: `import asyncio

async def counter(n):
    for i in range(n):
        await asyncio.sleep(0)  # cooperative yield to the loop
        yield i

async def main():
    async for x in counter(3):
        print(x)

asyncio.run(main())`,
            annotation:
              "Each `__anext__` is awaited. The generator can `await` I/O between yields without blocking the event loop. Required when you're streaming an HTTP response.",
          },
          takeaway:
            "Sync generators: yield, no await. Async generators: yield, await freely between yields. The choice depends on whether you do I/O between yields.",
        },
        {
          kind: "code_predict",
          label: "async generator basic flow",
          code: `import asyncio

async def gen():
    yield "a"
    yield "b"
    yield "c"

async def main():
    async for x in gen():
        print(x)
    print("done")

asyncio.run(main())`,
          output: "a\nb\nc\ndone",
          explanation:
            "Mechanics: `gen()` returns an async generator object; `async for` pulls values via `__anext__` (awaitable) until `StopAsyncIteration` is raised. Even with no awaits inside the generator, you still must iterate with `async for` and run inside `asyncio.run()` — the async generator protocol is async-flavored end to end. (This snippet is intentionally non-runnable in the playground because Pyodide's stdout capture may not flush cleanly from inside `asyncio.run`.)",
        },
        {
          kind: "code_predict",
          label: "@asynccontextmanager pattern",
          code: `import asyncio
from contextlib import asynccontextmanager

@asynccontextmanager
async def lock():
    print("acquire")
    try:
        yield "the resource"
    finally:
        print("release")

async def main():
    async with lock() as r:
        print(f"using {r}")

asyncio.run(main())`,
          output: "acquire\nusing the resource\nrelease",
          explanation:
            "Identical shape to the sync `@contextmanager`: setup, yield, teardown. The decorator function is `async def`, and you use `async with` instead of `with`. This is how you write context managers for streaming clients, database sessions, or anything where the setup/teardown does I/O. The Anthropic SDK's `client.messages.stream(...)` is built on top of exactly this pattern.",
        },
        {
          kind: "code_predict",
          label: "delegating from an async generator",
          code: `import asyncio

async def inner():
    yield 1
    yield 2

async def outer():
    yield 0
    async for x in inner():   # NOT 'yield from inner()' — that's a SyntaxError
        yield x
    yield 3

async def main():
    print([x async for x in outer()])

asyncio.run(main())`,
          output: "[0, 1, 2, 3]",
          explanation:
            "`yield from` is **not** valid inside `async def`. To delegate to a sub-async-generator, you must explicitly loop: `async for x in inner(): yield x`. The async-list-comprehension `[x async for x in outer()]` is the async version of `list(outer())`. The mental model: async generators are 'newer' than `yield from`, and the syntax was never extended to cover the async case (PEP 525 deliberately left it out).",
        },
        {
          kind: "method_ref",
          title: "Async iteration / context protocol",
          importLine: "from contextlib import asynccontextmanager\nimport asyncio",
          methods: [
            {
              signature: "async def gen(): yield x",
              description:
                "An async generator function. Calling it returns an async iterator. Body can `await` between yields.",
            },
            {
              signature: "async for x in agen: ...",
              description:
                "Async iteration. Each step awaits `__anext__`. Required for async generators; sync `for` won't work.",
            },
            {
              signature: "__aenter__ / __aexit__",
              description:
                "Async context manager protocol. Both are coroutines (or return awaitables). Used with `async with`.",
            },
            {
              signature: "@asynccontextmanager",
              description:
                "Async analog of `@contextmanager`. Decorates an async generator that yields exactly once.",
            },
            {
              signature: "[x async for x in agen]",
              description:
                "Async list comprehension. Equivalent to materializing the async iterator. Also `(x async for x in agen)` for an async generator expression.",
            },
            {
              signature: "anext(agen) / anext(agen, default)",
              description:
                "Async equivalent of `next()`. Returns an awaitable. Available since Python 3.10.",
            },
          ],
        },
        {
          kind: "scenario_predict",
          label: "the Anthropic streaming idiom",
          scenario: `import anthropic
client = anthropic.AsyncAnthropic()

async def stream_response(prompt):
    async with client.messages.stream(
        model="claude-opus-4-5",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        async for event in stream:
            yield event`,
          language: "python",
          question:
            "Why does this combine `async with` and `async for`? What would break if you used plain `with` or plain `for`?",
          answer:
            "`async with` is required because `__aenter__`/`__aexit__` do network I/O (opening and closing the streaming HTTP connection). `async for` is required because each event arrives over the wire — pulling the next one might need to await a socket read. Plain `with`/`for` would error: the stream object's protocols are async-only.",
          explanation:
            "This is the canonical async pattern in Anthropic FDE work, and it's why mastering both forms matters. The function itself is an async generator (`async def` + `yield`) that wraps the SDK's async stream — useful when you want to attach extra processing (filtering, logging, metric collection) without breaking the streaming model. Note the function's caller iterates with `async for` too: the async-ness propagates all the way up to wherever you actually consume tokens.",
        },
        {
          kind: "key_insight",
          label: "Streaming = generators + async, all the way down",
          insight: `Every streaming API you'll touch as an FDE — Anthropic's \`messages.stream\`, SSE feeds, paginated APIs, websocket subscriptions — uses async generators and async context managers. The protocol stack is:

- \`async with stream() as s:\` — opens the connection, schedules cleanup.
- \`async for chunk in s:\` — pulls one delta at a time, awaiting network I/O.
- Your own \`async def + yield\` lets you splice processing in between without breaking laziness.

If you understand the four pieces — \`with\`, \`@contextmanager\`, generators, \`async for\` — async streaming code reads as ordinary, top-down Python.`,
        },
        {
          kind: "flashcard",
          context: "Async generators & context",
          front: "How do you iterate an async generator?",
          back: "`async for x in agen:` (inside an `async def`). Plain `for` raises TypeError because async generators implement `__aiter__`, not `__iter__`.",
        },
        {
          kind: "flashcard",
          context: "Async generators & context",
          front: "Can you `yield from` an async generator?",
          back: "**No** — `SyntaxError`. Loop explicitly with `async for x in inner(): yield x` instead. PEP 525 intentionally didn't extend `yield from` to the async case.",
        },
        {
          kind: "flashcard",
          context: "Async generators & context",
          front: "Which dunders does an async context manager implement?",
          back: "`__aenter__` and `__aexit__`. Both are coroutines (or return awaitables). Used with `async with`, not `with`.",
        },
        {
          kind: "flashcard",
          context: "Async generators & context",
          front: "What's the async analog of `@contextmanager`?",
          back: "`@asynccontextmanager` (also from `contextlib`). Decorates an `async def` generator that yields exactly once. Used with `async with`.",
        },
      ],
    },

    // ================================================================
    // 6. Recap
    // ================================================================
    {
      title: "Recap",
      blocks: [
        {
          kind: "prose",
          markdown: `Mental checklist:

1. **\`with cm as x:\`** is the try/finally you don't have to write. Implement \`__enter__\`/\`__exit__\` for stateful objects.
2. **\`@contextmanager\`** for one-shot setup/teardown — terser than the class form. Generator must yield exactly once.
3. **Generators** for lazy iteration: streaming files, paginated APIs, transform pipelines. Single-pass, stateful, composable.
4. **\`yield from iterable\`** to splice another iterable into your generator's output. Always cleaner than \`for x in inner(): yield x\`.
5. **Async generators** (\`async def\` + \`yield\`, iterated with \`async for\`) when you need to await I/O between yields.
6. **\`@asynccontextmanager\`** for setup/teardown that itself does I/O — the streaming Anthropic SDK pattern.

The mental model unifying all five: \`yield\` is a pause point in a function. Sometimes that pause produces a value (\`generator\`), sometimes it marks the boundary between setup and teardown (\`@contextmanager\`), and sometimes it does both in an async context (streaming clients). The keyword is the same; the surrounding machinery decides what the pause means.`,
        },
        {
          kind: "flashcard",
          context: "Recap",
          front: "Two dunders for the sync context-manager protocol?",
          back: "`__enter__` (returns the `as` value) and `__exit__(exc_type, exc_val, exc_tb)` (return truthy to suppress).",
        },
        {
          kind: "flashcard",
          context: "Recap",
          front: "Two dunders for the async context-manager protocol?",
          back: "`__aenter__` and `__aexit__`. Both are coroutines. Used with `async with`.",
        },
        {
          kind: "flashcard",
          context: "Recap",
          front: "How many times must a `@contextmanager` generator yield?",
          back: "**Exactly once.** Zero or two+ raises `RuntimeError` at runtime.",
        },
        {
          kind: "flashcard",
          context: "Recap",
          front: "When do you reach for a generator over a list?",
          back: "Big inputs (don't materialize), composable pipelines (filter→map→batch), or streaming I/O (async or otherwise). When iterating once is enough.",
        },
        {
          kind: "flashcard",
          context: "Recap",
          front: "The canonical Anthropic streaming pattern in one line?",
          back: "`async with client.messages.stream(...) as stream: async for event in stream: ...` — async context manager + async iteration.",
        },
      ],
    },
  ],
};
