import { getState } from "@/lib/store";
import type { Status } from "@/lib/types";
import Link from "next/link";

// ─── Sequence definition ─────────────────────────────────────────────────
// Each entry's `id` must match a topic id in seed.ts.
// (Topic ids are derived from the title via lowercase + non-alnum→dash.)

type PathItem = {
  id: string;
  title: string;
  blurb: string;
};

type Phase = {
  number: number;
  title: string;
  rationale: string;
  items: PathItem[];
};

const PHASES: Phase[] = [
  {
    number: 1,
    title: "Tooling fluency",
    rationale: "You can't iterate on code you can't navigate. Do these first.",
    items: [
      {
        id: "bash-scripting-cli-fluency",
        title: "bash",
        blurb: "File, process, and pipe muscle memory. The substrate every later phase runs on.",
      },
      {
        id: "git-patterns-for-collaborative-work",
        title: "git",
        blurb: "Commit, rebase, bisect, worktrees. Recovering from mistakes safely.",
      },
    ],
  },
  {
    number: 2,
    title: "Python idioms",
    rationale: "Every later guide is written in Python. These are the building blocks.",
    items: [
      {
        id: "collections-module-deep-dive",
        title: "collections module deep dive",
        blurb: "defaultdict, Counter, deque. The group/count/dedupe triple.",
      },
      {
        id: "dataclasses-typing-patterns",
        title: "dataclasses & typing patterns",
        blurb: "Typed records, Literal, TypedDict — the data classes you'll pass through every layer.",
      },
      {
        id: "itertools-functools-patterns",
        title: "itertools & functools patterns",
        blurb: "chain, groupby, lru_cache, partial. Fluency unlocks one-line solutions.",
      },
      {
        id: "context-managers-generators",
        title: "context managers & generators",
        blurb: "with, yield, resource discipline. The substrate of streaming and tool loops.",
      },
      {
        id: "error-handling-retries-rate-limits",
        title: "error handling, retries & rate limits",
        blurb: "Exception design + tenacity-style retries. Powers every API call later.",
      },
      {
        id: "pydantic-v2-fundamentals",
        title: "Pydantic v2 fundamentals",
        blurb: "Validation at the boundary. The shape of every structured-output guide.",
      },
      {
        id: "argparse-cli-patterns",
        title: "argparse & CLI patterns",
        blurb: "Turning scripts into shareable tools. Where most pilots end up.",
      },
      {
        id: "testing-patterns-pytest-fixtures-mocking",
        title: "testing: pytest, fixtures, mocking",
        blurb: "Fixtures, parametrize, monkeypatch. Required before you ship anything.",
      },
    ],
  },
  {
    number: 3,
    title: "Concurrency",
    rationale:
      "Streaming, batch, and agent guides all assume async fluency. Decide on the model before you write any.",
    items: [
      {
        id: "when-to-use-which-concurrency-model",
        title: "when to use which concurrency model",
        blurb: "The decision tree: thread vs process vs async. Read this first.",
      },
      {
        id: "asyncio-semaphore-gather-patterns",
        title: "asyncio semaphore & gather patterns",
        blurb: "Fan-out with rate limits. The bread-and-butter shape for LLM batch jobs.",
      },
      {
        id: "threadpoolexecutor-processpoolexecutor",
        title: "ThreadPoolExecutor & ProcessPoolExecutor",
        blurb: "When async is the wrong answer (CPU-bound, blocking I/O libs).",
      },
    ],
  },
  {
    number: 4,
    title: "Data layer",
    rationale:
      "Most FDE work involves the customer's warehouse before it involves their LLM. Parallel track — can interleave with Phase 3.",
    items: [
      {
        id: "sql-fluency-for-analytics",
        title: "SQL fluency for analytics",
        blurb: "Joins, windows, CTEs, JSON, percentiles. Postgres-flavored.",
      },
      {
        id: "pandas-polars-for-data-prep",
        title: "pandas / Polars for data prep",
        blurb: "In-process transforms. When SQL stops and Python starts.",
      },
      {
        id: "duckdb-lightweight-etl",
        title: "DuckDB & lightweight ETL",
        blurb: "SQL on files. The missing layer between pandas and a warehouse.",
      },
    ],
  },
  {
    number: 5,
    title: "Anthropic API surface",
    rationale:
      "Order matters: Messages API is the foundation every other Anthropic guide extends.",
    items: [
      {
        id: "messages-api-structured-output",
        title: "Messages API & structured output",
        blurb: "Request/response shape, system prompt, stop reasons. The root of all SDK work.",
      },
      {
        id: "token-counting-context-budgeting",
        title: "token counting & context budgeting",
        blurb: "What fits, what costs. The constraint every prompt design starts from.",
      },
      {
        id: "streaming-prompt-caching",
        title: "streaming & prompt caching",
        blurb: "Latency and cost wins. Must-have for any chat-like UX.",
      },
      {
        id: "structured-output-patterns",
        title: "structured output patterns",
        blurb: "Tool-use trick, prefill, schema-in-prompt. Three techniques compared.",
      },
      {
        id: "vision-pdf-inputs",
        title: "vision & PDF inputs",
        blurb: "Multimodal inputs. Doc-processing pipelines start here.",
      },
      {
        id: "files-api-citations",
        title: "Files API & Citations",
        blurb: "Long-doc workflows. Citation handling matters more than people expect.",
      },
      {
        id: "batch-api",
        title: "Batch API",
        blurb: "When latency doesn't matter and cost does. Often the highest-leverage swap.",
      },
    ],
  },
  {
    number: 6,
    title: "Retrieval + tool use",
    rationale:
      "Agents that can't retrieve or use tools well are just expensive chatbots. These are the agent prerequisites.",
    items: [
      {
        id: "bm25-hybrid-retrieval",
        title: "BM25 & hybrid retrieval",
        blurb: "Keyword + semantic, the production-grade search baseline.",
      },
      {
        id: "tool-use-loop-implementation",
        title: "tool use loop implementation",
        blurb: "The messages → tool_use → tool_result cycle. Every agent is a variant of this.",
      },
      {
        id: "chain-of-thought-extended-thinking",
        title: "chain-of-thought & extended thinking",
        blurb: "When reasoning helps, when it hurts, decision framework.",
      },
      {
        id: "extended-thinking-patterns",
        title: "extended thinking patterns",
        blurb: "SDK-level details: budget_tokens, interleaved thinking, redaction.",
      },
    ],
  },
  {
    number: 7,
    title: "Agent architecture (synthesis)",
    rationale:
      "Everything above shows up here. Don't skip ahead — agents are where pattern-mismatches get expensive.",
    items: [
      {
        id: "workflow-vs-agent-decision-framework",
        title: "workflow vs agent decision framework",
        blurb: "The escalation ladder + cost math. The most-quoted FDE conversation framework.",
      },
      {
        id: "multi-agent-orchestration",
        title: "multi-agent orchestration",
        blurb: "Lead-researcher pattern, communication protocols, failure modes.",
      },
      {
        id: "computer-use-agentic-tool-loops",
        title: "computer use & agentic tool loops",
        blurb: "The hardest agent shape in production. UI surfaces are unforgiving.",
      },
      {
        id: "mcp-servers",
        title: "MCP servers",
        blurb: "The open protocol for tool ecosystems. Where the agent stack is heading.",
      },
    ],
  },
];

// ─── Page ────────────────────────────────────────────────────────────────

function statusColor(status: Status): string {
  switch (status) {
    case "not_started":
      return "bg-zinc-100 text-zinc-500";
    case "in_progress":
      return "bg-amber-100 text-amber-800";
    case "done":
      return "bg-green-100 text-green-800";
  }
}

function statusLabel(status: Status): string {
  switch (status) {
    case "not_started":
      return "todo";
    case "in_progress":
      return "in progress";
    case "done":
      return "done";
  }
}

export default async function LearningPathPage() {
  const state = await getState();
  const topicsById = new Map(state.topics.map((t) => [t.id, t]));

  // Phase progress: count done / total
  const phaseProgress = PHASES.map((p) => {
    const present = p.items
      .map((i) => topicsById.get(i.id))
      .filter((t): t is NonNullable<typeof t> => t !== undefined);
    const done = present.filter((t) => t.status === "done").length;
    const total = p.items.length;
    return { phaseNumber: p.number, done, total };
  });

  const grandTotal = PHASES.reduce((acc, p) => acc + p.items.length, 0);
  const grandDone = phaseProgress.reduce((acc, p) => acc + p.done, 0);

  return (
    <div className="space-y-8">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold">Learning Path</h1>
        <p className="text-sm text-zinc-600 mt-2 max-w-2xl">
          A 7-phase sequence through the prep material. Each phase builds on the
          prerequisites of the next. The fastest interview-readiness path is
          phases 1, 2, 5, 7 in order — then circle back to whichever showed up
          weakest in mocks.
        </p>
        <div className="mt-3 text-xs text-zinc-500">
          Overall progress: {grandDone}/{grandTotal} topics done
        </div>
      </div>

      {/* ── Phase jump nav ──────────────────────────────────────────────── */}
      <nav className="bg-white border border-zinc-200 rounded-xl p-4 space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Jump to phase
        </h2>
        <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-1 text-xs">
          {PHASES.map((p) => {
            const prog = phaseProgress.find((x) => x.phaseNumber === p.number)!;
            return (
              <li key={p.number}>
                <a
                  href={`#phase-${p.number}`}
                  className="text-zinc-600 hover:text-zinc-900 transition-colors"
                >
                  <span className="font-semibold">Phase {p.number}.</span>{" "}
                  {p.title}{" "}
                  <span className="text-zinc-400">
                    ({prog.done}/{prog.total})
                  </span>
                </a>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* ── Phases ──────────────────────────────────────────────────────── */}
      {PHASES.map((phase) => {
        const prog = phaseProgress.find((x) => x.phaseNumber === phase.number)!;
        return (
          <section
            key={phase.number}
            id={`phase-${phase.number}`}
            className="scroll-mt-4 space-y-3"
          >
            <div className="border-b border-zinc-200 pb-2">
              <h2 className="text-base font-semibold uppercase tracking-wide text-zinc-500 flex items-baseline gap-3">
                <span className="text-zinc-400">Phase {phase.number}</span>
                <span className="text-zinc-800 normal-case tracking-normal">
                  {phase.title}
                </span>
                <span className="text-xs font-normal text-zinc-400 normal-case tracking-normal ml-auto">
                  {prog.done}/{prog.total} done
                </span>
              </h2>
              <p className="text-sm text-zinc-600 mt-1">{phase.rationale}</p>
            </div>

            <ol className="bg-white border border-zinc-200 rounded-lg divide-y divide-zinc-100">
              {phase.items.map((item, idx) => {
                const topic = topicsById.get(item.id);
                const globalIdx =
                  PHASES.slice(0, phase.number - 1).reduce(
                    (acc, p) => acc + p.items.length,
                    0,
                  ) +
                  idx +
                  1;
                return (
                  <li
                    key={item.id}
                    className="flex items-start gap-4 px-4 py-3"
                  >
                    <div className="text-xs text-zinc-400 font-mono pt-0.5 w-8 shrink-0 text-right">
                      {String(globalIdx).padStart(2, "0")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">
                        {topic ? (
                          <Link
                            href={`/topics/${item.id}`}
                            className="hover:underline"
                          >
                            {item.title}
                          </Link>
                        ) : (
                          <span className="text-zinc-400">{item.title}</span>
                        )}
                        {!topic && (
                          <span className="ml-2 text-xs text-zinc-400">
                            (no seed entry)
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {item.blurb}
                      </div>
                    </div>
                    {topic && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded shrink-0 ${statusColor(topic.status)}`}
                      >
                        {statusLabel(topic.status)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}

      {/* ── Pacing footer ───────────────────────────────────────────────── */}
      <section className="bg-white border border-zinc-200 rounded-xl p-5 space-y-3 text-sm">
        <h2 className="text-base font-semibold text-zinc-800">
          Pacing suggestions
        </h2>
        <ul className="space-y-2 text-zinc-700">
          <li>
            <span className="font-semibold">Sprint (1 week):</span> Phase 1 day
            1 · Phase 2 days 2–3 · Phase 3 day 4 · Phase 5 days 5–6 · Phase 7
            day 7. Skip Phase 4 and 6 for now; backfill on demand.
          </li>
          <li>
            <span className="font-semibold">Steady (2–3 weeks):</span> 2–3
            guides per day in order. Re-do the cold-recall blocks in
            collections / workflow-vs-agent at the end of each week.
          </li>
          <li>
            <span className="font-semibold">Project mode:</span> Pick one
            realistic build (e.g., &ldquo;deck-autofill from a warehouse&rdquo;)
            and pull guides on-demand as the build needs them. Use this
            sequence as the lookup index, not the path.
          </li>
        </ul>
        <p className="text-xs text-zinc-500 pt-2 border-t border-zinc-100">
          Phases 1–3 are non-negotiable prerequisites. Phase 4 is parallel —
          jump there after Phase 2 if data is your weak spot. Phase 5 strictly
          before Phase 6. Phase 7 reads as synthesis; doing it last makes every
          prior concept click.
        </p>
      </section>
    </div>
  );
}
