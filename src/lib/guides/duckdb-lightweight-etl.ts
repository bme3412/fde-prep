import type { StudyGuide } from "../guide-types";

export const duckdbLightweightEtlGuide: StudyGuide = {
  topicTitle: "DuckDB & lightweight ETL",
  topicSlug: "duckdb-lightweight-etl",
  sections: [
    // ================================================================
    // 1. Why DuckDB
    // ================================================================
    {
      title: "Why DuckDB",
      blocks: [
        {
          kind: "prose",
          markdown: `DuckDB is an **in-process columnar SQL engine** — think SQLite, but built for analytics (columnar storage, vectorized execution, multi-core). It runs inside your Python process, your terminal, or a Jupyter notebook. There's no server, no setup, no schema-design step.

The FDE use cases it dominates:

- A customer hands you 50 GB of Parquet log dumps. You need to know, today, "what percentile of requests are timing out per feature." DuckDB queries that directly off disk in seconds.
- You have a pandas DataFrame from your eval pipeline and you want SQL on it — DuckDB queries the DataFrame **in place**, with zero copy.
- You need to glue together a CSV from sales, a Parquet from telemetry, and a JSON from the API — and produce a tidy summary. DuckDB joins all three in one query.
- You want a tiny ETL job: read \`*.parquet\` from a directory, dedup, partition by day, write back out. One \`COPY\` statement.

**This guide will not** re-teach window functions, CTEs, or join semantics — that's the **SQL fluency for analytics** topic. We'll focus on what's DuckDB-specific: how it reads files, how it interops with DataFrames, and the ETL patterns you'll lean on.

A canonical scenario for examples: you have eval results scattered across daily Parquet files, plus an in-memory pandas DataFrame of model pricing.

\`\`\`
data/evals/
├── 2026-05-10.parquet
├── 2026-05-11.parquet
└── 2026-05-12.parquet
\`\`\`

Schema (per file): \`eval_id, ts, model, task, score, latency_ms, prompt_tokens, completion_tokens\`.`,
        },
        {
          kind: "key_insight",
          label: "Mental model",
          insight: `DuckDB is **an analytics-grade query engine that happens to run in-process.** That single sentence explains the design:

- **In-process** → no server, no auth, no network round-trip. \`pip install duckdb\` and you're done.
- **Analytics-grade** → columnar, vectorized, multi-core, with a real query optimizer. Performance is in the same ballpark as a small Spark/Snowflake cluster on a single laptop for medium data.
- **Engine** → it doesn't *own* your data. It reads Parquet/CSV/JSON/Arrow directly. You can use it as a query layer over data living somewhere else (files, DataFrames, even remote S3).

This is fundamentally different from SQLite (which is row-oriented and OLTP-focused) and from Postgres/Snowflake (which own their data and require a server). DuckDB is the **right answer when**: you want SQL, your data fits on one machine, and you don't want to run infrastructure.`,
        },
        {
          kind: "multiple_choice",
          title: "Which tool fits the job?",
          prompt: `A customer drops three weeks of Parquet log dumps (about 80 GB total, partitioned by day) on your laptop and asks: *"Show me p99 latency by feature for last week, excluding errors, broken down by model."* You have a couple of hours. What's the cleanest tool?`,
          choices: [
            {
              text: `Load everything into pandas, then groupby.`,
              correct: false,
              rationale: `80 GB will not fit in your laptop's RAM. You'd OOM before the first \`groupby\` runs.`,
            },
            {
              text: `Spin up a Postgres instance and \`COPY\` the Parquet files in.`,
              correct: false,
              rationale: `Hours of ingest + schema setup for a one-off question. Wrong shape for ad-hoc work.`,
            },
            {
              text: `DuckDB: \`SELECT ... FROM 'data/2026-05-*.parquet' WHERE ts BETWEEN ... GROUP BY ...\`.`,
              correct: true,
              rationale: `DuckDB queries Parquet directly, with predicate pushdown on the date range — it reads only the relevant row groups. One \`SELECT\` answers the question, no ingest step.`,
            },
            {
              text: `Polars lazy: \`pl.scan_parquet(...).filter(...).group_by(...).collect()\`.`,
              correct: false,
              rationale: `**Also correct.** Polars lazy and DuckDB do roughly equivalent work on this shape. Pick DuckDB if you'd rather write SQL; pick Polars if you prefer expressions. The Polars vs DuckDB choice is mostly aesthetics for medium-data analytics.`,
            },
          ],
          explanation: `The "DuckDB or Polars lazy" choice for laptop-scale analytics is more about taste than performance — both are excellent. The wrong answers are the ones that **own your data** (Postgres) or that **assume it fits in memory** (eager pandas).`,
        },
      ],
    },

    // ================================================================
    // 2. Querying files directly (CLI + Python)
    // ================================================================
    {
      title: "Querying files directly (CLI + Python)",
      blocks: [
        {
          kind: "prose",
          markdown: `DuckDB's killer feature is that **a file path is a table**. You can put a Parquet glob, a CSV URL, or a JSON file name directly into \`FROM\` — no \`CREATE TABLE\`, no schema declaration, no \`COPY\` step.

There are three ways you'll invoke DuckDB on the job:

1. **The \`duckdb\` CLI** — opens a SQL REPL. Great for ad-hoc exploration when you don't even want to open a Python interpreter.

   \`\`\`bash
   $ duckdb
   D SELECT model, COUNT(*) FROM 'data/evals/*.parquet' GROUP BY model;
   \`\`\`

2. **\`duckdb.sql(query)\`** in Python — returns a \`DuckDBPyRelation\`. Call \`.df()\` to materialize as a pandas DataFrame, \`.pl()\` for Polars, \`.fetchall()\` for tuples.

   \`\`\`python
   import duckdb
   df = duckdb.sql("""
       SELECT model, COUNT(*) AS n
       FROM 'data/evals/*.parquet'
       GROUP BY model
   """).df()
   \`\`\`

3. **\`duckdb.connect("file.db")\`** — a persistent database file. Use when you have intermediate tables to keep across runs (an ETL output, a deduped staging table). Pass \`":memory:"\` or nothing for an ephemeral in-memory database.

**Reading non-Parquet:**

| File type | Function | Example |
|---|---|---|
| Parquet | \`'path/*.parquet'\` (bare) or \`read_parquet(...)\` | \`FROM 'evals/*.parquet'\` |
| CSV | \`read_csv_auto(...)\` (sniffs schema) or \`'file.csv'\` (bare) | \`FROM read_csv_auto('logs.csv')\` |
| JSON | \`read_json_auto(...)\` | \`FROM read_json_auto('records.json')\` |
| Excel | (extension required) \`read_xlsx(...)\` | \`INSTALL excel; LOAD excel;\` first |
| Remote (S3/HTTPS) | (extension required) bare URL works after \`INSTALL httpfs\` | \`FROM 's3://bucket/evals/*.parquet'\` |

**Glob patterns** are first-class: \`'data/evals/2026-05-*.parquet'\` reads all of May. DuckDB pushes predicates down so a query like \`WHERE ts >= '2026-05-10'\` skips files whose Parquet metadata says they contain no matching rows.`,
        },
        {
          kind: "method_ref",
          title: "DuckDB Python API essentials",
          importLine: `import duckdb`,
          methods: [
            {
              signature: `duckdb.sql("SELECT ...")`,
              description: `Run a query on the default in-process connection. Returns a lazy \`DuckDBPyRelation\` — nothing executes until you fetch.`,
              returns: `DuckDBPyRelation`,
            },
            {
              signature: `.df()`,
              description: `Materialize the result as a pandas DataFrame.`,
              returns: `pd.DataFrame`,
            },
            {
              signature: `.pl()`,
              description: `Materialize the result as a Polars DataFrame.`,
              returns: `pl.DataFrame`,
            },
            {
              signature: `.arrow()`,
              description: `Materialize as a PyArrow Table. Cheapest interop format — zero-copy where possible.`,
              returns: `pa.Table`,
            },
            {
              signature: `.fetchall()`,
              description: `Return a list of tuples. Use only for small results.`,
              returns: `list[tuple]`,
            },
            {
              signature: `con = duckdb.connect("warehouse.db")`,
              description: `Open or create a persistent database file. Use \`":memory:"\` (or nothing) for an in-memory database.`,
              returns: `DuckDBPyConnection`,
            },
            {
              signature: `con.execute("CREATE TABLE ...; INSERT INTO ...")`,
              description: `Run a statement that doesn't return rows. Distinct from \`con.sql(...)\` which builds a relation.`,
              returns: `DuckDBPyConnection (chainable)`,
            },
            {
              signature: `duckdb.sql("SELECT * FROM read_csv_auto('logs.csv')")`,
              description: `Read CSV with schema sniffing. Use \`read_csv\` with explicit \`columns={...}\` if you need to override types.`,
            },
            {
              signature: `duckdb.sql("INSTALL httpfs; LOAD httpfs;")`,
              description: `Install + load an extension (one-time per database file). Common ones: \`httpfs\` (HTTP/S3), \`json\`, \`excel\`, \`postgres_scanner\`.`,
            },
          ],
        },
        {
          kind: "scenario_predict",
          label: "Reading from a Parquet glob",
          scenario: `-- DuckDB CLI:
SELECT model, COUNT(*) AS n
FROM 'data/evals/2026-05-1*.parquet'
WHERE ts >= '2026-05-10' AND status = 'ok'
GROUP BY model
ORDER BY n DESC;`,
          language: "sql",
          question: `What does DuckDB physically read from disk, and what does it skip?`,
          answer: `Only the files matching the glob (\`2026-05-10..19.parquet\`), and within those only the **row groups** whose Parquet metadata indicates they may contain rows with \`ts >= '2026-05-10'\` AND \`status = 'ok'\`. Other row groups are skipped entirely. Within the read row groups, only the columns referenced in the query (\`model\`, \`ts\`, \`status\`) are decoded — \`prompt_tokens\`, \`completion_tokens\`, etc. are not touched.`,
          explanation: `This is **predicate pushdown** + **projection pushdown** — the two reasons DuckDB makes laptop-scale Parquet analytics fast. Parquet stores per-row-group min/max stats; DuckDB's optimizer uses them to skip whole groups. It also only decodes columns you reference. Glob expansion handles the file-level filter. The net effect on this query: a 50-GB dataset might read 500 MB. This is also why **you should partition Parquet output by date or other selective columns** — partitioning lets DuckDB skip entire files (cheapest), not just row groups inside files.`,
        },
        {
          kind: "code_predict",
          label: "DuckDB CLI vs Python: equivalent queries",
          code: `import duckdb

# Compute mean score and total tokens per model
# from a directory of Parquet files. The bare path in FROM is the magic.
result = duckdb.sql("""
    SELECT
        model,
        ROUND(AVG(score), 3)                     AS mean_score,
        SUM(prompt_tokens + completion_tokens)   AS total_tokens
    FROM 'data/evals/*.parquet'
    GROUP BY model
    ORDER BY mean_score DESC
""").fetchall()

# What type is 'result'?
print(type(result).__name__)`,
          output: `list`,
          explanation: `\`fetchall()\` returns a plain Python \`list\` of tuples — one tuple per row. For small results that's fine; for anything you'd actually look at use \`.df()\` (pandas) or \`.pl()\` (Polars) which give you a printable, sliceable frame. The equivalent CLI invocation: pipe the SQL into \`duckdb\` from stdin, or open the REPL and paste it. Same engine, same query plan, same result — just a different front door. This block is display-only because DuckDB isn't bundled with Pyodide.`,
        },
      ],
    },

    // ================================================================
    // 3. DataFrame interop & SQL on pandas/Polars
    // ================================================================
    {
      title: "DataFrame interop & SQL on pandas/Polars",
      blocks: [
        {
          kind: "prose",
          markdown: `DuckDB's second killer feature: **a pandas or Polars DataFrame in your Python scope is a table.** You don't load, register, or copy it. DuckDB sees the variable by name, reads its Arrow buffers in-place, and queries it.

\`\`\`python
import duckdb
import pandas as pd

evals = pd.DataFrame({
    "model": ["opus-4-5", "sonnet-4", "haiku-4"],
    "score": [0.92, 0.88, 0.72],
})

# 'evals' is the in-scope variable name — DuckDB finds it automatically.
result = duckdb.sql("SELECT model, score * 100 AS pct FROM evals ORDER BY pct DESC").df()
\`\`\`

This is **zero-copy** for numeric and most string columns: DuckDB reads pandas' underlying NumPy/Arrow buffers without copying. The implication is huge — you can mix Python data prep and SQL freely. Examples:

- You've cleaned a DataFrame in pandas (deduplication, type coercion). Now you want to compute "p95 latency per model" — easier in SQL than in pandas. DuckDB-query the DataFrame.
- You've loaded model pricing into a small DataFrame and a giant Parquet dataset of requests on disk. DuckDB joins them in one query: SQL \`FROM 'evals/*.parquet'\` joining the in-memory \`pricing\` DataFrame.
- You're in a Jupyter notebook and SQL is just easier than chained pandas calls for the particular question. Drop into \`duckdb.sql(...)\` for that one cell, \`.df()\` back to pandas for the next.

**Polars works the same way.** \`duckdb.sql("SELECT ... FROM polars_df")\` reads Polars' Arrow buffers directly.`,
        },
        {
          kind: "code_comparison",
          label: "Per-model p95 latency: pandas vs DuckDB-on-pandas",
          left: {
            title: "Pure pandas",
            code: `import pandas as pd

# 'evals' is the canonical eval-results DataFrame
summary = (
    evals.groupby("model")
    .agg(
        n=("eval_id", "count"),
        mean_score=("score", "mean"),
        p95_latency_ms=("latency_ms", lambda s: s.quantile(0.95)),
    )
    .reset_index()
    .sort_values("p95_latency_ms")
)`,
            annotation: `Native pandas. The \`lambda\` for the percentile is mildly clunky.`,
          },
          right: {
            title: "DuckDB on the same pandas DataFrame",
            code: `import duckdb

summary = duckdb.sql("""
    SELECT
        model,
        COUNT(*)                                                   AS n,
        ROUND(AVG(score), 3)                                       AS mean_score,
        QUANTILE_CONT(latency_ms, 0.95)                            AS p95_latency_ms
    FROM evals
    GROUP BY model
    ORDER BY p95_latency_ms
""").df()`,
            annotation: `Zero copy of \`evals\`. SQL reads it in place. Percentile is a built-in. Output is a clean pandas DataFrame again.`,
          },
          takeaway: `The decision rule: if the operation feels natural in SQL — multi-aggregate \`GROUP BY\`, window functions, joins, complex predicates — reach for DuckDB. If it's a one-line filter or column derivation, stay in pandas. **You don't have to commit to one library** — they're free to mix at the boundary of every cell.`,
        },
        {
          kind: "scenario_predict",
          label: "Joining a file glob with a DataFrame",
          scenario: `import duckdb
import pandas as pd

pricing = pd.DataFrame({
    "model": ["opus-4-5", "sonnet-4", "haiku-4"],
    "input_per_mtok_usd": [15.0, 3.0, 0.80],
    "output_per_mtok_usd": [75.0, 15.0, 4.0],
})

cost_by_model = duckdb.sql("""
    SELECT
        e.model,
        ROUND(SUM(
            e.prompt_tokens     * p.input_per_mtok_usd  / 1e6
            + e.completion_tokens * p.output_per_mtok_usd / 1e6
        )::DOUBLE, 2) AS cost_usd
    FROM 'data/evals/*.parquet' e
    JOIN pricing                p ON p.model = e.model
    GROUP BY e.model
    ORDER BY cost_usd DESC
""").df()`,
          language: "python",
          question: `What is being joined to what, and where does the data live during execution?`,
          answer: `DuckDB joins **rows streamed from disk** (the Parquet files matching the glob) against an **in-memory pandas DataFrame** (\`pricing\`). Neither side is materialized into a DuckDB table — the Parquet reader feeds the join probe-side directly, and \`pricing\` is read from pandas' Arrow buffers in place.`,
          explanation: `This is the single most useful DuckDB pattern for FDE work: **big-on-disk × small-in-memory join.** You keep the big dataset (logs, eval results, telemetry) on disk and pull in small lookups (pricing, user mappings, feature flags) from Python. DuckDB's planner picks the right join algorithm automatically — typically a hash join with the small side as the build side. No staging tables, no \`INSERT\`, no \`COPY\`. Just SQL across two heterogeneous sources.`,
        },
        {
          kind: "flashcard",
          context: `You finished a DuckDB query that produced 50K rows and want to keep working with it in Polars.`,
          front: `What's the cheapest way to hand the result off, and why does it matter?`,
          back: `\`.arrow()\` — returns a PyArrow \`Table\`, which Polars can wrap in \`pl.from_arrow(...)\` **without copying buffers**. The cost is essentially a pointer reassignment.

\`.df()\` (pandas) and \`.pl()\` (Polars) are also fine for 50K rows, but \`.df()\` may need to convert string/categorical columns and \`.pl()\` is implemented on top of Arrow anyway. For large results or in performance-sensitive code, \`.arrow()\` is the canonical zero-copy handoff.

Pattern: **Arrow is the lingua franca.** DuckDB, Polars, pandas (2.0+), and Pyarrow all speak it natively.`,
        },
      ],
    },

    // ================================================================
    // 4. ETL patterns: clean, transform, write back
    // ================================================================
    {
      title: "ETL patterns: clean, transform, write back",
      blocks: [
        {
          kind: "prose",
          markdown: `Once you can read with \`FROM 'path/*.parquet'\` and join across files and DataFrames, the missing piece is **writing results back out**. That's where DuckDB stops being a query engine and starts being a lightweight ETL tool.

The core writeback statement is \`COPY (SELECT ...) TO 'path' (...)\`. Two forms cover almost everything you'll need:

\`\`\`sql
-- Single output file
COPY (SELECT * FROM evals WHERE status = 'ok')
TO 'data/clean.parquet' (FORMAT PARQUET);

-- Hive-style partitioned output
COPY (SELECT *, date_trunc('day', ts) AS day FROM evals)
TO 'data/partitioned/'
(FORMAT PARQUET, PARTITION_BY (day), OVERWRITE_OR_IGNORE);
\`\`\`

Partitioned output produces a directory like:

\`\`\`
data/partitioned/
├── day=2026-05-10/
│   └── data_0.parquet
├── day=2026-05-11/
│   └── data_0.parquet
└── day=2026-05-12/
    └── data_0.parquet
\`\`\`

Future readers (DuckDB, Polars, Spark) all understand the \`day=...\` convention and can push partition-column predicates down to skip entire directories.

**A typical ETL job in DuckDB is a single SQL script:**

\`\`\`sql
COPY (
    WITH clean AS (
        SELECT *
        FROM read_parquet('raw/*.parquet')
        WHERE status = 'ok'
          AND latency_ms < 60000           -- toss obvious outliers
    ),
    deduped AS (
        SELECT DISTINCT ON (eval_id) *      -- keep one row per eval_id
        FROM clean
        ORDER BY eval_id, ts DESC           -- keep the latest
    )
    SELECT
        *,
        date_trunc('day', ts) AS day,
        prompt_tokens + completion_tokens AS total_tokens
    FROM deduped
)
TO 'staging/evals_clean/'
(FORMAT PARQUET, PARTITION_BY (day), OVERWRITE_OR_IGNORE);
\`\`\`

Filter → deduplicate → enrich → partition → write. The whole thing is one logical statement. No Python orchestrator, no temp tables, no manual file iteration.

**A few DuckDB-specific SQL features worth knowing for ETL:**

- \`DISTINCT ON (col1, col2, ...)\` — Postgres/DuckDB extension. Keeps the first row per key after an \`ORDER BY\`. Cleaner than \`ROW_NUMBER() = 1\`.
- \`QUALIFY\` — DuckDB has it (Postgres doesn't). Filter on a window result without a CTE: \`SELECT *, ROW_NUMBER() OVER (...) AS rn FROM t QUALIFY rn = 1\`.
- \`SELECT * EXCLUDE (col1, col2)\` — emit every column except some. Indispensable for dropping bookkeeping columns at the end of a pipeline.
- \`SELECT * REPLACE (lower(col) AS col)\` — emit every column, but with one transformed. Lets you "fix one column" without re-listing the other twenty.`,
        },
        {
          kind: "method_ref",
          title: "DuckDB ETL building blocks",
          importLine: `-- All native SQL (use from CLI or duckdb.sql() in Python)`,
          methods: [
            {
              signature: `COPY (SELECT ...) TO 'path.parquet' (FORMAT PARQUET, COMPRESSION ZSTD);`,
              description: `Write a query result as a single Parquet file. \`COMPRESSION\` defaults to snappy; \`ZSTD\` gives ~2× better ratio for a small speed cost.`,
            },
            {
              signature: `COPY (...) TO 'dir/' (FORMAT PARQUET, PARTITION_BY (day), OVERWRITE_OR_IGNORE);`,
              description: `Hive-style partitioned write. \`OVERWRITE_OR_IGNORE\` makes the statement idempotent — re-running it replaces partitions without erroring on existing files.`,
            },
            {
              signature: `SELECT DISTINCT ON (eval_id) * FROM evals ORDER BY eval_id, ts DESC`,
              description: `Keep one row per \`eval_id\` — the one with the largest \`ts\` (because of the secondary \`ORDER BY\`). Cleaner than \`ROW_NUMBER() OVER (PARTITION BY ...) = 1\` for the common case.`,
            },
            {
              signature: `SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY ts) AS rn FROM t QUALIFY rn = 1`,
              description: `\`QUALIFY\` is to window functions what \`HAVING\` is to aggregates. Filter on a window result without an outer subquery. Borrowed from Snowflake/BigQuery; missing in Postgres.`,
            },
            {
              signature: `SELECT * EXCLUDE (raw_metadata, _internal_id) FROM t`,
              description: `Emit every column **except** the named ones. Eliminates the need to list 20 columns to drop 2.`,
            },
            {
              signature: `SELECT * REPLACE (lower(email) AS email, ts AT TIME ZONE 'UTC' AS ts) FROM t`,
              description: `Emit every column, transforming the named ones. Pair with \`EXCLUDE\` for very readable ETL pipelines.`,
            },
            {
              signature: `read_parquet(['a.parquet', 'b.parquet'], union_by_name=True)`,
              description: `Read multiple Parquet files even if they have different (overlapping) schemas. Missing columns are filled with NULL. Useful when schema evolves over time.`,
            },
            {
              signature: `INSTALL httpfs; LOAD httpfs;  -- then: FROM 's3://bucket/path/*.parquet'`,
              description: `Query files directly from S3 / HTTPS. Set credentials via \`SET s3_region='...'; SET s3_access_key_id='...'\` or AWS env vars.`,
            },
          ],
        },
        {
          kind: "mini_challenge",
          title: "End-to-end ETL: clean → dedup → partition",
          prompt: `Write a **single DuckDB SQL statement** that:

1. Reads all Parquet under \`raw/evals/*.parquet\`.
2. Filters to \`status = 'ok'\` and \`latency_ms BETWEEN 50 AND 60000\` (drop obvious noise).
3. Deduplicates on \`eval_id\`, keeping the **latest** row by \`ts\`.
4. Adds two derived columns: \`day\` (date_trunc to day) and \`total_tokens\` (prompt + completion).
5. Writes the result to \`staging/evals_clean/\` as **Parquet partitioned by \`day\`**, idempotently (re-runs don't error on existing files).

Constraint: no temp tables, no Python — one \`COPY ... TO ...\` statement, with CTEs.`,
          hints: [
            `Structure: \`COPY (WITH clean AS (...), deduped AS (...) SELECT ... FROM deduped) TO 'path/' (FORMAT PARQUET, PARTITION_BY (day), OVERWRITE_OR_IGNORE);\`.`,
            `For step 3, use \`DISTINCT ON (eval_id) *\` after an \`ORDER BY eval_id, ts DESC\`. The secondary sort key controls which row wins.`,
            `For step 4, compute the new columns in the outer \`SELECT\` after the dedup CTE — keeps each step doing one thing.`,
          ],
          solution: `COPY (
    WITH clean AS (
        SELECT *
        FROM read_parquet('raw/evals/*.parquet')
        WHERE status = 'ok'
          AND latency_ms BETWEEN 50 AND 60000
    ),
    deduped AS (
        SELECT DISTINCT ON (eval_id) *
        FROM clean
        ORDER BY eval_id, ts DESC
    )
    SELECT
        *,
        date_trunc('day', ts) AS day,
        prompt_tokens + completion_tokens AS total_tokens
    FROM deduped
)
TO 'staging/evals_clean/'
(FORMAT PARQUET, PARTITION_BY (day), OVERWRITE_OR_IGNORE);`,
          takeaway: `An entire production-shaped ETL in one statement: scan → filter → dedup → enrich → partition → write. The fact that DuckDB lets you express this *and* runs it efficiently in-process is what makes it the right tool for "I need a real ETL, but I'm not going to spin up Airflow for it." For anything beyond this — schedules, retries, dependencies between jobs — graduate to a proper orchestrator. But the SQL stays the same.`,
        },
        {
          kind: "key_insight",
          label: "When to choose DuckDB (and when not to)",
          insight: `**Reach for DuckDB when:**
- The data fits on one machine (this is a wide door — modern laptops handle 100s of GB of Parquet).
- You want SQL.
- You're doing read-heavy analytics, ETL, or eval-result munging.
- You want to query a mix of files and in-memory DataFrames.

**Don't reach for DuckDB when:**
- You need concurrent writers or transactional updates. DuckDB is great for **one process** writing at a time. For multi-writer use cases, you want Postgres.
- You need a service other apps can connect to. DuckDB is in-process; if you want a server, look elsewhere.
- The data genuinely doesn't fit on one machine. At that scale, Snowflake/BigQuery/Spark/Trino. (But verify — "doesn't fit" usually means "didn't try Parquet + DuckDB.")

The most common FDE pattern: **DuckDB for the ad-hoc and one-off,** **Postgres or the customer's warehouse for anything that needs to live behind an API.** Knowing both means you can answer almost any analytics question without filing a ticket.`,
        },
      ],
    },
  ],
};
