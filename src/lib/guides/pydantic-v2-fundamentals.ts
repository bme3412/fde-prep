import type { StudyGuide } from "../guide-types";

export const pydanticV2FundamentalsGuide: StudyGuide = {
  topicTitle: "Pydantic v2 fundamentals",
  topicSlug: "pydantic-v2-fundamentals",
  sections: [
    // ================================================================
    // 1. Why Pydantic exists
    // ================================================================
    {
      title: "Why Pydantic exists",
      blocks: [
        {
          kind: "prose",
          markdown: `You're on day five of an engagement. Claude returns a tool-use block whose \`input\` is supposed to be \`{"location": "Paris", "unit": "celsius"}\` — but this time, it's \`{"location": "Paris", "units": "C"}\`. Plural key, abbreviated value, total surprise. Your code crashes three calls later with \`KeyError\`, and the customer's PM is looking at you.

The fix isn't "tell Claude to be more careful" (you should, but it'll fail again). The fix is **runtime validation at the system boundary** — somewhere between "raw JSON arrived" and "Python code that assumes well-formed data". That's what Pydantic does.

\`\`\`python
from pydantic import BaseModel

class GetWeatherArgs(BaseModel):
    location: str
    unit: str = "celsius"

# Anywhere data enters your process — LLM output, webhook body, config file:
args = GetWeatherArgs.model_validate(raw_dict)
# args is now guaranteed to have the right shape, or model_validate raised.
\`\`\`

Pydantic v2 is the default schema layer for modern Python: it powers FastAPI's request/response models, generates JSON Schema for Anthropic tool-use, and gives you crisp error messages with field paths and input values. It's a ~10 MB Rust core wrapped in a Python API — fast enough to run on hot paths.

Type hints alone can't do this. \`mypy\` runs offline; \`isinstance\` doesn't recurse into nested dicts; manual \`assert\` chains turn into spaghetti by the third field. Pydantic is the boring, correct answer.`,
        },
        {
          kind: "code_comparison",
          label: "hand-rolled validation vs Pydantic",
          left: {
            title: "@dataclass + manual checks",
            code: `from dataclasses import dataclass

@dataclass
class GetWeatherArgs:
    location: str
    unit: str = "celsius"

    def __post_init__(self):
        if not isinstance(self.location, str):
            raise TypeError("location must be str")
        if not self.location.strip():
            raise ValueError("location must be non-empty")
        if self.unit not in ("celsius", "fahrenheit"):
            raise ValueError(f"bad unit: {self.unit}")

# From a dict:
args = GetWeatherArgs(**raw)  # KeyError if 'location' is missing.`,
            annotation:
              "Every field needs hand-written checks. Errors are flat (no field path). Nested models would multiply the boilerplate. No JSON Schema generation, no serialization round-trip.",
          },
          right: {
            title: "Pydantic BaseModel",
            code: `from typing import Literal
from pydantic import BaseModel, Field

class GetWeatherArgs(BaseModel):
    location: str = Field(min_length=1)
    unit: Literal["celsius", "fahrenheit"] = "celsius"

# From a dict (the LLM-output path):
args = GetWeatherArgs.model_validate(raw)
# Errors are structured, with field paths and input values.
# Also free: .model_dump(), .model_json_schema(), .model_validate_json().`,
            annotation:
              "Constraints declared inline. Errors come back as a list of dicts (loc, msg, input). Recurses into nested models. Generates JSON Schema for free — which Anthropic's tools API consumes directly.",
          },
          takeaway:
            "Dataclasses are for internal Python-to-Python data. Pydantic is for the messy boundary where JSON / form data / LLM output meets your typed Python code. Use the right one.",
        },
        {
          kind: "key_insight",
          label: "Mental model",
          insight: `**Pydantic = runtime validation at system boundaries.** Use it wherever untrusted shape meets typed Python: LLM tool inputs, webhook payloads, config files, request bodies, env vars.

**Dataclasses = internal data.** Once data is inside your process and you trust its shape, dataclasses are lighter, faster, and don't pull in a 10 MB dependency.

Don't mix the two roles. Pydantic models that flow deep into your codebase create coupling and slow your hot path; dataclasses at the edge skip validations you actually need.`,
        },
      ],
    },

    // ================================================================
    // 2. BaseModel anatomy
    // ================================================================
    {
      title: "BaseModel anatomy",
      blocks: [
        {
          kind: "prose",
          markdown: `Every Pydantic model is a three-step lifecycle:

1. **Define** — subclass \`BaseModel\` and declare fields with type annotations.
2. **Parse** — either \`Model(field=value, ...)\` (kwargs) or \`Model.model_validate(dict)\` (from raw data) or \`Model.model_validate_json(str)\` (from a JSON string).
3. **Dump** — \`model.model_dump()\` (back to dict) or \`model.model_dump_json()\` (back to JSON string).

\`\`\`python
from pydantic import BaseModel

class SupportTicket(BaseModel):
    id: str
    customer_id: str
    priority: str = "normal"
    tags: list[str] = []

# parse
t = SupportTicket.model_validate({"id": "T-1", "customer_id": "C-9"})
# use
print(t.priority)        # 'normal' (default)
# dump
print(t.model_dump())    # {'id': 'T-1', 'customer_id': 'C-9', 'priority': 'normal', 'tags': []}
\`\`\`

If you've read v1 Pydantic code, the renames will bite. v2 prefixed almost every public method with \`model_\` to free up those names for fields users actually want (you couldn't name a field \`dict\` in v1):

| v1 | v2 |
| --- | --- |
| \`Model.parse_obj(d)\` | \`Model.model_validate(d)\` |
| \`Model.parse_raw(s)\` | \`Model.model_validate_json(s)\` |
| \`model.dict()\` | \`model.model_dump()\` |
| \`model.json()\` | \`model.model_dump_json()\` |
| \`Model.schema()\` | \`Model.model_json_schema()\` |
| \`Model.__fields__\` | \`Model.model_fields\` |
| \`model.copy()\` | \`model.model_copy()\` |

When you see v1 method names in a customer's codebase, you're either on Pydantic 1.x or on v2 with the \`v1\` compatibility shim. Both happen.`,
        },
        {
          kind: "method_ref",
          title: "BaseModel core API",
          importLine: "from pydantic import BaseModel",
          methods: [
            {
              signature: "Model(**kwargs)",
              description:
                "Construct via kwargs. Validates types and constraints; raises ValidationError on failure.",
            },
            {
              signature: "Model.model_validate(obj, *, strict=None, context=None)",
              description:
                "Validate a dict (or any object with from_attributes=True). The standard 'parse a payload' entry point. (v1: parse_obj.)",
              returns: "Model",
            },
            {
              signature: "Model.model_validate_json(s, *, strict=None)",
              description:
                "Validate a JSON string in one shot. Faster than json.loads + model_validate. (v1: parse_raw.)",
              returns: "Model",
            },
            {
              signature: ".model_dump(*, mode='python', include=None, exclude=None, by_alias=False, exclude_unset=False, exclude_defaults=False, exclude_none=False)",
              description:
                "Serialize to dict. mode='python' keeps native types (datetime, UUID); mode='json' coerces to JSON-safe types (str, int, list, dict). (v1: .dict().)",
              returns: "dict",
            },
            {
              signature: ".model_dump_json(*, ...)",
              description:
                "Serialize directly to a JSON string. (v1: .json().)",
              returns: "str",
            },
            {
              signature: ".model_copy(*, update=None, deep=False)",
              description:
                "Make a shallow (or deep) copy with optional field overrides. The functional-update pattern. (v1: .copy().)",
            },
            {
              signature: "Model.model_fields",
              description:
                "Class-level dict[str, FieldInfo] of declared fields. Inspect for tooling. (v1: __fields__.)",
            },
            {
              signature: "Model.model_json_schema()",
              description:
                "Generate a JSON Schema dict describing this model. Feed it to Anthropic tool definitions. (v1: .schema().)",
            },
          ],
        },
        {
          kind: "code_predict",
          label: "default extra='ignore' silently drops unknown keys",
          code: `from pydantic import BaseModel

class User(BaseModel):
    id: str
    name: str

# JSON from an external system has an unexpected 'email' key.
u = User.model_validate({"id": "u1", "name": "Ada", "email": "a@b.com"})
print(u.model_dump())`,
          output: "{'id': 'u1', 'name': 'Ada'}",
          explanation:
            "Pydantic's default behavior for extra keys is `extra='ignore'` — unknown fields are silently dropped, not stored. Use `model_config = ConfigDict(extra='forbid')` to make extras a hard error, or `'allow'` to keep them on the instance (accessible via `model.__pydantic_extra__`). Silent ignore is the most common default but a frequent source of 'why is this field not on my model?' confusion.",
        },
        {
          kind: "code_predict",
          label: "JSON string → typed model in one shot",
          code: `from pydantic import BaseModel

class Order(BaseModel):
    id: str
    count: int
    total: float

raw = '{"id": "O-1", "count": "3", "total": "19.99"}'
o = Order.model_validate_json(raw)
print(o.count, type(o.count).__name__)
print(o.total, type(o.total).__name__)`,
          output: "3 int\n19.99 float",
          explanation:
            "By default (lax mode), Pydantic coerces strings to numbers when the target type expects a number. The JSON had `\"3\"` and `\"19.99\"` as strings, but `count: int` and `total: float` triggered coercion. Set `ConfigDict(strict=True)` (or pass `strict=True` to model_validate_json) to reject string-to-number coercion. The lax default is intentional: JSON has no separate numeric type for ints, and many APIs send numbers as strings.",
        },
        {
          kind: "scenario_predict",
          label: "translating v1 to v2",
          scenario: `# Old code from a customer's repo (Pydantic 1.x):
from pydantic import BaseModel

class Ticket(BaseModel):
    id: str
    body: str

t = Ticket.parse_obj(payload)
data = t.dict()
print(t.__fields__)`,
          language: "python",
          question: "Translate the three flagged method/attribute names to their v2 equivalents.",
          answer:
            "Ticket.model_validate(payload), t.model_dump(), Ticket.model_fields",
          explanation:
            "v2 prefixed instance methods with `model_`: `parse_obj` → `model_validate`, `dict` → `model_dump`, `__fields__` → `model_fields`. The renames freed up `dict` and `json` and `fields` as legal field names. The migration tool `bump-pydantic` automates most of these mechanically.",
        },
        {
          kind: "code_predict",
          label: "model_dump mode='python' vs mode='json'",
          code: `from datetime import datetime
from pydantic import BaseModel

class Event(BaseModel):
    name: str
    at: datetime

e = Event(name="deploy", at=datetime(2026, 5, 14, 12, 0, 0))

py = e.model_dump()
js = e.model_dump(mode="json")
print(type(py["at"]).__name__)
print(type(js["at"]).__name__)`,
          output: "datetime\nstr",
          explanation:
            "`mode='python'` (the default) preserves native Python types in the output dict — useful when you're passing the result back into Python code. `mode='json'` coerces non-JSON-native types (datetime, UUID, Decimal, Path) into JSON-safe primitives (ISO string, str, float-or-str, str). Reach for `mode='json'` when the dict is about to cross a JSON boundary anyway (going to `json.dumps`, a Redis cache, a database column).",
        },
        {
          kind: "flashcard",
          context: "v1 → v2 renames",
          front: "v1 `MyModel.parse_obj(d)` → v2 ?",
          back: "`MyModel.model_validate(d)`",
        },
        {
          kind: "flashcard",
          context: "v1 → v2 renames",
          front: "v1 `model.dict()` → v2 ?",
          back: "`model.model_dump()`",
        },
        {
          kind: "flashcard",
          context: "v1 → v2 renames",
          front: "v1 `MyModel.parse_raw(s)` → v2 ?",
          back: "`MyModel.model_validate_json(s)`",
        },
        {
          kind: "flashcard",
          context: "v1 → v2 renames",
          front: "v1 `MyModel.schema()` → v2 ?",
          back: "`MyModel.model_json_schema()`",
        },
        {
          kind: "flashcard",
          context: "BaseModel anatomy",
          front: "What's the difference between `model_dump()` and `model_dump(mode='json')`?",
          back: "Default (`'python'`) keeps native types like `datetime`, `UUID`, `Decimal`. `mode='json'` coerces them to JSON-safe primitives (ISO strings, etc.). Use `'json'` when the output will be serialized anyway.",
        },
        {
          kind: "flashcard",
          context: "BaseModel anatomy",
          front: "Default behavior for unknown keys in the input?",
          back: "**Ignored silently.** Override with `ConfigDict(extra='forbid')` (error) or `'allow'` (keep on `model.__pydantic_extra__`).",
        },
      ],
    },

    // ================================================================
    // 3. Field — constraints, defaults, metadata
    // ================================================================
    {
      title: "Field — constraints, defaults, metadata",
      blocks: [
        {
          kind: "prose",
          markdown: `Type hints tell Pydantic the **type**. \`Field(...)\` tells Pydantic everything else: the default, the constraints, the alias, the JSON Schema metadata.

\`\`\`python
from typing import Annotated
from pydantic import BaseModel, Field

class EvalRun(BaseModel):
    id: str = Field(min_length=1, pattern=r"^run_[a-z0-9]+$")
    score: float = Field(ge=0.0, le=1.0)
    tags: list[str] = Field(default_factory=list, max_length=10)
    notes: str | None = Field(default=None, description="Optional reviewer notes")
\`\`\`

Constraints are checked at validation time and surface in the JSON Schema. \`ge=0.0, le=1.0\` becomes \`"minimum": 0.0, "maximum": 1.0\` in the schema — which is how Anthropic's tools API learns the valid range without you writing it twice.

Two patterns to know:

- **\`default_factory\`** for mutable defaults. Never \`Field(default=[])\` — Pydantic v2 actually catches this and errors at class-definition time, but the habit is worth internalizing. \`default_factory=list\` produces a fresh list per instance.
- **\`Annotated[T, Field(...)]\`** when you want to alias a constrained type. Lets you do \`Score = Annotated[float, Field(ge=0, le=1)]\` and reuse \`Score\` across many fields.`,
        },
        {
          kind: "method_ref",
          title: "Field — the kwargs you actually use",
          importLine: "from pydantic import Field",
          methods: [
            {
              signature: "default=value",
              description:
                "Value used when the field is omitted. Pass `...` (Ellipsis) for 'required, no default' — usually you just don't pass `default` at all.",
            },
            {
              signature: "default_factory=callable",
              description:
                "Called once per instance to produce the default. The only correct way to default a mutable container (list, dict, set).",
            },
            {
              signature: "gt=, ge=, lt=, le=",
              description:
                "Numeric bounds (greater-than, greater-or-equal, less-than, less-or-equal). Apply to int, float, Decimal.",
            },
            {
              signature: "min_length=, max_length=",
              description:
                "Length bounds. Apply to str, list, dict, set, bytes — anything with a __len__.",
            },
            {
              signature: "pattern=r'...'",
              description:
                "Regex string fields must match. Compiled with `re.search` by default — anchor with `^...$` if you mean 'full match'.",
            },
            {
              signature: "multiple_of=N",
              description:
                "Numeric must be a multiple of N. Surfaces in JSON Schema as `multipleOf`.",
            },
            {
              signature: "alias=, validation_alias=, serialization_alias=",
              description:
                "Read/write under a different name. See the multiple-choice question below for which one to use when.",
            },
            {
              signature: "description=, examples=, title=",
              description:
                "JSON Schema metadata. Show up in `model_json_schema()` output and in API docs (FastAPI, Anthropic tool definitions).",
            },
            {
              signature: "exclude=True, repr=False, frozen=True",
              description:
                "Per-field switches: exclude from `model_dump()` by default; hide from `repr()`; refuse mutation.",
            },
          ],
        },
        {
          kind: "code_predict",
          label: "default_factory gives each instance a fresh list",
          code: `from pydantic import BaseModel, Field

class Cart(BaseModel):
    items: list[str] = Field(default_factory=list)

a = Cart()
b = Cart()
a.items.append("apple")
print(a.items, b.items)
print(a.items is b.items)`,
          output: "['apple'] []\nFalse",
          explanation:
            "`default_factory=list` is invoked once per instance — each Cart gets its own list. Compare to the broken pattern `items: list[str] = []` which would (in plain Python classes) share one list across all instances. Pydantic v2 actually catches the bare-mutable-default case and raises at class definition, but `default_factory` is the right habit to build.",
        },
        {
          kind: "code_predict",
          label: "constraint violations produce structured errors",
          code: `from pydantic import BaseModel, Field, ValidationError

class EvalRun(BaseModel):
    score: float = Field(ge=0.0, le=1.0)

try:
    EvalRun(score=1.5)
except ValidationError as e:
    err = e.errors()[0]
    print(err["type"])
    print(err["loc"])
    print(err["msg"])`,
          output:
            "less_than_equal\n('score',)\nInput should be less than or equal to 1",
          explanation:
            "`ValidationError.errors()` returns a list of dicts, one per failure. Each has `type` (a stable string like `less_than_equal`, `string_too_short`, `missing`), `loc` (a tuple path to the offending field — nested for sub-models), `msg` (a human-readable description), and `input` (the value that failed). Branch on `type` if you want to programmatically react to specific failure kinds; show `msg` to humans.",
        },
        {
          kind: "code_comparison",
          label: "wrong vs right way to default a mutable",
          left: {
            title: "Bare mutable default (caught in v2)",
            code: `from pydantic import BaseModel

class Cart(BaseModel):
    items: list[str] = []  # ← Pydantic v2 raises at class definition

# Plain dataclass would silently share one list across instances:
# a.items is b.items  →  True   (a classic Python gotcha)`,
            annotation:
              "Pydantic v2 catches this at class definition and raises. Plain dataclasses would silently share one mutable across all instances — the textbook 'shared mutable default' bug.",
          },
          right: {
            title: "default_factory (the correct pattern)",
            code: `from pydantic import BaseModel, Field

class Cart(BaseModel):
    items: list[str] = Field(default_factory=list)
    metadata: dict[str, str] = Field(default_factory=dict)
    tags: set[str] = Field(default_factory=set)`,
            annotation:
              "Factory is called once per instance. Same pattern for list, dict, set, or any other mutable. For non-stdlib mutables, pass any zero-arg callable: `default_factory=lambda: MyModel(...)`.",
          },
          takeaway:
            "If the default is a mutable, use `default_factory`. Always. No exceptions.",
        },
        {
          kind: "multiple_choice",
          title: "alias vs validation_alias vs serialization_alias",
          prompt:
            "A field on your Python model is named `user_id`, but the JSON your API receives uses `\"userId\"` and the JSON you produce should also use `\"userId\"`. Which `Field` kwarg captures both directions in one line?",
          choices: [
            {
              text: "alias='userId'",
              correct: true,
              rationale:
                "`alias` sets BOTH the input and output name. Use this when input and output names match each other (just not the Python name).",
            },
            {
              text: "validation_alias='userId' only",
              correct: false,
              rationale:
                "`validation_alias` controls input only. Output would still use `user_id` (or whatever `serialization_alias` says). Use this when input and output names differ.",
            },
            {
              text: "serialization_alias='userId' only",
              correct: false,
              rationale:
                "`serialization_alias` controls output only. Input would still expect `user_id`. Use this when you read snake_case but emit camelCase.",
            },
            {
              text: "Set all three: alias='userId', validation_alias='userId', serialization_alias='userId'",
              correct: false,
              rationale:
                "Redundant. `alias` already covers both directions. Mixing all three usually means you wanted the split-name version (validation_alias and serialization_alias).",
            },
          ],
          explanation:
            "Mental model: `alias` = symmetric rename. `validation_alias` / `serialization_alias` = asymmetric renames for when input and output names differ. Pair with `ConfigDict(populate_by_name=True)` if you also want callers to be able to use the Python name as a kwarg.",
        },
        {
          kind: "code_predict",
          label: "Annotated for reusable constrained types",
          code: `from typing import Annotated
from pydantic import BaseModel, Field

Score = Annotated[float, Field(ge=0.0, le=1.0)]

class EvalRun(BaseModel):
    accuracy: Score
    f1: Score
    recall: Score

print(EvalRun.model_json_schema()["properties"]["accuracy"])`,
          output: "{'maximum': 1.0, 'minimum': 0.0, 'title': 'Accuracy', 'type': 'number'}",
          explanation:
            "`Annotated[T, Field(...)]` lets you name a constrained type and reuse it. The metadata (`ge`, `le`) is attached to the type alias and applies wherever you use `Score`. This DRYs up models with many fields sharing the same bounds — and the constraints still surface in `model_json_schema()`.",
        },
        {
          kind: "flashcard",
          context: "Field constraints",
          front: "How do you default a mutable field (list/dict/set)?",
          back: "`Field(default_factory=list)` (or `dict`, `set`, etc.). The factory is called once per instance, avoiding the shared-mutable-default bug.",
        },
        {
          kind: "flashcard",
          context: "Field constraints",
          front: "What's the structure of `ValidationError.errors()`?",
          back: "A list of dicts, each with `type` (stable error code), `loc` (tuple field path), `msg` (human-readable), and `input` (the offending value).",
        },
        {
          kind: "flashcard",
          context: "Field constraints",
          front: "When to use `Annotated[T, Field(...)]` vs `field: T = Field(...)`?",
          back: "`Annotated` when you want to **reuse** the constrained type across many fields (or across modules). Inline `field: T = Field(...)` when the constraint is one-off.",
        },
        {
          kind: "flashcard",
          context: "Field constraints",
          front: "Does `pattern=r\"foo\"` mean full match or substring match?",
          back: "**Substring** — Pydantic uses `re.search`. Anchor with `^foo$` if you mean 'the whole string is exactly foo'.",
        },
      ],
    },

    // ================================================================
    // 4. Validators
    // ================================================================
    {
      title: "Validators",
      blocks: [
        {
          kind: "prose",
          markdown: `When type-plus-Field-constraints aren't expressive enough, drop in a **validator**. Pydantic's validation pipeline runs:

1. **Coerce / parse** the raw input toward the declared type.
2. **Field validators** — one per field, in declaration order.
3. **Model validators** — operate on the whole model, after all fields are validated.

You hook into the pipeline with two decorators:

- \`@field_validator(name, mode=...)\` for per-field logic.
- \`@model_validator(mode=...)\` for cross-field constraints.

Each has a \`mode\` that controls **when** in the pipeline it runs:

| mode | Sees | Use for |
| --- | --- | --- |
| \`'before'\` | The raw, pre-coerced input | Normalizing input shapes (string → list, JSON-in-string → dict) |
| \`'after'\` | The fully typed, validated value | The common case: business rules, normalization, derived fields |
| \`'wrap'\` | A handler you call yourself | Wrapping default validation with custom error mapping |
| \`'plain'\` | The raw input, but **replaces** default validation entirely | Rare — when you want to bypass coercion |

v1 called these \`@validator\` and \`@root_validator\` with \`pre=True\` instead of \`mode='before'\`. The semantics are the same; the names changed.`,
        },
        {
          kind: "method_ref",
          title: "Validator decorators",
          importLine: "from pydantic import field_validator, model_validator",
          methods: [
            {
              signature: "@field_validator(*names, mode='before'|'after'|'wrap'|'plain', check_fields=True)",
              description:
                "Decorates a `@classmethod` that takes `(cls, value)` (or `(cls, value, info)`). Pass multiple field names to share one validator. Return the new value (or raise to fail validation).",
            },
            {
              signature: "@model_validator(mode='before'|'after'|'wrap')",
              description:
                "Decorates a classmethod (`mode='before'`) or instance method (`mode='after'`). Sees the full model. Use for cross-field constraints. (v1: @root_validator.)",
            },
            {
              signature: "ValidationInfo (the optional second arg)",
              description:
                "Carries context: `info.field_name`, `info.data` (already-validated sibling fields, only in `after`), `info.context` (user-supplied via model_validate).",
            },
          ],
        },
        {
          kind: "code_predict",
          label: "field_validator normalizes input",
          code: `from pydantic import BaseModel, field_validator

class User(BaseModel):
    email: str

    @field_validator("email", mode="after")
    @classmethod
    def normalize(cls, v: str) -> str:
        return v.strip().lower()

u = User(email="  FOO@Bar.COM ")
print(u.email)
print(u.model_dump())`,
          output:
            "foo@bar.com\n{'email': 'foo@bar.com'}",
          explanation:
            "`mode='after'` runs once the value has already been coerced to its declared type (str). Whatever you return becomes the field's value — here, stripped and lowercased. This is the right place for normalization that depends on the type being settled (string operations, range clamping, casting to a richer type like UUID).",
        },
        {
          kind: "code_predict",
          label: "model_validator for cross-field constraints",
          code: `from datetime import date
from pydantic import BaseModel, ValidationError, model_validator

class DateRange(BaseModel):
    start: date
    end: date

    @model_validator(mode="after")
    def check_order(self) -> "DateRange":
        if self.end < self.start:
            raise ValueError("end must be on or after start")
        return self

try:
    DateRange(start=date(2026, 5, 14), end=date(2026, 5, 1))
except ValidationError as e:
    err = e.errors()[0]
    print(err["type"], err["loc"], err["msg"][:30])`,
          output:
            "value_error () Value error, end must be on",
        explanation:
            "`@model_validator(mode='after')` runs on a fully-built instance — `self` has all fields populated and typed. Raise `ValueError` inside to surface a structured `ValidationError`. The `loc` is empty `()` (model-level, not tied to one field); the `type` becomes `value_error`. If you want the error attached to a specific field, raise inside a `@field_validator` instead.",
        },
        {
          kind: "code_comparison",
          label: "v1 @validator vs v2 @field_validator",
          left: {
            title: "Pydantic v1",
            code: `from pydantic import BaseModel, validator

class User(BaseModel):
    email: str

    @validator("email", pre=True)
    def lower(cls, v):
        return v.lower()

# Cross-field:
class Range(BaseModel):
    a: int
    b: int

    @root_validator
    def check(cls, values):
        if values["a"] > values["b"]:
            raise ValueError("a must be ≤ b")
        return values`,
            annotation:
              "v1: `@validator(name, pre=True)` for field-level; `@root_validator` for whole-model. Both received raw dicts; you had to mutate or return the dict yourself.",
          },
          right: {
            title: "Pydantic v2",
            code: `from pydantic import BaseModel, field_validator, model_validator

class User(BaseModel):
    email: str

    @field_validator("email", mode="before")
    @classmethod
    def lower(cls, v: str) -> str:
        return v.lower()

class Range(BaseModel):
    a: int
    b: int

    @model_validator(mode="after")
    def check(self):
        if self.a > self.b:
            raise ValueError("a must be ≤ b")
        return self`,
            annotation:
              "v2: `@field_validator` and `@model_validator`, with explicit `mode='before'|'after'`. Model validators see the typed `self` (in `after` mode) — much nicer than v1's untyped dict.",
          },
          takeaway:
            "Mechanical rename: `@validator(pre=True)` → `@field_validator(mode='before')`; `@root_validator` → `@model_validator(mode='before')`. The model_validator `'after'` form is a real upgrade — you get `self` with all the type safety.",
        },
        {
          kind: "scenario_predict",
          label: "reading ValidationError output",
          scenario: `[{'type': 'string_too_short',
  'loc': ('items', 2, 'name'),
  'msg': 'String should have at least 1 character',
  'input': '',
  'ctx': {'min_length': 1},
  'url': '...'}]`,
          language: "python",
          question:
            "Which field failed and why? (Describe the path and the rule.)",
          answer:
            "The `name` field of the third item (index 2) in the `items` list — its value was the empty string, which violates a `min_length=1` constraint.",
          explanation:
            "`loc` is a tuple path from the model root, following nested model and collection indices. `('items', 2, 'name')` reads as 'inside `items`, at index 2, the `name` field'. `type='string_too_short'` is the stable error code (use it to programmatically branch); `ctx` carries constraint values for templating; `input` is the offending value. Always log `errors()` rather than `str(e)` if you're going to react to specific failures.",
        },
        {
          kind: "flashcard",
          context: "Validators",
          front: "Difference between `mode='before'` and `mode='after'`?",
          back: "**before** sees the raw, pre-coerced input — use for shape normalization. **after** sees the already-typed value — use for business rules, casting, range clamping.",
        },
        {
          kind: "flashcard",
          context: "Validators",
          front: "When to use `@field_validator` vs `@model_validator`?",
          back: "`@field_validator` for per-field logic (normalizing one field). `@model_validator` for cross-field constraints (`end >= start`, conditional requireds, mutually exclusive fields).",
        },
        {
          kind: "flashcard",
          context: "Validators",
          front: "v2 equivalent of `@validator('field', pre=True)`?",
          back: "`@field_validator('field', mode='before')`. Apply `@classmethod` underneath (Pydantic v2 expects it explicitly).",
        },
        {
          kind: "flashcard",
          context: "Validators",
          front: "How do you fail validation from inside a validator?",
          back: "Raise `ValueError` (or `AssertionError`, `TypeError`, `PydanticCustomError`). Pydantic catches it and folds it into the `ValidationError` with a proper `loc`.",
        },
      ],
    },

    // ================================================================
    // 5. Discriminated unions & nested models
    // ================================================================
    {
      title: "Discriminated unions & nested models",
      blocks: [
        {
          kind: "prose",
          markdown: `Anthropic's content blocks are a textbook polymorphism problem: a \`content\` field is a list where each item is *either* a \`TextBlock\` *or* an \`ImageBlock\` *or* a \`ToolUseBlock\`. Every variant has a different shape, and every variant carries a \`"type"\` tag that says which is which.

The wrong way: \`Union[TextBlock, ImageBlock, ToolUseBlock]\`. Pydantic will try each variant in declaration order, returning the first that validates. That's slow (N attempts per item) and ambiguous (what if two variants happen to overlap?). The error messages are awful: you get a giant union-of-errors blob with no clear signal about which variant the input was *trying* to be.

The right way: **discriminated union**. Add \`Field(discriminator='type')\` and Pydantic uses the tag to dispatch in O(1):

\`\`\`python
from typing import Annotated, Literal, Union
from pydantic import BaseModel, Field

class TextBlock(BaseModel):
    type: Literal["text"] = "text"
    text: str

class ImageBlock(BaseModel):
    type: Literal["image"] = "image"
    source: dict

ContentBlock = Annotated[Union[TextBlock, ImageBlock], Field(discriminator="type")]

class Message(BaseModel):
    content: list[ContentBlock]
\`\`\`

Each variant uses \`Literal["tag"]\` to lock down its tag value. Pydantic reads the input's \`type\` field, looks it up in a dispatch table, and validates against that one variant. Errors point to the right variant. Speed is constant in the number of variants. Win on every axis.`,
        },
        {
          kind: "code_comparison",
          label: "naive Union vs discriminated union",
          left: {
            title: "Plain Union (don't do this)",
            code: `from typing import Union
from pydantic import BaseModel

class TextBlock(BaseModel):
    type: str
    text: str

class ImageBlock(BaseModel):
    type: str
    source: dict

class Message(BaseModel):
    content: list[Union[TextBlock, ImageBlock]]

# Pydantic tries TextBlock first. If \`text\` is missing,
# it falls through to ImageBlock. Errors are unioned and
# confusing. Performance is O(N variants).`,
            annotation:
              "Order-dependent. Ambiguous. Bad error messages ('input did not match any of TextBlock OR ImageBlock — here are all 6 sub-errors'). Slow when N grows.",
          },
          right: {
            title: "Discriminated union (do this)",
            code: `from typing import Annotated, Literal, Union
from pydantic import BaseModel, Field

class TextBlock(BaseModel):
    type: Literal["text"] = "text"
    text: str

class ImageBlock(BaseModel):
    type: Literal["image"] = "image"
    source: dict

ContentBlock = Annotated[
    Union[TextBlock, ImageBlock],
    Field(discriminator="type"),
]

class Message(BaseModel):
    content: list[ContentBlock]`,
            annotation:
              "Pydantic builds a tag → variant lookup. Validation is O(1) per item. Errors say 'the type field said X; here's why X's schema failed' — precise and actionable.",
          },
          takeaway:
            "Anytime your data has a tag field that says 'I am variant X', use a discriminated union. It's the single biggest readability and performance lever for polymorphic schemas.",
        },
        {
          kind: "code_predict",
          label: "discriminator picks the right variant",
          code: `from typing import Annotated, Literal, Union
from pydantic import BaseModel, Field

class TextBlock(BaseModel):
    type: Literal["text"] = "text"
    text: str

class ToolUseBlock(BaseModel):
    type: Literal["tool_use"] = "tool_use"
    name: str
    input: dict

Block = Annotated[Union[TextBlock, ToolUseBlock], Field(discriminator="type")]

class Message(BaseModel):
    content: list[Block]

m = Message.model_validate({
    "content": [
        {"type": "text", "text": "hi"},
        {"type": "tool_use", "name": "get_weather", "input": {"city": "Paris"}},
    ]
})
print(type(m.content[0]).__name__, type(m.content[1]).__name__)`,
          output: "TextBlock ToolUseBlock",
          explanation:
            "Pydantic reads each item's `type` field, looks it up in the discriminator table built from the `Literal` values, and validates against the matching model. The result is a list of correctly-typed instances — `m.content[0]` is a `TextBlock` with `.text`, `m.content[1]` is a `ToolUseBlock` with `.name` and `.input`. No `isinstance` chains needed.",
        },
        {
          kind: "scenario_predict",
          label: "unknown discriminator value",
          scenario: `m = Message.model_validate({
    "content": [{"type": "video", "url": "..."}]
})
# raises ValidationError with errors() containing:
#   type='union_tag_invalid'
#   loc=('content', 0, 'type')
#   msg="Input tag 'video' found using 'type' does not match any of the
#        expected tags: 'text', 'tool_use'"`,
          language: "text",
          question:
            "What single change to the schema would let this input parse without modifying any existing variants?",
          answer:
            "Add a new variant class (e.g. `class VideoBlock(BaseModel): type: Literal['video'] = 'video'; url: str`) and include it in the union: `Annotated[Union[TextBlock, ToolUseBlock, VideoBlock], Field(discriminator='type')]`.",
          explanation:
            "Discriminated unions are open for extension — adding a new tag is just adding a new class. The error message is also a useful debugging signal: it tells you exactly which tags are registered, which surfaces typos quickly. Don't try to silently accept unknown tags; either model them explicitly or reject them at the boundary.",
        },
        {
          kind: "method_ref",
          title: "Union / discriminator / RootModel",
          importLine: "from typing import Annotated, Literal, Union\nfrom pydantic import BaseModel, Field, RootModel",
          methods: [
            {
              signature: "Literal['text']",
              description:
                "Single-value type used as a discriminator tag. Pydantic uses it to build the dispatch table.",
            },
            {
              signature: "Annotated[Union[A, B, C], Field(discriminator='type')]",
              description:
                "Tag-based union. Pydantic reads the `type` field and dispatches to the matching variant in O(1).",
            },
            {
              signature: "class MyList(RootModel[list[Item]]): ...",
              description:
                "Wrap a non-dict top-level shape (a bare list, str, etc.) as a model. Useful when the JSON root isn't an object. Access the inner value via `.root`.",
            },
            {
              signature: "class Outer(BaseModel): inner: Inner",
              description:
                "Nested model. Pydantic auto-coerces dict inputs into `Inner` instances. `Outer(inner={'x': 1})` builds an `Inner(x=1)` automatically.",
            },
          ],
        },
        {
          kind: "code_predict",
          label: "nested model auto-coercion",
          code: `from pydantic import BaseModel

class Address(BaseModel):
    city: str
    country: str

class User(BaseModel):
    name: str
    address: Address

u = User.model_validate({
    "name": "Ada",
    "address": {"city": "London", "country": "UK"},
})
print(type(u.address).__name__, u.address.city)`,
          output: "Address London",
          explanation:
            "Nested models are auto-coerced — passing a dict where a `BaseModel` field is declared triggers validation of that dict against the nested model. `u.address` is a real `Address` instance, not a dict; you can call `.model_dump()` on it, attach methods, etc. Errors from the nested model surface with the right `loc` path (`('address', 'city')`).",
        },
        {
          kind: "flashcard",
          context: "Unions & nesting",
          front: "What does `type: Literal['text']` do in a discriminated union?",
          back: "Pins the field to one specific value and registers it as the dispatch tag. Pydantic uses these `Literal` values to build a tag → variant lookup table.",
        },
        {
          kind: "flashcard",
          context: "Unions & nesting",
          front: "When do you reach for `RootModel`?",
          back: "When your JSON root isn't an object — e.g. it's a bare list `[...]` or a bare string. `RootModel[list[Item]]` lets you validate the whole list as one model. Access via `.root`.",
        },
        {
          kind: "flashcard",
          context: "Unions & nesting",
          front: "What happens with `Union[A, B]` (no discriminator) when the input could match both?",
          back: "Pydantic tries each variant in declaration order and returns the first that validates. Order-dependent, easy to be ambiguous. Always prefer `Field(discriminator=...)` when a tag exists.",
        },
        {
          kind: "flashcard",
          context: "Unions & nesting",
          front: "Do you have to instantiate nested models explicitly?",
          back: "**No.** Pass a dict and Pydantic builds the nested instance. `User(name='x', address={'city': 'London', 'country': 'UK'})` works — `address` becomes a real `Address`.",
        },
      ],
    },

    // ================================================================
    // 6. ConfigDict — controlling the model
    // ================================================================
    {
      title: "ConfigDict — controlling the model",
      blocks: [
        {
          kind: "prose",
          markdown: `Every model has a knob panel. In v1 you set it via a \`class Config:\` inner class. v2 replaced that with a class attribute:

\`\`\`python
from pydantic import BaseModel, ConfigDict

class StrictTicket(BaseModel):
    model_config = ConfigDict(
        extra="forbid",            # reject unknown keys
        strict=True,               # no string→int coercion
        frozen=True,               # instances are immutable
        populate_by_name=True,     # let aliased fields also be set by Python name
    )
    id: str
    body: str
\`\`\`

The renames bite. Most v1 \`Config\` keys were renamed in v2:

| v1 | v2 |
| --- | --- |
| \`allow_population_by_field_name\` | \`populate_by_name\` |
| \`allow_mutation = False\` | \`frozen = True\` |
| \`anystr_lower\` | \`str_to_lower\` |
| \`anystr_strip_whitespace\` | \`str_strip_whitespace\` |
| \`orm_mode\` | \`from_attributes\` |
| \`arbitrary_types_allowed\` | \`arbitrary_types_allowed\` (unchanged) |

Two configuration choices matter more than the others for FDE work:

1. **\`extra='forbid'\`** for any model that wraps external input. The default of \`'ignore'\` silently drops unknown fields, which masks schema drift — Claude might start emitting a new field that you'd want to *see* in your logs, not silently lose.
2. **\`strict=True\`** when you want bug-finding rigor. The default lax mode coerces \`"3"\` → \`3\` and \`"true"\` → \`True\`, which is *fine* for JSON-from-anywhere but *bad* when you want to catch the upstream system sending strings where it should send numbers.`,
        },
        {
          kind: "method_ref",
          title: "ConfigDict — the keys you actually use",
          importLine: "from pydantic import ConfigDict",
          methods: [
            {
              signature: "extra='ignore' | 'allow' | 'forbid'",
              description:
                "What to do with unknown input keys. `ignore` (default): silently drop. `allow`: keep them in `model.__pydantic_extra__`. `forbid`: raise `ValidationError`.",
            },
            {
              signature: "strict=True",
              description:
                "Disable lax type coercion globally (string→int, string→bool, etc.). Per-field strict is also possible via `Field(strict=True)`.",
            },
            {
              signature: "frozen=True",
              description:
                "Forbid attribute mutation after construction. Setting `model.field = x` raises `ValidationError`. Makes the model hashable. (v1: `allow_mutation=False`.)",
            },
            {
              signature: "populate_by_name=True",
              description:
                "When aliases are set, also accept the Python field name as input. Without this, an aliased field is *only* settable via the alias. (v1: `allow_population_by_field_name`.)",
            },
            {
              signature: "validate_assignment=True",
              description:
                "Re-run validation when an attribute is assigned after construction (`model.field = x`). Off by default — only the initial parse validates.",
            },
            {
              signature: "from_attributes=True",
              description:
                "Allow `model_validate` to read fields from an object's attributes, not just a dict. The ORM-mode equivalent for SQLAlchemy/Django models. (v1: `orm_mode`.)",
            },
            {
              signature: "str_strip_whitespace=True, str_to_lower=True, str_to_upper=True",
              description:
                "Apply to all str-typed fields. Save you a fleet of `@field_validator(mode='after')` decorators.",
            },
            {
              signature: "arbitrary_types_allowed=True",
              description:
                "Allow fields typed as non-Pydantic, non-stdlib classes (e.g. a `numpy.ndarray`). Validation just becomes `isinstance(value, T)`. Use sparingly.",
            },
            {
              signature: "alias_generator=callable",
              description:
                "Auto-generate aliases for every field. `alias_generator=lambda s: s.replace('_', '-')` turns `user_id` → `user-id` everywhere.",
            },
          ],
        },
        {
          kind: "code_predict",
          label: "extra='forbid' catches schema drift",
          code: `from pydantic import BaseModel, ConfigDict, ValidationError

class User(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    name: str

try:
    User.model_validate({"id": "u1", "name": "Ada", "email": "a@b.com"})
except ValidationError as e:
    err = e.errors()[0]
    print(err["type"], err["loc"])`,
          output: "extra_forbidden ('email',)",
          explanation:
            "With `extra='forbid'`, unknown keys become validation errors instead of silent drops. `loc=('email',)` points right at the offender. Use this on every model that consumes external input — Claude tool calls, webhooks, customer config files. The cost (loud failure on a new field) is much smaller than the cost of silently ignoring a field that mattered.",
        },
        {
          kind: "code_predict",
          label: "frozen=True forbids mutation",
          code: `from pydantic import BaseModel, ConfigDict, ValidationError

class Config(BaseModel):
    model_config = ConfigDict(frozen=True)
    api_url: str

c = Config(api_url="https://api.example.com")
try:
    c.api_url = "https://evil.example.com"
except ValidationError as e:
    print(e.errors()[0]["type"])

# Bonus: frozen models are hashable.
print(hash(c) == hash(c))`,
          output: "frozen_instance\nTrue",
          explanation:
            "`frozen=True` makes assignment raise `ValidationError` with `type='frozen_instance'`. It also makes the model hashable (so you can use it as a dict key or set member) because the data is now safe to use as an identity. The functional-update pattern still works via `c.model_copy(update={'api_url': ...})`, which returns a *new* instance.",
        },
        {
          kind: "code_predict",
          label: "strict=True rejects string→int coercion",
          code: `from pydantic import BaseModel, ConfigDict, ValidationError

class Strict(BaseModel):
    model_config = ConfigDict(strict=True)
    count: int

class Lax(BaseModel):
    count: int

print(Lax.model_validate({"count": "3"}).count)
try:
    Strict.model_validate({"count": "3"})
except ValidationError as e:
    print(e.errors()[0]["type"])`,
          output: "3\nint_type",
          explanation:
            "Lax mode (the default) coerces `\"3\"` → `3` because JSON ints are commonly sent as strings. Strict mode refuses, raising `type='int_type'`. Reach for strict when you control both sides of the wire and want to find bugs (an upstream service sending numbers as strings is usually a bug); stay lax for accept-everyone external input.",
        },
        {
          kind: "scenario_predict",
          label: "translating v1 Config to v2",
          scenario: `# Old v1 model:
class Item(BaseModel):
    code: str
    name: str = Field(alias="displayName")

    class Config:
        allow_population_by_field_name = True
        allow_mutation = False
        anystr_strip_whitespace = True`,
          language: "python",
          question:
            "Write the v2 equivalent of the `class Config:` block as a `model_config = ConfigDict(...)` line.",
          answer:
            "`model_config = ConfigDict(populate_by_name=True, frozen=True, str_strip_whitespace=True)`",
          explanation:
            "Each key was renamed: `allow_population_by_field_name` → `populate_by_name`; `allow_mutation = False` → `frozen=True` (note the polarity flip and the semantic shift from 'mutation' to 'frozen instance'); `anystr_strip_whitespace` → `str_strip_whitespace`. The `bump-pydantic` CLI handles these renames mechanically, but recognizing them on sight pays off when reading PRs.",
        },
        {
          kind: "flashcard",
          context: "ConfigDict",
          front: "Three values of `extra` and what they do?",
          back: "**ignore** (default) silently drops unknown keys. **forbid** raises ValidationError. **allow** keeps them on `model.__pydantic_extra__`.",
        },
        {
          kind: "flashcard",
          context: "ConfigDict",
          front: "What does `populate_by_name=True` enable?",
          back: "When a field has an `alias`, this lets callers ALSO use the Python field name as a kwarg. Without it, an aliased field can only be set via its alias.",
        },
        {
          kind: "flashcard",
          context: "ConfigDict",
          front: "When would you reach for `validate_assignment=True`?",
          back: "When you mutate models after construction and want each assignment re-validated. Off by default — only the initial `__init__` / `model_validate` runs validation.",
        },
        {
          kind: "flashcard",
          context: "ConfigDict",
          front: "v1 `allow_mutation = False` → v2 ?",
          back: "`frozen=True`. (Polarity flips — v1 was 'allow mutation', v2 is 'frozen'.) Also makes the model hashable.",
        },
      ],
    },

    // ================================================================
    // 7. pydantic-settings — env vars and config
    // ================================================================
    {
      title: "pydantic-settings — env vars and config",
      blocks: [
        {
          kind: "prose",
          markdown: `In v1, env-var loading was built into Pydantic core via \`BaseSettings\`. In v2 it was split into a sibling package, \`pydantic-settings\` (\`pip install pydantic-settings\`), which keeps Pydantic itself lean.

\`BaseSettings\` is a \`BaseModel\` subclass that reads field values from, in priority order:

1. **Constructor kwargs** (\`Settings(api_key="...")\`)
2. **Environment variables** (\`APP_API_KEY=...\`)
3. **\`.env\` file** if \`env_file=\` is set
4. **Secrets directory** (\`/run/secrets/...\` style mount, common in Docker)
5. **Field defaults**

\`\`\`python
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="APP_",
        env_file=".env",
        env_nested_delimiter="__",
    )
    api_key: str
    log_level: str = "INFO"
    timeout_seconds: int = 30
\`\`\`

With \`env_prefix="APP_"\`, the environment variable \`APP_API_KEY\` populates \`Settings().api_key\`. The prefix is the standard way to namespace your service's settings without collisions.

This is the natural partner to the **argparse precedence pattern** (flag > env > config > default). You don't usually use both in the same CLI — argparse for short-lived tools, \`BaseSettings\` for long-running services with many config knobs. If you do want both (a service with a CLI front), build \`Settings()\` first and then have argparse overwrite individual fields with \`settings.model_copy(update={"api_key": cli_key})\`.`,
        },
        {
          kind: "method_ref",
          title: "BaseSettings & SettingsConfigDict",
          importLine: "from pydantic_settings import BaseSettings, SettingsConfigDict",
          methods: [
            {
              signature: "class Settings(BaseSettings)",
              description:
                "Subclass of BaseModel that auto-loads from env / .env / secrets dir on instantiation.",
            },
            {
              signature: "SettingsConfigDict(env_prefix='APP_', ...)",
              description:
                "Prepend a prefix to every env-var name. `APP_API_KEY` → `api_key`. Avoids collisions with system env vars.",
            },
            {
              signature: "SettingsConfigDict(env_file='.env', env_file_encoding='utf-8')",
              description:
                "Load from a .env file (dotenv format: `KEY=value` per line). File is loaded once at class definition; missing file is not an error.",
            },
            {
              signature: "SettingsConfigDict(env_nested_delimiter='__')",
              description:
                "Map nested-model fields to env vars. `Settings.database.host` ← `APP_DATABASE__HOST`. The delimiter is intentionally noisy to avoid colliding with normal underscores.",
            },
            {
              signature: "SettingsConfigDict(case_sensitive=False)",
              description:
                "Default is False (env vars are matched case-insensitively, then normalized to lowercase). Set True for strict matching.",
            },
            {
              signature: "SettingsConfigDict(secrets_dir='/run/secrets')",
              description:
                "Read each setting from a file named after the field in this directory. The standard mount for Docker / Kubernetes secrets.",
            },
            {
              signature: "Settings.model_validate({...})",
              description:
                "Inherited from BaseModel. Use to override env values explicitly — useful in tests.",
            },
          ],
        },
        {
          kind: "code_predict",
          label: "env_prefix populates fields",
          code: `import os
from pydantic_settings import BaseSettings, SettingsConfigDict

os.environ["APP_API_KEY"] = "sk-abc"
os.environ["APP_LOG_LEVEL"] = "DEBUG"

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="APP_")
    api_key: str
    log_level: str = "INFO"
    timeout_seconds: int = 30

s = Settings()
print(s.api_key, s.log_level, s.timeout_seconds)`,
          output: "sk-abc DEBUG 30",
          explanation:
            "`env_prefix='APP_'` makes each field auto-load from `APP_<FIELD_UPPER>`. `api_key` ← `APP_API_KEY`, `log_level` ← `APP_LOG_LEVEL`. `timeout_seconds` had no env var set, so it took its declared default. Type coercion still works — if `APP_TIMEOUT_SECONDS=60` were set, the string `\"60\"` would become `int(60)`.",
        },
        {
          kind: "code_comparison",
          label: "manual env loading vs BaseSettings",
          left: {
            title: "Hand-rolled with os.environ",
            code: `import os

def load_config():
    api_key = os.environ.get("APP_API_KEY")
    if not api_key:
        raise RuntimeError("APP_API_KEY required")
    log_level = os.environ.get("APP_LOG_LEVEL", "INFO")
    timeout = int(os.environ.get("APP_TIMEOUT_SECONDS", "30"))
    return {"api_key": api_key, "log_level": log_level,
            "timeout": timeout}

cfg = load_config()
# No type safety past this point. No --help generation.
# No .env loading. No secrets-dir support.`,
            annotation:
              "Fine for ~3 settings. Once you have 15, you're hand-coding 15 calls to os.environ.get, 15 type coercions, 15 required-check branches. Adds up fast.",
          },
          right: {
            title: "BaseSettings",
            code: `from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="APP_",
        env_file=".env",
    )
    api_key: str = Field(min_length=1)
    log_level: str = "INFO"
    timeout_seconds: int = 30

settings = Settings()  # parses + validates in one line.`,
            annotation:
              "Each field declared once. Type coercion is automatic. Required-ness is determined by 'has default or not'. .env loading and secrets-dir support come for free. Generates JSON Schema for self-documentation.",
          },
          takeaway:
            "For one-off CLIs: argparse + manual env merge is fine. For services and apps with many config knobs: `BaseSettings` is the better default. The line where the trade-off flips is around 5 settings.",
        },
        {
          kind: "scenario_predict",
          label: "nested env vars",
          scenario: `# Settings with nested Database model:
class Database(BaseModel):
    host: str
    port: int = 5432

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="APP_",
        env_nested_delimiter="__",
    )
    database: Database

# Which env vars populate database.host and database.port?`,
          language: "python",
          question: "Name the two environment variables.",
          answer: "`APP_DATABASE__HOST` and `APP_DATABASE__PORT`",
          explanation:
            "Concatenation rule: `<env_prefix><FIELD>` then `<nested_delimiter><SUBFIELD>`. The nested delimiter is conventionally `__` (two underscores) to avoid colliding with normal field names that contain underscores. So `Settings.database.host` ← `APP_DATABASE__HOST`. If your Python field already has underscores (`max_pool_size`), this stays unambiguous because the delimiter is two underscores, not one.",
        },
        {
          kind: "key_insight",
          label: "Pairing with argparse",
          insight: `Pydantic doesn't know about CLI flags. argparse doesn't know about env vars (well — only what you wire up). The clean split:

\`\`\`python
settings = Settings()                    # env + .env + secrets
args = parser.parse_args()               # CLI flags
final = settings.model_copy(
    update={k: v for k, v in vars(args).items() if v is not None}
)
\`\`\`

This gives you the conventional precedence (flag > env > config > default) **and** keeps each tool focused on what it does best. The argparse guide's "argparse handles flags, you handle env" rule applies — \`BaseSettings\` is just a cleaner way to do the env half.`,
        },
        {
          kind: "flashcard",
          context: "pydantic-settings",
          front: "What does `env_prefix='APP_'` do?",
          back: "Prepends `APP_` to every field name when looking up env vars. `api_key` ← `APP_API_KEY`. Avoids collisions with system / other-app env vars.",
        },
        {
          kind: "flashcard",
          context: "pydantic-settings",
          front: "How do nested models map to env vars?",
          back: "With `env_nested_delimiter='__'`, `Settings.database.host` ← `APP_DATABASE__HOST`. The double-underscore avoids ambiguity with field names that contain single underscores.",
        },
        {
          kind: "flashcard",
          context: "pydantic-settings",
          front: "Priority order of BaseSettings sources?",
          back: "Constructor kwargs > env vars > `.env` file > secrets dir > field defaults. Most-explicit wins, matching the argparse precedence rule.",
        },
      ],
    },

    // ================================================================
    // 8. Pydantic ↔ Anthropic — tool schemas & structured output
    // ================================================================
    {
      title: "Pydantic ↔ Anthropic",
      blocks: [
        {
          kind: "prose",
          markdown: `The highest-leverage Pydantic use in Anthropic work: **defining tool schemas** and **validating tool inputs / structured outputs**. The round trip:

1. You write a Pydantic model describing a tool's arguments.
2. \`Model.model_json_schema()\` generates the JSON Schema that Anthropic's tools API consumes as \`input_schema\`.
3. Claude returns a \`tool_use\` content block with an \`input\` dict.
4. \`Model.model_validate(block.input)\` validates and types it.
5. You run your tool with the typed args; if validation failed, you send the error back as a \`tool_result\` and Claude usually self-corrects.

Same idea for **structured output** (non-tool-use JSON-in-text):

1. Ask Claude to return JSON matching a schema (prefill, system prompt, or \`response_format\` if available).
2. \`Model.model_validate_json(response_text)\` parses + validates in one shot.
3. On failure, you can retry with the error message in the next turn.

The single biggest mistake: writing the JSON Schema for your tool by hand in a Python dict. It drifts. Always generate it from the Pydantic model so the schema and your Python types are forced to agree.`,
        },
        {
          kind: "code_comparison",
          label: "hand-written tool schema vs generated",
          left: {
            title: "Hand-written (drifts)",
            code: `tool = {
    "name": "get_weather",
    "description": "Get weather for a location.",
    "input_schema": {
        "type": "object",
        "properties": {
            "location": {"type": "string"},
            "unit": {
                "type": "string",
                "enum": ["celsius", "fahrenheit"],
            },
        },
        "required": ["location"],
    },
}

# Then somewhere else in the codebase:
def get_weather(location: str, unit: str = "celsius"):
    ...`,
            annotation:
              "Two sources of truth that drift. Add a field to the Python function and forget to update the schema; Claude keeps using the old schema; you spend an hour debugging.",
          },
          right: {
            title: "Generated from Pydantic",
            code: `from typing import Literal
from pydantic import BaseModel, Field

class GetWeatherArgs(BaseModel):
    """Get weather for a location."""
    location: str = Field(description="City name, e.g. 'Paris'")
    unit: Literal["celsius", "fahrenheit"] = "celsius"

tool = {
    "name": "get_weather",
    "description": GetWeatherArgs.__doc__,
    "input_schema": GetWeatherArgs.model_json_schema(),
}`,
            annotation:
              "Single source of truth. The Pydantic class is your contract; the schema is generated from it. Adding a field is one line; the tool definition picks it up automatically.",
          },
          takeaway:
            "Your Pydantic class is the tool contract. `model_json_schema()` → Anthropic `input_schema`. `model_validate()` → typed args. Never hand-write the schema.",
        },
        {
          kind: "code_predict",
          label: "model_json_schema for a tool",
          code: `from typing import Literal
from pydantic import BaseModel, Field

class GetWeatherArgs(BaseModel):
    location: str = Field(description="City name")
    unit: Literal["celsius", "fahrenheit"] = "celsius"

schema = GetWeatherArgs.model_json_schema()
print(schema["type"], schema["required"])
print(sorted(schema["properties"].keys()))`,
          output: "object ['location']\n['location', 'unit']",
          explanation:
            "`model_json_schema()` returns a JSON Schema dict. Required vs optional is determined by whether the field has a default — `location` has none so it's in `required`; `unit` defaults to `'celsius'` so it's optional. The `Literal[...]` becomes a JSON Schema `enum`. The `description=` on `Field` surfaces inside `properties.location.description` and shows up in tool definitions, helping Claude pick good values.",
        },
        {
          kind: "code_predict",
          label: "validating a tool_use input",
          code: `from typing import Literal
from pydantic import BaseModel, ValidationError

class GetWeatherArgs(BaseModel):
    location: str
    unit: Literal["celsius", "fahrenheit"] = "celsius"

# Simulated tool_use block from a Claude response:
tool_input = {"location": "Paris"}

try:
    args = GetWeatherArgs.model_validate(tool_input)
    print(args.location, args.unit)
except ValidationError as e:
    print("error:", e.errors())`,
          output: "Paris celsius",
          explanation:
            "Claude omitted `unit`, which is fine because it has a default. `model_validate` filled it in. If Claude had sent `{\"location\": \"Paris\", \"unit\": \"C\"}` (abbreviated), `Literal[...]` would have rejected it with a clear error — you could then send that error back as a `tool_result` and Claude would usually self-correct on the next turn.",
        },
        {
          kind: "scenario_predict",
          label: "almost-valid JSON",
          scenario: `# Claude returned this as a text block (structured-output prompt):
response_text = '''
{
    "name": "Alice",
    "age": 32,
    "email": "alice@example.com",
}
'''
# Note the trailing comma after "alice@example.com".`,
          language: "python",
          question:
            "Will `User.model_validate_json(response_text)` succeed? Why or why not?",
          answer:
            "No. JSON does not allow trailing commas. `model_validate_json` raises `ValidationError` with `type='json_invalid'` and a message pointing at the comma's column. Strip the response or retry with the error fed back to Claude.",
          explanation:
            "Pydantic uses `orjson` under the hood for JSON parsing; it's strict JSON, not JSON5. The fix paths: (1) post-process the text with a permissive JSON parser like `json5` before validation, (2) retry the prompt with explicit 'no trailing commas' guidance, or (3) use Anthropic's tool-use mechanism instead — tool-use inputs are real dicts, not text-encoded JSON, so they avoid this class of parsing failure entirely. The third option is the best for production.",
        },
        {
          kind: "key_insight",
          label: "The contract",
          insight: `Your Pydantic schema is the tool contract.

- \`Model.model_json_schema()\` → goes into the Anthropic tool definition's \`input_schema\`.
- \`Model.model_validate(block.input)\` → validates Claude's reply on the way back.
- \`Model.model_validate_json(response_text)\` → same thing for structured-output prompts that return JSON-in-text.

If a tool call fails validation, **send the error back to Claude as a \`tool_result\`** and it usually self-corrects on the next turn. Don't crash; let the model see its own mistake.`,
        },
        {
          kind: "mini_challenge",
          title: "validated tool dispatcher",
          prompt: `Implement \`validated_tool_call(name, raw_input, schemas, handlers)\` that:

1. Looks up the Pydantic model for \`name\` in \`schemas: dict[str, type[BaseModel]]\`.
2. Calls \`schemas[name].model_validate(raw_input)\` to get a typed args instance.
3. Calls \`handlers[name](args)\` and returns the result.
4. On \`ValidationError\`, returns a dict shaped like \`{"is_error": True, "content": str(e)}\` so it can be sent back as a \`tool_result\`.
5. On unknown \`name\`, returns the same error shape.

This is the boundary layer between Claude's untrusted tool-use output and your typed Python tool handlers.`,
          hints: [
            "Catch ValidationError; return the error-shaped dict containing `e.errors()` or `str(e)` as content.",
            "If `name` not in `schemas`, return the error-shaped dict with a 'no such tool' message before doing anything else.",
            "Type the schemas dict as `dict[str, type[BaseModel]]` and handlers as `dict[str, Callable[[BaseModel], Any]]` for clarity.",
            "In real use, this function lives between `response.content` iteration and the actual tool execution — it's the choke point where validation happens.",
          ],
          solution: `from typing import Any, Callable
from pydantic import BaseModel, ValidationError

def validated_tool_call(
    name: str,
    raw_input: dict,
    schemas: dict[str, type[BaseModel]],
    handlers: dict[str, Callable[[BaseModel], Any]],
) -> Any | dict:
    if name not in schemas:
        return {
            "is_error": True,
            "content": f"unknown tool: {name!r}",
        }
    try:
        args = schemas[name].model_validate(raw_input)
    except ValidationError as e:
        return {
            "is_error": True,
            "content": f"invalid arguments for {name}: {e}",
        }
    return handlers[name](args)


# Usage with the GetWeatherArgs model from above:
def get_weather(args):  # args: GetWeatherArgs
    return f"{args.location}: 20°{args.unit[0].upper()}"

schemas = {"get_weather": GetWeatherArgs}
handlers = {"get_weather": get_weather}

result = validated_tool_call(
    "get_weather",
    {"location": "Paris"},
    schemas,
    handlers,
)
print(result)  # 'Paris: 20°C'

# Wire result into the next user turn:
# messages.append({"role": "user", "content": [
#     {"type": "tool_result", "tool_use_id": tu.id,
#      "content": str(result), "is_error": isinstance(result, dict) and result.get("is_error")}
# ]})`,
          takeaway:
            "Centralize tool dispatch through one validation choke point. Claude can self-correct on validation errors if you feed them back via tool_result — but only if you give it a structured error to look at, not a stack trace.",
        },
        {
          kind: "flashcard",
          context: "Pydantic ↔ Anthropic",
          front: "How do you generate an Anthropic tool's `input_schema`?",
          back: "`MyArgsModel.model_json_schema()`. Never hand-write it — the schema and the Python types drift instantly.",
        },
        {
          kind: "flashcard",
          context: "Pydantic ↔ Anthropic",
          front: "`model_validate` vs `model_validate_json`?",
          back: "`model_validate(d)` takes a Python dict (use for tool-use `input` blocks). `model_validate_json(s)` takes a raw JSON string (use for structured-output text responses).",
        },
        {
          kind: "flashcard",
          context: "Pydantic ↔ Anthropic",
          front: "What do you do when tool-input validation fails?",
          back: "Return the validation error as a `tool_result` with `is_error=True` in the next message. Claude usually self-corrects on the following turn. Don't crash the process.",
        },
        {
          kind: "flashcard",
          context: "Pydantic ↔ Anthropic",
          front: "Why use tool-use over structured output for production?",
          back: "Tool-use `input` is a real dict — no JSON parsing failure modes (trailing commas, smart quotes, truncation). Structured output as JSON-in-text is fragile to those. Use tool-use whenever you can.",
        },
      ],
    },

    // ================================================================
    // 9. Recap
    // ================================================================
    {
      title: "Recap",
      blocks: [
        {
          kind: "prose",
          markdown: `Mental checklist for any new Pydantic model:

1. **BaseModel** for any shape that crosses a system boundary (LLM I/O, HTTP, config files).
2. **\`Field(...)\`** for constraints and metadata. \`default_factory\` for mutable defaults.
3. **\`@field_validator\`** for per-field normalization; **\`@model_validator\`** for cross-field rules. Use the smallest tool that works (type → Field → validator).
4. **Discriminated unions** anytime a field can be one of several tagged variants.
5. **\`ConfigDict(extra='forbid')\`** for models that consume external input — catch schema drift loudly.
6. **\`BaseSettings\`** for services with many env-driven knobs; argparse + manual env for simple CLIs.
7. **\`model_json_schema()\` → tool \`input_schema\`** and **\`model_validate(block.input)\` → typed args**. Never hand-write the schema.

When in doubt: declare the shape, set \`extra='forbid'\`, validate at the boundary, and let the types carry the rest.`,
        },
        {
          kind: "flashcard",
          context: "Recap",
          front: "Four v1 → v2 method renames to memorize",
          back: "**parse_obj** → model_validate. **parse_raw** → model_validate_json. **dict()** → model_dump(). **json()** → model_dump_json().",
        },
        {
          kind: "flashcard",
          context: "Recap",
          front: "Four validator modes and what each sees",
          back: "**before** = raw pre-coerced input. **after** = fully typed value. **wrap** = handler you call yourself. **plain** = replaces default validation entirely.",
        },
        {
          kind: "flashcard",
          context: "Recap",
          front: "Three values of `ConfigDict(extra=...)`",
          back: "**ignore** (default, silently drop), **forbid** (raise on unknown keys), **allow** (keep on `__pydantic_extra__`). Prefer `forbid` for external-input models.",
        },
        {
          kind: "flashcard",
          context: "Recap",
          front: "The discriminated union pattern in one line",
          back: "`Annotated[Union[A, B, C], Field(discriminator='type')]` where each variant has `type: Literal['x']`. O(1) dispatch, clear errors.",
        },
        {
          kind: "flashcard",
          context: "Recap",
          front: "The Pydantic ↔ Anthropic round trip",
          back: "Python class → `model_json_schema()` → tool `input_schema` → Claude returns tool_use block → `Model.model_validate(block.input)` → typed args.",
        },
      ],
    },
  ],
};
