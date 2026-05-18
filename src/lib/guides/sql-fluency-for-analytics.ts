import type { StudyGuide } from "../guide-types";

export const sqlFluencyForAnalyticsGuide: StudyGuide = {
  topicTitle: "SQL fluency for analytics",
  topicSlug: "sql-fluency-for-analytics",
  sections: [
    // ================================================================
    // 1. Mental model & the canonical schema
    // ================================================================
    {
      title: "Mental model & the canonical schema",
      blocks: [
        {
          kind: "prose",
          markdown: `As an FDE you will be handed prompts like *"how much is org\\_42 spending per feature this week?"* or *"what's our p99 latency on the agent endpoint?"* and you need to answer them from the warehouse without help. That means SQL — not pandas, not a dashboard, not "let me ask data."

This guide is built around a single canonical schema you'll see in every block, modeled on real LLM telemetry:

\`\`\`sql
-- One row per Anthropic API call
CREATE TABLE requests (
  request_id    text PRIMARY KEY,
  ts            timestamptz,         -- when the request happened
  user_id       text,
  org_id        text,
  feature       text,                -- 'chat' | 'summarize' | 'agent' | ...
  model         text,                -- 'claude-opus-4-5' | 'claude-sonnet-4' | ...
  input_tokens  int,
  output_tokens int,
  latency_ms    int,
  status        text,                -- 'ok' | 'error'
  error_code    text,                -- null when status='ok'
  metadata      jsonb                -- { "session_id": "...", "tool_calls": [...] }
);

-- One row per (model, effective_date). Newer rows override older ones.
CREATE TABLE model_pricing (
  model               text,
  effective_date      date,
  input_per_mtok_usd  numeric,
  output_per_mtok_usd numeric
);

CREATE TABLE users (user_id text PRIMARY KEY, org_id text, plan text);
\`\`\`

All examples are **Postgres-flavored** (JSON \`->\` / \`->>\`, \`FILTER (WHERE ...)\`, \`PERCENTILE_CONT\`, no \`QUALIFY\`). Where Snowflake or DuckDB diverge meaningfully I'll call it out.

You don't need to memorize the schema — it's pinned mentally by the end of section 2 just by using it. Focus on *patterns*, not syntax soup.`,
        },
        {
          kind: "key_insight",
          label: "Mental model",
          insight: `SQL's logical evaluation order is *not* the order you write it:

\`\`\`
FROM → JOIN → WHERE → GROUP BY → HAVING → SELECT → DISTINCT → ORDER BY → LIMIT
\`\`\`

Window functions slot in *after* \`SELECT\` (before \`DISTINCT\`/\`ORDER BY\`). This single fact explains 80% of "why doesn't this work" SQL bugs: you can't filter on an alias in \`WHERE\` (alias doesn't exist yet), you can't filter on a window result without a CTE/subquery (window hasn't run yet), and \`HAVING\` exists because \`WHERE\` runs before aggregation.`,
        },
        {
          kind: "flashcard",
          context: `You wrote: SELECT user_id, COUNT(*) AS n FROM requests WHERE n > 100 GROUP BY user_id;`,
          front: `Why does this fail, and what's the fix?`,
          back: `\`WHERE\` runs **before** \`GROUP BY\`/\`SELECT\`, so the alias \`n\` doesn't exist yet and the aggregate \`COUNT(*)\` isn't computed yet. Two fixes:

1. Use \`HAVING\`: \`... GROUP BY user_id HAVING COUNT(*) > 100\` — \`HAVING\` runs after aggregation.
2. Wrap in a CTE/subquery and filter on the alias from the outer query.

Postgres also lets you reference a SELECT alias in \`GROUP BY\`/\`ORDER BY\` as a convenience, but never in \`WHERE\`.`,
        },
        {
          kind: "multiple_choice",
          title: "Filtering an aggregate",
          prompt: `You want to compute, per user, the total tokens *only across error requests* and the total tokens across **all** requests, in a single query. Which is the cleanest, single-pass Postgres approach?`,
          choices: [
            {
              text: `Two separate queries with a UNION, then aggregate in the app.`,
              correct: false,
              rationale: `Works but wastes a full table scan and pushes work to the client.`,
            },
            {
              text: `One query using \`SUM(input_tokens + output_tokens) FILTER (WHERE status = 'error')\` alongside an unfiltered \`SUM\`.`,
              correct: true,
              rationale: `\`FILTER (WHERE ...)\` is the canonical Postgres way to do conditional aggregation in a single pass. Cleaner and faster than CASE expressions.`,
            },
            {
              text: `Put \`status = 'error'\` in the outer \`WHERE\` clause, then also compute total tokens with a second aggregate.`,
              correct: false,
              rationale: `Filtering in \`WHERE\` drops the non-error rows entirely — you can no longer compute the unfiltered total in the same query.`,
            },
            {
              text: `\`SUM(CASE WHEN status = 'error' THEN input_tokens + output_tokens ELSE 0 END)\` paired with an unfiltered \`SUM\`.`,
              correct: false,
              rationale: `Works and is portable across dialects, but \`FILTER\` is the modern, more readable Postgres idiom. Both are equivalent.`,
            },
          ],
          explanation: `\`FILTER (WHERE condition)\` attaches a row-level filter to a *single aggregate*, leaving other aggregates in the same SELECT unaffected. It's the modern Postgres replacement for \`SUM(CASE WHEN ... THEN ... END)\`. Snowflake and DuckDB also support it. SQL Server does not — fall back to CASE there.`,
        },
      ],
    },

    // ================================================================
    // 2. Joins & aggregates done right
    // ================================================================
    {
      title: "Joins & aggregates done right",
      blocks: [
        {
          kind: "prose",
          markdown: `Most analytics bugs trace back to two things: **misunderstood joins** and **aggregates that count the wrong rows**. Get these right and you've eliminated the majority of "the dashboard is lying to me" incidents.

The five joins you'll actually use:

| Join | Keeps | Use when |
|---|---|---|
| \`INNER JOIN\` | Matches only | You need both sides present (e.g., requests + their pricing row). |
| \`LEFT JOIN\` | All of left, matches on right | You want to keep all left rows even if no match — e.g., all requests, even from users since deleted. |
| \`FULL OUTER JOIN\` | Everything | Reconciling two systems that should agree but don't. Rare in analytics. |
| Anti-join (\`WHERE NOT EXISTS\` / \`LEFT JOIN ... WHERE r.id IS NULL\`) | Left rows with no right match | "Users who haven't made a request in 30 days." |
| Semi-join (\`WHERE EXISTS\`) | Left rows *with* a right match — no duplication | "Users who used the agent feature at least once." Crucially: doesn't multiply rows the way INNER JOIN does. |

The single biggest footgun: **joining duplicates a row on the left whenever multiple right rows match**. If \`model_pricing\` has three effective-dated rows for \`claude-opus-4-5\`, a naïve join of \`requests\` to \`model_pricing\` on \`model\` triples every request row. Always think: *how many right-side rows match each left-side row?*`,
        },
        {
          kind: "code_comparison",
          label: "Counting requests per user with a LEFT JOIN",
          left: {
            title: "Wrong: COUNT(*) inflates",
            code: `-- Goal: requests per user, including users with 0 requests
SELECT u.user_id, COUNT(*) AS n_requests
FROM users u
LEFT JOIN requests r ON r.user_id = u.user_id
GROUP BY u.user_id;`,
            annotation: `Users with zero requests still get \`n_requests = 1\` because the LEFT JOIN preserves the user row with NULLs from requests, and \`COUNT(*)\` counts that row.`,
          },
          right: {
            title: "Right: COUNT a non-null column from the right side",
            code: `SELECT u.user_id, COUNT(r.request_id) AS n_requests
FROM users u
LEFT JOIN requests r ON r.user_id = u.user_id
GROUP BY u.user_id;`,
            annotation: `\`COUNT(col)\` skips NULLs, so users with no matching requests correctly count as 0.`,
          },
          takeaway: `After a LEFT/FULL join, **always count a non-nullable column from the optional side**, not \`COUNT(*)\`. Same rule applies to \`SUM\`, \`AVG\`, etc. — they ignore NULLs, but \`COUNT(*)\` does not.`,
        },
        {
          kind: "scenario_predict",
          label: "GROUP BY without aggregating every selected column",
          scenario: `SELECT user_id, feature, COUNT(*) AS n
FROM requests
WHERE ts >= now() - interval '7 days'
GROUP BY user_id;`,
          language: "sql",
          question: `What happens when you run this against Postgres?`,
          answer: `Postgres raises an error: \`column "requests.feature" must appear in the GROUP BY clause or be used in an aggregate function\`.`,
          explanation: `Standard SQL requires every non-aggregated column in the \`SELECT\` to appear in \`GROUP BY\` (or be functionally dependent on the grouped columns). Postgres enforces this strictly. MySQL with \`ONLY_FULL_GROUP_BY\` disabled silently picks an arbitrary \`feature\` value per group — which is how stealth bugs ship to production. Fix: add \`feature\` to \`GROUP BY\` (you now get per-(user, feature) counts) or remove it from the SELECT.`,
        },
        {
          kind: "warm_up",
          title: "Conditional aggregation with FILTER",
          prompt: `Fill in the blank to compute, per feature, **total requests** and **error rate** in a single aggregate pass:

\`\`\`sql
SELECT
  feature,
  COUNT(*) AS total,
  COUNT(*) ______________________________ AS errors,
  COUNT(*) ______________________________ * 1.0 / COUNT(*) AS error_rate
FROM requests
WHERE ts >= now() - interval '7 days'
GROUP BY feature;
\`\`\``,
          answer: `\`FILTER (WHERE status = 'error')\` in both blanks.`,
          explanation: `\`FILTER\` attaches a per-row predicate to a single aggregate, so the \`errors\` count only sums rows matching \`status = 'error'\` while the outer \`COUNT(*)\` still sees everything. Multiplying by \`1.0\` forces float division (otherwise Postgres does integer division and you get 0 for low rates). Snowflake/DuckDB support \`FILTER\`; SQL Server uses \`COUNT(CASE WHEN ... END)\`.`,
        },
        {
          kind: "flashcard",
          front: `When do you need \`COUNT(DISTINCT col)\` instead of \`COUNT(col)\` — and what's the cost?`,
          back: `Use \`COUNT(DISTINCT col)\` when you want **unique values**, not row count. Example: "how many *distinct users* made a request today" vs "how many requests today."

Cost: \`COUNT(DISTINCT)\` cannot use a streaming hash aggregate the way plain \`COUNT\` can — it has to materialize all distinct values, which on a billion-row table can blow memory or spill to disk. On large warehouses prefer:

- **HyperLogLog approximations**: Postgres \`approx_count_distinct\` (via extension) or Snowflake \`APPROX_COUNT_DISTINCT\` — ~1% error, dramatically cheaper.
- Pre-aggregation in a CTE if you're going to use the distinct count multiple times.`,
        },
      ],
    },

    // ================================================================
    // 3. CTEs & window functions
    // ================================================================
    {
      title: "CTEs & window functions (the analytics workhorse)",
      blocks: [
        {
          kind: "prose",
          markdown: `If joins and \`GROUP BY\` are the SQL you learned in school, **CTEs and window functions are the SQL you'll actually write at work**. They let you express "for each group, do something *ordered*" without dropping out into a procedural language.

**CTEs (\`WITH\`):** A CTE is a named subquery that lives at the top of your statement. Two reasons to reach for them:

1. **Readability.** Build the query in named layers — \`daily_rollup\`, \`with_running_total\`, \`top_per_user\` — instead of one nested mess.
2. **Reuse.** Reference the same intermediate result twice without copy-pasting.

A note on materialization: in Postgres ≥ 12, CTEs are *inlined like subqueries by default* and the planner can push predicates through them. Older Postgres (and the \`MATERIALIZED\` keyword) forces a fence — the CTE executes once and is reused. Snowflake and BigQuery inline by default. DuckDB inlines by default.

**Window functions:** A window function computes a value *per row*, but with access to a "window" of related rows defined by:

- \`PARTITION BY\` — slice the table into groups (like \`GROUP BY\`, but rows stay individual).
- \`ORDER BY\` — order within each partition.
- \`ROWS BETWEEN ... AND ...\` or \`RANGE BETWEEN ...\` — the frame (which rows in the partition contribute).

Crucially, window functions **do not collapse rows**. \`GROUP BY\` gives you one row per group; a window function gives you the original rows plus an extra column computed across the group.`,
        },
        {
          kind: "method_ref",
          title: "Window functions cheat sheet (Postgres)",
          importLine: `-- All window functions take an OVER () clause`,
          methods: [
            {
              signature: `ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...)`,
              description: `Unique sequential number per row within each partition. Standard "top-N per group" tool: filter on \`rn = 1\` in an outer query.`,
              returns: `int (1, 2, 3, ... with no ties)`,
            },
            {
              signature: `RANK() OVER (...)`,
              description: `Like ROW_NUMBER but ties share a rank and *skip* subsequent numbers (1, 2, 2, 4).`,
              returns: `int`,
            },
            {
              signature: `DENSE_RANK() OVER (...)`,
              description: `Like RANK but ties share a rank and the next is contiguous (1, 2, 2, 3).`,
              returns: `int`,
            },
            {
              signature: `LAG(col, n DEFAULT 1, default_value)`,
              description: `Value of \`col\` n rows *before* the current row in the partition order. Use for "delta vs previous" calculations.`,
              returns: `same type as col`,
            },
            {
              signature: `LEAD(col, n DEFAULT 1, default_value)`,
              description: `Value of \`col\` n rows *after* the current row. Mirror image of LAG.`,
              returns: `same type as col`,
            },
            {
              signature: `SUM(col) OVER (PARTITION BY ... ORDER BY ... ROWS BETWEEN x PRECEDING AND CURRENT ROW)`,
              description: `Moving window sum. Same syntax works for AVG, MIN, MAX, COUNT — making them moving aggregates.`,
              returns: `same type as col`,
            },
            {
              signature: `PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) OVER (PARTITION BY feature)`,
              description: `Continuous percentile (interpolated). For latency p99 etc. \`PERCENTILE_DISC\` returns the nearest actual observed value instead.`,
              returns: `float8`,
            },
            {
              signature: `FIRST_VALUE(col) / LAST_VALUE(col) OVER (...)`,
              description: `First/last value in the frame. Beware: default frame for these is \`RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW\`, so LAST_VALUE almost always needs an explicit \`ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING\` to do what you expect.`,
              returns: `same type as col`,
            },
          ],
        },
        {
          kind: "scenario_predict",
          label: "Frame default gotcha",
          scenario: `-- Daily token totals across all users:
WITH daily AS (
  SELECT date_trunc('day', ts) AS day,
         SUM(input_tokens + output_tokens) AS tokens
  FROM requests
  GROUP BY day
)
SELECT
  day,
  tokens,
  SUM(tokens) OVER (ORDER BY day) AS running_total
FROM daily
ORDER BY day;`,
          language: "sql",
          question: `If \`daily\` has rows (Mon, 100), (Tue, 50), (Wed, 75), (Thu, 200), what is \`running_total\` for Thu?`,
          answer: `425 (= 100 + 50 + 75 + 200) — but be careful: this works *because* every \`day\` value is unique.`,
          explanation: `When a window has \`ORDER BY\` but no explicit frame, the default is \`RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW\`. \`RANGE\` includes *all rows with the same value in the ORDER BY column as the current row*. So if Mon appeared twice with values (Mon, 100) and (Mon, 40), the running total at the first Mon row would already be 140, not 100. The safe habit: write \`ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW\` explicitly when you mean "every prior row." Use \`RANGE\` only when you specifically want value-based frames (e.g., \`RANGE BETWEEN INTERVAL '6 days' PRECEDING AND CURRENT ROW\`).`,
        },
        {
          kind: "code_comparison",
          label: "First request per user per day",
          left: {
            title: "Self-join + MIN (verbose, slow)",
            code: `SELECT r.*
FROM requests r
JOIN (
  SELECT user_id, date_trunc('day', ts) AS day, MIN(ts) AS first_ts
  FROM requests
  GROUP BY user_id, day
) f
  ON r.user_id = f.user_id
 AND r.ts = f.first_ts;`,
            annotation: `Two passes over \`requests\`, plus a tie-breaking edge case if two requests share an exact timestamp.`,
          },
          right: {
            title: "ROW_NUMBER (one pass, ties handled)",
            code: `SELECT *
FROM (
  SELECT
    r.*,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, date_trunc('day', ts)
      ORDER BY ts, request_id
    ) AS rn
  FROM requests r
) ranked
WHERE rn = 1;`,
            annotation: `Single pass. Adding \`request_id\` as a tiebreaker in \`ORDER BY\` guarantees deterministic output even with timestamp collisions.`,
          },
          takeaway: `"Top N per group" is the canonical window function pattern. Reach for \`ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...) = N\` filtered in an outer query (Postgres) or \`QUALIFY ROW_NUMBER() OVER (...) = N\` (Snowflake/DuckDB).`,
        },
        {
          kind: "code_predict",
          label: "Python bridge: what a window function would replace",
          code: `# Imagine you're given the data as a list of dicts and want
# "first request per user per day" without SQL:
from collections import defaultdict
from datetime import date

reqs = [
    {"request_id": "a", "user_id": "u1", "ts": (date(2026, 1, 1), 9, 0)},
    {"request_id": "b", "user_id": "u1", "ts": (date(2026, 1, 1), 9, 5)},
    {"request_id": "c", "user_id": "u1", "ts": (date(2026, 1, 2), 8, 0)},
    {"request_id": "d", "user_id": "u2", "ts": (date(2026, 1, 1), 10, 0)},
]

first_per_user_day = {}
for r in sorted(reqs, key=lambda x: x["ts"]):
    key = (r["user_id"], r["ts"][0])
    if key not in first_per_user_day:
        first_per_user_day[key] = r["request_id"]

print(sorted(first_per_user_day.values()))`,
          output: `['a', 'c', 'd']`,
          explanation: `Sort by timestamp, walk in order, keep the first request_id seen per (user, day). This is exactly what \`ROW_NUMBER() OVER (PARTITION BY user_id, date_trunc('day', ts) ORDER BY ts) = 1\` does — but in SQL the partitioning, ordering, and "first match" are declarative. Window functions are best understood as "declarative iteration over partitions."`,
          runnable: true,
        },
        {
          kind: "mini_challenge",
          title: "7-day rolling cost per user",
          prompt: `Write a query that returns, for each \`(user_id, day)\` in the last 30 days, the **7-day rolling cost in USD** (today plus the 6 prior days).

Constraints:
- Pricing is effective-dated in \`model_pricing\` — pick the row whose \`effective_date\` is the latest one ≤ the request's \`ts::date\`.
- Cost = \`input_tokens * input_per_mtok_usd / 1e6 + output_tokens * output_per_mtok_usd / 1e6\`.
- Output columns: \`user_id\`, \`day\`, \`rolling_7d_cost_usd\`.
- One row per (user, day) where the user had ≥ 1 request that day.`,
          hints: [
            `Effective-dated join trick: \`JOIN model_pricing p ON p.model = r.model AND p.effective_date = (SELECT MAX(effective_date) FROM model_pricing p2 WHERE p2.model = r.model AND p2.effective_date <= r.ts::date)\`. Or use \`DISTINCT ON\` in a CTE.`,
            `Compute daily cost per user in a CTE first, then layer the window function on top — don't try to do everything in one SELECT.`,
            `For the window, use \`SUM(daily_cost) OVER (PARTITION BY user_id ORDER BY day RANGE BETWEEN INTERVAL '6 days' PRECEDING AND CURRENT ROW)\`. \`RANGE\` with an interval handles missing days correctly (a day with zero requests just doesn't appear, and the window still looks back 7 calendar days).`,
          ],
          solution: `WITH priced AS (
  SELECT
    r.user_id,
    r.ts::date AS day,
    r.input_tokens  * p.input_per_mtok_usd  / 1e6
      + r.output_tokens * p.output_per_mtok_usd / 1e6 AS cost_usd
  FROM requests r
  JOIN LATERAL (
    SELECT *
    FROM model_pricing p2
    WHERE p2.model = r.model
      AND p2.effective_date <= r.ts::date
    ORDER BY p2.effective_date DESC
    LIMIT 1
  ) p ON true
  WHERE r.ts >= now() - interval '30 days'
),
daily AS (
  SELECT user_id, day, SUM(cost_usd) AS daily_cost
  FROM priced
  GROUP BY user_id, day
)
SELECT
  user_id,
  day,
  SUM(daily_cost) OVER (
    PARTITION BY user_id
    ORDER BY day
    RANGE BETWEEN INTERVAL '6 days' PRECEDING AND CURRENT ROW
  ) AS rolling_7d_cost_usd
FROM daily
ORDER BY user_id, day;`,
          takeaway: `Two patterns to internalize: (1) **effective-dated joins** via \`LATERAL\` + \`ORDER BY ... LIMIT 1\` (or \`DISTINCT ON\` in Postgres), and (2) **\`RANGE BETWEEN INTERVAL ...\` for time-based rolling windows** — robust against missing days, unlike \`ROWS BETWEEN N PRECEDING\` which assumes rows are evenly spaced.`,
        },
        {
          kind: "key_insight",
          label: "Why Postgres has no QUALIFY",
          insight: `In Snowflake, BigQuery, and DuckDB you can write:

\`\`\`sql
SELECT user_id, ts, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY ts) AS rn
FROM requests
QUALIFY rn = 1;
\`\`\`

\`QUALIFY\` is to window functions what \`HAVING\` is to aggregates — it filters *after* the window has been computed. Postgres has no \`QUALIFY\` (as of PG 17), so the equivalent is always a CTE or subquery:

\`\`\`sql
SELECT * FROM (
  SELECT user_id, ts, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY ts) AS rn
  FROM requests
) t WHERE rn = 1;
\`\`\`

This isn't slower — it's purely syntactic. The Postgres planner sees through it. But it's worth remembering when you copy-paste a Snowflake query.`,
        },
      ],
    },

    // ================================================================
    // 4. JSON, dates, and percentiles
    // ================================================================
    {
      title: "JSON, dates, and percentiles",
      blocks: [
        {
          kind: "prose",
          markdown: `Production telemetry tables almost always have a \`metadata jsonb\` column for the stuff schema-design didn't anticipate: tool calls, session IDs, feature flags, A/B bucket assignments. Being fluent in JSON operators is the difference between answering "how many sessions used the agent loop?" in two minutes versus filing a ticket for data eng.

This section is the "stuff people forget" reference: Postgres JSON operators, date truncation, time zones, and percentile aggregates.`,
        },
        {
          kind: "method_ref",
          title: "Postgres JSON / date / percentile reference",
          importLine: `-- All built-in. metadata is jsonb in our schema.`,
          methods: [
            {
              signature: `metadata -> 'session_id'`,
              description: `Get the value at key \`session_id\` **as jsonb** (preserves type). Compare to other jsonb values, or chain another \`->\` to descend deeper.`,
              returns: `jsonb`,
            },
            {
              signature: `metadata ->> 'session_id'`,
              description: `Get the value at key \`session_id\` **as text**. This is what you want when comparing to a string literal in \`WHERE\`.`,
              returns: `text`,
            },
            {
              signature: `metadata #> '{tool_calls,0,name}'`,
              description: `Get jsonb at a path (array of keys/indices). \`#>>\` returns text.`,
              returns: `jsonb (or text for #>>)`,
            },
            {
              signature: `jsonb_array_length(metadata -> 'tool_calls')`,
              description: `Length of a jsonb array. Returns NULL if the value isn't an array.`,
              returns: `int`,
            },
            {
              signature: `jsonb_array_elements(metadata -> 'tool_calls')`,
              description: `Set-returning function: expands a jsonb array into one row per element. Use in \`FROM\` with \`LATERAL\` to "unnest" arrays for aggregation.`,
              returns: `setof jsonb`,
            },
            {
              signature: `metadata @> '{"plan": "pro"}'::jsonb`,
              description: `"Contains" operator — true if left jsonb contains right as a subset. Critically, this is **indexable** with a GIN index on the jsonb column.`,
              returns: `boolean`,
            },
            {
              signature: `date_trunc('day', ts)`,
              description: `Truncate timestamp to a unit ('hour', 'day', 'week', 'month', 'year'). Returns a timestamp, not a date.`,
              returns: `timestamp`,
            },
            {
              signature: `ts AT TIME ZONE 'America/Los_Angeles'`,
              description: `Convert a \`timestamptz\` to local time in the named zone. Crucial when "daily" means a customer's local day, not UTC.`,
              returns: `timestamp (without tz)`,
            },
            {
              signature: `PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms)`,
              description: `Continuous (interpolated) percentile. The "p99" people mean. Ordered-set aggregate — note the unusual \`WITHIN GROUP (ORDER BY ...)\` syntax.`,
              returns: `float8`,
            },
            {
              signature: `PERCENTILE_DISC(0.99) WITHIN GROUP (ORDER BY latency_ms)`,
              description: `Discrete percentile — returns an actual observed value. Use for non-numeric ordered columns or when you need an existing row.`,
              returns: `same type as ordered column`,
            },
          ],
        },
        {
          kind: "scenario_predict",
          label: "-> vs ->> in WHERE",
          scenario: `-- Two queries:
-- (A)
SELECT count(*) FROM requests WHERE metadata->'session_id' = 'sess_abc123';

-- (B)
SELECT count(*) FROM requests WHERE metadata->>'session_id' = 'sess_abc123';`,
          language: "sql",
          question: `Which query returns the expected count, and what happens to the other?`,
          answer: `**(B) is correct.** (A) raises an error: \`operator does not exist: jsonb = unknown\` (or in some cases silently returns 0).`,
          explanation: `\`->\` returns jsonb; a string literal like \`'sess_abc123'\` is \`text\`. Postgres won't implicitly cast between them. Two fixes for (A): cast the literal — \`metadata->'session_id' = '"sess_abc123"'::jsonb\` (note the **quoted** jsonb string) — or, more idiomatically, use \`->>\` to extract text in the first place. Rule of thumb: **\`->>\` for comparisons to literals, \`->\` for descending further into jsonb structure**.`,
        },
        {
          kind: "warm_up",
          title: "Daily rollup unit",
          prompt: `You want one row per **calendar day in UTC** with total requests. Fill in the blank:

\`\`\`sql
SELECT
  date_trunc(______, ts) AS day,
  COUNT(*) AS n
FROM requests
WHERE ts >= now() - interval '30 days'
GROUP BY day
ORDER BY day;
\`\`\`

Then: what change would you make if "day" means **the customer's local day** in \`America/New_York\`?`,
          answer: `\`'day'\` (a string). For local-day grouping, replace \`ts\` with \`(ts AT TIME ZONE 'America/New_York')\`: \`date_trunc('day', ts AT TIME ZONE 'America/New_York')\`.`,
          explanation: `\`date_trunc\` takes the unit as a string literal. The time-zone gotcha is everywhere in production telemetry: \`timestamptz\` columns store UTC internally, and \`date_trunc('day', ts)\` always groups by UTC days. If a customer is in NY and asks "how many requests yesterday?", "yesterday" is *their* yesterday — which can disagree with UTC by hours. Convert to their zone first, then truncate.`,
        },
        {
          kind: "multiple_choice",
          title: "p50 / p95 / p99 latency by feature",
          prompt: `You want **p50, p95, and p99 of \`latency_ms\` per feature** across the last 7 days, excluding errors. Pick the cleanest single query.`,
          code: `-- Schema reminder: requests(feature, latency_ms, status, ts)`,
          choices: [
            {
              text: `Run three separate queries (one per percentile) and union the results.`,
              correct: false,
              rationale: `Three full scans. Wasteful and harder to read.`,
            },
            {
              text: `\`SELECT feature,
       PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY latency_ms) AS p50,
       PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95,
       PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) AS p99
FROM requests
WHERE ts >= now() - interval '7 days' AND status = 'ok'
GROUP BY feature;\``,
              correct: true,
              rationale: `One pass; three ordered-set aggregates computed in parallel by the planner. The canonical pattern.`,
            },
            {
              text: `\`SELECT feature, PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE status = 'ok') AS p99 FROM requests GROUP BY feature;\``,
              correct: false,
              rationale: `\`FILTER\` is not supported on ordered-set aggregates (\`PERCENTILE_CONT\`) in Postgres. Move the predicate to \`WHERE\` instead.`,
            },
            {
              text: `Use \`PERCENTILE_DISC\` everywhere — it's faster.`,
              correct: false,
              rationale: `\`PERCENTILE_DISC\` returns an actual observed value rather than interpolating. It's not meaningfully faster and produces step-function output, which is usually not what you want for latency. Use \`PERCENTILE_CONT\` for continuous numeric distributions.`,
            },
          ],
          explanation: `Three things to remember about percentile aggregates in Postgres:

1. Syntax is \`PERCENTILE_CONT(fraction) WITHIN GROUP (ORDER BY col)\` — not the usual aggregate form.
2. They can run side-by-side in one query — the planner only sorts \`latency_ms\` once per group.
3. \`FILTER\` is not allowed on ordered-set aggregates; push the predicate up to \`WHERE\`.

In Snowflake / DuckDB the equivalent is identical syntax.`,
        },
      ],
    },

    // ================================================================
    // 5. Interview drill: production telemetry queries
    // ================================================================
    {
      title: "Interview drill: production telemetry queries",
      blocks: [
        {
          kind: "prose",
          markdown: `If someone slides a laptop across the table and says *"open a SQL editor — show me X for production,"* there's a repeatable approach that works for almost every prompt:

1. **Pick the grain.** One row per *what*? (user-day? request? feature-hour?) The grain determines your \`GROUP BY\` or your window \`PARTITION BY\`.
2. **Choose the join shape.** Inner or left? Are there 1-to-many relationships that will inflate counts? Effective-dated lookups (like pricing) need \`LATERAL\` or \`DISTINCT ON\`.
3. **Decide: group vs window.** Want one row per group? \`GROUP BY\`. Want one row per input plus a derived column over peers? Window function.
4. **Layer with CTEs.** Each CTE = one named step. If a single query is longer than 30 lines, you're probably skipping CTEs.
5. **Format the output.** Round currencies, name columns, sort sensibly. The interviewer reads the result, not the query.

The next three mini-challenges are the questions you should be able to write fluently in under 5 minutes each.`,
        },
        {
          kind: "mini_challenge",
          title: "Per-user cost, last 30 days",
          prompt: `Return total cost in USD per user over the last 30 days, sorted highest to lowest, with users tied to their current org.

Output columns: \`org_id\`, \`user_id\`, \`cost_usd_30d\`.

Tricky parts: model_pricing is effective-dated, and you want users who *currently* belong to an org (so \`requests\` → \`users\`, not the other way around for the org lookup).`,
          hints: [
            `Use \`LATERAL\` (or \`DISTINCT ON\`) to pick the effective pricing row for each request's date.`,
            `Join \`users\` for the org. \`INNER JOIN\` is fine if all users exist; \`LEFT JOIN\` if you want to keep requests from users since deleted (they'll have NULL org).`,
            `Aggregate with \`SUM\` at the end. Round to 2 decimals with \`ROUND(x::numeric, 2)\` (Postgres' \`ROUND(double precision, int)\` doesn't exist — cast to numeric).`,
          ],
          solution: `SELECT
  u.org_id,
  r.user_id,
  ROUND(SUM(
    r.input_tokens  * p.input_per_mtok_usd  / 1e6
    + r.output_tokens * p.output_per_mtok_usd / 1e6
  )::numeric, 2) AS cost_usd_30d
FROM requests r
JOIN users u ON u.user_id = r.user_id
JOIN LATERAL (
  SELECT *
  FROM model_pricing p2
  WHERE p2.model = r.model
    AND p2.effective_date <= r.ts::date
  ORDER BY p2.effective_date DESC
  LIMIT 1
) p ON true
WHERE r.ts >= now() - interval '30 days'
GROUP BY u.org_id, r.user_id
ORDER BY cost_usd_30d DESC;`,
          takeaway: `Effective-dated lookups are the silent killer. The \`LATERAL\` + \`ORDER BY ... LIMIT 1\` pattern is correct under any pricing change history. A naive \`JOIN model_pricing ON model = model\` multiplies your bill by however many pricing rows you have per model.`,
        },
        {
          kind: "mini_challenge",
          title: "p50 / p95 / p99 latency by feature, last 7 days",
          prompt: `Return per-feature p50, p95, p99 latency in milliseconds across the last 7 days, **excluding errors**. Include the count of OK requests per feature so you can spot small-sample features.

Output columns: \`feature\`, \`n_ok\`, \`p50_ms\`, \`p95_ms\`, \`p99_ms\`.`,
          hints: [
            `One query, one pass. No CTE needed.`,
            `Predicates go in \`WHERE\` — \`FILTER\` does not work on \`PERCENTILE_CONT\`.`,
            `Cast the result of \`PERCENTILE_CONT\` (float8) back to \`int\` if you want round millisecond values.`,
          ],
          solution: `SELECT
  feature,
  COUNT(*) AS n_ok,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY latency_ms)::int AS p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)::int AS p95_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms)::int AS p99_ms
FROM requests
WHERE ts >= now() - interval '7 days'
  AND status = 'ok'
GROUP BY feature
ORDER BY p99_ms DESC;`,
          takeaway: `Three percentiles in one pass is the standard pattern. When you present this in an interview, mention the small-sample caveat explicitly — p99 on 50 requests is noise.`,
        },
        {
          kind: "mini_challenge",
          title: "Daily error rate by model, with 7-day moving average",
          prompt: `For each \`(model, day)\` in the last 30 days, return the daily error rate and a **7-day trailing moving average** of that rate. Use it to spot a model whose errors are creeping up.

Output columns: \`model\`, \`day\`, \`error_rate\`, \`error_rate_7d_avg\`.`,
          hints: [
            `Step 1 (CTE \`daily\`): per (model, day), compute \`total\` and \`errors\` with \`COUNT(*) FILTER (WHERE status = 'error')\`. Then \`error_rate = errors::float / total\`.`,
            `Step 2: window function on top of the CTE: \`AVG(error_rate) OVER (PARTITION BY model ORDER BY day RANGE BETWEEN INTERVAL '6 days' PRECEDING AND CURRENT ROW)\`.`,
            `Use \`RANGE\` with an interval (not \`ROWS BETWEEN 6 PRECEDING\`) — \`ROWS\` would assume 7 *rows* of data, which fails the moment any model has a quiet day with zero requests (no row).`,
          ],
          solution: `WITH daily AS (
  SELECT
    model,
    ts::date AS day,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE status = 'error') AS errors,
    COUNT(*) FILTER (WHERE status = 'error')::float / COUNT(*) AS error_rate
  FROM requests
  WHERE ts >= now() - interval '30 days'
  GROUP BY model, day
)
SELECT
  model,
  day,
  ROUND(error_rate::numeric, 4) AS error_rate,
  ROUND(
    AVG(error_rate) OVER (
      PARTITION BY model
      ORDER BY day
      RANGE BETWEEN INTERVAL '6 days' PRECEDING AND CURRENT ROW
    )::numeric,
    4
  ) AS error_rate_7d_avg
FROM daily
ORDER BY model, day;`,
          takeaway: `Three composed patterns: (1) \`FILTER\` for conditional aggregation, (2) CTE to name the daily rollup, (3) \`RANGE BETWEEN INTERVAL\` for a calendar-aware moving window that survives gaps. If you can write this in 5 minutes you're in good shape.`,
        },
        {
          kind: "key_insight",
          label: "Checklist for any 'slice production telemetry' prompt",
          insight: `When you get the next ad-hoc analytics question — at an interview, on a customer call, or in #incidents — walk this checklist:

1. **Grain:** *One row per ____.* Say it out loud. (user-day? feature-hour? request?)
2. **Time window:** \`WHERE ts >= now() - interval '...'\` is almost always your first \`WHERE\`. Be specific about UTC vs local.
3. **Joins:** Which tables, in which direction? Any 1-to-many that needs a deduped subquery, \`DISTINCT ON\`, or \`LATERAL\`?
4. **Filters vs FILTER:** Row-level predicates → \`WHERE\`. Conditional aggregates (errors among totals) → \`FILTER (WHERE ...)\`.
5. **Aggregation:** \`GROUP BY\` for collapse; window function for "compute per peer group without collapsing."
6. **Frame:** If using a window, what's the frame? Default \`RANGE\` is rarely what you want — say \`ROWS BETWEEN ...\` or \`RANGE BETWEEN INTERVAL ...\` explicitly.
7. **Format:** Round, name columns, order sensibly. The reader judges the result, not the SQL.

That's the entire job, encoded as seven questions. Internalize them and you'll write production-grade analytics SQL on demand.`,
        },
      ],
    },
  ],
};
