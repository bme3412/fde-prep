import type { StudyGuide } from "../guide-types";

export const pandasPolarsForDataPrepGuide: StudyGuide = {
  topicTitle: "Pandas / Polars for data prep",
  topicSlug: "pandas-polars-for-data-prep",
  sections: [
    // ================================================================
    // 1. Mental model: Series, DataFrame, and the index
    // ================================================================
    {
      title: "Mental model: Series, DataFrame, and the index",
      blocks: [
        {
          kind: "prose",
          markdown: `Pandas and Polars are the two libraries you will reach for when an interviewer or a customer hands you a CSV/Parquet of eval results and says *"tell me which model is winning on \`code_review\`, and why latency on \`summarize\` regressed yesterday."* You can answer questions like that in 30 seconds in a notebook — once you're fluent.

We'll use a single canonical eval-results DataFrame across this guide:

\`\`\`python
import pandas as pd

evals = pd.DataFrame({
    "eval_id":          ["e001", "e002", "e003", "e004", "e005", "e006"],
    "model":            ["opus-4-5", "sonnet-4", "opus-4-5", "sonnet-4", "opus-4-5", "haiku-4"],
    "task":             ["summarize", "summarize", "code_review", "code_review", "summarize", "code_review"],
    "score":            [0.92, 0.88, 0.95, 0.80, 0.91, 0.72],
    "latency_ms":       [820, 410, 1200, 600, 790, 280],
    "prompt_tokens":    [1500, 1500, 3200, 3200, 1500, 3200],
    "completion_tokens":[180, 200, 420, 380, 175, 310],
    "judge":            ["human", "human", "llm-v2", "llm-v2", "human", "llm-v2"],
    "ts":               pd.to_datetime([
                          "2026-05-10", "2026-05-10", "2026-05-11",
                          "2026-05-11", "2026-05-12", "2026-05-12"
                        ]),
})
\`\`\`

**Posture:** This guide is **Pandas-primary, Polars side-by-side.** Pandas is what you'll meet in any existing notebook; Polars is what you switch to when pandas runs out of memory or runs too slowly. Every major operation has a side-by-side comparison.

**Two units to internalize:**

- A **Series** is a 1-D array of values with a labeled index. Think "column with row labels." \`evals["score"]\` is a Series.
- A **DataFrame** is a dict-of-Series sharing one index. The **index** is *not* a regular column — it's metadata that pandas uses for alignment, joins, and selection. This is the single biggest mental-model difference from Polars (which has no row index).`,
        },
        {
          kind: "key_insight",
          label: "The index is alignment",
          insight: `Pandas operations align on the **index** before computing. \`a + b\` on two Series matches values by index label, not by position. This is powerful — but it's also the source of most "why is my column suddenly full of NaN?" bugs. When in doubt: \`.reset_index(drop=True)\` to use a clean integer index, or \`.values\` to drop down to a plain NumPy array.

Polars has **no row index**. Rows are identified by position, joins are explicit. If you've been burned by pandas alignment surprises, that alone is a reason to like Polars.`,
        },
        {
          kind: "code_predict",
          label: "Index alignment surprise",
          code: `import pandas as pd

a = pd.Series([1, 2, 3], index=["x", "y", "z"])
b = pd.Series([10, 20, 30], index=["z", "y", "x"])

print((a + b).to_dict())`,
          output: `{'x': 31, 'y': 22, 'z': 13}`,
          explanation: `Pandas aligned on the index, *not* by position. \`a["x"] + b["x"]\` = 1 + 30 = 31. Coming from NumPy or plain Python, you'd expect [11, 22, 33] — but pandas reordered \`b\` to match \`a\`'s index. This is the #1 thing to internalize about pandas Series arithmetic.`,
          runnable: true,
        },
        {
          kind: "code_comparison",
          label: "Construct a DataFrame: Pandas vs Polars",
          left: {
            title: "Pandas",
            code: `import pandas as pd

df = pd.DataFrame({
    "model": ["opus-4-5", "sonnet-4"],
    "score": [0.92, 0.88],
})
# Has an implicit integer RangeIndex
print(df.index)  # RangeIndex(start=0, stop=2, step=1)`,
            annotation: `RangeIndex appears whether you want it or not. Set a meaningful index with \`.set_index("col")\` when you'll filter/join by that column repeatedly.`,
          },
          right: {
            title: "Polars",
            code: `import polars as pl

df = pl.DataFrame({
    "model": ["opus-4-5", "sonnet-4"],
    "score": [0.92, 0.88],
})
# No index attribute at all — rows are identified by position.
# print(df.index)  # AttributeError`,
            annotation: `Polars dropped the row-index concept entirely. Cleaner mental model; only downside is "label-based" pandas tricks (like \`.loc["opus-4-5"]\`) require explicit filtering.`,
          },
          takeaway: `Pandas has *three* selection paradigms (positional via \`iloc\`, label via \`loc\`, boolean via masks) because of the index. Polars has one (expressions inside \`filter\`/\`select\`). When debugging "why am I getting the wrong rows?" in pandas, almost always the answer is "you mixed up label-based and position-based selection."`,
        },
      ],
    },

    // ================================================================
    // 2. Selection, filtering, and dtypes
    // ================================================================
    {
      title: "Selection, filtering, and dtypes",
      blocks: [
        {
          kind: "prose",
          markdown: `Selecting rows and columns is where 80% of your interactive time goes. The pandas API has more ways to do it than is healthy, so the trick is picking one idiom per use case and sticking to it.

**The three selectors that matter:**

| Selector | Semantics | Use when |
|---|---|---|
| \`df["col"]\` | Single column → Series. \`df[["a","b"]]\` → DataFrame. | Most of the time. |
| \`df.loc[row_labels, col_labels]\` | Label-based row + column selection. | Filtering by boolean mask or labeled index. |
| \`df.iloc[row_pos, col_pos]\` | Position-based (integer) selection. | Grabbing the first N rows, or when index labels are unhelpful. |

**Three filtering patterns to know:**

1. **Boolean mask:** \`df[df["score"] > 0.9]\` — most common, most readable for one or two conditions.
2. **\`.query()\`:** \`df.query("score > 0.9 and model == 'opus-4-5'")\` — readable for many conditions, no \`&\`/\`|\`/\`()\` noise.
3. **\`.isin()\`:** \`df[df["model"].isin(["opus-4-5", "sonnet-4"])]\` — replace chained ORs.

**One thing pandas gets wrong that Polars gets right:** chained assignment. \`df[df.x > 0]["y"] = 1\` *sometimes* writes to the DataFrame, *sometimes* to a copy — depending on internal layout. Always use \`df.loc[df.x > 0, "y"] = 1\` instead. (In pandas 3.x with Copy-on-Write, this trap is finally gone, but defensively prefer \`.loc\`.)`,
        },
        {
          kind: "method_ref",
          title: "Selection & dtype essentials (pandas)",
          importLine: `import pandas as pd`,
          methods: [
            {
              signature: `df["col"] / df[["a", "b"]]`,
              description: `Column access. Single string → Series; list of strings → DataFrame.`,
              returns: `Series | DataFrame`,
            },
            {
              signature: `df.loc[mask, "col"] = value`,
              description: `Label-based **assignment**. Always use this instead of chained \`df[mask]["col"] = ...\`.`,
            },
            {
              signature: `df.iloc[0:5, :3]`,
              description: `Position-based slicing. End is **exclusive** (NumPy semantics), unlike \`.loc\` which is inclusive.`,
              returns: `DataFrame`,
            },
            {
              signature: `df.query("score > 0.9 and model == 'opus-4-5'")`,
              description: `String-expression filter. Cleaner than mask chains for ≥3 conditions. Reference outside variables with \`@\`: \`.query("score > @threshold")\`.`,
              returns: `DataFrame`,
            },
            {
              signature: `df["col"].isin(["a", "b", "c"])`,
              description: `Boolean mask: rows where the column is in the given iterable.`,
              returns: `Series[bool]`,
            },
            {
              signature: `df["col"].astype("category")`,
              description: `Convert to a categorical dtype. Massive memory savings for low-cardinality strings ("model", "task", "judge"). Also unlocks ordered comparisons if you specify a category order.`,
              returns: `Series`,
            },
            {
              signature: `df.dtypes / df.info(memory_usage="deep")`,
              description: `Inspect column types and (deep) memory footprint. Always your first move on an unfamiliar DataFrame.`,
            },
            {
              signature: `pd.to_datetime(s, utc=True)`,
              description: `Parse strings → \`datetime64[ns, UTC]\`. \`utc=True\` is the safe default — naïve timestamps will bite you on the first time-zone-crossing analysis.`,
              returns: `Series[datetime64[ns, UTC]]`,
            },
            {
              signature: `df["col"].isna() / df["col"].fillna(value)`,
              description: `Null detection / replacement. Note: \`==\` against \`NaN\` is always False — \`isna()\` is the only correct check.`,
            },
          ],
        },
        {
          kind: "code_predict",
          label: "Filter to opus-4-5 summarize runs, sort by latency",
          code: `import pandas as pd

evals = pd.DataFrame({
    "model":      ["opus-4-5", "sonnet-4", "opus-4-5", "opus-4-5", "haiku-4"],
    "task":       ["summarize", "summarize", "summarize", "code_review", "summarize"],
    "score":      [0.92, 0.88, 0.91, 0.95, 0.71],
    "latency_ms": [820, 410, 790, 1200, 240],
})

result = (
    evals
    .query("model == 'opus-4-5' and task == 'summarize'")
    .sort_values("latency_ms", ascending=False)
    .reset_index(drop=True)
)

print(result["latency_ms"].tolist())`,
          output: `[820, 790]`,
          explanation: `\`.query()\` filters to rows where \`model='opus-4-5'\` AND \`task='summarize'\` (matches indices 0 and 2). \`.sort_values\` sorts descending. \`.reset_index(drop=True)\` discards the original index (0, 2) and replaces with a fresh RangeIndex — important if you're going to join this result with another DataFrame. The output preserves the row order: latency 820 first, then 790.`,
          runnable: true,
        },
        {
          kind: "scenario_predict",
          label: "Chained assignment hazard",
          scenario: `import pandas as pd

evals = pd.DataFrame({"model": ["opus-4-5", "sonnet-4"], "score": [0.92, 0.88]})

# Attempt to clamp scores below 0.9 to 0.0:
evals[evals["score"] < 0.9]["score"] = 0.0
print(evals["score"].tolist())`,
          language: "python",
          question: `What's the output, and what should you have written?`,
          answer: `Output: \`[0.92, 0.88]\` — the assignment **silently did nothing** (or in pandas ≥ 1.5, prints a \`SettingWithCopyWarning\`). Correct form: \`evals.loc[evals["score"] < 0.9, "score"] = 0.0\`.`,
          explanation: `\`evals[evals["score"] < 0.9]\` returns a *new* DataFrame (possibly a view, possibly a copy — pandas decides based on internal layout). Assigning to a column of that intermediate object writes to the copy, not back to \`evals\`. The fix is the single-step \`.loc\` form, which pandas guarantees writes to the original. Pandas 3.x's Copy-on-Write makes this rule mandatory by making views-vs-copies behavior consistent — but the \`.loc\` habit is forwards-compatible either way.`,
        },
        {
          kind: "warm_up",
          title: "Dtype downcast for memory",
          prompt: `Your \`evals\` DataFrame has 50M rows. \`model\` (text, 5 distinct values) is using ~3 GB of RAM as the default \`object\` dtype. Fill in the blank to cut that to ~50 MB:

\`\`\`python
evals["model"] = evals["model"].astype(______)
\`\`\``,
          answer: `\`"category"\` — \`evals["model"] = evals["model"].astype("category")\`.`,
          explanation: `Pandas \`object\` columns store each string as a separate Python heap object — ~40 bytes per row plus the string bytes. A \`category\` dtype stores each unique string *once* and replaces values with a small integer code. For low-cardinality columns (model, task, judge, status) this is a 50–100× memory savings — often the difference between "fits in RAM" and "MemoryError." Caveat: comparison ordering follows declaration order unless you pass \`CategoricalDtype(categories=[...], ordered=True)\`.`,
        },
      ],
    },

    // ================================================================
    // 3. groupby, agg, transform, pivot
    // ================================================================
    {
      title: "groupby, agg, transform, pivot",
      blocks: [
        {
          kind: "prose",
          markdown: `\`groupby\` is the workhorse of eval analysis: per-model scores, per-task latency, per-day token usage. There are three modes you should be able to reach for without thinking:

| Operation | Output shape | Use when |
|---|---|---|
| \`groupby(...).agg(...)\` | **One row per group.** Collapses. | "Mean score per model." |
| \`groupby(...).transform(...)\` | **Same shape as input.** Broadcasts group value back to each row. | "Add a column with each row's z-score vs its model." |
| \`groupby(...).filter(...)\` | Subset of original rows (whole groups kept or dropped). | "Only keep models with ≥10 evals." |

**The named-aggregation idiom** is the cleanest \`agg\` form for analytics:

\`\`\`python
evals.groupby("model").agg(
    n=("eval_id", "count"),
    mean_score=("score", "mean"),
    p95_latency_ms=("latency_ms", lambda s: s.quantile(0.95)),
    total_tokens=("prompt_tokens", "sum"),
)
\`\`\`

It produces a flat (one-row-per-group) DataFrame with the column names you actually want, instead of pandas' default \`MultiIndex\` columns. Internalize this form — it's the answer to ~half of "summarize per X" prompts.

**Pivot vs pivot_table:**

- \`df.pivot(index, columns, values)\` — pure reshape (no aggregation). Errors on duplicates.
- \`df.pivot_table(index, columns, values, aggfunc)\` — reshape **with** aggregation. The "Excel pivot table" thing.

If you forget which is which, just always reach for \`pivot_table\`. It does both and won't throw on duplicates.`,
        },
        {
          kind: "method_ref",
          title: "Groupby & aggregation reference",
          importLine: `import pandas as pd`,
          methods: [
            {
              signature: `df.groupby("model")["score"].mean()`,
              description: `Single-column aggregate. Returns a Series indexed by group.`,
              returns: `Series`,
            },
            {
              signature: `df.groupby(["model", "task"]).agg(...)`,
              description: `Multi-key grouping → \`MultiIndex\` result. Add \`.reset_index()\` to flatten back to a regular DataFrame.`,
              returns: `DataFrame (MultiIndex)`,
            },
            {
              signature: `df.groupby("model").agg(n=("eval_id", "count"), p95=("latency_ms", lambda s: s.quantile(0.95)))`,
              description: `**Named aggregation** — preferred for analytics. Output columns are exactly the names you supply.`,
              returns: `DataFrame`,
            },
            {
              signature: `df.groupby("model")["score"].transform("mean")`,
              description: `Broadcasts the group mean back to each row. Use to add a "vs group baseline" column without a self-join.`,
              returns: `Series (same length as df)`,
            },
            {
              signature: `df.groupby("model").filter(lambda g: len(g) >= 10)`,
              description: `Drops entire groups failing the predicate. Output rows are a subset of input rows.`,
              returns: `DataFrame`,
            },
            {
              signature: `df.pivot_table(index="model", columns="task", values="score", aggfunc="mean")`,
              description: `Cross-tab of mean score by (model × task). Pure pivot uses \`pivot\` (no agg).`,
              returns: `DataFrame`,
            },
            {
              signature: `df.groupby("model")["latency_ms"].quantile([0.5, 0.95, 0.99]).unstack()`,
              description: `Compute multiple percentiles per group in one call, then \`unstack\` to turn the inner percentile-index into columns.`,
              returns: `DataFrame`,
            },
            {
              signature: `df.groupby(pd.Grouper(key="ts", freq="D"))`,
              description: `Time-based grouping for time-series resampling. \`freq="H"\`, \`"D"\`, \`"W"\` etc. Equivalent to \`df.set_index("ts").resample("D")\`.`,
            },
          ],
        },
        {
          kind: "code_predict",
          label: "Named aggregation: mean score + p95 latency per model",
          code: `import pandas as pd

evals = pd.DataFrame({
    "model":      ["opus-4-5", "sonnet-4", "opus-4-5", "sonnet-4", "opus-4-5", "haiku-4"],
    "score":      [0.92, 0.88, 0.95, 0.80, 0.91, 0.72],
    "latency_ms": [820, 410, 1200, 600, 790, 280],
})

summary = (
    evals.groupby("model")
    .agg(n=("model", "count"),
         mean_score=("score", "mean"),
         p95_latency_ms=("latency_ms", lambda s: s.quantile(0.95)))
    .round(3)
    .sort_values("mean_score", ascending=False)
)

print(summary.reset_index().to_dict(orient="records"))`,
          output: `[{'model': 'opus-4-5', 'n': 3, 'mean_score': 0.927, 'p95_latency_ms': 1162.0}, {'model': 'sonnet-4', 'n': 2, 'mean_score': 0.84, 'p95_latency_ms': 590.0}, {'model': 'haiku-4', 'n': 1, 'mean_score': 0.72, 'p95_latency_ms': 280.0}]`,
          explanation: `Named aggregation produces a flat DataFrame with our column names (\`n\`, \`mean_score\`, \`p95_latency_ms\`). \`.round(3)\` rounds for readability. \`.sort_values\` orders models by mean score. The p95 of 3 values is interpolated (pandas default is linear interpolation), which is why opus-4-5's p95 is 1162 rather than 1200 exactly. This is the canonical "summarize evals per model" query.`,
          runnable: true,
        },
        {
          kind: "code_comparison",
          label: "Per-model z-score: transform vs merge",
          left: {
            title: "Verbose: groupby + merge",
            code: `means = evals.groupby("model")["score"].mean().rename("mean_score")
stds  = evals.groupby("model")["score"].std().rename("std_score")

out = (
    evals
    .merge(means, on="model")
    .merge(stds,  on="model")
)
out["z"] = (out["score"] - out["mean_score"]) / out["std_score"]`,
            annotation: `Two groupbys, two merges, two extra columns to clean up afterwards.`,
          },
          right: {
            title: "Idiomatic: groupby + transform",
            code: `g = evals.groupby("model")["score"]
evals["z"] = (evals["score"] - g.transform("mean")) / g.transform("std")`,
            annotation: `One pass. \`transform\` broadcasts the per-group statistic back to each row — same length as the original column. No merge, no extra columns.`,
          },
          takeaway: `Reach for \`groupby(...).transform(...)\` whenever you want to add a column "relative to its group's statistic." It's the pandas equivalent of a SQL window function with \`PARTITION BY\` and no \`ORDER BY\`.`,
        },
        {
          kind: "mini_challenge",
          title: "Pivot: per-model × per-task mean score",
          prompt: `Given the canonical \`evals\` DataFrame, produce a table with **models as rows**, **tasks as columns**, and **mean score** as values. Missing combinations should be NaN (not 0 — they're different signals).

Bonus: append a column \`overall\` that's the row-wise mean across tasks, ignoring NaNs.`,
          hints: [
            `Use \`pivot_table\` (not \`pivot\` — there can be duplicates).`,
            `\`aggfunc="mean"\` is the default but write it explicitly so readers don't have to look it up.`,
            `For the bonus, add a column with \`.assign(overall=lambda df: df.mean(axis=1))\`. \`axis=1\` means "across columns," and pandas \`.mean\` skips NaN by default.`,
          ],
          solution: `import pandas as pd

# Assume evals is the canonical DataFrame.
pivot = (
    evals
    .pivot_table(index="model", columns="task", values="score", aggfunc="mean")
    .assign(overall=lambda df: df.mean(axis=1))
    .round(3)
)
print(pivot)`,
          takeaway: `\`pivot_table\` + \`.assign(... = lambda df: ...)\` is the pandas method-chaining sweet spot: every line is a transformation of \`df\` so far. This style is much easier to debug than \`df.x = ...; df.y = ...; df.z = ...\` — you can comment out one link and see what the rest produces.`,
        },
        {
          kind: "multiple_choice",
          title: "groupby + apply: when to avoid",
          prompt: `You write \`evals.groupby("model").apply(lambda g: g.assign(rank=g["score"].rank()))\` and find it's 50× slower than expected on 10M rows. What's the most likely fix?`,
          choices: [
            {
              text: `Switch to \`groupby(...).transform("rank")\`.`,
              correct: true,
              rationale: `\`apply\` runs your Python lambda once per group — slow because each call crosses the Python ↔ NumPy boundary. \`transform("rank")\` (or vectorized aggregations) stay in C and are typically 10–100× faster.`,
            },
            {
              text: `Add \`include_groups=False\` to the \`apply\` call.`,
              correct: false,
              rationale: `That's a useful pandas 2.2+ deprecation hint, but it's not the performance issue — it suppresses a warning, not slowness.`,
            },
            {
              text: `Set \`sort=False\` on \`groupby\`.`,
              correct: false,
              rationale: `Skipping the sort saves a small amount of time, not 50×. Worth doing on huge dataframes, but not the main lever here.`,
            },
            {
              text: `Wrap the apply in \`numba\`.`,
              correct: false,
              rationale: `Possible, but premature. Pandas already has a vectorized \`rank\` — use it before reaching for JIT compilation.`,
            },
          ],
          explanation: `**Rule of thumb:** \`groupby(...).apply(lambda)\` is your last resort. Try in order: (1) built-in aggregations (\`"mean"\`, \`"sum"\`, \`"quantile"\`, \`"rank"\`, ...); (2) \`agg\`/\`transform\` with named aggregations; (3) hand-vectorized operations; (4) \`apply\` only when you genuinely need per-group Python logic. On a 10M-row DataFrame the difference between (1) and (4) is often **two orders of magnitude**.`,
        },
      ],
    },

    // ================================================================
    // 4. Joins, concat, and reshaping
    // ================================================================
    {
      title: "Joins, concat, and reshaping",
      blocks: [
        {
          kind: "prose",
          markdown: `Once your DataFrames are clean, half of analysis is **joining them**. Pandas exposes three operations that are easy to confuse:

| Operation | What it does | Match on |
|---|---|---|
| \`pd.merge(left, right, ...)\` | SQL-style join. | Columns (or indices via \`left_on\` / \`right_index\`). |
| \`df.join(other)\` | Convenience wrapper for index-on-index joins. | Index. |
| \`pd.concat([df1, df2])\` | Stack vertically (\`axis=0\`) or horizontally (\`axis=1\`). No join logic. | Position (or index alignment when \`axis=1\`). |

The first one — \`pd.merge\` — covers 95% of cases. The other two exist for narrower reasons (\`join\` for chaining onto an indexed DataFrame; \`concat\` for "I just want to glue these together").

**Merge knobs you must know:**

- \`how="inner" | "left" | "right" | "outer"\` — the join type.
- \`on=["col1", "col2"]\` — single-side column join keys.
- \`left_on=..., right_on=...\` — join keys with different names per side.
- \`indicator=True\` — adds a \`_merge\` column showing whether each row came from \`"left_only"\`, \`"right_only"\`, or \`"both"\`. **Indispensable** for debugging "why is this join losing rows?"
- \`validate="1:1" | "1:m" | "m:1" | "m:m"\` — declares the expected join cardinality and raises if violated. Use this aggressively — it turns silent join-explosion bugs into loud errors.

**Reshaping:**

- \`df.melt(id_vars=..., value_vars=...)\` — wide → long.
- \`df.pivot(...) / df.pivot_table(...)\` — long → wide (we covered this in section 3).
- \`df.stack() / df.unstack()\` — move between row index and column index on a \`MultiIndex\`. Used less often in eval analysis.`,
        },
        {
          kind: "code_predict",
          label: "Merge with validate and indicator",
          code: `import pandas as pd

evals = pd.DataFrame({
    "model": ["opus-4-5", "sonnet-4", "haiku-4"],
    "score": [0.92, 0.88, 0.72],
})
pricing = pd.DataFrame({
    "model": ["opus-4-5", "sonnet-4"],   # haiku-4 missing!
    "input_per_mtok_usd": [15.0, 3.0],
})

joined = evals.merge(pricing, on="model", how="left", indicator=True)
print(joined[["model", "_merge"]].to_dict(orient="records"))`,
          output: `[{'model': 'opus-4-5', '_merge': 'both'}, {'model': 'sonnet-4', '_merge': 'both'}, {'model': 'haiku-4', '_merge': 'left_only'}]`,
          explanation: `\`how="left"\` keeps every row of \`evals\` and fills NaN where there's no pricing row. \`indicator=True\` adds a special \`_merge\` Categorical column showing the source. The \`left_only\` row immediately flags the missing pricing entry for haiku-4 — vastly easier than spotting NaNs in a numeric column. Pairing this with \`validate="m:1"\` would *also* assert that each model has at most one pricing row.`,
          runnable: true,
        },
        {
          kind: "scenario_predict",
          label: "validate catches the bug",
          scenario: `import pandas as pd

evals = pd.DataFrame({"model": ["opus-4-5"], "score": [0.92]})
# Bug: two pricing rows for the same model (effective-dated, but no date filter applied)
pricing = pd.DataFrame({
    "model": ["opus-4-5", "opus-4-5"],
    "input_per_mtok_usd": [15.0, 12.5],
})

result = evals.merge(pricing, on="model", how="left", validate="m:1")
print(len(result))`,
          language: "python",
          question: `What happens when this code runs?`,
          answer: `It raises \`pandas.errors.MergeError: Merge keys are not unique in right dataset; not a many-to-one merge\`. The merge never completes.`,
          explanation: `\`validate="m:1"\` asserts that the right side has at most one row per join key. With two pricing rows for \`opus-4-5\`, the assertion fails *before* the merge silently doubles every evals row. Without \`validate\`, you'd silently get 2 result rows (one per pricing entry) and your downstream cost numbers would be 2× too high. **Adopt this habit:** every \`merge\` gets a \`validate="..."\` declaring your expected cardinality. It's a one-keyword bug shield.`,
        },
        {
          kind: "code_comparison",
          label: "Wide → long for plotting: pandas vs polars",
          left: {
            title: "Pandas: melt",
            code: `import pandas as pd

wide = pd.DataFrame({
    "model": ["opus-4-5", "sonnet-4"],
    "summarize": [0.92, 0.88],
    "code_review": [0.95, 0.80],
})

long = wide.melt(
    id_vars="model",
    value_vars=["summarize", "code_review"],
    var_name="task",
    value_name="score",
)
# 4 rows: (opus-4-5, summarize, 0.92), (opus-4-5, code_review, 0.95), ...`,
            annotation: `\`id_vars\` stays as-is, \`value_vars\` get stacked.`,
          },
          right: {
            title: "Polars: unpivot (renamed from melt in 1.0)",
            code: `import polars as pl

wide = pl.DataFrame({
    "model": ["opus-4-5", "sonnet-4"],
    "summarize": [0.92, 0.88],
    "code_review": [0.95, 0.80],
})

long = wide.unpivot(
    index="model",
    on=["summarize", "code_review"],
    variable_name="task",
    value_name="score",
)`,
            annotation: `Same semantics, slightly cleaner argument names. Polars \`>= 1.0\` renamed \`melt\` → \`unpivot\` to match Excel terminology.`,
          },
          takeaway: `**Wide → long** is the standard preprocessing step before plotting (seaborn/altair both prefer long form) and before \`pivot_table\` (round-trip wide ↔ long is how you re-aggregate). If you can't remember which API is which: melt/unpivot **lengthens**, pivot **widens**.`,
        },
        {
          kind: "flashcard",
          context: `You have a list of N small DataFrames and want to stack them into one.`,
          front: `Why is \`pd.concat(list_of_dfs, ignore_index=True)\` strongly preferred over \`reduce(lambda a, b: pd.concat([a, b]), dfs)\` or \`df = df.append(other)\` in a loop?`,
          back: `Both alternatives are **quadratic** in the number of frames: each step allocates a new DataFrame holding all the data so far. \`pd.concat(list, ...)\` allocates the output once and copies each input block into the correct slot — **linear** in total rows.

Pandas removed \`DataFrame.append\` in 2.0 specifically because it encouraged the loop anti-pattern. Habit: build a list of DataFrames in a loop, then \`pd.concat\` once at the end.`,
        },
      ],
    },

    // ================================================================
    // 5. Polars: expressions, lazy frames, when to switch
    // ================================================================
    {
      title: "Polars: expressions, lazy frames, when to switch",
      blocks: [
        {
          kind: "prose",
          markdown: `Polars is the modern columnar DataFrame library — Rust-backed, written for multi-core, with a query optimizer. Three things make it fundamentally different from pandas:

1. **Expressions, not chained methods.** \`pl.col("score").mean()\` is a *description* of work, not the work itself. You compose expressions inside \`select\` / \`filter\` / \`group_by\`, and Polars runs them in parallel.
2. **Lazy mode.** \`pl.scan_parquet("evals.parquet")\` returns a \`LazyFrame\` — nothing happens until you call \`.collect()\`. Between scan and collect, Polars' optimizer can push predicates down to the file reader, drop unused columns before reading them, and reorder joins.
3. **No row index.** Joins are explicit. Selection is positional or boolean. The pandas alignment-by-index "surprises" simply don't exist.

**When to actually switch:**

| You have... | Stay with pandas | Switch to Polars |
|---|---|---|
| < 1M rows, ad-hoc exploration | ✓ | |
| Existing notebook full of pandas | ✓ | |
| 10–500M rows, eager exploration | | ✓ (10–50× faster, lower memory) |
| Larger-than-memory Parquet/CSV scanned with filters | | ✓ (lazy mode + predicate pushdown is killer) |
| Heavy reliance on \`.loc[]\` magic, Excel-style index slicing | ✓ | |
| You want SQL-like fluency in Python | | ✓ |

The good news: **Polars converts to/from pandas in one call.** Use Polars to do the heavy data prep, then \`.to_pandas()\` to hand off to scikit-learn / statsmodels / matplotlib if needed.`,
        },
        {
          kind: "method_ref",
          title: "Polars expressions quick reference",
          importLine: `import polars as pl`,
          methods: [
            {
              signature: `pl.col("score")`,
              description: `Reference a column inside an expression. The fundamental Polars primitive.`,
              returns: `Expr`,
            },
            {
              signature: `df.select([pl.col("model"), pl.col("score").mean().alias("avg")])`,
              description: `Project columns and computed expressions. Replaces pandas' \`df[["a", "b"]]\` + \`.assign(...)\` chain.`,
              returns: `DataFrame`,
            },
            {
              signature: `df.filter(pl.col("score") > 0.9)`,
              description: `Row filter. Replaces pandas' \`df[df["score"] > 0.9]\`.`,
              returns: `DataFrame`,
            },
            {
              signature: `df.group_by("model").agg(pl.col("score").mean(), pl.col("latency_ms").quantile(0.95).alias("p95"))`,
              description: `Group + aggregate. Multiple aggregates run in parallel. \`group_by\` (underscore) not \`groupby\`.`,
              returns: `DataFrame`,
            },
            {
              signature: `pl.col("score").over("model")`,
              description: `**Window function** — equivalent to pandas \`groupby(...).transform(...)\`. Broadcasts per-group result back to each row without collapsing.`,
              returns: `Expr`,
            },
            {
              signature: `df.join(other, on="model", how="left")`,
              description: `SQL-style join. \`how\` can be \`"inner" | "left" | "outer" | "semi" | "anti" | "cross"\`. Polars exposes semi/anti joins natively — pandas requires manual workarounds.`,
              returns: `DataFrame`,
            },
            {
              signature: `pl.scan_parquet("path/*.parquet").filter(...).select(...).collect()`,
              description: `**Lazy pipeline.** \`scan_*\` builds a query plan; predicates and projections push down to the file reader. \`collect()\` triggers execution.`,
              returns: `LazyFrame → DataFrame`,
            },
            {
              signature: `pl_df.to_pandas() / pl.from_pandas(pd_df)`,
              description: `Cheap conversion between Polars and pandas (Arrow-backed). Use to interop with the existing pandas ecosystem.`,
              returns: `pd.DataFrame / pl.DataFrame`,
            },
          ],
        },
        {
          kind: "code_comparison",
          label: "Eager pandas vs lazy Polars on a multi-file parquet",
          left: {
            title: "Pandas (eager — reads everything)",
            code: `import pandas as pd
import glob

# Reads ALL columns of ALL files, then filters in memory.
dfs = [pd.read_parquet(f) for f in glob.glob("evals/*.parquet")]
df = pd.concat(dfs, ignore_index=True)

summary = (
    df[(df["task"] == "summarize") & (df["score"] >= 0.9)]
    .groupby("model")["latency_ms"]
    .quantile(0.95)
)`,
            annotation: `Memory = sum of file sizes. Time = O(total_bytes). Works until your data doesn't fit in RAM.`,
          },
          right: {
            title: "Polars (lazy — pushes filters to the scanner)",
            code: `import polars as pl

summary = (
    pl.scan_parquet("evals/*.parquet")
      .filter((pl.col("task") == "summarize") & (pl.col("score") >= 0.9))
      .group_by("model")
      .agg(pl.col("latency_ms").quantile(0.95).alias("p95"))
      .collect()
)`,
            annotation: `Polars' optimizer pushes the \`task == 'summarize'\` predicate down to the Parquet reader, which **skips entire row groups** whose metadata indicates no matching values. Reads less data, uses less memory, runs faster — often 10–50×.`,
          },
          takeaway: `Lazy mode with predicate pushdown is the headline reason to reach for Polars. The bigger your data and the more selective your filter, the bigger the win. For sub-million-row CSVs the gap is small; for 100M-row Parquet warehouses it's transformative.`,
        },
        {
          kind: "scenario_predict",
          label: "Polars: when expressions surprise you",
          scenario: `import polars as pl

df = pl.DataFrame({
    "model": ["opus-4-5", "sonnet-4", "opus-4-5", "haiku-4"],
    "score": [0.92, 0.88, 0.95, 0.72],
})

# Goal: rows where score is above the OVERALL mean.
result = df.filter(pl.col("score") > pl.col("score").mean())
print(result["model"].to_list())`,
          language: "python",
          question: `What's the output, and why is this different from pandas?`,
          answer: `\`['opus-4-5', 'opus-4-5']\` — the two rows with score above the overall mean (0.8675).`,
          explanation: `In Polars, \`pl.col("score").mean()\` inside \`filter\` is a **scalar expression that evaluates over the whole frame** — there's no row context. It computes once, gets broadcast, then compared row-wise. In pandas, the closest equivalent is \`df[df["score"] > df["score"].mean()]\` — same result, but you wrote \`df["score"].mean()\` twice. Polars' expression API makes "compute X over the table, compare each row to X" a one-liner. For *per-group* comparison, you'd write \`pl.col("score") > pl.col("score").mean().over("model")\`.`,
        },
        {
          kind: "multiple_choice",
          title: "Decision: stay or switch?",
          prompt: `A colleague hands you a 200M-row Parquet dataset of inference telemetry. You need to answer a handful of ad-hoc questions ("per-feature p95 latency last 24h", "top 10 users by tokens this week") and produce two matplotlib charts at the end. What's the right tool?`,
          choices: [
            {
              text: `Pandas eagerly: \`pd.read_parquet\` the whole thing, then group/agg.`,
              correct: false,
              rationale: `Reading 200M rows eagerly likely OOMs your laptop and is slow even on a workstation. You also read columns and rows you'll throw away.`,
            },
            {
              text: `Polars lazy: \`scan_parquet\` + filter/agg, then \`.to_pandas()\` only for the final small DataFrame you'll plot.`,
              correct: true,
              rationale: `Lazy scan with predicate pushdown reads only the row groups and columns you need. Group/agg in Polars (parallelized). The result is a small summary frame — converting *that* to pandas for matplotlib is cheap.`,
            },
            {
              text: `Read into DuckDB and write SQL.`,
              correct: false,
              rationale: `Defensible answer, especially if you're more fluent in SQL — and the sibling 'DuckDB & lightweight ETL' topic covers this. But the question is about pandas/Polars, and the Polars lazy answer is roughly equivalent in performance with less context-switching from Python.`,
            },
            {
              text: `Sample 1% of rows in pandas first, then maybe scale up.`,
              correct: false,
              rationale: `Reasonable for exploratory shape-checking but doesn't actually answer the questions — p95 latency from a 1% sample is noisy, and "top 10 users" from a sample is wrong.`,
            },
          ],
          explanation: `The pattern for the next decade of data work: **lazy columnar engine for the heavy lifting, hand off a small DataFrame for plotting/modeling.** Polars, DuckDB, and Spark all support this same shape. Pandas remains best for fluent in-memory work on smaller frames and for interop with scikit-learn / statsmodels.`,
        },
        {
          kind: "key_insight",
          label: "The pandas → Polars translation cheat sheet",
          insight: `When you sit down with a pandas notebook and want to port the heavy parts to Polars, these are the operations you'll translate over and over:

| Pandas | Polars |
|---|---|
| \`df[df["score"] > 0.9]\` | \`df.filter(pl.col("score") > 0.9)\` |
| \`df["score"].mean()\` | \`df["score"].mean()\` (same) or \`df.select(pl.col("score").mean())\` |
| \`df.groupby("model")["score"].mean()\` | \`df.group_by("model").agg(pl.col("score").mean())\` |
| \`df.groupby("m")["s"].transform("mean")\` | \`pl.col("s").mean().over("m")\` |
| \`df.merge(o, on="k", how="left")\` | \`df.join(o, on="k", how="left")\` |
| \`pd.read_parquet(p)\` | \`pl.read_parquet(p)\` (eager) or \`pl.scan_parquet(p)\` (lazy) |
| \`df.assign(x=lambda d: d["a"] + d["b"])\` | \`df.with_columns((pl.col("a") + pl.col("b")).alias("x"))\` |

If you can do these eight operations in both libraries from memory, you're 90% of the way to fluency in either one.`,
        },
      ],
    },
  ],
};
