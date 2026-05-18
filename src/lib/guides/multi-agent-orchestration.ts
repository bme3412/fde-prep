import type { StudyGuide } from "../guide-types";

export const multiAgentOrchestrationGuide: StudyGuide = {
  topicTitle: "Multi-agent orchestration",
  topicSlug: "multi-agent-orchestration",
  sections: [
    // ─── Section 1: What multi-agent actually means ──────────────────────
    {
      title: "What multi-agent actually means",
      blocks: [
        {
          kind: "prose",
          markdown: `## The canonical example: Anthropic's research system

Anthropic published an engineering write-up of how the **Research feature in Claude.ai** works. It's the cleanest reference architecture for a real multi-agent system you can cite in a customer conversation:

- A **lead researcher** (an instance of Claude) reads the user's question, plans the research, and decides what sub-questions to investigate.
- It spawns **sub-agents** (also Claude instances) in parallel, each given a focused sub-question and its own context window.
- Sub-agents run their own tool-using loops (web search, fetch, read) to gather evidence.
- Each sub-agent returns a compact answer to the lead.
- The lead **synthesizes** the sub-agents' answers into a final report with citations.

We'll thread this example through the whole guide. When you hear "multi-agent," picture this shape.

## The single sentence definition

A multi-agent system is one where **two or more LLM-controlled processes communicate via structured messages to accomplish a task that wouldn't fit in one context window or one agent's expertise.**

Two non-obvious things follow:

1. **It's not "more agents = better."** Anthropic's research blog reports that multi-agent systems use ~15× more tokens than single-agent chat. The win is task quality (and parallelism), not efficiency.
2. **It's not "agents talking freely."** Real systems have strict communication protocols, named roles, and an orchestrator. Free-form agent-to-agent dialogue is a research toy, not a production pattern.`,
        },
        {
          kind: "key_insight",
          label: "When multi-agent earns its complexity",
          insight: `Multi-agent is the right pattern when **at least two of these are true:**

1. The task **decomposes into independent sub-problems** — sub-agents work in parallel without needing each other's intermediate state.
2. A **single context window** can't hold all the working material — searching the web, reading a large corpus, working across many files.
3. **Different roles need different prompts/tools** — researching vs. writing vs. critiquing benefit from focused system prompts.

If only one is true, you probably want orchestrator-workers (a single planning step then parallel single-shot workers — not full agents). If none are true, you want one agent or a workflow.`,
        },
        {
          kind: "code_comparison",
          label: "Single agent vs lead+sub-agents on the same research task",
          left: {
            title: "Single agent — one context window",
            code: `def research(question: str) -> str:
    msgs = [{"role": "user", "content": question}]
    while True:
        r = client.messages.create(
            model="claude-opus-4-5",
            tools=[web_search, web_fetch, finalize],
            messages=msgs,
        )
        if r.stop_reason == "end_turn":
            return r.content[-1].text
        msgs += run_tools(r)
    # All sources accumulate in one context.
    # 50+ search results + page contents = saturation.`,
            annotation: "One agent, sequential exploration, one context. Hits the wall when you need to read 20 pages to answer the question.",
          },
          right: {
            title: "Lead + sub-agents — one context per sub-question",
            code: `def research(question: str) -> str:
    plan = lead_plan(question)   # ["sub-q1", "sub-q2", "sub-q3"]
    results = await asyncio.gather(*[
        sub_agent_run(q) for q in plan
    ])  # each sub-agent has its own fresh context + tool loop
    return lead_synthesize(question, plan, results)
    # Each sub-agent reads only what it needs for ITS sub-question.
    # Lead never sees the raw pages, only the sub-agents' summaries.`,
            annotation: "N sub-agents, parallel exploration, N+1 contexts. Each sub-agent reads deeply on a narrow slice; the lead synthesizes thin summaries. This is the Anthropic research architecture.",
          },
          takeaway: "Multi-agent's structural win is *context partitioning*. Each sub-agent's context contains only what it needs for its sub-question — the lead never gets bloated by raw search results. Costs more, but enables tasks single agents physically can't complete.",
        },
        {
          kind: "method_ref",
          title: "Common multi-agent role taxonomy",
          importLine: "# Names vary; shapes recur",
          methods: [
            {
              signature: "Orchestrator / lead / planner",
              description: "Reads the task, plans sub-tasks, dispatches them, and synthesizes results.",
              returns: "There's almost always exactly one. Multiple orchestrators tends to mean nobody owns the final answer.",
            },
            {
              signature: "Worker / sub-agent / specialist",
              description: "Receives one focused sub-task with its own context window, runs its own tool loop, returns a compact answer.",
              returns: "These are agents in the loop-with-tools sense. They can be Opus, Sonnet, or Haiku depending on task complexity.",
            },
            {
              signature: "Critic / evaluator / verifier",
              description: "Reviews an output (from worker or orchestrator) against criteria, returns critique or pass/fail.",
              returns: "Often a separate model or stronger model than the generator to avoid shared blind spots.",
            },
            {
              signature: "Router (sometimes)",
              description: "Sits in front of the orchestrator to decide *which* multi-agent pipeline to invoke (research vs. code vs. ops).",
              returns: "Mostly seen in product surfaces that serve many task types from one UI.",
            },
            {
              signature: "Tool layer (not an agent)",
              description: "Search, retrieval, code-exec, file-read — services that workers call. Not LLMs themselves.",
              returns: "Worth naming because half of multi-agent debugging is actually 'a tool returned garbage and the agent didn't notice.'",
            },
          ],
        },
        {
          kind: "scenario_predict",
          label: "Is this actually multi-agent?",
          language: "text",
          scenario: `A team builds a system that:
  1. Receives a customer question.
  2. Calls Claude to classify it into one of 5 categories.
  3. Routes to one of 5 prompts, each producing an answer.
  4. Returns the answer.

The team calls this their "multi-agent system" and asks how to make
the agents coordinate better.`,
          question: "Is this multi-agent? If not, what is it?",
          answer: "Not multi-agent. This is routing with single-prompt handlers. There's no agent loop in any handler, no inter-agent communication, no orchestrator that synthesizes results from multiple agents. It's a workflow.",
          explanation: "The 'multi-agent' label gets applied to any system with multiple LLM calls, but precision matters: multi-agent requires (1) multiple LLMs in tool-using loops, (2) structured communication between them, (3) an orchestrator that synthesizes. Helping the customer rename this 'routing' redirects optimization effort to the right place (routing accuracy + per-branch prompt quality, not 'agent coordination').",
        },
        {
          kind: "flashcard",
          front: "Why does Anthropic's research system use multi-agent instead of one bigger agent?",
          back: "Three reasons, in order of importance: (1) **Parallel exploration** — a single agent has to investigate sub-questions sequentially; sub-agents run concurrently and cut wall-clock time. (2) **Context partitioning** — the lead never sees the raw pages, only sub-agents' summaries; this keeps the synthesis prompt clean. (3) **Specialized prompting** — sub-agents can be prompted for focused investigation; the lead can be prompted for cross-source synthesis. The Anthropic write-up notes this costs ~15× more tokens than a single chat turn, which is the price of admission.",
        },
      ],
    },
    // ─── Section 2: The lead-researcher pattern in depth ─────────────────
    {
      title: "The lead-researcher pattern in depth",
      blocks: [
        {
          kind: "prose",
          markdown: `## Anatomy of a lead + sub-agents system

Walking through what each component actually does in production (using Anthropic's published architecture as the reference):

### Lead researcher
- **Input**: the user's question + any conversation context.
- **First job**: plan. Decompose into 2-10 focused sub-questions, each answerable independently.
- **Second job**: dispatch. Spawn sub-agents with their sub-question + relevant system prompt + tool allow-list.
- **Third job**: synthesize. Receive sub-agent results; cross-check for contradictions; compose final answer with citations.
- Often uses the strongest available model (Opus) because synthesis is the hardest cognitive job.

### Sub-agents
- **Input**: one focused sub-question + a fresh, empty context window.
- **Loop**: their own tool-using agent loop (search → read → search again → maybe finalize).
- **Output**: a compact, structured summary — usually 1-3 paragraphs + a list of citations. Critically, **not** raw search results.
- Can be Opus, Sonnet, or Haiku — match model to sub-task difficulty.

### Why the output must be compact
If sub-agents returned raw search results to the lead, you'd recreate the single-agent context-bloat problem. The whole point is that each sub-agent does the expensive reading in its own context, then summarizes.`,
        },
        {
          kind: "code_comparison",
          label: "Sub-agent contract: chatty vs disciplined",
          left: {
            title: "Chatty sub-agent — pollutes the lead's context",
            code: `def sub_agent(question: str) -> str:
    # Tool loop ...
    return f"""
    I searched for "{question}" and found:
    [Page 1: 4000 words]
    [Page 2: 3000 words]
    [Page 3: 5000 words]
    Here's what I think: ...
    """`,
            annotation: "Raw pages flow to the lead. With 5 sub-agents you've now stuffed 60k tokens of pages into the synthesis context. The lead's quality drops; cost balloons.",
          },
          right: {
            title: "Disciplined sub-agent — structured, terse",
            code: `def sub_agent(question: str) -> dict:
    # Tool loop ...
    return {
        "summary": "Three paragraphs of synthesis.",
        "key_facts": [
            {"fact": "...", "source_url": "..."},
            {"fact": "...", "source_url": "..."},
        ],
        "uncertainty": "Could not find authoritative source for X.",
    }`,
            annotation: "Lead gets a structured object it can synthesize from. Token budget stays bounded. Citations flow through cleanly.",
          },
          takeaway: "The sub-agent's *return contract* is the single most important design decision in a multi-agent system. If sub-agents are allowed to be chatty, the whole architecture's reason-to-exist (context partitioning) collapses. Define the output schema before writing the prompts.",
        },
        {
          kind: "scenario_predict",
          label: "How many sub-agents is the right number?",
          language: "text",
          scenario: `User asks: "Give me a competitive analysis of the top 5 vector databases."

The lead has to choose how many sub-agents to spawn:
  A) 1 sub-agent: "Research the top 5 vector databases."
  B) 5 sub-agents: one per database (Pinecone, Weaviate, Qdrant, Chroma, pgvector).
  C) 25 sub-agents: 5 databases × 5 dimensions (perf, pricing, scale, ecosystem, docs).`,
          question: "Which is best, and what's the trade-off the lead is making?",
          answer: "B is the production sweet spot. A loses the parallelism benefit (one sub-agent has to do all the work sequentially). C is over-decomposition: 25 fan-out, 25 context windows, 25 synthesis inputs — the lead can't synthesize 25 tiny answers as well as it can synthesize 5 coherent ones. Each sub-agent should produce one coherent unit of analysis the lead can directly use.",
          explanation: "Empirical guidance from Anthropic's research write-up: aim for 2-10 sub-agents, sized so each does meaningful work (not trivial fan-out) and produces output the lead can synthesize in one pass. Watch for the over-decomposition tell: if the lead's synthesis step starts looking like 'concatenate the bullet points,' you've fanned out too far.",
        },
        {
          kind: "warm_up",
          title: "Pick the model for each role",
          prompt: `In a lead+sub-agents research system, you have access to Haiku, Sonnet, and Opus. Which model goes where, and why?`,
          answer: "Lead: Opus (or strongest available) — synthesis is the hardest cognitive task and the lead's context contains the most diverse material. Sub-agents: Sonnet for most research sub-tasks; Haiku only for narrow, mechanical sub-tasks (e.g., 'pull the pricing page'). Critic (if present): match or exceed the lead's model to avoid shared blind spots.",
          explanation: "Model selection is the easiest cost lever in multi-agent. Sub-agents that do focused search-and-summarize work rarely need Opus; the lead almost always does. Test the downgrade on your eval before committing — a few cents of sub-agent savings can erode quality if the synthesis assumes Opus-level summaries.",
        },
        {
          kind: "flashcard",
          context: "What the lead does that no sub-agent should do.",
          front: "Why must the *lead* (not a sub-agent) own synthesis?",
          back: "Because synthesis requires cross-referencing all sub-agents' results — which means it needs all those results in one context. Only the lead's context has them. If you delegate synthesis to one of the sub-agents, that sub-agent has to receive the others' outputs, which means N-1 round-trips and either the lead becomes vestigial (just a router) or the sub-agent-now-synthesizer becomes the actual lead. The cleanest design has exactly one synthesizer, and it's the orchestrator.",
        },
      ],
    },
    // ─── Section 3: Communication & handoff protocols ────────────────────
    {
      title: "Communication & handoff protocols",
      blocks: [
        {
          kind: "prose",
          markdown: `## How agents actually talk to each other

In production multi-agent, agents don't speak free-form natural language to each other. They exchange **structured messages with defined schemas.** This is the single biggest difference between research-demo multi-agent and production multi-agent.

### Three communication topologies

1. **Star (most common)** — orchestrator at the center, sub-agents as spokes. Sub-agents never talk to each other; they only return to the orchestrator. This is the Anthropic research shape.
2. **Pipeline** — agent A → agent B → agent C. Output of one is input of the next. Used when sub-tasks have linear dependencies (research → write → fact-check).
3. **Blackboard** — agents read from and write to a shared scratchpad. Theoretically expressive but operationally hard: hard to debug, hard to bound context growth, hard to reason about which agent did what.

**Default to star.** Use pipeline when you have linear stages. Avoid blackboard unless you have a very specific reason and a plan for context management.

### What gets passed across the boundary

- **Going in to a sub-agent**: the sub-question, the role's system prompt, the tool allow-list, possibly a small slice of upstream context (e.g., the original user question).
- **Coming back out**: a structured object — typically \`{summary, key_facts, sources, uncertainty}\`. Free-form prose is OK inside summary; the *envelope* is structured.

### What does NOT get passed
- The sub-agent's full message history. The lead sees the output, not the loop.
- Other sub-agents' partial state. Sub-agents are independent.
- Raw tool outputs. Sub-agents summarize before returning.`,
        },
        {
          kind: "method_ref",
          title: "Sub-agent message envelope (typical schema)",
          importLine: "# Pydantic-ish; adapt to your codebase",
          methods: [
            {
              signature: "task_id: str",
              description: "Stable identifier for the sub-task. Used for tracing and reconciling parallel results.",
              returns: "Required for observability. Without it you can't tell which sub-agent produced which output.",
            },
            {
              signature: "summary: str",
              description: "1-3 paragraphs of synthesized findings. Prose, not bullet dump.",
              returns: "This is what the orchestrator's synthesis prompt actually reads.",
            },
            {
              signature: "key_facts: list[Fact]",
              description: "Structured facts the orchestrator may quote or cite. Each fact has text + source URL/id.",
              returns: "Lets the orchestrator generate cited claims without re-deriving them from prose.",
            },
            {
              signature: "uncertainty: str | None",
              description: "What the sub-agent was unable to determine. Critical signal for the orchestrator.",
              returns: "Without this field, orchestrators confidently synthesize over gaps.",
            },
            {
              signature: "tools_used: list[str]",
              description: "Which tools the sub-agent called and how many times.",
              returns: "Observability + cost attribution. Optional but valuable.",
            },
            {
              signature: "cost_tokens: int",
              description: "Total tokens spent in the sub-agent's loop.",
              returns: "Required for cost ceilings on the orchestrator side.",
            },
          ],
        },
        {
          kind: "code_comparison",
          label: "Star vs blackboard topology",
          left: {
            title: "Star — explicit, debuggable",
            code: `# Lead dispatches, sub-agents return, lead synthesizes
async def run():
    sub_qs = lead_plan(user_q)
    results = await asyncio.gather(*[
        sub_agent_run(q) for q in sub_qs
    ])
    return lead_synthesize(user_q, sub_qs, results)`,
            annotation: "Every message has a known sender and receiver. Traces are linear. Failures are localized.",
          },
          right: {
            title: "Blackboard — expressive, hard to operate",
            code: `# Agents read/write a shared store; coordinator polls
async def run():
    board = SharedBlackboard()
    agents = [planner, researcher, writer, critic]
    while not board.has("final"):
        await asyncio.gather(*[
            a.step(board) for a in agents
        ])
    return board.get("final")`,
            annotation: "Agents can pick up unfinished work, react to each other, etc. Beautiful in theory; in production: race conditions, unbounded context growth, debugging nightmares, no clear ownership of final output.",
          },
          takeaway: "If you're tempted by blackboard, ask 'what would I lose by structuring this as star or pipeline?' 90% of the time the answer is 'nothing important.' Reserve blackboard for genuinely emergent coordination problems — and even then, prepare to spend most of your engineering time on the blackboard's invariants, not on the agents.",
        },
        {
          kind: "scenario_predict",
          label: "Why structured outputs matter — concretely",
          language: "text",
          scenario: `A team's lead-researcher system has sub-agents returning free-form prose
("Here's what I found about Pinecone..."). The lead's synthesis prompt
keeps inventing citations that don't exist in the sub-agents' answers.`,
          question: "What's the structural fix, and why does it work?",
          answer: "Have sub-agents return key_facts as a structured list with explicit source URLs. Change the lead's synthesis prompt to 'only cite facts that appear in the key_facts arrays.' Hallucinated citations stop because the lead can be programmatically constrained to draw citations only from the structured field — and the synthesis prompt no longer has to extract URLs from arbitrary prose.",
          explanation: "Hallucinated citations in multi-agent are almost always a return-contract problem, not a synthesis-prompt problem. If sub-agents return prose, the lead has to re-extract structure under load — and LLMs invent missing structure. Solution: move the structure to the contract. This is a recurring lesson in production multi-agent — structured outputs at every boundary.",
        },
        {
          kind: "warm_up",
          title: "When pipeline beats star",
          prompt: `When is the pipeline topology (A → B → C) the right call instead of star?`,
          answer: "When sub-tasks have hard sequential dependencies — B genuinely cannot start until A is done. Example: research → outline → draft → fact-check. The outline depends on the research, the draft on the outline, fact-check on the draft. Trying to star-fan-out these would either be wrong or wasteful.",
          explanation: "Star + pipeline are not exclusive. Many production systems use star for parallel research and pipeline for the linear write-then-edit phase. The right shape is whatever matches the dependency graph of the task.",
        },
        {
          kind: "flashcard",
          front: "What's the difference between a 'sub-agent' and a 'tool'?",
          back: "A sub-agent is an LLM in its own loop with its own context and tools — it can choose how to investigate. A tool is a deterministic function that returns the same output for the same input (modulo external state). Sub-agents are appropriate when the *how* of the sub-task is not knowable in advance (research, debugging, multi-step reasoning). Tools are appropriate when the *what* is fully specified by the call (run_sql, send_email, get_user). In doubt, start with a tool and graduate to a sub-agent only when the task truly requires LLM decision-making at each step.",
        },
      ],
    },
    // ─── Section 4: Failure modes ────────────────────────────────────────
    {
      title: "Failure modes (and how to detect them)",
      blocks: [
        {
          kind: "prose",
          markdown: `## The five failure modes you must be ready to name

When a customer says "our multi-agent system is unreliable," they're almost always describing one of these. Recognize them in the first conversation and you save weeks.

### 1. Drift
The system's output gradually departs from the user's actual question. Symptom: in long-running tasks, the final synthesis seems to answer a *related* question instead of the one asked. Cause: each handoff loses a little fidelity to the original ask; by the time the lead synthesizes, the sub-agents have answered subtly-wrong sub-questions.

### 2. Infinite loops
Two agents (or an agent + tool) ping-pong without making progress. Symptom: turn count keeps climbing, no final answer. Cause: orchestrator keeps replanning because each result looks "almost right," or sub-agents retry the same failed tool call.

### 3. Context bloat
The orchestrator's context grows past the model's effective window. Symptom: quality drops sharply on long-running tasks; the lead "forgets" earlier sub-agent findings. Cause: sub-agents returning too much; orchestrator concatenating raw results instead of summarizing.

### 4. Diffusion of responsibility
Everyone thinks someone else verified the answer. Symptom: confident output containing obvious errors. Cause: no explicit verifier; sub-agents trust the lead, the lead trusts the sub-agents.

### 5. Cost runaway
Single task costs 10-100× the expected budget. Symptom: a few bad tasks blow the daily spend. Cause: no per-task cost ceiling; orchestrator fans out further when sub-agent results look unsatisfying.`,
        },
        {
          kind: "method_ref",
          title: "Detection + mitigation cheat sheet",
          importLine: "# What to instrument, what to do when alerts fire",
          methods: [
            {
              signature: "Drift",
              description: "Detect: have the lead emit (in structured output) a 'restatement of the user's question' before synthesizing. Audit for restatement drift in a sample of tasks.",
              returns: "Mitigate: pass the original user question into every sub-agent prompt. Re-anchor in the synthesis prompt explicitly ('Original question: X. Sub-agent findings: ...').",
            },
            {
              signature: "Infinite loops",
              description: "Detect: hard turn cap on the orchestrator; per-sub-agent turn cap; alert on tasks that hit either.",
              returns: "Mitigate: cap orchestrator replan iterations (usually 1-2); cap sub-agent turns (usually 5-15); make tool retry policies deterministic (max 2 retries, then fail upward).",
            },
            {
              signature: "Context bloat",
              description: "Detect: log token counts at each stage (incoming sub-agent results, synthesis prompt size). Set a budget — alert when exceeded.",
              returns: "Mitigate: enforce structured sub-agent outputs with size limits; summarize raw tool outputs inside sub-agents, not in the orchestrator; never put raw search results in the lead's prompt.",
            },
            {
              signature: "Diffusion of responsibility",
              description: "Detect: add an explicit critic agent that scores final outputs against the original question.",
              returns: "Mitigate: name one role as 'final answer owner.' Usually the orchestrator. Add a verification step before returning to the user (programmatic check + optional critic agent).",
            },
            {
              signature: "Cost runaway",
              description: "Detect: per-task cost meter; alert on outliers (e.g., > 3× p95).",
              returns: "Mitigate: hard cost ceiling per task (abort if exceeded); cap fan-out width (max N sub-agents); cap orchestrator replanning rounds; downshift models for sub-agents whose work is mechanical.",
            },
          ],
        },
        {
          kind: "scenario_predict",
          label: "Diagnose the failure mode",
          language: "text",
          scenario: `A customer's research-bot logs show:
  - Average task: 12 sub-agents spawned, 4 minutes wall time, $0.80 cost.
  - p99 task: 47 sub-agents, 23 minutes, $14 cost.
  - p99 tasks are typically ones where the user asks an ambiguous question.

The team wants to ship, but ops is worried.`,
          question: "What's the failure mode, and what's the minimum guardrail to ship safely?",
          answer: "Cost runaway driven by fan-out. The orchestrator is responding to ambiguity by spawning more sub-agents instead of clarifying with the user. Minimum guardrail: hard cap on sub-agent count per task (e.g., max 8); hard cost ceiling per task (e.g., $2); on cap-hit, return a partial answer + 'I need more info to answer this fully' message to the user.",
          explanation: "Multi-agent's failure modes compound: ambiguous question → orchestrator unsure → more sub-agents → more cost → still ambiguous. The fix is structural: caps + graceful degradation. The right product move is also to add a clarifying-question turn before the orchestrator commits to a plan, so ambiguous questions get refined before fan-out — but that's a v2; ship the caps first.",
        },
        {
          kind: "code_comparison",
          label: "Hardening: bare orchestrator vs production-ready",
          left: {
            title: "Bare orchestrator — every failure mode unmitigated",
            code: `async def orchestrate(question: str) -> str:
    plan = await lead_plan(question)
    results = await asyncio.gather(*[
        sub_agent(q) for q in plan
    ])
    return await lead_synthesize(question, results)
    # No caps. No critic. No retry policy. No cost limit.
    # No drift detection. No structured outputs enforced.`,
            annotation: "Looks tidy. Will rack up a five-figure bill the first week a user asks something weird.",
          },
          right: {
            title: "Production-ready orchestrator",
            code: `async def orchestrate(question: str,
                     max_subs: int = 8,
                     max_cost_usd: float = 2.0,
                     max_replans: int = 1) -> dict:
    cost = CostTracker(limit=max_cost_usd)
    plan = await lead_plan(question, max_items=max_subs)
    for _ in range(max_replans + 1):
        results = await asyncio.gather(*[
            sub_agent(q, cost=cost, max_turns=10)
            for q in plan
        ])
        cost.check()  # raises if over limit
        synth = await lead_synthesize(question, plan, results)
        if synth.confidence == "high":
            break
        plan = await lead_replan(question, plan, results)
    verified = await critic(question, synth)
    return {"answer": synth, "verified": verified, "cost": cost.total}`,
            annotation: "Caps on width (max_subs), cost (max_cost_usd), replanning depth (max_replans), sub-agent turns. Explicit critic. Cost tracker. Confidence-gated early exit.",
          },
          takeaway: "Multi-agent in production is 30% prompts and 70% guardrails. The guardrails aren't optional — they're the difference between a system that runs autonomously and one that needs a babysitter.",
        },
        {
          kind: "warm_up",
          title: "Drift detector",
          prompt: `You suspect drift in a multi-agent research system. What's the cheapest, lowest-effort instrumentation to confirm it?`,
          answer: "Have the lead emit a 'restated_question' field in its final structured output. Compare restated_question to the original user question on a sample (LLM-judge or human). If they consistently diverge, you have drift.",
          explanation: "Drift is the failure mode that's hardest to spot from cost/latency metrics alone — the system looks healthy, just answers a subtly-wrong question. Forcing restatement into the contract is a one-line change that exposes drift cheaply.",
        },
        {
          kind: "flashcard",
          context: "The non-obvious failure mode customers often miss.",
          front: "Why is 'diffusion of responsibility' especially dangerous in multi-agent?",
          back: "Because every agent in the chain sees a partial picture and trusts that someone else (upstream or downstream) caught the issue. Sub-agents trust the lead to verify; the lead trusts sub-agents to be accurate; nobody actually verifies. The fix is to *name one role as the verifier* — usually a critic agent that runs after synthesis and checks the final answer against the original question + the sub-agents' uncertainty fields. Without an explicit verifier, multi-agent systems can be confidently wrong in ways single-agent systems can't (a single agent at least has all its evidence in one context).",
        },
      ],
    },
    // ─── Section 5: Shared scratchpads & memory ──────────────────────────
    {
      title: "Shared scratchpads & memory",
      blocks: [
        {
          kind: "prose",
          markdown: `## When agents need to share state

Star topology says sub-agents only return to the orchestrator. But in some tasks sub-agents really do benefit from awareness of each other — for example, sub-agents researching different competitors should avoid re-investigating common context.

This is where **scratchpads** come in: a shared store that agents can read from and write to.

### The two flavors of scratchpad

1. **Read-only context cache** — the orchestrator writes shared context once before spawning sub-agents. Sub-agents read but don't write. Example: "Here's the user's full original question and the high-level plan; refer to it as needed." Safe, simple, doesn't break the star.

2. **Read-write shared memory** — sub-agents append findings as they go; other sub-agents read them. This is the blackboard topology, with all its hazards (race conditions, unbounded growth, debugging cost).

### Why most production systems avoid read-write shared memory

- **Determinism breaks**: same input can produce different outputs depending on sub-agent ordering.
- **Debugging is hard**: which agent wrote what, when, and why? Reconstructing traces takes hours.
- **Context unbounded**: scratchpad grows with every write; eventually exceeds any single agent's window.
- **Implicit dependencies**: the system "works" because agent A happens to run before agent B. Refactor A and B silently breaks.

### When read-only context cache is the right call

When sub-agents need to share **stable, upfront context** (the user's question, the plan, the schema being investigated), put it in a context cache. Don't pass it through every sub-agent's prompt — pass a reference and let the sub-agent read on demand. This is structurally indistinguishable from prompt caching, and it pairs well with Anthropic's prompt-cache feature.`,
        },
        {
          kind: "code_comparison",
          label: "Read-only cache vs read-write blackboard",
          left: {
            title: "Read-only context cache (safe)",
            code: `class Run:
    user_question: str
    plan: list[SubQ]
    # All set once by lead, never mutated.

async def sub_agent(sub_q: SubQ, run: Run) -> Result:
    # Sub-agent reads run.user_question, run.plan as needed.
    # Cannot write.
    ...`,
            annotation: "All state is set upfront. Sub-agents are still effectively pure functions of (sub_q, run). Star topology preserved.",
          },
          right: {
            title: "Read-write shared scratchpad (hazardous)",
            code: `class Scratchpad:
    findings: dict[str, Any] = {}
    def append(self, agent_id: str, key: str, value: Any): ...
    def read(self, key: str) -> Any: ...

async def sub_agent(sub_q: SubQ, pad: Scratchpad) -> Result:
    related = pad.read("previous_findings")  # reads B's work
    pad.append(my_id, "my_findings", result)  # writes for C
    # Depends on ordering. Race-prone. Hard to test.`,
            annotation: "Same code runs differently depending on which sub-agent finishes first. Tracing 'why did the agent decide X' requires reconstructing the scratchpad's history at that moment.",
          },
          takeaway: "Default to read-only context cache. Reach for read-write shared memory only when sub-agents genuinely cannot make progress without others' partial state — and even then, prepare to spend engineering time on invariants, ordering guarantees, and trace tooling.",
        },
        {
          kind: "scenario_predict",
          label: "Spotting an unnecessary scratchpad",
          language: "text",
          scenario: `A team's multi-agent system has 4 sub-agents researching 4 competitors.
They've added a shared scratchpad so sub-agents can "share what they
learn about the market." In practice, they discover sub-agents are
mostly reading their own prior writes (not each other's), and the system
has become flaky when sub-agents finish out of order.`,
          question: "What's the diagnosis and the right refactor?",
          answer: "The 'shared learning' isn't actually shared — each sub-agent is just using the scratchpad as personal scratch storage. Refactor: remove the scratchpad. Put the truly-shared context (the user's question, the competitor list) in a read-only cache. Let each sub-agent maintain its own local working state inside its own context.",
          explanation: "This is the most common scratchpad pathology: teams add shared memory anticipating coordination needs that don't materialize. The result is flakiness from ordering and zero actual benefit. The diagnostic is to log scratchpad reads/writes per agent: if >80% of reads are 'agent reading its own writes,' the scratchpad is doing nothing for you.",
        },
        {
          kind: "method_ref",
          title: "If you must build a read-write scratchpad",
          importLine: "# Invariants to enforce",
          methods: [
            {
              signature: "Append-only",
              description: "No agent overwrites another's entry. Each write gets a unique id, timestamp, author.",
              returns: "Lets you reconstruct state at any time. Without this, debugging is hopeless.",
            },
            {
              signature: "Namespaced by author",
              description: "Reads can filter by author. 'Show me only what the planner wrote.'",
              returns: "Reduces ambient cross-agent influence; makes intent of each read explicit.",
            },
            {
              signature: "Bounded size",
              description: "Cap total scratchpad size; oldest entries roll off or get summarized.",
              returns: "Prevents context bloat. Without this, scratchpad grows without bound on long tasks.",
            },
            {
              signature: "Read-time filtering",
              description: "Don't return the whole pad on every read; require query (key, author, time range).",
              returns: "Keeps sub-agent context small. A 50k-token pad delivered into a sub-agent prompt is its own bloat source.",
            },
            {
              signature: "Audit trail",
              description: "Log every read and write with agent id, timestamp, key, value snippet.",
              returns: "Required for 'why did the agent decide X' post-mortems. Without it, you can't reproduce or explain.",
            },
          ],
        },
        {
          kind: "flashcard",
          front: "Read-only context cache vs read-write scratchpad — which is which?",
          back: "Read-only cache: lead writes once before fan-out (the question, the plan, shared schema). Sub-agents only read. Same outcome regardless of order — safe and recommended. Read-write scratchpad: sub-agents both read and write while running. Order-dependent, race-prone, hard to debug — avoid unless the task genuinely requires emergent coordination. If you need 'sub-agents see each other's progress,' first prove the task can't be redesigned as star + structured returns.",
        },
      ],
    },
    // ─── Section 6: Evaluation & observability ───────────────────────────
    {
      title: "Evaluation & observability",
      blocks: [
        {
          kind: "prose",
          markdown: `## Evaluating multi-agent is different from evaluating single agents

A single agent's quality can be measured at the input/output boundary: did it answer the question? Multi-agent quality has at least three layers:

1. **End-to-end quality** — did the user get a good final answer?
2. **Per-role quality** — did the lead plan well? Did sub-agents return good summaries? Did the synthesis fairly reflect sub-agent findings?
3. **System health** — cost, latency, failure rates, drift, fan-out width.

Evaluating only at layer 1 leaves you blind to *why* things went wrong. Evaluating only at layer 2 misses cases where each component is fine but the system is wrong.

### The minimum viable eval suite

- **Held-out task set** (50-200 hand-curated tasks with reference answers) for end-to-end quality. Run weekly.
- **Per-role spot-checks**: sample N sub-agent runs/week, score sub-agent outputs in isolation against their sub-question.
- **Drift detector**: lead's restated_question vs user's original question on a rolling sample.
- **Failure dashboards**: per-task cost, latency, turn count, fan-out width — with alerts on p99 spikes.

### What to instrument from day one

You cannot debug a multi-agent system without per-agent traces. Capture:
- Every LLM call: model, input tokens, output tokens, latency, cost.
- Every sub-agent invocation: sub-question, returned summary, source list.
- Every tool call: tool name, inputs, output size, latency.
- Orchestrator decisions: plan, replanning events, synthesis input/output.

Treat the trace as a first-class product artifact. When a user complains "this answer is wrong," you need to be able to load the full trace and see exactly which sub-agent missed what.`,
        },
        {
          kind: "method_ref",
          title: "Observability fields per multi-agent run",
          importLine: "# What every trace must contain",
          methods: [
            {
              signature: "run_id",
              description: "Stable id for the full multi-agent invocation.",
              returns: "Top-level grouping for all sub-traces.",
            },
            {
              signature: "user_question",
              description: "The original user input, verbatim.",
              returns: "Anchor for drift detection and end-to-end eval.",
            },
            {
              signature: "lead_plan",
              description: "The orchestrator's decomposition (list of sub-questions).",
              returns: "Lets you audit plan quality independent of sub-agent execution.",
            },
            {
              signature: "sub_agent_runs[]",
              description: "One per sub-agent: sub-question, full message history, tool calls, return envelope.",
              returns: "Per-role debugging; quality scoring; cost attribution.",
            },
            {
              signature: "synthesis_input + synthesis_output",
              description: "What the orchestrator received from sub-agents, what it produced.",
              returns: "Localizes 'sub-agents had it but lead missed it' vs 'sub-agents didn't have it' failures.",
            },
            {
              signature: "cost_breakdown",
              description: "Per-component token counts and USD. Sum to total.",
              returns: "Required for ops + capacity planning + per-role model selection decisions.",
            },
            {
              signature: "verifier_result (if present)",
              description: "Critic agent's score + critique, if applicable.",
              returns: "Closes the loop for diffusion-of-responsibility detection.",
            },
          ],
        },
        {
          kind: "scenario_predict",
          label: "Which layer of eval would have caught this?",
          language: "text",
          scenario: `A user asks a research multi-agent system about "best LLM evaluation tools."
The final answer mostly discusses traditional ML model evaluation
(precision/recall/F1) instead of LLM-specific tools (Inspect, evals,
human preference benchmarks). The customer flags it.

You investigate. Lead's plan looks reasonable. All 4 sub-agents returned
high-quality summaries. The synthesis is grammatical and well-cited.`,
          question: "Which eval layer would have caught this, and what's the underlying failure?",
          answer: "Drift detection at layer 2 (per-role) would have caught it. The lead's planning step likely misinterpreted 'LLM evaluation' as 'ML model evaluation' (a single ambiguous token), generated sub-questions about traditional ML metrics, and the sub-agents faithfully answered the wrong sub-questions. End-to-end eval (layer 1) catches it eventually but only via human review of bad answers; restated_question logging would have caught it the first time and let you fix it before shipping.",
          explanation: "Drift in multi-agent typically originates at the planning step — one ambiguous interpretation early on cascades through every sub-agent. The mitigation is asymmetric: planning errors are cheap to catch (look at the plan) and devastating downstream. Always log the plan + restated question separately from the final answer.",
        },
        {
          kind: "warm_up",
          title: "The cheapest meaningful eval",
          prompt: `You have one week and limited resources to evaluate a customer's prototype multi-agent system before they ship. What's the single most valuable thing to build?`,
          answer: "A held-out set of 30-50 hand-curated tasks with reference answers, run end-to-end against the current system. Score answers manually (or with an LLM judge) for quality. This single artifact lets you measure regressions, compare model choices, and demo improvement to the customer.",
          explanation: "Per-role evals and full observability are valuable but take longer to build. The end-to-end held-out set is the foundation — without it you cannot tell whether changes help or hurt. Build the held-out set in week 1; layer in per-role and trace tooling as you go.",
        },
        {
          kind: "code_comparison",
          label: "Logging: minimal vs production",
          left: {
            title: "Minimal — won't survive a real bug report",
            code: `def orchestrate(q):
    plan = lead_plan(q)
    results = [sub_agent(s) for s in plan]
    return lead_synthesize(q, results)
# When user says "this answer is wrong," you have... the answer.`,
            annotation: "Zero observability. You'll spend a day reproducing each bug report from scratch.",
          },
          right: {
            title: "Production — every decision recoverable",
            code: `def orchestrate(q):
    run = Trace.start(user_question=q)
    plan = lead_plan(q); run.log("plan", plan)
    results = []
    for s in plan:
        with run.sub_agent(s) as sub:
            r = sub_agent(s, trace=sub)
            sub.log("envelope", r)
            results.append(r)
    synth = lead_synthesize(q, plan, results)
    run.log("synthesis", synth)
    run.log("cost", run.cost_total())
    run.finish()
    return synth`,
            annotation: "Every plan, sub-agent envelope, synthesis input, and cost is recoverable from the trace. When a user reports a bad answer, you load the run_id and see everything.",
          },
          takeaway: "Multi-agent without per-component tracing is operationally fragile. Build the trace store before you build the second sub-agent — retrofitting observability after launch is significantly more work.",
        },
        {
          kind: "flashcard",
          front: "Which eval layer detects which class of failure?",
          back: "**End-to-end (layer 1)**: 'wrong answer' (the most general; least diagnostic). **Per-role (layer 2)**: 'good components, bad system' or 'bad component, no other tells.' Catches sub-agent regressions, synthesis errors, planning drift. **System health (layer 3)**: cost/latency/turn anomalies — catches runaway, infinite loop, fan-out explosions before they hit users. Run all three; they catch non-overlapping problems.",
        },
      ],
    },
    // ─── Section 7: Interview drill ──────────────────────────────────────
    {
      title: "Interview drill: 'we want a multi-agent system'",
      blocks: [
        {
          kind: "prose",
          markdown: `## The customer conversation you'll actually have

A customer says: "We want to build a multi-agent system to do X." Your job is not to validate or reject the framing — it's to figure out what X actually needs and what shape best serves it. A useful conversation walks roughly this path:

1. **What's the task?** Get specific. What's the user input? What's the desired output?
2. **What's the variance?** Are the steps predictable, or do they depend on what the model finds along the way? (Workflow vs agent decision.)
3. **Can it fit in one context?** If yes — one agent. If no — you have a real multi-agent case.
4. **What are the sub-tasks, and are they independent?** Independent → star topology. Linear → pipeline. Truly emergent → start with star anyway, add complexity only when needed.
5. **What's the verification path?** How does the system know the answer is good? Tests? Critic agent? Human review?
6. **What's the cost ceiling and turn cap?** Per-task. Not optional.
7. **What does the trace look like when this goes wrong?** Forces them to commit to observability before launch.

If the customer can answer 1-4 crisply, you have a real project. If they can't, the right move is usually to design a much smaller v1 (often a workflow or single agent) and earn the right to scale up.`,
        },
        {
          kind: "mini_challenge",
          title: "Design exercise: 'autonomous research analyst'",
          prompt: `A customer says: "We want a multi-agent system that acts like a junior
research analyst. The user uploads a 200-page market research report.
The agent reads it, identifies the 3-5 most important findings, finds
3 supporting external sources for each, and writes a 1-page executive
brief with citations."

Design the system. Specifically:
1. Topology (star / pipeline / hybrid)?
2. Roles (orchestrator + which sub-agents + critic?)?
3. What goes in each role's prompt at a high level?
4. What's the verification step before returning to the user?
5. What guardrails and caps?
6. What would you instrument from day one?
7. What's your minimum-shippable v1?

Write your answer as a brief you'd send to the customer.`,
          hints: [
            "The task has two phases (extract findings; gather external support). Does star, pipeline, or hybrid model that better?",
            "The 200-page report has to be processed somewhere. Does the orchestrator read it? Or does a dedicated extractor?",
            "External source gathering is independent per finding. That's the obvious fan-out point.",
            "What's the verification? You can't test correctness, but you can check that every claim in the brief is supported by a returned source.",
          ],
          solution: `### Brief: Autonomous Research Analyst — Design

**1. Topology: pipeline + star hybrid.**
   - Stage 1 (pipeline step): a single Extractor agent reads the 200-page report and returns 3-5 candidate findings as a structured list.
   - Stage 2 (star fan-out): the Orchestrator dispatches one Investigator sub-agent per finding to find 3 supporting external sources.
   - Stage 3 (pipeline step): a Writer agent composes the executive brief from findings + external sources.
   - Stage 4 (pipeline step): a Critic agent verifies every claim in the brief is supported by a returned source.

**2. Roles:**
   - **Orchestrator (lead)**: routes the task through the four stages, owns the final output.
   - **Extractor sub-agent**: long-context Claude (Opus/Sonnet) — reads the report once, returns structured findings.
   - **Investigator sub-agents** (3-5 in parallel): each gets one finding + tools (web_search, web_fetch); returns structured \`{source_url, supporting_quote, fit_score}\` × 3.
   - **Writer sub-agent**: receives findings + supporting sources; produces 1-page brief in a strict template.
   - **Critic sub-agent**: receives final brief + structured sources; verifies every cited claim maps to a returned source; returns pass/fail + critique.

**3. Prompts at a high level:**
   - Extractor: "You are reading a market research report. Return the 3-5 most important findings, each as {claim, page_range, key_data}. Be conservative — only include findings that are central to the report's thesis."
   - Investigator: "You're given one finding. Find 3 independent, credible external sources that support, refute, or contextualize it. Return {url, quote, fit_score 1-5, source_credibility 1-5}."
   - Writer: "Compose a 1-page executive brief using only the provided findings and sources. Every claim must cite a source by id. Use the template: Headline → 3-5 findings (one paragraph each) → Implications → Sources."
   - Critic: "Check that every cited claim in the brief maps to a returned source. Return pass/fail and list any unsupported claims."

**4. Verification:**
   - Critic agent runs after Writer; if any claim fails verification, the brief is rejected and re-generated (max 2 re-tries).
   - Human review is the final gate before sending the brief externally — explicit, not optional.

**5. Guardrails and caps:**
   - Cost ceiling: $5 per task.
   - Fan-out width: max 5 investigators.
   - Per-investigator turn cap: 8 (search + read + maybe one re-search).
   - Writer retry cap: 2 after critic failure; on third failure, escalate to human with the critic's notes.
   - Total task turn cap: 50 across all agents.

**6. Instrumentation (day-one):**
   - Per-stage trace: extractor's findings list, each investigator's envelope, writer's draft, critic's verdict.
   - Per-task cost + latency + fan-out width.
   - Critic pass-rate as a primary quality metric (a healthy system should have 80%+ first-pass critic acceptance).
   - Drift detector: log the user's original ask alongside the extractor's findings; sample-check for relevance.

**7. Minimum-shippable v1:**
   - **In v1**: extractor → 3 investigators (fixed N) → writer → critic. Hard-coded fan-out width, no replanning, no recovery — fail upward to human on first critic rejection.
   - **Not in v1**: dynamic plan adjustment, custom source credibility scoring, multi-language support, evaluator-optimizer loops on the brief.
   - **Validate v1 on**: a 20-task held-out set with hand-graded reference briefs. Target: 80% critic-pass + 70% human-acceptable. Iterate before adding capability.

**Honest caveats to share with the customer:**
   - This will cost ~$2-5 per brief depending on the report's length.
   - The critic catches unsupported claims but cannot judge whether the *right* findings were extracted. That's still a human-review job.
   - 200-page input is on the edge of single-pass extraction; for longer reports, the extractor itself needs to fan out by section — that's a v2.`,
          takeaway: "Real multi-agent design isn't 'how many agents.' It's: pipeline where dependencies are linear, star where work is independent, named verifier role, hard caps and cost ceilings, observability from day one, and a minimum-shippable v1 that proves value before adding capability. If you can't explain each role's input/output contract in one sentence, you haven't designed the system yet.",
        },
        {
          kind: "scenario_predict",
          label: "The premature multi-agent",
          language: "text",
          scenario: `A customer says: "We want a multi-agent system with planner, executor,
critic, and verifier agents to write SQL queries against our warehouse
for natural-language questions."`,
          question: "Should you build this multi-agent? If not, what would you propose instead?",
          answer: "Almost certainly not multi-agent. Text-to-SQL is a well-bounded task that fits in a single context with the schema and a handful of examples. Propose: single agent with tools = [schema_lookup, run_sql_dry, run_sql_final, ask_clarifying_question]. Add evaluator-optimizer (generate → test on dry-run → revise on error) if quality demands it. Keep multi-agent in reserve for the day someone needs queries across 50 disjoint warehouses.",
          explanation: "The four-role framing (planner/executor/critic/verifier) is the most common form of premature multi-agent. It pattern-matches to 'sounds rigorous' without actually decomposing into independent sub-tasks. The diagnostic is to ask 'what context does the planner have that the executor doesn't?' If the answer is 'none,' you have one agent with four hats, and the right design is a single agent with the right tools.",
        },
        {
          kind: "multiple_choice",
          title: "The hardest design call",
          prompt: "A customer asks: 'When should we use multi-agent vs. a single agent with more tools?'",
          choices: [
            {
              text: "Multi-agent whenever the task is complex.",
              correct: false,
              rationale: "'Complex' isn't a design criterion. Many complex tasks fit in one agent with the right tools.",
            },
            {
              text: "Single agent unless you need parallel exploration, context partitioning, or specialized role prompts.",
              correct: true,
              rationale: "These are the three structural reasons multi-agent earns its overhead. Absent at least one of them, a single agent with the right tools is simpler, cheaper, easier to debug, and competitive on quality.",
            },
            {
              text: "Multi-agent whenever you need multiple tool calls.",
              correct: false,
              rationale: "Single agents make many tool calls all the time. Multi-agent is about partitioning *context*, not about having more tool calls.",
            },
            {
              text: "Always start with multi-agent; downsizing is easier than upgrading.",
              correct: false,
              rationale: "Backwards. Downsizing a deployed multi-agent system means rewriting orchestration, sub-agent contracts, observability — far more work than upgrading a single agent.",
            },
          ],
          explanation: "Anthropic's research write-up is explicit: multi-agent costs ~15× single-agent tokens. That ratio buys you parallel exploration, context partitioning, and role specialization. If you don't need at least one of those, you're paying 15× for nothing. Start single-agent; graduate to multi-agent when you can articulate which of the three structural benefits you're buying.",
        },
        {
          kind: "key_insight",
          label: "FDE checklist for any multi-agent customer ask",
          insight: `Before saying yes to a multi-agent build, get answers to these 8 questions:

1. **What's the user input?** (size, modality, variance)
2. **What's the desired output?** (format, length, structure)
3. **Can the task fit in one context?** If yes — push back on multi-agent.
4. **What are the sub-tasks, and are they independent?** (Drives star vs pipeline.)
5. **What's the verification path?** (Tests? Critic? Human review?)
6. **What's the per-task cost ceiling?** (Multi-agent without a ceiling is a billing incident waiting to happen.)
7. **What's the fan-out width cap?** (Cap the number of sub-agents per task.)
8. **What does observability look like?** (Per-role traces from day one — non-negotiable.)

If they can't answer 1-4, scope down to a workflow or single agent. If they can answer 1-4 but not 5-8, you have engineering work to do before launch, not after.`,
        },
        {
          kind: "flashcard",
          context: "The single most useful framing for a customer pushing for multi-agent.",
          front: "What sentence reliably reframes 'we want multi-agent' into a productive conversation?",
          back: "'Walk me through one specific task end-to-end — what does the user type, what should they see, and what would a human have to do to produce that?' This forces the customer to surface the dependency graph and the verification path. If their walkthrough is linear with clear handoffs, you'll find yourself in workflow or orchestrator-workers territory. If they say 'and then the system needs to investigate several different angles in parallel,' you've earned the right to propose multi-agent — and the customer has just told you the star topology to use.",
        },
      ],
    },
  ],
};
