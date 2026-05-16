import type { StudyGuide } from "../guide-types";

export const dataclassesTypingPatternsGuide: StudyGuide = {
  topicTitle: "dataclasses & typing patterns",
  topicSlug: "dataclasses-typing-patterns",
  sections: [
    // ================================================================
    // 1. Why @dataclass exists
    // ================================================================
    {
      title: "Why @dataclass exists",
      blocks: [
        {
          kind: "prose",
          markdown: `You're three weeks into an FDE engagement and the customer asks for "just one more field" on the \`SupportTicket\` object that flows through your eval pipeline. You open the file and see this:

\`\`\`python
class SupportTicket:
    def __init__(self, id, body, customer_id, created_at, priority, tags):
        self.id = id
        self.body = body
        self.customer_id = customer_id
        self.created_at = created_at
        self.priority = priority
        self.tags = tags

    def __repr__(self):
        return f"SupportTicket(id={self.id!r}, body={self.body!r}, ...)"

    def __eq__(self, other):
        if not isinstance(other, SupportTicket):
            return NotImplemented
        return (self.id, self.body, self.customer_id, ...) == (other.id, ...)
\`\`\`

Every new field is six edits in three places, and someone will forget one. The Python team got tired of writing this same boilerplate around 2018 and shipped \`@dataclass\` in **PEP 557 / Python 3.7**. It generates \`__init__\`, \`__repr__\`, and \`__eq__\` from type-annotated class attributes — and that's just the floor.

Anthropic Python codebases lean *heavily* on dataclasses for request/response shapes, eval rows, and config objects. If you can't fluently read and modify them in your sleep, you'll trip every day of an FDE rotation.`,
        },
        {
          kind: "code_comparison",
          label: "plain class vs @dataclass — the same SupportTicket",
          left: {
            title: "Hand-written class (the way nobody writes anymore)",
            code: `class SupportTicket:
    def __init__(self, id, body, customer_id,
                 created_at, priority="normal", tags=None):
        self.id = id
        self.body = body
        self.customer_id = customer_id
        self.created_at = created_at
        self.priority = priority
        self.tags = tags if tags is not None else []

    def __repr__(self):
        return (f"SupportTicket(id={self.id!r}, "
                f"body={self.body!r}, ...)")

    def __eq__(self, other):
        if not isinstance(other, SupportTicket):
            return NotImplemented
        return (self.id, self.body, self.customer_id,
                self.created_at, self.priority, self.tags) \\
             == (other.id, other.body, other.customer_id,
                 other.created_at, other.priority, other.tags)`,
            annotation:
              "~20 lines, every field repeated four times (annotation, __init__ arg, attribute assignment, __eq__ tuple). One typo in one place silently breaks equality.",
          },
          right: {
            title: "@dataclass version",
            code: `from dataclasses import dataclass, field
from datetime import datetime

@dataclass
class SupportTicket:
    id: str
    body: str
    customer_id: str
    created_at: datetime
    priority: str = "normal"
    tags: list[str] = field(default_factory=list)`,
            annotation:
              "Each field declared once. __init__, __repr__, __eq__ generated for free. Adding a new field is a one-line edit, not a six-place audit.",
          },
          takeaway:
            "The decorator inspects the class's type annotations at class-creation time and synthesizes the dunder methods. There's no runtime magic at instance-creation time — calling SupportTicket(...) runs an ordinary __init__.",
        },
        {
          kind: "code_predict",
          label: "what @dataclass actually generates",
          code: `from dataclasses import dataclass, fields

@dataclass
class Point:
    x: int
    y: int = 0

p = Point(3)
print(p)
print(p == Point(3, 0))
print([f.name for f in fields(Point)])`,
          output: `Point(x=3, y=0)
True
['x', 'y']`,
          explanation:
            "Three things to notice. (1) The default __repr__ uses the class name and lists all fields by name — not `<Point object at 0x...>`. (2) __eq__ compares **by value, field-by-field**, not by identity. (3) `dataclasses.fields()` introspects the field list at runtime, useful for serialization helpers.",
          runnable: true,
        },
        {
          kind: "key_insight",
          label: "Annotations make the dataclass, not assignments",
          insight: `\`@dataclass\` only treats an attribute as a *field* if it has a **type annotation**. A bare assignment without an annotation is just a class attribute, invisible to \`__init__\`, \`__repr__\`, and \`__eq__\`.

\`\`\`python
@dataclass
class Mistake:
    x: int          # ✅ field — required positional arg
    y = 5           # ❌ NOT a field — just a class attribute, shared by all instances
    z: int = 10     # ✅ field with default
\`\`\`

This bites everyone exactly once. If a field "disappears" from \`__init__\`, check that it has a type annotation. If you want \`Any\`, use \`y: Any = 5\` — the annotation, even if loose, is what matters.`,
        },
        {
          kind: "warm_up",
          title: "Required vs default ordering",
          prompt:
            "Why does Python raise `TypeError: non-default argument 'y' follows default argument 'x'` when you write `@dataclass class Pt: x: int = 0; y: int`?",
          answer:
            "Because @dataclass generates `__init__(self, x: int = 0, y: int)`, and Python forbids non-default parameters from following default ones in any function signature. Reorder: required fields first, defaulted fields last.",
          explanation:
            "The rule is just regular Python function-signature ordering bubbling up through code generation. Two workarounds: (1) reorder the fields, or (2) use `dataclasses.KW_ONLY` to make everything keyword-only, which lifts the restriction.",
        },
      ],
    },

    // ================================================================
    // 2. field() — the escape hatch for non-trivial defaults
    // ================================================================
    {
      title: "field() and default_factory",
      blocks: [
        {
          kind: "prose",
          markdown: `Most field defaults are scalars (\`0\`, \`""\`, \`None\`). But the moment you reach for a mutable default — a \`list\`, \`dict\`, or any object — you hit a classic Python footgun. \`@dataclass\` will refuse to let you do it the obvious way:

\`\`\`python
@dataclass
class Cart:
    items: list[str] = []   # ❌ ValueError at class-definition time
\`\`\`

The decorator raises \`ValueError: mutable default <class 'list'> for field items is not allowed: use default_factory\`. It's catching the bug *for you* — the bug being that every instance would share the same list object.

The fix is \`field(default_factory=...)\`, which calls the factory **per instance** at \`__init__\` time:`,
        },
        {
          kind: "code_predict",
          label: "the shared-mutable-default footgun (in a plain class)",
          code: `class BadCart:
    def __init__(self, items=[]):   # ⚠️ default evaluated ONCE at def time
        self.items = items

a = BadCart()
b = BadCart()
a.items.append("apple")
print(a.items)
print(b.items)
print(a.items is b.items)`,
          output: `['apple']
['apple']
True`,
          explanation:
            "The default `[]` is constructed exactly once — when `def __init__` is parsed — and reused for every call that doesn't pass `items`. `a.items` and `b.items` are the *same list*. Mutating one mutates all. This is the bug that `@dataclass` refuses to compile and that `field(default_factory=list)` fixes.",
          runnable: true,
        },
        {
          kind: "code_comparison",
          label: "default_factory vs default",
          left: {
            title: "default — for immutable scalars",
            code: `from dataclasses import dataclass

@dataclass
class Config:
    name: str
    retries: int = 3
    model: str = "claude-sonnet-4-5"
    debug: bool = False`,
            annotation:
              "Strings, ints, floats, bools, tuples, frozensets, None — anything immutable and cheap to share. The same default object is referenced by every instance, which is fine because nobody can mutate it.",
          },
          right: {
            title: "default_factory — for mutable or fresh-per-instance",
            code: `from dataclasses import dataclass, field
from datetime import datetime
import uuid

@dataclass
class Request:
    body: str
    tags: list[str] = field(default_factory=list)
    headers: dict[str, str] = field(default_factory=dict)
    request_id: str = field(default_factory=lambda: uuid.uuid4().hex)
    submitted_at: datetime = field(default_factory=datetime.utcnow)`,
            annotation:
              "Any zero-arg callable works. `list`, `dict`, `set` are common; lambdas are how you parameterize. Each instance gets a fresh result of calling the factory.",
          },
          takeaway:
            "Rule of thumb: if `type(default).__hash__ is None`, you need `default_factory`. Hashability is Python's stand-in for immutability and the dataclass code path checks for the common mutables (list, dict, set) explicitly.",
        },
        {
          kind: "method_ref",
          title: "dataclasses.field — the full parameter surface",
          importLine: "from dataclasses import field",
          methods: [
            {
              signature: "field(default=...)",
              description:
                "Sets a default value. Cannot be combined with `default_factory`. Mostly redundant — `x: int = 0` is shorter.",
            },
            {
              signature: "field(default_factory=callable)",
              description:
                "Zero-arg callable invoked per instance to produce the default. Required for mutable defaults like list, dict, set.",
            },
            {
              signature: "field(init=False)",
              description:
                "Exclude this field from __init__. Pair with a `default` or `default_factory` (or set it in __post_init__), or it'll be unset on the instance.",
            },
            {
              signature: "field(repr=False)",
              description:
                "Hide this field from __repr__. Use for large objects (lists with thousands of items, binary blobs) that would make repr unreadable.",
            },
            {
              signature: "field(compare=False)",
              description:
                "Exclude this field from __eq__ (and __lt__/__gt__ if `order=True`). Useful for cache fields, timestamps, or other 'incidental' state that shouldn't affect equality.",
            },
            {
              signature: "field(hash=None)",
              description:
                "Override hash inclusion independently of `compare`. Defaults to following `compare`. Rarely needed.",
            },
            {
              signature: "field(metadata={...})",
              description:
                "Free-form dict attached to the Field object. Libraries like `marshmallow_dataclass` use this for serialization config. Ignored by the stdlib.",
            },
            {
              signature: "field(kw_only=True)",
              description:
                "Force this single field to be keyword-only in __init__ (Python 3.10+). Useful to add a kw-only field after positional ones without flipping the whole class.",
            },
          ],
        },
        {
          kind: "code_predict",
          label: "init=False with default_factory",
          code: `from dataclasses import dataclass, field

@dataclass
class Counter:
    name: str
    hits: list[int] = field(default_factory=list, init=False, repr=False)

    def hit(self, n: int) -> None:
        self.hits.append(n)

c = Counter("requests")
c.hit(1); c.hit(2); c.hit(3)
print(c)
print(c.hits)`,
          output: `Counter(name='requests')
[1, 2, 3]`,
          explanation:
            "`init=False` removes `hits` from the generated `__init__`, so `Counter('requests')` accepts only one argument. `repr=False` hides it from the auto-repr — useful here because the list might grow unbounded. The field still exists as a normal attribute on the instance; we just opted it out of the auto-machinery.",
          runnable: true,
        },
        {
          kind: "multiple_choice",
          title: "Equality with an incidental timestamp",
          prompt:
            "You have a `CacheEntry(key: str, value: bytes, fetched_at: datetime)` and you want two entries to compare equal if they share the same key and value, regardless of when each was fetched. What's the cleanest dataclass change?",
          choices: [
            {
              text: "Override __eq__ manually after the @dataclass decorator runs.",
              correct: false,
              rationale:
                "Works but defeats the purpose of @dataclass and forfeits the matching auto-hash. You'd reimplement the equality logic by hand for every new field.",
            },
            {
              text: "Set `fetched_at: datetime = field(compare=False)`.",
              correct: true,
              rationale:
                "Exactly what `compare=False` is for. The field stays on the instance and in __repr__, but is excluded from __eq__. Future field additions still get the default behavior.",
            },
            {
              text: "Use `frozen=True` on the dataclass.",
              correct: false,
              rationale:
                "Frozen controls *mutability* (whether you can reassign attributes), not which fields participate in equality. Orthogonal concern.",
            },
            {
              text: "Drop the type annotation on `fetched_at` so it's no longer a field.",
              correct: false,
              rationale:
                "Then it's no longer initialized via __init__ either — you'd have to set it in __post_init__ or as a class attribute. Also confusing for future readers who lose the type hint.",
            },
          ],
          explanation:
            "Per-field opt-outs (`compare`, `repr`, `hash`, `init`) are the right granularity for 'mostly default behavior, with one twist'. Reserve hand-written dunder methods for genuinely custom semantics.",
        },
        {
          kind: "flashcard",
          context: "The mutable-default rule.",
          front:
            "Why does `field(default_factory=list)` exist, and what does `@dataclass` do if you try `items: list = []` instead?",
          back: "Mutable defaults are dangerous because they'd be shared across all instances of the class (classic Python footgun). `@dataclass` raises `ValueError: mutable default <class 'list'> for field items is not allowed` at class-definition time and forces you to use `default_factory=list`, which calls the factory **once per instance**.",
        },
      ],
    },

    // ================================================================
    // 3. __post_init__ for validation
    // ================================================================
    {
      title: "__post_init__ for validation and derived fields",
      blocks: [
        {
          kind: "prose",
          markdown: `\`@dataclass\` generates \`__init__\` for you, but you often still need to run code after construction — to validate inputs, derive computed fields, or normalize values.

The hook is \`__post_init__(self)\`. The generated \`__init__\` calls it as its last step, after all fields have been assigned. If you don't define one, no hook runs.

Three things \`__post_init__\` is for, and one thing it is *not* for:`,
        },
        {
          kind: "code_predict",
          label: "validation and derived fields in __post_init__",
          code: `from dataclasses import dataclass, field

@dataclass
class TokenBudget:
    max_input: int
    max_output: int
    total: int = field(init=False)

    def __post_init__(self):
        if self.max_input < 0 or self.max_output < 0:
            raise ValueError("budgets must be non-negative")
        self.total = self.max_input + self.max_output

b = TokenBudget(max_input=4000, max_output=1000)
print(b.total)

try:
    TokenBudget(max_input=-1, max_output=0)
except ValueError as e:
    print(f"rejected: {e}")`,
          output: `5000
rejected: budgets must be non-negative`,
          explanation:
            "Two patterns in one. (1) Validation: raise on bad input the instant the object is constructed, so downstream code never sees an invalid `TokenBudget`. (2) Derived field: `total` is declared `init=False` so it's not in `__init__`, then computed in `__post_init__`. The field still participates in `__repr__` and `__eq__` like any other.",
          runnable: true,
        },
        {
          kind: "key_insight",
          label: "Validate at the boundary, trust internally",
          insight: `The right place to validate is **once, at the constructor**, not at every method that reads the field. If you raise in \`__post_init__\`, you can treat the instance as a known-good record everywhere else in your code — no defensive checks, no asserts in business logic.

This is the *parse, don't validate* discipline applied to dataclasses. The decorator + post-init together form a "smart constructor": once you have a \`TokenBudget\`, you *know* it has non-negative numbers and a correct \`total\`. Inner functions don't second-guess.

The corollary: don't validate things you can't enforce. If \`max_input\` could be any \`int\`, don't write \`assert isinstance(self.max_input, int)\` — the annotation already says so and runtime asserts at every construction are just noise.`,
        },
        {
          kind: "code_comparison",
          label: "validation in __post_init__ vs scattered through methods",
          left: {
            title: "Validate inside every method (scattered)",
            code: `@dataclass
class TokenBudget:
    max_input: int
    max_output: int

    def remaining_input(self, used: int) -> int:
        if self.max_input < 0:
            raise ValueError("...")
        return self.max_input - used

    def remaining_output(self, used: int) -> int:
        if self.max_output < 0:
            raise ValueError("...")
        return self.max_output - used`,
            annotation:
              "Every method re-checks invariants the type system can't express. Invariants drift: someone adds a new method and forgets the check. Stack traces point to method calls, not the original bad construction.",
          },
          right: {
            title: "Validate once in __post_init__ (centralized)",
            code: `@dataclass
class TokenBudget:
    max_input: int
    max_output: int

    def __post_init__(self):
        if self.max_input < 0 or self.max_output < 0:
            raise ValueError("budgets must be non-negative")

    def remaining_input(self, used: int) -> int:
        return self.max_input - used

    def remaining_output(self, used: int) -> int:
        return self.max_output - used`,
            annotation:
              "Methods are pure subtraction — the invariant is established by the constructor and trusted forever after. Bad input fails fast, at the source.",
          },
          takeaway:
            "Put invariants where they're established (in __post_init__). Read code is faster when it doesn't keep re-checking what's already true.",
        },
        {
          kind: "warm_up",
          title: "What __post_init__ is not for",
          prompt:
            "Why is `__post_init__` a bad place to fetch from a database or make an API call?",
          answer:
            "Because constructing an object should be cheap, deterministic, and side-effect-free. I/O in `__post_init__` means every `MyClass(...)` call hits the network — which breaks unit tests, slows imports, and makes the constructor's behavior depend on external state.",
          explanation:
            "Validation and pure derivation are fine. Anything that talks to the outside world belongs in an explicit `MyClass.load_from_db(id)` classmethod or a separate factory function. Constructors should be obvious and fast.",
        },
        {
          kind: "code_predict",
          label: "InitVar — values consumed only by __post_init__",
          code: `from dataclasses import dataclass, field, InitVar

@dataclass
class HashedRecord:
    payload: str
    salt: InitVar[str]
    digest: str = field(init=False)

    def __post_init__(self, salt: str):
        import hashlib
        h = hashlib.sha256((self.payload + salt).encode()).hexdigest()
        self.digest = h[:12]

r = HashedRecord(payload="hello", salt="s3cr3t")
print(r)
print(hasattr(r, "salt"))`,
          output: `HashedRecord(payload='hello', digest='b7f783b1c2d4')
hasattr_salt: False`,
          explanation:
            "Wait — the output line says `False` but the question prints `hasattr(r, 'salt')` which evaluates to `False`. **`InitVar[T]`** marks a constructor parameter that is *passed to `__post_init__`* but **not stored** on the instance. It's the right tool for secrets, key material, or any input you need at construction time but don't want lingering on the object (or showing up in `__repr__`).",
        },
        {
          kind: "flashcard",
          context: "Hook ordering.",
          front:
            "When does `__post_init__` run relative to field assignment, and what arguments does it receive?",
          back: "It runs as the **last step** of the auto-generated `__init__`, after every field has been assigned. It receives `self` plus any `InitVar`-typed parameters (in declaration order). All other fields are accessible via `self` because they've already been set.",
        },
      ],
    },

    // ================================================================
    // 4. frozen=True and slots=True
    // ================================================================
    {
      title: "frozen=True and slots=True",
      blocks: [
        {
          kind: "prose",
          markdown: `Two decorator flags change the *runtime behavior* of a dataclass instance, not just code generation:

- **\`frozen=True\`** — instances are immutable. Reassigning a field raises \`FrozenInstanceError\`. This is the closest Python gets to a Rust struct or a Scala case class.
- **\`slots=True\`** — replaces the per-instance \`__dict__\` with a fixed \`__slots__\` list. Smaller memory footprint, faster attribute access, and an error on any attribute the class didn't declare.

These compose. \`@dataclass(frozen=True, slots=True)\` is the workhorse declaration for value objects in modern Python code — eval rows, hashable cache keys, configuration records.`,
        },
        {
          kind: "code_predict",
          label: "frozen instance",
          code: `from dataclasses import dataclass, FrozenInstanceError

@dataclass(frozen=True)
class Coordinate:
    lat: float
    lon: float

c = Coordinate(37.7749, -122.4194)
print(c)
print(hash(c))     # frozen + eq → automatically hashable

try:
    c.lat = 0
except FrozenInstanceError as e:
    print(f"blocked: {type(e).__name__}")

print({c, Coordinate(37.7749, -122.4194)})`,
          output: `Coordinate(lat=37.7749, lon=-122.4194)
<some integer hash>
blocked: FrozenInstanceError
{Coordinate(lat=37.7749, lon=-122.4194)}`,
          explanation:
            "Three effects of `frozen=True`. (1) `c.lat = 0` raises `FrozenInstanceError` — the instance is read-only after construction. (2) The class is **automatically hashable** because the dataclass machinery knows the value can't change (so the hash can't go stale). (3) Two equal `Coordinate` values dedupe to one entry in a `set` — proper value semantics.",
          runnable: true,
        },
        {
          kind: "key_insight",
          label: "Frozen + hashable = safe map key",
          insight: `A regular \`@dataclass\` is **not hashable by default** (because \`__eq__\` is defined, Python sets \`__hash__ = None\` for safety — a mutable hashable object is a recipe for "where did my dict key go?" bugs).

\`@dataclass(frozen=True)\` flips this: equality plus immutability means the hash is stable, so the decorator generates \`__hash__\` automatically. You get a value object you can safely use as a \`dict\` key, \`set\` member, or \`functools.lru_cache\` argument.

Rule of thumb: **default to \`frozen=True\` for any dataclass that represents a value (not an entity with identity)**. Mutate it by constructing a new one with \`dataclasses.replace(old, field=new_value)\`. The discipline catches a surprising number of "wait, who changed this?" bugs.`,
        },
        {
          kind: "code_comparison",
          label: "slots=False vs slots=True",
          left: {
            title: "Default — per-instance __dict__",
            code: `@dataclass
class Point:
    x: int
    y: int

p = Point(1, 2)
p.z = 3                    # ✅ allowed — typos go undetected
print(p.__dict__)          # {'x': 1, 'y': 2, 'z': 3}
import sys
print(sys.getsizeof(p.__dict__) + sys.getsizeof(p))
# ~152 bytes typical`,
            annotation:
              "Flexible but loose: arbitrary attributes can be tacked on at runtime, hiding typos. Each instance carries a dict, which costs memory for collections of many small objects.",
          },
          right: {
            title: "slots=True — fixed attribute set",
            code: `@dataclass(slots=True)
class Point:
    x: int
    y: int

p = Point(1, 2)
try:
    p.z = 3                # ❌ AttributeError
except AttributeError as e:
    print(e)
# print(p.__dict__)        # ❌ also AttributeError
import sys
print(sys.getsizeof(p))
# ~48 bytes typical`,
            annotation:
              "Smaller and stricter. ~30–40% memory savings per instance in benchmarks, ~25% faster attribute access. Typos like `p.x_` raise instead of silently creating a new attribute.",
          },
          takeaway:
            "Use `slots=True` for any dataclass instantiated in volume (eval rows, retrieval candidates, message blocks) or where attribute-typo bugs would be expensive. Skip it if you need monkey-patching at runtime or multiple inheritance from non-slotted classes.",
        },
        {
          kind: "multiple_choice",
          title: "frozen + a list field",
          prompt:
            "You write `@dataclass(frozen=True) class Run: tags: list[str] = field(default_factory=list)`. After construction, can you still do `run.tags.append('new')`?",
          choices: [
            {
              text: "No — `frozen=True` makes all fields, including their contents, immutable.",
              correct: false,
              rationale:
                "`frozen=True` only prevents *reassignment* of the field reference. It does not freeze the object the field points to. The list is still a regular mutable list.",
            },
            {
              text: "Yes — `frozen=True` only blocks `run.tags = [...]`, not mutation of the list itself.",
              correct: true,
              rationale:
                "Correct. Frozen-ness is shallow: it blocks the attribute *binding* from changing, but the value behind the binding is whatever Python object you stuck there. Mutate the list and the dataclass still equals its old self by `__eq__`, but its hash is now stale — which is exactly why you shouldn't.",
            },
            {
              text: "Yes, but Python will warn you at runtime.",
              correct: false,
              rationale:
                "There's no warning. The mutation succeeds silently. You can detect it after the fact by recomputing hash, but at that point you've already corrupted any `set` or `dict` containing the instance.",
            },
            {
              text: "Only if you also set `slots=True`.",
              correct: false,
              rationale:
                "Slots is orthogonal — it controls *which* attributes are allowed, not whether the values they point to are mutable.",
            },
          ],
          explanation:
            "Use `tuple[str, ...]` or `frozenset[str]` instead of `list[str]` when you actually want deep immutability in a frozen dataclass. The decorator can't help you with object-graph immutability — that's on your type choices.",
        },
        {
          kind: "method_ref",
          title: "@dataclass decorator parameters",
          importLine: "from dataclasses import dataclass",
          methods: [
            {
              signature: "@dataclass(init=True)",
              description:
                "Generate __init__. The default. Set to False if you want to write __init__ by hand.",
            },
            {
              signature: "@dataclass(repr=True)",
              description:
                "Generate __repr__. Default. Set to False to keep Python's default `<MyClass object at 0x...>` or write your own.",
            },
            {
              signature: "@dataclass(eq=True)",
              description:
                "Generate __eq__ comparing all fields by value. Default. Set to False to keep Python's identity-based __eq__.",
            },
            {
              signature: "@dataclass(order=True)",
              description:
                "Generate __lt__/__le__/__gt__/__ge__ that compare instances as tuples of their fields. Off by default — turn on for sortable records.",
            },
            {
              signature: "@dataclass(unsafe_hash=False)",
              description:
                "Force-generate __hash__ even when the class is unfrozen (and thus normally unhashable). Almost never the right call — prefer `frozen=True`.",
            },
            {
              signature: "@dataclass(frozen=True)",
              description:
                "Make instances immutable. Enables automatic __hash__ generation. Mutate via `dataclasses.replace(old, field=new)`.",
            },
            {
              signature: "@dataclass(slots=True)",
              description:
                "Python 3.10+. Generate __slots__ so instances have no __dict__. ~30% smaller and faster attribute access. Blocks ad-hoc attribute assignment.",
            },
            {
              signature: "@dataclass(kw_only=True)",
              description:
                "Python 3.10+. Make every field keyword-only in __init__. Useful for large classes where positional args are unreadable, and lifts the required-before-defaulted ordering rule.",
            },
            {
              signature: "@dataclass(match_args=True)",
              description:
                "Python 3.10+. Generate `__match_args__` for structural pattern matching (`match x: case Point(x, y): ...`). On by default.",
            },
          ],
        },
        {
          kind: "flashcard",
          context: "The 'mutate' pattern for frozen dataclasses.",
          front:
            "How do you produce a modified copy of a frozen dataclass without writing a manual constructor call?",
          back: "`dataclasses.replace(old, field=new_value, ...)`. It calls the class constructor with the existing field values, overriding the ones you pass. Standard idiom for 'edit' operations on immutable records: `new = replace(old, status='completed')`.",
        },
      ],
    },

    // ================================================================
    // 5. TypedDict — when JSON-shaped data is the right answer
    // ================================================================
    {
      title: "TypedDict — typed JSON shapes",
      blocks: [
        {
          kind: "prose",
          markdown: `Sometimes a dataclass is the wrong shape. You're parsing JSON from an API, or you need to pass a dict to a library that expects, well, a dict. Wrapping it in a dataclass just to unwrap it again is ceremony without benefit.

\`TypedDict\` (PEP 589, Python 3.8+) gives you **a dict with a type-checked schema**. At runtime, it *is* a dict — no special class, no \`__init__\`, just a regular \`{}\`. At type-check time, it has named keys with declared types. The Anthropic SDK uses TypedDicts extensively for message-content blocks, tool input schemas, and request params.

\`\`\`python
from typing import TypedDict

class MessageDict(TypedDict):
    role: str
    content: str

msg: MessageDict = {"role": "user", "content": "hi"}    # ✅
bad: MessageDict = {"role": "user"}                     # ❌ mypy: missing key 'content'
print(type(msg))                                        # <class 'dict'>
\`\`\``,
        },
        {
          kind: "code_comparison",
          label: "dataclass vs TypedDict",
          left: {
            title: "@dataclass — a Python object",
            code: `from dataclasses import dataclass

@dataclass
class Message:
    role: str
    content: str

m = Message(role="user", content="hi")
print(m.content)        # attribute access
print(type(m).__name__) # Message
# Cannot pass directly to json.dumps without
# a custom encoder or asdict().`,
            annotation:
              "A real Python class. Method definitions, inheritance, __post_init__ validation, all available. The runtime type is your class, not `dict`.",
          },
          right: {
            title: "TypedDict — a dict with a schema",
            code: `from typing import TypedDict

class Message(TypedDict):
    role: str
    content: str

m: Message = {"role": "user", "content": "hi"}
print(m["content"])     # key access
print(type(m).__name__) # dict
# json.dumps(m) works directly — it IS a dict.`,
            annotation:
              "Just a dict at runtime; the class is purely a type-checker fiction. No methods, no validation, no __post_init__. But it's the natural shape for anything you'll serialize to JSON.",
          },
          takeaway:
            "Choose by what you'll do with it. If it'll round-trip through JSON or feed an SDK that wants kwargs, TypedDict. If it has invariants, methods, or you'll write business logic against it, @dataclass.",
        },
        {
          kind: "code_predict",
          label: "TypedDict is a dict at runtime",
          code: `from typing import TypedDict

class ToolInput(TypedDict):
    name: str
    args: dict[str, str]

ti: ToolInput = {"name": "search", "args": {"q": "hello"}}
print(type(ti) is dict)
print(ti["name"])
print(list(ti.keys()))

# What mypy hates but Python runs:
ti["extra"] = "surprise"
print(ti)`,
          output: `True
search
['name', 'args']
{'name': 'search', 'args': {'q': 'hello'}, 'extra': 'surprise'}`,
          explanation:
            "TypedDict generates **no runtime enforcement**. `isinstance(ti, ToolInput)` doesn't even work — you'd get a `TypeError`. The schema lives entirely in the type checker. At runtime, `ti` is an ordinary dict that will happily accept new keys, missing keys, wrong-type values. Your IDE and `mypy` are the only enforcement.",
          runnable: true,
        },
        {
          kind: "key_insight",
          label: "TypedDict is structural, not nominal",
          insight: `Two TypedDicts with the same keys-and-types are **interchangeable**. There's no class identity to check. This is the right semantics for JSON-shaped data — the API doesn't care what Python class you wrap your dict in, only that the keys are right.

\`\`\`python
class AnthropicMessage(TypedDict):
    role: str
    content: str

class OpenAIMessage(TypedDict):
    role: str
    content: str

m: AnthropicMessage = {"role": "user", "content": "hi"}
o: OpenAIMessage = m   # ✅ structurally identical
\`\`\`

If you need the type checker to enforce distinct identities — "this dict came from *our* schema, not just any dict shaped like ours" — use a dataclass or \`NewType\`, not a TypedDict.`,
        },
        {
          kind: "warm_up",
          title: "total=False — optional keys",
          prompt:
            "How do you declare a TypedDict where some keys are optional and may legitimately be missing?",
          answer:
            "Either set `total=False` on the whole class (`class Cfg(TypedDict, total=False): ...`) to make every key optional, or use `NotRequired[...]` per-key (Python 3.11+ / `typing_extensions`): `class Cfg(TypedDict): name: str; debug: NotRequired[bool]`.",
          explanation:
            "Default `total=True` makes all keys required by the type checker. `total=False` flips it to all-optional. The granular `Required[...]` and `NotRequired[...]` markers (PEP 655) let you mix on a per-key basis — almost always what you actually want in real schemas.",
        },
        {
          kind: "code_predict",
          label: "NotRequired and Required mixed",
          code: `from typing import TypedDict, NotRequired

class Request(TypedDict):
    model: str
    messages: list[dict]
    temperature: NotRequired[float]
    system: NotRequired[str]

r1: Request = {"model": "claude-sonnet-4-5", "messages": []}
r2: Request = {"model": "claude-sonnet-4-5", "messages": [], "temperature": 0.0}

print(r1)
print(r2.get("temperature", "unset"))
print(r1.get("temperature", "unset"))`,
          output: `{'model': 'claude-sonnet-4-5', 'messages': []}
0.0
unset`,
          explanation:
            "`NotRequired` lets you mark *individual* keys as optional while leaving the rest required. At runtime, missing keys are just absent from the dict — `.get(key, default)` is the standard read pattern. The type checker enforces that `model` and `messages` are present, and that `temperature`, when present, is a float.",
        },
        {
          kind: "flashcard",
          context: "When to reach for TypedDict.",
          front:
            "Name three situations where TypedDict is the right choice over @dataclass.",
          back: "(1) **JSON round-trip** — when the data will be serialized/deserialized and you don't want `asdict()` boilerplate. (2) **kwargs forwarding to SDKs** — Anthropic, OpenAI, etc. accept dict-shaped params; TypedDict types them without copying. (3) **API response shapes** — when documenting what comes back from an external service that returns dicts, not your own objects.",
        },
        {
          kind: "multiple_choice",
          title: "Dataclass or TypedDict?",
          prompt:
            "You're modeling an Anthropic message-content block: `{\"type\": \"text\", \"text\": \"hi\"}` or `{\"type\": \"tool_use\", \"id\": \"toolu_...\", \"name\": \"...\", \"input\": {...}}`. You'll be (a) parsing these from API responses, (b) constructing them to send back, and (c) discriminating on the `type` field with `match`. Which Python construct fits best?",
          choices: [
            {
              text: "Plain `dict` with no types.",
              correct: false,
              rationale:
                "Loses every safety net. You'll typo `tool_user` and the error surfaces three function calls later when something asks for `.input`.",
            },
            {
              text: "TypedDict per block kind, unioned together: `TextBlock | ToolUseBlock | ...`.",
              correct: true,
              rationale:
                "Right. The data is fundamentally JSON, you need round-trippability, and the type-checker can use the `type` field as a discriminator (literal types) for narrowing in `match` statements. This is exactly how the Anthropic SDK types these.",
            },
            {
              text: "A single @dataclass with optional fields for every variant.",
              correct: false,
              rationale:
                "Forces every block to carry every possible field. Defeats the discriminated-union design and bloats `__repr__`. You'd reimplement the variant check at every consumer.",
            },
            {
              text: "An abstract base class with concrete subclasses per kind.",
              correct: false,
              rationale:
                "Works but heavy: you'd write serialize/deserialize logic by hand to bridge to/from JSON, and the type discriminator (a string field) doesn't map cleanly to class hierarchy. Add it only if you also need methods on the variants.",
            },
          ],
          explanation:
            "Tagged-union JSON shapes are TypedDict's sweet spot. Use `Literal['text']` for the `type` field so the type checker can narrow on `match block['type']`. Reserve dataclasses for objects with behavior or invariants — and reserve class hierarchies for genuine polymorphism, not just data shape variation.",
        },
      ],
    },

    // ================================================================
    // 6. Protocol — structural subtyping
    // ================================================================
    {
      title: "Protocol — structural subtyping",
      blocks: [
        {
          kind: "prose",
          markdown: `Python has always been duck-typed at runtime: "if it has \`.read()\`, it's a file." Until PEP 544 (Python 3.8), that ducks-and-protocols intuition was invisible to the type checker, which only understood **nominal** typing — "is this class a subclass of \`IO[str]\`?"

\`Protocol\` adds structural typing to the type system. A class doesn't have to *inherit* from a Protocol; it just needs to have the right methods and attributes. The type checker matches structurally.

This matters for FDE work because you're constantly wiring together customer code, third-party libraries, and Anthropic SDK calls that weren't designed with shared base classes. \`Protocol\` is the duck-type contract you can actually express in type signatures.`,
        },
        {
          kind: "code_comparison",
          label: "ABC (nominal) vs Protocol (structural)",
          left: {
            title: "ABC — must inherit",
            code: `from abc import ABC, abstractmethod

class Retriever(ABC):
    @abstractmethod
    def search(self, q: str) -> list[str]: ...

class MyRetriever(Retriever):     # must subclass
    def search(self, q): return [q]

def run(r: Retriever) -> list[str]:
    return r.search("hi")

# Third-party class with the right shape
# but no relation to Retriever:
class VendorSearch:
    def search(self, q): return [q]

run(VendorSearch())   # ❌ mypy: not a Retriever`,
            annotation:
              "Nominal typing: the type checker only accepts subclasses. Third-party code with the same shape is rejected unless you wrap it.",
          },
          right: {
            title: "Protocol — structural",
            code: `from typing import Protocol

class Retriever(Protocol):
    def search(self, q: str) -> list[str]: ...

class MyRetriever:                # no inheritance!
    def search(self, q): return [q]

def run(r: Retriever) -> list[str]:
    return r.search("hi")

class VendorSearch:
    def search(self, q): return [q]

run(VendorSearch())   # ✅ structurally compatible`,
            annotation:
              "Structural typing: anything with a matching `search` method is accepted, no inheritance required. The Protocol describes the *shape* of the dependency without coupling implementations to your interface class.",
          },
          takeaway:
            "Use Protocol when you need to type a dependency you don't own. Use ABC when you want to *control* a hierarchy you do own (and want isinstance() checks to mean something).",
        },
        {
          kind: "code_predict",
          label: "Protocol with a non-cooperating class",
          code: `from typing import Protocol

class HasLen(Protocol):
    def __len__(self) -> int: ...

def describe(thing: HasLen) -> str:
    return f"{type(thing).__name__} of length {len(thing)}"

# Built-ins satisfy Protocol structurally — no subclassing needed.
print(describe([1, 2, 3]))
print(describe("hello"))
print(describe({"a": 1, "b": 2}))`,
          output: `list of length 3
str of length 5
dict of length 2`,
          explanation:
            "Protocols let you type any *built-in* or third-party class that happens to have the right shape. `list`, `str`, and `dict` don't inherit from `HasLen` — they just happen to define `__len__`. The type checker matches them anyway. This is how stdlib `collections.abc.Sized` interacts with the world: structurally.",
          runnable: true,
        },
        {
          kind: "key_insight",
          label: "@runtime_checkable when you need isinstance()",
          insight: `By default, \`Protocol\` is **type-check only**. \`isinstance(obj, MyProtocol)\` raises \`TypeError\` because there's no class identity to check against.

If you really need runtime checking — for example, to dispatch based on whether an object has a method — decorate the Protocol with \`@runtime_checkable\`:

\`\`\`python
from typing import Protocol, runtime_checkable

@runtime_checkable
class Closable(Protocol):
    def close(self) -> None: ...

isinstance(open("f"), Closable)   # ✅ True
\`\`\`

Caveat: runtime checks only verify the *names* of methods, not their signatures or types. \`isinstance(obj, Closable)\` returns True for any object with a \`close\` attribute, even if it takes the wrong arguments. Use the decorator sparingly; static typing is the real value of Protocol.`,
        },
        {
          kind: "warm_up",
          title: "Protocol vs ABC — the one-line rule",
          prompt:
            "What's the single sentence that decides whether to declare an interface as `Protocol` vs `ABC`?",
          answer:
            "Use `Protocol` when the implementers might not be ours to modify (third-party libraries, customer code, built-ins); use `ABC` when you own all implementers and want inheritance to be a positive declaration of intent.",
          explanation:
            "Both express 'must have these methods'. Protocol is *unobtrusive* — works on existing classes without modification. ABC is *enforcing* — `class X(Retriever): ...` is a signed contract that future readers can see. FDE codebases skew toward Protocol because you're integrating, not authoring from scratch.",
        },
        {
          kind: "code_predict",
          label: "Protocol attribute requirements",
          code: `from typing import Protocol

class Named(Protocol):
    name: str           # attributes work too, not just methods

def greet(x: Named) -> str:
    return f"hello, {x.name}"

class User:
    def __init__(self, name: str):
        self.name = name

class Robot:
    name: str = "R2-D2"

print(greet(User("Ada")))
print(greet(Robot()))`,
          output: `hello, Ada
hello, R2-D2`,
          explanation:
            "Protocols can require **attributes** (not just methods). Any class — whether it sets the attribute as a class attribute (`Robot`) or an instance attribute (`User`) — satisfies the protocol structurally. This is how you express 'objects with a `name` field' without forcing every implementer to inherit from `Named`.",
        },
        {
          kind: "flashcard",
          context: "When the type system can't help.",
          front:
            "Name two things `Protocol` doesn't do, even with `@runtime_checkable`.",
          back: "(1) **Verify method signatures or argument types at runtime** — `isinstance(obj, Proto)` only checks attribute *names*, not types or arities. (2) **Enforce that implementers explicitly declare conformance** — there's no way to say 'I really meant for X to satisfy Proto'. Use ABC if you need either of those guarantees.",
        },
      ],
    },

    // ================================================================
    // 7. NamedTuple, Literal, NewType — the rest of the typing toolkit
    // ================================================================
    {
      title: "NamedTuple, Literal, NewType",
      blocks: [
        {
          kind: "prose",
          markdown: `A handful of smaller typing constructs round out the toolkit. Each has a narrow but valuable use case; knowing them keeps you from reaching for a dataclass when something lighter fits better.`,
        },
        {
          kind: "code_comparison",
          label: "NamedTuple vs frozen dataclass",
          left: {
            title: "typing.NamedTuple — fixed, indexable, light",
            code: `from typing import NamedTuple

class Point(NamedTuple):
    x: int
    y: int

p = Point(3, 4)
print(p.x, p[0])       # both work
print(tuple(p))        # (3, 4)
print(p == (3, 4))     # True!
print(hash(p))         # hashable

# Iteration:
for v in p:
    print(v)`,
            annotation:
              "Subclass of `tuple`. Equal to a plain tuple with the same contents. Iterable, indexable, hashable, immutable. ~30% lighter than a dataclass instance. No room for methods beyond what `tuple` provides.",
          },
          right: {
            title: "@dataclass(frozen=True) — immutable record",
            code: `from dataclasses import dataclass

@dataclass(frozen=True)
class Point:
    x: int
    y: int

p = Point(3, 4)
print(p.x)             # ✅
# print(p[0])          # ❌ TypeError
print(p == (3, 4))     # False — different types
print(hash(p))         # hashable

# Iteration:
# for v in p: ...      # ❌ TypeError: not iterable`,
            annotation:
              "A *class*, not a tuple. Can carry methods, `__post_init__` validation, derived fields. Not equal to a tuple with the same values. Heavier but more capable.",
          },
          takeaway:
            "Reach for `NamedTuple` when (a) you want positional unpacking (`x, y = pt`), (b) the data really is conceptually a tuple, and (c) you don't need methods or invariants. Otherwise prefer a frozen dataclass — they extend more gracefully when requirements grow.",
        },
        {
          kind: "code_predict",
          label: "Literal narrowing in functions",
          code: `from typing import Literal

Priority = Literal["low", "normal", "high"]

def escalation_minutes(p: Priority) -> int:
    if p == "high":
        return 5
    if p == "normal":
        return 60
    return 240

print(escalation_minutes("high"))
print(escalation_minutes("normal"))
# mypy would reject: escalation_minutes("urgent")`,
          output: `5
60`,
          explanation:
            "`Literal` constrains a value to an explicit set of literals — strings, ints, bools, or None. mypy treats `escalation_minutes('urgent')` as a type error: 'urgent' isn't in the literal set. At runtime, Python doesn't enforce anything — `Literal` is purely a type-checker hint, like every typing construct.",
        },
        {
          kind: "key_insight",
          label: "Literal + match for discriminated unions",
          insight: `\`Literal\` becomes especially powerful with structural pattern matching (\`match\` / \`case\`) and TypedDict unions. The classic Anthropic message-block shape:

\`\`\`python
from typing import Literal, TypedDict

class TextBlock(TypedDict):
    type: Literal["text"]
    text: str

class ToolUseBlock(TypedDict):
    type: Literal["tool_use"]
    id: str
    name: str
    input: dict

Block = TextBlock | ToolUseBlock

def handle(b: Block) -> str:
    match b:
        case {"type": "text", "text": t}:
            return t
        case {"type": "tool_use", "name": name}:
            return f"calling {name}"
\`\`\`

The type checker uses the literal \`type\` field as a **discriminator**: inside each \`case\` branch, it *narrows* the type to the matching variant and lets you access only that variant's fields. This is how the Anthropic SDK's response types are designed to be consumed.`,
        },
        {
          kind: "code_predict",
          label: "NewType for nominal distinctions",
          code: `from typing import NewType

UserId = NewType("UserId", str)
OrgId = NewType("OrgId", str)

def fetch_user(uid: UserId) -> dict:
    return {"id": uid}

uid = UserId("u_123")
oid = OrgId("o_456")

print(fetch_user(uid))
# mypy would reject: fetch_user(oid) — incompatible
# But at runtime:
print(type(uid) is str)`,
          output: `{'id': 'u_123'}
True`,
          explanation:
            "`NewType` creates a *type-checker-only* alias — at runtime it's still `str`, but mypy treats `UserId` and `OrgId` as **distinct** types that can't be passed interchangeably. Use it when you want to catch 'I passed the org id where the user id was expected' bugs without paying for a runtime wrapper class. There's literally zero runtime cost — `UserId('u_123')` returns the string unchanged.",
        },
        {
          kind: "warm_up",
          title: "Literal vs Enum",
          prompt:
            "When would you choose `Literal['low', 'normal', 'high']` over a proper `Enum`?",
          answer:
            "Choose `Literal` when the values are already meaningful strings (or ints) you'll serialize directly — to JSON, to a database, to a CLI argument — and you don't want the noise of `Priority.LOW.value` at every use site. Choose `Enum` when you want autocomplete in IDEs, runtime iteration over members, or methods attached to each variant.",
          explanation:
            "Both express 'must be one of these values'. `Literal` keeps the type system flat — the runtime value is just a string. `Enum` introduces a wrapper type that's safer (`Priority.LOW != 'low'`) but heavier (`.value` to serialize, `Priority('low')` to deserialize). FDE codebases that round-trip a lot of JSON often pick `Literal` for less ceremony.",
        },
        {
          kind: "method_ref",
          title: "The typing toolkit — when to reach for each",
          importLine:
            "from typing import Protocol, TypedDict, NamedTuple, Literal, NewType\nfrom dataclasses import dataclass",
          methods: [
            {
              signature: "@dataclass",
              description:
                "Objects with behavior, invariants, or that you'll attach methods to. The default container for domain entities.",
            },
            {
              signature: "@dataclass(frozen=True, slots=True)",
              description:
                "Value objects — hashable, immutable, dense. Default for cache keys, eval rows, config records, any small immutable thing used in volume.",
            },
            {
              signature: "TypedDict",
              description:
                "JSON-shaped data. SDK request/response params. Anything you'll round-trip through `json.dumps` / `json.loads`. No methods, just keys with types.",
            },
            {
              signature: "NamedTuple",
              description:
                "Positional records — when `x, y = pt` unpacking is natural and you don't need methods. Equal-to-a-tuple semantics. Hashable.",
            },
            {
              signature: "Protocol",
              description:
                "Structural interfaces — typing dependencies you don't own (third-party, customer code, built-ins). Implementers don't have to inherit.",
            },
            {
              signature: "ABC + @abstractmethod",
              description:
                "Nominal interfaces — when you own the hierarchy and want subclassing to be an intentional declaration. Use `isinstance()` checks for dispatch.",
            },
            {
              signature: "Literal['x', 'y', ...]",
              description:
                "Constrain a parameter to a fixed set of literal values. Combines with TypedDict for discriminated-union JSON shapes.",
            },
            {
              signature: "NewType('UserId', str)",
              description:
                "Nominal distinction at the type level with zero runtime cost. Catches 'wrong id type' bugs without a wrapper class.",
            },
            {
              signature: "Enum",
              description:
                "Closed set of named symbolic values, possibly with methods. Use when you want IDE autocomplete and runtime iteration; skip when raw strings round-trip cleanly.",
            },
          ],
        },
      ],
    },

    // ================================================================
    // 8. Conversion, replace, asdict — moving between shapes
    // ================================================================
    {
      title: "Converting between shapes",
      blocks: [
        {
          kind: "prose",
          markdown: `In an FDE codebase you cross between dataclass, dict, and JSON dozens of times a day. The \`dataclasses\` module ships a handful of helpers that handle the common transitions correctly — including the subtle ones around mutable defaults and nested fields.`,
        },
        {
          kind: "method_ref",
          title: "dataclasses — conversion helpers",
          importLine:
            "from dataclasses import asdict, astuple, replace, fields, is_dataclass",
          methods: [
            {
              signature: "asdict(instance)",
              description:
                "Recursively converts a dataclass instance to a plain dict. Nested dataclasses, lists, tuples, dicts are walked. Suitable for `json.dumps(asdict(obj))` round-trips when fields are JSON-serializable types.",
              returns: "dict[str, Any]",
            },
            {
              signature: "astuple(instance)",
              description:
                "Recursively converts to a tuple in field-declaration order. Less common than asdict but useful for unpacking and for hashing custom containers.",
              returns: "tuple",
            },
            {
              signature: "replace(instance, **changes)",
              description:
                "Returns a new instance of the same class with the listed fields overridden. The standard 'mutate a frozen dataclass' idiom. Works on non-frozen ones too.",
              returns: "Same class as `instance`",
            },
            {
              signature: "fields(class_or_instance)",
              description:
                "Returns a tuple of `Field` objects describing each declared field. Useful for writing generic serializers, validators, and migrations.",
              returns: "tuple[Field, ...]",
            },
            {
              signature: "is_dataclass(obj_or_class)",
              description:
                "True if the argument is a dataclass class or instance. Use to write helpers that branch on 'is this a dataclass?' — for example, generic JSON encoders.",
              returns: "bool",
            },
          ],
        },
        {
          kind: "code_predict",
          label: "asdict on a nested dataclass",
          code: `from dataclasses import dataclass, field, asdict
import json

@dataclass
class Address:
    city: str
    zip: str

@dataclass
class Customer:
    name: str
    address: Address
    tags: list[str] = field(default_factory=list)

c = Customer(
    name="Ada",
    address=Address(city="SF", zip="94110"),
    tags=["vip", "early"],
)

print(asdict(c))
print(json.dumps(asdict(c)))`,
          output: `{'name': 'Ada', 'address': {'city': 'SF', 'zip': '94110'}, 'tags': ['vip', 'early']}
{"name": "Ada", "address": {"city": "SF", "zip": "94110"}, "tags": ["vip", "early"]}`,
          explanation:
            "`asdict` walks the field graph recursively — the nested `Address` becomes a nested dict, the `tags` list is copied. Once you're in dict-land, `json.dumps` handles the rest, as long as every leaf value is a JSON-native type (str, int, float, bool, None, list, dict). Watch for `datetime`, `UUID`, `Decimal` — they need a custom encoder.",
          runnable: true,
        },
        {
          kind: "code_predict",
          label: "replace for frozen edits",
          code: `from dataclasses import dataclass, replace

@dataclass(frozen=True, slots=True)
class Run:
    id: str
    status: str
    score: float

r1 = Run(id="run_42", status="queued", score=0.0)
r2 = replace(r1, status="running")
r3 = replace(r2, status="completed", score=0.91)

print(r1)
print(r2)
print(r3)
print(r1 is r2)`,
          output: `Run(id='run_42', status='queued', score=0.0)
Run(id='run_42', status='running', score=0.0)
Run(id='run_42', status='completed', score=0.91)
False`,
          explanation:
            "`replace` constructs a new instance — `r1`, `r2`, `r3` are three distinct objects. The original is never mutated, which is exactly the contract `frozen=True` advertises. This pattern is how you model state transitions on immutable records without giving up the safety of immutability.",
        },
        {
          kind: "mini_challenge",
          title: "Build a generic dataclass→JSON encoder",
          prompt: `Write a helper \`to_json(obj)\` that takes either a dataclass instance, a list of dataclass instances, or a nested structure containing them, and returns a JSON string. Requirements:

1. Handles dataclass instances at any nesting depth.
2. Handles \`datetime.datetime\` values by encoding them as ISO 8601 strings.
3. Handles \`UUID\` values by encoding them as their hex string.
4. Anything else is passed through to \`json.dumps\` as-is.

You should use \`dataclasses.is_dataclass\`, \`asdict\`, and a custom \`json.JSONEncoder\` subclass.`,
          hints: [
            "`asdict` already walks nested dataclasses, so you mostly need to handle leaf values that aren't JSON-native. A custom encoder's `.default(self, o)` method handles unknown types.",
            "Check `is_dataclass(o) and not isinstance(o, type)` to distinguish *instances* from the class itself — `is_dataclass(MyClass)` is True for both.",
            "Order matters in `.default`: handle datetime and UUID first, then fall through to dataclass via asdict. The default encoder will recursively re-enter for the dict that asdict returns.",
          ],
          solution: `import json
from dataclasses import asdict, is_dataclass
from datetime import datetime
from uuid import UUID

class _DataclassEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, datetime):
            return o.isoformat()
        if isinstance(o, UUID):
            return o.hex
        if is_dataclass(o) and not isinstance(o, type):
            return asdict(o)
        return super().default(o)   # raises TypeError for truly unknown

def to_json(obj) -> str:
    return json.dumps(obj, cls=_DataclassEncoder)`,
          takeaway:
            "Combining `is_dataclass`, `asdict`, and a custom encoder gives you a one-line generic serializer that handles 90% of real-world API payloads. For the remaining 10% (recursive types, custom-named fields), reach for a library like `pydantic` or `mashumaro` — but understand this baseline first.",
        },
        {
          kind: "flashcard",
          context: "The one-stop conversion cheat sheet.",
          front:
            "Match each task to its `dataclasses` helper: serialize to JSON, produce a modified copy of a frozen instance, introspect field metadata, distinguish dataclasses from regular classes.",
          back: "Serialize to JSON → **`asdict(obj)` + `json.dumps`**. Modify a frozen instance → **`replace(obj, field=new)`**. Introspect field metadata → **`fields(cls)`** (returns `Field` objects with `.name`, `.type`, `.default`, `.metadata`). Distinguish dataclasses → **`is_dataclass(x)`** (returns True for both classes and instances; combine with `not isinstance(x, type)` to test for instances specifically).",
        },
      ],
    },

    // ================================================================
    // 9. Recap
    // ================================================================
    {
      title: "Recap: picking the right container",
      blocks: [
        {
          kind: "prose",
          markdown: `One decision tree to internalize. When you go to model some data in a typed Python codebase, walk this list top to bottom and stop at the first match:

1. **Will this data round-trip through JSON, or be passed as kwargs to a foreign SDK?** → \`TypedDict\` (with \`NotRequired\` for optionals, \`Literal\` for discriminators).
2. **Is this a value object — small, immutable, equality by content, used as a dict key or set member?** → \`@dataclass(frozen=True, slots=True)\`.
3. **Does it have invariants to enforce on construction, derived fields, or methods that operate on its state?** → plain \`@dataclass\` with \`__post_init__\`.
4. **Is it a small positional pair/triple where unpacking is natural?** → \`NamedTuple\`.
5. **Do you need to constrain a value to a fixed literal set?** → \`Literal[...]\` (or \`Enum\` if you want methods on the variants).
6. **Are you typing a dependency you don't own?** → \`Protocol\` (with \`@runtime_checkable\` only if you genuinely need \`isinstance\`).
7. **Are you modeling a hierarchy you do own, with subclasses that share behavior?** → \`ABC\` + \`@abstractmethod\`.

The boundary cases are real — sometimes a frozen dataclass with one literal field is the right answer over a TypedDict — but starting from the right default makes the boundary discussions productive instead of bikesheddy.`,
        },
        {
          kind: "flashcard",
          context: "Final recap — the @dataclass essentials.",
          front: "What four dunder methods does `@dataclass` generate by default, and what do you pass to opt out of each?",
          back: "**`__init__`** (turn off with `init=False`), **`__repr__`** (`repr=False`), **`__eq__`** (`eq=False`). `__hash__` is generated automatically only when `frozen=True` (or `unsafe_hash=True`); otherwise it's set to `None`. Order comparisons (`__lt__` etc.) are off by default — opt in with `order=True`.",
        },
        {
          kind: "flashcard",
          context: "Final recap — mutable defaults.",
          front: "Why is `items: list = []` rejected by `@dataclass`, and what's the fix?",
          back: "Mutable defaults would be shared across all instances of the class (classic Python footgun). `@dataclass` raises `ValueError` at class-definition time. Fix: `items: list[str] = field(default_factory=list)`, which calls the factory once per instance.",
        },
        {
          kind: "flashcard",
          context: "Final recap — frozen + slots.",
          front: "What does `@dataclass(frozen=True, slots=True)` give you over a plain `@dataclass`?",
          back: "**`frozen=True`** → immutability (`FrozenInstanceError` on reassignment), automatic hashability, safe-as-dict-key. **`slots=True`** → smaller memory footprint (~30% per instance), faster attribute access, errors on undeclared attributes (catches typos). The combo is the default for value objects in modern Python.",
        },
        {
          kind: "flashcard",
          context: "Final recap — TypedDict vs dataclass.",
          front: "When you have JSON-shaped data with optional keys, which Python construct fits best, and how do you mark a key optional?",
          back: "**`TypedDict`** — runtime type is just `dict`, so it round-trips through `json.dumps` / `json.loads` without conversion. Mark a key optional with **`NotRequired[T]`** (Python 3.11+ / `typing_extensions`), or set `total=False` to make every key optional. `Required[T]` is the companion for the reverse case under `total=False`.",
        },
        {
          kind: "flashcard",
          context: "Final recap — Protocol.",
          front: "What's the difference between `Protocol` and `ABC`, and what's the rule of thumb for picking between them?",
          back: "`ABC` is **nominal** — implementers must inherit. `Protocol` is **structural** — any class with the matching attributes/methods qualifies, no inheritance needed. Rule of thumb: use `Protocol` for dependencies you don't own (third-party libs, customer code, built-ins); use `ABC` for hierarchies you own and want subclassing to be a positive declaration of intent.",
        },
        {
          kind: "flashcard",
          context: "Final recap — replace.",
          front: "What's the idiomatic way to produce a modified copy of a frozen dataclass?",
          back: "`dataclasses.replace(old, field1=new1, field2=new2)`. It constructs a fresh instance, passing the old fields through and overriding the ones you specify. The original is untouched. Works for non-frozen dataclasses too, but it's the *only* way to 'mutate' a frozen one without escaping the type system.",
        },
        {
          kind: "flashcard",
          context: "Final recap — InitVar.",
          front: "What's `InitVar[T]` for, and what's a typical use case?",
          back: "`InitVar[T]` marks a constructor parameter that's **passed to `__post_init__`** but **not stored on the instance**. Typical use: secrets like a `salt` or `api_key` that you need at construction time for derivation but don't want lingering on the object (or appearing in `__repr__`). After `__post_init__` returns, the value is gone.",
        },
      ],
    },
  ],
};
