import type { AppState, Topic, PracticeRep, Category, Resource } from "./types";

/** Derive a stable, URL-safe slug from a title. */
function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function topic(
  title: string,
  category: Category,
  description: string,
  estimatedMinutes: number,
  resources: Resource[],
): Topic {
  return {
    id: slug(title),
    title,
    category,
    description,
    estimatedMinutes,
    resources,
    status: "not_started",
    notes: "",
    completedAt: null,
  };
}

function rep(title: string, promptMarkdown: string, durationMinutes: number): PracticeRep {
  return {
    id: slug(title),
    title,
    promptMarkdown,
    durationMinutes,
    completedAt: null,
    retroNotes: "",
  };
}

export function seedState(): AppState {
  const topics: Topic[] = [
    // ── Python Fluency ───────────────────────────────────────────────────
    topic(
      "collections module deep dive",
      "python_fluency",
      "Master `defaultdict`, `Counter`, `deque`, `OrderedDict`, and `ChainMap`. Know when each is the right choice over a plain dict/list and be able to reach for them instantly in timed coding sessions.",
      90,
      [
        { label: "Python docs — collections", url: "https://docs.python.org/3/library/collections.html" },
      ],
    ),
    topic(
      "itertools & functools patterns",
      "python_fluency",
      "Fluency with `itertools.chain`, `groupby`, `product`, `combinations`, `starmap`, plus `functools.lru_cache`, `partial`, and `reduce`. These come up constantly when processing batches of LLM outputs.",
      90,
      [
        { label: "Python docs — itertools", url: "https://docs.python.org/3/library/itertools.html" },
        { label: "Python docs — functools", url: "https://docs.python.org/3/library/functools.html" },
      ],
    ),
    topic(
      "dataclasses & typing patterns",
      "python_fluency",
      "Use `@dataclass`, `field()`, `__post_init__`, frozen dataclasses, and `TypedDict`/`Protocol` for structural subtyping. Anthropic codebases lean heavily on typed data containers.",
      60,
      [
        { label: "Python docs — dataclasses", url: "https://docs.python.org/3/library/dataclasses.html" },
      ],
    ),
    topic(
      "argparse & CLI patterns",
      "python_fluency",
      "Build CLI tools with subcommands, mutually exclusive groups, and custom types. FDE work often involves writing quick CLI wrappers for customer demos and internal tooling.",
      45,
      [
        { label: "Python docs — argparse", url: "https://docs.python.org/3/library/argparse.html" },
      ],
    ),

    // ── Concurrency ──────────────────────────────────────────────────────
    topic(
      "asyncio semaphore & gather patterns",
      "concurrency",
      "Understand the asyncio event loop, `asyncio.gather`, `asyncio.Semaphore` for rate limiting, and `asyncio.Queue` for producer/consumer. Critical for batching Anthropic API calls without hitting rate limits.",
      90,
      [
        { label: "Python docs — asyncio", url: "https://docs.python.org/3/library/asyncio.html" },
      ],
    ),
    topic(
      "ThreadPoolExecutor & ProcessPoolExecutor",
      "concurrency",
      "Know when to use threads (I/O-bound) vs processes (CPU-bound) via `concurrent.futures`. Be able to wrap sync SDK calls in a thread pool for concurrency when an async client isn't available.",
      60,
      [
        { label: "Python docs — concurrent.futures", url: "https://docs.python.org/3/library/concurrent.futures.html" },
      ],
    ),
    topic(
      "When to use which concurrency model",
      "concurrency",
      "Decision framework: asyncio for many I/O-bound tasks (API calls, file reads), threads for blocking I/O in sync code, processes for CPU-bound work (embedding computation, data processing). Know the GIL implications.",
      45,
      [
        { label: "Real Python — Concurrency", url: "https://realpython.com/python-concurrency/" },
      ],
    ),

    // ── Anthropic SDK ────────────────────────────────────────────────────
    topic(
      "Messages API & structured output",
      "anthropic_sdk",
      "Master the Messages API: system prompts, multi-turn conversation format, `max_tokens`, stop sequences, temperature. Know how to extract structured JSON from model responses using tool use or output schemas.",
      90,
      [
        { label: "Anthropic docs — Messages API", url: "https://docs.anthropic.com/en/api/messages" },
      ],
    ),
    topic(
      "Tool use loop implementation",
      "anthropic_sdk",
      "Implement a full tool-use agentic loop: define tools with JSON schema, handle `tool_use` stop reason, execute the tool, return `tool_result`, and continue the conversation. Handle errors and retries gracefully.",
      120,
      [
        { label: "Anthropic docs — Tool use", url: "https://docs.anthropic.com/en/docs/build-with-claude/tool-use" },
      ],
    ),
    topic(
      "Streaming & prompt caching",
      "anthropic_sdk",
      "Use the streaming API with `client.messages.stream()` for real-time UX. Understand prompt caching (`cache_control` blocks) to reduce latency and cost for system prompts and few-shot examples.",
      60,
      [
        { label: "Anthropic docs — Streaming", url: "https://docs.anthropic.com/en/api/streaming" },
        { label: "Anthropic docs — Prompt caching", url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching" },
      ],
    ),
    topic(
      "Batch API",
      "anthropic_sdk",
      "Use the Message Batches API for high-throughput offline workloads: eval runs, data labeling, bulk classification. Understand the 50% cost reduction, the 24-hour SLA, and how to poll for results.",
      45,
      [
        { label: "Anthropic docs — Batches", url: "https://docs.anthropic.com/en/docs/build-with-claude/batch-processing" },
      ],
    ),
    topic(
      "Error handling, retries & rate limits",
      "anthropic_sdk",
      "Master the Anthropic SDK error hierarchy (`APIStatusError`, `RateLimitError`, `APIConnectionError`, `OverloadedError`). Know which status codes are retry-worthy (429/5xx/529) vs not (4xx), how the SDK's built-in retries work, and how to write exponential backoff with jitter on top. Use `retry-after` and `anthropic-ratelimit-*` headers for adaptive backoff. Always log the `request-id` for support.",
      60,
      [
        { label: "Anthropic docs — Errors", url: "https://docs.anthropic.com/en/api/errors" },
        { label: "Anthropic docs — Rate limits", url: "https://docs.anthropic.com/en/api/rate-limits" },
      ],
    ),
    topic(
      "Token counting & context budgeting",
      "anthropic_sdk",
      "Use `client.messages.count_tokens()` to size prompts before sending. Budget messages so input + `max_tokens` stays under the model context window. Implement sliding-window strategies for long conversations and leave headroom for streamed output. Critical for cost control and avoiding 400s on overlong requests.",
      45,
      [
        { label: "Anthropic docs — Token counting", url: "https://docs.anthropic.com/en/docs/build-with-claude/token-counting" },
      ],
    ),
    topic(
      "Vision & PDF inputs",
      "anthropic_sdk",
      "Send images and PDFs as message content. Know image content blocks (base64 vs URL source), supported MIME types, the PDF input feature, multi-page handling, and when to OCR upstream vs send native PDFs to the model. Common in customer demos for document-heavy workflows.",
      60,
      [
        { label: "Anthropic docs — Vision", url: "https://docs.anthropic.com/en/docs/build-with-claude/vision" },
        { label: "Anthropic docs — PDF support", url: "https://docs.anthropic.com/en/docs/build-with-claude/pdf-support" },
      ],
    ),
    topic(
      "Files API & Citations",
      "anthropic_sdk",
      "Upload documents via the Files API and reference them in messages. Enable the citations feature so Claude returns source references inline with its answer. Parse `citations` blocks in the response and surface them in your UI. The cleanest path to a doc-grounded answer with provenance.",
      75,
      [
        { label: "Anthropic docs — Files API", url: "https://docs.anthropic.com/en/docs/build-with-claude/files" },
        { label: "Anthropic docs — Citations", url: "https://docs.anthropic.com/en/docs/build-with-claude/citations" },
      ],
    ),

    // ── Evals ────────────────────────────────────────────────────────────
    topic(
      "Precision, recall, F1 for LLM evals",
      "evals",
      "Understand classification metrics applied to LLM outputs: when to optimize for precision vs recall, micro vs macro averaging, and how to build confusion matrices for multi-class prompt outputs.",
      60,
      [
        { label: "Anthropic docs — Evals overview", url: "https://docs.anthropic.com/en/docs/build-with-claude/develop-tests" },
      ],
    ),
    topic(
      "LLM-as-judge bias modes",
      "evals",
      "Know the failure modes of using an LLM to grade another LLM: position bias, verbosity bias, self-preference bias, sycophancy. Mitigation strategies include randomized ordering, rubric anchoring, and multi-judge ensembles.",
      75,
      [
        { label: "Anthropic cookbook — Evals", url: "https://github.com/anthropics/anthropic-cookbook/tree/main/misc/prompt_evaluations.ipynb" },
      ],
    ),
    topic(
      "Golden datasets & contextual retrieval evals",
      "evals",
      "Build golden test sets with human-labeled ground truth. Evaluate RAG pipelines end-to-end: retrieval recall@k, answer faithfulness, and hallucination rate. Use contextual retrieval to improve chunk relevance.",
      90,
      [
        { label: "Anthropic — Contextual Retrieval", url: "https://www.anthropic.com/news/contextual-retrieval" },
      ],
    ),

    // ── Retrieval ────────────────────────────────────────────────────────
    topic(
      "BM25 & hybrid retrieval",
      "retrieval",
      "Understand BM25 (TF-IDF variant) as a lexical baseline. Implement hybrid retrieval combining BM25 with dense embeddings via reciprocal rank fusion (RRF). Know when lexical search beats semantic search.",
      90,
      [
        { label: "Wikipedia — BM25", url: "https://en.wikipedia.org/wiki/Okapi_BM25" },
      ],
    ),
    topic(
      "Rerankers & cross-encoders",
      "retrieval",
      "Use a two-stage retrieval pipeline: fast candidate retrieval (BM25 or ANN) followed by a cross-encoder reranker for precision. Understand the latency/accuracy tradeoff and when reranking is worth it.",
      60,
      [
        { label: "Cohere docs — Rerank", url: "https://docs.cohere.com/reference/rerank" },
      ],
    ),
    topic(
      "Chunking strategies",
      "retrieval",
      "Compare fixed-size, sentence-based, recursive, and semantic chunking. Understand overlap, chunk size tradeoffs (too small = no context, too large = noise), and how contextual retrieval adds document-level context to each chunk.",
      60,
      [
        { label: "Anthropic — Contextual Retrieval", url: "https://www.anthropic.com/news/contextual-retrieval" },
      ],
    ),
    topic(
      "HNSW & vector index internals",
      "retrieval",
      "Understand Hierarchical Navigable Small World graphs: construction, search complexity, parameter tuning (M, efConstruction, efSearch). Know why HNSW dominates approximate nearest neighbor benchmarks and its memory tradeoffs.",
      75,
      [
        { label: "arXiv — HNSW paper", url: "https://arxiv.org/abs/1603.09320" },
      ],
    ),

    // ── Enterprise Deployment ────────────────────────────────────────────
    topic(
      "Bedrock & cross-region inference",
      "enterprise_deployment",
      "Deploy Claude via Amazon Bedrock: model access requests, InvokeModel API, cross-region inference profiles, and the differences from the direct Anthropic API. Understand why enterprises choose Bedrock for compliance.",
      90,
      [
        { label: "AWS docs — Bedrock Claude", url: "https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages.html" },
      ],
    ),
    topic(
      "VPC, PrivateLink & IAM assume-role",
      "enterprise_deployment",
      "Understand VPC endpoints and AWS PrivateLink for keeping API traffic off the public internet. Know IAM assume-role patterns for cross-account access — common in enterprise deployments where the AI team and security team have separate AWS accounts.",
      75,
      [
        { label: "AWS docs — PrivateLink", url: "https://docs.aws.amazon.com/vpc/latest/privatelink/what-is-privatelink.html" },
      ],
    ),
    topic(
      "SOC2, HIPAA & data residency",
      "enterprise_deployment",
      "Know what SOC2 Type II, HIPAA BAA, and data residency requirements mean for LLM deployments. Understand zero-data-retention (ZDR) policies, how prompt/completion logging interacts with compliance, and Anthropic's trust center.",
      60,
      [
        { label: "Anthropic — Trust Center", url: "https://trust.anthropic.com" },
      ],
    ),
    topic(
      "Observability stack for LLM apps",
      "enterprise_deployment",
      "Instrument LLM applications: structured logging of prompts/completions, latency percentiles, token usage tracking, error rate dashboards. Tools: OpenTelemetry, Langfuse, Datadog LLM Observability, custom CloudWatch metrics.",
      60,
      [
        { label: "Langfuse docs", url: "https://langfuse.com/docs" },
      ],
    ),

    // ── Developer Tools ─────────────────────────────────────────────────
    topic(
      "git patterns for collaborative work",
      "developer_tools",
      "Master branching, rebasing, stashing, cherry-pick, bisect, and reflog. Know how to untangle messy histories, stage with precision, and work confidently with remotes. You can't fumble git in a live customer session.",
      75,
      [
        { label: "Pro Git book", url: "https://git-scm.com/book/en/v2" },
      ],
    ),
    topic(
      "bash scripting & CLI fluency",
      "developer_tools",
      "Fluency with pipes, redirects, grep/sed/awk, find/xargs, jq, curl, and bash scripting patterns (loops, conditionals, error handling). Critical for SSH debugging sessions, quick data munging, and writing deployment scripts.",
      75,
      [
        { label: "GNU Bash manual", url: "https://www.gnu.org/software/bash/manual/bash.html" },
      ],
    ),

    // ── Research Reading ─────────────────────────────────────────────────
    topic(
      "Constitutional AI paper",
      "research",
      "Read and internalize the Constitutional AI paper: RLHF from AI feedback using a constitution of principles, the two-phase training process (SL-CAI then RL-CAI), and why this matters for alignment. Be able to explain it simply to a customer.",
      120,
      [
        { label: "arXiv — Constitutional AI", url: "https://arxiv.org/abs/2212.08073" },
      ],
    ),
    topic(
      "Claude system card & model behavior",
      "research",
      "Read the latest Claude model card: capabilities, limitations, safety evaluations, and the character training methodology. Understand how Anthropic thinks about honesty, harmlessness, and helpfulness tradeoffs.",
      90,
      [
        { label: "Anthropic — Claude model card", url: "https://docs.anthropic.com/en/docs/about-claude/models" },
      ],
    ),
    topic(
      "Interpretability: Scaling Monosemanticity",
      "research",
      "Read the 'Scaling Monosemanticity' post on extracting interpretable features from Claude using sparse autoencoders. Understand what monosemantic neurons are, why polysemanticity is a problem, and the implications for AI safety.",
      90,
      [
        { label: "Anthropic — Scaling Monosemanticity", url: "https://www.anthropic.com/research/mapping-mind-language-model" },
      ],
    ),
  ];

  const practiceReps: PracticeRep[] = [
    rep(
      "Build an eval harness from scratch",
      `## Cold Build: Eval Harness (60 min)

**Objective:** Build a Python eval harness that:

1. Loads a golden dataset from a JSONL file (each line: \`{"input": "...", "expected": "..."}\`)
2. Runs each input through the Anthropic Messages API
3. Scores responses using both exact-match and an LLM-as-judge
4. Outputs a summary with precision, recall, F1, and per-example breakdowns to a CSV

**Constraints:**
- Use \`asyncio.Semaphore\` to rate-limit concurrent API calls
- Use \`dataclasses\` for all data structures
- Handle API errors with exponential backoff
- The judge prompt should use a rubric you define

**Stretch goals:**
- Add \`argparse\` CLI with flags for model, max-concurrency, and dataset path
- Compute inter-rater agreement between exact-match and LLM-judge`,
      60,
    ),
    rep(
      "RAG pipeline from scratch",
      `## Cold Build: RAG Pipeline (60 min)

**Objective:** Build a minimal RAG pipeline in Python that:

1. Ingests a directory of markdown files
2. Chunks them using recursive text splitting (configurable chunk size + overlap)
3. Embeds chunks using a simple embedding approach (TF-IDF or an API)
4. Stores embeddings in an in-memory FAISS or numpy index
5. At query time: embed the query, retrieve top-k chunks, stuff them into a Claude prompt, return the answer

**Constraints:**
- No LangChain or LlamaIndex — raw Python + anthropic SDK
- Use \`dataclasses\` for Document, Chunk, and RetrievalResult
- Implement both naive (top-k cosine) and RRF-based retrieval if you have a BM25 baseline
- Print retrieved chunks before the final answer for debuggability

**Stretch goals:**
- Add contextual retrieval: prepend document-level summary to each chunk before embedding
- Add a reranking step using Claude as a cross-encoder`,
      60,
    ),
    rep(
      "Tool-use agent from scratch",
      `## Cold Build: Tool-Use Agent (60 min)

**Objective:** Build a tool-use agent loop in Python that:

1. Defines 3+ tools (e.g., \`search_web\`, \`read_file\`, \`run_python\`) with JSON schemas
2. Sends the user query to Claude with tool definitions
3. When Claude returns a \`tool_use\` block, executes the tool and returns the result
4. Continues the loop until Claude produces a final text response
5. Handles multi-step tool chains (Claude calls tool A, uses result to call tool B)

**Constraints:**
- Use the Anthropic Python SDK \`client.messages.create()\`
- Tools should be real (actually read files, actually run Python via subprocess)
- Add a maximum iteration limit to prevent infinite loops
- Log each turn of the conversation for debugging

**Stretch goals:**
- Add streaming so the user sees partial responses in real-time
- Implement tool-level error handling (if a tool throws, return the error to Claude gracefully)
- Add a \`confirm_action\` tool that asks the user before destructive operations`,
      60,
    ),
  ];

  return {
    topics,
    practiceReps,
    dailyLogs: [],
  };
}
