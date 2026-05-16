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
    secondsStudied: 0,
    lastStudiedAt: null,
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
      "Build CLI tools with subcommands, mutually exclusive groups, and custom types. Applied AI work often involves writing quick CLI wrappers for customer demos and internal tooling.",
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

    // ── Python Fluency (additions) ───────────────────────────────────────
    topic(
      "Pydantic v2 fundamentals",
      "python_fluency",
      "Build Pydantic v2 models for request/response validation: `BaseModel`, `Field` constraints, validators, `model_dump()`/`model_validate()`, discriminated unions, and `ConfigDict`. Pydantic is the de facto schema layer for LLM tool definitions, FastAPI, and Anthropic SDK structured output.",
      75,
      [{ label: "Pydantic v2 docs", url: "https://docs.pydantic.dev/latest/" }],
    ),
    topic(
      "Context managers & generators",
      "python_fluency",
      "Write your own `__enter__`/`__exit__` and `contextlib.contextmanager`. Fluency with generator functions, `yield from`, and async generators. Critical for streaming APIs, resource cleanup, and writing iterator-based data pipelines.",
      45,
      [{ label: "Python docs — contextlib", url: "https://docs.python.org/3/library/contextlib.html" }],
    ),
    topic(
      "Testing patterns: pytest, fixtures, mocking",
      "python_fluency",
      "Write idiomatic pytest tests: fixtures, parametrize, monkeypatch, `unittest.mock`, freezegun for time, vcr/respx for HTTP recording. Know how to test LLM-dependent code without burning tokens.",
      75,
      [{ label: "pytest docs", url: "https://docs.pytest.org/" }],
    ),

    // ── Anthropic SDK (additions) ────────────────────────────────────────
    topic(
      "Computer use & agentic tool loops",
      "anthropic_sdk",
      "Use Claude's computer-use beta tools (screenshot, click, type, key) to drive a virtual desktop. Understand the sandboxing model, latency profile, and where computer use beats traditional API integrations.",
      90,
      [{ label: "Anthropic docs — Computer use", url: "https://docs.anthropic.com/en/docs/build-with-claude/computer-use" }],
    ),
    topic(
      "MCP servers",
      "anthropic_sdk",
      "Build and consume Model Context Protocol servers. Understand the MCP architecture (servers expose tools/resources/prompts to MCP clients like Claude Desktop), the JSON-RPC wire format, and how to ship a custom MCP server in Python or TypeScript.",
      90,
      [{ label: "MCP spec", url: "https://modelcontextprotocol.io/" }],
    ),
    topic(
      "Extended thinking patterns",
      "anthropic_sdk",
      "Use Claude's extended thinking (`thinking` parameter) for hard reasoning tasks. Know the latency/quality tradeoff, how to parse `thinking` content blocks, and when extended thinking beats plain prompting or multi-step chains.",
      45,
      [{ label: "Anthropic docs — Extended thinking", url: "https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking" }],
    ),

    // ── Evals (additions) ────────────────────────────────────────────────
    topic(
      "Cost & latency evals",
      "evals",
      "Treat cost-per-task and p50/p95/p99 latency as first-class eval metrics alongside accuracy. Track input/output tokens per request, cached tokens, and effective $/successful-task. Set SLOs and gate releases on latency regressions.",
      45,
      [{ label: "Anthropic docs — Develop tests", url: "https://docs.anthropic.com/en/docs/build-with-claude/develop-tests" }],
    ),
    topic(
      "Regression testing for prompts",
      "evals",
      "Pin a frozen eval set and run it on every prompt or model change. Diff outputs, surface regressions, and require sign-off before merging. The minimum bar for production prompt engineering.",
      60,
      [{ label: "Anthropic — Prompt evaluation", url: "https://docs.anthropic.com/en/docs/build-with-claude/develop-tests" }],
    ),
    topic(
      "Human-in-the-loop labeling",
      "evals",
      "Build labeling workflows that combine LLM pre-labels with human review. Track inter-annotator agreement, design rubrics that minimize ambiguity, and decide what fraction needs human review vs auto-label.",
      45,
      [{ label: "Scale — Labeling best practices", url: "https://scale.com/blog" }],
    ),
    topic(
      "Standard benchmarks (MMLU, HumanEval, MT-Bench, etc.)",
      "evals",
      "Know what the major public benchmarks actually measure, their limitations (contamination, ceiling effects, format sensitivity), and when published benchmark scores translate to your use case vs when they don't.",
      60,
      [{ label: "HELM benchmark", url: "https://crfm.stanford.edu/helm/" }],
    ),
    topic(
      "Custom benchmark design",
      "evals",
      "Design a benchmark for a customer's actual task: pick the right metric (exact match, F1, BLEU, judge score), build a rubric, choose dataset size for statistical power, and avoid common pitfalls (leakage, prompt overfitting, single-judge bias).",
      75,
      [{ label: "Anthropic — Evals", url: "https://docs.anthropic.com/en/docs/build-with-claude/develop-tests" }],
    ),

    // ── Retrieval (additions) ────────────────────────────────────────────
    topic(
      "Metadata filtering & query routing",
      "retrieval",
      "Combine semantic search with hard metadata filters (date ranges, source, permissions). Route queries to different indexes based on classifier output. Critical for multi-tenant or permissioned RAG.",
      60,
      [{ label: "Pinecone — Metadata filtering", url: "https://docs.pinecone.io/guides/data/filter-with-metadata" }],
    ),
    topic(
      "Contextual retrieval",
      "retrieval",
      "Implement Anthropic's contextual retrieval: prepend a document-aware summary to each chunk before embedding. Combine with BM25 + reranking for ~50% reduction in retrieval failures.",
      45,
      [{ label: "Anthropic — Contextual Retrieval", url: "https://www.anthropic.com/news/contextual-retrieval" }],
    ),
    topic(
      "GraphRAG & knowledge graphs",
      "retrieval",
      "Build knowledge graphs from documents and use graph traversal for retrieval. Understand the GraphRAG pipeline (entity extraction → graph build → community summarization → query). Know when GraphRAG beats vector RAG.",
      75,
      [{ label: "Microsoft — GraphRAG", url: "https://github.com/microsoft/graphrag" }],
    ),
    topic(
      "Long-context vs RAG decision framework",
      "retrieval",
      "Decide when to stuff everything into Claude's 200k context vs build a retrieval pipeline. Tradeoffs: cost, latency, freshness, attention-on-haystack accuracy. Often the right answer is a hybrid.",
      45,
      [{ label: "Anthropic — Long context", url: "https://www.anthropic.com/news/100k-context-windows" }],
    ),
    topic(
      "Agentic retrieval",
      "retrieval",
      "Give Claude search tools and let it plan its own retrieval: query rewriting, multi-hop search, iterative refinement. Compare to static RAG pipelines on cost, latency, and quality.",
      60,
      [{ label: "Anthropic — Building effective agents", url: "https://www.anthropic.com/research/building-effective-agents" }],
    ),

    // ── Enterprise Deployment (additions) ────────────────────────────────
    topic(
      "GCP Vertex AI deployment",
      "enterprise_deployment",
      "Deploy Claude on Google Cloud Vertex AI: model garden, regional endpoints, IAM, VPC-SC. Know the differences from Bedrock and the direct API, and why enterprises pick GCP.",
      60,
      [{ label: "Vertex AI — Claude", url: "https://cloud.google.com/vertex-ai/generative-ai/docs/partner-models/use-claude" }],
    ),
    topic(
      "Secrets management",
      "enterprise_deployment",
      "Use AWS Secrets Manager, GCP Secret Manager, or HashiCorp Vault for API keys. Rotate keys without downtime, scope keys per environment, and avoid the classic mistakes (committed .env, shared keys, no audit trail).",
      45,
      [{ label: "AWS Secrets Manager", url: "https://docs.aws.amazon.com/secretsmanager/" }],
    ),
    topic(
      "Cost monitoring & FinOps for LLMs",
      "enterprise_deployment",
      "Build dashboards that attribute token spend to users, features, and prompts. Set budget alerts, identify runaway prompts, and build cost guardrails (per-user rate limits, max-token caps).",
      45,
      [{ label: "Anthropic — Usage tracking", url: "https://docs.anthropic.com/en/api/admin-api/usage-cost/get-cost-report" }],
    ),

    // ── Research Reading (additions) ─────────────────────────────────────
    topic(
      "Attention Is All You Need",
      "research",
      "The original transformer paper. Read it, understand scaled dot-product attention, multi-head attention, and positional encodings. Know why this architecture replaced RNNs/LSTMs.",
      90,
      [{ label: "arXiv — Attention", url: "https://arxiv.org/abs/1706.03762" }],
    ),
    topic(
      "Chinchilla scaling laws",
      "research",
      "Hoffmann et al. 2022. Understand compute-optimal training: for a fixed compute budget, model size and data size should scale roughly equally. Implications for why bigger isn't always better.",
      60,
      [{ label: "arXiv — Chinchilla", url: "https://arxiv.org/abs/2203.15556" }],
    ),
    topic(
      "RAG paper (Lewis et al.)",
      "research",
      "The original RAG paper. Understand the retriever + generator joint training, and how it differs from modern in-context RAG. Useful context for design discussions.",
      60,
      [{ label: "arXiv — RAG", url: "https://arxiv.org/abs/2005.11401" }],
    ),
    topic(
      "Toolformer & ReAct",
      "research",
      "Two seminal tool-use papers. Toolformer: self-supervised learning of when to call APIs. ReAct: interleaved reasoning + acting traces. Foundations for modern agent loops.",
      75,
      [
        { label: "arXiv — Toolformer", url: "https://arxiv.org/abs/2302.04761" },
        { label: "arXiv — ReAct", url: "https://arxiv.org/abs/2210.03629" },
      ],
    ),
    topic(
      "Reflexion",
      "research",
      "Shinn et al. 2023. Verbal reinforcement: agents reflect on their own failures and update a persistent memory. The intellectual ancestor of self-improving agent loops.",
      60,
      [{ label: "arXiv — Reflexion", url: "https://arxiv.org/abs/2303.11366" }],
    ),
    topic(
      "DPO (Direct Preference Optimization)",
      "research",
      "Rafailov et al. 2023. Train preference-aligned models without a separate reward model — fits preferences directly via a clever loss. Now the dominant post-training method.",
      75,
      [{ label: "arXiv — DPO", url: "https://arxiv.org/abs/2305.18290" }],
    ),
    topic(
      "LoRA",
      "research",
      "Hu et al. 2021. Low-Rank Adaptation for parameter-efficient fine-tuning. Understand the math (rank decomposition of weight updates) and why it's the default PEFT method.",
      60,
      [{ label: "arXiv — LoRA", url: "https://arxiv.org/abs/2106.09685" }],
    ),
    topic(
      "FlashAttention",
      "research",
      "Dao et al. 2022. IO-aware exact attention via tiling. Understand why attention is memory-bound, how FlashAttention rewrites the kernel, and why it became the default in every serving stack.",
      60,
      [{ label: "arXiv — FlashAttention", url: "https://arxiv.org/abs/2205.14135" }],
    ),
    topic(
      "Mixture of Experts",
      "research",
      "Shazeer et al. & Switch Transformer. Understand sparse MoE, top-k routing, load balancing losses, and the cost/quality tradeoffs that make MoE attractive for frontier models.",
      75,
      [{ label: "arXiv — Switch Transformer", url: "https://arxiv.org/abs/2101.03961" }],
    ),
    topic(
      "Many-shot ICL",
      "research",
      "Agarwal et al. 2024. With long context, hundreds of examples can rival fine-tuning on many tasks. Know the regimes where many-shot wins and where it doesn't.",
      45,
      [{ label: "arXiv — Many-shot ICL", url: "https://arxiv.org/abs/2404.11018" }],
    ),
    topic(
      "Sleeper Agents",
      "research",
      "Hubinger et al. 2024 (Anthropic). Models can be trained with hidden backdoors that survive safety training. Implications for trust, evals, and supply chain security.",
      60,
      [{ label: "arXiv — Sleeper Agents", url: "https://arxiv.org/abs/2401.05566" }],
    ),
    topic(
      "Building Effective Agents (Anthropic)",
      "research",
      "Anthropic's engineering blog on agent patterns. Workflows (prompt chaining, routing, parallelization) vs true agents. Use this as your design vocabulary in customer conversations.",
      45,
      [{ label: "Anthropic — Building effective agents", url: "https://www.anthropic.com/research/building-effective-agents" }],
    ),

    // ── Agent Architecture ───────────────────────────────────────────────
    topic(
      "Workflow vs agent decision framework",
      "agent_architecture",
      "Decide between a deterministic workflow (prompt chains, routing, parallelization) and a true agent (LLM-controlled loop with tools). Workflows win on cost/latency/predictability; agents win on open-ended tasks. Bias toward workflows.",
      45,
      [{ label: "Anthropic — Building effective agents", url: "https://www.anthropic.com/research/building-effective-agents" }],
    ),
    topic(
      "Multi-agent orchestration",
      "agent_architecture",
      "Coordinate multiple specialized agents (planner, executor, critic). Understand handoff protocols, shared scratchpads, and the failure modes (drift, infinite loops, context bloat).",
      75,
      [{ label: "Anthropic — Multi-agent research", url: "https://www.anthropic.com/research" }],
    ),
    topic(
      "Tool design for agents",
      "agent_architecture",
      "Design tools that LLMs actually use correctly: clear names, narrow scope, descriptive parameters, error messages designed for the model to recover. Anti-patterns: overloaded mega-tools, ambiguous booleans.",
      60,
      [{ label: "Anthropic docs — Tool use", url: "https://docs.anthropic.com/en/docs/build-with-claude/tool-use" }],
    ),
    topic(
      "Agent memory architectures",
      "agent_architecture",
      "Compare scratchpad memory (in-context), episodic memory (DB-backed), and semantic memory (vector store). Know summarization strategies for long-horizon agents and how to avoid context bloat.",
      60,
      [{ label: "MemGPT paper", url: "https://arxiv.org/abs/2310.08560" }],
    ),

    // ── Prompt Engineering at Scale ──────────────────────────────────────
    topic(
      "Prompt versioning & registry",
      "prompt_engineering",
      "Treat prompts as code: version them, store in a registry (DB, files, or a service like Anthropic's prompt management), tag deployments, and roll back on regression. No more prompts buried in f-strings.",
      45,
      [{ label: "Anthropic — Prompt engineering", url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview" }],
    ),
    topic(
      "Dynamic few-shot example selection",
      "prompt_engineering",
      "Select few-shot examples per-query using embedding similarity or classification. Beats static few-shot when your task has subdomains. Be careful about example leakage across train/eval.",
      60,
      [{ label: "Anthropic — Few-shot prompting", url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/multishot-prompting" }],
    ),
    topic(
      "Chain-of-thought & extended thinking",
      "prompt_engineering",
      "Know when CoT helps (math, multi-step reasoning) and when it hurts (factual recall, low-latency tasks). Use Claude's extended thinking instead of inline CoT when reasoning depth matters.",
      45,
      [{ label: "Anthropic — Chain-of-thought", url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/chain-of-thought" }],
    ),
    topic(
      "Structured output patterns",
      "prompt_engineering",
      "Get reliable JSON: tool-use trick, prefilled assistant messages, Pydantic schemas. Know the failure modes (truncation, escaping, schema drift) and how to recover.",
      60,
      [{ label: "Anthropic — Structured output", url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/prefill-claudes-response" }],
    ),

    // ── Production LLM Patterns ──────────────────────────────────────────
    topic(
      "Idempotency & request IDs",
      "production_patterns",
      "Make LLM-backed endpoints idempotent: client-supplied request IDs, dedupe windows, deterministic seeds where possible. Critical for safe retries and exactly-once semantics on non-deterministic backends.",
      45,
      [{ label: "Stripe — Idempotency", url: "https://stripe.com/docs/api/idempotent_requests" }],
    ),
    topic(
      "Circuit breakers & graceful degradation",
      "production_patterns",
      "When Claude is overloaded or down, fall back: smaller model, cached response, deterministic stub. Implement circuit breakers so a transient API outage doesn't take down your product.",
      60,
      [{ label: "Martin Fowler — Circuit Breaker", url: "https://martinfowler.com/bliki/CircuitBreaker.html" }],
    ),
    topic(
      "Caching strategies beyond prompt caching",
      "production_patterns",
      "Layer caches: Anthropic prompt cache (5min/1hr), semantic response cache (embedding-keyed), exact-match cache, edge cache for static prefixes. Each tier saves different costs.",
      45,
      [{ label: "Anthropic — Prompt caching", url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching" }],
    ),
    topic(
      "Async job queues for long-running LLM work",
      "production_patterns",
      "Push long requests (batch eval, document processing) into a queue (SQS, Celery, BullMQ). Stream status to the UI, persist results, handle retries. Don't tie up HTTP workers on 60s LLM calls.",
      60,
      [{ label: "Celery docs", url: "https://docs.celeryq.dev/" }],
    ),

    // ── Model Selection & Routing ────────────────────────────────────────
    topic(
      "Claude model family tradeoffs",
      "model_selection",
      "Know Opus vs Sonnet vs Haiku tradeoffs: capability ceilings, latency, cost-per-1M-tokens, context window. Build a mental model for which task gets which tier.",
      45,
      [{ label: "Anthropic — Models", url: "https://docs.anthropic.com/en/docs/about-claude/models" }],
    ),
    topic(
      "Cascading & model routing",
      "model_selection",
      "Cascade requests: try Haiku, escalate to Sonnet, escalate to Opus only when needed. Or route by classifier. Often 5-10x cost reduction with minimal quality loss.",
      60,
      [{ label: "FrugalGPT paper", url: "https://arxiv.org/abs/2305.05176" }],
    ),
    topic(
      "Cost-quality Pareto frontier analysis",
      "model_selection",
      "Plot model choices on cost vs quality axes for your eval. Pick the Pareto-optimal point. Re-run every quarter as new models ship.",
      45,
      [{ label: "Artificial Analysis", url: "https://artificialanalysis.ai/" }],
    ),
    topic(
      "A/B testing model upgrades",
      "model_selection",
      "Roll out a new model behind a feature flag, run shadow traffic, compare on production-realistic metrics (not just offline evals). Required reading before flipping a default model.",
      60,
      [{ label: "Anthropic — Model migration", url: "https://docs.anthropic.com/en/docs/about-claude/model-deprecations" }],
    ),
    topic(
      "Fallback chains across providers",
      "model_selection",
      "Build a primary-secondary-tertiary chain across providers (Anthropic direct → Bedrock → Vertex, or even cross-vendor for non-critical paths). Tradeoffs around prompt portability and prompt-cache compatibility.",
      45,
      [{ label: "LiteLLM", url: "https://docs.litellm.ai/" }],
    ),

    // ── Fine-Tuning & Adaptation ─────────────────────────────────────────
    topic(
      "When fine-tuning beats prompting",
      "fine_tuning",
      "Decision framework: fine-tune when you have many high-quality examples, prompt is bloated with examples, latency matters, or you need a behavior prompting can't reliably produce. Default to prompting.",
      45,
      [{ label: "Anthropic — Fine-tuning on Bedrock", url: "https://docs.anthropic.com/en/docs/about-claude/model-deprecations" }],
    ),
    topic(
      "Supervised fine-tuning on Bedrock/Vertex",
      "fine_tuning",
      "Run SFT for Haiku on Bedrock: data format (JSONL with messages), hyperparameters that actually matter (LR, epochs), and the eval gotchas (don't eval on training prompts).",
      75,
      [{ label: "AWS — Fine-tune Claude", url: "https://docs.aws.amazon.com/bedrock/latest/userguide/model-customization.html" }],
    ),
    topic(
      "LoRA & PEFT methods",
      "fine_tuning",
      "Parameter-efficient fine-tuning: LoRA, QLoRA, prefix tuning, IA³. Understand which work for which sizes, and how to merge adapters for serving.",
      60,
      [{ label: "HuggingFace PEFT", url: "https://huggingface.co/docs/peft/index" }],
    ),
    topic(
      "Distillation from larger models",
      "fine_tuning",
      "Use Opus to label data, then fine-tune Haiku on the labels. Often gets you 90% of Opus quality at 1/30th the cost. Key risk: distilling Opus's biases too.",
      75,
      [{ label: "DistilBERT paper", url: "https://arxiv.org/abs/1910.01108" }],
    ),
    topic(
      "Continual learning & catastrophic forgetting",
      "fine_tuning",
      "Fine-tuning narrows behavior. Understand catastrophic forgetting, mitigation (mixed data, rehearsal, LoRA composition), and why most production teams retrain from scratch instead of continual updates.",
      45,
      [{ label: "Continual learning survey", url: "https://arxiv.org/abs/2302.00487" }],
    ),

    // ── Embeddings & Representation ──────────────────────────────────────
    topic(
      "Embedding model selection",
      "embeddings",
      "Pick between Voyage, Cohere, OpenAI, and open-source (BGE, E5, Nomic). Decide on dimensions, language support, and domain fit using MTEB and your own retrieval eval.",
      45,
      [{ label: "MTEB leaderboard", url: "https://huggingface.co/spaces/mteb/leaderboard" }],
    ),
    topic(
      "Distance metrics & normalization",
      "embeddings",
      "Cosine vs dot-product vs L2. Why normalized embeddings make cosine and dot-product equivalent. Practical implications for index choice and quantization.",
      45,
      [{ label: "Pinecone — Distance metrics", url: "https://www.pinecone.io/learn/vector-similarity/" }],
    ),
    topic(
      "Matryoshka embeddings",
      "embeddings",
      "Train one embedding model that produces nested-dimension embeddings (e.g., usable at 64, 128, 256, 768 dims). Truncate for cheap recall, full-dim for rerank. The Pareto frontier for retrieval cost.",
      45,
      [{ label: "Matryoshka paper", url: "https://arxiv.org/abs/2205.13147" }],
    ),
    topic(
      "Embedding drift monitoring",
      "embeddings",
      "When the embedding model changes (provider update, you re-train), embeddings shift. Monitor with drift dashboards and have a re-index plan.",
      45,
      [{ label: "Pinecone — Embedding migrations", url: "https://docs.pinecone.io/" }],
    ),
    topic(
      "Multimodal embeddings",
      "embeddings",
      "CLIP-style joint image+text embeddings. Understand the contrastive training objective and use cases (image search, cross-modal retrieval, zero-shot classification).",
      60,
      [{ label: "CLIP paper", url: "https://arxiv.org/abs/2103.00020" }],
    ),

    // ── Vector Databases & Infrastructure ────────────────────────────────
    topic(
      "Pinecone vs Weaviate vs pgvector vs Turbopuffer",
      "vector_dbs",
      "Compare managed vector DBs on cost, latency, filter performance, hybrid search support, and operational complexity. Know when pgvector inside your existing Postgres beats a separate service.",
      60,
      [
        { label: "Pinecone", url: "https://www.pinecone.io/" },
        { label: "pgvector", url: "https://github.com/pgvector/pgvector" },
        { label: "Turbopuffer", url: "https://turbopuffer.com/docs" },
      ],
    ),
    topic(
      "Quantization (PQ, scalar, binary)",
      "vector_dbs",
      "Product quantization, scalar quantization, and binary embeddings reduce memory 4-32x at modest recall cost. Understand the tradeoffs and how reranking recovers lost recall.",
      60,
      [{ label: "FAISS — Quantization", url: "https://github.com/facebookresearch/faiss/wiki" }],
    ),
    topic(
      "Sharding & replication patterns",
      "vector_dbs",
      "Shard by tenant, by date, or by hash. Replicate for read throughput. Know the rebalancing nightmare and design to avoid it.",
      60,
      [{ label: "Pinecone — Indexes", url: "https://docs.pinecone.io/guides/indexes/understanding-indexes" }],
    ),
    topic(
      "Hybrid filter + ANN at scale",
      "vector_dbs",
      "Combine metadata filters with ANN: pre-filter, post-filter, or filtered-ANN. Each has very different latency profiles at high cardinality.",
      45,
      [{ label: "Weaviate — Filtered search", url: "https://weaviate.io/developers/weaviate/search/filters" }],
    ),

    // ── ML Systems Fundamentals ──────────────────────────────────────────
    topic(
      "Linear algebra refresher",
      "ml_systems",
      "Matrix multiplication, eigenvectors, SVD, dot products, projections. The mental model for everything from attention to embeddings.",
      60,
      [{ label: "3Blue1Brown — Linear Algebra", url: "https://www.3blue1brown.com/topics/linear-algebra" }],
    ),
    topic(
      "Transformer architecture from scratch",
      "ml_systems",
      "Build a tiny transformer in PyTorch: embedding, positional encoding, multi-head self-attention, feed-forward, layer norm, residuals. Read Karpathy's nanoGPT alongside.",
      90,
      [{ label: "nanoGPT", url: "https://github.com/karpathy/nanoGPT" }],
    ),
    topic(
      "Attention mechanism deep dive",
      "ml_systems",
      "Scaled dot-product attention, multi-head attention, causal masking. Why the √dk scaling, why multi-head, and how attention differs from RNN gating.",
      75,
      [{ label: "Illustrated Transformer", url: "https://jalammar.github.io/illustrated-transformer/" }],
    ),
    topic(
      "Positional encodings (RoPE, ALiBi)",
      "ml_systems",
      "Sinusoidal, learned, RoPE, ALiBi. Why RoPE dominates modern LLMs and how it enables context extension via interpolation/extrapolation.",
      45,
      [{ label: "RoFormer paper", url: "https://arxiv.org/abs/2104.09864" }],
    ),
    topic(
      "Tokenization (BPE, SentencePiece)",
      "ml_systems",
      "BPE and unigram tokenizers, special tokens, why tokenization affects pricing/latency, and the failure modes (digit splitting, emoji, code).",
      45,
      [{ label: "HuggingFace — Tokenizers", url: "https://huggingface.co/docs/transformers/tokenizer_summary" }],
    ),

    // ── Inference Optimization ───────────────────────────────────────────
    topic(
      "KV cache & speculative decoding",
      "inference_optimization",
      "Why decoder inference is memory-bound on the KV cache. Speculative decoding (draft + verify) for 2-3x throughput gains. Know the bandwidth math.",
      60,
      [{ label: "Speculative decoding paper", url: "https://arxiv.org/abs/2211.17192" }],
    ),
    topic(
      "Batching & continuous batching",
      "inference_optimization",
      "Static batching wastes compute on uneven-length requests. Continuous batching (a.k.a. iteration-level scheduling) was the breakthrough behind vLLM. Know why throughput goes up 10x.",
      60,
      [{ label: "vLLM paper", url: "https://arxiv.org/abs/2309.06180" }],
    ),
    topic(
      "Quantization for inference",
      "inference_optimization",
      "INT8, INT4, FP8, AWQ, GPTQ. Tradeoffs between quality loss and memory/speed gains. Know which precisions hardware actually accelerates.",
      60,
      [{ label: "AWQ paper", url: "https://arxiv.org/abs/2306.00978" }],
    ),
    topic(
      "vLLM, TGI & inference servers",
      "inference_optimization",
      "vLLM, TGI, TensorRT-LLM, SGLang. Pick the right server for your hardware and workload. Most teams should not roll their own.",
      45,
      [{ label: "vLLM docs", url: "https://docs.vllm.ai/" }],
    ),

    // ── Training & Experimentation ───────────────────────────────────────
    topic(
      "Experiment tracking (W&B, MLflow)",
      "training_experimentation",
      "Track hyperparameters, metrics, artifacts, and model lineage. Required for any serious training project — losing track of which checkpoint was which is a career-limiting mistake.",
      45,
      [{ label: "Weights & Biases", url: "https://docs.wandb.ai/" }],
    ),
    topic(
      "Hyperparameter search patterns",
      "training_experimentation",
      "Random search vs grid vs Bayesian (Optuna, Ray Tune). For LLM fine-tuning, LR is usually the only thing that matters — focus your budget.",
      45,
      [{ label: "Optuna", url: "https://optuna.org/" }],
    ),
    topic(
      "Gradient checkpointing & ZeRO",
      "training_experimentation",
      "Trade compute for memory via gradient checkpointing. ZeRO-1/2/3 shards optimizer states, gradients, and parameters across GPUs. Required for training models larger than a single GPU.",
      60,
      [{ label: "DeepSpeed ZeRO", url: "https://www.microsoft.com/en-us/research/blog/zero-deepspeed-new-system-optimizations-enable-training-models-with-over-100-billion-parameters/" }],
    ),
    topic(
      "Distributed training basics",
      "training_experimentation",
      "Data parallel, tensor parallel, pipeline parallel, FSDP. The 3D-parallelism mental model. Most application teams won't train, but you must speak the language.",
      75,
      [{ label: "PyTorch FSDP", url: "https://pytorch.org/docs/stable/fsdp.html" }],
    ),

    // ── Multimodal Systems ───────────────────────────────────────────────
    topic(
      "Image understanding pipelines",
      "multimodal",
      "Build pipelines that send images to Claude vision: preprocessing (resize, format), token budgeting (images cost tokens too), chunking long PDFs, combining with OCR for layout-heavy docs.",
      60,
      [{ label: "Anthropic — Vision", url: "https://docs.anthropic.com/en/docs/build-with-claude/vision" }],
    ),
    topic(
      "OCR vs native vision tradeoffs",
      "multimodal",
      "When to OCR first (Textract, Mathpix) vs send native to Claude. Tradeoffs around cost, table extraction accuracy, handwriting, and structured output reliability.",
      45,
      [{ label: "AWS Textract", url: "https://docs.aws.amazon.com/textract/" }],
    ),
    topic(
      "Video understanding patterns",
      "multimodal",
      "Frame sampling strategies, audio transcription + visual frames, temporal reasoning. Most 'video' workloads today are frame-by-frame vision + transcription stitched together.",
      60,
      [{ label: "Anthropic — Video (via frames)", url: "https://docs.anthropic.com/en/docs/build-with-claude/vision" }],
    ),
    topic(
      "Audio + speech models",
      "multimodal",
      "Whisper, Deepgram, AssemblyAI for ASR. Diarization, timestamps, real-time vs batch tradeoffs. TTS options for voice output.",
      45,
      [{ label: "OpenAI Whisper", url: "https://github.com/openai/whisper" }],
    ),

    // ── Safety, Alignment & Red-Teaming ──────────────────────────────────
    topic(
      "Prompt injection defenses",
      "safety_redteaming",
      "Defense in depth: separate trusted/untrusted inputs, sanitize tool outputs, structured prompts with explicit delimiters, post-hoc validation. There is no perfect defense — assume injection and limit blast radius.",
      60,
      [{ label: "OWASP — LLM Top 10", url: "https://owasp.org/www-project-top-10-for-large-language-model-applications/" }],
    ),
    topic(
      "Jailbreak taxonomies",
      "safety_redteaming",
      "Categories of jailbreaks: role-play, payload smuggling, encoding tricks, multi-turn escalation. Know the taxonomies so you can red-team systematically.",
      60,
      [{ label: "Anthropic — Many-shot jailbreaking", url: "https://www.anthropic.com/research/many-shot-jailbreaking" }],
    ),
    topic(
      "Content moderation pipelines",
      "safety_redteaming",
      "Layered moderation: input filters, model refusals, output classifiers (e.g., Llama Guard), human review for edge cases. Choose precision vs recall by risk profile.",
      45,
      [{ label: "Llama Guard", url: "https://ai.meta.com/research/publications/llama-guard-llm-based-input-output-safeguard-for-human-ai-conversations/" }],
    ),
    topic(
      "Refusal training & over-refusal",
      "safety_redteaming",
      "Models can refuse too much or too little. Understand the calibration problem, how to measure over-refusal, and the customer-facing implications.",
      45,
      [{ label: "Anthropic — Honesty/Harmlessness", url: "https://www.anthropic.com/news/core-views-on-ai-safety" }],
    ),
    topic(
      "Anthropic's RSP & ASL framework",
      "safety_redteaming",
      "Anthropic's Responsible Scaling Policy and AI Safety Levels (ASL-1..4+). Know what each level commits to in evals, security, and deployment.",
      60,
      [{ label: "Anthropic — RSP", url: "https://www.anthropic.com/news/anthropics-responsible-scaling-policy" }],
    ),

    // ── Applied Research Literacy ────────────────────────────────────────
    topic(
      "Reading ML papers effectively",
      "research_literacy",
      "Three-pass method: abstract+figures, methods+results, full read. Know what to skip (related work) and what to mine (ablations, dataset details, failure modes).",
      45,
      [{ label: "How to Read a Paper", url: "https://web.stanford.edu/class/ee384m/Handouts/HowtoReadPaper.pdf" }],
    ),
    topic(
      "Reproducing paper results",
      "research_literacy",
      "Skill: re-implement a published method end-to-end. Catches the gap between paper claims and reality, and is the single best way to build deep intuition.",
      75,
      [{ label: "Papers With Code", url: "https://paperswithcode.com/" }],
    ),
    topic(
      "Tracking the frontier",
      "research_literacy",
      "Build a personal pipeline for staying current: arXiv-sanity, key researchers on Twitter/X, AlphaSignal, Latent Space, Interconnects. Budget ~30 min/day.",
      30,
      [{ label: "arXiv-sanity", url: "https://arxiv-sanity-lite.com/" }],
    ),
    topic(
      "Writing technical blog posts",
      "research_literacy",
      "Communicate what you've learned: pick a narrow topic, show working code, make one strong claim with evidence. The compounding career move in applied AI.",
      60,
      [{ label: "Eugene Yan blog", url: "https://eugeneyan.com/writing/" }],
    ),

    // ── Domain-Specific AI Patterns ──────────────────────────────────────
    topic(
      "AI for code (SWE-bench, code editing agents)",
      "domain_specific",
      "Patterns for code-modifying agents: AST-aware editing, repo-level retrieval, test-driven feedback loops, sandboxed execution. Benchmarks: SWE-bench, HumanEval, LiveCodeBench.",
      75,
      [
        { label: "SWE-bench", url: "https://www.swebench.com/" },
        { label: "Aider", url: "https://aider.chat/" },
      ],
    ),
    topic(
      "AI for legal/contracts",
      "domain_specific",
      "Patterns for legal AI: clause extraction, redlining, citation grounding, attorney-in-the-loop workflows. Know the precision bar and the regulatory landscape (UPL, attorney privilege).",
      60,
      [{ label: "Anthropic — Legal use cases", url: "https://www.anthropic.com/customers" }],
    ),
    topic(
      "AI for healthcare (HIPAA-aware)",
      "domain_specific",
      "BAA-covered deployments (Bedrock/Vertex), PHI handling, clinical decision-support carve-outs vs FDA-regulated SaMD. Common use cases: prior auth, scribe, chart summarization.",
      75,
      [{ label: "AWS — HIPAA on Bedrock", url: "https://aws.amazon.com/compliance/hipaa-compliance/" }],
    ),
    topic(
      "AI for finance",
      "domain_specific",
      "Use cases: research summarization, KYC/AML doc review, earnings transcript analysis. Constraints: SOC2, model risk management (SR 11-7), audit trails for every model decision.",
      60,
      [{ label: "Anthropic — Financial services", url: "https://www.anthropic.com/customers" }],
    ),
    topic(
      "AI for customer support",
      "domain_specific",
      "Agent assist vs full deflection. Knowledge-base grounding, ticket triage, escalation paths, tone calibration. Metrics: deflection rate, CSAT, first-response time.",
      60,
      [{ label: "Anthropic — Support use cases", url: "https://www.anthropic.com/customers" }],
    ),

    // ── Customer-Facing Skills ───────────────────────────────────────────
    topic(
      "Solution scoping & discovery calls",
      "customer_facing",
      "Run a discovery call: identify the real problem (not the asked-for solution), surface constraints (compliance, latency, budget), and propose a minimum-viable scope. The most underrated AI engineer skill.",
      45,
      [{ label: "The Mom Test", url: "https://www.momtestbook.com/" }],
    ),
    topic(
      "Live demo patterns",
      "customer_facing",
      "Build demos that survive: deterministic seeds, pre-recorded fallbacks, prepared inputs, screen-share that hides API keys. Always have a 30-second elevator demo and a 5-minute deep dive.",
      45,
      [{ label: "Anthropic — Build with Claude", url: "https://docs.anthropic.com/en/docs/build-with-claude/overview" }],
    ),
    topic(
      "Translating ML to non-technical stakeholders",
      "customer_facing",
      "Explain precision/recall, hallucination, eval harnesses to a VP who hasn't read a paper. Use analogies, show concrete outputs, never use 'just' or 'simple'.",
      45,
      [{ label: "Made to Stick", url: "https://heathbrothers.com/books/made-to-stick/" }],
    ),
    topic(
      "Pre-sales architecture diagrams",
      "customer_facing",
      "Whiteboard the customer's system + Claude integration in 5 minutes. Cover data flow, auth, eval points, observability, fallbacks. Use a consistent visual vocabulary.",
      60,
      [{ label: "C4 model", url: "https://c4model.com/" }],
    ),

    // ── Data Engineering Basics ──────────────────────────────────────────
    topic(
      "SQL fluency for analytics",
      "data_engineering",
      "Window functions, CTEs, joins, JSON operators. Be able to slice production LLM telemetry (per-user cost, latency p99 by feature, error rates) from a warehouse without help.",
      75,
      [{ label: "Mode — SQL tutorial", url: "https://mode.com/sql-tutorial/" }],
    ),
    topic(
      "Pandas / Polars for data prep",
      "data_engineering",
      "Pandas idioms (groupby, pivot, merge) and the Polars alternative for larger-than-memory workloads. Used constantly for eval analysis and ad-hoc data munging.",
      60,
      [{ label: "Polars docs", url: "https://docs.pola.rs/" }],
    ),
    topic(
      "DuckDB & lightweight ETL",
      "data_engineering",
      "DuckDB for SQL over Parquet/CSV without a warehouse. Perfect for analyzing eval results, log dumps, and customer data samples on your laptop.",
      45,
      [{ label: "DuckDB docs", url: "https://duckdb.org/docs/" }],
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
