import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agentic Engineering — Applied AI Prep",
  description:
    "A 10-stage primer from reliable services to production multi-agent systems.",
};

// ─── Curriculum data ───────────────────────────────────────────────────────

type Concept = { term: string; gloss: string };

type Stage = {
  number: number;
  title: string;
  /** One-line summary of the stage */
  tagline: string;
  /** Plain-language primer: what this is, why it matters, why it's here */
  primer: string;
  /** Optional practical/framework guidance shown as a highlighted note */
  note?: string;
  /** Optional emphasis pill (e.g. "longest stage") */
  emphasis?: string;
  concepts: Concept[];
  deliverable: string;
};

const STAGES: Stage[] = [
  {
    number: 1,
    title: "Reliable Python Services",
    tagline: "Boring reliability is the foundation everything else stands on.",
    primer:
      "An agent is just a service that calls a model. If that service drops requests, leaks connections, or can't tell a temporary timeout apart from a real bug, no amount of clever prompting will save it. Before touching an LLM, get comfortable making a plain async service that stays up under load and fails predictably. This stage is unglamorous on purpose — it's the part employers find hardest to hire for.",
    concepts: [
      {
        term: "asyncio, task groups and cancellation",
        gloss:
          "Run many I/O operations at once on a single thread. Task groups launch a batch together and cancel the rest if one fails, so you don't leak half-finished work.",
      },
      {
        term: "FastAPI lifespan and dependency injection",
        gloss:
          "Open shared resources (database pools, HTTP clients) once when the app starts, and hand them to request handlers instead of creating a new one every call.",
      },
      {
        term: "Streaming responses",
        gloss:
          "Send bytes to the client as they're produced so the user sees output immediately, rather than waiting for the whole response to finish.",
      },
      {
        term: "HTTP clients and connection pooling",
        gloss:
          "Reuse one client with a pool of kept-alive connections. Opening a fresh connection per call is slow and eventually exhausts the machine's sockets.",
      },
      {
        term: "Rate limits, timeouts and exponential backoff",
        gloss:
          "Cap how fast you call, give every call a deadline, and wait progressively longer between retries (with a little randomness) so you don't pile onto a struggling service.",
      },
      {
        term: "Idempotency",
        gloss:
          "Design an operation so running it twice has the same effect as running it once — essential the moment retries can duplicate a request.",
      },
      {
        term: "Queues and background workers",
        gloss:
          "Hand slow jobs to a queue and process them in separate worker processes, so your API can answer quickly instead of blocking on long work.",
      },
      {
        term: "Typed exceptions and failure classification",
        gloss:
          "Model failures as distinct exception types and sort them into retryable / fatal / needs-a-human, so callers can react correctly instead of guessing.",
      },
    ],
    deliverable:
      "An async API aggregator that calls three unreliable external APIs while respecting concurrency, timeout and retry limits.",
  },
  {
    number: 2,
    title: "Typed LLM Applications",
    tagline: "Treat the model's inputs and outputs as typed data, not vibes.",
    primer:
      "Now put a model behind that reliable service — but wrap it in types. The aim is an LLM feature you can validate, price, version, and fall back from. That discipline is the difference between a demo that works on your laptop and something you'd put in front of a paying customer.",
    concepts: [
      {
        term: "Provider abstractions",
        gloss:
          "A thin interface over model vendors so you can swap Anthropic, OpenAI, or a local model without rewriting your app.",
      },
      {
        term: "Structured outputs",
        gloss:
          "Force the model to return data that matches a schema (via tool-use or JSON mode) instead of free text you have to parse and pray over.",
      },
      {
        term: "Pydantic schemas",
        gloss:
          "Declare the exact shape of your inputs and outputs; validation rejects malformed data right at the boundary before it spreads.",
      },
      {
        term: "Context construction",
        gloss:
          "Deliberately assemble what goes into the prompt — instructions, examples, retrieved facts — while staying inside a token budget.",
      },
      {
        term: "Token accounting",
        gloss:
          "Count tokens before you send. It controls cost, keeps you under the context limit, and helps you predict latency.",
      },
      {
        term: "Streaming",
        gloss:
          "Stream the model's tokens as they generate for a responsive feel and to catch failures earlier in the response.",
      },
      {
        term: "Model routing",
        gloss:
          "Send each request to the cheapest model that can handle it, and escalate only the genuinely hard ones to a bigger model.",
      },
      {
        term: "Prompt and model versioning",
        gloss:
          "Treat prompts and model choices as versioned artifacts you can roll back — not strings buried in an f-string somewhere.",
      },
      {
        term: "Deterministic fallbacks",
        gloss:
          "When the model errors or is low-confidence, fall back to a rule, a cached answer, or a smaller model — never just throw an error at the user.",
      },
    ],
    deliverable:
      "An extraction and classification service with multiple model tiers and a measurable fallback strategy.",
  },
  {
    number: 3,
    title: "Tools, Permissions and MCP",
    tagline: "Tools are how a model affects the world — and where it can do harm.",
    primer:
      "A tool is a function the model can call. The engineering problem isn't calling the function — it's describing it so the model uses it correctly, and drawing permission boundaries so it can't cause damage. Read-only lookups and state-changing writes are different risk classes and must be treated differently.",
    note:
      "MCP (Model Context Protocol) makes tools discoverable and callable by models across apps. That's powerful, but it means tool metadata, permission boundaries, and confirmation for sensitive actions become core parts of the engineering — not afterthoughts.",
    concepts: [
      {
        term: "Function tools",
        gloss:
          "Ordinary functions exposed to the model with a name, a description, and a schema for their arguments.",
      },
      {
        term: "Tool descriptions",
        gloss:
          "The plain-language spec the model reads to decide when and how to call a tool. Vague descriptions cause wrong calls more than anything else.",
      },
      {
        term: "Argument and result schemas",
        gloss:
          "Typed contracts for what goes into a tool and what comes back, validated in both directions.",
      },
      {
        term: "Read versus write tools",
        gloss:
          "Separate tools that only observe from tools that change state. Writes need stronger permissions, confirmation, and audit.",
      },
      {
        term: "Authentication and authorization",
        gloss:
          "Prove who is calling (authentication) and check they're allowed to do this specific action (authorization) before the tool runs.",
      },
      {
        term: "Tool timeouts and retries",
        gloss:
          "Bound how long a tool may run and how often it retries, so one slow or broken tool can't hang the whole agent.",
      },
      {
        term: "Tool-result sanitization",
        gloss:
          "Clean and escape a tool's output before feeding it back to the model. Untrusted content here is a classic injection route.",
      },
      {
        term: "Dynamic tool loading",
        gloss:
          "Expose only the tools relevant to the current task or user, instead of dumping every tool into the prompt at once.",
      },
      {
        term: "MCP clients and servers",
        gloss:
          "A standard where tools and data live in reusable servers that any MCP-aware client (like Claude) can discover and call.",
      },
    ],
    deliverable:
      "An agent connected to five typed tools, including one write action that requires explicit approval.",
  },
  {
    number: 4,
    title: "Single-Agent Control Loops",
    tagline: "An agent is a loop; the craft is controlling it.",
    primer:
      "A single agent is a loop: the model looks at the situation, picks an action, sees the result, and repeats. The whole skill is controlling that loop — bounding how far it runs, knowing when to stop, and degrading gracefully — so it stays cheap, predictable, and honest about what it can't do.",
    note:
      "Start with a lightweight framework — the OpenAI Agents SDK or PydanticAI — before reaching for LangGraph. The OpenAI SDK already gives you tools, handoffs, guardrails, sessions, and tracing; PydanticAI leans into typed dependencies, testing, and durable-execution integrations.",
    concepts: [
      {
        term: "ReAct-style loops",
        gloss:
          "The reason → act → observe cycle: the model thinks, calls a tool, reads the result, and loops until it's done.",
      },
      {
        term: "Router versus autonomous loop",
        gloss:
          "A router picks one path and stops; an autonomous loop keeps deciding its next step. Prefer the router whenever the steps are predictable.",
      },
      {
        term: "Planning only when required",
        gloss:
          "Don't force an explicit plan step for simple tasks. Add planning only when the task genuinely needs multi-step foresight.",
      },
      {
        term: "Maximum turns",
        gloss:
          "A hard cap on loop iterations so a confused agent can't spin forever burning tokens.",
      },
      {
        term: "Token and dollar budgets",
        gloss:
          "Per-task ceilings on tokens and cost that abort the run the moment they're crossed.",
      },
      {
        term: "Stop conditions",
        gloss:
          "Explicit rules for when the agent is finished — answer produced, goal met, budget hit — rather than 'until it feels done.'",
      },
      {
        term: "Tool-choice constraints",
        gloss:
          "Force, forbid, or restrict which tool the model may call at a given step to keep it on the rails.",
      },
      {
        term: "Retry versus replan",
        gloss:
          "On failure, decide whether to retry the same action or step back and choose a different approach entirely.",
      },
      {
        term: "Graceful degradation",
        gloss:
          "When the agent can't fully succeed, return a partial or qualified answer, or hand off — instead of failing hard.",
      },
      {
        term: "Deterministic post-processing",
        gloss:
          "Run the model's output through plain code (validation, formatting, de-duplication) before returning it.",
      },
    ],
    deliverable:
      "A research agent that produces an evidence-backed answer, or explicitly declines when the evidence is inadequate.",
  },
  {
    number: 5,
    title: "Evaluation and Tracing",
    tagline: "Reliability is a claim you have to prove — and one score won't do it.",
    emphasis: "Spend the most time here",
    primer:
      "This is the longest stage on purpose. Everything so far is a claim; evaluation is how you prove it. A single judge score hides more than it reveals, so measure three things separately: the final result, the path the agent took to get there, and how the system behaves operationally (latency, cost, failures). Then wire it into CI so a regression physically can't ship.",
    note:
      "Do not reduce quality to one judge score. Evaluate the final result, the intermediate trajectory, and operational behavior as three distinct things.",
    concepts: [
      {
        term: "Golden test sets",
        gloss:
          "A frozen, human-labeled set of real cases you measure every change against. Never tune your prompts against it.",
      },
      {
        term: "Tool-selection accuracy",
        gloss:
          "Did the agent pick the right tool for the step it was on?",
      },
      {
        term: "Argument accuracy",
        gloss:
          "Given the right tool, did it pass the correct arguments to it?",
      },
      {
        term: "Claim-level faithfulness",
        gloss:
          "Is each individual claim in the answer actually supported by the evidence it cites?",
      },
      {
        term: "Trajectory evaluation",
        gloss:
          "Grade the whole path the agent took, not just whether the final answer happened to be right.",
      },
      {
        term: "Multi-turn testing",
        gloss:
          "Evaluate across a conversation, where context and state build up over several turns.",
      },
      {
        term: "LLM judges with calibrated rubrics",
        gloss:
          "Use a model to grade outputs against a concrete rubric — but validate the judge against human labels first.",
      },
      {
        term: "Human review samples",
        gloss:
          "Regularly hand-check a sample of outputs to anchor and audit the automated scores.",
      },
      {
        term: "Regression gates",
        gloss:
          "Automatically block a deploy when a key metric drops beyond an allowed tolerance.",
      },
      {
        term: "Latency and cost distributions",
        gloss:
          "Track p50 / p95 / p99 latency and cost per task — the tail, not just the average.",
      },
      {
        term: "Failure-injection testing",
        gloss:
          "Deliberately break tools and inputs to confirm the system degrades safely instead of exploding.",
      },
    ],
    deliverable:
      "A CI evaluation suite that blocks deployment after a material regression.",
  },
  {
    number: 6,
    title: "Persistent and Durable Workflows",
    tagline: "Real workflows outlive a single request — and take irreversible actions.",
    primer:
      "Production workflows pause for human approval, survive crashes, and do things you can't undo, like moving money. Durability means the system can stop, restart, and pick up exactly where it left off — without losing progress or repeating a side effect it already completed. This is the hardest and most valuable part of production agents, and where most portfolios fall short.",
    note:
      "LangGraph persistence covers checkpointing, human intervention, memory, and fault recovery. For processes that must survive full application crashes or run for hours/days, study Temporal's workflow/activity model and its event-history replay.",
    concepts: [
      {
        term: "Conversation state versus business state",
        gloss:
          "Chat history is disposable context; business state (orders, approvals) is the source of truth that must persist correctly.",
      },
      {
        term: "Postgres-backed checkpoints",
        gloss:
          "Save workflow state to a database at each step so it can resume after a crash.",
      },
      {
        term: "Event logs",
        gloss:
          "An append-only record of what happened, enabling replay, audit, and recovery.",
      },
      {
        term: "State-machine design",
        gloss:
          "Model the workflow as explicit states and transitions instead of a tangle of ad-hoc boolean flags.",
      },
      {
        term: "Short-term summarization",
        gloss:
          "Compress recent context so a long-running conversation stays within the model's window.",
      },
      {
        term: "Long-term retrieval",
        gloss:
          "Keep durable memory in an external store and fetch it on demand, rather than holding everything in context.",
      },
      {
        term: "Memory expiration and deletion",
        gloss:
          "Age out and delete stored memory for cost, relevance, and privacy/compliance reasons.",
      },
      {
        term: "Pause/resume",
        gloss:
          "Suspend a workflow (say, awaiting human input) and continue exactly where it left off.",
      },
      {
        term: "Crash recovery",
        gloss:
          "Restart from the last checkpoint after a failure without losing or corrupting progress.",
      },
      {
        term: "Idempotent side effects",
        gloss:
          "Make external actions safe to re-run, so recovery doesn't double-charge or double-send.",
      },
      {
        term: "Human approval and editing",
        gloss:
          "Insert points where a person must approve or modify before the workflow is allowed to proceed.",
      },
    ],
    deliverable:
      "An agent that pauses for approval, survives a server restart, and resumes without repeating completed side effects.",
  },
  {
    number: 7,
    title: "Security and Governance",
    tagline: "An agent that reads untrusted data and can act is an attack surface.",
    primer:
      "Assume prompt injection will happen — the question is how much damage it can do. Design so the blast radius is small: least privilege, tool allowlists, isolation between tenants, redaction of sensitive data, audit logs, and a kill switch you can hit. Here, security isn't a checklist bolted on at the end; it's the core of the design.",
    concepts: [
      {
        term: "Prompt injection and indirect injection",
        gloss:
          "Malicious instructions in the user's input (direct) or hidden in fetched content and tool results (indirect) that try to hijack the agent.",
      },
      {
        term: "Capability-based permissions",
        gloss:
          "Grant narrow, unforgeable tokens for specific actions rather than broad, ambient authority.",
      },
      {
        term: "Tool allowlists",
        gloss:
          "Explicitly list which tools an agent may use, and deny everything else by default.",
      },
      {
        term: "Least privilege",
        gloss:
          "Give each component only the access it needs to do its job — nothing more.",
      },
      {
        term: "Data-flow boundaries",
        gloss:
          "Track and control where data can move, so sensitive data can't leak across a trust boundary.",
      },
      {
        term: "PII detection and redaction",
        gloss:
          "Find and mask personal data before it's logged, sent to a model, or stored.",
      },
      {
        term: "Tenant isolation",
        gloss:
          "Keep each customer's data and actions strictly separated inside a shared system.",
      },
      {
        term: "Sandboxed code execution",
        gloss:
          "Run model-generated code in a locked-down environment with no network, filesystem, or secret access.",
      },
      {
        term: "Audit logs",
        gloss:
          "A tamper-evident record of who did what, and when — for forensics and compliance.",
      },
      {
        term: "Data retention",
        gloss:
          "Explicit policies for how long data is kept and when it's purged.",
      },
      {
        term: "Kill switches",
        gloss:
          "A way to instantly disable a tool, an agent, or the whole system when something goes wrong.",
      },
      {
        term: "Cost-abuse prevention",
        gloss:
          "Guard against runaway loops and malicious usage that quietly rack up a huge bill.",
      },
    ],
    deliverable:
      "An attack suite covering malicious documents, tool-result injection, unauthorized writes, secret extraction, and resource exhaustion.",
  },
  {
    number: 8,
    title: "Multi-Agent and Distributed Orchestration",
    tagline: "Add more agents only when you can measure that they help.",
    primer:
      "Only now introduce multiple agents — and only if the numbers justify it. More agents mean more latency, more cost, and more ways to fail, so every multi-agent design has to beat a single-agent baseline on your evals. Complexity you can't attach a measured benefit to is complexity you shouldn't ship.",
    note:
      "Always build the single-agent baseline first and compare against it. Keep the multi-agent version only when it improves measured performance enough to justify the added latency, cost, and operational complexity.",
    concepts: [
      {
        term: "Manager-as-tools",
        gloss:
          "A lead agent treats sub-agents as callable tools, keeping control centralized in one place.",
      },
      {
        term: "Handoffs",
        gloss:
          "One agent transfers the task, along with its context, to another agent better suited to it.",
      },
      {
        term: "Supervisor graphs",
        gloss:
          "A coordinator routes work among specialist agents along a defined set of edges.",
      },
      {
        term: "Subgraphs",
        gloss:
          "An encapsulated agent workflow reused as a single node inside a larger graph.",
      },
      {
        term: "Parallel specialists",
        gloss:
          "Run independent specialist agents at the same time and merge their results.",
      },
      {
        term: "Context isolation",
        gloss:
          "Give each agent only its slice of context to avoid bloat and cross-contamination.",
      },
      {
        term: "Conflict resolution",
        gloss:
          "Decide what happens when agents disagree — vote, defer, escalate, or deliberately keep both views.",
      },
      {
        term: "Shared versus private state",
        gloss:
          "What every agent can see and write, versus what stays local to one agent.",
      },
      {
        term: "Agent identity and permission boundaries",
        gloss:
          "Each agent has its own identity and scoped permissions, so a compromised one has a limited blast radius.",
      },
    ],
    deliverable:
      "Two implementations of the same workflow — single-agent and multi-agent — with an evaluation report explaining which wins.",
  },
  {
    number: 9,
    title: "Production Operations",
    tagline: "Everything above has to run somewhere, safely, at 3am.",
    primer:
      "A working prototype and an operable service are different things. Containers, databases, queues, automated deploys, health checks, alerting, and runbooks are what let an on-call engineer trust the system and fix it fast when it breaks.",
    note:
      "Add vLLM, SGLang, and GPU Kubernetes only as an optional inference specialization — most applied roles never need to self-host a model.",
    concepts: [
      {
        term: "Docker",
        gloss:
          "Package the app and its dependencies into a reproducible container that runs the same everywhere.",
      },
      {
        term: "Postgres and Redis",
        gloss:
          "A durable relational store (Postgres) plus a fast cache and queue (Redis) — the default backbone.",
      },
      {
        term: "Worker queues",
        gloss:
          "Background job processing kept separate from request handling so the API stays responsive.",
      },
      {
        term: "CI/CD",
        gloss:
          "An automated test → build → deploy pipeline that runs on every change.",
      },
      {
        term: "Environment management",
        gloss:
          "Separate config and secrets per environment (dev / staging / prod) with no cross-contamination.",
      },
      {
        term: "Health checks",
        gloss:
          "Endpoints that report whether the service is alive and ready to take traffic.",
      },
      {
        term: "Autoscaling",
        gloss:
          "Add and remove capacity automatically as load rises and falls.",
      },
      {
        term: "Canary releases",
        gloss:
          "Ship to a small slice of traffic first and watch the metrics before rolling out fully.",
      },
      {
        term: "Rollback",
        gloss:
          "Revert to the last known-good version quickly when a release goes bad.",
      },
      {
        term: "Alerting",
        gloss:
          "Notify a human when SLOs breach or errors spike — before customers do.",
      },
      {
        term: "SLOs",
        gloss:
          "Explicit reliability targets (latency, availability) you commit to and measure against.",
      },
      {
        term: "Cost controls",
        gloss:
          "Budgets, caps, and per-tenant limits that keep spend predictable.",
      },
      {
        term: "Incident runbooks",
        gloss:
          "Step-by-step guides for diagnosing and fixing known failure modes under pressure.",
      },
    ],
    deliverable:
      "A deployed service with health checks, canary + rollback, alerting on SLO breaches, and an incident runbook.",
  },
  {
    number: 10,
    title: "Public Proof of Work",
    tagline: "A portfolio should demonstrate judgment, not just output.",
    primer:
      "The gap employers struggle to hire for is the distance between 'I built an agent' and 'I can be trusted to build reliable ones.' You close it with evidence. Every project you publish should carry the full set below — the artifacts that show you thought about state, failure, cost, and security, not just the happy path.",
    concepts: [
      {
        term: "Architecture diagram",
        gloss:
          "One clear picture of the components, the data flow, and the trust boundaries.",
      },
      {
        term: "Explicit state model",
        gloss:
          "The states, transitions, and persistence your system relies on, written down.",
      },
      {
        term: "Tool schemas",
        gloss:
          "The typed contracts for every tool the agent can call.",
      },
      {
        term: "Failure taxonomy",
        gloss:
          "A catalog of how the system can fail and how each failure is handled.",
      },
      {
        term: "Evaluation results",
        gloss:
          "Real metrics from your eval suite, with the golden set described.",
      },
      {
        term: "Cost and latency measurements",
        gloss:
          "Actual numbers — dollars per task and p50/p95/p99 — not hand-waving.",
      },
      {
        term: "Security model",
        gloss:
          "What you defend against and how: permissions, isolation, injection defenses.",
      },
      {
        term: "Recorded failure-and-recovery demo",
        gloss:
          "A video of the system breaking and recovering — the single strongest signal you can give.",
      },
      {
        term: "Tradeoff discussion",
        gloss:
          "Why you chose this design over the alternatives, told honestly.",
      },
      {
        term: "Reproducible repository",
        gloss:
          "Anyone can clone it and run it with documented setup.",
      },
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
      "Play to your domain advantage — a rigorously engineered evolution of Clarity, not another generic chatbot.",
    requirements: [
      "Filing and transcript tools",
      "Structured evidence objects",
      "Claim citations",
      "Token and cost budget",
      "Retry / replan logic",
      "Unanswerable detection",
      "50–100 case evaluation set",
      "Full tracing",
    ],
    why: "Proves reliability engineering on top of a domain you already understand deeply.",
  },
  {
    n: 2,
    title: "Durable Investment Approval Workflow",
    pitch:
      "Shows the production engineering that's missing from most agent portfolios.",
    requirements: [
      "Analyst agent proposes an action",
      "Risk checks run deterministically",
      "Human approval requested above thresholds",
      "Workflow pauses and resumes",
      "Every state transition is persisted",
      "Duplicate orders are impossible",
      "Injected crashes demonstrate recovery",
    ],
    why: "Durability, human-in-the-loop, and idempotent side effects — the exact skills employers struggle to hire for.",
  },
  {
    n: 3,
    title: "Falsification-Oriented Research System",
    pitch:
      "Connects to your investment background and gives a credible reason to use multiple agents.",
    requirements: [
      "Bull-case researcher",
      "Bear-case / falsification researcher",
      "Evidence verifier",
      "Deterministic synthesis layer",
      "Disagreement retained, not averaged away",
      "Multi-agent system tested against a single-agent baseline",
    ],
    why: "Justifies multi-agent complexity with a measured baseline comparison — the honest way to use more than one agent.",
  },
];

const PROGRESSION = [
  "Reliable services",
  "typed tools",
  "controlled agent loop",
  "evaluation",
  "durable state",
  "security",
  "multi-agent systems",
  "production",
];

// ─── Page ──────────────────────────────────────────────────────────────────

export default function AgenticEngineeringPage() {
  return (
    <div className="space-y-10">
      {/* ── Header / primer ─────────────────────────────────────────────── */}
      <header className="space-y-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Agentic Engineering
          </h1>
          <p className="text-[15px] leading-relaxed text-zinc-600 mt-3">
            A 10-stage primer that builds the one skill employers are genuinely
            short on: <em className="text-zinc-800">proving reliability</em>.
            Most &ldquo;learn the agent stack&rdquo; paths leave you fluent in
            terminology but weak on the engineering that makes an agent
            trustworthy. This reorders the same material so reliability comes
            first and multi-agent complexity comes last — only after you can
            measure that it helps.
          </p>
        </div>

        {/* The progression, as readable chips */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            The progression
          </div>
          <ol className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-2 text-sm">
            {PROGRESSION.map((step, i) => (
              <li key={step} className="flex items-center gap-1.5">
                <span className="font-medium text-zinc-800">{step}</span>
                {i < PROGRESSION.length - 1 && (
                  <span className="text-zinc-300" aria-hidden>
                    →
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>

        {/* How to read this */}
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-relaxed text-zinc-600">
          <span className="font-semibold text-zinc-700">How to read this: </span>
          each stage opens with why it matters and why it sits where it does,
          then lists its concepts in plain language, and ends with a concrete
          deliverable you can build to prove you learned it. Work top to bottom
          — every stage assumes the ones above it.
        </div>
      </header>

      {/* ── Stage jump nav ──────────────────────────────────────────────── */}
      <nav className="bg-white border border-zinc-200 rounded-xl p-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 px-2 pt-2 pb-1">
          Jump to stage
        </h2>
        <ol className="grid grid-cols-1 sm:grid-cols-2">
          {STAGES.map((s) => (
            <li key={s.number}>
              <a
                href={`#stage-${s.number}`}
                className="flex items-baseline gap-2 rounded-lg px-2 py-2.5 text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
              >
                <span className="font-mono text-xs text-zinc-400 w-5 shrink-0">
                  {String(s.number).padStart(2, "0")}
                </span>
                <span className="font-medium">{s.title}</span>
              </a>
            </li>
          ))}
          <li className="sm:col-span-2">
            <a
              href="#projects"
              className="flex items-baseline gap-2 rounded-lg px-2 py-2.5 text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
            >
              <span className="font-mono text-xs text-zinc-400 w-5 shrink-0">
                →
              </span>
              <span className="font-medium">Capstone projects</span>
            </a>
          </li>
        </ol>
      </nav>

      {/* ── Stages ──────────────────────────────────────────────────────── */}
      {STAGES.map((stage) => (
        <section
          key={stage.number}
          id={`stage-${stage.number}`}
          className="scroll-mt-4 space-y-4"
        >
          {/* Stage header */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white text-sm font-bold">
                {stage.number}
              </span>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  Stage {stage.number}
                </div>
                <h2 className="text-lg font-bold text-zinc-900 leading-tight">
                  {stage.title}
                </h2>
              </div>
              {stage.emphasis && (
                <span className="ml-auto shrink-0 self-start text-[11px] font-semibold text-amber-800 bg-amber-100 px-2 py-1 rounded-full">
                  {stage.emphasis}
                </span>
              )}
            </div>

            <p className="text-sm font-medium text-zinc-500 italic">
              {stage.tagline}
            </p>

            <p className="text-[15px] leading-relaxed text-zinc-700">
              {stage.primer}
            </p>

            {stage.note && (
              <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-relaxed text-sky-900">
                <span className="font-semibold">Note · </span>
                {stage.note}
              </div>
            )}
          </div>

          {/* Concepts */}
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 mb-2">
              What you&rsquo;ll learn
            </h3>
            <ul className="border border-zinc-200 rounded-lg bg-white divide-y divide-zinc-100">
              {stage.concepts.map((c) => (
                <li key={c.term} className="px-4 py-3">
                  <div className="text-sm font-semibold text-zinc-900">
                    {c.term}
                  </div>
                  <div className="text-sm text-zinc-600 mt-1 leading-relaxed">
                    {c.gloss}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Deliverable */}
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
              Deliverable
            </div>
            <p className="text-sm text-emerald-900 mt-1 leading-relaxed">
              {stage.deliverable}
            </p>
          </div>
        </section>
      ))}

      {/* ── Capstone projects ───────────────────────────────────────────── */}
      <section id="projects" className="scroll-mt-4 space-y-4">
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-zinc-900">Capstone projects</h2>
          <p className="text-[15px] leading-relaxed text-zinc-600">
            What I&rsquo;d have you build. Each project ships with the full Stage
            10 evidence set — architecture diagram, state model, tool schemas,
            failure taxonomy, eval results, cost/latency, security model, a
            recorded failure-and-recovery demo, a tradeoff discussion, and a
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
                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  Project {p.n}
                </div>
                <h3 className="text-base font-bold text-zinc-900 mt-0.5 leading-tight">
                  {p.title}
                </h3>
              </div>
              <p className="text-sm text-zinc-600 leading-relaxed">{p.pitch}</p>
              <ul className="space-y-1.5 text-sm text-zinc-700">
                {p.requirements.map((r) => (
                  <li key={r} className="flex gap-2">
                    <span className="text-zinc-300 shrink-0" aria-hidden>
                      •
                    </span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-zinc-500 leading-relaxed pt-3 border-t border-zinc-100 mt-auto">
                <span className="font-semibold text-zinc-600">
                  Why it lands:{" "}
                </span>
                {p.why}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Bottom line ─────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 space-y-2">
        <h2 className="text-lg font-bold text-zinc-900">Bottom line</h2>
        <p className="text-[15px] leading-relaxed text-zinc-700">
          Keep the full subject coverage, but sequence it so reliability is
          proven before complexity is added. Multi-agent orchestration is the{" "}
          <em className="text-zinc-900">eighth</em> stage, not the first —
          introduced only after you can measure a single-agent baseline and show
          the extra agents earn their latency, cost, and operational complexity.
        </p>
        <p className="text-sm leading-relaxed text-zinc-500 pt-2 border-t border-zinc-100">
          This is what trains the applied AI engineer that&rsquo;s in short
          supply: not someone fluent in agent terminology, but someone who can
          prove a system is reliable.
        </p>
      </section>
    </div>
  );
}
