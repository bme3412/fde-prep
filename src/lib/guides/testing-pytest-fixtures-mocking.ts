import type { StudyGuide } from "../guide-types";

export const testingPytestFixturesMockingGuide: StudyGuide = {
  topicTitle: "Testing patterns: pytest, fixtures, mocking",
  topicSlug: "testing-pytest-fixtures-mocking",
  sections: [
    // ─────────────────────────────────────────────────────────────────────
    // 1. Why testing matters for an FDE
    // ─────────────────────────────────────────────────────────────────────
    {
      title: "Why tests matter when you ship LLM systems",
      blocks: [
        {
          kind: "prose",
          markdown: `Forward-deployed work has a specific testing pain: most of your code calls an LLM, and LLM calls are **slow, non-deterministic, and cost money**. A 200-test suite that hits the real Anthropic API on every push is unusable — minutes of wait, dollars per run, flakes from sampling variance.

The discipline this guide trains: **shape your code so the deterministic glue is testable in milliseconds without API keys, and the model boundary is mocked or replayed.** That means dependency injection (pass the \`anthropic.Anthropic()\` client in, don't construct it inside the function), small pure helpers around the I/O, and a clear seam where the network call happens.

Pytest is the de facto Python test runner. Fixtures are its setup/teardown system. \`unittest.mock\` and \`monkeypatch\` are how you stub out the model call. \`freezegun\` and \`vcr\`/\`respx\` are how you stop tests from depending on wall-clock time and live HTTP. Get fluent in all five and your test suite will run in under a second.`,
        },
        {
          kind: "key_insight",
          label: "Mental model",
          insight: `Treat **\`messages.create(...)\` as a system boundary**, like a database query or an HTTP call. Tests above the boundary use a fake client; tests below the boundary are integration tests, run rarely, and live in a separate marker (\`@pytest.mark.integration\`) that CI skips by default.`,
        },
        {
          kind: "code_comparison",
          label: "Wired-in vs injected client",
          left: {
            title: "Hard to test (client constructed inside function)",
            code: `def summarize(text: str) -> str:
    client = anthropic.Anthropic()   # built here
    resp = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=200,
        messages=[{"role": "user", "content": text}],
    )
    return resp.content[0].text`,
            annotation:
              "Tests must monkeypatch the module-level `anthropic.Anthropic` symbol, or patch `client.messages.create` after construction.",
          },
          right: {
            title: "Easy to test (client passed in)",
            code: `def summarize(client: anthropic.Anthropic, text: str) -> str:
    resp = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=200,
        messages=[{"role": "user", "content": text}],
    )
    return resp.content[0].text`,
            annotation:
              "Tests pass in a Mock() with a pre-canned `messages.create.return_value`. No patching, no module mutation.",
          },
          takeaway:
            "Dependency injection makes tests one-line. Most 'pytest is hard' complaints are really 'my code wasn't designed to be tested' complaints.",
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 2. pytest basics
    // ─────────────────────────────────────────────────────────────────────
    {
      title: "pytest basics — discovery, assertions, running",
      blocks: [
        {
          kind: "prose",
          markdown: `Pytest discovers tests automatically: files named \`test_*.py\` or \`*_test.py\`, functions prefixed \`test_\`, classes prefixed \`Test\`. No \`unittest.TestCase\` boilerplate required. Assertions are plain \`assert\` statements — pytest rewrites them at import time so a failed \`assert x == y\` prints both sides with a readable diff.

Run the whole suite with \`pytest\`. Run a single file with \`pytest tests/test_summarize.py\`. Run a single test with \`pytest tests/test_summarize.py::test_strips_whitespace\`. Use \`-k expr\` to filter by name substring, \`-x\` to stop on first failure, \`-vv\` for verbose diffs, \`-s\` to disable stdout capture (so \`print\` shows up), \`--lf\` to re-run only last-failed.`,
        },
        {
          kind: "method_ref",
          title: "pytest — CLI flags you actually use",
          importLine: "$ pytest [options] [paths]",
          methods: [
            {
              signature: "-k EXPR",
              description: "Run tests whose name matches the substring/expression (`-k 'retry and not slow'`).",
            },
            {
              signature: "-x",
              description: "Stop after first failure. Pairs well with `--lf` next run.",
            },
            {
              signature: "--lf / --ff",
              description: "Only run last-failed tests (`--lf`); or run failed first, then the rest (`--ff`).",
            },
            {
              signature: "-vv",
              description: "Verbose mode with full diffs on assertion failures.",
            },
            {
              signature: "-s",
              description: "Disable stdout/stderr capture so `print()` and breakpoints show up live.",
            },
            {
              signature: "-m MARKER",
              description: "Run only tests with `@pytest.mark.MARKER` (`-m 'not slow'` to skip slow ones).",
            },
            {
              signature: "-p no:cacheprovider",
              description: "Disable the `.pytest_cache` dir. Useful in CI containers.",
            },
            {
              signature: "--maxfail=N",
              description: "Stop after N failures (cheaper than `-x` if you want a few signals).",
            },
            {
              signature: "--collect-only",
              description: "List what would run, don't execute. Sanity-check discovery.",
            },
            {
              signature: "-n NUM",
              description: "Parallel execution via `pytest-xdist` (separate install). `pytest -n auto` uses all cores.",
            },
          ],
        },
        {
          kind: "code_predict",
          label: "Plain assert with diff",
          code: `# test_basic.py
def normalize(s: str) -> str:
    return " ".join(s.split())

def test_normalize_collapses_whitespace():
    assert normalize("  hi   there\\nworld  ") == "hi there world"

def test_normalize_single_word():
    assert normalize("hi") == "hi"
# Run with: pytest test_basic.py -v
`,
          output: `test_basic.py::test_normalize_collapses_whitespace PASSED
test_basic.py::test_normalize_single_word PASSED
2 passed in 0.01s`,
          explanation:
            "No imports, no TestCase class, no `assertEqual`. Just `def test_*` and `assert`. Pytest rewrites the `assert` AST so failed comparisons show both sides.",
        },
        {
          kind: "code_predict",
          label: "Expected-failure pattern with pytest.raises",
          code: `import pytest

def divide(a: int, b: int) -> float:
    if b == 0:
        raise ValueError("cannot divide by zero")
    return a / b

def test_divide_raises_on_zero():
    with pytest.raises(ValueError, match="zero"):
        divide(10, 0)

def test_divide_works():
    assert divide(10, 2) == 5.0
`,
          output: `2 passed in 0.01s`,
          explanation:
            "`pytest.raises(Exc, match=regex)` asserts the exception type AND that its message matches the regex. `match=` is a partial regex (uses `re.search`), so substrings work.",
        },
        {
          kind: "scenario_predict",
          label: "Reading a failed assertion",
          scenario: `>   assert response["choices"][0]["text"] == "hello world"
E   AssertionError: assert 'Hello, world!' == 'hello world'
E     - hello world
E     + Hello, world!
E     ?  ^      ^^^^^`,
          language: "text",
          question:
            "What does the `?` line with `^` markers indicate, and what two differences between the strings caused the failure?",
          answer:
            "The `?` line is pytest's diff annotation — `^` marks character positions that differ. Differences: (1) capital 'H' in actual vs lowercase 'h' in expected, (2) actual has trailing ', world!' (comma, space, exclamation) vs expected `' world'` (no comma, no exclamation).",
          explanation:
            "Pytest's verbose-diff output uses `+` for actual, `-` for expected, and `?` to call out exact differing positions. Read top-down: the assert line, then `-` (what test wanted), `+` (what code returned), `?` (where they diverge).",
        },
        {
          kind: "method_ref",
          title: "pytest — assertion helpers",
          importLine: "import pytest",
          methods: [
            {
              signature: "pytest.raises(ExcType, match=regex)",
              description: "Context manager asserting that the block raises `ExcType`. `match` is `re.search` on the message.",
            },
            {
              signature: "pytest.warns(WarningType)",
              description: "Like `pytest.raises` but for warnings.",
            },
            {
              signature: "pytest.approx(value, rel=1e-6, abs=None)",
              description: "Compare floats with tolerance: `assert 0.1 + 0.2 == pytest.approx(0.3)`.",
            },
            {
              signature: "pytest.fail(msg)",
              description: "Explicitly fail a test with a message.",
            },
            {
              signature: "pytest.skip(msg)",
              description: "Skip the rest of the current test at runtime.",
            },
            {
              signature: "pytest.xfail(msg)",
              description: "Mark the test as an expected failure at runtime.",
            },
            {
              signature: "@pytest.mark.skip(reason='...')",
              description: "Static skip decorator. Use `skipif(condition, reason=...)` for conditional.",
            },
            {
              signature: "@pytest.mark.xfail(reason='...', strict=True)",
              description: "Expected to fail. `strict=True` flips it: if it unexpectedly passes, the suite fails.",
            },
          ],
        },
        {
          kind: "flashcard",
          front: "What's the test discovery pattern for pytest?",
          back: "Files matching `test_*.py` or `*_test.py`, top-level functions prefixed `test_`, and classes prefixed `Test` (with no `__init__`). All configurable in `pyproject.toml` under `[tool.pytest.ini_options]`.",
        },
        {
          kind: "flashcard",
          front: "How do you assert that a function raises a specific exception with a specific message?",
          back: "`with pytest.raises(ValueError, match='cannot divide'): divide(1, 0)`. The `match=` argument is a regex (uses `re.search`), so partial-string matches work without anchoring.",
        },
        {
          kind: "flashcard",
          front: "Difference between `pytest.mark.skip` and `pytest.mark.xfail`?",
          back: "`skip` = don't run at all (counted as 'skipped'). `xfail` = run, expect it to fail; if it actually fails, counts as 'xfailed' (passing); if it unexpectedly passes, counts as 'xpassed' (warning, or failure if `strict=True`).",
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 3. Fixtures
    // ─────────────────────────────────────────────────────────────────────
    {
      title: "Fixtures — pytest's setup/teardown",
      blocks: [
        {
          kind: "prose",
          markdown: `A **fixture** is a function decorated with \`@pytest.fixture\` that returns (or \`yield\`s) a value. Tests that name the fixture in their argument list receive that value. Pytest does the wiring by name. No \`setUp\`/\`tearDown\` methods, no inheritance.

Fixtures can depend on other fixtures (just take them as arguments). They have a **scope**: \`function\` (default — rebuilt per test), \`class\`, \`module\`, \`package\`, or \`session\` (built once per pytest run). Use \`yield\` instead of \`return\` to run teardown code after the test completes.

\`conftest.py\` is the magic file: any fixtures defined there are auto-available to every test in the same directory and below, with no import. That's where you put your \`client\`, \`db\`, \`tmp_workspace\` — anything shared.`,
        },
        {
          kind: "code_predict",
          label: "Basic fixture, function scope",
          code: `# conftest.py or test_foo.py
import pytest

@pytest.fixture
def sample_messages():
    return [
        {"role": "user", "content": "hello"},
        {"role": "assistant", "content": "hi there"},
    ]

def test_count_messages(sample_messages):
    assert len(sample_messages) == 2

def test_roles(sample_messages):
    roles = [m["role"] for m in sample_messages]
    assert roles == ["user", "assistant"]
`,
          output: `2 passed in 0.01s`,
          explanation:
            "Each test asks for `sample_messages` by argument name; pytest finds the fixture and injects the return value. Function-scope (the default) means the fixture runs once per test, so mutations in one test can't leak to another.",
        },
        {
          kind: "code_predict",
          label: "yield fixture for teardown",
          code: `import pytest, tempfile, pathlib

@pytest.fixture
def tmp_workspace():
    d = tempfile.mkdtemp()
    print(f"setup: {d}")
    yield pathlib.Path(d)
    print(f"teardown: {d}")
    # (in real code: shutil.rmtree(d))

def test_write_file(tmp_workspace):
    (tmp_workspace / "notes.txt").write_text("hi")
    assert (tmp_workspace / "notes.txt").read_text() == "hi"
# Run with: pytest -s test_x.py
`,
          output: `setup: /tmp/tmpXXXXXX
.teardown: /tmp/tmpXXXXXX
1 passed in 0.01s`,
          explanation:
            "Code before `yield` runs as setup, the yielded value is what the test receives, code after `yield` runs as teardown — even if the test raises. (pytest has a built-in `tmp_path` fixture that does this already; this is illustrative.)",
        },
        {
          kind: "code_comparison",
          label: "return vs yield in a fixture",
          left: {
            title: "return — no teardown",
            code: `@pytest.fixture
def client():
    return anthropic.Anthropic()
    # nothing runs after return`,
            annotation:
              "Fine for stateless objects with no resources to release.",
          },
          right: {
            title: "yield — with teardown",
            code: `@pytest.fixture
def db_conn():
    conn = sqlite3.connect(":memory:")
    yield conn
    conn.close()   # runs after the test, even on failure`,
            annotation:
              "Required when the fixture owns a resource (file handle, connection, subprocess).",
          },
          takeaway:
            "Use `return` for plain values, `yield` whenever cleanup is needed. The `yield` style is teardown-safe under exceptions.",
        },
        {
          kind: "code_predict",
          label: "Scope changes lifetime",
          code: `import pytest

call_count = {"n": 0}

@pytest.fixture(scope="module")
def expensive_setup():
    call_count["n"] += 1
    return {"shared": True}

def test_a(expensive_setup):
    assert expensive_setup["shared"]

def test_b(expensive_setup):
    assert expensive_setup["shared"]

def test_c():
    # No fixture here; doesn't trigger setup
    assert call_count["n"] == 1  # tests a & b shared one build
`,
          output: `3 passed in 0.01s`,
          explanation:
            "`scope='module'` means the fixture is built once for all tests in the module. `test_a` triggers the build; `test_b` reuses it; `test_c` (which doesn't request it) sees `call_count` is still 1.",
        },
        {
          kind: "scenario_predict",
          label: "Fixture composition",
          scenario: `@pytest.fixture
def client():
    return MockAnthropicClient()

@pytest.fixture
def conversation(client):
    return Conversation(client=client, system="You are a tester.")

def test_send(conversation):
    conversation.send("hello")
    assert conversation.turns == 1`,
          language: "python",
          question:
            "What does pytest do when `test_send` runs? List the fixture build order.",
          answer:
            "1) pytest sees `test_send` needs `conversation`. 2) `conversation` needs `client`, so pytest builds `client` first. 3) pytest builds `conversation`, passing the just-built `client` into it. 4) `test_send` runs with the fully-wired `conversation`. Teardown happens in reverse order.",
          explanation:
            "Pytest resolves fixture dependencies as a DAG. You don't manually compose — you declare what you need by argument name, and pytest builds the graph in the right order.",
        },
        {
          kind: "key_insight",
          label: "conftest.py",
          insight: `Any fixture defined in \`conftest.py\` is auto-discovered by every test in the same directory and below — **no import statement needed**. This is where you put shared fixtures: \`client\`, \`db\`, \`tmp_workspace\`, \`captured_logs\`. One \`conftest.py\` per logical scope: top-level for project-wide fixtures, subdirectory ones for narrower scopes.`,
        },
        {
          kind: "method_ref",
          title: "Built-in pytest fixtures you'll actually use",
          importLine: "# all are auto-available — no import needed",
          methods: [
            {
              signature: "tmp_path",
              description: "A fresh `pathlib.Path` to a temp directory, unique per test. Auto-cleaned.",
              returns: "pathlib.Path",
            },
            {
              signature: "tmp_path_factory",
              description: "Session-scoped factory for temp directories. Use when you need a shared tmp across tests.",
            },
            {
              signature: "monkeypatch",
              description: "Set/delete attributes, env vars, dict items for the duration of a test. Auto-reverted.",
            },
            {
              signature: "capsys / capfd",
              description: "Capture stdout/stderr. `capsys.readouterr()` returns `.out` and `.err`. `capfd` captures at the file-descriptor level (subprocesses).",
            },
            {
              signature: "caplog",
              description: "Capture log records: `caplog.records`, `caplog.text`, `caplog.set_level('DEBUG')`.",
            },
            {
              signature: "request",
              description: "Introspect the current test/fixture context. `request.node.name`, `request.param` (for parametrized fixtures).",
            },
            {
              signature: "pytestconfig",
              description: "Access the parsed config and CLI args.",
            },
            {
              signature: "recwarn",
              description: "Recorder for warnings during the test. Inspect `recwarn.list` after.",
            },
          ],
        },
        {
          kind: "code_predict",
          label: "tmp_path and capsys in action",
          code: `def write_greeting(path, name):
    path.write_text(f"hello, {name}\\n")
    print(f"wrote {path}")

def test_write_greeting(tmp_path, capsys):
    p = tmp_path / "g.txt"
    write_greeting(p, "anthropic")
    assert p.read_text() == "hello, anthropic\\n"
    captured = capsys.readouterr()
    assert captured.out == f"wrote {p}\\n"
`,
          output: `1 passed in 0.01s`,
          explanation:
            "`tmp_path` is a per-test temp directory (cleaned up automatically). `capsys.readouterr()` returns a tuple-like object with `.out` and `.err`, draining what was captured since the last call.",
        },
        {
          kind: "flashcard",
          front: "What are the five fixture scopes, from narrowest to widest?",
          back: "`function` (default — rebuilt per test) → `class` → `module` → `package` → `session` (built once per `pytest` invocation). Pick the narrowest scope that still gives acceptable speed.",
        },
        {
          kind: "flashcard",
          front: "Why use `yield` instead of `return` in a fixture?",
          back: "`yield` lets code after the yield run as teardown — even if the test raises. Use it for any fixture that owns a resource (file, connection, subprocess). `return` has no teardown phase.",
        },
        {
          kind: "flashcard",
          front: "Where do you put shared fixtures so multiple test files can use them without imports?",
          back: "In a `conftest.py` file. Fixtures there are auto-available to every test in the same directory and below — no `import` line needed. Pytest discovers them by walking up the path.",
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 4. Parametrize
    // ─────────────────────────────────────────────────────────────────────
    {
      title: "Parametrize — table-driven tests",
      blocks: [
        {
          kind: "prose",
          markdown: `\`@pytest.mark.parametrize\` runs the same test function once per row of input. Each row becomes its own test in the report, with its own pass/fail. This is how you replace dozens of nearly-identical \`test_foo_case_1\`, \`test_foo_case_2\` functions with one parametrized test.

You can parametrize fixtures too (\`@pytest.fixture(params=[...])\`), and you can stack \`parametrize\` decorators to get the cartesian product. Use \`ids=\` (or pass a list of \`pytest.param(..., id='...')\`) to make the test report human-readable.`,
        },
        {
          kind: "code_predict",
          label: "Basic parametrize",
          code: `import pytest

def is_valid_model(name: str) -> bool:
    return name.startswith("claude-")

@pytest.mark.parametrize("name, expected", [
    ("claude-opus-4-5", True),
    ("claude-haiku-3-5", True),
    ("gpt-4", False),
    ("", False),
])
def test_is_valid_model(name, expected):
    assert is_valid_model(name) == expected
# Run with: pytest -v
`,
          output: `test_x.py::test_is_valid_model[claude-opus-4-5-True] PASSED
test_x.py::test_is_valid_model[claude-haiku-3-5-True] PASSED
test_x.py::test_is_valid_model[gpt-4-False] PASSED
test_x.py::test_is_valid_model[-False] PASSED
4 passed in 0.01s`,
          explanation:
            "Each row becomes its own test with a generated id `[name-expected]`. Failures point to the exact row that failed — no need to count which assert blew up.",
        },
        {
          kind: "code_predict",
          label: "Custom ids and pytest.param",
          code: `import pytest

@pytest.mark.parametrize("input, expected", [
    pytest.param("  hi  ", "hi", id="strip-whitespace"),
    pytest.param("HELLO", "hello", id="lowercase"),
    pytest.param("", "", id="empty"),
    pytest.param("a" * 1000, "a" * 1000, id="long-string", marks=pytest.mark.slow),
])
def test_normalize(input, expected):
    assert input.strip().lower() == expected
# Run only fast tests: pytest -m 'not slow' -v
`,
          output: `test_x.py::test_normalize[strip-whitespace] PASSED
test_x.py::test_normalize[lowercase] PASSED
test_x.py::test_normalize[empty] PASSED
3 passed, 1 deselected in 0.01s`,
          explanation:
            "`pytest.param(value, value, id='...', marks=...)` lets you attach a human id and per-row marks. The `slow` row is deselected by `-m 'not slow'`, leaving 3 to run.",
        },
        {
          kind: "code_predict",
          label: "Stacked parametrize = cartesian product",
          code: `import pytest

@pytest.mark.parametrize("model", ["claude-opus-4-5", "claude-haiku-3-5"])
@pytest.mark.parametrize("temperature", [0.0, 0.7, 1.0])
def test_request_config(model, temperature):
    cfg = {"model": model, "temperature": temperature}
    assert cfg["model"].startswith("claude-")
    assert 0.0 <= cfg["temperature"] <= 1.0
# How many tests run?
`,
          output: `6 passed in 0.01s`,
          explanation:
            "Two decorators produce 2 × 3 = 6 test instances. Useful for sanity-checking matrices (model × temperature, format × encoding). Watch out — stacking three decorators grows fast.",
        },
        {
          kind: "scenario_predict",
          label: "Indirect parametrization through a fixture",
          scenario: `@pytest.fixture
def client(request):
    return MockClient(model=request.param)

@pytest.mark.parametrize("client", ["claude-opus-4-5", "claude-haiku-3-5"], indirect=True)
def test_send(client):
    resp = client.send("hi")
    assert resp.model == client.model`,
          language: "python",
          question:
            "What does `indirect=True` change vs the default?",
          answer:
            "By default, `parametrize` injects the parameter value directly into the test argument. `indirect=True` instead routes each value through the **fixture** of the same name — pytest builds the `client` fixture twice (once per param), and each test gets the *result* of the fixture, not the raw string.",
          explanation:
            "Use `indirect=True` when you want to parametrize *how* a fixture is built, not just what value the test sees. Common pattern: parametrize a 'sample input file' fixture by filename, where the fixture loads and validates the file.",
        },
        {
          kind: "flashcard",
          front: "How do you parametrize a test with custom human-readable ids?",
          back: "Use `pytest.param(arg1, arg2, id='my-case-name')` in the parametrize list, or pass an `ids=[...]` list to the decorator. Test reports then show `test_foo[my-case-name]` instead of `test_foo[arg1-arg2]`.",
        },
        {
          kind: "flashcard",
          front: "What does `indirect=True` do on `@pytest.mark.parametrize`?",
          back: "It routes parameter values through a fixture of the same name (via `request.param`) instead of binding them directly to the test argument. Lets you parametrize fixture construction, not just test inputs.",
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 5. monkeypatch
    // ─────────────────────────────────────────────────────────────────────
    {
      title: "monkeypatch — patching env vars and attributes",
      blocks: [
        {
          kind: "prose",
          markdown: `\`monkeypatch\` is a built-in pytest fixture that **sets attributes / env vars / dict items, then undoes the change at the end of the test**. The auto-revert is the key feature: you don't accidentally leak state from one test to the next.

Reach for \`monkeypatch\` when you need to:
- Set an env var: \`monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")\`.
- Replace a module-level function: \`monkeypatch.setattr("mymodule.fetch", fake_fetch)\`.
- Replace an attribute on a specific object: \`monkeypatch.setattr(client, "messages", fake_messages)\`.
- Delete an env var to test "what if it's missing": \`monkeypatch.delenv("HOME", raising=False)\`.

For replacing methods on classes you don't control, \`monkeypatch.setattr\` is fine but \`unittest.mock.patch\` (next section) often reads cleaner — it gives you a \`MagicMock\` with full call-tracking out of the box.`,
        },
        {
          kind: "method_ref",
          title: "monkeypatch — methods",
          importLine: "# auto-injected fixture: def test_x(monkeypatch): ...",
          methods: [
            {
              signature: "setenv(name, value, prepend=None)",
              description: "Set env var. If `prepend` is set, prepends to existing value with `prepend` as separator.",
            },
            {
              signature: "delenv(name, raising=True)",
              description: "Delete env var. `raising=False` to no-op if it doesn't exist.",
            },
            {
              signature: "setattr(target, name, value, raising=True)",
              description: "Set attribute. `target` can be an object or a `'module.path'` string. `raising=False` to allow setting attrs that don't exist yet.",
            },
            {
              signature: "delattr(target, name, raising=True)",
              description: "Delete attribute.",
            },
            {
              signature: "setitem(mapping, name, value)",
              description: "Set a key in a dict.",
            },
            {
              signature: "delitem(mapping, name, raising=True)",
              description: "Delete a key from a dict.",
            },
            {
              signature: "syspath_prepend(path)",
              description: "Add a directory to the front of `sys.path` for the test.",
            },
            {
              signature: "chdir(path)",
              description: "Change current working directory for the test.",
            },
          ],
        },
        {
          kind: "code_predict",
          label: "Patching an env var",
          code: `import os

def load_api_key() -> str:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")
    return key

def test_loads_key(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key-123")
    assert load_api_key() == "test-key-123"

def test_raises_when_missing(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    import pytest
    with pytest.raises(RuntimeError, match="not set"):
        load_api_key()
`,
          output: `2 passed in 0.01s`,
          explanation:
            "Each test sets/deletes the env var in isolation. After the test, monkeypatch restores `os.environ` to its prior state — the next test starts with the real environment.",
        },
        {
          kind: "code_predict",
          label: "Patching a module-level function",
          code: `# my_module.py
import time
def now() -> float:
    return time.time()

def is_expired(timestamp: float, ttl: float = 60.0) -> bool:
    return now() - timestamp > ttl

# test_my_module.py
def test_is_expired_when_old(monkeypatch):
    monkeypatch.setattr("my_module.now", lambda: 1000.0)
    assert is_expired(timestamp=900.0, ttl=60.0) is True  # 1000 - 900 = 100 > 60

def test_is_expired_when_fresh(monkeypatch):
    monkeypatch.setattr("my_module.now", lambda: 1000.0)
    assert is_expired(timestamp=950.0, ttl=60.0) is False  # 1000 - 950 = 50 < 60
`,
          output: `2 passed in 0.01s`,
          explanation:
            "Replacing `my_module.now` (not `time.time`) is the right level — `is_expired` calls `now()` by name from its own module. Patching `time.time` directly would also work but is too broad.",
        },
        {
          kind: "key_insight",
          label: "Where to patch",
          insight: `Patch where the function is **looked up**, not where it's defined. If \`my_module.py\` does \`import time\` and calls \`time.time()\`, patch \`my_module.time\`. If it does \`from time import time\` and calls \`time()\`, patch \`my_module.time\`. The Python rule: names are resolved in the module that uses them, so that's the module you patch.`,
        },
        {
          kind: "code_comparison",
          label: "monkeypatch vs os.environ direct mutation",
          left: {
            title: "Direct mutation — leaks state",
            code: `def test_bad():
    os.environ["FOO"] = "bar"
    assert load_foo() == "bar"
    # forgot to clean up
    # next test inherits FOO=bar`,
            annotation:
              "Tests become order-dependent. Flaky in CI, infuriating to debug.",
          },
          right: {
            title: "monkeypatch — auto-revert",
            code: `def test_good(monkeypatch):
    monkeypatch.setenv("FOO", "bar")
    assert load_foo() == "bar"
    # automatic cleanup at end of test`,
            annotation:
              "Same one-liner, no cleanup, no leakage.",
          },
          takeaway:
            "Never mutate `os.environ`, `sys.path`, or shared dicts in tests without the auto-revert. monkeypatch is one line longer and prevents an entire class of bug.",
        },
        {
          kind: "scenario_predict",
          label: "Patching the wrong import",
          scenario: `# my_module.py
from time import time

def stamp() -> float:
    return time()

# test_my_module.py
def test_stamp(monkeypatch):
    monkeypatch.setattr("time.time", lambda: 12345.0)
    assert stamp() == 12345.0  # ?`,
          language: "python",
          question:
            "Does this test pass? Why or why not, and what's the fix?",
          answer:
            "No — it fails. `from time import time` binds the name `time` into `my_module`'s namespace. The call `time()` inside `stamp()` resolves to `my_module.time`, not `time.time`. The fix: `monkeypatch.setattr('my_module.time', lambda: 12345.0)`.",
          explanation:
            "This is the #1 mocking gotcha. Patch at the **point of use**, not the point of definition. The name `time` lives in the importing module after a `from ... import` statement.",
        },
        {
          kind: "flashcard",
          front: "When should you reach for `monkeypatch` instead of `unittest.mock.patch`?",
          back: "Use `monkeypatch` for env vars, simple attribute swaps, `sys.path`, and dict items — anywhere you want a one-line set-and-auto-revert. Use `mock.patch` when you need a `MagicMock` with call-tracking (`assert_called_once_with(...)`, `side_effect`, etc.).",
        },
        {
          kind: "flashcard",
          front: "Why does `monkeypatch.setattr('time.time', ...)` often fail to affect code that calls `time()`?",
          back: "Because `from time import time` binds `time` as a local name in the importing module. The function's lookup happens against that local binding, not `time.time`. Patch `my_module.time` (the importing module) instead.",
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 6. unittest.mock
    // ─────────────────────────────────────────────────────────────────────
    {
      title: "unittest.mock — Mock, MagicMock, patch",
      blocks: [
        {
          kind: "prose",
          markdown: `\`unittest.mock\` is stdlib (no pip install) and gives you three things you'll use constantly:

1. **\`Mock\` / \`MagicMock\`** — auto-spec objects that record every call. Attribute access auto-creates more mocks. Set \`return_value\` for what they return. Set \`side_effect\` to make them raise or to substitute a function.
2. **\`patch\`** — a context manager / decorator that temporarily replaces a name with a Mock (or anything you pass). Like \`monkeypatch.setattr\` but with the mock's call-tracking built in.
3. **Assertion helpers** — \`mock.assert_called_once_with(...)\`, \`mock.call_args\`, \`mock.call_args_list\`. Verify *how* your code used the mock, not just what it got back.

\`MagicMock\` is \`Mock\` plus implementations of all the dunder methods (\`__len__\`, \`__iter__\`, \`__getitem__\`, etc.). Most of the time you want \`MagicMock\` — use plain \`Mock\` when you want attribute access to magic methods to fail.`,
        },
        {
          kind: "method_ref",
          title: "unittest.mock — the toolkit",
          importLine:
            "from unittest.mock import Mock, MagicMock, patch, call, ANY, sentinel",
          methods: [
            {
              signature: "Mock(spec=Class, return_value=..., side_effect=...)",
              description: "Auto-mock. `spec=` restricts attribute access to those on the real class. `return_value` = what it returns when called. `side_effect` = exception class, callable, or iterable of values.",
            },
            {
              signature: "MagicMock(...)",
              description: "Mock + all dunder methods (`__len__`, `__iter__`, etc.). Usually what you want.",
            },
            {
              signature: "patch('module.target', new=...)",
              description: "Replace `module.target` for the duration of the with-block or test. Without `new`, gives you a `MagicMock`.",
            },
            {
              signature: "patch.object(obj, 'attr')",
              description: "Patch one attribute on a specific object — useful when you have a reference.",
            },
            {
              signature: "patch.dict(some_dict, {'k': 'v'}, clear=False)",
              description: "Update a dict for the test. `clear=True` empties it first.",
            },
            {
              signature: ".return_value",
              description: "What the mock returns when called. Mocks auto-create nested mocks: `mock.x.y.z` works.",
            },
            {
              signature: ".side_effect",
              description: "Set to an exception class to raise; a list to return one value per call; a callable to delegate.",
            },
            {
              signature: ".assert_called_once_with(*args, **kwargs)",
              description: "Strict: must have been called EXACTLY once with these args. Failure raises `AssertionError`.",
            },
            {
              signature: ".assert_called_with(*args, **kwargs)",
              description: "Lenient: most-recent call matches. Doesn't check call count.",
            },
            {
              signature: ".call_args / .call_args_list",
              description: "Inspect what the mock was called with. `call_args` = last call, `call_args_list` = every call.",
            },
            {
              signature: ".reset_mock()",
              description: "Clear call history (but not `return_value` or `side_effect`).",
            },
            {
              signature: "ANY",
              description: "Wildcard for `assert_called_with(ANY, model='claude-opus-4-5')` — accepts anything for that positional arg.",
            },
          ],
        },
        {
          kind: "code_predict",
          label: "Basic Mock with return_value",
          code: `from unittest.mock import Mock

m = Mock()
m.return_value = 42
print(m())          # call the mock
print(m(1, 2, x=3)) # any args ignored
m.foo.bar.baz       # auto-creates nested mocks
print(m.call_count)
print(m.call_args)`,
          output: `42
42
2
call(1, 2, x=3)`,
          explanation:
            "A Mock returns `return_value` for every call regardless of args. Attribute chains auto-create child mocks. `call_count` and `call_args` track what happened.",
          runnable: true,
        },
        {
          kind: "code_predict",
          label: "side_effect: exception, list, callable",
          code: `from unittest.mock import Mock

# 1. side_effect as exception class -> raise on call
m1 = Mock(side_effect=ValueError("boom"))
try:
    m1()
except ValueError as e:
    print(f"caught: {e}")

# 2. side_effect as list -> return one per call
m2 = Mock(side_effect=[1, 2, 3])
print(m2(), m2(), m2())

# 3. side_effect as callable -> delegate
m3 = Mock(side_effect=lambda x: x * 2)
print(m3(5), m3(10))`,
          output: `caught: boom
1 2 3
10 20`,
          explanation:
            "`side_effect` is the most powerful Mock feature. Exception class → raises. Iterable → returns next value per call (raises `StopIteration` when exhausted). Callable → delegates the call, return value used as the mock's return.",
          runnable: true,
        },
        {
          kind: "code_predict",
          label: "patch as decorator",
          code: `# my_module.py
def fetch_user_count():
    import requests
    r = requests.get("https://api.example.com/users")
    return r.json()["count"]

# test_my_module.py
from unittest.mock import patch, MagicMock

@patch("my_module.requests")
def test_fetch_user_count(mock_requests):
    mock_requests.get.return_value.json.return_value = {"count": 42}
    assert fetch_user_count() == 42
    mock_requests.get.assert_called_once_with("https://api.example.com/users")
`,
          output: `1 passed in 0.01s`,
          explanation:
            "The `@patch(target)` decorator injects a `MagicMock` as the last positional argument. `mock_requests.get.return_value` is the fake response; `.json.return_value` is the fake JSON. The assert at the end verifies the URL was correct.",
        },
        {
          kind: "code_comparison",
          label: "Mock vs Mock(spec=Class)",
          left: {
            title: "Mock() — no spec",
            code: `m = Mock()
m.messages.create(...)   # works
m.typo_attribute         # also works (returns Mock)
m.nonexistent_method()   # silently passes`,
            annotation:
              "Plain Mock accepts ANY attribute access. Typos in your test won't fail.",
          },
          right: {
            title: "Mock(spec=Anthropic) — typed",
            code: `m = Mock(spec=anthropic.Anthropic)
m.messages.create(...)   # works
m.typo_attribute         # AttributeError
m.nonexistent_method()   # AttributeError`,
            annotation:
              "spec restricts attribute access to the real class's surface. Catches typos and drift.",
          },
          takeaway:
            "Use `spec=` (or `spec_set=` for stricter behavior) whenever you're mocking a real class. It catches the 'I renamed the method on the real class but my test still passes' bug.",
        },
        {
          kind: "code_predict",
          label: "Mocking the Anthropic client",
          code: `from unittest.mock import MagicMock
from types import SimpleNamespace

def get_summary(client, text):
    resp = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=200,
        messages=[{"role": "user", "content": text}],
    )
    return resp.content[0].text

def test_get_summary():
    client = MagicMock()
    # Build a fake response object that looks like the real SDK shape
    fake_block = SimpleNamespace(text="A short summary.")
    fake_resp = SimpleNamespace(content=[fake_block])
    client.messages.create.return_value = fake_resp

    result = get_summary(client, "Long article body...")

    assert result == "A short summary."
    client.messages.create.assert_called_once()
    call_kwargs = client.messages.create.call_args.kwargs
    assert call_kwargs["model"] == "claude-opus-4-5"
    assert call_kwargs["max_tokens"] == 200
`,
          output: `1 passed in 0.01s`,
          explanation:
            "The pattern: inject a `MagicMock` client, build a fake response with the shape your code reads, set `client.messages.create.return_value`, then check both the result and the call args. No network, no API key, milliseconds.",
        },
        {
          kind: "scenario_predict",
          label: "Wrong patch target",
          scenario: `# app.py
from utils import fetch
def get_data():
    return fetch("/api")

# test_app.py
from unittest.mock import patch

@patch("utils.fetch")
def test_get_data(mock_fetch):
    mock_fetch.return_value = {"x": 1}
    from app import get_data
    assert get_data() == {"x": 1}   # ?`,
          language: "python",
          question:
            "Does this pass? If not, what's the correct patch target?",
          answer:
            "It fails. `app.py` did `from utils import fetch`, which binds `fetch` as a local name in `app`. The call `fetch('/api')` inside `get_data` looks up `app.fetch`, not `utils.fetch`. Correct: `@patch('app.fetch')`.",
          explanation:
            "Same rule as `monkeypatch`: patch where the name is *looked up*, not where it's defined. With `from X import Y`, the name lives in the importing module.",
        },
        {
          kind: "multiple_choice",
          title: "Picking the right Mock helper",
          prompt:
            "You want to verify your code called `client.messages.create` exactly once with `model='claude-opus-4-5'` and any other args. Which assertion is correct?",
          code: `client = MagicMock()
my_function(client)
# now assert ...`,
          choices: [
            {
              text: "client.messages.create.assert_called_once_with(model='claude-opus-4-5')",
              correct: false,
              rationale:
                "Too strict. `assert_called_once_with` requires the EXACT full call. If your function also passes `max_tokens`, this fails.",
            },
            {
              text: "client.messages.create.assert_called_once(); assert client.messages.create.call_args.kwargs['model'] == 'claude-opus-4-5'",
              correct: true,
              rationale:
                "Correct. `assert_called_once()` checks count; then inspect `call_args.kwargs` for just the field you care about.",
            },
            {
              text: "client.messages.create.assert_any_call(model='claude-opus-4-5')",
              correct: false,
              rationale:
                "`assert_any_call` doesn't enforce call count and still requires args to match exactly.",
            },
            {
              text: "assert client.messages.create.called and client.messages.create.kwargs['model'] == 'claude-opus-4-5'",
              correct: false,
              rationale:
                "`.kwargs` isn't a direct attribute of a Mock — you need `.call_args.kwargs`. Also `.called` doesn't enforce 'exactly once'.",
            },
          ],
          explanation:
            "When you need partial-match assertions, split into two steps: assert the count, then inspect `call_args.kwargs` (or `.args`) for the specific fields. Avoid `assert_called_once_with` unless you genuinely want to lock down every argument.",
        },
        {
          kind: "flashcard",
          front: "Difference between Mock and MagicMock?",
          back: "`MagicMock` is `Mock` plus working implementations of every dunder (`__len__`, `__iter__`, `__getitem__`, `__enter__`, etc.). Usually `MagicMock` — only fall back to `Mock` if you explicitly want dunder access to fail.",
        },
        {
          kind: "flashcard",
          front: "Three things `side_effect` can be?",
          back: "(1) An **exception class or instance** → raised when the mock is called. (2) An **iterable** → returns the next value per call (raises `StopIteration` when empty). (3) A **callable** → delegates the call, and the callable's return value becomes the mock's return.",
        },
        {
          kind: "flashcard",
          front: "Why use `spec=SomeClass` when constructing a Mock?",
          back: "Restricts attribute access to those that exist on the real class. Catches typos in test code and detects when the real class drops a method you're still mocking. Use `spec_set=` to also block creating new attributes on the mock.",
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 7. Time and HTTP — freezegun, vcr/respx
    // ─────────────────────────────────────────────────────────────────────
    {
      title: "Time and HTTP — freezegun, vcr, respx",
      blocks: [
        {
          kind: "prose",
          markdown: `Two classes of test flakiness deserve dedicated tools:

**Time.** Any test that calls \`datetime.now()\` or \`time.time()\` will eventually break: leap seconds, daylight savings, a slow CI runner. \`freezegun\` (\`pip install freezegun\`) freezes wall-clock time to a fixed point you choose, so date math is deterministic.

**HTTP.** Tests that talk to real APIs are flaky, slow, and rate-limited. Two patterns:
- **\`vcr.py\`** records real HTTP traffic the first time the test runs, saves it as a YAML "cassette", then replays from the cassette on subsequent runs. Perfect for tests against APIs whose contracts you don't control.
- **\`respx\`** (for httpx) and **\`responses\`** (for requests) are stub-based: you declare URL patterns and the response to return, no recording involved. Better for the Anthropic SDK because you know exactly what the request shape should be.

For testing the Anthropic SDK specifically, the most common pattern is just mocking \`client.messages.create\` with \`MagicMock\` (previous section). You only reach for vcr/respx when you want end-to-end coverage of the HTTP layer itself — rare in app code, common in SDK wrappers.`,
        },
        {
          kind: "code_predict",
          label: "freezegun basics",
          code: `from freezegun import freeze_time
from datetime import datetime, timedelta

def is_business_hours(now: datetime | None = None) -> bool:
    now = now or datetime.now()
    return 9 <= now.hour < 17

@freeze_time("2026-03-15 10:00:00")
def test_business_hours_morning():
    assert is_business_hours() is True

@freeze_time("2026-03-15 22:00:00")
def test_business_hours_night():
    assert is_business_hours() is False

def test_advancing_time():
    with freeze_time("2026-01-01 12:00:00") as frozen:
        start = datetime.now()
        frozen.tick(delta=timedelta(hours=2))
        assert datetime.now() - start == timedelta(hours=2)
`,
          output: `3 passed in 0.01s`,
          explanation:
            "`@freeze_time(iso)` patches `datetime.now()`, `datetime.utcnow()`, `time.time()`, and several others to return the frozen value. Use as decorator, context manager, or `.tick(delta=...)` to advance time within a test.",
        },
        {
          kind: "method_ref",
          title: "freezegun — common patterns",
          importLine: "from freezegun import freeze_time",
          methods: [
            {
              signature: "@freeze_time('2026-01-01 12:00:00')",
              description: "Decorator: freezes time inside the test/class.",
            },
            {
              signature: "with freeze_time(...) as frozen:",
              description: "Context manager. The yielded object has `.tick`, `.move_to`, `.tz_offset`.",
            },
            {
              signature: "frozen.tick(delta=timedelta(seconds=5))",
              description: "Advance frozen time by `delta`. Default `1 second`.",
            },
            {
              signature: "frozen.move_to('2026-02-01')",
              description: "Jump to a specific time.",
            },
            {
              signature: "@freeze_time(..., tick=True)",
              description: "Start frozen, but let time advance naturally from there.",
            },
            {
              signature: "@freeze_time(..., tz_offset=-5)",
              description: "Pretend you're in a different timezone (offset from UTC in hours).",
            },
          ],
        },
        {
          kind: "code_predict",
          label: "respx for httpx stubs",
          code: `import httpx, respx
from respx import MockRouter

def fetch_status() -> str:
    r = httpx.get("https://api.example.com/health")
    return r.json()["status"]

@respx.mock
def test_fetch_status():
    respx.get("https://api.example.com/health").mock(
        return_value=httpx.Response(200, json={"status": "ok"})
    )
    assert fetch_status() == "ok"

@respx.mock
def test_handles_503():
    respx.get("https://api.example.com/health").mock(
        return_value=httpx.Response(503, json={"status": "down"})
    )
    assert fetch_status() == "down"
`,
          output: `2 passed in 0.01s`,
          explanation:
            "`@respx.mock` activates URL-pattern stubbing for httpx. Routes you define match real httpx calls and return your canned response. No network. Calls that don't match a route raise by default.",
        },
        {
          kind: "code_comparison",
          label: "VCR cassette vs respx stub",
          left: {
            title: "vcrpy — record once, replay forever",
            code: `import vcr

@vcr.use_cassette("fixtures/anthropic_msg.yaml")
def test_real_call():
    client = anthropic.Anthropic()
    r = client.messages.create(...)
    assert r.content[0].text == "..."`,
            annotation:
              "First run hits the real API and saves the YAML. Future runs replay. Useful when you DON'T control the API contract.",
          },
          right: {
            title: "respx / responses — declarative stubs",
            code: `@respx.mock
def test_stubbed():
    respx.post("https://api.anthropic.com/v1/messages").mock(
        return_value=httpx.Response(200, json=FAKE_MSG)
    )
    client = anthropic.Anthropic()
    r = client.messages.create(...)
    assert r.content[0].text == FAKE_MSG["content"][0]["text"]`,
            annotation:
              "No initial recording. You write the stub. Better when you know exactly what the API should return and want to drive edge cases.",
          },
          takeaway:
            "VCR: 'capture reality, replay it.' respx/responses: 'declare what I want.' Both avoid live HTTP; pick by whether you want recording semantics or stub semantics.",
        },
        {
          kind: "scenario_predict",
          label: "freezegun missing a call site",
          scenario: `# logger.py
import time
def log_event(name):
    return {"name": name, "ts": time.monotonic()}

# test_logger.py
@freeze_time("2026-01-01")
def test_log_event():
    e = log_event("hello")
    assert e["ts"] == 0.0  # ?`,
          language: "python",
          question:
            "Does this pass? Why or why not?",
          answer:
            "It fails — `freezegun` does NOT patch `time.monotonic()`. monotonic is intentionally not affected because it represents elapsed time, not wall-clock time. Fix: either change the code to use `time.time()`, or patch `time.monotonic` separately with `monkeypatch`/`patch`.",
          explanation:
            "Always check what your time-freezing library actually patches. freezegun handles `datetime.*now()`, `time.time()`, `time.gmtime()`, but not `time.monotonic` or `time.perf_counter` (by design — these are for elapsed-time measurements).",
        },
        {
          kind: "key_insight",
          label: "Layered isolation",
          insight: `Mock at the **highest layer that gives you the coverage you need**. For most app code: mock the SDK call (\`client.messages.create\`). For SDK wrapper libraries: mock the HTTP layer (respx). For end-to-end smoke tests: don't mock at all, but mark them \`integration\` and run them rarely. The lower you mock, the more fragile your test becomes to internal refactors.`,
        },
        {
          kind: "flashcard",
          front: "What does freezegun patch, and what does it deliberately NOT patch?",
          back: "Patches: `datetime.now()`, `datetime.utcnow()`, `time.time()`, `time.gmtime()`, `time.localtime()`. Does NOT patch: `time.monotonic`, `time.perf_counter` (they measure elapsed time, not wall-clock).",
        },
        {
          kind: "flashcard",
          front: "When would you reach for vcrpy over respx?",
          back: "When the API contract is owned by someone else and you want to capture real responses (and re-record when they change). respx/responses are better when you author the stubs yourself and want to drive specific edge cases (4xx, timeouts, partial responses).",
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 8. Testing LLM-dependent code
    // ─────────────────────────────────────────────────────────────────────
    {
      title: "Testing LLM-dependent code (the meat)",
      blocks: [
        {
          kind: "prose",
          markdown: `Now we connect everything. The shape of a testable LLM app:

1. **Dependency-inject the client.** Every function that calls the model takes \`client: anthropic.Anthropic\` as an argument. No module-level \`anthropic.Anthropic()\`.
2. **Separate orchestration from I/O.** Functions like \`build_prompt\`, \`parse_tool_call\`, \`format_history\` are pure — they take dicts in, return dicts out. Test them with no mocks at all.
3. **Mock at the SDK boundary.** Wherever \`client.messages.create\` is called, your tests inject a \`MagicMock\` client with a pre-canned response.
4. **Fixtures for the canned responses.** Put \`fake_text_response\`, \`fake_tool_use_response\`, \`fake_streaming_response\` in \`conftest.py\` as fixtures. Reuse across tests.
5. **An integration marker for real calls.** \`@pytest.mark.integration\` on tests that hit live APIs. Default CI runs \`pytest -m 'not integration'\`. Run integrations on a schedule or manually before release.`,
        },
        {
          kind: "code_predict",
          label: "Canned-response fixture pattern",
          code: `# conftest.py
import pytest
from types import SimpleNamespace
from unittest.mock import MagicMock

def _block(type, **kwargs):
    return SimpleNamespace(type=type, **kwargs)

@pytest.fixture
def fake_text_response():
    return SimpleNamespace(
        id="msg_test_001",
        role="assistant",
        stop_reason="end_turn",
        content=[_block("text", text="hello back")],
        usage=SimpleNamespace(input_tokens=10, output_tokens=5),
    )

@pytest.fixture
def fake_tool_use_response():
    return SimpleNamespace(
        id="msg_test_002",
        role="assistant",
        stop_reason="tool_use",
        content=[
            _block("text", text="Let me check that."),
            _block("tool_use", id="tu_1", name="get_weather", input={"city": "Paris"}),
        ],
        usage=SimpleNamespace(input_tokens=20, output_tokens=15),
    )

@pytest.fixture
def mock_client(fake_text_response):
    client = MagicMock()
    client.messages.create.return_value = fake_text_response
    return client
`,
          output: `# (fixture definitions — no output, used by tests)`,
          explanation:
            "Build the shape of the SDK response (Pydantic-like attribute access) with `SimpleNamespace`. Tests below then use `mock_client` and assert on the result. Want a different response? Just override `client.messages.create.return_value` in the test.",
        },
        {
          kind: "code_predict",
          label: "Testing the agentic loop with side_effect",
          code: `from types import SimpleNamespace

def run_agent_loop(client, user_msg, tools):
    """Repeatedly call the model until stop_reason != 'tool_use'."""
    messages = [{"role": "user", "content": user_msg}]
    while True:
        resp = client.messages.create(
            model="claude-opus-4-5", max_tokens=500,
            tools=tools, messages=messages,
        )
        if resp.stop_reason != "tool_use":
            return resp
        # add fake tool result for the loop
        messages.append({"role": "assistant", "content": resp.content})
        messages.append({"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": "tu_1", "content": "sunny"}
        ]})

def test_loop_stops_on_end_turn(mock_client, fake_tool_use_response, fake_text_response):
    # First call returns tool_use, second returns end_turn
    mock_client.messages.create.side_effect = [
        fake_tool_use_response,
        fake_text_response,
    ]
    result = run_agent_loop(mock_client, "weather?", tools=[])
    assert result.stop_reason == "end_turn"
    assert mock_client.messages.create.call_count == 2
`,
          output: `1 passed in 0.01s`,
          explanation:
            "`side_effect=[r1, r2]` makes consecutive calls return different responses. Perfect for testing loops, retries, and stateful flows — without driving the actual model or maintaining stateful fakes.",
        },
        {
          kind: "code_predict",
          label: "Pure-function testing — no LLM involved",
          code: `def format_history_for_log(messages: list[dict]) -> str:
    """Pure function — flatten a message list to a single log line."""
    parts = []
    for m in messages:
        role = m["role"][:1].upper()  # 'U' or 'A'
        text = m["content"] if isinstance(m["content"], str) else "[blocks]"
        parts.append(f"{role}:{text}")
    return " | ".join(parts)

def test_format_simple_messages():
    msgs = [
        {"role": "user", "content": "hello"},
        {"role": "assistant", "content": "hi"},
    ]
    assert format_history_for_log(msgs) == "U:hello | A:hi"

def test_format_block_content():
    msgs = [{"role": "assistant", "content": [{"type": "text", "text": "x"}]}]
    assert format_history_for_log(msgs) == "A:[blocks]"
`,
          output: `2 passed in 0.01s`,
          explanation:
            "Pure helpers are the cheapest tests in the codebase: no mocks, no fixtures, no I/O. Refactor as much orchestration logic as you can into pure functions and the testing burden drops by 80%.",
          runnable: true,
        },
        {
          kind: "code_predict",
          label: "Testing streaming output",
          code: `from types import SimpleNamespace
from unittest.mock import MagicMock

def collect_streamed_text(client, prompt) -> str:
    """Calls client.messages.stream(...) and concatenates text deltas."""
    chunks = []
    with client.messages.stream(messages=[{"role": "user", "content": prompt}]) as stream:
        for event in stream:
            if event.type == "content_block_delta" and event.delta.type == "text_delta":
                chunks.append(event.delta.text)
    return "".join(chunks)

def test_collect_streamed_text():
    client = MagicMock()
    # Stage the streaming events (the iterator protocol)
    events = [
        SimpleNamespace(type="content_block_delta",
                        delta=SimpleNamespace(type="text_delta", text="hello ")),
        SimpleNamespace(type="content_block_delta",
                        delta=SimpleNamespace(type="text_delta", text="world")),
        SimpleNamespace(type="message_stop"),
    ]
    # __enter__ returns the stream, which is iterable
    stream_cm = MagicMock()
    stream_cm.__enter__.return_value = iter(events)
    client.messages.stream.return_value = stream_cm

    assert collect_streamed_text(client, "hi") == "hello world"
`,
          output: `1 passed in 0.01s`,
          explanation:
            "Mocking streaming: build a list of event objects, set `__enter__.return_value = iter(events)` so the `with` block yields your iterator. `MagicMock` (not plain `Mock`) is required here because we need `__enter__` to work.",
        },
        {
          kind: "code_comparison",
          label: "Integration marker for real-API tests",
          left: {
            title: "Without markers — all tests run always",
            code: `def test_local_summarize(mock_client):
    ...  # fast, mocked

def test_real_summarize():
    client = anthropic.Anthropic()
    r = summarize(client, "...")
    assert "..." in r.content[0].text   # SLOW, COSTS MONEY`,
            annotation:
              "Every CI push hits the real API. Slow, expensive, flaky on quota or sampling variance.",
          },
          right: {
            title: "With @pytest.mark.integration",
            code: `# pyproject.toml:
# [tool.pytest.ini_options]
# markers = ["integration: hits live APIs"]
# addopts = "-m 'not integration'"

def test_local_summarize(mock_client):
    ...  # runs every push

@pytest.mark.integration
def test_real_summarize():
    client = anthropic.Anthropic()
    r = summarize(client, "...")
    assert "..." in r.content[0].text`,
            annotation:
              "Default CI runs only fast tests. Integrations run on a schedule (nightly) or manually before release: `pytest -m integration`.",
          },
          takeaway:
            "Mark expensive tests. Default to fast. Use `addopts` to deselect by default, then opt in explicitly. Same pattern works for `slow`, `gpu`, `network`, etc.",
        },
        {
          kind: "scenario_predict",
          label: "Why your tests still hit the network",
          scenario: `# api_wrapper.py
client = anthropic.Anthropic()   # module-level!

def summarize(text):
    return client.messages.create(...).content[0].text

# test_api_wrapper.py
from unittest.mock import patch, MagicMock

@patch("api_wrapper.client")
def test_summarize(mock_client):
    mock_client.messages.create.return_value = MagicMock(
        content=[MagicMock(text="ok")]
    )
    assert summarize("hi") == "ok"   # works for this test`,
          language: "python",
          question:
            "Why is this codebase fragile, and what happens if you import `api_wrapper` in a test that DOESN'T patch?",
          answer:
            "Constructing `anthropic.Anthropic()` at module level means it runs on import — which requires the `ANTHROPIC_API_KEY` env var. Any test that imports `api_wrapper` without first setting the key (or patching the constructor) will fail at import time, before any test code runs. The fix is dependency injection: pass `client` as an argument instead of constructing it at module scope.",
          explanation:
            "Module-level singletons are the most common cause of 'my tests pass individually but the suite fails' bugs. Construct expensive objects inside functions or fixtures, not at import time.",
        },
        {
          kind: "mini_challenge",
          title: "Build a `make_fake_response` helper",
          prompt: `Write a fixture-friendly helper \`make_fake_response(text=None, tool_use=None, stop_reason=None)\` that returns an object with the same attribute-access shape as an \`anthropic.types.Message\`. It should support:

- \`make_fake_response(text="hello")\` → response with one text block, \`stop_reason="end_turn"\`.
- \`make_fake_response(tool_use={"name": "get_weather", "input": {"city": "Paris"}})\` → response with one tool_use block, \`stop_reason="tool_use"\`.
- \`make_fake_response(text="hi", tool_use={...})\` → response with both blocks.
- Defaults: \`stop_reason\` inferred from inputs, \`id="msg_test"\`, \`usage\` populated with non-zero token counts.

The helper should make canned responses readable in tests without giant SimpleNamespace literals.`,
          hints: [
            "Use `types.SimpleNamespace` for the response and for each block — it supports `.attr` access from dict-like construction.",
            "Build the `content` list conditionally based on which kwargs were passed.",
            "Infer `stop_reason`: `tool_use` wins if a tool_use block is present, else `end_turn`.",
            "Give `tool_use` a unique `id` (e.g. `'tu_1'`) and `text` blocks no `id` field — match the real shape.",
          ],
          solution: `from types import SimpleNamespace
from typing import Any

def make_fake_response(
    text: str | None = None,
    tool_use: dict[str, Any] | None = None,
    stop_reason: str | None = None,
    id: str = "msg_test",
    input_tokens: int = 10,
    output_tokens: int = 5,
) -> SimpleNamespace:
    blocks = []
    if text is not None:
        blocks.append(SimpleNamespace(type="text", text=text))
    if tool_use is not None:
        blocks.append(SimpleNamespace(
            type="tool_use",
            id=tool_use.get("id", "tu_1"),
            name=tool_use["name"],
            input=tool_use["input"],
        ))
    if not blocks:
        raise ValueError("must provide text= or tool_use=")
    if stop_reason is None:
        stop_reason = "tool_use" if tool_use is not None else "end_turn"
    return SimpleNamespace(
        id=id,
        role="assistant",
        model="claude-opus-4-5",
        stop_reason=stop_reason,
        content=blocks,
        usage=SimpleNamespace(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        ),
    )

# Usage in a fixture:
@pytest.fixture
def mock_client():
    client = MagicMock()
    client.messages.create.return_value = make_fake_response(text="ok")
    return client

# Or per-test:
def test_tool_flow(mock_client):
    mock_client.messages.create.side_effect = [
        make_fake_response(tool_use={"name": "get_weather", "input": {"city": "Paris"}}),
        make_fake_response(text="It's sunny in Paris."),
    ]
    ...`,
          takeaway:
            "A single `make_fake_response` helper eliminates the 'every test has its own giant SimpleNamespace literal' problem. Put it in `conftest.py` so every test file gets it for free, and tests read like English: 'first call returns tool_use, second returns text.'",
        },
        {
          kind: "key_insight",
          label: "The 80/20 rule for testable LLM code",
          insight: `**80% of your tests should never construct an \`Anthropic\` client.** They test pure helpers: \`build_prompt\`, \`parse_tool_call\`, \`format_history\`, \`should_retry\`. The remaining 20% mock \`client.messages.create\` with \`MagicMock\` and a canned \`SimpleNamespace\` response. Integration tests that hit the real API are <5% of the suite, marked \`@pytest.mark.integration\`, and run on a schedule — not on every push.`,
        },
        {
          kind: "flashcard",
          front: "What's the canonical pattern for mocking the Anthropic SDK in a test?",
          back: "Inject a `MagicMock` as the client. Set `client.messages.create.return_value` (or `.side_effect` for multi-call flows) to a `SimpleNamespace` shaped like a real `Message` — with `.content`, `.stop_reason`, `.usage`. No network, sub-millisecond.",
        },
        {
          kind: "flashcard",
          front: "How do you keep integration tests in the suite without slowing every CI run?",
          back: "Tag them `@pytest.mark.integration` and add `addopts = \"-m 'not integration'\"` to `pyproject.toml`. Default pytest runs skip them; run integrations explicitly with `pytest -m integration` on a schedule or before releases.",
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
          markdown: `Mental checklist for any new test file:

- **Design for testability first.** Inject the client. Keep orchestration pure. Push I/O to the edges.
- **Fixtures over setup methods.** Use \`conftest.py\` for project-wide fixtures (client, db, tmp workspace). \`yield\` whenever there's teardown.
- **Parametrize over copy-paste.** One \`@pytest.mark.parametrize\` table beats five near-identical tests.
- **monkeypatch for env vars and simple attribute swaps.** \`unittest.mock\` for call-tracking and rich return shapes.
- **Patch where the name is *used*, not where it's defined.** \`from X import Y\` binds \`Y\` into the importing module.
- **\`MagicMock\` over \`Mock\`** unless you specifically want dunder access to fail. Use \`spec=Class\` to catch typos.
- **freezegun for time, respx/vcr for HTTP.** Reach for them only when monkeypatching is awkward.
- **Mark expensive tests.** \`@pytest.mark.integration\` (or \`slow\`, \`gpu\`) and deselect by default.

When the suite runs in 2 seconds and a test catches the bug before you push, the discipline pays for itself.`,
        },
        {
          kind: "flashcard",
          front: "Five-second recall: pytest fixture scopes (narrowest → widest).",
          back: "`function` (default) → `class` → `module` → `package` → `session`.",
        },
        {
          kind: "flashcard",
          front: "Five-second recall: three things `side_effect` can be.",
          back: "Exception (raised), iterable (one value per call), callable (delegated). Plus: it short-circuits `return_value` whenever set.",
        },
        {
          kind: "flashcard",
          front: "Five-second recall: where do you patch when your code does `from utils import fetch`?",
          back: "At the importing module's name: `patch('app.fetch')`, not `patch('utils.fetch')`. The name `fetch` was bound into `app`'s namespace by the import.",
        },
        {
          kind: "flashcard",
          front: "Five-second recall: how do you stop CI from hitting the real Anthropic API on every push?",
          back: "Mark integration tests `@pytest.mark.integration`, set `addopts = \"-m 'not integration'\"` in `pyproject.toml`. Mock `client.messages.create` with `MagicMock` for the 95% of tests that should run locally.",
        },
        {
          kind: "flashcard",
          front: "Five-second recall: what does `conftest.py` give you that ordinary fixtures don't?",
          back: "Auto-discovery. Every fixture in `conftest.py` is available to every test in the same directory and below — no `import` statement needed. Project-wide one at the top, narrower ones in subdirectories.",
        },
      ],
    },
  ],
};
