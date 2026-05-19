import type { StudyGuide } from "../guide-types";

export const workflowVsAgentDecisionFrameworkGuide: StudyGuide = {
  topicTitle: "Workflow vs agent decision framework",
  topicSlug: "workflow-vs-agent-decision-framework",
  sections: [
    // ─── Section 1: Mental model & the decision framework ────────────────
    {
      title: "Mental model & the decision framework",
      blocks: [
        {
          kind: "prose",
          markdown: `## The terminology that anchors every customer conversation

Anthropic's *Building Effective Agents* essay defines two distinct things:

- **Workflow** — a system where LLMs and tools are orchestrated through **predefined code paths**. The control flow is yours; the LLM fills in the pieces.
- **Agent** — a system where the **LLM dynamically directs its own process and tool use**, deciding what to do next based on what just happened.

Both are forms of "agentic systems" in casual usage, but the distinction matters because workflows and agents have different failure modes, cost profiles, and engineering effort.

**The single most important sentence from the essay:**

> When building applications with LLMs, we recommend finding the simplest solution possible, and only increasing complexity when needed.

Agents are not the goal. The goal is solving the customer's problem with the lowest possible operational risk. Workflows almost always come first.`,
        },
        {
          kind: "key_insight",
          label: "Core decision rule",
          insight: `**Use a workflow** when the task decomposes into a known, finite set of steps. **Use an agent** when the steps cannot be predicted in advance and require model-driven judgement at each turn.

If you can sketch a flowchart in 5 minutes, you want a workflow. If your flowchart needs a loop labeled "until the model decides it's done," you want an agent — and you should pause to ask whether you really do.`,
        },
        {
          kind: "code_comparison",
          label: "Same task, two architectures",
          left: {
            title: "Workflow: classify → summarize → tag",
            code: `# Deterministic, three predictable LLM calls
def process_ticket(ticket: str) -> dict:
    category = classify(ticket)              # call 1
    summary  = summarize(ticket, category)   # call 2
    tags     = extract_tags(summary)         # call 3
    return {"category": category,
            "summary": summary,
            "tags": tags}`,
            annotation: "Latency ≈ 3× single call. Cost is bounded. Failures are localized to one stage.",
          },
          right: {
            title: "Agent: tool-using loop",
            code: `# Open-ended; model picks tools each turn
def process_ticket(ticket: str) -> dict:
    msgs = [{"role": "user", "content": ticket}]
    while True:
        r = client.messages.create(
            model="claude-opus-4-5",
            tools=[classify_t, summarize_t,
                   tag_t, search_kb_t, escalate_t],
            messages=msgs,
        )
        if r.stop_reason == "end_turn":
            return parse_final(r)
        msgs += handle_tools(r)  # loop`,
            annotation: "Unbounded turns. Latency and cost are emergent. Failure modes include tool thrashing and infinite loops.",
          },
          takeaway: "Same business outcome. Left is auditable, cheap, predictable. Right is flexible but opaque. Default to left unless you can articulate why the right side's flexibility is required.",
        },
        {
          kind: "method_ref",
          title: "The five canonical workflow patterns + agents",
          importLine: "# from \"Building Effective Agents\" — Anthropic, Dec 2024",
          methods: [
            {
              signature: "Prompt chaining",
              description: "Sequential LLM calls where each call's output feeds the next. Add gates between steps to fail fast.",
              returns: "Best for: structured pipelines (write → review → revise; outline → draft → polish).",
            },
            {
              signature: "Routing",
              description: "A classifier (LLM or model) sends the input down one of N branches, each optimized for its case.",
              returns: "Best for: heterogeneous inputs where one prompt would under-serve all of them (support triage, model selection).",
            },
            {
              signature: "Parallelization (sectioning)",
              description: "Split a task into independent subtasks, run them in parallel, aggregate.",
              returns: "Best for: independent dimensions of analysis (e.g. summary + sentiment + extract entities).",
            },
            {
              signature: "Parallelization (voting)",
              description: "Run the same prompt N times, aggregate (majority vote, threshold, mean).",
              returns: "Best for: classification tasks where false positives/negatives are asymmetric (content safety, code review).",
            },
            {
              signature: "Orchestrator-workers",
              description: "A central LLM dynamically plans subtasks and dispatches them to worker LLMs.",
              returns: "Best for: tasks whose subtasks aren't knowable upfront but bottom out in a finite set (multi-file refactors).",
            },
            {
              signature: "Evaluator-optimizer",
              description: "Generator LLM produces output; evaluator LLM critiques; loop until quality bar is hit.",
              returns: "Best for: tasks with clear, articulable quality criteria where iteration measurably helps (translation, search query refinement).",
            },
            {
              signature: "Agent",
              description: "LLM in a loop with tools and an environment; decides next action each turn until stopping criterion.",
              returns: "Best for: open-ended tasks where the number of steps is unpredictable (SWE agents, computer use, research).",
            },
          ],
        },
        {
          kind: "scenario_predict",
          label: "Picking the cheapest viable pattern",
          language: "text",
          scenario: `Customer ask: "Our support team gets 500 emails/day. We want each one
auto-tagged with a category (billing | technical | sales), a sentiment
(positive | neutral | negative), and the top 3 entities mentioned."`,
          question: "Which pattern, and why not an agent?",
          answer: "Parallelization by sectioning. Three independent prompts (category, sentiment, entities) fan out in parallel; results aggregate into one object. Latency = max of the three (not sum); cost = sum of three single calls; failure modes are isolated per dimension.",
          explanation: "The three dimensions don't depend on each other, so there's no reason to serialize them in a chain — and zero reason for an agent because the steps are fully knowable. An agent here would burn 3-5x the cost while introducing a loop that can fail in non-obvious ways.",
        },
        {
          kind: "multiple_choice",
          title: "When 'workflow' is actually wrong",
          prompt: "A customer wants an internal assistant that can answer arbitrary questions across their codebase, runbooks, and ticket history — and it should be able to actually update Jira tickets when asked. Which pattern fits best?",
          choices: [
            {
              text: "Prompt chaining: retrieve → answer → format",
              correct: false,
              rationale: "Works for pure Q&A, but the requirement to take actions in Jira (which the user may or may not ask for in any given turn) means the system needs to decide per-turn whether to act. Chaining can't model that.",
            },
            {
              text: "Routing: classify the request, send to retrieval branch or Jira branch",
              correct: false,
              rationale: "A reasonable second-best, but the request can involve both (e.g. 'find tickets like this one and reassign them') and routing into a single branch loses that composability.",
            },
            {
              text: "Agent: LLM in a loop with retrieval + Jira tools",
              correct: true,
              rationale: "The required behavior is open-ended (any question, sometimes acting, sometimes not) and the steps aren't predictable — this is the canonical agent shape.",
            },
            {
              text: "Evaluator-optimizer: generate answer, critique, iterate",
              correct: false,
              rationale: "There's no quality bar being optimized here. The user wants action, not better prose.",
            },
          ],
          explanation: "The decision is driven by: (1) actions are required, (2) when to act is decided per-turn by the model, (3) the inputs are open-ended. That's the agent shape. The right follow-up question for the customer is: 'What's the action allowlist, and what's the escalation path when the model isn't sure?'",
        },
        {
          kind: "flashcard",
          front: "Why does 'Building Effective Agents' say to bias toward workflows?",
          back: "Workflows trade flexibility for predictability — which is what production systems need. They have bounded cost, bounded latency, easy-to-localize failures, and reviewable control flow. Agents are appropriate when that flexibility is *required* by the task, not when it's merely *convenient* for the developer. Start with a workflow; escalate to an agent only when the workflow demonstrably can't handle the task's variability.",
        },
      ],
    },
    // ─── Section 1.5: Cost & latency math (runnable) ─────────────────────
    {
      title: "Cost & latency math you should do in your head",
      blocks: [
        {
          kind: "prose",
          markdown: `## Before you recommend a pattern, do the math

Customers don't decide between patterns on aesthetics — they decide on **cost per task, latency per task, and risk per task**. The escalation ladder from section 1 is also a *cost ladder*. Each rung up roughly multiplies the bill.

You should be able to ballpark these numbers without a spreadsheet. The runnable cell below is the calculator I keep in muscle memory — tweak the prices, token counts, and turn counts to match a real customer.`,
        },
        {
          kind: "code_predict",
          label: "Pattern cost calculator (tweak it and re-run)",
          code: `# USD per million tokens (Nov-2025 ballpark — check current pricing)
PRICES = {
    "haiku":  {"in": 0.80,  "out": 4.00},
    "sonnet": {"in": 3.00,  "out": 15.00},
    "opus":   {"in": 15.00, "out": 75.00},
}

def cost(model, in_tok, out_tok, n=1):
    p = PRICES[model]
    return n * (in_tok * p["in"] + out_tok * p["out"]) / 1_000_000

# Single Opus call: 2k in, 500 out
single  = cost("opus", 2000, 500)

# Prompt chain x3: each call sees prior output (~3k in 500 out)
chain   = cost("opus", 3000, 500, n=3)

# Sectioning x3: independent subtasks (~2k in 500 out each)
section = cost("opus", 2000, 500, n=3)

# Voting x7: same prompt 7 times
vote    = cost("opus", 2000, 500, n=7)

# Eval-opt: 3 rounds = 6 calls (gen + eval)
evalopt = cost("opus", 2500, 500, n=6)

# Agent: 15 turns, context grows -> avg 4k in / 400 out per turn
agent   = cost("opus", 4000, 400, n=15)

for name, c in [("single", single), ("chain x3", chain),
                ("section x3", section), ("vote x7", vote),
                ("eval-opt x3 rounds", evalopt),
                ("agent x15 turns", agent)]:
    print(f"{name:22s} \${c:.4f}")`,
          output: `single                 $0.0675
chain x3               $0.2475
section x3             $0.2025
vote x7                $0.4725
eval-opt x3 rounds     $0.4500
agent x15 turns        $1.3500`,
          explanation: `The numbers tell the story:
- **Chain** is roughly N× a single call because each step still pays input cost (and inputs grow as prior outputs are carried forward).
- **Sectioning** can be *cheaper* than a chain because each subtask sees only its own slice of input — same N output calls, but smaller inputs per call.
- **Voting** is N× a single call at constant input — predictable but pure ensemble overhead.
- **Eval-opt** is (gen + eval) × rounds — typically 2× a chain of the same length.
- **Agent** is the outlier: 15 turns at growing context can be 20× a single call. Hard caps are the only thing standing between a customer and a surprise invoice.

Try this: change \`"opus"\` to \`"sonnet"\` and re-run. The agent number drops from $1.35 to $0.27 — a 5× cost cut from one model swap. Routing is the pattern that lets you make this swap *per branch*.`,
          runnable: true,
        },
        {
          kind: "method_ref",
          title: "Latency math (sequential model, T = one LLM call)",
          importLine: "# Memorize these formulas — quote them in customer conversations",
          methods: [
            {
              signature: "Single prompt",
              description: "One call, one response.",
              returns: "Latency ≈ T. Cost ≈ 1 call.",
            },
            {
              signature: "Prompt chain (N steps)",
              description: "Sequential — each call waits for the prior.",
              returns: "Latency ≈ N × T. Cost ≈ N calls. Worst-case latency of the ladder for the same N.",
            },
            {
              signature: "Sectioning (N independent subtasks)",
              description: "Run in parallel via asyncio.gather or futures.",
              returns: "Latency ≈ max(T_i) ≈ T. Cost ≈ sum of N calls. Same cost as chain, ~N× lower latency.",
            },
            {
              signature: "Voting (N copies of same prompt)",
              description: "Parallel, aggregate.",
              returns: "Latency ≈ T (parallel). Cost ≈ N calls. Trade cost for reliability — never latency.",
            },
            {
              signature: "Orchestrator-workers",
              description: "Plan call + parallel worker calls + synthesis call.",
              returns: "Latency ≈ T_plan + max(T_worker) + T_synth ≈ 3T. Cost ≈ (1 + N_workers + 1) calls.",
            },
            {
              signature: "Evaluator-optimizer (R rounds)",
              description: "Gen + eval per round, sequential.",
              returns: "Latency ≈ 2R × T. Cost ≈ 2R calls. Aggressively cap R; benchmark plateau before shipping.",
            },
            {
              signature: "Agent (K turns)",
              description: "Sequential — each turn depends on the prior.",
              returns: "Latency ≈ K × T_turn, where T_turn grows with context. Cost unbounded without caps.",
            },
          ],
        },
        {
          kind: "scenario_predict",
          label: "Doing the math in a live customer call",
          language: "text",
          scenario: `A customer is choosing between two designs for a 10k tasks/day pipeline:
  Option A: Sonnet workflow — chain x3, each step ~3k in / 500 out
  Option B: Opus agent     — avg 12 turns, ~4k in / 400 out per turn

Pricing:
  Sonnet: $3 / Mtok input,  $15 / Mtok output
  Opus:   $15 / Mtok input, $75 / Mtok output`,
          question: "What's the daily cost difference, and which would you pilot first?",
          answer: "Option A per-task: 3 × (3000×3 + 500×15)/1e6 = 3 × 0.0165 = $0.0495. At 10k/day ≈ $495/day. Option B per-task: 12 × (4000×15 + 400×75)/1e6 = 12 × 0.090 = $1.08. At 10k/day ≈ $10,800/day. Option B is ~22× more expensive. Pilot Option A first; only escalate the *subset* of tasks where the chain demonstrably fails.",
          explanation: "Customers often skip this math because per-call cost looks negligible. At any meaningful scale it isn't. A 22× cost difference is the kind of number that decides whether a project ships. FDEs who do this math in real-time during the customer call save weeks of bad scoping.",
        },
        {
          kind: "flashcard",
          front: "Order the patterns from cheapest to most expensive per task (assume the same model).",
          back: "single < chain ≈ sectioning < orchestrator-workers < voting < eval-opt < agent. Cost scales with the number of LLM calls per task. Workflows have a fixed call count; agents have an unbounded one. Quoting this order in a customer conversation forces them to articulate why the extra cost is worth it.",
        },
        {
          kind: "warm_up",
          title: "Same task, three patterns — which latency wins?",
          prompt: "You have three independent analyses (4 seconds each) to run on the same document. Compare end-to-end latency for: (a) prompt-chain of 3, (b) sectioning x3, (c) voting on one analysis with N=3.",
          answer: "(a) Chain: 12s (sum). (b) Section: 4s (max). (c) Voting: 4s — but only runs one of the three analyses with 3 attempts at it, not the same task as (a) or (b).",
          explanation: "Voting is structurally different: it runs the *same* prompt N times to reduce variance, not N different prompts to cover N dimensions. Confusing these two is the most common pattern-naming mistake in interviews.",
        },
      ],
    },
    // ─── Section 2: Prompt chaining ───────────────────────────────────────
    {
      title: "Pattern 1 — Prompt chaining",
      blocks: [
        {
          kind: "prose",
          markdown: `## Prompt chaining

A prompt chain decomposes a task into a fixed sequence of LLM calls, where each call's output is the next call's input. Between calls you can insert **gates** — code that validates the intermediate output and short-circuits the chain if something looks wrong.

**Use it when:** the task naturally decomposes into known steps that build on each other.

**Signature shapes:**
- outline → draft → polish
- generate marketing copy → translate → check tone
- extract claims from doc → verify each against source → produce report

**Trade you're making:** higher latency (N sequential calls) for higher accuracy on each step. Each individual call is easier to prompt because it has one job.

**The gate idea is what makes chains robust.** Without gates a chain is a "long prompt with extra steps." With gates, you fail fast and route around bad intermediate outputs.`,
        },
        {
          kind: "code_comparison",
          label: "Naive chain vs gated chain",
          left: {
            title: "No gate — failures propagate",
            code: `def write_outline_post(topic: str) -> str:
    outline = llm(f"Outline a blog post on {topic}")
    draft   = llm(f"Write a draft from this outline:\\n{outline}")
    polish  = llm(f"Polish this draft for clarity:\\n{draft}")
    return polish

# If outline misunderstands the topic, draft amplifies the error,
# polish makes it pretty. You ship a confidently wrong post.`,
            annotation: "Three calls, no checkpoints. A bad outline silently becomes a polished bad post.",
          },
          right: {
            title: "Gated chain — fail fast",
            code: `def write_outline_post(topic: str) -> str:
    outline = llm(f"Outline a blog post on {topic}")
    if not outline_covers_topic(topic, outline):       # gate 1
        outline = llm(f"Revise this outline to cover {topic}:\\n{outline}")
    draft = llm(f"Write a draft from this outline:\\n{outline}")
    if word_count(draft) < 500:                        # gate 2
        raise ValueError("Draft too short — likely truncated")
    polish = llm(f"Polish this draft:\\n{draft}")
    return polish`,
            annotation: "Each gate is cheap (often a deterministic check or a small classifier call). The chain refuses to ship garbage.",
          },
          takeaway: "Gates are the difference between a 'demo chain' and a 'production chain.' Add a gate after every stage whose failure would be expensive to detect downstream.",
        },
        {
          kind: "scenario_predict",
          label: "When does a chain beat a single fat prompt?",
          language: "text",
          scenario: `A team is generating product launch emails. They tried one big prompt:
"Write a launch email for {product} aimed at {audience} with tone {tone}
and a CTA to {url}." Results vary wildly in length, tone, and CTA placement.

They want consistent output.`,
          question: "What chain structure improves consistency, and which step is the gate?",
          answer: "Three-step chain: (1) generate structured outline (sections + word budget + CTA placement) → (2) gate: validate JSON outline conforms to schema → (3) generate email from the validated outline. The structured intermediate forces the model to commit to length and CTA placement before generating prose.",
          explanation: "Single fat prompts let the model trade dimensions against each other (skip the CTA to keep length, drop the tone to hit a structural requirement). Chaining with a structured intermediate forces commitment, and the JSON gate catches malformed structures before they become bad emails. This is the most common 'why does chaining help us' answer in practice.",
        },
        {
          kind: "warm_up",
          title: "Identify the gate",
          prompt: `In a 'translate this doc → check accuracy → re-translate problem sentences' chain, where does the gate go and what does it return?`,
          answer: "Between step 2 (check) and step 3 (re-translate). It returns the list of sentence IDs that failed the accuracy check; if the list is empty, step 3 is skipped entirely.",
          explanation: "Good gates do two things: (1) decide whether to continue, (2) pass forward only the work that needs to be done. A gate that returns just `pass/fail` wastes information — pass forward the diff or the failure list when you can.",
        },
        {
          kind: "flashcard",
          front: "Cost profile of a prompt chain with N steps?",
          back: "Cost ≈ sum of N independent calls. Latency ≈ sum of N call latencies (sequential). Cheapest control-flow pattern after a single prompt. Compare to parallelization (cost N, latency 1) and agents (cost and latency both unbounded). The win of chaining over one fat prompt is reliability and prompt simplicity, not cost.",
        },
      ],
    },
    // ─── Section 3: Routing ───────────────────────────────────────────────
    {
      title: "Pattern 2 — Routing",
      blocks: [
        {
          kind: "prose",
          markdown: `## Routing

A router classifies the input and dispatches it to one of N specialized downstream handlers. Each handler can have its own prompt, model, tools, and even cost tier.

**Use it when:** your inputs are heterogeneous and a single prompt would force ugly compromises across all of them.

**Two classic deployments:**

1. **Quality routing** — easy queries go to a small fast model; hard queries go to a frontier model. Saves cost without hurting tail-latency-bound quality.
2. **Domain routing** — billing questions go to the billing prompt with billing tools; technical questions go to the technical prompt with debugging tools. Each prompt stays focused.

**The router itself is usually one of:**
- A small classifier model (cheapest, fastest, retrainable)
- A small LLM with a classification prompt (flexible, no training needed, more expensive than ML model)
- Deterministic rules with an LLM fallback for the unclassified

Routers are easier to evaluate than monolithic prompts because you can measure routing accuracy separately from handler quality.`,
        },
        {
          kind: "method_ref",
          title: "Router design checklist",
          importLine: "# Pre-flight before you ship a router",
          methods: [
            {
              signature: "Define exhaustive categories",
              description: "Every plausible input must hit a category. Include 'other' as a default.",
              returns: "Without this, ambiguous inputs silently fall into whichever bucket the router happened to lean.",
            },
            {
              signature: "Measure routing accuracy in isolation",
              description: "Hand-label ~200 inputs; compute confusion matrix per category.",
              returns: "If routing accuracy is 80%, 20% of users are getting the wrong prompt and you'll blame the wrong handler.",
            },
            {
              signature: "Decide the misroute policy",
              description: "Confidence threshold + fallback. Below threshold → go to a generalist handler or escalate.",
              returns: "Confident misroutes are worse than diffident correct routes. Calibrate.",
            },
            {
              signature: "Keep the router small",
              description: "If your router prompt is longer than any handler prompt, you're doing routing wrong.",
              returns: "Routers should answer one question: 'which bucket?' Anything more belongs in the handler.",
            },
            {
              signature: "Audit routing trends",
              description: "Log every routing decision with the input snippet. Weekly review.",
              returns: "New categories show up as patterns in 'other.' This is the most common way to discover model drift in production.",
            },
          ],
        },
        {
          kind: "code_comparison",
          label: "Monolithic prompt vs router",
          left: {
            title: "One big prompt to rule them all",
            code: `SYSTEM = """You are a support assistant. If the user asks about
billing, look up their invoice. If they have a technical issue,
suggest troubleshooting steps. If they want to upgrade, route them
to sales. Always be polite. Never share other customers' info..."""

resp = llm(system=SYSTEM, messages=[{"role":"user", "content":q}])`,
            annotation: "All instructions compete for attention. Tone instructions weaken when the model is focused on tool selection. Token cost is constant across every query type.",
          },
          right: {
            title: "Route to specialists",
            code: `category = router(q)   # "billing" | "technical" | "sales" | "other"

handlers = {
  "billing":   billing_handler,   # has invoice lookup tool, billing prompt
  "technical": tech_handler,      # has KB search, troubleshooting prompt
  "sales":     sales_handler,     # routes to human + capture intent
  "other":     fallback_handler,  # safe generalist
}
resp = handlers[category](q)`,
            annotation: "Each handler is small, focused, evaluable. Adding a new category means adding a handler — no risk of breaking existing branches.",
          },
          takeaway: "Routing trades a single deployment artifact for N+1 (router + N handlers). The win is per-handler optimization: you can run technical on Sonnet, billing on Haiku, and sales as a deterministic webhook. Monolithic prompts can't do this.",
        },
        {
          kind: "scenario_predict",
          label: "Cost routing vs domain routing",
          language: "text",
          scenario: `A team has a chatbot answering 200k queries/day on Opus and wants
to cut cost. Their analytics show:
  - 70% of queries are FAQ-style (resolvable from a doc)
  - 20% are personalized account questions
  - 10% are complex multi-step troubleshooting`,
          question: "What router would you propose and where do the savings come from?",
          answer: "Tier-routing: classifier sends FAQ to Haiku-with-RAG, personalized to Sonnet-with-account-tools, troubleshooting stays on Opus. Savings come from the 70% that no longer touches Opus. Risk: misclassifying troubleshooting as FAQ would degrade quality, so set the classifier threshold to be conservative on 'FAQ' and let borderline cases escalate.",
          explanation: "This is the most common cost-cut FDEs propose. Quantify it: at typical token volumes, moving 70% of traffic from Opus to Haiku saves >80% of the cost of those queries. Validate with a shadow eval: route normally but score both Opus and the routed-tier output on a held-out set to measure quality delta before flipping the switch.",
        },
        {
          kind: "multiple_choice",
          title: "When routing is wrong",
          prompt: "A customer's user asks 'Find tickets like mine and email the assignee a status update.' The system uses a router with branches: knowledge_base, ticket_lookup, email. What goes wrong?",
          choices: [
            {
              text: "Nothing — route to email since that's the final action",
              correct: false,
              rationale: "Routing to one branch loses the prior steps (find similar tickets, look them up). The user wouldn't get the right output.",
            },
            {
              text: "The router picks one branch but the task needs three actions in sequence — routing is the wrong pattern",
              correct: true,
              rationale: "Routing dispatches to a single branch. This task needs multi-step composition with per-turn decisions about which tool to use — that's an agent, not a router.",
            },
            {
              text: "Add a 'multi_step' branch that does all three",
              correct: false,
              rationale: "That branch would itself need to be a chain or agent, so you've just moved the problem. The right call is to recognize you've outgrown routing.",
            },
            {
              text: "Run all three branches in parallel and merge results",
              correct: false,
              rationale: "Email shouldn't be sent until ticket lookup completes — they're not independent. Parallelization is wrong here too.",
            },
          ],
          explanation: "Routing works when one input maps to one handler. The moment one input needs orchestrated multi-step action with per-turn decisions, you're either back to chaining (if steps are predictable) or escalating to an agent (if they're not). This is the most common 'I thought routing would work and it doesn't' failure mode.",
        },
        {
          kind: "flashcard",
          context: "A customer asks: 'Should the router itself be an LLM or a classifier model?'",
          front: "When do you pick a small classifier model over an LLM router?",
          back: "Pick a trained classifier when: (1) you have labeled data (>1k examples), (2) categories are stable, (3) you need <50ms latency or <0.1¢ per route. Pick an LLM router when: (1) you're prototyping or categories will evolve, (2) you need to handle ambiguous inputs with rationales, (3) cold-start with zero labels. Most teams ship LLM routers first, log decisions for 4-8 weeks, then graduate to a fine-tuned classifier once categories stabilize.",
        },
      ],
    },
    // ─── Section 4: Parallelization ──────────────────────────────────────
    {
      title: "Pattern 3 — Parallelization (sectioning + voting)",
      blocks: [
        {
          kind: "prose",
          markdown: `## Parallelization

Two distinct flavors share a pattern name:

### Sectioning
Break the task into **independent subtasks** that can run concurrently. Aggregate their outputs.
- Code review: lint check + security check + style check, in parallel.
- Document analysis: extract entities + extract sentiment + extract summary, in parallel.

The win is **wall-clock latency** — you pay N× the cost but only 1× the latency.

### Voting
Run the **same prompt N times** with different seeds (or slight wording variations), aggregate. Use cases:
- Classification with asymmetric errors (one wrong answer can pass if 4/5 say "safe").
- High-stakes decisions where you want a confidence band.
- Self-consistency on math/reasoning problems.

The win is **error reduction** — you pay N× the cost for higher reliability.

**Don't confuse the two.** Sectioning splits *the task*; voting splits *uncertainty over the same task*.`,
        },
        {
          kind: "code_comparison",
          label: "Sectioning vs voting",
          left: {
            title: "Sectioning — independent subtasks",
            code: `async def analyze_review(text: str) -> dict:
    results = await asyncio.gather(
        extract_topics(text),     # call A
        score_sentiment(text),    # call B
        detect_pii(text),         # call C
    )
    topics, sentiment, pii = results
    return {"topics": topics,
            "sentiment": sentiment,
            "has_pii": pii}`,
            annotation: "Three different prompts, run in parallel. Latency = max(A, B, C). Cost = sum.",
          },
          right: {
            title: "Voting — same prompt, N times",
            code: `async def is_unsafe(text: str) -> bool:
    votes = await asyncio.gather(*[
        safety_check(text, seed=i) for i in range(5)
    ])
    # Conservative: flag if any 2+ of 5 say unsafe
    return sum(votes) >= 2`,
            annotation: "Same prompt 5×. Threshold encodes asymmetric error tolerance (false negatives are worse than false positives).",
          },
          takeaway: "Sectioning is for breadth; voting is for depth. In production you'll see them combined: section into subtasks, then vote within the high-stakes subtasks.",
        },
        {
          kind: "scenario_predict",
          label: "Voting threshold design",
          language: "text",
          scenario: `Content safety reviewer with 7-vote majority. Each individual call
has accuracy 92% (8% error rate, evenly split between false-pos and
false-neg). The product is "filter user-generated images for NSFW."
False negatives are *much* worse than false positives.`,
          question: "Should the threshold be 4-of-7 (majority), 2-of-7 (conservative), or 6-of-7 (lenient)? Why?",
          answer: "2-of-7. False negatives (letting NSFW through) cause real harm; false positives (flagging benign content) cause user friction but are recoverable via review. Lowering the threshold trades precision for recall, which matches the asymmetric cost.",
          explanation: "This is the core voting design question and it always comes down to: what's the cost asymmetry? Symmetric → majority. Bad to miss → low threshold. Bad to false-flag → high threshold. Anthropic's content evals follow this pattern (and we publish the threshold logic so customers can adapt it to their own risk tolerance).",
        },
        {
          kind: "warm_up",
          title: "Sectioning vs chain — which is faster?",
          prompt: `You have three independent analyses to run on a doc, each taking 4 seconds. Sectioning vs prompt-chaining the three steps — what's the latency for each?`,
          answer: "Chain: 12 seconds (sum). Section: 4 seconds (max). Sectioning is 3x faster end-to-end at the same cost.",
          explanation: "If subtasks are truly independent (output of one is not input of another), sectioning is strictly better than chaining on latency for the same token cost. Default to sectioning whenever the dependency graph allows it.",
        },
        {
          kind: "method_ref",
          title: "Aggregation strategies for voting",
          importLine: "# How to combine N votes",
          methods: [
            {
              signature: "Majority vote",
              description: "Output is whatever ≥ ⌈N/2⌉ votes say.",
              returns: "Good default for symmetric-cost classification.",
            },
            {
              signature: "Threshold vote",
              description: "Output = 'flagged' if ≥ k votes say flagged, where k < N/2.",
              returns: "Good when false negatives are much costlier than false positives.",
            },
            {
              signature: "Unanimous vote",
              description: "Output = 'allow' only if all N votes agree.",
              returns: "Good when false positives are catastrophic and you can afford to escalate ties to a human.",
            },
            {
              signature: "Confidence-weighted aggregation",
              description: "Each vote returns (class, confidence). Sum confidences per class; argmax wins.",
              returns: "Best when the model is well-calibrated and you want soft consensus.",
            },
            {
              signature: "Self-consistency",
              description: "For free-form reasoning: run N times, extract the final answer from each, take the modal answer.",
              returns: "Works on math/logic tasks where intermediate reasoning varies but the final answer is unique.",
            },
          ],
        },
        {
          kind: "flashcard",
          front: "When is parallelization *worse* than chaining?",
          back: "When steps are dependent. If step B needs step A's output, parallelizing them is impossible without speculating. Also when the subtasks share so much context that you're paying input-token cost N times — at that point chaining (or one fat prompt) can be cheaper. Cost math: parallel N calls = N×input_tokens + N×output_tokens. Chain = sum of (per-call input × per-call output). If each parallel call carries the full document as input, you've N-multiplied input cost.",
        },
      ],
    },
    // ─── Section 5: Orchestrator-workers ─────────────────────────────────
    {
      title: "Pattern 4 — Orchestrator-workers",
      blocks: [
        {
          kind: "prose",
          markdown: `## Orchestrator-workers

A central LLM (the **orchestrator**) inspects the input, **dynamically plans** a list of subtasks, dispatches them to **worker LLMs**, and synthesizes their outputs.

**This is where workflows start looking agent-shaped, but they aren't quite.** The orchestrator decides *what* the subtasks are — but each subtask is a single LLM call with no further branching. The control flow is one level deep.

**Use it when:** the subtasks aren't knowable until you read the input, but once you read it they fall out into a bounded list.

**Canonical examples:**
- Multi-file code refactor: orchestrator reads the diff plan, dispatches per-file refactors to workers in parallel, merges.
- Research question: orchestrator decomposes the question into sub-queries, workers retrieve and synthesize, orchestrator composes the final answer.
- Document QA over a long doc: orchestrator chunks and routes; workers answer per chunk; orchestrator aggregates.

**Why not just call it an agent?** Agents loop until the model says "done." Orchestrator-workers do one pass of plan → dispatch → synthesize. The orchestrator doesn't get to revise its plan based on worker output (or if it does, you've graduated to an agent).`,
        },
        {
          kind: "code_comparison",
          label: "Static parallelization vs orchestrator-workers",
          left: {
            title: "Static — same N tasks every time",
            code: `async def review_pr(diff: str) -> dict:
    return await asyncio.gather(
        lint_check(diff),
        security_check(diff),
        style_check(diff),
    )`,
            annotation: "Number and identity of tasks is fixed at code time.",
          },
          right: {
            title: "Orchestrator-workers — N decided by orchestrator",
            code: `async def review_pr(diff: str) -> dict:
    plan = await orchestrator(diff)
    # plan = [{"file": "auth.py",   "concern": "security"},
    #         {"file": "ui/menu.js","concern": "style"},
    #         {"file": "tests/...", "concern": "coverage"}]
    results = await asyncio.gather(*[
        worker(p["file"], p["concern"]) for p in plan
    ])
    return await synthesize(diff, plan, results)`,
            annotation: "Each diff produces a different list of (file, concern) work units. Orchestrator decides per input.",
          },
          takeaway: "Orchestrator-workers is parallelization with a planning step. The control flow depth is fixed (always 1 level of dispatch) but the *width* is input-dependent. This lets you handle variable-shaped inputs without resorting to a full agent loop.",
        },
        {
          kind: "scenario_predict",
          label: "Will the orchestrator drift?",
          language: "text",
          scenario: `A customer is building an orchestrator-workers system for legal
contract review. The orchestrator reads a contract and produces a
plan like [{"clause": "indemnity", "check": "carve-outs match policy"},
{"clause": "termination", "check": "notice period >= 30 days"}, ...].
Workers answer each item. Orchestrator synthesizes a report.

Three months in, accuracy drops. What's the most likely culprit?`,
          question: "What investigation order would you suggest?",
          answer: "First: audit the orchestrator's plans on a recent batch — is it skipping clauses it used to flag? Plan drift is the most common failure of orchestrator-workers because nothing forces the plan to be exhaustive. Second: check worker prompts for prompt-drift if contract template changed. Third: check the synthesizer if the report quality degraded but per-item accuracy is fine.",
          explanation: "The non-obvious failure mode of orchestrator-workers is *silent plan incompleteness*: the orchestrator generates a shorter plan than it should, and downstream metrics (worker accuracy, synthesis quality) all look fine on the items that were planned. Mitigation: log plan length distribution; alert on shifts. Or constrain the orchestrator to a known schema (must produce plans for every clause type present).",
        },
        {
          kind: "warm_up",
          title: "Depth check",
          prompt: `How many levels of LLM-controlled decision-making are in an orchestrator-workers system (excluding the workers themselves)?`,
          answer: "One. The orchestrator decides the plan; workers execute it without further branching. If a worker spawns its own sub-workers, you're recursive and approaching agent territory.",
          explanation: "The depth constraint is what keeps this pattern a workflow. If you let workers re-call the orchestrator with revisions, you've built an agent. Most production deployments deliberately cap depth to 1 to keep cost and latency bounded.",
        },
        {
          kind: "multiple_choice",
          title: "Orchestrator-workers vs agent",
          prompt: "A customer says: 'Our orchestrator currently makes a plan, dispatches workers, gets results, and sometimes the synthesizer realizes the plan was wrong, so we feed everything back into the orchestrator for a revision. We do this up to 3 times.' What pattern are they actually running?",
          choices: [
            {
              text: "Orchestrator-workers, with retries",
              correct: false,
              rationale: "Retries imply the same plan re-executes. They're describing replanning based on results, which is different.",
            },
            {
              text: "An agent with hard turn cap of 3",
              correct: true,
              rationale: "The model is now deciding, based on outcomes, whether to act again — that's an agent loop. Bounding to 3 turns makes it a *bounded* agent, not a workflow.",
            },
            {
              text: "Evaluator-optimizer",
              correct: false,
              rationale: "Eval-opt has a separate evaluator critiquing one artifact. They have the orchestrator itself replanning, not a critic.",
            },
            {
              text: "Prompt chain of length 3",
              correct: false,
              rationale: "Chain implies fixed sequence. Their system terminates early when the plan is right — that's dynamic, not chained.",
            },
          ],
          explanation: "The moment an LLM gets to decide 'do I do another round' based on prior output, you've crossed into agent territory. That's not bad — bounded agents are a sensible design — but call it what it is, because the failure modes (loops, drift, cost overrun) are agent failure modes. Engineering a 'bounded agent' is meaningfully different from engineering an 'unbounded workflow.'",
        },
        {
          kind: "flashcard",
          front: "What separates orchestrator-workers from a multi-agent system?",
          back: "Orchestrator-workers: one orchestrator plans, workers execute one task each and return. The orchestrator decides *what* to do; workers don't talk to each other and don't decide anything beyond their single subtask. Multi-agent: agents have their own state, can communicate, and can decide to act repeatedly. Orchestrator-workers is bounded (one plan, parallel dispatch, one synthesis); multi-agent is open-ended. Most 'multi-agent' designs in customer pitches are actually orchestrator-workers and would benefit from being labeled accurately.",
        },
      ],
    },
    // ─── Section 6: Evaluator-optimizer ──────────────────────────────────
    {
      title: "Pattern 5 — Evaluator-optimizer",
      blocks: [
        {
          kind: "prose",
          markdown: `## Evaluator-optimizer

Two LLMs in a loop: a **generator** produces output, an **evaluator** critiques it, the generator revises, until the evaluator approves or a turn cap is reached.

**Use it when:**
1. There's a clear, articulable quality criterion (not vibes).
2. Iteration measurably improves quality on your benchmark.
3. The cost of an extra round (one generator call + one evaluator call) is worth it.

**If you can't write down what 'good' means, evaluator-optimizer won't help.** The evaluator needs to score something specific.

**Canonical examples:**
- Translation: evaluator checks fidelity to source + idiom fluency; generator revises problem sentences.
- Search query refinement: evaluator decides whether results answer the user's question; generator revises the query.
- Code generation against a test suite: evaluator = test runner; generator revises code to pass.

**Key design choice:** is the evaluator another LLM, or is it deterministic (test suite, schema validator, structural check)? Prefer deterministic when possible — it's free, fast, and infallible against the criteria it encodes.`,
        },
        {
          kind: "code_comparison",
          label: "Single-shot vs evaluator-optimizer",
          left: {
            title: "Single-shot generation",
            code: `def translate(text: str, target_lang: str) -> str:
    return llm(f"Translate to {target_lang}:\\n{text}")

# Ship whatever comes back. If it's awkward, you only know when
# a customer complains.`,
            annotation: "One call. No quality check. Good enough for low-stakes content.",
          },
          right: {
            title: "Evaluator-optimizer loop",
            code: `def translate(text: str, target_lang: str, max_rounds: int = 3) -> str:
    translation = llm(f"Translate to {target_lang}:\\n{text}")
    for _ in range(max_rounds):
        critique = llm(
            f"Score this translation 1-5 on fidelity and fluency. "
            f"List specific issues.\\n"
            f"Source: {text}\\nTranslation: {translation}"
        )
        if "5/5" in critique or "no issues" in critique:
            return translation
        translation = llm(
            f"Revise this translation to address these issues:\\n"
            f"{critique}\\nCurrent: {translation}"
        )
    return translation`,
            annotation: "Each iteration costs 2× a single-shot. Caps loop at 3 rounds to bound cost.",
          },
          takeaway: "Worth the 2-4× cost only when (a) quality matters more than cost, (b) iteration demonstrably helps your eval. Validate the 'demonstrably helps' part before deploying — many tasks plateau after round 1.",
        },
        {
          kind: "scenario_predict",
          label: "When iteration plateaus",
          language: "text",
          scenario: `Team builds an evaluator-optimizer for marketing copy. They run an
A/B with 1/2/3/4 rounds and measure human-rated quality:
  1 round:  3.4 / 5
  2 rounds: 4.1 / 5
  3 rounds: 4.2 / 5
  4 rounds: 4.2 / 5`,
          question: "What's the right turn cap and what's the implicit signal in the curve?",
          answer: "Cap at 2 rounds. The marginal gain from 2→3 is 0.1 (within noise); 3→4 is zero. You're paying 2× cost for nothing past round 2. Set cap at 2 and exit early if the evaluator says 'approved' on round 1.",
          explanation: "Always run this curve before shipping evaluator-optimizer. The expected shape is rapid improvement then plateau. The plateau point is your turn cap. If you don't see a plateau within 4 rounds, the evaluator probably isn't critiquing the right things — the generator is changing the output but not addressing root issues.",
        },
        {
          kind: "method_ref",
          title: "Evaluator design checklist",
          importLine: "# Before you ship eval-opt",
          methods: [
            {
              signature: "Articulate the rubric",
              description: "Write down the 3-5 dimensions the evaluator checks (fidelity, fluency, tone, length, format).",
              returns: "If you can't list them, the evaluator will critique vibes and the generator will chase noise.",
            },
            {
              signature: "Prefer deterministic evaluators",
              description: "Schema check, regex, test suite, length check — use these before reaching for an LLM evaluator.",
              returns: "Deterministic checks are free, fast, and never disagree with themselves on the same input.",
            },
            {
              signature: "Make evaluator output actionable",
              description: "Evaluator must produce a critique the generator can act on (specific issues, not just a score).",
              returns: "A score alone tells the generator 'do better' — that's not enough information to improve.",
            },
            {
              signature: "Hard cap rounds",
              description: "Always set a max-rounds parameter; surface remaining_rounds in logs.",
              returns: "Without a cap, edge-case inputs can loop indefinitely (model and evaluator disagree forever).",
            },
            {
              signature: "Independence between gen and eval",
              description: "Use different prompts; consider different models. The evaluator must not share blind spots with the generator.",
              returns: "Same prompt for both = both miss the same things. Use a stronger model for eval if you can afford it.",
            },
          ],
        },
        {
          kind: "warm_up",
          title: "When eval-opt is the wrong call",
          prompt: `A team wants to use evaluator-optimizer to "make our chatbot responses sound more on-brand." There's no rubric, just "what the CMO would like." Why is this likely to fail?`,
          answer: "No articulable rubric, no measurable criterion, evaluator will chase moving targets. Without 'good' defined, the loop optimizes noise — and worse, the evaluator may converge on style tics the CMO didn't actually mean.",
          explanation: "Eval-opt requires a writable rubric. 'On-brand' isn't one until someone writes it down as 5 concrete checks. The right move here is: (1) interview the CMO, (2) extract concrete rules ('always lead with the user benefit, never use 'leverage' as a verb, sentences under 22 words'), (3) deploy those as a *deterministic* evaluator. Then eval-opt becomes useful.",
        },
        {
          kind: "flashcard",
          front: "Evaluator-optimizer vs agent — what's the structural difference?",
          back: "Eval-opt is a *fixed shape*: generator → evaluator → generator → evaluator, terminating on approval or cap. Both roles are pre-defined; the generator can't decide to call a tool, search the web, or escalate. Agents have one LLM with full tool access deciding what to do each turn. Eval-opt is a workflow because the control flow is fixed; agents are agents because the control flow is emergent. Use eval-opt when you know the loop shape; use agents when you don't.",
        },
      ],
    },
    // ─── Section 7: Agents + the interview drill ────────────────────────
    {
      title: "Pattern 6 — Agents, plus the interview drill",
      blocks: [
        {
          kind: "prose",
          markdown: `## Agents

Agents are LLMs operating in a **loop with tools and an environment**. Each turn:
1. Model receives the current state (messages, prior tool outputs).
2. Model decides: respond to user (end turn) *or* call a tool.
3. Tool runs; output appended to messages.
4. Loop.

The loop terminates when the model emits an end-turn message, hits a turn cap, or trips a guardrail.

**When to use:**
- The task is open-ended and the steps aren't knowable in advance.
- The model needs to react to observations from the environment (file contents, API responses, user replies).
- You have well-designed tools and a way to verify outcomes.

**When to think twice:**
- The task decomposes into < 5 known steps → use a workflow.
- You can't articulate "what does success look like" → you'll never know when the agent is done.
- Tool failures cascade silently → agent will spin and burn tokens.

**Cost discipline for agents:**
- Hard cap on turns (10-50 typical; lower for short tasks).
- Cap on tool calls per turn (often 1).
- Cost ceiling per task (kill the run if you cross it).
- Logging that lets a human reconstruct *why* the agent did each thing.

**The honest case for agents:** they shine when their flexibility is *load-bearing* — SWE agents that adapt to unfamiliar codebases, research agents that follow unexpected leads, computer-use agents that handle UI changes. They're overkill when a workflow would do.`,
        },
        {
          kind: "method_ref",
          title: "Agent design checklist",
          importLine: "# Hardening checklist before shipping an agent",
          methods: [
            {
              signature: "Hard turn cap",
              description: "Stop after N turns even if model hasn't said end_turn. N typically 10-50.",
              returns: "Without a cap, edge cases can produce hour-long loops. This is the single most important guardrail.",
            },
            {
              signature: "Tool allow-list",
              description: "Tools are explicitly listed per agent role. No 'eval' or shell access unless absolutely required.",
              returns: "Limits blast radius. An agent can only misbehave with tools it has.",
            },
            {
              signature: "Cost ceiling",
              description: "Track tokens spent per task; abort if it exceeds budget.",
              returns: "Catches runaway loops and inputs that don't fit the agent's capabilities.",
            },
            {
              signature: "Tool result truncation",
              description: "Long tool outputs (search results, file reads) are summarized or truncated before being fed back.",
              returns: "Prevents context bloat — the leading cause of agent quality degradation over long runs.",
            },
            {
              signature: "Verification step",
              description: "Before final output, a separate check runs (tests pass, schema valid, human review).",
              returns: "Agents can confidently complete tasks they got wrong. The verification step catches this without burdening the agent's prompt.",
            },
            {
              signature: "Reversibility",
              description: "Destructive actions (file deletes, money movement, emails) go through human approval or are reversible.",
              returns: "Even good agents misjudge. Make their wrong actions cheap to undo.",
            },
            {
              signature: "Observability",
              description: "Log every decision: messages in, tool calls out, costs, latencies, turn count.",
              returns: "When users say 'why did it do that,' you need to be able to answer. Logging is non-negotiable.",
            },
          ],
        },
        {
          kind: "scenario_predict",
          label: "Diagnosing 'the agent works in demo but fails in prod'",
          language: "text",
          scenario: `An FDE pilot ships an agent for customer support. In dev it solves
80% of tickets autonomously. Two weeks into pilot, the rate is 45%
and rising costs.

Logs show: average turns/task went from 6 → 14. Tool call distribution
shifted from 60% kb_search / 30% ticket_lookup / 10% other to 35%
kb_search / 25% ticket_lookup / 40% "other" (search, retry, retry, retry).`,
          question: "What's the first hypothesis and what diagnostic do you run?",
          answer: "Tool-thrashing on novel queries. Hypothesis: prod has a long-tail of queries that aren't covered by the KB, the agent searches, gets bad results, searches again with reformulated queries, and loops. Diagnostic: sample 20 high-turn failures; cluster by topic; check whether the KB actually covers them. If 80% are 'KB has a gap,' fix is KB-side, not agent-side. If 80% are 'KB has it but query reformulation failed,' fix is retrieval-side (BM25 + semantic hybrid, query expansion).",
          explanation: "This is the most common 'agent regression' pattern in production. The agent's flexibility is masking a data problem: it keeps trying because it has tools to try with, instead of escalating to a human. Fix is usually upstream of the agent — better retrieval, better KB coverage, lower escalation threshold — *not* better agent prompts. Recognizing this in the first conversation is what makes an FDE useful.",
        },
        {
          kind: "code_comparison",
          label: "Unbounded vs bounded agent",
          left: {
            title: "Unbounded — production hazard",
            code: `msgs = [{"role": "user", "content": task}]
while True:
    r = client.messages.create(
        model="claude-opus-4-5",
        tools=TOOLS,
        messages=msgs,
    )
    if r.stop_reason == "end_turn":
        return r
    msgs += run_tools(r)
    # No turn cap, no cost cap, no observability`,
            annotation: "One bad input or one looping tool failure and you've burned thousands of dollars before noticing.",
          },
          right: {
            title: "Bounded — production-ready",
            code: `def run_agent(task: str, max_turns: int = 20, max_cost_usd: float = 1.0):
    msgs = [{"role": "user", "content": task}]
    cost = 0.0
    for turn in range(max_turns):
        r = client.messages.create(
            model="claude-opus-4-5", tools=TOOLS, messages=msgs,
        )
        cost += price(r.usage)
        log.info("turn=%d cost=%.3f stop=%s", turn, cost, r.stop_reason)
        if cost > max_cost_usd:
            raise CostExceeded(turn, cost)
        if r.stop_reason == "end_turn":
            return r
        msgs += run_tools(r, allow_list=ALLOWED_TOOLS)
    raise TurnCapReached(max_turns)`,
            annotation: "Cap on turns, cap on cost, every turn logged with usage. Tools explicitly allow-listed. Failure modes are visible and recoverable.",
          },
          takeaway: "The cap+log+allow-list trio is non-negotiable for production agents. Demos can skip them; pilots cannot.",
        },
        {
          kind: "multiple_choice",
          title: "The hardest customer question",
          prompt: "Customer says: 'We want an agent that can do anything our support reps can do.' What's the strongest pushback?",
          choices: [
            {
              text: "'Agree, let's start with all the tools the reps have access to.'",
              correct: false,
              rationale: "Maximally broad tool access maximizes blast radius. Even if it works, you've optimized for the wrong thing in the pilot.",
            },
            {
              text: "'Let's pick the top 3 task types reps do most, ship workflows for those, and revisit the agent question after we've measured.'",
              correct: true,
              rationale: "Reframes the conversation from 'agent vs not' to 'what's the highest-value, lowest-risk slice.' Builds trust through working software, learns where workflows aren't enough, and earns the right to propose an agent for the residual.",
            },
            {
              text: "'Agents aren't ready for that use case yet, let's wait 6 months.'",
              correct: false,
              rationale: "Closes the conversation. Even if technically true, you've left the customer without a next step.",
            },
            {
              text: "'Show us the 5 hardest tickets your reps get and we'll prove the agent can handle them.'",
              correct: false,
              rationale: "Pilots designed to prove the agent can handle the hardest cases optimize for impressiveness over value. Most tickets are *not* the hardest, and a system that aces the hardest may flame out on the medium ones.",
            },
          ],
          explanation: "FDE conversations win when you replace 'agent vs not' with 'which slice first.' The customer's framing is binary; yours should be portfolio. Start with the workflow-shaped tasks (high-volume, predictable steps), measure ROI, and use that traction to fund agent investment on the long-tail tasks where workflows can't cope.",
        },
        {
          kind: "mini_challenge",
          title: "Design the right system: 'auto-fill our weekly business review deck'",
          prompt: `A customer asks: "Every Monday morning, our team manually pulls 8 charts
from our analytics warehouse, paraphrases them into bullet points, and
drops them into a slide deck for our WBR. Can your AI just... do this?"

Design the system. Specifically:
1. Which pattern (chain / routing / parallelization / orchestrator-workers /
   evaluator-optimizer / agent) is the *first thing* you'd build?
2. Where would an LLM live in the system, and where would it not live?
3. What's the smallest version you'd ship in week 1?

Write your answer as a 4-6 bullet brief you'd send to the customer.`,
          hints: [
            "The task has a *known* structure (8 specific charts, one deck format). That should bias your pattern choice strongly.",
            "Pulling data from a warehouse is a SQL job, not an LLM job. What part actually needs the LLM?",
            "The 8 charts are independent of each other. What pattern exploits that?",
            "What's the failure mode you most want to avoid for a CEO-facing deck? How does that influence whether you use an agent?",
          ],
          solution: `### Brief: WBR Auto-Fill System

**1. Pattern: Parallelization (sectioning) with a deterministic skeleton.**
   - Not an agent: every step is known. 8 charts, 8 paraphrases, 1 deck.
   - Not orchestrator-workers: the plan never changes week-to-week.
   - Not eval-opt initially: we don't have a quality rubric yet — get a baseline first.

**2. Where the LLM lives:**
   - **LLM does**: paraphrase each chart's data into 1-2 bullet points; flag week-over-week anomalies in prose.
   - **LLM does NOT**: pull data (that's parameterized SQL against the warehouse), render charts (matplotlib/the BI tool), assemble the deck (python-pptx with a fixed template).
   - Rule: anything deterministic, do deterministically. The LLM only handles the language-to-data interpretation.

**3. Week-1 minimum shipped version:**
   - 8 named SQL queries, one per chart, with parameterized date ranges.
   - 8 parallel LLM calls, each receiving (chart_title, prior_week_value, this_week_value, simple_data_table). Each returns 1-2 bullets.
   - python-pptx fills a fixed template with chart image + bullets.
   - Email the deck to the team lead at 7am Monday for human review before the 9am WBR.

**4. What to measure before adding more:**
   - Time saved per week (manual baseline = 90 min; aim for <5 min review).
   - Edits per bullet point (if reviewers edit >50% of bullets, the paraphrase prompt needs work).
   - SQL freshness failures (if 1 chart fails, fall back to "data unavailable this week" — don't let it block the deck).

**5. When to consider escalation:**
   - **Eval-optimizer** if bullets are consistently rewritten — add a critique step that catches the patterns the reviewer keeps fixing.
   - **Orchestrator-workers** if the customer wants "and the agent should figure out which charts to include based on what's interesting this week" — that's a planning problem.
   - **Agent** if the customer eventually wants "and the agent should answer questions about the deck in Slack throughout the week" — that's open-ended Q&A.

**6. What we explicitly won't do in v1:**
   - Self-modifying queries. SQL is human-maintained.
   - Removing the human review step before the 9am meeting. Trust is earned.`,
          takeaway: "When a task has a known structure, do not reach for an agent. Sectioning + LLMs-where-language-is-needed + deterministic-everything-else is the shape of most 'AI workflow' wins. The interview signal is your willingness to remove the LLM from steps that don't need it.",
        },
        {
          kind: "key_insight",
          label: "The FDE escalation ladder",
          insight: `For any new customer ask, walk this ladder in order. Stop at the first pattern that solves the task.

1. **Single prompt** — Can one well-crafted prompt do this? Often yes. Stop here.
2. **Prompt chain** — Does it decompose into a fixed sequence with clear gates? Ship a chain.
3. **Routing** — Are inputs heterogeneous enough that one prompt under-serves them? Add a router.
4. **Parallelization** — Are subtasks independent? Section them.
5. **Orchestrator-workers** — Do subtasks depend on the input? Add a planning step.
6. **Evaluator-optimizer** — Is there a measurable quality bar that iteration improves? Add a critic loop.
7. **Agent** — Are the steps unpredictable and tool-mediated? Now you can defend an agent.

If you skip steps, you're shipping a Lamborghini for someone who wanted a bicycle. The cost shows up in production, not in the demo.`,
        },
        {
          kind: "flashcard",
          context: "The single most useful question to ask in an FDE customer conversation about agents.",
          front: "What question disarms the 'we want an agent' ask?",
          back: "'Walk me through, step by step, what a great outcome looks like for one specific case.' If they can walk you through 5 specific steps, the task is workflow-shaped — show them the chain or sectioning that maps to those steps. If their walk-through has 'and then the model figures out what to do next' in it, that's the seam where an agent might be needed — and now you can scope the agent narrowly to that seam instead of treating the whole task as agentic.",
        },
      ],
    },
    // ─── Section 8: Hybrid patterns + lock-it-in ─────────────────────────
    {
      title: "Hybrid patterns & lock-it-in",
      blocks: [
        {
          kind: "prose",
          markdown: `## Most production systems are hybrids

The decision framework is **per-subtask, not per-system**. When a customer says "should we use a workflow or an agent," the honest answer is usually *"yes."* Routing dispatches to a chain. The chain has an eval-opt loop inside one of its steps. The orchestrator's plan eventually calls an agent on the long-tail subtasks.

Reading existing systems in this language — naming each layer — is what makes you useful in a kickoff meeting. The patterns aren't competitors; they're a *vocabulary* for decomposing systems.`,
        },
        {
          kind: "code_predict",
          label: "End-to-end hybrid: router → chain → bounded agent",
          code: `# Deterministic stubs so the architecture runs without real LLM calls.
# Each function represents what a real LLM call would do.

def route(query):
    q = query.lower()
    if "refund" in q or "billing" in q: return "billing"
    if "broken" in q or "error" in q:   return "technical"
    return "agent"   # open-ended -> dynamic decision-making

# --- Branch 1: billing -> prompt chain (3 known steps) ---
def billing_chain(query):
    extracted = f"order_id=12345"                     # step 1: extract
    invoice   = f"INV-2024-12345 status=paid"         # step 2: lookup
    return f"Found {invoice} ({extracted})"           # step 3: respond

# --- Branch 2: technical -> single prompt + retrieval ---
def technical_handler(query):
    return f"[kb-hit] try restarting your device"

# --- Branch 3: open-ended -> bounded agent loop ---
def agent_loop(query, max_turns=5):
    cost = 0.0
    for turn in range(max_turns):
        cost += 0.05                                  # each turn costs
        if turn == 2:                                 # stub: model decides done
            return f"agent-resolved at turn {turn}, cost USD {cost:.2f}"
    return f"agent-hit-cap, cost USD {cost:.2f}"

def system(query):
    branch = route(query)
    handlers = {"billing": billing_chain,
                "technical": technical_handler,
                "agent": agent_loop}
    return f"[{branch}] {handlers[branch](query)}"

queries = [
    "I want a refund on my order",
    "My device is broken and shows error 47",
    "Can you find tickets like mine and reassign the closed ones?",
]
for q in queries:
    print(system(q))`,
          output: `[billing] Found INV-2024-12345 status=paid (order_id=12345)
[technical] [kb-hit] try restarting your device
[agent] agent-resolved at turn 2, cost USD 0.15`,
          explanation: `This is the canonical hybrid shape: a **router** at the top, dispatching to a **chain** (billing), a **single handler** (technical), or a **bounded agent** (open-ended). Each branch's pattern is chosen for that branch's complexity:

- Billing has 3 known steps → chain.
- Technical has one prompt + retrieval → single call.
- Open-ended needs decision-making → bounded agent with turn cap.

The decision tree compounds. Each new subtask gets its own answer from the escalation ladder. Production systems are usually 3-5 of these patterns nested or chained, not one pattern at the root. Try editing the \`route()\` function above to add a fourth branch — say "feedback" → eval-opt — and re-run.`,
          runnable: true,
        },
        {
          kind: "scenario_predict",
          label: "Name the patterns in a real architecture",
          language: "text",
          scenario: `A customer's existing support assistant works as follows:
1. Incoming ticket -> classifier -> "easy" | "medium" | "hard"
2. Easy: Haiku with retrieval, single call.
3. Medium: 3-step chain (retrieve -> draft -> tone-check).
4. Hard: agent loop with retrieval, ticket-update, escalate tools; turn cap 20.
5. For all 3 branches, a content-safety voter (5 votes, threshold 2) runs
   on the final output before it ships.`,
          question: "How many of the six patterns are in use, and which?",
          answer: "Five of six: (1) routing — the classifier dispatches 3 ways. (2) single-prompt — easy branch. (3) chain — medium branch. (4) agent — hard branch with tools + cap. (5) voting — content-safety on every output. The only pattern not used is evaluator-optimizer. The system picks each branch's pattern to fit that branch's complexity.",
          explanation: "When you can name each layer, you can talk to engineers about the right slice of the system to improve. 'The medium-tier chain is bottlenecked on the tone check' is a much better diagnosis than 'the assistant is slow.' Practice this naming on every system you encounter — production AI is almost always a stack of these patterns.",
        },
        {
          kind: "mini_challenge",
          title: "Replace an agent with a workflow (10× cost cut)",
          prompt: `A customer has shipped this design:

> "For every inbound resume, an agent loops up to 15 turns using tools:
> parse_resume, score_skills, lookup_role_requirements, write_summary,
> flag_concerns, and submit_decision."

In production: 12-turn average, costs are 8× projection, and only 3 of 15
turn-counts in a typical run actually use a tool — the rest are the
model "thinking out loud."

You're asked to redesign for ~10× lower cost without dropping accuracy.

Write a 5-7 bullet brief identifying:
(a) which pattern(s) to use,
(b) where the LLM is still needed,
(c) the smallest version you'd ship to validate the redesign before
    fully replacing the agent.`,
          hints: [
            "The tool list is fixed and small (6 tools). Does that suggest the steps are knowable?",
            "If you can sketch a flowchart of 'what should happen for any resume,' the task isn't agent-shaped.",
            "Some tools are independent (score_skills vs lookup_role_requirements). What pattern exploits that?",
            "The model 'thinking out loud' for 9 of 12 turns is a prompt-focus problem. Per-step prompts in a chain are more focused than a multi-tool agent prompt.",
          ],
          solution: `### Redesign brief

**1. Pattern: prompt chain with sectioning inside step 2.**
   - Step 1 (chain): \`parse_resume\` → structured JSON.
   - Step 2 (section, parallel): \`score_skills\` + \`lookup_role_requirements\` + \`flag_concerns\` run concurrently on the parsed JSON.
   - Step 3 (chain): \`write_summary\` using parsed JSON + step-2 results.
   - Step 4 (deterministic): \`submit_decision\` against a confidence threshold from step 3.

**2. Where the LLM lives:**
   - LLM does: parsing, skill scoring, summarization, concern-flagging.
   - LLM does NOT: \`lookup_role_requirements\` (DB query against the customer's job descriptions) or \`submit_decision\` (deterministic rule on confidence).

**3. Cost ballpark:**
   - Old: 12 turns × Opus with growing context → ~$1+ per resume.
   - New: 4 calls × Sonnet → ~$0.08 per resume. **~12× cheaper.**

**4. Week-1 validation:**
   - Shadow-run the new design on 200 historical resumes alongside the agent.
   - Measure: % final-decision agreement, per-step disagreement breakdown, latency, cost.
   - If agreement ≥ 95% on decisions, ship the redesign behind a feature flag.

**5. Where the agent might still belong (residual):**
   - The 5% of resumes where step-3 confidence is low → chain escalates to a *bounded* agent (max 5 turns) for those only.
   - This turns the agent from "the system" into "the fallback for the long tail" — which is the right shape.

**6. What to measure post-launch:**
   - Cost per resume (must drop ~10×).
   - Decision agreement vs. human reviewers (must not drop).
   - Fraction of resumes hitting the agent fallback (should be < 10%).`,
          takeaway: "The hardest design move is to *remove* the LLM from steps that don't need it. Once you do, the agent shrinks to the actual hard part: the long tail. Cost goes down, accuracy stays up, and the agent becomes defensible because it's only on the cases that need it.",
        },
        {
          kind: "warm_up",
          title: "Cold recall: name the six patterns",
          prompt: "From memory (no scrolling), list the six patterns in cheapest-to-most-expensive order, with one line on when to reach for each.",
          answer: `1. Single prompt — one well-crafted call. Default for narrow tasks.
2. Prompt chain — N sequential calls with gates. Use when steps decompose cleanly.
3. Routing — classify then dispatch. Use for heterogeneous inputs.
4. Parallelization (sectioning/voting) — fan out independent subtasks or duplicate prompts for variance reduction.
5. Orchestrator-workers — plan + parallel dispatch + synthesize. Use when the plan depends on the input.
6. Evaluator-optimizer — gen + critique loop. Use when there's a writable quality rubric.
7. Agent — LLM in a loop with tools. Use when steps aren't knowable in advance.`,
          explanation: "Reciting the ladder is the difference between vague hand-waving in customer conversations and a confident structured answer. If you stumbled, the line you stumbled on is the one to revisit. Most people forget orchestrator-workers exists and jump from parallelization to agent — which is exactly the over-escalation pattern this guide is designed to prevent.",
        },
        {
          kind: "warm_up",
          title: "Cold recall: the disarm question",
          prompt: "A customer opens with 'we want an agent.' Write the single question you ask in response to figure out whether they actually need one.",
          answer: "'Walk me through, step by step, what a great outcome looks like for one specific case.'",
          explanation: "If they name 5 specific steps → the task is workflow-shaped. If their walk-through contains 'and then the model figures out what to do next' → that's the seam where an agent might live. The question reframes 'agent vs not' into 'what's the actual decomposition,' which is the conversation you want to be having.",
        },
        {
          kind: "multiple_choice",
          title: "Cold recall: structural difference",
          prompt: "Which is the cleanest one-sentence way to distinguish orchestrator-workers from a multi-agent system?",
          choices: [
            {
              text: "Orchestrator-workers is faster.",
              correct: false,
              rationale: "Not structural — and not necessarily true at small scale.",
            },
            {
              text: "Orchestrator-workers has fixed control-flow depth (plan → dispatch → synthesize); multi-agent has emergent, recursive control flow.",
              correct: true,
              rationale: "This is the structural answer. Orchestrator-workers always terminates after one pass; multi-agent has agents that can decide to act repeatedly and talk to each other.",
            },
            {
              text: "Orchestrator-workers uses smaller models for workers.",
              correct: false,
              rationale: "An implementation choice, not a structural distinction. Workers can be any model.",
            },
            {
              text: "Multi-agent always has more agents than orchestrator-workers.",
              correct: false,
              rationale: "Misses the point. A 2-agent system with bidirectional control is still multi-agent; a 50-worker orchestrator is still orchestrator-workers.",
            },
          ],
          explanation: "The structural property — fixed-depth vs emergent control flow — is what determines cost predictability, debugging difficulty, and failure modes. Most pitches that say 'multi-agent' are actually orchestrator-workers, and labeling them accurately changes the engineering effort estimate dramatically.",
        },
        {
          kind: "code_predict",
          label: "BUG HUNT — find the missing guardrails (then fix and re-run)",
          code: `# This "production agent" is missing three of the seven design-checklist
# guardrails from section 7. Find them, then add them, then re-run.

def fake_llm_turn(turn, history):
    # Stub: the "model" keeps calling a tool until turn >= 25
    if turn < 25:
        return {"stop_reason": "tool_use", "cost": 0.10}
    return {"stop_reason": "end_turn", "cost": 0.10}

def run_agent(task):
    history = [task]
    turn = 0
    total_cost = 0.0
    while True:
        r = fake_llm_turn(turn, history)
        total_cost += r["cost"]
        # NOTE: no log line here
        if r["stop_reason"] == "end_turn":
            return {"result": "done", "turns": turn, "cost": total_cost}
        history.append("tool_output_blob_" + "x" * 5000)  # context bloats
        turn += 1

out = run_agent("solve customer issue")
print(out)`,
          output: `{'result': 'done', 'turns': 25, 'cost': 2.6}`,
          explanation: `Three guardrails missing from section 7's checklist:

1. **No turn cap.** \`while True\` never bails. The fake model happened to terminate at 25 — a real one could go forever.
2. **No cost ceiling.** \`total_cost\` is tracked but never checked against a budget.
3. **No observability.** Zero log lines per turn, so a production operator can't diagnose what's happening.

(And a fourth issue: the tool output is appended raw, with no truncation — context bloats turn-over-turn.)

The fix is straightforward — borrow the bounded-agent pattern from section 7:

\`\`\`python
def run_agent(task, max_turns=10, max_cost_usd=1.0):
    history, turn, total_cost = [task], 0, 0.0
    while turn < max_turns:
        r = fake_llm_turn(turn, history)
        total_cost += r["cost"]
        print(f"turn={turn} cost={total_cost:.2f} stop={r['stop_reason']}")
        if total_cost > max_cost_usd:
            return {"result": "cost_exceeded", "turns": turn, "cost": total_cost}
        if r["stop_reason"] == "end_turn":
            return {"result": "done", "turns": turn, "cost": total_cost}
        history.append("tool_output_summary")  # truncated/summarized
        turn += 1
    return {"result": "turn_cap", "turns": max_turns, "cost": total_cost}
\`\`\`

That refactor saves ~$1.50 per runaway task and makes failures legible in logs. This is the cap + log + cost-ceiling trio in code form.`,
          runnable: true,
        },
        {
          kind: "key_insight",
          label: "Spaced practice plan for this guide",
          insight: `**Day 1 (today):** Finish all 9 sections. Don't peek at solutions.

**Day 2:** Without opening the guide, sketch on paper: the 7-rung ladder, and the cost/latency formula for each. Then re-do the cost calculator without looking — change the model from Opus to Sonnet and recompute the agent number from memory.

**Day 4:** Pick one real system you've worked on or seen. Label every layer with one of the patterns. If a layer doesn't fit cleanly, that's a sign it's a hybrid — break it down further.

**Day 7:** Run the WBR mini-challenge from section 7 again, but this time the customer adds: *"and the system should also handle ad-hoc questions from execs throughout the week."* Redesign on the spot. The new requirement should push *one* part of the system to an agent while the rest stays sectioning. If you reach for an agent for the whole thing, revisit section 1.

**Day 14:** Schedule a 30-minute mock customer call. Friend plays a customer who says "we want an agent for X." You apply the disarm question and the escalation ladder live. Goal: "what does a great outcome look like, step by step" should fall out of your mouth as the first response — that's when the framework has moved from knowledge to instinct.`,
        },
      ],
    },
  ],
};
