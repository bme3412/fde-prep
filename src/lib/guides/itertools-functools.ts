import type { StudyGuide } from "../guide-types";

export const itertoolsFunctoolsGuide: StudyGuide = {
  topicTitle: "itertools & functools patterns",
  topicSlug: "itertools-functools-patterns",
  sections: [
    // ================================================================
    // 1. Why itertools and functools matter
    // ================================================================
    {
      title: "Why itertools and functools matter",
      blocks: [
        {
          kind: "prose",
          markdown: `When you work with LLM outputs, you constantly deal with **batches**: lists of messages, groups of results, combinations of parameters to sweep. You end up writing nested loops, manual accumulators, and repetitive transformations.

Python's \`itertools\` and \`functools\` modules give you composable building blocks that replace those hand-rolled loops. The code gets shorter, but more importantly, it gets **declarative** — you say *what* you want, not *how* to loop.

This guide covers the patterns that come up most often in real work:

- **itertools**: \`chain\`, \`groupby\`, \`product\`, \`combinations\`, \`islice\`, \`starmap\`, \`batched\`
- **functools**: \`lru_cache\`, \`partial\`, \`reduce\`

Let's start with the most common one.`,
        },
      ],
    },

    // ================================================================
    // 2. chain: flattening nested lists
    // ================================================================
    {
      title: "chain: flattening nested lists",
      blocks: [
        {
          kind: "prose",
          markdown: `You have several lists and want to iterate over all their items as if they were one big list. The manual way is to nest loops or concatenate with \`+\`. \`itertools.chain\` does this cleanly:`,
        },
        {
          kind: "code_comparison",
          label: "concatenating lists",
          left: {
            title: "Manual concatenation",
            code: `batch_1 = ["msg_a", "msg_b"]
batch_2 = ["msg_c"]
batch_3 = ["msg_d", "msg_e"]

all_msgs = batch_1 + batch_2 + batch_3
for msg in all_msgs:
    process(msg)`,
            annotation: "Creates a new list in memory",
          },
          right: {
            title: "itertools.chain",
            code: `from itertools import chain

batch_1 = ["msg_a", "msg_b"]
batch_2 = ["msg_c"]
batch_3 = ["msg_d", "msg_e"]

for msg in chain(batch_1, batch_2, batch_3):
    process(msg)`,
            annotation: "Lazy — never builds the combined list",
          },
          takeaway:
            "chain doesn't copy anything. It yields items from the first iterable until it's exhausted, then moves to the next. With large batches, this saves memory.",
        },
        {
          kind: "code_predict",
          label: "chain basics",
          code: `from itertools import chain

a = [1, 2, 3]
b = [4, 5]
c = [6]

result = list(chain(a, b, c))
print(result)
print(len(result))`,
          output: `[1, 2, 3, 4, 5, 6]\n6`,
          explanation: `chain yields 1, 2, 3 from \`a\`, then 4, 5 from \`b\`, then 6 from \`c\`. Wrapping in list() materializes all the items. The total length is 3 + 2 + 1 = 6.`,
        },
        {
          kind: "prose",
          markdown: `There's a variant called \`chain.from_iterable\` for when your sublists are already inside a container:`,
        },
        {
          kind: "code_predict",
          label: "chain.from_iterable",
          code: `from itertools import chain

batches = [[1, 2], [3, 4], [5]]
result = list(chain.from_iterable(batches))
print(result)`,
          output: `[1, 2, 3, 4, 5]`,
          explanation: `chain.from_iterable takes a single iterable of iterables and flattens one level. It's the same as chain(*batches) but doesn't unpack everything at once — useful when you have many sublists or they come from a generator.`,
        },
        {
          kind: "warm_up",
          title: "chain vs +",
          prompt:
            "What's the key practical difference between `list_a + list_b` and `chain(list_a, list_b)`?",
          answer: "chain is lazy — it doesn't create a new list in memory",
          explanation:
            "The + operator creates a brand new list containing all elements. chain yields items one at a time from each input without allocating a combined list. For large inputs, this matters.",
        },
        {
          kind: "key_insight",
          label: "When to use chain",
          insight: `Use \`chain\` whenever you want to treat multiple iterables as one continuous stream. Common cases:
- Flattening batched API results: \`chain.from_iterable(batch_results)\`
- Combining results from multiple sources: \`chain(db_results, cache_results)\`
- Prepending or appending items: \`chain(["header"], rows)\``,
        },
      ],
    },

    // ================================================================
    // 3. islice: taking a slice of any iterator
    // ================================================================
    {
      title: "islice: taking a slice of any iterator",
      blocks: [
        {
          kind: "prose",
          markdown: `You can slice a list with \`my_list[:10]\`, but you can't slice a generator or iterator that way — generators don't support indexing. \`itertools.islice\` works on anything iterable:`,
        },
        {
          kind: "code_predict",
          label: "islice basics",
          code: `from itertools import islice

def infinite_ids():
    n = 0
    while True:
        yield f"id_{n}"
        n += 1

first_five = list(islice(infinite_ids(), 5))
print(first_five)`,
          output: `['id_0', 'id_1', 'id_2', 'id_3', 'id_4']`,
          explanation: `infinite_ids() is a generator that never stops. islice(it, 5) takes the first 5 items and then stops pulling. Without islice, you'd loop forever.`,
        },
        {
          kind: "code_predict",
          label: "islice with start and step",
          code: `from itertools import islice

data = range(20)
# islice(iterable, start, stop, step)
result = list(islice(data, 5, 15, 3))
print(result)`,
          output: `[5, 8, 11, 14]`,
          explanation: `islice(data, 5, 15, 3) skips the first 5 items, then takes every 3rd item until index 15. It works like a slice [5:15:3] but on any iterable.`,
        },
        {
          kind: "warm_up",
          title: "islice use case",
          prompt:
            "You have a generator that yields log lines from a huge file. You want to preview just the first 20 lines. What do you write?",
          answer: "list(islice(log_lines, 20))",
          explanation:
            "islice(iterable, n) takes the first n items without reading the entire file into memory. Perfect for previewing large streams.",
        },
      ],
    },

    // ================================================================
    // 4. groupby: grouping sorted data
    // ================================================================
    {
      title: "groupby: grouping sorted data",
      blocks: [
        {
          kind: "prose",
          markdown: `\`itertools.groupby\` groups consecutive items that share the same key. The critical word is **consecutive** — it only groups items that are next to each other. If your data isn't sorted by the grouping key, you'll get duplicate groups.

This is different from SQL's GROUP BY, which groups all matching rows regardless of order. Python's groupby is more like the Unix \`uniq\` command — it only collapses adjacent duplicates.`,
        },
        {
          kind: "code_predict",
          label: "groupby on sorted data",
          code: `from itertools import groupby

scores = [
    ("Alice", 95), ("Alice", 87),
    ("Bob", 92), ("Bob", 88), ("Bob", 76),
    ("Carol", 91),
]

for name, group in groupby(scores, key=lambda x: x[0]):
    grades = [score for _, score in group]
    print(f"{name}: {grades}")`,
          output: `Alice: [95, 87]\nBob: [92, 88, 76]\nCarol: [91]`,
          explanation: `The data is already sorted by name. groupby walks through the list and starts a new group every time the key function's output changes. It yields (key_value, group_iterator) pairs. We convert each group iterator to a list of scores.`,
        },
        {
          kind: "code_predict",
          label: "the groupby trap — unsorted data",
          code: `from itertools import groupby

data = ["a", "a", "b", "a", "a"]
groups = [(k, list(g)) for k, g in groupby(data)]
print(groups)`,
          output: `[('a', ['a', 'a']), ('b', ['b']), ('a', ['a', 'a'])]`,
          explanation: `There are two separate "a" groups because the "a" items aren't all adjacent — there's a "b" in the middle. groupby only groups consecutive runs. If you wanted all "a" items together, you'd need to sort first.`,
        },
        {
          kind: "key_insight",
          label: "The groupby rule",
          insight: `**Always sort by the grouping key before calling groupby.** If you forget, you'll get duplicate groups instead of an error — a silent bug.

\`\`\`python
# CORRECT
data.sort(key=my_key)
for k, g in groupby(data, key=my_key):
    ...

# WRONG — may produce duplicate groups
for k, g in groupby(unsorted_data, key=my_key):
    ...
\`\`\`

If you need SQL-style "group everything regardless of order," use \`defaultdict(list)\` from the collections module instead.`,
        },
        {
          kind: "warm_up",
          title: "groupby prerequisite",
          prompt:
            "You have a list of dicts with a 'category' field, and you want to use groupby to group them by category. What must you do first?",
          answer: "Sort the list by the 'category' field",
          explanation:
            "groupby only groups consecutive items. If items with the same category aren't adjacent, you'll get multiple groups for the same category. Sorting ensures all items with the same key are next to each other.",
        },
        {
          kind: "mini_challenge",
          title: "Group API responses by status",
          prompt: `Given a list of API response dicts, group them by status code and print the count and URLs for each group:

\`\`\`python
responses = [
    {"url": "/users", "status": 200},
    {"url": "/posts", "status": 404},
    {"url": "/comments", "status": 200},
    {"url": "/auth", "status": 500},
    {"url": "/profile", "status": 200},
    {"url": "/settings", "status": 404},
]
\`\`\`

Expected output:
\`\`\`
200: 3 responses — ['/users', '/comments', '/profile']
404: 2 responses — ['/posts', '/settings']
500: 1 responses — ['/auth']
\`\`\``,
          hints: [
            "Sort the responses by status code first, then use groupby.",
            "The key function should extract the 'status' field: key=lambda r: r['status'].",
          ],
          solution: `from itertools import groupby

responses = [
    {"url": "/users", "status": 200},
    {"url": "/posts", "status": 404},
    {"url": "/comments", "status": 200},
    {"url": "/auth", "status": 500},
    {"url": "/profile", "status": 200},
    {"url": "/settings", "status": 404},
]

responses.sort(key=lambda r: r["status"])

for status, group in groupby(responses, key=lambda r: r["status"]):
    items = list(group)
    urls = [r["url"] for r in items]
    print(f"{status}: {len(urls)} responses — {urls}")`,
          takeaway:
            "Sort first, groupby second. This two-step pattern is the correct way to use groupby for SQL-style grouping in Python.",
        },
      ],
    },

    // ================================================================
    // 5. product and combinations: generating possibilities
    // ================================================================
    {
      title: "product and combinations: generating possibilities",
      blocks: [
        {
          kind: "prose",
          markdown: `Sometimes you need to try every combination of parameters — every model with every temperature, every prompt with every system message. Writing nested for-loops works but gets messy fast. \`itertools.product\` and \`itertools.combinations\` generate these systematically.`,
        },
        {
          kind: "code_predict",
          label: "product — all pairs from two lists",
          code: `from itertools import product

models = ["haiku", "sonnet"]
temps = [0.0, 0.5, 1.0]

combos = list(product(models, temps))
print(combos)
print(f"Total: {len(combos)}")`,
          output: `[('haiku', 0.0), ('haiku', 0.5), ('haiku', 1.0), ('sonnet', 0.0), ('sonnet', 0.5), ('sonnet', 1.0)]\nTotal: 6`,
          explanation: `product generates every pair: each model combined with each temperature. 2 models × 3 temps = 6 combinations. It's the Cartesian product — the same as nested for-loops but expressed as a single call.`,
        },
        {
          kind: "code_comparison",
          label: "nested loops vs product",
          left: {
            title: "Nested loops",
            code: `results = []
for model in models:
    for temp in temps:
        for top_k in [10, 50]:
            results.append(
                (model, temp, top_k)
            )`,
            annotation: "3 levels of nesting",
          },
          right: {
            title: "itertools.product",
            code: `from itertools import product

results = list(product(
    models,
    temps,
    [10, 50],
))`,
            annotation: "flat, readable",
          },
          takeaway:
            "product replaces nested for-loops. With 3+ dimensions, the readability improvement is significant.",
        },
        {
          kind: "prose",
          markdown: `\`combinations\` is different — it picks subsets from a single collection, without repetition and without caring about order:`,
        },
        {
          kind: "code_predict",
          label: "combinations — choosing subsets",
          code: `from itertools import combinations

tools = ["search", "calculator", "code_exec", "file_read"]

# All ways to pick 2 tools from 4
pairs = list(combinations(tools, 2))
for pair in pairs:
    print(pair)

print(f"\\nTotal: {len(pairs)}")`,
          output: `('search', 'calculator')\n('search', 'code_exec')\n('search', 'file_read')\n('calculator', 'code_exec')\n('calculator', 'file_read')\n('code_exec', 'file_read')\n\nTotal: 6`,
          explanation: `combinations(tools, 2) generates all 2-item subsets. Order doesn't matter — ('search', 'calculator') and ('calculator', 'search') are the same subset, so only one appears. The count is "4 choose 2" = 6.`,
        },
        {
          kind: "warm_up",
          title: "product count",
          prompt:
            "If you call `product(['a', 'b', 'c'], [1, 2])`, how many tuples will it produce?",
          answer: "6",
          explanation:
            "3 items × 2 items = 6 combinations. product always produces len(a) × len(b) × ... items.",
        },
        {
          kind: "prose",
          markdown: `There's also \`combinations_with_replacement\` (allows picking the same item more than once) and \`permutations\` (order matters). Quick comparison:

| Function | Picks | Order matters? | Repetition? | Example from [A,B,C], r=2 |
|---|---|---|---|---|
| \`combinations\` | r items | No | No | AB, AC, BC |
| \`combinations_with_replacement\` | r items | No | Yes | AA, AB, AC, BB, BC, CC |
| \`permutations\` | r items | Yes | No | AB, AC, BA, BC, CA, CB |
| \`product\` | 1 from each input | Yes | N/A | (cross-product of separate lists) |`,
        },
        {
          kind: "flashcard",
          context: "Parameter sweep",
          front:
            "You need to test every combination of 3 models × 4 temperatures × 2 max_tokens values. Which itertools function?",
          back: "product(models, temps, max_tokens_options) — Cartesian product of separate lists. 3 × 4 × 2 = 24 configs.",
        },
        {
          kind: "flashcard",
          context: "Tool selection",
          front:
            "You have 6 tools and want to test every possible pair to see which two work best together. Which itertools function?",
          back: "combinations(tools, 2) — all 2-item subsets from one collection. Order doesn't matter (search+calc is the same as calc+search).",
        },
        {
          kind: "flashcard",
          context: "A/B ranking",
          front:
            "You want all ordered pairs of 4 models to run pairwise comparisons (A vs B and B vs A are different). Which function?",
          back: "permutations(models, 2) — all 2-item sequences where order matters. 4 × 3 = 12 ordered pairs.",
        },
      ],
    },

    // ================================================================
    // 6. starmap: unpacking arguments
    // ================================================================
    {
      title: "starmap: unpacking arguments",
      blocks: [
        {
          kind: "prose",
          markdown: `\`map(func, iterable)\` calls \`func(item)\` for each item. But what if each item is a tuple that should be unpacked into multiple arguments? That's what \`starmap\` does — it calls \`func(*item)\`:`,
        },
        {
          kind: "code_predict",
          label: "starmap vs map",
          code: `from itertools import starmap

pairs = [(2, 5), (3, 2), (10, 3)]

# map can't unpack the pairs:
# map(pow, pairs) would call pow((2, 5)) — wrong!

# starmap unpacks each pair:
result = list(starmap(pow, pairs))
print(result)`,
          output: `[32, 9, 1000]`,
          explanation: `starmap calls pow(2, 5) = 32, pow(3, 2) = 9, pow(10, 3) = 1000. It unpacks each tuple into separate arguments. Regular map would try pow((2, 5)) which would fail because pow expects two separate args, not a tuple.`,
        },
        {
          kind: "code_predict",
          label: "starmap with product",
          code: `from itertools import starmap, product

def make_config(model, temp):
    return {"model": model, "temperature": temp}

configs = list(starmap(
    make_config,
    product(["haiku", "sonnet"], [0.0, 1.0])
))

for c in configs:
    print(c)`,
          output: `{'model': 'haiku', 'temperature': 0.0}\n{'model': 'haiku', 'temperature': 1.0}\n{'model': 'sonnet', 'temperature': 0.0}\n{'model': 'sonnet', 'temperature': 1.0}`,
          explanation: `product generates all (model, temp) pairs. starmap unpacks each pair and passes them as separate arguments to make_config. The result is a list of config dicts — no loops needed.`,
        },
        {
          kind: "key_insight",
          label: "starmap pattern",
          insight: `\`starmap\` pairs naturally with \`product\` and \`zip\`:

- \`starmap(func, product(a, b))\` — apply func to every combination
- \`starmap(func, zip(xs, ys))\` — apply func to paired items

Think of it as: "I have tuples of arguments, call this function on each."`,
        },
      ],
    },

    // ================================================================
    // 7. batched: chunking iterables (Python 3.12+)
    // ================================================================
    {
      title: "batched: chunking iterables (Python 3.12+)",
      blocks: [
        {
          kind: "prose",
          markdown: `A very common task: split a list into fixed-size chunks for batch processing. Before Python 3.12, everyone wrote their own chunking function. Now there's \`itertools.batched\`:`,
        },
        {
          kind: "code_predict",
          label: "batched basics",
          code: `from itertools import batched

items = list(range(10))
chunks = list(batched(items, 3))
print(chunks)`,
          output: `[(0, 1, 2), (3, 4, 5), (6, 7, 8), (9,)]`,
          explanation: `batched(items, 3) splits 10 items into chunks of 3. The last chunk has only 1 item — batched doesn't pad it. Each chunk is a tuple. This is perfect for batching API calls: process 3 at a time, handle the remainder.`,
        },
        {
          kind: "code_predict",
          label: "batched for API calls",
          code: `from itertools import batched

messages = [f"msg_{i}" for i in range(7)]

for i, batch in enumerate(batched(messages, 3)):
    print(f"Batch {i}: sending {len(batch)} messages — {batch}")`,
          output: `Batch 0: sending 3 messages — ('msg_0', 'msg_1', 'msg_2')\nBatch 1: sending 3 messages — ('msg_3', 'msg_4', 'msg_5')\nBatch 2: sending 1 messages — ('msg_6',)`,
          explanation: `7 messages split into batches of 3: two full batches and one partial batch. In real code, each iteration would be an API call processing that batch.`,
        },
        {
          kind: "prose",
          markdown: `If you're on Python < 3.12, the standard recipe is:

\`\`\`python
def batched(iterable, n):
    from itertools import islice
    it = iter(iterable)
    while batch := tuple(islice(it, n)):
        yield batch
\`\`\``,
        },
        {
          kind: "warm_up",
          title: "batched output",
          prompt:
            "What does `list(batched([1, 2, 3, 4, 5], 2))` return?",
          answer: "[(1, 2), (3, 4), (5,)]",
          explanation:
            "5 items in chunks of 2: two full pairs plus one leftover item. Each chunk is a tuple.",
        },
      ],
    },

    // ================================================================
    // 8. itertools API cheat sheet
    // ================================================================
    {
      title: "itertools API cheat sheet",
      blocks: [
        {
          kind: "method_ref",
          title: "itertools",
          importLine: "from itertools import ...",
          methods: [
            {
              signature: "chain(*iterables)",
              description:
                "Yield items from the first iterable, then the second, and so on. Flattens multiple iterables into one stream.",
              returns: "Iterator over all items from all inputs.",
            },
            {
              signature: "chain.from_iterable(iterable_of_iterables)",
              description:
                "Like chain, but takes a single iterable of iterables. Useful when the sublists are in a container.",
              returns: "Iterator — one level of flattening.",
            },
            {
              signature: "islice(iterable, [start,] stop [, step])",
              description:
                "Slice any iterable (including generators). Like list slicing but lazy.",
              returns: "Iterator over the selected items.",
            },
            {
              signature: "groupby(iterable, key=None)",
              description:
                "Group consecutive items with the same key. DATA MUST BE SORTED by the key first.",
              returns:
                "Iterator of (key_value, group_iterator) pairs.",
            },
            {
              signature: "product(*iterables, repeat=1)",
              description:
                "Cartesian product — all combinations picking one item from each iterable. Replaces nested for-loops.",
              returns: "Iterator of tuples.",
            },
            {
              signature: "combinations(iterable, r)",
              description:
                "All r-length subsets. Order doesn't matter, no repeated items.",
              returns: "Iterator of r-tuples.",
            },
            {
              signature: "permutations(iterable, r=None)",
              description:
                "All r-length arrangements. Order matters, no repeated items.",
              returns: "Iterator of r-tuples.",
            },
            {
              signature: "starmap(function, iterable)",
              description:
                "Like map(), but unpacks each item as arguments: func(*item).",
              returns: "Iterator of results.",
            },
            {
              signature: "batched(iterable, n) [3.12+]",
              description:
                "Split an iterable into chunks of size n. Last chunk may be shorter.",
              returns: "Iterator of n-tuples.",
            },
          ],
        },
      ],
    },

    // ================================================================
    // 9. functools.lru_cache: memoization
    // ================================================================
    {
      title: "functools.lru_cache: memoization",
      blocks: [
        {
          kind: "prose",
          markdown: `Memoization means caching the result of a function call so that calling it again with the same arguments returns the cached result instead of recomputing. \`functools.lru_cache\` adds memoization with a single decorator.

"LRU" stands for Least Recently Used — when the cache is full, it evicts the entry that hasn't been used the longest.`,
        },
        {
          kind: "code_predict",
          label: "lru_cache — Fibonacci",
          code: `from functools import lru_cache

@lru_cache(maxsize=None)
def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)

print(fib(10))
print(fib(50))
print(fib.cache_info())`,
          output: `55\n12586269025\nCacheInfo(hits=49, misses=51, maxsize=None, currsize=51)`,
          explanation: `Without caching, fib(50) would take billions of recursive calls. With lru_cache, each value from fib(0) to fib(50) is computed exactly once and cached — 51 unique calls total. The 49 hits are the second recursive call in each \`fib(n-1) + fib(n-2)\` that finds the value already cached.

maxsize=None means unlimited cache. Use a number like maxsize=128 (the default) to cap memory usage.`,
        },
        {
          kind: "code_predict",
          label: "lru_cache — practical memoization",
          code: `from functools import lru_cache

call_count = 0

@lru_cache(maxsize=128)
def expensive_lookup(user_id: str, role: str) -> dict:
    global call_count
    call_count += 1
    # Simulate expensive computation
    return {"user": user_id, "role": role, "permissions": ["read"]}

# Call with same args multiple times
expensive_lookup("alice", "admin")
expensive_lookup("bob", "viewer")
expensive_lookup("alice", "admin")  # cached!
expensive_lookup("alice", "admin")  # cached!
expensive_lookup("bob", "viewer")   # cached!

print(f"Actual calls: {call_count}")
print(expensive_lookup.cache_info())`,
          output: `Actual calls: 2\nCacheInfo(hits=3, misses=2, maxsize=128, currsize=2)`,
          explanation: `Only 2 unique (user_id, role) combinations were seen, so the function was called only twice. The other 3 calls hit the cache. The cache key is built from all the function arguments.`,
        },
        {
          kind: "key_insight",
          label: "lru_cache requirements",
          insight: `All arguments must be **hashable** (strings, numbers, tuples — not lists or dicts). If you need to cache a function that takes a dict, convert it to a frozenset of items or a JSON string first.

\`\`\`python
# Won't work — dict is unhashable:
@lru_cache
def process(config: dict): ...

# Workaround — use a hashable wrapper:
import json
@lru_cache
def process(config_json: str): ...
    config = json.loads(config_json)
\`\`\``,
        },
        {
          kind: "warm_up",
          title: "cache management",
          prompt:
            "How do you clear the cache of a function decorated with @lru_cache?",
          answer: "func.cache_clear()",
          explanation:
            "lru_cache adds .cache_info() to check stats and .cache_clear() to reset the cache. Useful in tests or when cached data becomes stale.",
        },
        {
          kind: "method_ref",
          title: "lru_cache",
          importLine: "from functools import lru_cache",
          methods: [
            {
              signature: "@lru_cache(maxsize=128)",
              description:
                "Decorator that caches function results. maxsize=None for unlimited, or a power of 2 for bounded cache.",
              returns: "The cached function (same signature).",
            },
            {
              signature: "func.cache_info()",
              description:
                "Returns a named tuple with hits, misses, maxsize, and currsize.",
              returns: "CacheInfo(hits, misses, maxsize, currsize)",
            },
            {
              signature: "func.cache_clear()",
              description:
                "Clears the cache and resets statistics.",
              returns: "None",
            },
          ],
        },
      ],
    },

    // ================================================================
    // 10. functools.partial: pre-filling arguments
    // ================================================================
    {
      title: "functools.partial: pre-filling arguments",
      blocks: [
        {
          kind: "prose",
          markdown: `\`functools.partial\` creates a new function with some arguments pre-filled. It's useful when you have a general function and want to create specialized versions without writing wrapper functions:`,
        },
        {
          kind: "code_predict",
          label: "partial basics",
          code: `from functools import partial

def call_api(model, temperature, prompt):
    return f"[{model} @ {temperature}] {prompt}"

# Create specialized versions
call_haiku = partial(call_api, "haiku", 0.0)
call_sonnet_creative = partial(call_api, "sonnet", 1.0)

print(call_haiku("What is 2+2?"))
print(call_sonnet_creative("Write a poem"))`,
          output: `[haiku @ 0.0] What is 2+2?\n[sonnet @ 1.0] Write a poem`,
          explanation: `partial(call_api, "haiku", 0.0) creates a new function where model="haiku" and temperature=0.0 are locked in. You only need to provide the remaining argument (prompt). It's like saying "give me a version of call_api that always uses haiku at temp 0."`,
        },
        {
          kind: "code_predict",
          label: "partial with keyword arguments",
          code: `from functools import partial

def format_message(role, content, name=None):
    msg = {"role": role, "content": content}
    if name:
        msg["name"] = name
    return msg

system_msg = partial(format_message, "system")
user_msg = partial(format_message, "user")

print(system_msg("You are helpful."))
print(user_msg("Hello!", name="Alice"))`,
          output: `{'role': 'system', 'content': 'You are helpful.'}\n{'role': 'user', 'content': 'Hello!', 'name': 'Alice'}`,
          explanation: `partial fixes the first argument (role) and leaves the rest flexible. system_msg("You are helpful.") is the same as format_message("system", "You are helpful."). You can still pass keyword arguments like name="Alice" to the partial function.`,
        },
        {
          kind: "key_insight",
          label: "partial vs lambda",
          insight: `Both \`partial\` and \`lambda\` can create specialized functions:

\`\`\`python
# These do the same thing:
add_ten = partial(add, 10)
add_ten = lambda x: add(10, x)
\`\`\`

Prefer \`partial\` when you're just fixing arguments — it's more explicit about intent. Use \`lambda\` when you need to transform or reorder arguments.`,
        },
        {
          kind: "warm_up",
          title: "partial construction",
          prompt:
            "Given `def send(endpoint, method, body)`, write a partial that creates a function `post_users` that always uses endpoint='/users' and method='POST'.",
          answer: "post_users = partial(send, '/users', 'POST')",
          explanation:
            "partial(send, '/users', 'POST') locks in the first two positional arguments. Calling post_users({'name': 'Alice'}) becomes send('/users', 'POST', {'name': 'Alice'}).",
        },
      ],
    },

    // ================================================================
    // 11. functools.reduce: folding a sequence
    // ================================================================
    {
      title: "functools.reduce: folding a sequence",
      blocks: [
        {
          kind: "prose",
          markdown: `\`reduce\` takes a two-argument function and applies it cumulatively to items in a sequence, reducing them to a single value. Think of it as collapsing a list from left to right:

\`\`\`
reduce(f, [a, b, c, d])  =  f(f(f(a, b), c), d)
\`\`\`

Step by step: first \`f(a, b)\` → result1, then \`f(result1, c)\` → result2, then \`f(result2, d)\` → final answer.`,
        },
        {
          kind: "code_predict",
          label: "reduce — summing a list",
          code: `from functools import reduce

nums = [1, 2, 3, 4, 5]
total = reduce(lambda acc, x: acc + x, nums)
print(total)`,
          output: `15`,
          explanation: `Step by step: reduce takes 1 and 2, computes 1+2=3. Takes 3 and 3, computes 3+3=6. Takes 6 and 4, computes 6+4=10. Takes 10 and 5, computes 10+5=15. The accumulator (acc) carries the running result.`,
        },
        {
          kind: "code_predict",
          label: "reduce — merging dicts",
          code: `from functools import reduce

configs = [
    {"model": "haiku"},
    {"temperature": 0.7},
    {"max_tokens": 1024, "temperature": 0.0},
]

merged = reduce(lambda acc, d: {**acc, **d}, configs)
print(merged)`,
          output: `{'model': 'haiku', 'temperature': 0.0, 'max_tokens': 1024}`,
          explanation: `Each step merges the next dict into the accumulator. Later dicts override earlier keys — temperature starts as 0.7 but gets overwritten to 0.0 by the third dict. This is a clean way to merge a list of config dicts with priority ordering.`,
        },
        {
          kind: "key_insight",
          label: "When to use reduce",
          insight: `Use \`reduce\` sparingly. Most of the time, a for loop or a built-in is clearer:

- **Summing?** Use \`sum()\`
- **Joining strings?** Use \`"".join()\`
- **Finding min/max?** Use \`min()\` / \`max()\`
- **Merging dicts?** reduce is actually nice here
- **Building a pipeline?** reduce shines for composing functions

If a reviewer has to think hard about what your reduce does, use a loop instead.`,
        },
        {
          kind: "code_predict",
          label: "reduce with an initial value",
          code: `from functools import reduce

def apply_discount(price, pct):
    return price * (1 - pct / 100)

discounts = [10, 5, 15]  # 10% off, then 5% off, then 15% off

final = reduce(apply_discount, discounts, 100.0)
print(f"Final price: {final:.2f}")`,
          output: `Final price: 72.68`,
          explanation: `The third argument (100.0) is the initial value — the starting price. Step 1: 100 × 0.90 = 90.0. Step 2: 90.0 × 0.95 = 85.5. Step 3: 85.5 × 0.85 = 72.675, which rounds to 72.68. Without an initial value, reduce would use the first element of the list as the starting accumulator.`,
        },
      ],
    },

    // ================================================================
    // 12. functools API cheat sheet
    // ================================================================
    {
      title: "functools API cheat sheet",
      blocks: [
        {
          kind: "method_ref",
          title: "functools",
          importLine: "from functools import ...",
          methods: [
            {
              signature: "@lru_cache(maxsize=128)",
              description:
                "Memoization decorator. Caches results keyed by all arguments (must be hashable).",
              returns: "Decorated function with .cache_info() and .cache_clear().",
            },
            {
              signature: "partial(func, *args, **kwargs)",
              description:
                "Create a new function with some arguments pre-filled. Remaining args are passed at call time.",
              returns: "A new callable (partial object).",
            },
            {
              signature: "reduce(function, iterable[, initial])",
              description:
                "Apply a two-argument function cumulatively to reduce an iterable to a single value.",
              returns: "The final accumulated value.",
            },
          ],
        },
      ],
    },

    // ================================================================
    // 13. Composing itertools + functools
    // ================================================================
    {
      title: "Composing itertools + functools together",
      blocks: [
        {
          kind: "prose",
          markdown: `The real power shows up when you combine these tools. Here are two patterns that come up constantly in LLM work.`,
        },
        {
          kind: "code_predict",
          label: "batched + starmap — batch processing with configs",
          code: `from itertools import batched, starmap, product

models = ["haiku", "sonnet"]
prompts = ["Explain X", "Summarize Y", "Translate Z"]

# Generate all (model, prompt) pairs
tasks = list(product(models, prompts))
print(f"Total tasks: {len(tasks)}")

# Process in batches of 2
for i, batch in enumerate(batched(tasks, 2)):
    print(f"Batch {i}: {batch}")`,
          output: `Total tasks: 6\nBatch 0: (('haiku', 'Explain X'), ('haiku', 'Summarize Y'))\nBatch 1: (('haiku', 'Translate Z'), ('sonnet', 'Explain X'))\nBatch 2: (('sonnet', 'Summarize Y'), ('sonnet', 'Translate Z'))`,
          explanation: `product generates all 6 (model, prompt) pairs. batched splits them into groups of 2 for batch processing. In real code, each batch would be sent as concurrent API calls with asyncio.gather.`,
        },
        {
          kind: "mini_challenge",
          title: "Parameter sweep with caching",
          prompt: `Write a function that:

1. Uses \`product\` to generate all combinations of models and temperatures
2. Uses \`lru_cache\` to cache results (simulate expensive API calls)
3. Runs each combination and collects results

\`\`\`python
models = ["haiku", "sonnet"]
temps = [0.0, 0.5, 1.0]
prompt = "What is AI?"
\`\`\`

The function should return a list of result dicts like:
\`\`\`python
[{"model": "haiku", "temp": 0.0, "response": "..."}, ...]
\`\`\``,
          hints: [
            "lru_cache needs hashable args — strings and floats are fine.",
            "Use product(models, temps) to generate all (model, temp) pairs.",
            "You can use a list comprehension over product instead of a loop.",
          ],
          solution: `from itertools import product
from functools import lru_cache

@lru_cache(maxsize=None)
def call_model(model: str, temp: float, prompt: str) -> str:
    # Simulated API call — in reality this is expensive
    return f"Response from {model} at temp={temp}"

def sweep(models, temps, prompt):
    return [
        {"model": m, "temp": t, "response": call_model(m, t, prompt)}
        for m, t in product(models, temps)
    ]

results = sweep(["haiku", "sonnet"], [0.0, 0.5, 1.0], "What is AI?")
for r in results:
    print(r)

# Running again with same args hits cache
results2 = sweep(["haiku", "sonnet"], [0.0, 0.5, 1.0], "What is AI?")
print(f"\\nCache: {call_model.cache_info()}")`,
          takeaway:
            "product generates the grid, lru_cache avoids recomputing duplicate calls. This pattern is the backbone of prompt optimization: sweep parameters, cache results, analyze.",
        },
      ],
    },

    // ================================================================
    // 14. Challenge: Log analysis pipeline
    // ================================================================
    {
      title: "Challenge: Log analysis pipeline",
      blocks: [
        {
          kind: "prose",
          markdown: `This challenge ties together \`groupby\`, \`chain\`, and counting patterns. It's representative of the kind of data processing you'd do on API logs.`,
        },
        {
          kind: "mini_challenge",
          title: "API log analyzer",
          prompt: `Given API call logs, write a pipeline that:

1. Chains logs from multiple servers into one stream
2. Groups calls by endpoint (using groupby)
3. For each endpoint, computes: total calls, average latency, error count

\`\`\`python
server_a_logs = [
    {"endpoint": "/chat", "latency_ms": 120, "status": 200},
    {"endpoint": "/chat", "latency_ms": 450, "status": 200},
    {"endpoint": "/embed", "latency_ms": 30, "status": 200},
]

server_b_logs = [
    {"endpoint": "/chat", "latency_ms": 800, "status": 500},
    {"endpoint": "/embed", "latency_ms": 25, "status": 200},
    {"endpoint": "/embed", "latency_ms": 35, "status": 200},
]
\`\`\`

Expected output (order may vary):
\`\`\`
/chat: 3 calls, avg latency 456.7ms, 1 errors
/embed: 3 calls, avg latency 30.0ms, 0 errors
\`\`\``,
          hints: [
            "Use chain(server_a_logs, server_b_logs) to combine the logs.",
            "Sort by endpoint before using groupby.",
            "In each group, compute len, mean latency, and count of non-200 statuses.",
          ],
          solution: `from itertools import chain, groupby

server_a_logs = [
    {"endpoint": "/chat", "latency_ms": 120, "status": 200},
    {"endpoint": "/chat", "latency_ms": 450, "status": 200},
    {"endpoint": "/embed", "latency_ms": 30, "status": 200},
]

server_b_logs = [
    {"endpoint": "/chat", "latency_ms": 800, "status": 500},
    {"endpoint": "/embed", "latency_ms": 25, "status": 200},
    {"endpoint": "/embed", "latency_ms": 35, "status": 200},
]

# 1. Chain all logs
all_logs = sorted(
    chain(server_a_logs, server_b_logs),
    key=lambda x: x["endpoint"],
)

# 2. Group by endpoint, 3. Compute stats
for endpoint, group in groupby(all_logs, key=lambda x: x["endpoint"]):
    entries = list(group)
    total = len(entries)
    avg_latency = sum(e["latency_ms"] for e in entries) / total
    errors = sum(1 for e in entries if e["status"] != 200)
    print(f"{endpoint}: {total} calls, avg latency {avg_latency:.1f}ms, {errors} errors")`,
          takeaway:
            "chain combines data from multiple sources, sort + groupby organizes it, and simple aggregation computes the stats. This is the itertools equivalent of a SQL GROUP BY query.",
        },
      ],
    },

    // ================================================================
    // 15. Challenge: Batch API caller
    // ================================================================
    {
      title: "Challenge: Batch API caller with partial",
      blocks: [
        {
          kind: "mini_challenge",
          title: "Build a batch caller",
          prompt: `Build a batch processing function that:

1. Takes a list of prompts and a batch size
2. Splits prompts into batches using \`batched\`
3. Uses \`partial\` to create a specialized caller for a specific model
4. Processes each batch (simulated) and collects results using \`chain.from_iterable\`

\`\`\`python
prompts = [
    "Summarize: doc1", "Summarize: doc2", "Summarize: doc3",
    "Summarize: doc4", "Summarize: doc5", "Summarize: doc6",
    "Summarize: doc7",
]
batch_size = 3
\`\`\`

The output should show batches being processed and a final flat list of all results.`,
          hints: [
            "Use partial(process_batch, model='haiku') to create a model-specific processor.",
            "Use batched(prompts, batch_size) to chunk the prompts.",
            "Use chain.from_iterable(results_per_batch) to flatten batch results into one list.",
          ],
          solution: `from itertools import batched, chain
from functools import partial

def process_batch(prompts, model="haiku"):
    """Simulate processing a batch of prompts."""
    results = []
    for p in prompts:
        results.append(f"[{model}] {p} -> done")
    return results

# Create a specialized caller
call_haiku = partial(process_batch, model="haiku")

prompts = [
    "Summarize: doc1", "Summarize: doc2", "Summarize: doc3",
    "Summarize: doc4", "Summarize: doc5", "Summarize: doc6",
    "Summarize: doc7",
]

# Process in batches, collect results per batch
batch_results = []
for i, batch in enumerate(batched(prompts, 3)):
    print(f"Processing batch {i} ({len(batch)} prompts)...")
    batch_results.append(call_haiku(batch))

# Flatten all batch results into one list
all_results = list(chain.from_iterable(batch_results))
print(f"\\nTotal results: {len(all_results)}")
for r in all_results:
    print(f"  {r}")`,
          takeaway:
            "partial specializes the caller, batched chunks the work, chain.from_iterable flattens the results. This is the skeleton of every batch-processing pipeline.",
        },
      ],
    },

    // ================================================================
    // 16. Decision flashcards
    // ================================================================
    {
      title: "When to reach for what",
      blocks: [
        {
          kind: "prose",
          markdown: `For each scenario, decide which itertools or functools tool is the best fit:`,
        },
        {
          kind: "flashcard",
          context: "Processing pipeline",
          front:
            "You have results from 5 different API endpoints and want to iterate through all of them in one loop.",
          back: "chain(*results_lists) or chain.from_iterable(results_lists) — treats multiple iterables as one stream without copying.",
        },
        {
          kind: "flashcard",
          context: "Eval sweep",
          front:
            "You need to test 4 models × 3 temperatures × 2 system prompts = 24 configurations.",
          back: "product(models, temps, system_prompts) — generates all combinations. No nested loops needed.",
        },
        {
          kind: "flashcard",
          context: "Expensive computation",
          front:
            "Your embedding function is slow and gets called with the same text repeatedly across eval runs.",
          back: "@lru_cache — memoize the function so identical inputs return cached results instantly.",
        },
        {
          kind: "flashcard",
          context: "API rate limiting",
          front:
            "You have 1000 items to process but the API only handles 50 at a time.",
          back: "batched(items, 50) — splits into chunks of 50. Each chunk becomes one API call.",
        },
        {
          kind: "flashcard",
          context: "Log analysis",
          front:
            "You want to group log entries by date to compute daily stats.",
          back: "Sort by date, then groupby(logs, key=get_date). Remember: always sort before groupby.",
        },
        {
          kind: "flashcard",
          context: "Callback configuration",
          front:
            "You have a generic `send_request(url, method, headers, body)` and want a shorthand for POST requests to /api/chat.",
          back: "partial(send_request, '/api/chat', 'POST') — pre-fills the first two args. The returned function only needs headers and body.",
        },
        {
          kind: "flashcard",
          context: "Pairwise comparison",
          front:
            "You want to compare every model against every other model (both A-vs-B and B-vs-A).",
          back: "permutations(models, 2) — order matters, so you get both directions.",
        },
        {
          kind: "flashcard",
          context: "Config merging",
          front:
            "You have a list of config dicts (defaults, env overrides, CLI overrides) and need to merge them left to right, with later values winning.",
          back: "reduce(lambda a, b: {**a, **b}, configs) — folds the list into a single merged dict.",
        },
      ],
    },

    // ================================================================
    // 17. What to practice next
    // ================================================================
    {
      title: "What to practice next",
      blocks: [
        {
          kind: "prose",
          markdown: `You now know:

**itertools:**
- \`chain\` / \`chain.from_iterable\` — flatten multiple iterables into one
- \`islice\` — slice any iterable (including generators)
- \`groupby\` — group consecutive items (sort first!)
- \`product\` — Cartesian product (replaces nested loops)
- \`combinations\` / \`permutations\` — subsets and arrangements
- \`starmap\` — map with argument unpacking
- \`batched\` — split into fixed-size chunks

**functools:**
- \`lru_cache\` — memoize pure functions
- \`partial\` — pre-fill arguments to create specialized functions
- \`reduce\` — fold a sequence into a single value

To lock these in:
1. Next time you write a nested for-loop, consider \`product\`
2. Next time you concatenate lists, try \`chain\`
3. Next time you recompute the same thing, add \`@lru_cache\`
4. When you process items in batches, use \`batched\` instead of manual slicing`,
        },
      ],
    },
  ],
};
