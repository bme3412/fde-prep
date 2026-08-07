import type { StudyGuide } from "../guide-types";

export const collectionsGuide: StudyGuide = {
  topicTitle: "collections module deep dive",
  topicSlug: "collections-module-deep-dive",
  sections: [
    // ================================================================
    // 1. The problem: putting things in buckets
    // ================================================================
    {
      title: "The problem: putting things in buckets",
      blocks: [
        {
          kind: "prose",
          markdown: `Imagine you have a pile of index cards with names on them — Alice, Bob, Alice, Carol, Bob. You want to sort them into piles by the first letter: all the A-names in one pile, all the B-names in another, and so on.

In Python, you would use a \`dict\` where each key is a letter and each value is a list of names. Let's see how that looks. Predict the output before you reveal it:`,
        },
        {
          kind: "code_predict",
          label: "grouping names by first letter",
          code: `names = ["Alice", "Bob", "Anna", "Carol", "Ben"]

groups = {}
for name in names:
    letter = name[0]
    if letter not in groups:
        groups[letter] = []
    groups[letter].append(name)

print(groups)`,
          output: `{'A': ['Alice', 'Anna'], 'B': ['Bob', 'Ben'], 'C': ['Carol']}`,
          explanation: `Let's walk through it. First time through the loop, name is "Alice". letter is "A". "A" is not in groups yet, so we create groups["A"] = []. Then we append "Alice", giving groups["A"] = ["Alice"].

Second time, name is "Bob". letter is "B". "B" is not in groups yet, so we create groups["B"] = []. Append "Bob".

Third time, name is "Anna". letter is "A". "A" IS already in groups, so we skip the if-block. We just append "Anna", giving groups["A"] = ["Alice", "Anna"].

And so on for Carol and Ben.`,
        },
        {
          kind: "prose",
          markdown: `That works, but look at the loop body. Out of four lines, three are just managing the dict:

1. Get the first letter
2. **Check if the letter is already a key**
3. **If not, create an empty list**
4. Append the name

Lines 2 and 3 are pure bookkeeping. The only line that does real work is the \`.append()\`. Now let's try a slightly different version where each item has two pieces of info — a name and a department:`,
        },
        {
          kind: "code_predict",
          label: "grouping with paired data",
          code: `people = [("Alice", "Eng"), ("Bob", "Sales"), ("Carol", "Eng")]

teams = {}
for name, dept in people:
    if dept not in teams:
        teams[dept] = []
    teams[dept].append(name)

print(teams)`,
          output: `{'Eng': ['Alice', 'Carol'], 'Sales': ['Bob']}`,
          explanation: `Each item in the list is a pair like ("Alice", "Eng"). The line \`for name, dept in people\` splits each pair into two variables — name gets "Alice" and dept gets "Eng". This is called tuple unpacking.

The rest is the same pattern: check if the key exists, create an empty list if not, then append.`,
        },
        {
          kind: "key_insight",
          label: "Notice the pattern",
          insight: `Every time you group things into a dict, you write the same three steps: (1) check if the key exists, (2) create an empty list if it doesn't, (3) append. Python has a tool that handles steps 1 and 2 automatically, so you only have to write the append.`,
        },
      ],
    },

    // ================================================================
    // 2. defaultdict: a dict that fills itself in
    // ================================================================
    {
      title: "defaultdict: a dict that fills itself in",
      blocks: [
        {
          kind: "prose",
          markdown: `Python's \`collections\` module has a special kind of dict called \`defaultdict\`. Here's the idea:

**You tell it what to put at a key when that key is new.**

If you write \`defaultdict(list)\`, you're saying: "whenever I access a key that doesn't exist yet, automatically put an empty list \`[]\` there." No more if-checks. No more manual initialization.

Let's see the difference side by side:`,
        },
        {
          kind: "key_insight",
          label: "The mechanism (memorize this one sentence)",
          insight: `When you write \`d[key]\` and the key is missing, defaultdict does three things in order: **(1) call \`default_factory()\` with no arguments**, **(2) store the result at \`d[key]\`**, **(3) return it**.

Two consequences fall out of this single rule — and both matter:
- **The win:** \`d[letter].append(name)\` always works, because by the time \`.append\` runs, defaultdict has guaranteed \`d[letter]\` is a fresh list.
- **The cost:** even a read-looking access like \`x = d['TSLA']\` creates and stores \`'TSLA'\`. Looking is writing. We'll see this trap in a couple of sections — keep it in mind.`,
        },
        {
          kind: "code_comparison",
          label: "plain dict vs defaultdict",
          left: {
            title: "Plain dict",
            code: `groups = {}
for name in names:
    letter = name[0]
    if letter not in groups:
        groups[letter] = []
    groups[letter].append(name)`,
            annotation: "3 lines of bookkeeping",
          },
          right: {
            title: "defaultdict",
            code: `from collections import defaultdict

groups = defaultdict(list)
for name in names:
    letter = name[0]
    groups[letter].append(name)`,
            annotation: "zero bookkeeping",
          },
          takeaway:
            "Same result. The if-check and the empty-list creation are gone — defaultdict handles both automatically.",
        },
        {
          kind: "code_predict",
          label: "defaultdict(list) step by step",
          code: `from collections import defaultdict

people = [("Alice", "Eng"), ("Bob", "Sales"), ("Carol", "Eng")]

teams = defaultdict(list)
for name, dept in people:
    teams[dept].append(name)

print(dict(teams))`,
          output: `{'Eng': ['Alice', 'Carol'], 'Sales': ['Bob']}`,
          explanation: `First time through: name is "Alice", dept is "Eng". teams["Eng"] doesn't exist yet, so defaultdict automatically creates teams["Eng"] = []. Then .append("Alice") adds Alice to that list.

Second time: name is "Bob", dept is "Sales". teams["Sales"] doesn't exist, so defaultdict creates teams["Sales"] = []. Append "Bob".

Third time: name is "Carol", dept is "Eng". teams["Eng"] already exists (it has ["Alice"] in it), so defaultdict does nothing special. We just append "Carol".

Same result as before — but we never wrote a single if-check.`,
        },
        {
          kind: "warm_up",
          title: "reading defaultdict",
          prompt:
            "After running `d = defaultdict(list); d['x'].append(1); d['x'].append(2)`, what is `d['x']`?",
          answer: "[1, 2]",
          explanation:
            "The first time d['x'] was accessed, defaultdict created an empty list []. Then we appended 1, making it [1]. Then we appended 2, making it [1, 2].",
        },
        {
          kind: "multiple_choice",
          title: "what gets printed?",
          prompt:
            "Predict the two values this prints. Apply the three-step mechanism in your head before picking.",
          code: `from collections import defaultdict

d = defaultdict(list)
print(d['a'])
print(len(d))`,
          choices: [
            {
              text: "None\n0",
              correct: false,
              rationale:
                "defaultdict never returns None for a missing key — it calls the factory.",
            },
            {
              text: "[]\n0",
              correct: false,
              rationale:
                "Close — d['a'] does return [], but accessing it also STORED 'a' as a key, so len(d) is 1.",
            },
            {
              text: "[]\n1",
              correct: true,
              rationale:
                "Exactly right. d['a'] called list() → [], stored it at d['a'], returned it. The store is why len(d) == 1.",
            },
            {
              text: "Raises KeyError",
              correct: false,
              rationale:
                "Plain dict would raise KeyError. defaultdict's whole purpose is to avoid this — it calls the factory instead.",
            },
          ],
          explanation:
            "This question is a direct application of the three-step rule. Whenever you see `d[missing_key]` on a defaultdict, mentally run: (1) call factory (2) STORE (3) return. The store is the part most people forget — and it's why len(d) goes up.",
        },
      ],
    },

    // ================================================================
    // 3. The three recipes: list, int, set
    // ================================================================
    {
      title: "The three recipes: list, int, set",
      blocks: [
        {
          kind: "prose",
          markdown: `You've seen \`defaultdict(list)\` — it puts an empty list at missing keys, which is perfect for grouping. But you can put other things at missing keys too. The two other common choices are:

- \`defaultdict(int)\` → puts \`0\` at missing keys (good for counting)
- \`defaultdict(set)\` → puts an empty set at missing keys (good for collecting unique items)

Let's see each one:`,
        },
        {
          kind: "code_predict",
          label: "defaultdict(int) — counting",
          code: `from collections import defaultdict

counts = defaultdict(int)
for fruit in ["apple", "banana", "apple", "apple", "banana"]:
    counts[fruit] += 1

print(dict(counts))`,
          output: `{'apple': 3, 'banana': 2}`,
          explanation: `First time through: fruit is "apple". counts["apple"] doesn't exist, so defaultdict puts 0 there. Then += 1 makes it 1.

Second time: fruit is "banana". counts["banana"] doesn't exist, so defaultdict puts 0 there. Then += 1 makes it 1.

Third time: fruit is "apple" again. counts["apple"] already exists (it's 1), so we just do 1 += 1 = 2.

No need to write \`counts.get("apple", 0) + 1\` or check if the key exists.`,
        },
        {
          kind: "warm_up",
          title: "int default",
          prompt:
            "If I write `d = defaultdict(int)` and then do `print(d['x'])` without ever setting it, what gets printed?",
          answer: "0",
          explanation:
            "defaultdict(int) puts 0 at any missing key. Accessing d['x'] creates it with value 0 and returns that.",
        },
        {
          kind: "code_predict",
          label: "defaultdict(set) — collecting unique items",
          code: `from collections import defaultdict

visits = [
    ("Alice", "Paris"), ("Bob", "Paris"),
    ("Alice", "London"), ("Alice", "Paris"),
]

cities = defaultdict(set)
for person, city in visits:
    cities[person].add(city)

print(dict(cities))`,
          output: `{'Alice': {'Paris', 'London'}, 'Bob': {'Paris'}}`,
          explanation: `A set only keeps unique values. Alice visited Paris twice, but the set only stores it once. That's why defaultdict(set) is perfect when you want to collect items without duplicates.

First time: cities["Alice"] doesn't exist → defaultdict creates an empty set. .add("Paris") adds it.
Third time: cities["Alice"] already has {"Paris"}. .add("London") adds London → {"Paris", "London"}.
Fourth time: .add("Paris") again, but Paris is already in the set, so nothing changes.`,
        },
        {
          kind: "warm_up",
          title: "set default",
          prompt:
            "If I write `d = defaultdict(set)` and then do `print(d['x'])` without ever setting it, what gets printed?",
          answer: "set()",
          explanation:
            "defaultdict(set) puts an empty set at any missing key. In Python, an empty set prints as set().",
        },
        {
          kind: "key_insight",
          label: "Three recipes for three jobs",
          insight: `Pick the recipe based on what you need to collect:

- \`defaultdict(list)\` → **group** items into lists → use \`.append()\`
- \`defaultdict(int)\` → **count** things → use \`+= 1\`
- \`defaultdict(set)\` → **collect unique** items → use \`.add()\`

That's it. Three recipes, three use cases.`,
        },
        {
          kind: "prose",
          markdown: `The thing you pass to \`defaultdict\` — \`list\`, \`int\`, or \`set\` — has a name. It's called the **factory**. It's just a function that defaultdict calls (with no arguments) whenever it needs to fill in a missing key.

You already understand how it works. Now you know the word for it:
- \`list\` is a factory that produces \`[]\`
- \`int\` is a factory that produces \`0\`
- \`set\` is a factory that produces \`set()\``,
        },
        {
          kind: "warm_up",
          title: "naming the factory",
          prompt: "In `defaultdict(list)`, what is the factory?",
          answer: "list",
          explanation:
            "The factory is the function you pass to defaultdict. Here it's list, which gets called as list() to produce [] for each new key.",
        },
        {
          kind: "warm_up",
          title: "interleaved: pick the recipe",
          prompt: `Match each problem to the right factory (\`list\`, \`int\`, or \`set\`):

a) Counting how often each user logs in
b) Tracking which countries each user has visited
c) Bucketing customer emails by domain (gmail.com, etc.)
d) Recording every price tick for each ticker symbol

Answer as four letters separated by commas, e.g. \`list, int, set, list\`.`,
          answer: "int, set, list, list",
          explanation: `(a) count → int. (b) collect unique items → set. (c) group items → list. (d) collect every value (duplicates allowed) → list.

The trick: do you want to **count**, **collect uniques**, or **group all occurrences**? Each maps to exactly one factory.`,
        },
        {
          kind: "multiple_choice",
          title: "pick the right factory",
          prompt:
            "You're writing a function that, given a list of trades, returns the **unique set of exchanges** each ticker has traded on. Which factory do you want?",
          choices: [
            {
              text: "defaultdict(list)",
              correct: false,
              rationale:
                "A list would store every (ticker, exchange) pair including duplicates — but the question asks for the UNIQUE set.",
            },
            {
              text: "defaultdict(int)",
              correct: false,
              rationale:
                "int is for counting. We want to collect the exchange names themselves, not count them.",
            },
            {
              text: "defaultdict(set)",
              correct: true,
              rationale:
                "set is the unique-collector. `exchanges[ticker].add(exchange)` deduplicates automatically.",
            },
            {
              text: "defaultdict(dict)",
              correct: false,
              rationale:
                "A dict has keys and values — we just need a collection of unique items, so set is simpler and correct.",
            },
          ],
          explanation:
            "Map the requirement to the recipe: 'unique' → set, 'count' → int, 'group all' → list. This is the single most common decision you'll make when reaching for defaultdict.",
        },
        {
          kind: "code_predict",
          label: "BUG HUNT — find what's wrong (then fix it and run)",
          code: `from collections import defaultdict

# This code is supposed to count word occurrences,
# but the author still wrote it like a plain dict.
# What's redundant? Delete the unnecessary lines, then run.

words = ["buy", "sell", "buy", "hold", "buy", "sell"]

counts = defaultdict(int)
for word in words:
    if word not in counts:
        counts[word] = 0
    counts[word] += 1

print(dict(counts))`,
          output: `{'buy': 3, 'sell': 2, 'hold': 1}`,
          explanation: `The \`if word not in counts: counts[word] = 0\` is the bookkeeping defaultdict already does for you. The whole point of \`defaultdict(int)\` is that \`counts[word]\` is guaranteed to start at 0. Those two lines defeat the purpose.

The clean version is just:

\`\`\`python
counts = defaultdict(int)
for word in words:
    counts[word] += 1
\`\`\`

Articulating *why* the if-block is wrong is what locks in the lesson — defaultdict's job is to eliminate exactly that bookkeeping.`,
          runnable: true,
        },
      ],
    },

    // ================================================================
    // 4. The trap: looking up a key creates it
    // ================================================================
    {
      title: "The trap: looking up a key creates it",
      blocks: [
        {
          kind: "prose",
          markdown: `Remember the one-sentence mechanism from section 2? *"Call the factory, store the result, return it."* The trap is the second word: **store**. Let's see if you can predict the consequence before reading on.`,
        },
        {
          kind: "warm_up",
          title: "predict the trap",
          prompt: `Suppose I run:

\`\`\`python
d = defaultdict(int)
x = d['TSLA']     # just reading, right?
\`\`\`

What is \`len(d)\` afterwards? (Answer as a number.)`,
          answer: "1",
          explanation: `Most people guess 0 here — "I'm just reading, why would the dict grow?" But the mechanism says: on a missing key, defaultdict **stores** the factory's result before returning. So \`d['TSLA']\` created the entry \`'TSLA': 0\` as a side effect, and \`len(d)\` is now 1. Looking is writing.`,
        },
        {
          kind: "code_predict",
          label: "see the mechanism explicitly (you can call __missing__ yourself)",
          code: `from collections import defaultdict

d = defaultdict(int)
print(len(d))            # before: empty

# This is what d['x'] does under the hood — you can call it directly:
d.__missing__('x')

print(len(d))            # after: __missing__ stored 'x'
print(dict(d))`,
          output: `0\n1\n{'x': 0}`,
          explanation: `defaultdict's secret is the \`__missing__\` dunder method. When you write \`d[k]\` and \`k\` is missing, Python's dict machinery calls \`d.__missing__(k)\`, which calls \`default_factory()\`, **stores** the result at \`d[k]\`, and returns it.

You normally never call \`__missing__\` directly — but seeing it makes the trap concrete. The store is the whole point.`,
          runnable: true,
        },
        {
          kind: "code_predict",
          label: "accidental key creation",
          code: `from collections import defaultdict

trade_count = defaultdict(int)
trade_count["AAPL"] = 5
trade_count["GOOG"] = 3

# "I just want to check TSLA..."
tsla_count = trade_count["TSLA"]

print(f"TSLA trades: {tsla_count}")
print(f"Total tickers: {len(trade_count)}")
print(f"All tickers: {list(trade_count.keys())}")`,
          output: `TSLA trades: 0\nTotal tickers: 3\nAll tickers: ['AAPL', 'GOOG', 'TSLA']`,
          explanation: `We set AAPL to 5 and GOOG to 3 — so there are 2 keys. Then we read trade_count["TSLA"]. TSLA wasn't there, so defaultdict created it with value 0. Now there are 3 keys, and TSLA is one of them — even though we never meant to add it.

This is the one trap with defaultdict. The fix is simple.`,
        },
        {
          kind: "prose",
          markdown: `Use \`.get()\` when you want to look without touching:

\`\`\`python
trade_count.get("TSLA", 0)   # returns 0, does NOT create the key
"TSLA" in trade_count         # returns False, does NOT create the key
\`\`\`

Rule of thumb: use \`d[key]\` when you're writing to the dict (appending, counting). Use \`d.get(key)\` when you're just reading.`,
        },
        {
          kind: "warm_up",
          title: "safe lookup",
          prompt:
            'You have a `defaultdict(int)` called `counts` with some data in it. You want to check how many TSLA trades there are, but you do NOT want to accidentally add TSLA to the dict. What do you write?',
          answer: 'counts.get("TSLA", 0)',
          explanation:
            ".get() never triggers the factory — it just returns the fallback value (0 here) if the key is missing. d[key] always triggers it.",
        },
        {
          kind: "multiple_choice",
          title: "which lines grow the dict?",
          prompt:
            "Start with `d = defaultdict(int)` (empty). Which of the four lines below would ADD a key to `d`? Pick the option listing ONLY the lines that mutate.",
          code: `d = defaultdict(int)

# Line 1:  d['a'] += 1
# Line 2:  'b' in d
# Line 3:  d.get('c', 0)
# Line 4:  x = d['d']`,
          choices: [
            {
              text: "Lines 1 and 4 only",
              correct: true,
              rationale:
                "Only subscript access on a missing key triggers __missing__. Line 1 mutates via += (which is a write). Line 4 looks like a read but is also a subscript — it stores 'd': 0 as a side effect.",
            },
            {
              text: "Lines 1, 2, and 4",
              correct: false,
              rationale:
                "The `in` operator does NOT call __missing__ — it goes through dict's __contains__, which just checks membership and returns False.",
            },
            {
              text: "All four lines",
              correct: false,
              rationale:
                ".get() and `in` are both factory-safe. They're the two main escape hatches from the trap.",
            },
            {
              text: "Only line 1",
              correct: false,
              rationale:
                "Line 4 is the subtle one — `x = d['d']` looks like a read, but defaultdict ALWAYS stores on missing subscript access. That's the trap.",
            },
          ],
          explanation:
            "The two factory-safe operations are `.get(key, default)` and `key in d`. Everything that uses `d[key]` — even on the right side of an assignment — triggers __missing__ and stores. This is the whole content of section 4 in one question.",
        },
      ],
    },

    // ================================================================
    // 5. Custom defaults with lambda
    // ================================================================
    {
      title: "Custom defaults with lambda",
      blocks: [
        {
          kind: "prose",
          markdown: `So far the factory has always been a built-in type — \`list\`, \`int\`, or \`set\`. But what if you want missing keys to start with a specific value, like the string \`"hold"\` or the number \`100.0\`? You need a custom function.

Python has a shorthand for tiny one-line functions called \`lambda\`. Here's how it works:

\`\`\`python
lambda: "hold"
\`\`\`

That means: "a function that takes nothing and returns the string 'hold'." It's the same as writing \`def my_func(): return "hold"\`, just shorter. Let's use it:`,
        },
        {
          kind: "code_predict",
          label: "lambda — default stock rating",
          code: `from collections import defaultdict

ratings = defaultdict(lambda: "hold")
ratings["AAPL"] = "buy"
ratings["META"] = "sell"

print(ratings["AAPL"])
print(ratings["GOOG"])
print(ratings["NVDA"])
print(len(ratings))`,
          output: `buy\nhold\nhold\n4`,
          explanation: `AAPL was explicitly set to "buy", so it prints "buy". GOOG was never set, so defaultdict calls the lambda, which returns "hold". Same for NVDA.

But watch out — accessing GOOG and NVDA created them as keys. We started with 2 keys (AAPL, META), and now we have 4 (AAPL, META, GOOG, NVDA). That's the same trap from the previous section.`,
        },
        {
          kind: "warm_up",
          title: "write a factory",
          prompt:
            "Write a lambda that returns `100.0` — to use as a default starting stock price.",
          answer: "lambda: 100.0",
          explanation:
            "Any lambda that returns your desired default value works. You could also write a named function: def default_price(): return 100.0",
        },
        {
          kind: "prose",
          markdown: `You can also make the factory return **another defaultdict**. This is useful when you need to group things along two dimensions — like sorting items first by category, then by subcategory:`,
        },
        {
          kind: "code_predict",
          label: "nested defaultdict — two levels of grouping",
          code: `from collections import defaultdict

by_sector = defaultdict(lambda: defaultdict(list))
by_sector["tech"]["AAPL"].append(150.0)
by_sector["tech"]["GOOG"].append(2800.0)
by_sector["tech"]["AAPL"].append(151.25)
by_sector["finance"]["JPM"].append(140.0)

for sector, tickers in by_sector.items():
    print(f"{sector}: {dict(tickers)}")`,
          output: `tech: {'AAPL': [150.0, 151.25], 'GOOG': [2800.0]}\nfinance: {'JPM': [140.0]}`,
          explanation: `Two levels of auto-creation. When we write by_sector["tech"], the outer defaultdict creates a new defaultdict(list) for "tech". Then when we write ["AAPL"], the inner defaultdict creates an empty list for "AAPL". The whole structure builds itself as you use it — no setup needed.`,
        },
        {
          kind: "key_insight",
          label: "When to stop nesting",
          insight: `Nesting works well for 2 levels. Beyond that, the code gets hard to read. If you need 3+ levels of grouping, switch to a \`@dataclass\` or a dictionary of dataclasses instead.`,
        },
        {
          kind: "multiple_choice",
          title: "fill in the blank: nested factory",
          prompt:
            "You want a two-level structure: sector → ticker → list of prices, all auto-creating. Which goes in the blank?",
          code: `from collections import defaultdict

by_sector = defaultdict(______)
by_sector['tech']['AAPL'].append(150.0)`,
          choices: [
            {
              text: "list",
              correct: false,
              rationale:
                "defaultdict(list) means missing keys map to [], so `by_sector['tech']` would be a list, not another dict. Then ['AAPL'] would fail.",
            },
            {
              text: "defaultdict(list)",
              correct: false,
              rationale:
                "Subtle — but the factory must be CALLABLE WITH NO ARGS. `defaultdict(list)` is an instance, not a callable that returns a fresh one. You'd reuse the SAME inner dict for every sector.",
            },
            {
              text: "lambda: defaultdict(list)",
              correct: true,
              rationale:
                "A lambda that returns a NEW defaultdict(list) each time it's called. Each sector gets its own inner dict. This is the canonical 2-level nesting pattern.",
            },
            {
              text: "dict(list)",
              correct: false,
              rationale:
                "`dict(list)` is just an empty dict — it has no auto-create behavior. The outer key would map to a static empty dict and ['AAPL'].append would raise.",
            },
          ],
          explanation:
            "The factory must be a callable that produces a FRESH inner dict on each call. `lambda: defaultdict(list)` is a 0-arg callable that does exactly that. The subtle wrong answer (defaultdict(list)) is the most common bug — passing the instance instead of a factory that produces fresh instances.",
        },
      ],
    },

    // ================================================================
    // 6. API cheat sheet
    // ================================================================
    {
      title: "API cheat sheet",
      blocks: [
        {
          kind: "prose",
          markdown: `Here's a quick reference card for everything defaultdict can do. Tap any method to see what it returns:`,
        },
        {
          kind: "method_ref",
          title: "defaultdict",
          importLine: "from collections import defaultdict",
          methods: [
            {
              signature: "defaultdict(factory)",
              description:
                "Create a new defaultdict. The factory is any function that takes no arguments — like list, int, set, or a lambda.",
              returns:
                "A new defaultdict instance. Behaves like a regular dict, but auto-creates missing keys.",
            },
            {
              signature: "d[key]",
              description:
                "Access a key. If missing, calls the factory, stores the result, and returns it. This is the auto-creation behavior.",
              returns:
                "The value at that key (existing or newly created).",
            },
            {
              signature: "d.get(key, default)",
              description:
                "Access a key WITHOUT triggering the factory. Safe for read-only lookups.",
              returns:
                "The value if key exists, otherwise default (None if not specified).",
            },
            {
              signature: "d.default_factory",
              description:
                "The factory function itself. You can read it, change it, or set it to None to disable auto-creation.",
              returns:
                "The function you passed in, e.g. list, int, set.",
            },
          ],
        },
      ],
    },

    // ================================================================
    // 7. When to use what
    // ================================================================
    {
      title: "When to use what",
      blocks: [
        {
          kind: "prose",
          markdown: `defaultdict is the right tool when you're **looping over data and grouping, counting, or collecting** as you go. But Python has other tools for related situations:

**\`dict.get(key, fallback)\`** — returns a fallback value but does NOT create the key. Use this when you just want to look something up.

**\`dict.setdefault(key, default)\`** — creates the key if missing (like defaultdict), but one key at a time. Use this on regular dicts you got from elsewhere.

**\`Counter\`** — like \`defaultdict(int)\`, but comes with extras like \`.most_common()\`. Use it when counting is the entire job.

For each scenario below, decide which tool you'd reach for:`,
        },
        {
          kind: "flashcard",
          context: "Building a data pipeline",
          front:
            "You have a stream of stock trades and need to group them by ticker symbol into lists.",
          back: "defaultdict(list) — loop through trades and call .append(). No need to check if the key exists first.",
        },
        {
          kind: "flashcard",
          context: "Read-only lookup",
          front:
            "You want to check a stock's rating but NOT create a key if it's unrated.",
          back: "dict.get(key, 'unrated') — returns the fallback without adding anything to the dict.",
        },
        {
          kind: "flashcard",
          context: "Analytics query",
          front:
            "You need to count trade volume per ticker and find the top 5 most active.",
          back: "Counter(tickers).most_common(5) — Counter is like defaultdict(int) but comes with .most_common() built in.",
        },
        {
          kind: "flashcard",
          context: "Deduplication",
          front:
            "You need to track which unique exchanges each stock trades on.",
          back: "defaultdict(set) — call exchanges[ticker].add(exchange_name). The set handles duplicates automatically.",
        },
        {
          kind: "flashcard",
          context: "Default values without side effects",
          front:
            "You want every untracked stock to show 'hold' as its rating, but you DON'T want untracked stocks stored in the dict.",
          back: "dict.get(ticker, 'hold') — NOT defaultdict. defaultdict would store 'hold' at every ticker you look up.",
        },
        {
          kind: "flashcard",
          context: "Multi-level grouping",
          front:
            "You need to group stocks by sector, then by ticker, then collect prices into lists.",
          back: "defaultdict(lambda: defaultdict(list)) — nested factories. Beyond 2 levels, consider a dataclass.",
        },
        {
          kind: "multiple_choice",
          title: "Counter vs defaultdict(int)",
          prompt:
            "When should you reach for `Counter` instead of `defaultdict(int)`?",
          choices: [
            {
              text: "When counting needs to be faster than defaultdict",
              correct: false,
              rationale:
                "They're essentially identical in speed for counting. Speed is not the reason to choose Counter.",
            },
            {
              text: "When you need methods like `.most_common(n)` or arithmetic between counters",
              correct: true,
              rationale:
                "Counter is a defaultdict(int) PLUS extras: .most_common, .elements, and arithmetic (c1 + c2 sums counts; c1 - c2 subtracts). If you need any of those, use Counter.",
            },
            {
              text: "When you don't want missing keys to auto-create",
              correct: false,
              rationale:
                "Counter behaves like defaultdict(int) here — missing keys return 0, but unlike defaultdict, Counter does NOT store them on access (this is a small Counter-specific quirk). The main reason to choose Counter is the extra methods.",
            },
            {
              text: "When keys must be hashable",
              correct: false,
              rationale:
                "Both Counter and defaultdict require hashable keys. That's a dict invariant, not a Counter-specific feature.",
            },
          ],
          explanation:
            "Default rule: `defaultdict(int)` for ad-hoc counting inside a larger pipeline; `Counter(iterable)` when counting IS the task and you want `.most_common(n)` or counter arithmetic.",
        },
        {
          kind: "multiple_choice",
          title: "the read-only requirement",
          prompt:
            "Your code receives a dict of stock ratings from another module. You want to look up `'GOOG'` and fall back to `'unrated'` if missing — but you must NOT mutate the dict. Which is correct?",
          code: `# ratings is a regular dict you received from elsewhere
# You don't own it — don't mutate it`,
          choices: [
            {
              text: "ratings['GOOG']",
              correct: false,
              rationale:
                "On a regular dict this raises KeyError when the key is missing. Even if it didn't, this isn't a fallback.",
            },
            {
              text: "ratings.get('GOOG', 'unrated')",
              correct: true,
              rationale:
                "`.get` returns the fallback value WITHOUT mutating the dict. This works on both regular dicts and defaultdicts — and is the safe read-only choice.",
            },
            {
              text: "ratings.setdefault('GOOG', 'unrated')",
              correct: false,
              rationale:
                "setdefault DOES mutate — it stores 'unrated' at 'GOOG' if missing. This is exactly what you're told NOT to do.",
            },
            {
              text: "defaultdict(lambda: 'unrated')(ratings)",
              correct: false,
              rationale:
                "Not valid syntax for what you want, and even if it were, defaultdict mutates on access — the same problem.",
            },
          ],
          explanation:
            "Read-only lookups: `.get(key, fallback)`. Lookups that should also create-if-missing: `setdefault` (regular dict) or `d[key]` (defaultdict). The verb 'set' in setdefault is the giveaway that it mutates.",
        },
      ],
    },

    // ================================================================
    // 8. Warm-up: count and group in one pass
    // ================================================================
    {
      title: "Warm-up: count and group in one pass",
      blocks: [
        {
          kind: "prose",
          markdown: `Let's make sure the basic pattern is solid before moving to harder problems.`,
        },
        {
          kind: "mini_challenge",
          title: "Trade summary",
          runnable: true,
          starterCode: `from collections import defaultdict

trades = [("AAPL", 150.0), ("GOOG", 2800.0), ("AAPL", 151.25), ("GOOG", 2795.0), ("MSFT", 300.0)]

# Build prices (list) and counts (int) with one loop.
prices = ...
counts = ...

print(dict(prices))
print(dict(counts))
`,
          prompt: `Given a list of trades, produce two things using **one for loop**:
1. A dict mapping each ticker to its **list of prices**
2. A dict mapping each ticker to the **number of trades**

\`\`\`python
trades = [("AAPL", 150.0), ("GOOG", 2800.0), ("AAPL", 151.25), ("GOOG", 2795.0), ("MSFT", 300.0)]
\`\`\`

Expected:
- prices: \`{"AAPL": [150.0, 151.25], "GOOG": [2800.0, 2795.0], "MSFT": [300.0]}\`
- counts: \`{"AAPL": 2, "GOOG": 2, "MSFT": 1}\``,
          hints: [
            "You need two defaultdicts: one with factory list, one with factory int.",
            "Both can be populated in the same for loop — one .append(), one += 1.",
          ],
          solution: `from collections import defaultdict

trades = [("AAPL", 150.0), ("GOOG", 2800.0), ("AAPL", 151.25), ("GOOG", 2795.0), ("MSFT", 300.0)]

prices = defaultdict(list)
counts = defaultdict(int)
for ticker, price in trades:
    prices[ticker].append(price)
    counts[ticker] += 1

print(dict(prices))
print(dict(counts))`,
          takeaway:
            "Two defaultdicts, one loop, zero if-checks. This is the basic muscle memory you need before tackling harder problems.",
        },
      ],
    },

    // ================================================================
    // 9. Challenge: Group anagram tickers
    // ================================================================
    {
      title: "Challenge: Group anagram tickers",
      blocks: [
        {
          kind: "prose",
          markdown: `Two words are **anagrams** if they use exactly the same letters, just in a different order. For example, "AAPL", "LPAA", and "PAAL" are all anagrams of each other — they all have two A's, one L, and one P.

This is a grouping problem. The question is: what should the grouping key be? What property do all anagrams share?`,
        },
        {
          kind: "warm_up",
          title: "the anagram trick",
          prompt:
            'If you sort the letters of "AAPL" alphabetically, you get [\'A\', \'A\', \'L\', \'P\']. If you sort the letters of "LPAA", what do you get?',
          answer: "['A', 'A', 'L', 'P']",
          explanation:
            "All anagrams produce the same sorted letters. That's the key insight — use the sorted letters as your grouping key.",
        },
        {
          kind: "prose",
          markdown: `So the grouping key is \`sorted(word)\` — but there's one catch. \`sorted()\` returns a list, and lists can't be dict keys (they're mutable). Wrapping it in \`tuple()\` makes it hashable: \`tuple(sorted(word))\`.

Now try the challenge:`,
        },
        {
          kind: "mini_challenge",
          title: "Group anagram tickers",
          runnable: true,
          starterCode: `from collections import defaultdict

def group_anagrams(words: list[str]) -> list[list[str]]:
    # Group words that are anagrams of each other.
    ...

print(group_anagrams(["AAPL", "GOOG", "LPAA", "MSFT", "PAAL", "OGOG"]))
`,
          prompt: `Given a list of strings, group all anagrams together.

\`\`\`python
words = ["AAPL", "GOOG", "LPAA", "MSFT", "PAAL", "OGOG"]
# "AAPL", "LPAA", "PAAL" are anagrams of each other
# "GOOG", "OGOG" are anagrams of each other
# "MSFT" stands alone
\`\`\`

Expected output: \`[["AAPL", "LPAA", "PAAL"], ["GOOG", "OGOG"], ["MSFT"]]\`

Use \`defaultdict(list)\` to collect the groups.`,
          hints: [
            "The grouping key is tuple(sorted(word)) — all anagrams will produce the same key.",
            "Loop through words, compute the key for each, and append the word to groups[key].",
          ],
          solution: `from collections import defaultdict

def group_anagrams(words: list[str]) -> list[list[str]]:
    groups = defaultdict(list)
    for word in words:
        key = tuple(sorted(word.upper()))
        groups[key].append(word)
    return list(groups.values())

print(group_anagrams(["AAPL", "GOOG", "LPAA", "MSFT", "PAAL", "OGOG"]))
# [['AAPL', 'LPAA', 'PAAL'], ['GOOG', 'OGOG'], ['MSFT']]`,
          takeaway:
            "Same pattern as always: (1) choose your grouping key, (2) defaultdict(list), (3) loop and append. The only creative part is the key — here it's tuple(sorted(word)).",
        },
      ],
    },

    // ================================================================
    // 10. Challenge: Portfolio sector tracker
    // ================================================================
    {
      title: "Challenge: Portfolio sector tracker",
      blocks: [
        {
          kind: "prose",
          markdown: `This challenge uses all three recipes — \`list\`, \`int\`, and \`set\` — in one problem. Before you code, read the three requirements below and decide which recipe fits each one.`,
        },
        {
          kind: "mini_challenge",
          title: "Portfolio sector tracker",
          prompt: `Given trade records:

\`\`\`python
trades = [
    {"ticker": "AAPL", "sector": "tech", "shares": 10, "price": 150.0},
    {"ticker": "GOOG", "sector": "tech", "shares": 5,  "price": 2800.0},
    {"ticker": "JPM",  "sector": "finance", "shares": 20, "price": 140.0},
    {"ticker": "AAPL", "sector": "tech", "shares": 15, "price": 151.0},
    {"ticker": "AMZN", "sector": "tech", "shares": 8,  "price": 3300.0},
    {"ticker": "JPM",  "sector": "finance", "shares": 10, "price": 142.0},
    {"ticker": "BAC",  "sector": "finance", "shares": 50, "price": 38.0},
]
\`\`\`

Produce three results:
1. **Trades per sector** — how many trades in each sector
2. **Unique tickers per sector** — the set of distinct tickers per sector
3. **All prices per ticker** — a list of all trade prices for each ticker

Think about which recipe (\`list\`, \`int\`, or \`set\`) fits each requirement.`,
          hints: [
            "defaultdict(int) for counting, defaultdict(set) for uniques, defaultdict(list) for grouping — you need all three.",
            "You can populate all three in a single for loop through the trades list.",
          ],
          solution: `from collections import defaultdict

def analyze_portfolio(trades):
    sector_trade_count = defaultdict(int)
    sector_tickers = defaultdict(set)
    ticker_prices = defaultdict(list)

    for t in trades:
        sector_trade_count[t["sector"]] += 1
        sector_tickers[t["sector"]].add(t["ticker"])
        ticker_prices[t["ticker"]].append(t["price"])

    return {
        "trades_per_sector": dict(sector_trade_count),
        "tickers_per_sector": {s: tickers for s, tickers in sector_tickers.items()},
        "prices_per_ticker": dict(ticker_prices),
    }`,
          takeaway:
            "Each sub-task maps to a different recipe: int for counting, set for uniques, list for grouping. All three in one pass.",
        },
      ],
    },

    // ================================================================
    // 11. Challenge: Build a simple search index
    // ================================================================
    {
      title: "Challenge: Build a simple search index",
      blocks: [
        {
          kind: "prose",
          markdown: `A search index is like the index at the back of a textbook. For every important word, it lists which pages that word appears on. We'll do the same thing, but instead of pages, we'll use headline numbers (0, 1, 2...).

For each word, we store the **set** of headlines that contain it. Then, to search for headlines containing a word, we just look it up in the index.`,
        },
        {
          kind: "warm_up",
          title: "building an index entry",
          prompt: `If headline 0 is "AAPL beats estimates" and headline 1 is "GOOG beats records", which headline numbers should be in the index entry for the word "beats"?`,
          answer: "{0, 1}",
          explanation:
            'The word "beats" appears in both headline 0 and headline 1, so its index entry is the set {0, 1}.',
        },
        {
          kind: "prose",
          markdown: `To search for headlines containing **all** of several words, you find the set for each word and take the **overlap** — the items that appear in every set. In Python, you use \`&\` between two sets to get their overlap:

\`\`\`python
{0, 1, 2} & {1, 2, 3}  # → {1, 2} — only 1 and 2 are in both
\`\`\``,
        },
        {
          kind: "mini_challenge",
          title: "Stock news search index",
          prompt: `Build a search index from these headlines, then write a search function:

\`\`\`python
headlines = [
    "AAPL beats earnings estimates in strong quarter",
    "GOOG announces new AI research partnership",
    "AAPL and MSFT lead tech sector rally",
    "NVDA earnings miss sends stock lower",
    "GOOG AI model beats benchmarks in new study",
]
\`\`\`

1. Build an index mapping each word → set of headline numbers (0–4)
2. Write \`search(index, *words)\` that returns the set of headline numbers containing ALL the given words

Examples:
- \`search(index, "AAPL")\` → \`{0, 2}\`
- \`search(index, "GOOG", "AI")\` → \`{1, 4}\``,
          hints: [
            "Use defaultdict(set). For each word in each headline, add the headline's number to that word's set.",
            "For search: start with the set for the first word, then use & with each additional word's set to narrow it down.",
          ],
          solution: `from collections import defaultdict

def build_index(headlines):
    index = defaultdict(set)
    for i, headline in enumerate(headlines):
        for word in headline.split():
            index[word].add(i)
    return index

def search(index, *words):
    if not words:
        return set()
    result = index[words[0]]
    for word in words[1:]:
        result = result & index[word]
    return result

headlines = [
    "AAPL beats earnings estimates in strong quarter",
    "GOOG announces new AI research partnership",
    "AAPL and MSFT lead tech sector rally",
    "NVDA earnings miss sends stock lower",
    "GOOG AI model beats benchmarks in new study",
]
idx = build_index(headlines)
print(search(idx, "AAPL"))           # {0, 2}
print(search(idx, "GOOG", "AI"))     # {1, 4}
print(search(idx, "beats"))          # {0, 4}`,
          takeaway:
            "Same defaultdict pattern, but with set instead of list (we want unique headline numbers). The search uses set overlap (&) to find headlines that match all words. This is the basic idea behind how search engines find documents.",
        },
      ],
    },

    // ================================================================
    // 12. Lock it in: cold recall from memory
    // ================================================================
    {
      title: "Lock it in: cold recall from memory",
      blocks: [
        {
          kind: "prose",
          markdown: `This is the most important section in the guide. Recognition (seeing the right answer and going "yep, that's it") is **not** learning. **Retrieval** — reconstructing the answer from memory before you check — is what builds durable knowledge.

Scroll back **only after** you've tried each prompt. Treat being wrong as a feature; the act of being wrong and then correcting yourself is what locks it in.`,
        },
        {
          kind: "warm_up",
          title: "the recall grid — fill it from memory",
          prompt: `Without scrolling up, complete this grid. Answer in this format, one row per line:

\`\`\`
pattern | factory | operation | one example
\`\`\`

Three rows: **group**, **count**, **collect unique**.`,
          answer: `group | list | .append() | bucket trades by ticker
count | int | += 1 | tally word frequencies
collect unique | set | .add() | track distinct cities per user`,
          explanation: `If you got all three rows without peeking, you own the core idea. If you missed one, *that's* the one you'll forget tomorrow — write it on a sticky note and revisit it in 24 hours. The pattern-factory-operation triple is the entire mental model of defaultdict.`,
        },
        {
          kind: "warm_up",
          title: "the mechanism in one sentence",
          prompt: `In your own words: when you write \`d[key]\` on a defaultdict and the key is missing, what three things happen, in order?`,
          answer:
            "Call default_factory(); store the result at d[key]; return it.",
          explanation: `This sentence is the single most useful thing to memorize. It explains both why grouping works (the **store** guarantees an empty container for .append) AND why looking creates keys (the **store** happens even on a read-shaped access).`,
        },
        {
          kind: "warm_up",
          title: "trap recall",
          prompt: `You have a populated \`defaultdict(int)\` called \`counts\`. You want to safely check whether \`"TSLA"\` is in there WITHOUT adding it. Write two different one-liners that work.`,
          answer: '"TSLA" in counts   OR   counts.get("TSLA", 0)',
          explanation: `Both \`in\` and \`.get()\` bypass \`__missing__\` — they don't call the factory. Only the subscript form \`counts[key]\` triggers auto-creation.`,
        },
        {
          kind: "multiple_choice",
          title: "cold recall: what is len(d)?",
          prompt:
            "Without looking at earlier sections, predict `len(d)` after this runs.",
          code: `from collections import defaultdict

d = defaultdict(list)
d['a'].append(1)
x = d['b']
y = d.get('c', [])
'd' in d`,
          choices: [
            {
              text: "1",
              correct: false,
              rationale:
                "Only 'a' would create — but you're missing one. `d['b']` is a subscript on a missing key, which also stores.",
            },
            {
              text: "2",
              correct: true,
              rationale:
                "'a' (from append, which is a subscript+method) and 'b' (from `x = d['b']`, also a subscript) both store. .get() and `in` do NOT store. So len(d) == 2.",
            },
            {
              text: "3",
              correct: false,
              rationale:
                ".get('c', []) returns [] but does NOT store 'c'. It's the read-safe path.",
            },
            {
              text: "4",
              correct: false,
              rationale:
                "`'d' in d` returns False but never triggers the factory. It's the other read-safe path.",
            },
          ],
          explanation:
            "Two operations store: `d['a'].append(...)` and `x = d['b']`. Two don't: `.get(...)` and `in`. Recognizing which ops mutate vs read is the entire takeaway of the trap section.",
        },
        {
          kind: "multiple_choice",
          title: "cold recall: choose the recipe",
          prompt:
            "You receive a stream of `(user_id, page_url)` events. You want a structure where you can ask: 'how many DISTINCT pages did user U visit?' The answer must not double-count repeat visits. Which initial structure?",
          choices: [
            {
              text: "defaultdict(int) — increment on every event",
              correct: false,
              rationale:
                "This counts TOTAL visits, including duplicates. We want distinct.",
            },
            {
              text: "defaultdict(list) — append every page",
              correct: false,
              rationale:
                "Stores duplicates. You'd then have to `len(set(pages))` at query time — wasteful and a separate bug source.",
            },
            {
              text: "defaultdict(set) — add every page",
              correct: true,
              rationale:
                "Set dedups on insert. `len(pages[user])` gives distinct count directly.",
            },
            {
              text: "Counter() — count every (user, page) pair",
              correct: false,
              rationale:
                "Would work but you'd then have to filter and count distinct keys per user — much more complex than `defaultdict(set)`.",
            },
          ],
          explanation:
            "Key word: DISTINCT. That's the set signal. Whenever you hear 'unique', 'distinct', or 'deduplicated' as a requirement, `defaultdict(set)` is almost always the right answer.",
        },
        {
          kind: "code_predict",
          label: "BUG HUNT — fix it, then run",
          code: `from collections import defaultdict

# Goal: count how many distinct cities each person has visited.
# This code has TWO bugs. Find them, fix them, run.

visits = [
    ("Alice", "Paris"),
    ("Alice", "Paris"),
    ("Alice", "London"),
    ("Bob", "Paris"),
]

cities = defaultdict(list)            # bug #1: wrong factory
for person, city in visits:
    cities[person].append(city)

# bug #2: this prints the wrong thing for "distinct cities"
for person in cities:
    print(person, len(cities[person]))`,
          output: `Alice 2\nBob 1`,
          explanation: `Two related bugs:

1. **Wrong factory.** \`defaultdict(list)\` keeps every visit, including duplicates — Alice visits Paris twice and we'd count it twice. Use \`defaultdict(set)\` and \`.add()\` instead.
2. **Wrong count.** With a list, \`len()\` gives the number of *visits*, not distinct cities. With a set, \`len()\` correctly gives distinct cities.

The fix:

\`\`\`python
cities = defaultdict(set)
for person, city in visits:
    cities[person].add(city)
for person in cities:
    print(person, len(cities[person]))
\`\`\`

This is the "pick the right recipe" skill in a real bug. Notice how the wrong choice still *runs* — it just silently produces the wrong answer. That's why being deliberate about factory choice matters.`,
          runnable: true,
        },
        {
          kind: "key_insight",
          label: "Spaced practice plan",
          insight: `**Day 1 (today):** Finish this guide. Don't look at solutions until you've tried.

**Day 2 (tomorrow):** Without opening the guide, re-do the recall grid above on paper. Then reimplement *one* of the three challenges from memory.

**Day 4:** Reimplement *all three* challenges from memory. Time yourself — you should beat your day-2 time.

**Day 7:** Pick a piece of code you've written in the past month that uses a plain dict for grouping or counting. Refactor it to use defaultdict. If the refactor doesn't feel automatic by then, you've found exactly the section to revisit.

This is the difference between "I read about defaultdict once" and "defaultdict is the first thing my fingers reach for."`,
        },
      ],
    },
  ],
};
