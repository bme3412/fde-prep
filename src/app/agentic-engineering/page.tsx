import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agentic Engineering — Applied AI Prep",
  description:
    "A 10-stage progression from reliable services to production multi-agent systems.",
};

// ─── Curriculum data ───────────────────────────────────────────────────────

type Stage = {
  number: number;
  title: string;
  /** Optional framing paragraph shown under the title */
  note?: string;
  topics: string[];
  deliverable: string;
  /** Optional emphasis flag (e.g. "longest stage") */
  emphasis?: string;
};

const STAGES: Stage[] = [
  {
    number: 1,
    title: "Reliable Python Services",
    note: "Learn this properly rather than merely checking the box. Everything above the service layer inherits its reliability from here.",
    topics: [
      "asyncio, task groups and cancellation",
      "FastAPI lifespan and dependency injection",
      "Streaming responses",
      "HTTP clients and connection pooling",
      "Rate limits, timeouts and exponential backoff",
      "Idempotency",
      "Queues and background workers",
      "Typed exceptions and failure classification",
    ],
    deliverable:
      "Asynchronous API aggregator that calls three unreliable external APIs while respecting concurrency, timeout and retry limits.",
  },
  {
    number: 2,
    title: "Typed LLM Applications",
    topics: [
      "Provider abstractions",
      "Structured outputs",
      "Pydantic schemas",
      "Context construction",
      "Token accounting",
      "Streaming",
      "Model routing",
      "Prompt and model versioning",
      "Deterministic fallbacks",
    ],
    deliverable:
      "Extraction and classification service with multiple model tiers and a measurable fallback strategy.",
  },
  {
    number: 3,
    title: "Tools, Permissions and MCP",
    note: "MCP tools are designed to be discoverable and callable by models, which makes tool metadata, permission boundaries, and confirmation for sensitive operations part of the core engineering problem.",
    topics: [
      "Function tools",
      "Tool descriptions",
      "Argument and result schemas",
      "Read versus write tools",
      "Authentication and authorization",
      "Tool timeouts and retries",
      "Tool-result sanitization",
      "Dynamic tool loading",
      "MCP clients and servers",
    ],
    deliverable:
      "Agent connected to five typed tools, including one write action requiring explicit approval.",
  },
  {
    number: 4,
    title: "Single-Agent Control Loops",
    note: "Use a lightweight framework first — OpenAI Agents SDK or PydanticAI — before LangGraph. The OpenAI SDK already supports tools, handoffs, guardrails, sessions and tracing, while PydanticAI emphasizes typed dependencies, testing and durable-execution integrations.",
    topics: [
      "ReAct-style loops",
      "Router versus autonomous loop",
      "Planning only when required",
      "Maximum turns",
      "Token and dollar budgets",
      "Stop conditions",
      "Tool-choice constraints",
      "Retry versus replan",
      "Graceful degradation",
      "Deterministic post-processing",
    ],
    deliverable:
      "Research agent that produces an evidence-backed answer or explicitly declines when evidence is inadequate.",
  },
  {
    number: 5,
    title: "Evaluation and Tracing",
    emphasis: "This should be the longest stage.",
    note: "Do not reduce quality to one judge score. Evaluate three things independently: the final result, the intermediate trajectory, and operational behavior.",
    topics: [
      "Golden test sets",
      "Tool-selection accuracy",
      "Argument accuracy",
      "Claim-level faithfulness",
      "Trajectory evaluation",
      "Multi-turn testing",
      "LLM judges with calibrated rubrics",
      "Human review samples",
      "Regression gates",
      "Latency and cost distributions",
      "Failure-injection testing",
    ],
    deliverable:
      "CI evaluation suite that blocks deployment after a material regression.",
  },
  {
    number: 6,
    title: "Persistent and Durable Workflows",
    note: "Combine memory, state management and human intervention here. LangGraph persistence supports checkpointing, human intervention, memory and fault recovery. For processes that must survive application crashes or run for extended periods, study Temporal's workflow/activity model and event-history replay.",
    topics: [
      "Conversation state versus business state",
      "Postgres-backed checkpoints",
      "Event logs",
      "State-machine design",
      "Short-term summarization",
      "Long-term retrieval",
      "Memory expiration and deletion",
      "Pause/resume",
      "Crash recovery",
      "Idempotent side effects",
      "Human approval and editing",
    ],
    deliverable:
      "An agent that pauses for approval, survives a server restart and resumes without repeating completed side effects.",
  },
  {
    number: 7,
    title: "Security and Governance",
    topics: [
      "Prompt injection and indirect injection",
      "Capability-based permissions",
      "Tool allowlists",
      "Least privilege",
      "Data-flow boundaries",
      "PII detection and redaction",
      "Tenant isolation",
      "Sandboxed code execution",
      "Audit logs",
      "Data retention",
      "Kill switches",
      "Cost-abuse prevention",
    ],
    deliverable:
      "Attack suite covering malicious documents, tool-result injection, unauthorized writes, secret extraction and resource exhaustion.",
  },
  {
    number: 8,
    title: "Multi-Agent and Distributed Orchestration",
    note: "Only now introduce multiple agents. Compare the multi-agent design against a single-agent baseline. Keep it only when it improves measured performance enough to justify the added latency, cost and operational complexity.",
    topics: [
      "Manager-as-tools",
      "Handoffs",
      "Supervisor graphs",
      "Subgraphs",
      "Parallel specialists",
      "Context isolation",
      "Conflict resolution",
      "Shared versus private state",
      "Agent identity and permission boundaries",
    ],
    deliverable:
      "Two implementations of the same workflow — single-agent and multi-agent — with an evaluation report explaining which wins.",
  },
  {
    number: 9,
    title: "Production Operations",
    note: "Add vLLM, SGLang and GPU Kubernetes only as an optional inference specialization.",
    topics: [
      "Docker",
      "Postgres and Redis",
      "Worker queues",
      "CI/CD",
      "Environment management",
      "Health checks",
      "Autoscaling",
      "Canary releases",
      "Rollback",
      "Alerting",
      "SLOs",
      "Cost controls",
      "Incident runbooks",
    ],
    deliverable:
      "A deployed service with health checks, canary + rollback, alerting on SLO breaches, and an incident runbook.",
  },
  {
    number: 10,
    title: "Public Proof of Work",
    note: "A portfolio should demonstrate judgment, not simply that an agent produced output. Every project ships with the full evidence set below.",
    topics: [
      "Architecture diagram",
      "Explicit state model",
      "Tool schemas",
      "Failure taxonomy",
      "Evaluation results",
      "Cost and latency measurements",
      "Security model",
      "Recorded failure-and-recovery demo",
      "Tradeoff discussion",
      "Reproducible repository",
    ],
    deliverable:
      "Three capstone projects (below), each carrying the complete proof-of-work evidence set.",
  },
];

type Project = {
  n: number;
  title: string;
  pitch: string;
  requirements: string[];
  why: string;
};

const PROJECTS: Project[] = [
  {
    n: 1,
    title: "Reliable Financial Research Agent",
    pitch:
      "Use your existing domain advantage. A rigorously engineered evolution of Clarity — not another generic chatbot.",
    requirements: [
      "Filing and transcript tools",
      "Structured evidence objects",
      "Claim citations",
      "Token and cost budget",
      "Retry/replan logic",
      "Unanswerable detection",
      "50–100 case evaluation set",
      "Full tracing",
    ],
    why: "Proves reliability engineering on top of a domain you already understand.",
  },
  {
    n: 2,
    title: "Durable Investment Approval Workflow",
    pitch:
      "Shows the production engineering that is missing from most agent portfolios.",
    requirements: [
      "Analyst agent proposes an action",
      "Risk checks run deterministically",
      "Human approval requested above thresholds",
      "Workflow pauses and resumes",
      "Every state transition is persisted",
      "Duplicate orders are impossible",
      "Injected crashes demonstrate recovery",
    ],
    why: "Durability, human-in-the-loop, and idempotent side effects — the part employers struggle to hire for.",
  },
  {
    n: 3,
    title: "Falsification-Oriented Research System",
    pitch:
      "Connects directly to your investment background and provides a credible reason for using multiple agents.",
    requirements: [
      "Bull-case researcher",
      "Bear-case / falsification researcher",
      "Evidence verifier",
      "Deterministic synthesis layer",
      "Disagreement retained rather than averaged away",
      "Multi-agent system tested against a single-agent baseline",
    ],
    why: "Justifies multi-agent complexity with a measured baseline comparison — the honest way to use more than one agent.",
  },
];

const PROGRESSION =
  "Reliable services → typed tools → controlled agent loop → evaluation → durable state → security → multi-agent systems → production";

// ─── Page ──────────────────────────────────────────────────────────────────

export default function AgenticEngineeringPage() {
  return (
    <div className="space-y-8">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold">Agentic Engineering</h1>
        <p className="text-sm text-zinc-600 mt-2 max-w-2xl">
          A 10-stage progression that builds the skill employers actually
          struggle to hire for: <em>proving reliability</em>. The original
          &ldquo;learn the agent stack&rdquo; sequence risks broad familiarity
          with agent terminology while staying weak on the engineering that
          makes agents trustworthy. This reorganizes the same coverage around a
          progression that front-loads reliability and defers multi-agent
          complexity until it can be justified with measurements.
        </p>
        <div className="mt-4 rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            The progression
          </div>
          <p className="text-sm text-zinc-800 mt-1 font-medium">{PROGRESSION}</p>
        </div>
      </div>

      {/* ── Stage jump nav ──────────────────────────────────────────────── */}
      <nav className="bg-white border border-zinc-200 rounded-xl p-4 space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Jump to stage
        </h2>
        <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1 text-xs">
          {STAGES.map((s) => (
            <li key={s.number}>
              <a
                href={`#stage-${s.number}`}
                className="text-zinc-600 hover:text-zinc-900 transition-colors"
              >
                <span className="font-semibold">Stage {s.number}.</span>{" "}
                {s.title}
              </a>
            </li>
          ))}
          <li>
            <a
              href="#projects"
              className="text-zinc-600 hover:text-zinc-900 transition-colors"
            >
              <span className="font-semibold">→</span> Capstone projects
            </a>
          </li>
        </ol>
      </nav>

      {/* ── Stages ──────────────────────────────────────────────────────── */}
      {STAGES.map((stage) => (
        <section
          key={stage.number}
          id={`stage-${stage.number}`}
          className="scroll-mt-4 space-y-3"
        >
          <div className="border-b border-zinc-200 pb-2">
            <h2 className="text-base font-semibold uppercase tracking-wide text-zinc-500 flex items-baseline gap-3">
              <span className="text-zinc-400">Stage {stage.number}</span>
              <span className="text-zinc-800 normal-case tracking-normal">
                {stage.title}
              </span>
              {stage.emphasis && (
                <span className="text-xs font-normal text-amber-700 bg-amber-100 px-2 py-0.5 rounded normal-case tracking-normal ml-auto">
                  {stage.emphasis}
                </span>
              )}
            </h2>
            {stage.note && (
              <p className="text-sm text-zinc-600 mt-2">{stage.note}</p>
            )}
          </div>

          {/* Topic chips */}
          <ul className="flex flex-wrap gap-2">
            {stage.topics.map((t) => (
              <li
                key={t}
                className="text-xs bg-white border border-zinc-200 rounded-md px-2.5 py-1 text-zinc-700"
              >
                {t}
              </li>
            ))}
          </ul>

          {/* Deliverable */}
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Deliverable
            </div>
            <p className="text-sm text-emerald-900 mt-1">{stage.deliverable}</p>
          </div>
        </section>
      ))}

      {/* ── Capstone projects ───────────────────────────────────────────── */}
      <section id="projects" className="scroll-mt-4 space-y-4">
        <div className="border-b border-zinc-200 pb-2">
          <h2 className="text-base font-semibold uppercase tracking-wide text-zinc-500">
            Capstone projects
          </h2>
          <p className="text-sm text-zinc-600 mt-1">
            What I would have you build. Each project ships with the full Stage
            10 evidence set: architecture diagram, state model, tool schemas,
            failure taxonomy, eval results, cost/latency, security model,
            recorded failure-and-recovery demo, tradeoff discussion, and a
            reproducible repo.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {PROJECTS.map((p) => (
            <div
              key={p.n}
              className="bg-white border border-zinc-200 rounded-xl p-5 flex flex-col gap-3"
            >
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Project {p.n}
                </div>
                <h3 className="text-sm font-semibold text-zinc-900 mt-0.5">
                  {p.title}
                </h3>
              </div>
              <p className="text-xs text-zinc-600">{p.pitch}</p>
              <ul className="space-y-1 text-xs text-zinc-700 list-disc list-inside marker:text-zinc-300">
                {p.requirements.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <p className="text-xs text-zinc-500 pt-2 border-t border-zinc-100 mt-auto">
                <span className="font-semibold text-zinc-600">Why it lands:</span>{" "}
                {p.why}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Bottom line ─────────────────────────────────────────────────── */}
      <section className="bg-white border border-zinc-200 rounded-xl p-5 space-y-2 text-sm">
        <h2 className="text-base font-semibold text-zinc-800">Bottom line</h2>
        <p className="text-zinc-700">
          Keep the overall subject coverage, but sequence it so reliability is
          proven before complexity is added. Multi-agent orchestration is the{" "}
          <em>eighth</em> stage, not the first — introduced only after you can
          measure a single-agent baseline and show the extra agents earn their
          latency, cost and operational complexity.
        </p>
        <p className="text-zinc-500 text-xs pt-2 border-t border-zinc-100">
          This sequence trains the applied AI engineer employers are short on:
          not someone fluent in agent terminology, but someone who can prove a
          system is reliable.
        </p>
      </section>
    </div>
  );
}
