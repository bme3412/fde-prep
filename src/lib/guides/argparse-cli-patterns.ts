import type { StudyGuide } from "../guide-types";

export const argparseCliPatternsGuide: StudyGuide = {
  topicTitle: "argparse & CLI patterns",
  topicSlug: "argparse-cli-patterns",
  sections: [
    // ================================================================
    // 1. Why CLI fluency matters for an FDE
    // ================================================================
    {
      title: "Why CLI fluency matters",
      blocks: [
        {
          kind: "prose",
          markdown: `You're on day three of a customer engagement. The customer hands you a folder of 8,000 PDFs and says "can you run these through Claude and give me back a CSV by Friday?" You don't reach for a Jupyter notebook — you write a CLI:

\`\`\`bash
python extract.py --input ./pdfs --concurrency 8 --model claude-opus-4-5 --out results.csv
\`\`\`

A CLI is the contract you hand to the customer's engineers. It's also the thing you'll re-run forty times as you iterate on the prompt. Spending fifteen minutes on argparse up front pays back every time you tweak a flag instead of editing a global at the top of the file.

\`argparse\` is the right default because it's **stdlib** — it works on any Python 3 your customer has, no \`pip install\` required, no version skew across their five environments. Click and Typer are nicer in some ways, but they're a dependency you have to justify. This guide stays in stdlib land and rounds out with the rest of the CLI hygiene a real tool needs: \`sys.argv\`, environment variables, config precedence, exit codes, and \`stdin\`/\`stdout\` discipline.`,
        },
        {
          kind: "code_comparison",
          label: "raw sys.argv vs argparse — same tool",
          left: {
            title: "Roll-your-own with sys.argv",
            code: `import sys

# python tool.py <input> --count 3 --verbose
input_path = sys.argv[1]
count = 1
verbose = False

i = 2
while i < len(sys.argv):
    if sys.argv[i] == "--count":
        count = int(sys.argv[i + 1])
        i += 2
    elif sys.argv[i] == "--verbose":
        verbose = True
        i += 1
    else:
        print(f"unknown arg {sys.argv[i]}")
        sys.exit(2)`,
            annotation:
              "Fragile. No --help. No type errors until int() blows up at runtime. Reordering flags requires rewriting the loop. Bus factor: zero.",
          },
          right: {
            title: "argparse — same behavior, ten lines",
            code: `import argparse

p = argparse.ArgumentParser()
p.add_argument("input")
p.add_argument("--count", type=int, default=1)
p.add_argument("--verbose", action="store_true")
args = p.parse_args()

print(args.input, args.count, args.verbose)`,
            annotation:
              "Free --help, free type coercion, free usage errors on stderr with exit code 2. Reordering flags works. Adding a flag is one line.",
          },
          takeaway:
            "If your tool has more than one optional flag, you've already paid the cost of using argparse — you just haven't gotten any of the benefits yet.",
        },
        {
          kind: "key_insight",
          label: "Mental model",
          insight: `Once you reach for \`sys.argv[2]\` past the first positional, you've lost. Use \`argparse\`.

Third-party libraries (Click, Typer, Fire) exist and are pleasant, but **stdlib argparse is the lowest-friction choice for FDE tooling** — it ships everywhere, has no install dance, and is the dialect every Python engineer already reads. This guide assumes argparse unless noted.`,
        },
      ],
    },

    // ================================================================
    // 2. The parser anatomy
    // ================================================================
    {
      title: "The parser anatomy",
      blocks: [
        {
          kind: "prose",
          markdown: `Every argparse program is the same four steps:

1. **Construct** an \`ArgumentParser\`.
2. **Declare** arguments with \`add_argument\`.
3. **Parse** with \`parse_args()\` — returns a \`Namespace\`.
4. **Use** the namespace's attributes.

\`\`\`python
import argparse

parser = argparse.ArgumentParser(            # 1. construct
    prog="extract",
    description="Pull structured fields out of PDFs with Claude.",
)
parser.add_argument("input")                 # 2. declare
parser.add_argument("--count", type=int, default=1)
args = parser.parse_args()                   # 3. parse
print(args.input, args.count)                # 4. use
\`\`\`

The \`Namespace\` returned by \`parse_args()\` is just a thin wrapper around a dict — attribute names come from the flag name (\`--count\` → \`args.count\`) or the \`dest=\` you pass explicitly. Dashes in long flags are converted to underscores: \`--max-tokens\` → \`args.max_tokens\`.`,
        },
        {
          kind: "method_ref",
          title: "argparse.ArgumentParser",
          importLine: "import argparse",
          methods: [
            {
              signature: "ArgumentParser(prog=None, description=None, epilog=None, formatter_class=HelpFormatter, parents=[], add_help=True)",
              description:
                "Construct a parser. `prog` defaults to sys.argv[0]; `description` and `epilog` show in `--help`.",
            },
            {
              signature: ".add_argument(name_or_flags, ...)",
              description:
                "Declare one argument. Positional if `name` (no dashes), optional if `--flag`. Returns an Action object you rarely need.",
            },
            {
              signature: ".parse_args(args=None, namespace=None)",
              description:
                "Parse sys.argv (or pass a list for tests/runnable demos). Returns a Namespace.",
              returns: "argparse.Namespace",
            },
            {
              signature: ".parse_known_args(args=None)",
              description:
                "Like parse_args, but returns (Namespace, list_of_unrecognized_args) instead of erroring on unknowns. Useful when forwarding to another tool.",
            },
            {
              signature: ".error(message)",
              description:
                "Print usage + message to stderr and exit with code 2. Use this for custom validation failures that should look like argparse errors.",
            },
            {
              signature: ".set_defaults(**kwargs)",
              description:
                "Set default values on the Namespace that aren't tied to a particular argument. Most commonly used with subparsers to wire `func=handler`.",
            },
          ],
        },
        {
          kind: "method_ref",
          title: ".add_argument keyword cheatsheet",
          importLine: "# parser.add_argument(...)",
          methods: [
            {
              signature: "type=callable",
              description:
                "Coerce the raw string. `type=int`, `type=float`, `type=Path`, or any one-arg callable that raises on bad input.",
            },
            {
              signature: "default=value",
              description:
                "Value when the flag isn't given. For positionals with nargs='?' or '*'.",
            },
            {
              signature: "required=True",
              description:
                "Force an optional flag to be supplied. Use sparingly — most 'required' flags should just be positionals.",
            },
            {
              signature: "choices=[...]",
              description:
                "Restrict to a fixed set. argparse prints the choices in errors and --help.",
            },
            {
              signature: "nargs=N | '?' | '*' | '+' | argparse.REMAINDER",
              description:
                "Control how many tokens this argument consumes. See next section.",
            },
            {
              signature: "action='store_true' | 'store_false' | 'count' | 'append' | ...",
              description:
                "What to do when the flag appears. See next section.",
            },
            {
              signature: "dest='name'",
              description:
                "Override the attribute name on Namespace. Use when the flag has hyphens you don't want translated.",
            },
            {
              signature: "metavar='NAME'",
              description:
                "How the argument appears in --help. Cosmetic, but worth setting on positionals (`PATH` reads better than `input`).",
            },
            {
              signature: "help='...'",
              description:
                "The blurb shown in --help. Always set this. `%(default)s` interpolates the default value.",
            },
          ],
        },
        {
          kind: "code_predict",
          label: "what does the Namespace look like?",
          code: `import argparse

p = argparse.ArgumentParser()
p.add_argument("input")
p.add_argument("--count", type=int, default=1)
p.add_argument("--verbose", action="store_true")

args = p.parse_args(["file.txt", "--count", "3"])
print(args)`,
          output: "Namespace(input='file.txt', count=3, verbose=False)",
          explanation:
            "Positionals come first, then optional flags in declaration order. `--count` got coerced by type=int. `--verbose` wasn't passed, so it took its default (False, the implicit default of store_true).",
          runnable: true,
        },
        {
          kind: "code_predict",
          label: "dash-to-underscore conversion",
          code: `import argparse

p = argparse.ArgumentParser()
p.add_argument("--max-tokens", type=int, default=1024)
p.add_argument("--api-key")

args = p.parse_args(["--max-tokens", "2048", "--api-key", "sk-..."])
print(args.max_tokens, args.api_key)`,
          output: "2048 sk-...",
          explanation:
            "argparse silently translates dashes in long flag names to underscores when building attribute names. `--max-tokens` on the CLI becomes `args.max_tokens` in Python. Use `dest=` if you ever need to override this.",
          runnable: true,
        },
        {
          kind: "flashcard",
          context: "Parser anatomy",
          front: "How does argparse name the Namespace attribute for `--max-tokens`?",
          back: "`args.max_tokens` — dashes in long flag names are converted to underscores. Override with `dest='something_else'`.",
        },
        {
          kind: "flashcard",
          context: "Parser anatomy",
          front: "What does a bare `--` on the command line mean?",
          back: "End-of-options sentinel: everything after `--` is treated as positionals, even if it starts with a dash. Useful for `tool -- --weird-filename`.",
        },
        {
          kind: "flashcard",
          context: "Parser anatomy",
          front: "What's the difference between `parse_args()` and `parse_known_args()`?",
          back: "`parse_args` errors on any unrecognized argument. `parse_known_args` returns `(namespace, leftovers)` so you can forward the leftovers to another tool (e.g. `pytest -k foo` passing through to pytest).",
        },
      ],
    },

    // ================================================================
    // 3. nargs, action, type, choices — the four levers
    // ================================================================
    {
      title: "nargs, action, type, choices",
      blocks: [
        {
          kind: "prose",
          markdown: `Four \`add_argument\` keywords do almost all the work of shaping how your CLI behaves:

- \`nargs\` — **how many** tokens does this argument eat?
- \`action\` — **what does argparse do** when it sees this flag?
- \`type\` — **how is the string converted** to a Python value?
- \`choices\` — **what values are allowed**?

These compose. \`add_argument("--tag", action="append", type=str.lower, choices=["a","b","c"])\` says "every time \`--tag X\` appears, lowercase X, validate it's in {a,b,c}, and append to args.tag".`,
        },
        {
          kind: "method_ref",
          title: "nargs values",
          importLine: "# parser.add_argument(..., nargs=...)",
          methods: [
            {
              signature: "nargs=N (an integer)",
              description:
                "Exactly N tokens, collected into a list. `--coords X Y` → args.coords = [X, Y].",
            },
            {
              signature: "nargs='?'",
              description:
                "Zero or one. Uses `default` if the flag is absent; uses `const` if the flag is present without a value.",
            },
            {
              signature: "nargs='*'",
              description:
                "Zero or more, collected into a list. Empty list if the flag is absent. Common for `--include FILE [FILE ...]`.",
            },
            {
              signature: "nargs='+'",
              description:
                "One or more. Errors if the flag is given with zero values. Use when at least one is mandatory.",
            },
            {
              signature: "nargs=argparse.REMAINDER",
              description:
                "Slurp everything from this point to end-of-args into a list. For wrappers that forward args (`docker run ...rest`).",
            },
          ],
        },
        {
          kind: "method_ref",
          title: "action values",
          importLine: "# parser.add_argument(..., action=...)",
          methods: [
            {
              signature: "action='store' (default)",
              description: "Store the value (after type coercion) on the namespace.",
            },
            {
              signature: "action='store_true' / 'store_false'",
              description:
                "Boolean flag — no value follows. `--verbose` → True. The other default is the opposite.",
            },
            {
              signature: "action='store_const'",
              description:
                "Store the value of `const=`. Lets you map `--level X --level Y` to fixed constants.",
            },
            {
              signature: "action='append'",
              description:
                "Append each occurrence to a list. `--tag a --tag b` → args.tag = ['a', 'b'].",
            },
            {
              signature: "action='count'",
              description:
                "Count how many times the flag appears. `-vvv` → args.verbose = 3. Pair with `default=0`.",
            },
            {
              signature: "action='version'",
              description:
                "Print `version=` and exit. `parser.add_argument('--version', action='version', version='%(prog)s 1.0')`.",
            },
            {
              signature: "action=argparse.BooleanOptionalAction  # Python 3.9+",
              description:
                "Auto-generates `--flag` AND `--no-flag` from one declaration. The cleanest way to do toggles.",
            },
          ],
        },
        {
          kind: "code_predict",
          label: "nargs='+' with zero values",
          code: `import argparse, sys

p = argparse.ArgumentParser(prog="tool")
p.add_argument("--include", nargs="+")

try:
    args = p.parse_args(["--include"])
except SystemExit as e:
    print(f"SystemExit({e.code})")`,
          output: "SystemExit(2)",
          explanation:
            "nargs='+' requires AT LEAST ONE value. Passing `--include` alone is a usage error: argparse prints the error to stderr and exits with code 2 (the standard usage-error exit code). The `try/except SystemExit` is the way to observe this in a runnable snippet.",
          runnable: true,
        },
        {
          kind: "code_predict",
          label: "nargs='*' with zero values",
          code: `import argparse

p = argparse.ArgumentParser()
p.add_argument("--include", nargs="*")

a = p.parse_args(["--include"])
b = p.parse_args([])
print(a.include, b.include)`,
          output: "[] None",
          explanation:
            "Subtle: `nargs='*'` says zero-or-more, so `--include` with no values yields an empty list `[]`. But OMITTING the flag entirely leaves the attribute at its default — and the default for `nargs='*'` is `None`, not `[]`. Set `default=[]` explicitly if you want an empty list both ways.",
          runnable: true,
        },
        {
          kind: "code_predict",
          label: "nargs='?' with const",
          code: `import argparse

p = argparse.ArgumentParser()
p.add_argument("--output", nargs="?", const="-", default=None)

a = p.parse_args([])
b = p.parse_args(["--output"])
c = p.parse_args(["--output", "results.json"])
print(a.output, b.output, c.output)`,
          output: "None - results.json",
          explanation:
            "nargs='?' is the only nargs value that distinguishes 'flag absent' from 'flag present with no value'. Absent → `default`. Present without value → `const`. Present with value → the value. The classic use: `--output [PATH]` meaning 'write to PATH if given, else write to stdout (the conventional `-` placeholder)'.",
          runnable: true,
        },
        {
          kind: "code_predict",
          label: "action='count' with -vvv",
          code: `import argparse

p = argparse.ArgumentParser()
p.add_argument("-v", "--verbose", action="count", default=0)

args = p.parse_args(["-vvv"])
print(args.verbose)`,
          output: "3",
          explanation:
            "`action='count'` increments each time the short flag appears. `-vvv` is the short-flag bundling syntax — it's equivalent to `-v -v -v` and counts as three. Pair with `default=0` so the attribute exists even when the flag is absent. Map this to your logging level: 0=WARNING, 1=INFO, 2=DEBUG.",
          runnable: true,
        },
        {
          kind: "code_predict",
          label: "custom type= callable",
          code: `import argparse

def comma_split(s: str) -> list[str]:
    return [x.strip() for x in s.split(",") if x.strip()]

p = argparse.ArgumentParser()
p.add_argument("--tags", type=comma_split, default=[])

args = p.parse_args(["--tags", "alpha, beta ,gamma"])
print(args.tags)`,
          output: "['alpha', 'beta', 'gamma']",
          explanation:
            "`type=` takes any one-arg callable. The string from the CLI is passed in, the return value is stored on the namespace. Raise ValueError or argparse.ArgumentTypeError inside the callable to trigger a usage error. This is how you build `--tags a,b,c` syntax without writing a tokenizer.",
          runnable: true,
        },
        {
          kind: "scenario_predict",
          label: "choices= rejects bad input",
          scenario: `$ python score.py --model claude-opus-3 --input data.jsonl
usage: score.py [-h] [--model {claude-opus-4-5,claude-sonnet-4-5,claude-haiku-4-5}] ...
score.py: error: argument --model: invalid choice: 'claude-opus-3'
  (choose from 'claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5')`,
          language: "bash",
          question: "What exit code did this invocation produce?",
          answer: "2",
          explanation:
            "Every argparse-detected usage error (bad choice, missing required, wrong type, unknown flag) exits with code 2 by Unix convention. Code 0 is success, 1 is generic failure, 2 is reserved for misuse of the command itself. This is why pipelines like `tool --bad-flag | jq .` see no stdout — argparse wrote to stderr and exited before any real work ran.",
        },
        {
          kind: "multiple_choice",
          title: "the right action for a toggle",
          prompt:
            "You want to expose a `--dry-run` / `--no-dry-run` toggle on Python 3.10. Which `action=` is the cleanest?",
          choices: [
            {
              text: "action='store_true' on --dry-run only",
              correct: false,
              rationale:
                "Works for turning it on, but there's no way to override a configured default back to False from the CLI. Fine for one-way flags; weak for toggles.",
            },
            {
              text: "Two separate add_argument calls, one for --dry-run and one for --no-dry-run, sharing a dest=",
              correct: false,
              rationale:
                "Functional, but verbose and easy to drift. argparse has a built-in for exactly this case.",
            },
            {
              text: "action=argparse.BooleanOptionalAction",
              correct: true,
              rationale:
                "Added in 3.9. One declaration auto-generates both `--dry-run` and `--no-dry-run`, with mutual override semantics and proper --help text. The right tool for the job.",
            },
            {
              text: "action='count' with default=0",
              correct: false,
              rationale:
                "`count` is for `-vvv` style verbosity counters, not booleans. Reading `args.dry_run > 0` would technically work but is misleading.",
            },
          ],
          explanation:
            "On Python ≥ 3.9, `BooleanOptionalAction` is the idiomatic toggle. On older interpreters, fall back to a mutually exclusive group with two `store_true`/`store_false` flags sharing `dest=`.",
        },
        {
          kind: "flashcard",
          context: "nargs/action levers",
          front: "Difference between `nargs='*'` default and `default=[]`?",
          back: "Without `default=[]`, an omitted `nargs='*'` flag leaves the attribute as `None`. Set `default=[]` to get an empty list in both 'flag absent' and 'flag given with no values' cases.",
        },
        {
          kind: "flashcard",
          context: "nargs/action levers",
          front: "When does `nargs='?'` use `const` vs `default`?",
          back: "`default` when the flag isn't supplied at all. `const` when the flag is supplied without a value (`--output` alone). The value itself otherwise.",
        },
        {
          kind: "flashcard",
          context: "nargs/action levers",
          front: "How do you raise a usage error from a custom `type=` callable?",
          back: "Raise `argparse.ArgumentTypeError(\"message\")` (or `ValueError`). argparse catches it, formats the usage line, and exits with code 2.",
        },
      ],
    },

    // ================================================================
    // 4. Subcommands & mutex groups
    // ================================================================
    {
      title: "Subcommands & mutex groups",
      blocks: [
        {
          kind: "prose",
          markdown: `Real tools have **verbs**: \`git add\`, \`git commit\`, \`git push\`. Each verb has its own flags. argparse models this with **subparsers**.

\`\`\`python
import argparse

parser = argparse.ArgumentParser(prog="evals")
sub = parser.add_subparsers(dest="command", required=True)

run = sub.add_parser("run", help="Run an eval suite")
run.add_argument("dataset")
run.add_argument("--model", default="claude-opus-4-5")

show = sub.add_parser("show", help="Print results for a past run")
show.add_argument("run_id")

args = parser.parse_args()
print(args.command, args)
\`\`\`

The pattern: \`add_subparsers(dest='command', required=True)\` returns a registry. Call \`.add_parser(name)\` to get a fresh \`ArgumentParser\` for that verb. \`args.command\` tells you which verb the user picked.

**Mutex groups** are a different problem: not "which verb" but "which of these mutually exclusive flags". \`--json\` and \`--yaml\` shouldn't both be allowed.

\`\`\`python
group = parser.add_mutually_exclusive_group(required=True)
group.add_argument("--json", action="store_true")
group.add_argument("--yaml", action="store_true")
\`\`\`

argparse enforces "exactly one of" at parse time — you never write the validation yourself.`,
        },
        {
          kind: "method_ref",
          title: "Subparser & group APIs",
          importLine: "# parser = argparse.ArgumentParser(...)",
          methods: [
            {
              signature: ".add_subparsers(dest=, required=, help=)",
              description:
                "Create a subparser registry. `dest` is the Namespace attribute that holds the chosen subcommand name. `required=True` makes the subcommand mandatory.",
              returns: "_SubParsersAction",
            },
            {
              signature: "subparsers.add_parser(name, **kwargs)",
              description:
                "Register one subcommand. Returns a fresh ArgumentParser you configure independently. Accepts `parents=[shared_parser]` to inherit flags.",
              returns: "ArgumentParser",
            },
            {
              signature: ".add_argument_group(title=, description=)",
              description:
                "**Cosmetic** grouping for --help. Doesn't enforce anything; just clusters related flags under a heading.",
            },
            {
              signature: ".add_mutually_exclusive_group(required=False)",
              description:
                "**Semantic** grouping. Only one member's flag may appear. `required=True` also enforces that exactly one must appear.",
            },
            {
              signature: "subparser.set_defaults(func=handler)",
              description:
                "Attach a callable to the Namespace. The dispatch pattern: every subparser sets `func=`, main does `args.func(args)`.",
            },
          ],
        },
        {
          kind: "code_predict",
          label: "subcommand dispatch",
          code: `import argparse

def run(args):  print("RUN", args.dataset, args.model)
def show(args): print("SHOW", args.run_id)

p = argparse.ArgumentParser()
sub = p.add_subparsers(dest="command", required=True)

r = sub.add_parser("run")
r.add_argument("dataset")
r.add_argument("--model", default="claude-opus-4-5")
r.set_defaults(func=run)

s = sub.add_parser("show")
s.add_argument("run_id")
s.set_defaults(func=show)

args = p.parse_args(["run", "tickets.jsonl", "--model", "claude-sonnet-4-5"])
args.func(args)`,
          output: "RUN tickets.jsonl claude-sonnet-4-5",
          explanation:
            "The `set_defaults(func=handler)` trick removes all the `if args.command == 'run': ... elif ...` boilerplate. Each subparser registers its own handler; main just calls `args.func(args)`. Adding a new verb is one new `add_parser` block, no changes to dispatch.",
          runnable: true,
        },
        {
          kind: "scenario_predict",
          label: "mutex group violation",
          scenario: `$ python tool.py --json --yaml
usage: tool.py [-h] (--json | --yaml)
tool.py: error: argument --yaml: not allowed with argument --json`,
          language: "bash",
          question:
            "What exit code did this invocation produce, and where was the error written?",
          answer: "Exit code 2, written to stderr.",
          explanation:
            "Mutex group violations are argparse usage errors, so they follow the same convention as every other argparse failure: error message to stderr, SystemExit(2). The `(--json | --yaml)` notation in the usage line is argparse's way of rendering the mutex constraint.",
        },
        {
          kind: "code_predict",
          label: "sharing flags with parents=",
          code: `import argparse

# Common flags every subcommand needs
common = argparse.ArgumentParser(add_help=False)
common.add_argument("--verbose", action="count", default=0)
common.add_argument("--config", default="~/.evals.toml")

p = argparse.ArgumentParser()
sub = p.add_subparsers(dest="command", required=True)
sub.add_parser("run", parents=[common]).add_argument("dataset")
sub.add_parser("show", parents=[common]).add_argument("run_id")

args = p.parse_args(["run", "x.jsonl", "--verbose", "--verbose"])
print(args.command, args.verbose, args.config)`,
          output: "run 2 ~/.evals.toml",
          explanation:
            "`parents=[common]` copies all of `common`'s arguments into each subparser. `add_help=False` on the parent is essential — otherwise both parents and children try to register `-h` and argparse raises a conflict. The pattern keeps cross-cutting flags (verbosity, config path, API key) declared once.",
          runnable: true,
        },
        {
          kind: "flashcard",
          context: "Subcommands & groups",
          front: "What's the difference between `add_argument_group` and `add_mutually_exclusive_group`?",
          back: "**argument_group is cosmetic** — it only changes --help layout. **mutually_exclusive_group is semantic** — argparse enforces that at most (or exactly) one member is supplied.",
        },
        {
          kind: "flashcard",
          context: "Subcommands & groups",
          front: "Why does the parent parser need `add_help=False` when used via `parents=[...]`?",
          back: "Otherwise the parent and child both try to register `-h/--help`, causing an ArgumentError on parser construction. The child still gets its own --help.",
        },
        {
          kind: "flashcard",
          context: "Subcommands & groups",
          front: "How do you dispatch to subcommand handlers without an if/elif chain?",
          back: "Each subparser calls `.set_defaults(func=handler)`. After parsing, main does `args.func(args)`. New verbs require zero changes to dispatch.",
        },
      ],
    },

    // ================================================================
    // 5. argv, env vars, and config precedence
    // ================================================================
    {
      title: "argv, env vars, and config precedence",
      blocks: [
        {
          kind: "prose",
          markdown: `argparse only handles command-line flags. A production CLI accepts configuration from **three** sources:

1. **Command-line flags** (highest priority — explicit user intent)
2. **Environment variables** (per-shell, per-user)
3. **Config file** (\`pyproject.toml\`, \`.env\`, \`~/.toolrc\`)
4. (Built-in defaults — the floor)

The right precedence is **flag > env > config > default**. The user's most explicit signal wins.

argparse can't do this for you. \`argparse\` is for argv only. Don't try to fold env and config into \`add_argument(default=os.environ.get(...))\` — that path hides the source of truth from \`--help\` (the default shown will be whatever happened to be in the environment at \`-h\` time) and obscures it in your logs. **Read flags via argparse, then merge env and config explicitly in your own code.**`,
        },
        {
          kind: "code_comparison",
          label: "hiding env in default= vs explicit post-parse merge",
          left: {
            title: "Implicit (don't do this)",
            code: `import argparse, os

p = argparse.ArgumentParser()
p.add_argument(
    "--api-key",
    default=os.environ.get("ANTHROPIC_API_KEY"),
)
args = p.parse_args()
client = Anthropic(api_key=args.api_key)`,
            annotation:
              "Looks tidy, but: --help shows the actual key as the default (leaking it in screenshots), the source of the key is invisible in logs, and you can't tell 'user passed it' from 'fell back to env'.",
          },
          right: {
            title: "Explicit (do this)",
            code: `import argparse, os

p = argparse.ArgumentParser()
p.add_argument("--api-key", default=None,
               help="Anthropic API key (or set ANTHROPIC_API_KEY).")
args = p.parse_args()

api_key = args.api_key or os.environ.get("ANTHROPIC_API_KEY")
if not api_key:
    p.error("--api-key or $ANTHROPIC_API_KEY required")

source = "flag" if args.api_key else "env"
log.info("using api key", extra={"source": source})`,
            annotation:
              "Source of the secret is preserved, --help is stable, and you fail fast with a usage error if neither is set.",
          },
          takeaway:
            "argparse owns argv. You own the merge with env and config. Keeping the boundary clean makes every CLI you write debuggable.",
        },
        {
          kind: "scenario_predict",
          label: "which value wins?",
          scenario: `$ export ANTHROPIC_API_KEY=env-key
$ python tool.py run --api-key flag-key`,
          language: "bash",
          question:
            "Under the standard precedence (flag > env > config > default), which key does the tool use?",
          answer: "flag-key",
          explanation:
            "Command-line flags are the most explicit user signal, so they override environment variables. If the user passed `--api-key flag-key` and the env var was set, the flag wins. If only the env var were set, the tool would fall back to env-key. This precedence is conventional across most CLI tools (kubectl, aws, gh, etc.) — don't invert it without a good reason.",
        },
        {
          kind: "key_insight",
          label: "Don't ask argparse to do everything",
          insight: `**argparse handles flags. You handle env and config.**

The temptation to cram env-var fallbacks into \`default=os.environ.get(...)\` looks like clever consolidation, but it costs you:

- \`--help\` output becomes unstable (depends on the runtime environment)
- Secrets can leak into help/screenshots
- You lose the ability to log *where* a config value came from

Keep argparse focused on parsing argv. Merge env and config in a small named function (\`resolve_config(args) -> Config\`) right after \`parse_args()\`. Future-you debugging a misconfigured production run will thank you.`,
        },
        {
          kind: "code_predict",
          label: "fromfile_prefix_chars — @args.txt expansion",
          code: `import argparse, tempfile, os

p = argparse.ArgumentParser(fromfile_prefix_chars="@")
p.add_argument("--model")
p.add_argument("inputs", nargs="+")

with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as f:
    f.write("--model\\nclaude-opus-4-5\\nfile1.txt\\nfile2.txt\\n")
    path = f.name

args = p.parse_args([f"@{path}"])
os.unlink(path)
print(args.model, args.inputs)`,
          output: "claude-opus-4-5 ['file1.txt', 'file2.txt']",
          explanation:
            "`fromfile_prefix_chars='@'` tells argparse: any argv token starting with `@` is a path to a file containing more args (one per line). This is how tools like `gcc @flags.txt` work. Useful when your invocation outgrows what fits comfortably on one shell line.",
          runnable: true,
        },
        {
          kind: "flashcard",
          context: "argv/env/config",
          front: "Standard precedence for CLI config?",
          back: "**flag > env var > config file > built-in default.** Most-explicit wins. Don't invert without a documented reason.",
        },
        {
          kind: "flashcard",
          context: "argv/env/config",
          front: "Why avoid `default=os.environ.get('KEY')` for secrets?",
          back: "Pollutes --help (shows the actual key as the default), obscures the source in logs, and conflates 'user passed it' with 'fell back to env'.",
        },
        {
          kind: "flashcard",
          context: "argv/env/config",
          front: "What does `fromfile_prefix_chars='@'` enable?",
          back: "Users can put long arg lists in a file and invoke `tool @args.txt`. argparse reads the file (one token per line) and splices it into argv.",
        },
        {
          kind: "flashcard",
          context: "argv/env/config",
          front: "Where do you put the env-var fallback in a healthy CLI?",
          back: "In a small `resolve_config(args)` function called immediately after `parse_args()`. argparse stays focused on argv only.",
        },
      ],
    },

    // ================================================================
    // 6. Exit codes, stdin/stdout, and piping
    // ================================================================
    {
      title: "Exit codes, stdin/stdout, and piping",
      blocks: [
        {
          kind: "prose",
          markdown: `Your CLI is a Unix citizen. Two conventions matter:

**Streams**
- **stdout** is for data — whatever a downstream pipe should see.
- **stderr** is for diagnostics — progress, warnings, errors. Anything humans read.

If you \`print("error: bad input")\` to stdout, you've just poisoned every pipe consuming your output. Errors go to \`sys.stderr\`.

**Exit codes**

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | Generic failure (your app's fault) |
| 2 | Usage error (argparse owns this) |
| 64–78 | sysexits.h categories — \`EX_USAGE\`, \`EX_DATAERR\`, \`EX_NOINPUT\`, \`EX_UNAVAILABLE\`, etc. Most tools ignore these; some use them. |
| 130 | Killed by SIGINT (Ctrl-C) |

Three rules that cover 95% of cases:

1. \`return 0\` (or nothing) on success.
2. \`sys.exit(1)\` on application failure with a message to stderr.
3. Let argparse handle exit code 2 on its own — \`parser.error("msg")\` is how you join the same convention from custom validation.`,
        },
        {
          kind: "code_predict",
          label: "what does parser.error do?",
          code: `import argparse

p = argparse.ArgumentParser(prog="tool")
p.add_argument("path")

args = p.parse_args(["myfile.txt"])

# Custom validation
import os
if not os.path.exists(args.path):
    try:
        p.error(f"path does not exist: {args.path}")
    except SystemExit as e:
        print(f"caught SystemExit({e.code})")`,
          output: "caught SystemExit(2)",
          explanation:
            "`parser.error()` writes a usage line + the message to stderr and raises `SystemExit(2)`. It does NOT return. The pattern: do positional/type validation that argparse can't express, then call `parser.error()` so your custom errors look identical to argparse's built-in errors (same format, same stream, same exit code).",
          runnable: true,
        },
        {
          kind: "scenario_predict",
          label: "where does the error go?",
          scenario: `$ python tool.py --bad-flag | jq .
usage: tool.py [-h] [--good-flag GOOD_FLAG]
tool.py: error: unrecognized arguments: --bad-flag
$ echo $?
2`,
          language: "bash",
          question:
            "Did `jq` receive any input on its stdin from this pipeline?",
          answer:
            "No. argparse wrote to stderr and exited with code 2 before any user code ran. stdout was never written to, so jq saw an empty stream and exited without parsing anything.",
          explanation:
            "This is the whole point of the stderr/stdout split. If argparse had printed to stdout, jq would have tried to parse `usage: tool.py...` as JSON and emitted its own confusing error. By writing to stderr, argparse stays invisible to the pipe — the user sees the error on their terminal, downstream tools see clean input only.",
        },
        {
          kind: "code_comparison",
          label: "print vs sys.stdout.write — when it matters",
          left: {
            title: "print() — the everyday choice",
            code: `print(json.dumps(result))
print(json.dumps(result2))`,
            annotation:
              "Adds a newline, flushes on each call when stdout is line-buffered (the default for a TTY). Good for line-oriented data and human output.",
          },
          right: {
            title: "sys.stdout.write / sys.stdout.buffer — explicit cases",
            code: `# Binary output
sys.stdout.buffer.write(pdf_bytes)

# Manual flushing in a long-running loop where
# the user is watching progress
for chunk in stream:
    sys.stdout.write(chunk)
    sys.stdout.flush()`,
            annotation:
              "Use `stdout.buffer` for non-text (PDFs, images, binary protocols). Use `.write` + `.flush` when print's buffering is wrong — e.g. when stdout is piped (block-buffered) and you want progressive output.",
          },
          takeaway:
            "Default to `print`. Reach for `sys.stdout.write` only when you need byte output or explicit flush control. Always pass `file=sys.stderr` to print when emitting diagnostics.",
        },
        {
          kind: "method_ref",
          title: "Stdin/stdout idioms",
          importLine: "import sys, argparse",
          methods: [
            {
              signature: "argparse.FileType('r')",
              description:
                "A `type=` value that opens the path as a file. The special filename `-` maps to sys.stdin (for 'r') or sys.stdout (for 'w'). Built-in stdin support for free.",
            },
            {
              signature: "sys.stdin",
              description:
                "Text-mode stream from the parent process. `sys.stdin.read()` slurps everything; iterate with `for line in sys.stdin`.",
            },
            {
              signature: "sys.stdin.isatty()",
              description:
                "True if stdin is a terminal (interactive user), False if it's a pipe or file. Use to decide between interactive prompts and silent batch mode.",
            },
            {
              signature: "sys.stdout / sys.stderr",
              description:
                "Line-buffered when connected to a TTY, block-buffered when piped. Use `.flush()` if you need promptness.",
            },
            {
              signature: "sys.exit(code)",
              description:
                "Raises SystemExit(code). Code 0 success, 1 generic failure. Argparse uses 2 for usage errors.",
            },
            {
              signature: "print('...', file=sys.stderr)",
              description:
                "The idiomatic way to emit progress or errors without polluting stdout.",
            },
          ],
        },
        {
          kind: "code_predict",
          label: "FileType('-') for stdin",
          code: `import argparse, io, sys

p = argparse.ArgumentParser()
p.add_argument("input", type=argparse.FileType("r"))

# Simulate 'tool -' with stdin piped in.
sys.stdin = io.StringIO("hello from stdin\\n")
args = p.parse_args(["-"])
print(args.input.read().strip())`,
          output: "hello from stdin",
          explanation:
            "`type=argparse.FileType('r')` opens the path argument as a file handle. The magic filename `-` maps to `sys.stdin`. This is the cleanest way to let your tool accept either a real path or piped input — same syntax, no special-case branch.",
          runnable: true,
        },
        {
          kind: "flashcard",
          context: "Exit codes & streams",
          front: "Three standard exit codes every CLI author should know?",
          back: "**0** success, **1** generic application failure, **2** usage error (argparse's default).",
        },
        {
          kind: "flashcard",
          context: "Exit codes & streams",
          front: "Which stream do diagnostics, progress, and errors go to?",
          back: "**stderr.** Stdout is for data the next pipe stage should consume. Mixing them poisons pipelines.",
        },
        {
          kind: "flashcard",
          context: "Exit codes & streams",
          front: "What does `parser.error('msg')` do?",
          back: "Writes a usage line and the message to stderr, raises SystemExit(2). Doesn't return. Use it for custom validation so your errors match argparse's built-in error style.",
        },
        {
          kind: "flashcard",
          context: "Exit codes & streams",
          front: "How do you accept either a file path or stdin with one argparse declaration?",
          back: "`parser.add_argument('input', type=argparse.FileType('r'))`. Pass `-` on the command line to read from stdin.",
        },
      ],
    },

    // ================================================================
    // 7. Putting it together — a real FDE CLI
    // ================================================================
    {
      title: "Putting it together",
      blocks: [
        {
          kind: "prose",
          markdown: `Here's a representative tool that uses everything from this guide. It runs an eval suite against Claude, accepts config from flag/env/config, dispatches subcommands, and exits with conventional codes.

\`\`\`python
import argparse, os, sys, json
from pathlib import Path

def cmd_run(args):
    api_key = args.api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("error: ANTHROPIC_API_KEY not set", file=sys.stderr)
        return 1
    print(f"running {args.dataset} on {args.model} x{args.concurrency}",
          file=sys.stderr)
    # ... actual work ...
    print(json.dumps({"ok": True, "model": args.model}))  # stdout = data
    return 0

def cmd_show(args):
    print(f"results for run {args.run_id}", file=sys.stderr)
    return 0

def build_parser():
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("-v", "--verbose", action="count", default=0)
    common.add_argument("--api-key", default=None,
                        help="API key (or set $ANTHROPIC_API_KEY).")

    p = argparse.ArgumentParser(
        prog="evals",
        description="Run and inspect Claude eval suites.",
        fromfile_prefix_chars="@",
    )
    sub = p.add_subparsers(dest="command", required=True)

    r = sub.add_parser("run", parents=[common], help="Run an eval suite")
    r.add_argument("dataset", type=Path)
    r.add_argument("--model", default="claude-opus-4-5",
                   choices=["claude-opus-4-5","claude-sonnet-4-5","claude-haiku-4-5"])
    r.add_argument("--concurrency", type=int, default=4)
    r.add_argument("--dry-run", action=argparse.BooleanOptionalAction, default=False)
    r.set_defaults(func=cmd_run)

    s = sub.add_parser("show", parents=[common], help="Show past results")
    s.add_argument("run_id")
    s.set_defaults(func=cmd_show)

    return p

def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)

if __name__ == "__main__":
    sys.exit(main())
\`\`\`

Every piece earns its place:

- \`fromfile_prefix_chars="@"\` so the customer can do \`evals run @prod-config.txt\`.
- \`parents=[common]\` so \`-v\` and \`--api-key\` work on every subcommand without duplication.
- \`BooleanOptionalAction\` so \`--dry-run\` and \`--no-dry-run\` exist with one declaration.
- \`choices=\` on \`--model\` so a typo fails fast with a clear list of valid values.
- \`set_defaults(func=...)\` so adding a third verb means one new \`add_parser\` block.
- \`print(..., file=sys.stderr)\` for progress so pipelines stay clean.
- \`sys.exit(main())\` so the handler's return value becomes the process exit code.`,
        },
        {
          kind: "code_predict",
          label: "what does the namespace look like?",
          code: `import argparse
from pathlib import Path

p = argparse.ArgumentParser(prog="evals")
sub = p.add_subparsers(dest="command", required=True)
r = sub.add_parser("run")
r.add_argument("dataset", type=Path)
r.add_argument("--model", default="claude-opus-4-5")
r.add_argument("--concurrency", type=int, default=4)
r.add_argument("--dry-run", action=argparse.BooleanOptionalAction, default=False)

args = p.parse_args([
    "run", "tickets.jsonl",
    "--concurrency", "8",
    "--no-dry-run",
])
print(args)`,
          output:
            "Namespace(command='run', dataset=PosixPath('tickets.jsonl'), model='claude-opus-4-5', concurrency=8, dry_run=False)",
          explanation:
            "`type=Path` coerces the string into a pathlib.Path. `BooleanOptionalAction` generated `--no-dry-run` for free, and it set `args.dry_run = False`. `--model` wasn't passed so it used its default. The `command` attribute holds the subparser name, courtesy of `dest='command'`.",
          runnable: true,
        },
        {
          kind: "key_insight",
          label: "Closing thought",
          insight: `Your CLI is the API your future-self (and the customer's engineers) will call in a hurry at 11 PM on a Thursday. The thirty extra minutes you spend on argparse — naming flags well, picking the right \`nargs\`, writing real \`help=\` strings, getting the precedence right — pays back every time someone runs \`tool --help\` instead of reading your code.

**\`--help\` is your first piece of documentation.** Make it good.`,
        },
        {
          kind: "flashcard",
          context: "Recap",
          front: "Four levers on `add_argument` that shape behavior?",
          back: "**type** (coerce string), **nargs** (how many tokens), **action** (what to do on match), **choices** (allowed values).",
        },
        {
          kind: "flashcard",
          context: "Recap",
          front: "What's the precedence order for CLI config?",
          back: "**flag > env var > config file > built-in default.** The most-explicit signal wins.",
        },
        {
          kind: "flashcard",
          context: "Recap",
          front: "How do you build a `git`-style subcommand CLI in argparse?",
          back: "`sub = parser.add_subparsers(dest='command', required=True)`, then `sub.add_parser(name)` for each verb. Use `set_defaults(func=handler)` for dispatch.",
        },
        {
          kind: "flashcard",
          context: "Recap",
          front: "Three exit codes to memorize?",
          back: "**0** = success, **1** = generic failure, **2** = usage error (argparse's default).",
        },
        {
          kind: "flashcard",
          context: "Recap",
          front: "stdout vs stderr — which gets what?",
          back: "**stdout** = data the next pipe stage should consume. **stderr** = progress, warnings, errors, anything for the human.",
        },
      ],
    },
  ],
};
