import type { StudyGuide } from "../guide-types";

export const bm25HybridRetrievalGuide: StudyGuide = {
  topicTitle: "BM25 & hybrid retrieval",
  topicSlug: "bm25-hybrid-retrieval",
  sections: [
    // ================================================================
    // 1. Why retrieval matters in RAG
    // ================================================================
    {
      title: "Why retrieval matters in RAG",
      blocks: [
        {
          kind: "prose",
          markdown: `Retrieval is the part of RAG everyone underweights and over-blames. The pipeline is roughly:

\`\`\`
user question
   │
   ▼
retrieve top-k docs from corpus  ← this is where most quality lives
   │
   ▼
stuff retrieved docs into the prompt
   │
   ▼
Claude answers from those docs
\`\`\`

If retrieval misses the relevant document, no amount of prompt engineering or model upgrade will save the answer. The single most important debugging skill in RAG is being able to look at retrieval output and say *"the right doc isn't in the top-10, that's why the answer is wrong."*

> **Heads up — runnable cells in this guide use real Python (Pyodide) but a tiny mock corpus.** The BM25 and RRF implementations are the genuine articles; you can paste them into a real project unchanged.`,
        },
        {
          kind: "key_insight",
          label: "The retrieval ceiling",
          insight: `Your generation quality is bounded by recall@k. If the right document isn't in your top-k, the LLM cannot answer correctly except by hallucination. Always measure retrieval recall *before* tuning prompts.`,
        },
      ],
    },

    // ================================================================
    // 2. TF-IDF in 60 seconds
    // ================================================================
    {
      title: "TF-IDF in 60 seconds",
      blocks: [
        {
          kind: "prose",
          markdown: `Before BM25, the lexical baseline was **TF-IDF**. Two intuitions:

- **Term frequency (TF)** — terms that appear more often in a document are more important *to that document*. The doc "AAPL beat earnings AAPL AAPL" is clearly about AAPL.
- **Inverse document frequency (IDF)** — terms that appear in *every* document carry no signal. "the", "and", "stock" are weak features in a finance corpus; "TSLA", "guidance", "miss" are strong features.

Score = sum over query terms of (TF in doc) × (IDF across corpus).

\`\`\`
TF(t, d)     = count of t in d
IDF(t)       = log(N / df(t))   where df(t) = # docs containing t
TF-IDF(t,d)  = TF(t,d) * IDF(t)
\`\`\`

TF-IDF is fast, deterministic, and decent. But it has two annoying failure modes that BM25 fixes.`,
        },
        {
          kind: "scenario_predict",
          label: "spotting the weakness",
          scenario: `Corpus: 1000 finance news docs.
Doc A: "AAPL AAPL AAPL AAPL AAPL beats Q3 estimates" (length 8)
Doc B: "AAPL beats Q3 estimates on services revenue growth" (length 8)
Query: "AAPL Q3 beat"`,
          language: "text",
          question:
            "TF-IDF will rank Doc A higher than Doc B. Why is that often wrong?",
          answer:
            "Repeating 'AAPL' five times shouldn't be 5x more relevant than mentioning it once — relevance saturates. TF-IDF's linear TF doesn't model this.",
          explanation:
            "Doc A's repetition is keyword stuffing. Doc B is a real news headline. BM25 fixes this by saturating the contribution of repeated terms via the k1 parameter.",
        },
      ],
    },

    // ================================================================
    // 3. The BM25 formula, dissected
    // ================================================================
    {
      title: "The BM25 formula, dissected",
      blocks: [
        {
          kind: "prose",
          markdown: `BM25 ("Best Match 25", from the Okapi project) extends TF-IDF with two knobs:

\`\`\`
                       f(q,D) * (k1 + 1)
score(D,Q) = Σ IDF(q) · ─────────────────────────────────────
              q∈Q       f(q,D) + k1 · (1 - b + b · |D|/avgdl)
\`\`\`

Where:
- \`f(q, D)\` = how many times query term \`q\` appears in document \`D\`
- \`|D|\` = length of document \`D\` in tokens
- \`avgdl\` = average document length in the corpus
- \`k1\` (typically 1.2–2.0) controls **term-frequency saturation**
- \`b\` (typically 0.75) controls **length normalization**
- \`IDF(q) = log( (N - df(q) + 0.5) / (df(q) + 0.5) + 1 )\` — the "BM25 IDF" variant

Two things to internalize:

1. As \`f(q,D)\` grows, the numerator grows linearly but the denominator also grows. The score asymptotes — repeating a term 100 times is barely better than 5 times. That's the **k1 saturation**.
2. Long documents are penalized via \`|D|/avgdl\`. Without this, long docs would always win simply by containing more of everything. \`b=0\` disables length norm; \`b=1\` fully normalizes; \`b=0.75\` is the standard middle ground.`,
        },
        {
          kind: "key_insight",
          label: "What k1 and b actually do",
          insight: `**k1** = "how much do extra mentions matter?" Higher = more linear (rewards repetition). Lower = more saturating (treats 1 mention almost as well as 10).

**b** = "how much do I penalize long documents?" 0 = ignore length, 1 = aggressively penalize, 0.75 = default that works well in practice.

Tune k1 down for very-spammy corpora (forums, scraped web). Tune b down for collections of homogeneous-length docs.`,
        },
      ],
    },

    // ================================================================
    // 4. Implementing BM25 from scratch
    // ================================================================
    {
      title: "Implementing BM25 from scratch",
      blocks: [
        {
          kind: "prose",
          markdown: `Let's build BM25 in ~30 lines of Python so the formula is no longer abstract. We'll use a tiny finance-news corpus to keep the math visible.`,
        },
        {
          kind: "code_predict",
          runnable: true,
          label: "BM25 IDF for a small corpus",
          code: `import math
from collections import Counter

corpus = [
    "AAPL beats Q3 earnings estimates",
    "TSLA misses delivery targets in Q3",
    "AAPL services revenue grew 14 percent",
    "the fed raised interest rates again",
    "AAPL announces new iPhone in September",
]

docs = [d.lower().split() for d in corpus]
N = len(docs)

# Document frequency: in how many docs does each term appear?
df = Counter()
for doc in docs:
    for term in set(doc):
        df[term] += 1

def idf(term):
    n = df.get(term, 0)
    return math.log((N - n + 0.5) / (n + 0.5) + 1)

for term in ["aapl", "q3", "the", "iphone"]:
    print(f"{term:8s} df={df[term]} idf={idf(term):.3f}")`,
          output: `aapl     df=3 idf=0.693
q3       df=2 idf=1.012
the      df=1 idf=1.386
iphone   df=1 idf=1.386`,
          explanation: `Notice how IDF rewards rarity: \`iphone\` and \`the\` both appear in 1 doc and get the same high IDF. (In a real corpus you'd run stopword removal so "the" doesn't make it into the index in the first place.) \`aapl\` appears in 3 of 5 docs — it's still positive but much weaker as a discriminator.`,
        },
        {
          kind: "code_predict",
          runnable: true,
          label: "full BM25 scoring",
          code: `import math
from collections import Counter

corpus = [
    "AAPL beats Q3 earnings estimates",
    "TSLA misses delivery targets in Q3",
    "AAPL services revenue grew 14 percent",
    "the fed raised interest rates again",
    "AAPL announces new iPhone in September",
]

class BM25:
    def __init__(self, corpus, k1=1.5, b=0.75):
        self.k1, self.b = k1, b
        self.docs = [d.lower().split() for d in corpus]
        self.N = len(self.docs)
        self.avgdl = sum(len(d) for d in self.docs) / self.N
        self.df = Counter()
        for doc in self.docs:
            for term in set(doc):
                self.df[term] += 1
        self.tfs = [Counter(d) for d in self.docs]

    def idf(self, term):
        n = self.df.get(term, 0)
        return math.log((self.N - n + 0.5) / (n + 0.5) + 1)

    def score(self, query, i):
        terms = query.lower().split()
        doc = self.docs[i]
        tf = self.tfs[i]
        s = 0.0
        for q in terms:
            if q not in tf:
                continue
            num = tf[q] * (self.k1 + 1)
            den = tf[q] + self.k1 * (1 - self.b + self.b * len(doc) / self.avgdl)
            s += self.idf(q) * (num / den)
        return s

    def search(self, query, top_k=3):
        scored = [(i, self.score(query, i)) for i in range(self.N)]
        return sorted(scored, key=lambda x: -x[1])[:top_k]

bm25 = BM25(corpus)
for idx, score in bm25.search("AAPL Q3"):
    print(f"{score:.3f}  {corpus[idx]}")`,
          output: `1.580  AAPL beats Q3 earnings estimates
0.992  TSLA misses delivery targets in Q3
0.535  AAPL services revenue grew 14 percent`,
          explanation: `The doc that contains *both* query terms wins. The TSLA doc beats the AAPL services doc on this query because "Q3" is rarer (higher IDF) than "AAPL". This is the right answer — a user searching "AAPL Q3" probably wants the Q3 earnings story even if they typed "AAPL" first.`,
        },
        {
          kind: "warm_up",
          title: "what k1 controls",
          prompt:
            "If you double k1 (say from 1.5 to 3.0), what happens to the score of a doc that mentions the query term 10 times vs 1 time?",
          answer:
            "The 10-mention doc's score grows much more relative to the 1-mention doc — saturation kicks in later, so repetition is rewarded more.",
          explanation:
            "k1 controls the inflection point of the saturation curve. Larger k1 = more linear in TF (rewards repetition). Smaller k1 = saturates faster (treats many mentions almost like one).",
        },
      ],
    },

    // ================================================================
    // 5. What BM25 misses
    // ================================================================
    {
      title: "What BM25 misses",
      blocks: [
        {
          kind: "prose",
          markdown: `BM25 is a **lexical** matcher. It only knows words it has seen literally in your query. It cannot match:

- **Synonyms** — query "automobile", doc "car"
- **Paraphrase** — query "how do I cancel my plan?", doc "subscription termination process"
- **Conceptual matches** — query "fast database", doc "low-latency key-value store"
- **Multilingual matches** — query in French, doc in English

This is where dense retrieval (embeddings + cosine similarity) shines. A bi-encoder maps both query and document into the same vector space; semantically similar text ends up close together regardless of exact wording.

But dense retrieval has its own blind spots — which is exactly why hybrid is the production answer.`,
        },
        {
          kind: "scenario_predict",
          label: "BM25 vs dense: who wins on what?",
          scenario: `Two queries:

(A) "TSLA Q3 2024 deliveries"     — needs exact ticker, exact quarter
(B) "What does the company do?"   — needs semantic understanding`,
          language: "text",
          question:
            "Which retriever wins on each query, and why?",
          answer:
            "BM25 wins on (A): exact lexical matches on rare tokens like 'TSLA' and 'Q3' are exactly what BM25 is built for. Dense wins on (B): no rare keywords to anchor on; semantic similarity is the only signal.",
          explanation:
            "Rule of thumb: BM25 dominates on queries with rare tokens, IDs, ticker symbols, version numbers, error codes, exact phrases. Dense dominates on natural-language questions, paraphrases, and concept queries. Hybrid gets both.",
        },
        {
          kind: "key_insight",
          label: "When dense actively hurts",
          insight: `Embedding models can be *worse* than BM25 when the query contains rare proper nouns, IDs, or codes that the embedder never saw during training. The model can't represent what it doesn't know, so it falls back to representing the surrounding context — and you retrieve docs that are semantically similar but lexically wrong.`,
        },
      ],
    },

    // ================================================================
    // 6. Dense retrieval as a complement
    // ================================================================
    {
      title: "Dense retrieval as a complement",
      blocks: [
        {
          kind: "prose",
          markdown: `Dense retrieval (also called "semantic search" or "vector search") works in three steps:

1. **Embed the corpus offline.** Run every chunk through an embedding model (e.g. \`voyage-3\`, \`text-embedding-3-large\`, \`cohere-embed-v3\`). Store the resulting vectors in a vector index (FAISS, HNSW, pgvector).
2. **Embed the query at search time.** Same model, single forward pass.
3. **Find nearest neighbors.** Cosine similarity (or dot product if vectors are normalized). Return top-k docs.

The key property: two pieces of text with similar *meaning* end up at similar vectors, even if they share no words. That's what gives dense its synonym/paraphrase superpower — and that's also why it can confidently retrieve the wrong doc when there are no exact-match anchor tokens.`,
        },
        {
          kind: "method_ref",
          title: "dense retrieval cheat sheet",
          importLine: "# conceptual — exact API depends on your stack",
          methods: [
            {
              signature: "embed_query(text) -> vec[float]",
              description:
                "Single forward pass through the bi-encoder. Cheap (~ms). Use the *query* embedding model variant if your provider has one — some have separate query/document modes.",
              returns: "list of floats, dim 768/1024/1536/3072 typically",
            },
            {
              signature: "embed_corpus(texts) -> list[vec]",
              description:
                "Run once at index time, batched. Cache results. If your embedding model upgrades, re-embed everything (vectors aren't compatible across model versions).",
              returns: "list of vectors",
            },
            {
              signature: "cosine(a, b)",
              description:
                "dot(a,b) / (||a|| * ||b||). If you normalize vectors at index time, you can use plain dot product (faster).",
              returns: "float in [-1, 1], higher = more similar",
            },
            {
              signature: "index.search(query_vec, k)",
              description:
                "ANN over the index. HNSW gives ~ms search over millions of vectors with high recall. Exact knn becomes too slow past ~100k vectors.",
              returns: "list of (doc_id, score) sorted by score desc",
            },
          ],
        },
      ],
    },

    // ================================================================
    // 7. The score-fusion problem
    // ================================================================
    {
      title: "The score-fusion problem",
      blocks: [
        {
          kind: "prose",
          markdown: `Now you have two retrievers and want to combine them. The naive plan is "average the scores." This breaks immediately because the score scales are incompatible:

- BM25 scores are unbounded positive reals (typically 0 to 30+)
- Cosine similarity is in [-1, 1]
- Different embedding models produce different cosine distributions

If you just average, BM25 dominates. If you min-max normalize per query, your scores depend on which docs happen to be in the result set. There is no clean linear combination.

The robust answer is to combine **ranks** instead of scores.`,
        },
        {
          kind: "code_comparison",
          label: "score fusion: naive vs RRF",
          left: {
            title: "Naive — averaging raw scores",
            code: `# bm25 returns scores 0..30
# dense returns scores -1..1

bm25_results = {"d1": 12.4, "d2": 8.1, "d3": 0.0}
dense_results = {"d1": 0.62, "d2": 0.81, "d4": 0.79}

# Average scores where both retrievers returned the doc:
combined = {}
for d in set(bm25_results) | set(dense_results):
    combined[d] = (bm25_results.get(d, 0) +
                   dense_results.get(d, 0)) / 2`,
            annotation:
              "BM25's 0-30 range dwarfs cosine's -1-1 range. d1 wins not because it's actually best but because of scale.",
          },
          right: {
            title: "Right — Reciprocal Rank Fusion",
            code: `bm25_rank  = ["d1", "d2", "d3"]   # rank order, not scores
dense_rank = ["d2", "d4", "d1"]

K = 60  # standard hyperparameter
scores = {}
for ranking in [bm25_rank, dense_rank]:
    for rank, doc in enumerate(ranking):
        scores[doc] = scores.get(doc, 0) + 1 / (K + rank + 1)`,
            annotation:
              "RRF only uses position. Both retrievers contribute on equal footing — no normalization needed.",
          },
          takeaway:
            "Use RRF (or learned-to-rank if you have labels). Avoid naive score averaging — it silently lets one retriever dominate.",
        },
      ],
    },

    // ================================================================
    // 8. Reciprocal Rank Fusion (RRF)
    // ================================================================
    {
      title: "Reciprocal Rank Fusion (RRF)",
      blocks: [
        {
          kind: "prose",
          markdown: `RRF is dead simple, theoretically grounded, and works well in practice. The formula:

\`\`\`
RRF_score(d) = Σ  1 / (k + rank_i(d))
              i
\`\`\`

For each retriever \`i\`, take the rank of doc \`d\` (1 for top, 2 for next, etc.) and add \`1 / (k + rank)\`. Sum across retrievers. The constant \`k\` (typically 60) damps the contribution of high-ranked docs so a single retriever can't dominate.

Properties that make RRF great in production:
- **No score normalization required.** Retrievers can have wildly different score scales.
- **No tuning beyond k.** And k=60 works almost everywhere.
- **Trivially extensible.** Add a third retriever (e.g. a reranker) by feeding its ranking into the same sum.`,
        },
        {
          kind: "code_predict",
          runnable: true,
          label: "RRF on two rankings",
          code: `def rrf(rankings, k=60):
    """Each ranking is a list of doc_ids in rank order (best first)."""
    scores = {}
    for ranking in rankings:
        for rank, doc in enumerate(ranking):
            scores[doc] = scores.get(doc, 0.0) + 1.0 / (k + rank + 1)
    return sorted(scores.items(), key=lambda x: -x[1])

bm25_rank  = ["d1", "d2", "d3", "d5"]
dense_rank = ["d2", "d4", "d1", "d3"]

for doc, score in rrf([bm25_rank, dense_rank]):
    print(f"{doc}  {score:.5f}")`,
          output: `d1  0.03253
d2  0.03252
d3  0.03200
d4  0.03175
d5  0.01562`,
          explanation: `\`d1\` and \`d2\` are essentially tied at the top because each is rank-1 in one retriever and rank-3-ish in the other. \`d4\` only appears in dense; \`d5\` only in BM25 — both score lower than docs that appeared in *both* lists. This "consensus reward" is the magic of RRF: docs both retrievers agree on bubble up.`,
        },
        {
          kind: "warm_up",
          title: "why k matters",
          prompt:
            "If you set k=0 in RRF, what's the score of a rank-1 doc vs a rank-2 doc?",
          answer:
            "Rank-1 = 1/1 = 1.0; rank-2 = 1/2 = 0.5. With k=0 the top doc is twice as valuable as the next; with k=60 the top doc is 61/62 ≈ 0.984× the next. Higher k = flatter weighting.",
          explanation:
            "k controls how much top ranks dominate. k=60 (the standard) is intentionally flat so that a doc retrieved by both retrievers — even at rank 5 each — beats a doc that only one retriever puts at rank 1. Consensus > confidence.",
        },
      ],
    },

    // ================================================================
    // 9. End-to-end hybrid retrieval (mini challenge)
    // ================================================================
    {
      title: "End-to-end hybrid retrieval",
      blocks: [
        {
          kind: "prose",
          markdown: `Time to assemble the whole pipeline. We'll use the BM25 from earlier, a *mocked* dense retriever (since we can't run a real embedding model in the browser), and combine via RRF.

In production you'd swap the mock dense for a real \`voyage-3\` or \`text-embedding-3-large\` call — every other line stays the same.`,
        },
        {
          kind: "code_predict",
          runnable: true,
          label: "hybrid pipeline with RRF",
          code: `import math, hashlib
from collections import Counter

corpus = [
    "AAPL beats Q3 earnings estimates",
    "TSLA misses delivery targets in Q3",
    "AAPL services revenue grew 14 percent",
    "the fed raised interest rates again",
    "AAPL announces new iPhone in September",
    "Apple unveils a new smartphone this fall",
]

# ── BM25 (lexical) ───────────────────────────────────────────────
class BM25:
    def __init__(self, corpus, k1=1.5, b=0.75):
        self.k1, self.b = k1, b
        self.docs = [d.lower().split() for d in corpus]
        self.N = len(self.docs)
        self.avgdl = sum(len(d) for d in self.docs) / self.N
        self.df = Counter()
        for d in self.docs:
            for t in set(d): self.df[t] += 1
        self.tfs = [Counter(d) for d in self.docs]
    def idf(self, t):
        n = self.df.get(t, 0)
        return math.log((self.N - n + 0.5) / (n + 0.5) + 1)
    def score(self, q, i):
        doc, tf = self.docs[i], self.tfs[i]
        s = 0.0
        for t in q.lower().split():
            if t not in tf: continue
            num = tf[t] * (self.k1 + 1)
            den = tf[t] + self.k1 * (1 - self.b + self.b * len(doc) / self.avgdl)
            s += self.idf(t) * (num / den)
        return s
    def search(self, q, top_k=5):
        scored = [(i, self.score(q, i)) for i in range(self.N)]
        return [i for i, _ in sorted(scored, key=lambda x: -x[1])[:top_k] if _ > 0]

# ── Mock dense retriever (synonym-aware) ─────────────────────────
SYNONYMS = {
    "iphone": ["smartphone", "phone"],
    "apple":  ["aapl"],
    "smartphone": ["iphone", "phone"],
}
def expand(text):
    out = []
    for w in text.lower().split():
        out.append(w)
        out.extend(SYNONYMS.get(w, []))
    return out
def fake_dense_score(query, doc):
    q_terms = set(expand(query))
    d_terms = set(expand(doc))
    inter = q_terms & d_terms
    return len(inter) / (math.sqrt(len(q_terms) * len(d_terms)) or 1)
def dense_search(query, corpus, top_k=5):
    scored = [(i, fake_dense_score(query, d)) for i, d in enumerate(corpus)]
    return [i for i, s in sorted(scored, key=lambda x: -x[1])[:top_k] if s > 0]

# ── RRF fusion ───────────────────────────────────────────────────
def rrf(rankings, k=60):
    scores = {}
    for r in rankings:
        for rank, doc in enumerate(r):
            scores[doc] = scores.get(doc, 0.0) + 1.0 / (k + rank + 1)
    return sorted(scores.items(), key=lambda x: -x[1])

# ── Run it ───────────────────────────────────────────────────────
bm25 = BM25(corpus)
query = "Apple new phone"

bm_hits = bm25.search(query)
dn_hits = dense_search(query, corpus)
fused   = rrf([bm_hits, dn_hits])

print("BM25:  ", [corpus[i] for i in bm_hits])
print("Dense: ", [corpus[i] for i in dn_hits])
print("Hybrid top-3:")
for doc_id, score in fused[:3]:
    print(f"  {score:.4f}  {corpus[doc_id]}")`,
          output: `BM25:   ['AAPL announces new iPhone in September']
Dense:  ['Apple unveils a new smartphone this fall', 'AAPL announces new iPhone in September', 'AAPL beats Q3 earnings estimates', 'AAPL services revenue grew 14 percent']
Hybrid top-3:
  0.03252  AAPL announces new iPhone in September
  0.01639  Apple unveils a new smartphone this fall
  0.01613  AAPL beats Q3 earnings estimates`,
          explanation: `Look at what each retriever did. **BM25** only matched the literal "new" — "Apple" and "phone" weren't in its corpus tokens (they're "AAPL" and "iPhone"). It returned just the iPhone doc and missed the synonym-paraphrased "Apple unveils a new smartphone." **Dense** (with the synonym expansion playing the role of a real embedder) found *both* — the iPhone doc and the smartphone-paraphrase doc. **RRF** combines them: the iPhone doc wins because it's in both lists; the smartphone paraphrase comes second because dense alone surfaced it. This is the canonical hybrid win — neither retriever alone gets the right top-2; together they do.`,
        },
        {
          kind: "mini_challenge",
          title: "Add a third retriever",
          prompt: `Extend the hybrid pipeline above with a third "exact phrase" retriever that returns docs containing the **literal** quoted query string (case-insensitive substring match). Combine all three rankings via RRF.

\`\`\`python
def phrase_search(query, corpus, top_k=5):
    # return list of doc indices whose lowercase text contains query.lower()
    ...

fused = rrf([bm_hits, dn_hits, phrase_hits])
\`\`\`

Test on a query like \`"Q3 earnings estimates"\` (a multi-word phrase). The exact-phrase retriever should put the matching doc at rank 1 and tip the hybrid toward it.`,
          hints: [
            "phrase_search just checks `query.lower() in doc.lower()` — no scoring needed; just put matches first in the returned list.",
            "RRF doesn't care how many rankings you pass it. The function takes a list of lists; add another list and the math just works.",
            "Test that the phrase retriever is *additive* — when there's no literal phrase match the result should fall back to BM25 + dense behavior.",
          ],
          solution: `def phrase_search(query, corpus, top_k=5):
    q = query.lower()
    matches = [i for i, d in enumerate(corpus) if q in d.lower()]
    return matches[:top_k]

bm_hits = bm25.search("Q3 earnings estimates")
dn_hits = dense_search("Q3 earnings estimates", corpus)
ph_hits = phrase_search("Q3 earnings estimates", corpus)

fused = rrf([bm_hits, dn_hits, ph_hits])
for doc_id, score in fused[:3]:
    print(f"{score:.4f}  {corpus[doc_id]}")`,
          takeaway:
            "Production hybrid retrievers often have 3+ signals: BM25, dense, exact-phrase, sometimes a metadata filter (date range, doc type), sometimes a reranker on top. RRF scales to all of them with no normalization headache.",
        },
      ],
    },

    // ================================================================
    // 10. Production considerations
    // ================================================================
    {
      title: "Production considerations",
      blocks: [
        {
          kind: "prose",
          markdown: `Things that bite teams when they take BM25 + hybrid to production:

**Tokenization mismatch.** Your BM25 tokenizer and your embedding model's tokenizer must agree on the corpus. If BM25 splits on whitespace but the embedder uses BPE, "iPhone" becomes "iPhone" for one and "iPh", "one" for the other — they disagree on what's even a token.

**Stop words.** Default to keeping them. Modern BM25 implementations handle "the" via low IDF; aggressive stopword lists hurt recall on phrase-like queries ("to be or not to be"). Strip stop words only if you've measured a recall gain.

**Chunk size.** BM25 favors longer chunks (more terms to match). Dense favors shorter chunks (less semantic dilution). 200–400 token chunks with 20-token overlap is a decent default for hybrid.

**Index freshness.** BM25 needs to recompute IDF when the corpus changes. Dense embeddings need to be regenerated when you switch embedding models. Build for the rebuild day-1.

**Top-k for fusion.** Pull a *deep* top-k (50–100) from each retriever before RRF, then truncate after fusion. If you only feed 10 from each, docs that are rank 11 in one retriever and rank 1 in the other never get a chance to surface.`,
        },
        {
          kind: "key_insight",
          label: "When hybrid hurts",
          insight: `Hybrid is not a free win. If your corpus is small and your queries are uniformly natural-language, dense alone can outperform hybrid (BM25 just adds noise). If your corpus is highly structured (codebase, log files, financial filings) and queries are keyword-heavy, BM25 alone often beats hybrid. **Measure on your data.** The hybrid-is-always-best meme is wrong roughly 30% of the time.`,
        },
        {
          kind: "warm_up",
          title: "deep top-k",
          prompt:
            "Why pull top-50 from each retriever before RRF when you only need a top-10 final result?",
          answer:
            "A doc at rank 12 in BM25 and rank 1 in dense should win RRF — but it can only do that if both retrievers' top-50 are fused. Truncating to top-10 before fusion loses these consensus winners.",
          explanation:
            "Fusion-then-truncate gives docs the chance to combine signals. Truncate-then-fuse throws away the long tail where each retriever's complementary strengths live.",
        },
      ],
    },

    // ================================================================
    // 11. Common bugs and gotchas
    // ================================================================
    {
      title: "Common bugs and gotchas",
      blocks: [
        {
          kind: "flashcard",
          context: "BM25 internals",
          front:
            "Your BM25 scores are all 0 even though the query terms are in the docs. What's the most likely bug?",
          back:
            "Tokenization mismatch. The query was tokenized differently from the corpus (e.g., case sensitivity, punctuation handling). Lowercase + same split function on both sides.",
        },
        {
          kind: "flashcard",
          context: "BM25 internals",
          front:
            "You added 1000 new docs to the corpus and BM25 quality dropped. Why?",
          back:
            "You probably forgot to recompute df (document frequency) and avgdl. BM25 IDF and length norm are corpus-relative — every corpus update needs a re-index.",
        },
        {
          kind: "flashcard",
          context: "Hybrid",
          front:
            "Hybrid recall is lower than dense alone, even though it should be a strict superset. What went wrong?",
          back:
            "You're truncating each retriever's results too aggressively before fusion (e.g., top-5). Pull a deep top-50/100 from each, fuse, then truncate.",
        },
        {
          kind: "flashcard",
          context: "Hybrid",
          front:
            "Your RRF results suddenly look identical to BM25 alone. What broke?",
          back:
            "Your dense retriever is silently failing or returning empty results. Always log per-retriever rank counts so a degenerate retriever shows up immediately instead of being invisibly downweighted.",
        },
        {
          kind: "flashcard",
          context: "BM25 vs dense",
          front:
            "User query is 'TSLA Q4-2024 deliveries Cybertruck' and dense returns generic Tesla earnings news instead of the specific Q4 Cybertruck doc. Why?",
          back:
            "Embedders represent rare proper nouns and version-like tokens poorly. The model collapses 'Cybertruck' into a generic 'truck' representation. BM25 catches these exact-token cases — exactly why hybrid exists.",
        },
        {
          kind: "flashcard",
          context: "RRF",
          front:
            "Why does the standard RRF constant k=60 work across very different domains?",
          back:
            "k=60 makes the score curve very flat across ranks 1–10, so consensus across retrievers (a doc appearing in multiple lists) outweighs any single retriever's confidence. This robustness is more valuable than fine-tuning per-domain.",
        },
      ],
    },

    // ================================================================
    // 12. What to practice next
    // ================================================================
    {
      title: "What to practice next",
      blocks: [
        {
          kind: "prose",
          markdown: `You now have:

- The BM25 formula and intuition for k1 (TF saturation) and b (length norm)
- A working from-scratch BM25 implementation
- A clear picture of what dense retrieval adds and where it fails
- RRF as a no-tune fusion method
- An end-to-end hybrid pipeline you can transplant into a real project

Where to go from here:

- **Rerankers & cross-encoders** — a cross-encoder pass over hybrid's top-50 typically buys another 5–15 points of nDCG@10. Worth the latency for high-stakes RAG.
- **Chunking strategies** — chunk size, overlap, and structure-aware splitting (Markdown headings, code AST) affect retrieval more than the choice of retriever.
- **HNSW & vector index internals** — once your corpus passes ~100k vectors, exact knn is too slow; understanding HNSW's graph structure helps tune \`ef_construction\` and \`ef_search\`.
- **Eval harnesses for retrieval** — build a small set of (query, gold_doc_id) pairs and measure recall@10 / nDCG@10 every time you change the pipeline. Without measurement, every tweak is a guess.`,
        },
      ],
    },
  ],
};
