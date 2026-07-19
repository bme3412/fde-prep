import type { StudyGuide } from "../guide-types";

export const evalDrivenDevelopmentGuide: StudyGuide = {
  topicTitle: "Eval-driven development",
  topicSlug: "eval-driven-development",
  sections: [
    // ─── Section 1: Why evals are the FDE's first deliverable ─────────────
    {
      title: "Why evals are the FDE's first deliverable",
      blocks: [
        {
          kind: "prose",
          markdown: `## The methodology that anchors every engagement

Ask an experienced Applied AI / Forward Deployed Engineer what they build first on a new customer engagement and the answer is almost never "the prototype." It's **the eval**.

An eval is a repeatable measurement of whether the system does the job. Without one, every prompt tweak, model swap, and architecture change is a coin flip dressed up as engineering. "The new prompt feels better" is not a claim you can ship, roll back, or defend in front of a customer's VP. A number is.

The loop the whole role runs on:

1. **Collect** real examples of the task (from the customer's actual traffic, not invented ones).
2. **Define graders** — how you score an output as right or wrong.
3. **Measure a baseline** — what does the current/naive approach score?
4. **Change one thing** — a prompt, a model, a retrieval step.
5. **Re-measure.** Ship only if the number went up and nothing else regressed.

This is *eval-driven development*: the LLM analogue of test-driven development. The eval is the spec.`,
        },
        {
          kind: "key_insight",
          label: "The core rule",
          insight: `**No eval, no ship.** An eval converts "the model feels worse today" into a delta you can act on.

The most common failure mode of AI projects is not a bad model — it's a team that iterated for six weeks on vibes, shipped, and then couldn't tell whether the next change made things better or worse. The FDE who shows up on day one and says "before we touch the prompt, let's build 50 labeled examples and grade the current output" is the one who ships.`,
        },
        {
          kind: "method_ref",
          title: "The three grader types (know the tradeoffs cold)",
          importLine: "# Every eval scores outputs with one (or a mix) of these",
          methods: [
            {
              signature: "Programmatic / exact",
              description:
                "Deterministic code checks: exact match, regex, JSON-schema validation, does-the-test-pass, is-the-number-within-tolerance.",
              returns:
                "Free, instant, infallible against what it encodes. Use it whenever the output has a checkable structure. Reach here first.",
            },
            {
              signature: "LLM-as-judge",
              description:
                "A model grades another model's output against a rubric. For open-ended outputs (summaries, answers, tone) where no regex captures 'good'.",
              returns:
                "Cheap and scalable but biased and noisy — needs hardening (see Section 3). The workhorse of production evals.",
            },
            {
              signature: "Human",
              description:
                "A person labels outputs against a rubric. The ground-truth anchor for the other two.",
              returns:
                "Slow and expensive; the gold standard. Use it to build golden sets and to calibrate/validate your LLM judge — not for every run.",
            },
          ],
        },
        {
          kind: "scenario_predict",
          label: "Picking the cheapest grader that works",
          language: "text",
          scenario: `Customer task: an agent extracts \`{invoice_number, total_amount, due_date}\`
from uploaded PDFs and writes them into their ERP. They want to know how
often it's right before they trust it with real invoices.`,
          question: "Which grader do you build, and why not LLM-as-judge?",
          answer:
            "Programmatic. Each field has a checkable ground truth: invoice_number is exact-match against a labeled set, total_amount is a numeric equality (or within a cent), due_date is a date equality. Build ~100 human-labeled PDFs once, then score field-level exact match automatically. An LLM judge would be slower, cost money per run, and add noise to a question that has a crisp right answer.",
          explanation:
            "The instinct to reach for an LLM judge on everything is the most common over-engineering mistake in evals. Judges are for outputs with no programmatic ground truth. Structured extraction has one — use it. Reserve the judge (and your labeling budget) for the genuinely open-ended parts.",
        },
        {
          kind: "flashcard",
          front:
            "Why is 'build the eval' the FDE's first deliverable, ahead of the prototype?",
          back: "Because every subsequent decision — prompt, model tier, retrieval design, agent vs workflow — is a bet, and without an eval you can't tell which bets paid off. The eval is the spec and the regression net at once. It also reframes the customer relationship: instead of arguing about whether output 'looks good,' you agree on a measurable bar together, then engineer toward it. Building the eval first is what separates iteration from thrashing.",
        },
      ],
    },
    // ─── Section 2: Classification metrics (runnable) ─────────────────────
    {
      title: "Precision, recall, F1 — the metrics you compute in your head",
      blocks: [
        {
          kind: "prose",
          markdown: `## The confusion matrix and its four numbers

A huge fraction of LLM tasks are secretly classification: is this ticket urgent? is this response safe? does this chunk answer the question? For any yes/no decision, four counts describe performance:

- **TP** (true positive) — flagged, and it should have been.
- **FP** (false positive) — flagged, but it shouldn't have been.
- **FN** (false negative) — not flagged, but it should have been.
- **TN** (true negative) — not flagged, correctly.

From those, two ratios that matter far more than raw accuracy:

- **Precision** = TP / (TP + FP) — *of the things you flagged, how many were right?* Punishes false alarms.
- **Recall** = TP / (TP + FN) — *of the things that were truly positive, how many did you catch?* Punishes misses.

They trade off. Flag everything → recall 1.0, precision in the gutter. Flag nothing risky → precision high, recall collapses. **F1** is their harmonic mean — a single number when you care about both roughly equally.

**Why not accuracy?** On imbalanced data it lies. If 2% of tickets are urgent, a model that flags *nothing* is 98% accurate and completely useless. Precision and recall don't have that blind spot.`,
        },
        {
          kind: "code_predict",
          label: "Compute P / R / F1 from a confusion matrix (tweak and re-run)",
          code: `# A classifier flags support tickets as "urgent".
# Scored against 100 human-labeled tickets.
TP, FP, FN, TN = 30, 10, 15, 45

precision = TP / (TP + FP)   # of the ones we flagged, how many were right
recall    = TP / (TP + FN)   # of the truly urgent, how many we caught
f1        = 2 * precision * recall / (precision + recall)
accuracy  = (TP + TN) / (TP + FP + FN + TN)

print(f"precision {precision:.3f}")
print(f"recall    {recall:.3f}")
print(f"f1        {f1:.3f}")
print(f"accuracy  {accuracy:.3f}")`,
          output: `precision 0.750
recall    0.667
f1        0.706
accuracy  0.750`,
          explanation: `Precision 0.75: three-quarters of what we flagged as urgent really was. Recall 0.667: we caught two-thirds of the actually-urgent tickets and missed a third. F1 0.706 splits the difference.

Try it: bump FN from 15 to 40 (the model misses far more urgent tickets). Recall craters to 30/70 ≈ 0.43 and F1 with it — but accuracy barely moves because the TN pile is large. That divergence is exactly why you report precision/recall, not accuracy, on anything imbalanced.`,
          runnable: true,
        },
        {
          kind: "scenario_predict",
          label: "Which metric do you optimize?",
          language: "text",
          scenario: `Two systems, same customer, opposite error costs:

  System A: filters user-uploaded images for CSAM/illegal content before
            they go public. A miss is catastrophic and possibly criminal.

  System B: an assistant that auto-drafts replies for a human agent to
            review and send. A bad draft costs a few seconds to discard.`,
          question: "For each, do you tune the threshold toward precision or recall?",
          answer:
            "System A → recall. A false negative (illegal content slips through) is catastrophic; a false positive (benign image held for review) is cheap. Push recall up even at the cost of precision, and route flagged content to human review. System B → precision. A false positive (a bad draft) wastes the human agent's time and erodes trust in the tool; a missed opportunity to draft is nearly free. Only surface drafts you're confident in.",
          explanation:
            "This is the core eval design question and it always reduces to: which error is more expensive? Symmetric costs → optimize F1. Misses are catastrophic → recall. False alarms are expensive → precision. The threshold is a business decision disguised as a technical one, and naming that in a customer conversation is high-signal.",
        },
        {
          kind: "method_ref",
          title: "Averaging & threshold vocabulary",
          importLine: "# Terms you must use precisely",
          methods: [
            {
              signature: "Micro-average",
              description:
                "Pool all TP/FP/FN across classes, then compute one precision/recall. Dominated by the frequent classes.",
              returns:
                "Use when every *instance* matters equally (overall system throughput quality).",
            },
            {
              signature: "Macro-average",
              description:
                "Compute the metric per class, then take the unweighted mean. Every class counts the same regardless of size.",
              returns:
                "Use when rare classes matter as much as common ones (don't let a huge 'other' bucket hide failure on a rare-but-critical category).",
            },
            {
              signature: "F-beta",
              description:
                "Generalizes F1 with a weight β. β>1 weights recall higher; β<1 weights precision higher.",
              returns:
                "F2 for 'misses hurt more' (safety), F0.5 for 'false alarms hurt more' (draft suggestions).",
            },
            {
              signature: "Threshold / operating point",
              description:
                "The score cutoff above which you flag. Moving it slides you along the precision/recall curve.",
              returns:
                "Pick it from the cost asymmetry on a validation set — never leave it at the default 0.5.",
            },
          ],
        },
        {
          kind: "warm_up",
          title: "The accuracy trap",
          prompt: `A fraud classifier is 99.3% accurate on a dataset where 0.5% of transactions are fraud. Your customer is thrilled. Why should you not be?`,
          answer:
            "A model that predicts 'not fraud' for everything scores 99.5% accuracy — better than theirs — while catching zero fraud. Accuracy is meaningless here; you need recall (what fraction of fraud is caught) and precision (what fraction of flags are real).",
          explanation:
            "On imbalanced data, high accuracy is the default, not an achievement. The first question on any 'we got 99% accuracy' claim is 'what's the base rate?' If the positive class is rare, demand precision and recall before you believe anything.",
        },
      ],
    },
    // ─── Section 3: LLM-as-judge and its bias modes ──────────────────────
    {
      title: "LLM-as-judge: the workhorse and how it lies to you",
      blocks: [
        {
          kind: "prose",
          markdown: `## When there's no programmatic ground truth

Most interesting outputs — a summary, an answer, a rewrite, a tone — have no regex for "good." The scalable option is to have a model grade them against a rubric. This is *LLM-as-judge*, and it's how most production evals score open-ended output.

It works. It also has systematic biases you must design around, because a judge that's confidently wrong is worse than no judge:

- **Position bias** — in pairwise comparisons, judges favor whichever answer is shown *first* (or sometimes second), regardless of quality.
- **Verbosity bias** — judges reward longer, more elaborate answers even when a terse one is better.
- **Self-preference bias** — a judge tends to rate outputs from its own model family higher.
- **Sycophancy** — if the prompt hints at a preferred answer, the judge agrees with it.
- **Scale compression / leniency** — on a 1–10 scale, judges cluster around 7–8 and rarely use the extremes, so real differences vanish into noise.

None of these are fatal. Each has a mitigation, and a hardened judge is one of the most useful tools an FDE ships.`,
        },
        {
          kind: "code_comparison",
          label: "Naive judge vs hardened judge",
          left: {
            title: "Naive — inherits every bias",
            code: `def judge(question, answer_a, answer_b):
    prompt = f"""Which answer is better?
Question: {question}
Answer A: {answer_a}
Answer B: {answer_b}
Reply with A or B."""
    return llm(prompt)   # returns "A" or "B"

# A is always shown first -> position bias.
# Longer answer usually wins -> verbosity bias.
# No rubric -> judges on vibes, 1-10 clusters at 8.`,
            annotation:
              "One call, fixed order, no rubric, no reasoning. Every known bias is live.",
          },
          right: {
            title: "Hardened — biases designed out",
            code: `def judge(question, answer_a, answer_b, rubric):
    def ask(first, second):
        prompt = f"""Score each answer 1-5 on this rubric:
{rubric}
Question: {question}
Answer 1: {first}
Answer 2: {second}
Think step by step, then output JSON:
{{"winner": 1|2|"tie", "reason": "..."}}"""
        return parse(llm(prompt))
    # Swap order and require agreement across both runs
    r1 = ask(answer_a, answer_b)   # A first
    r2 = ask(answer_b, answer_a)   # B first
    if r1["winner"] == 1 and r2["winner"] == 2:
        return "A"
    if r1["winner"] == 2 and r2["winner"] == 1:
        return "B"
    return "tie"                   # order-dependent = not a real win`,
            annotation:
              "Rubric anchors the score; swapping order neutralizes position bias; reasoning-before-verdict improves calibration; disagreement across orders is honestly a tie.",
          },
          takeaway:
            "The single highest-value judge fix is running both orderings and only counting a win when it survives the swap. It roughly doubles judge cost and removes the most damaging bias. Add a rubric and reason-then-score and you have a judge you can defend.",
        },
        {
          kind: "code_predict",
          label: "Position-bias-robust win counting (runnable)",
          code: `# Judge compares candidate A vs baseline B on 5 prompts.
# We ask twice per prompt, swapping order. A "win" must survive the swap.
# Each tuple = (verdict_with_A_first, verdict_with_B_first)
judgments = [
    ("A", "A"),   # A wins both orders  -> robust win
    ("A", "B"),   # order-dependent     -> tie (bias exposed)
    ("A", "A"),   # robust win
    ("B", "B"),   # B wins both orders  -> robust loss
    ("A", "B"),   # order-dependent     -> tie
]

def score(pair):
    first, second = pair
    if first == "A" and second == "A":
        return "win"
    if first == "B" and second == "B":
        return "loss"
    return "tie"

results = [score(p) for p in judgments]

# Naive single-order tally would just count A's first-position verdicts:
naive_A_wins = sum(1 for a, _ in judgments if a == "A")

print(f"robust: {results.count('win')} win "
      f"{results.count('loss')} loss "
      f"{results.count('tie')} tie")
print(f"naive:  A wins {naive_A_wins}/5 (order uncontrolled)")`,
          output: `robust: 2 win 1 loss 2 tie
naive:  A wins 4/5 (order uncontrolled)`,
          explanation: `The naive tally says A wins 4 of 5 — a slam dunk. The robust tally says only 2 of those were real; the other 2 flipped when you swapped the order, meaning the "win" was position bias, not quality. Shipping the naive number would have you deploy a change that's barely better than baseline while telling the customer it's 4x better. This one technique is why order-swapping is the first thing to add to any pairwise judge.`,
          runnable: true,
        },
        {
          kind: "multiple_choice",
          title: "Diagnosing a judge that disagrees with humans",
          prompt:
            "You validate your LLM judge against 100 human labels. The judge agrees with humans 68% of the time — barely better than chance on a 2-class task. Before you throw the judge out, what's the highest-value thing to check?",
          choices: [
            {
              text: "Switch to a bigger, more expensive judge model",
              correct: false,
              rationale:
                "Might help a little, but you haven't diagnosed *why* it disagrees. A vague rubric will confuse a big model too. Fix the measurement before spending on horsepower.",
            },
            {
              text: "Read the disagreements: are humans themselves consistent, and does the rubric match how they actually decide?",
              correct: true,
              rationale:
                "Low judge-human agreement usually means one of two fixable things: the humans disagree with each other (so there's no stable ground truth to hit), or the rubric doesn't capture the real decision criteria. You can only tell by reading the disagreeing cases.",
            },
            {
              text: "Average five judge calls per example to reduce variance",
              correct: false,
              rationale:
                "Ensembling reduces noise but not bias. If the rubric is wrong, five wrong-in-the-same-direction votes don't help.",
            },
            {
              text: "Lower the bar — 68% is fine for production",
              correct: false,
              rationale:
                "68% on a binary task means the judge is unreliable enough to send your whole eval in the wrong direction. You'd be optimizing against a broken ruler.",
            },
          ],
          explanation:
            "A judge is a measuring instrument; validate it against human labels before you trust it, and when it disagrees, read the cases. Half the time the humans are inconsistent (fix: sharpen the rubric until inter-annotator agreement is high, *then* the judge can match it). The other half the rubric is measuring the wrong thing. Both are found by reading disagreements, not by scaling the model.",
        },
        {
          kind: "flashcard",
          front:
            "Name the LLM-as-judge bias modes and the one-line mitigation for each.",
          back: "Position bias → swap the order and require the verdict to survive the swap. Verbosity bias → put a length/conciseness criterion in the rubric, or normalize for length. Self-preference → use a different model family as judge than the one generating. Sycophancy → never reveal a 'preferred' answer or the source in the judge prompt. Scale compression → prefer pairwise (A vs B) over pointwise 1–10 scoring, or force reasoning before the score. Overarching mitigation: give a concrete rubric and validate the judge against human labels before trusting it.",
        },
      ],
    },
    // ─── Section 4: Building the golden set + the harness ────────────────
    {
      title: "Golden datasets and the eval harness",
      blocks: [
        {
          kind: "prose",
          markdown: `## The dataset is the hard part, not the code

The harness code is a weekend project. The *dataset* is where evals live or die. A golden set is a frozen collection of examples with trusted ground-truth labels — the ruler you measure every change against.

Rules for building one that isn't a lie:

- **Source from real traffic.** Invented examples encode your assumptions about the task, not the task. Pull from the customer's actual logs, support tickets, documents. Real inputs are weirder than anything you'd write.
- **Stratify.** Deliberately include the hard cases, the long tail, the categories that matter disproportionately — not just a random skim that's 90% easy.
- **Size for signal.** ~50 examples tells you if something is badly broken. ~200–500 lets you detect the few-percent regressions that decide model migrations. More below the fold has diminishing returns until you're chasing sub-1% deltas.
- **Freeze it, and never train/prompt-tune on it.** The moment you iterate your prompt against the eval set, it stops measuring generalization and starts measuring memorization. Keep a separate dev set for iteration and touch the golden set only to report.
- **Version it.** When the task changes, cut a new version — don't silently mutate the old one, or your historical numbers become meaningless.`,
        },
        {
          kind: "code_comparison",
          label: "Vibes iteration vs harness iteration",
          left: {
            title: "Vibes — the six-week trap",
            code: `# Change the prompt, eyeball a few outputs, ship if they look good.
PROMPT = "Summarize this ticket for the on-call engineer."
out = llm(PROMPT + ticket)
print(out)   # "yeah that reads better"  <- the entire eval

# Two weeks later nobody can say whether v3 beat v2,
# and a model upgrade silently regressed tone. No one notices
# until a customer complains.`,
            annotation:
              "No baseline, no regression net, no defensible claim. Every change is a coin flip.",
          },
          right: {
            title: "Harness — a number per change",
            code: `def evaluate(prompt: str, dataset: list[dict]) -> dict:
    scores = []
    for ex in dataset:                       # frozen golden set
        out = llm(prompt + ex["input"])
        scores.append(grade(out, ex["label"]))   # programmatic + judge
    return {
        "score": sum(scores) / len(scores),
        "n": len(scores),
        "failures": [e for e, s in zip(dataset, scores) if s < 1],
    }

base = evaluate(PROMPT_V2, GOLDEN)
new  = evaluate(PROMPT_V3, GOLDEN)
print(f"v2 {base['score']:.3f}  ->  v3 {new['score']:.3f}")
# Ship v3 only if the delta is positive AND no new failures appear.`,
            annotation:
              "Same golden set every run. A delta you can defend, a failure list you can debug, a gate you can automate.",
          },
          takeaway:
            "The harness is ~30 lines. Its value is not the code — it's that it makes 'is this change better?' a question with a numeric answer, and it surfaces the specific examples that regressed so you can debug them instead of guessing.",
        },
        {
          kind: "scenario_predict",
          label: "Is that improvement real, or noise?",
          language: "text",
          scenario: `You test a new prompt on a 40-example golden set.
  Old prompt: 30/40 correct (75%)
  New prompt: 33/40 correct (82.5%)
The customer wants to ship the new prompt today on the strength of
"a 7.5-point improvement."`,
          question: "What's your read, and what do you do before shipping?",
          answer:
            "3 extra correct out of 40 is well within noise — on a set that small the 95% confidence interval spans roughly ±13 points, so a 'true' difference of zero would routinely produce swings this size. Don't ship on it yet. Either (a) expand the golden set to a few hundred examples so a real few-point effect becomes detectable, or (b) look at *which* 3 examples flipped — if they're a coherent category the new prompt genuinely fixed, that's more convincing than the aggregate. Report the uncertainty honestly rather than selling 7.5 points as fact.",
          explanation:
            "Small eval sets produce large, exciting, meaningless swings. The FDE move is to know the rough size of your confidence interval (it shrinks like 1/√n) and to refuse to over-claim. Nothing burns customer trust faster than shipping a 'win' that evaporates in production because it was sampling noise the whole time.",
        },
        {
          kind: "method_ref",
          title: "Anatomy of a production eval harness",
          importLine: "# The parts you'll build on every engagement",
          methods: [
            {
              signature: "Dataset loader",
              description:
                "Reads the frozen golden set (JSONL: input + label + metadata like category/difficulty). Versioned in the repo.",
              returns: "The single source of truth you measure against.",
            },
            {
              signature: "Runner with concurrency + retries",
              description:
                "Fans out API calls under an asyncio.Semaphore, backs off on 429/5xx, so a 500-example run finishes in minutes not hours.",
              returns:
                "Ties directly to the concurrency and error-handling guides — the eval harness is where those skills pay off.",
            },
            {
              signature: "Graders (mixed)",
              description:
                "Programmatic checks first, LLM-judge for the open-ended slice, each returning a per-example score + reason.",
              returns: "The scoring layer. Keep graders pure and testable.",
            },
            {
              signature: "Reporter",
              description:
                "Aggregate score, per-category breakdown, and — critically — the list of failing examples with their outputs.",
              returns:
                "The breakdown and failure list are what you actually debug from; the single number is just the headline.",
            },
            {
              signature: "Regression gate",
              description:
                "Compare against the last committed score; fail CI if it drops beyond a tolerance.",
              returns: "Turns the eval from a one-off into a standing safety net.",
            },
          ],
        },
      ],
    },
    // ─── Section 5: Evals as first-class product metrics ─────────────────
    {
      title: "Cost, latency, and regression gating",
      blocks: [
        {
          kind: "prose",
          markdown: `## Accuracy is one axis of three

A system that's 95% accurate but takes 40 seconds and costs a dollar a call may be worse for the customer than one that's 90% accurate, sub-second, and a tenth the cost. Treat **cost per successful task** and **latency percentiles** as first-class eval metrics, reported alongside quality every run.

- **Cost per *successful* task**, not per call. If a task takes 3 retries to get right, its real cost is 3 calls plus the failures. Track input/output/cached tokens and divide by success rate.
- **Latency percentiles, not the mean.** p50 is the typical experience; p95/p99 are the experience that generates the angry support ticket. A great average with a horrible tail is a bad product.
- **Regression gating.** Pin the golden set and re-run it on every prompt change, model change, and dependency bump. Diff the score; require sign-off (or fail CI) on a regression. This is the single practice that separates teams that upgrade models confidently from teams that fear every change.`,
        },
        {
          kind: "scenario_predict",
          label: "The model-migration conversation",
          language: "text",
          scenario: `A new, cheaper, faster model ships. Your customer's product runs on the
old one and their PM wants to switch this week to cut the bill in half.
There's a frozen 300-example golden set from the original build.`,
          question: "What's the responsible rollout, and what would make you *not* flip?",
          answer:
            "Run the golden set on both models first — quality, cost, and p95 latency side by side. If the new model matches or beats on quality within your confidence interval and wins on cost/latency, roll it out behind a flag with shadow traffic (serve old, log new, compare on production-realistic inputs) before flipping the default. Don't flip if the golden set shows a quality regression on any category that matters — even if the aggregate is flat, a drop on the high-value 'refund' or 'safety' slice is a blocker. Cheaper and faster is only better if quality holds where it counts.",
          explanation:
            "Model migrations are where the eval harness earns its entire cost. The team with a frozen golden set makes this call in an afternoon with data; the team without one either refuses to upgrade (leaving money and latency on the table) or flips blindly and finds out from customers. Shadow evaluation on real traffic is the belt-and-suspenders step because offline golden sets never fully capture production's long tail.",
        },
        {
          kind: "warm_up",
          title: "Mean vs tail",
          prompt: `Two designs for a chat feature: A has p50 latency 800ms / p99 9s. B has p50 1.4s / p99 2s. Same quality and cost. Which ships, and why?`,
          answer:
            "Usually B. A feels snappy most of the time but 1 in 100 interactions hangs for 9 seconds — the experience that generates complaints and abandoned sessions. B is slightly slower typically but has no ugly tail. For interactive UX, a tight p99 usually beats a fast mean.",
          explanation:
            "Reporting only the mean or p50 hides the tail that actually drives user perception and churn. Always look at p95/p99 for anything a human waits on. The right answer can flip if the task is a background batch job, where mean throughput matters and nobody's watching the tail — which is exactly why you report both.",
        },
        {
          kind: "mini_challenge",
          title: "Build a minimal eval harness",
          prompt: `Write \`evaluate(dataset, generate, grade)\` that:

1. Takes a list of \`{"input": ..., "label": ...}\` examples, a \`generate(input) -> output\` function, and a \`grade(output, label) -> float in [0,1]\` function.
2. Runs every example, collecting per-example scores.
3. Returns a dict with the mean score, the count, and the list of examples that scored below 1.0 (the failures to debug).

Keep it dependency-free. This is the skeleton every real harness grows from — and the backbone of the "Build an eval harness from scratch" practice rep.`,
          hints: [
            "You don't need async for the skeleton — a plain loop is fine; add concurrency once it's correct.",
            "Zip examples with their scores so you can filter out the failures at the end.",
            "Return the failures with enough context (input, output, score) that you can actually debug them, not just a count.",
          ],
          solution: `from dataclasses import dataclass, field

@dataclass
class EvalResult:
    score: float
    n: int
    failures: list = field(default_factory=list)

def evaluate(dataset, generate, grade):
    scored = []
    for ex in dataset:
        output = generate(ex["input"])
        s = grade(output, ex["label"])
        scored.append((ex, output, s))
    mean = sum(s for _, _, s in scored) / len(scored) if scored else 0.0
    failures = [
        {"input": ex["input"], "output": out, "score": s}
        for ex, out, s in scored
        if s < 1.0
    ]
    return EvalResult(score=mean, n=len(scored), failures=failures)

# Usage:
# res = evaluate(golden, lambda x: llm(PROMPT + x), exact_match)
# print(res.score, res.n)
# for f in res.failures: print(f["input"], "->", f["output"])`,
          takeaway:
            "The whole discipline fits in ~15 lines: run the frozen set, score each example, surface the failures. Everything else — concurrency, LLM-judge graders, per-category breakdowns, CI gating — is an extension of this skeleton. Build this first on every engagement.",
        },
      ],
    },
    // ─── Section 6: The FDE framing / interview drill ────────────────────
    {
      title: "The customer conversation and the interview drill",
      blocks: [
        {
          kind: "prose",
          markdown: `## Reframing "it works, ship it"

The most common customer sentence you'll hear is some version of *"we tried it, the output looks great, let's ship."* Your entire value in that moment is to convert enthusiasm into a measurement, without killing the momentum.

The move is not "no, we need evals" (bureaucratic, deflating). It's: *"Love it — let's lock that in so we can keep it as we scale. Can you give me 30 real examples where getting it right really matters, and tell me what 'right' looks like for each? That becomes the bar we hold every future change to."*

You've now: (1) validated their excitement, (2) extracted a golden set, (3) forced them to articulate the success criterion they were grading on vibes, and (4) set up the regression net that protects the win they're excited about. That's eval-driven development sold as insurance rather than homework.`,
        },
        {
          kind: "multiple_choice",
          title: "The hardest eval conversation",
          prompt:
            "A customer says: 'Our task is too subjective to evaluate — quality is a matter of taste, you'll just have to trust the model.' What's the strongest response?",
          choices: [
            {
              text: "'Agreed, some things can't be measured — let's ship and monitor complaints.'",
              correct: false,
              rationale:
                "Cedes the entire discipline. 'Monitor complaints' is a lagging, unquantified signal that tells you about failures only after they've hurt users.",
            },
            {
              text: "'If your reviewers can tell good from bad when they see it, we can write down what they're reacting to — and that rubric is the eval.'",
              correct: true,
              rationale:
                "'Subjective' almost always means 'the criteria are tacit,' not 'there are no criteria.' If a human can consistently sort outputs into better/worse, those judgments can be elicited into a rubric, and pairwise human/LLM-judge evals handle exactly this.",
            },
            {
              text: "'Then we'll use an LLM judge and trust its scores.'",
              correct: false,
              rationale:
                "An LLM judge with no rubric just moves the subjectivity into a model you haven't validated. Without eliciting the criteria first, you can't even tell if the judge is right.",
            },
            {
              text: "'No task is subjective; you just haven't thought about it hard enough.'",
              correct: false,
              rationale:
                "Correct-ish in spirit, catastrophic in tone. You'll win the argument and lose the customer.",
            },
          ],
          explanation:
            "Truly subjective tasks are rarer than customers think. The test: can two reviewers, shown the same pair of outputs, agree on which is better more often than chance? If yes, there are criteria — they're just unstated. Elicit them (interview reviewers, have them label pairs and explain), turn them into a rubric, measure inter-annotator agreement, and now you have a pairwise eval. 'It's subjective' is the start of the eval-design conversation, not the end of it.",
        },
        {
          kind: "scenario_predict",
          label: "Live whiteboard: design an eval in 5 minutes",
          language: "text",
          scenario: `An interviewer says: "A customer wants Claude to answer employee HR
questions from their policy PDFs. It has to be accurate, must never
invent policy, and must say 'ask HR' when unsure. Design the eval."`,
          question: "Walk through your answer.",
          answer:
            "1) Golden set: pull ~150 real HR questions from their ticket history, stratified across policy areas plus deliberately-included out-of-policy and ambiguous ones; label each with the correct answer OR 'should defer to HR'. 2) Graders: (a) programmatic — did it cite a real policy chunk that exists? does it defer when the label says defer? (b) LLM-judge with a rubric — is the answer faithful to the cited policy (no invented rules)? 3) Headline metrics: faithfulness rate, correct-deferral rate (recall on 'unsure' cases — a miss here means confidently wrong HR advice), and hallucination rate (answers with no supporting chunk). 4) Cost/latency reported alongside. 5) Freeze it, gate every prompt/model change on it, and shadow-eval before any model swap. The non-negotiable metric is that it never fabricates policy — I'd optimize the deferral threshold toward recall on 'unsure.'",
          explanation:
            "The structure interviewers listen for: real stratified data → mixed graders (programmatic where possible, judge where not) → metrics chosen from the *cost of each error* (here, fabricated policy is the catastrophic one, so faithfulness and deferral dominate) → freeze + gate + shadow. Leading with 'what's the worst error and how do I measure it?' is what distinguishes an FDE answer from a generic 'I'd check accuracy.'",
        },
        {
          kind: "flashcard",
          front:
            "The one-sentence version of eval-driven development to give a customer.",
          back: "We agree up front, in writing, on a set of real examples and what 'right' looks like for each — then every change we make has to move that number up without breaking anything else, and you can see it. It turns 'trust us' into 'here's the measurement,' makes model upgrades a data decision instead of a leap of faith, and protects the quality you're happy with today from silently eroding tomorrow.",
        },
      ],
    },
  ],
};
