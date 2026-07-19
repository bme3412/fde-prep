import type { Category } from "./types";

/**
 * Primer content for the "Foundations" group on the Topics page.
 *
 * Mirrors the Agentic Engineering page style: a group-level intro, then a
 * tagline + plain-language primer (and an optional highlighted note) per
 * category. Topic-level explanations are pulled from each topic's own
 * `description`, so they live in one place (seed.ts).
 */

export const FOUNDATIONS_INTRO =
  "The groundwork every later track assumes. Nothing here is about AI — it's the Python, concurrency, tooling, and data fluency that make everything downstream fast instead of frustrating. If a later stage feels slow, the gap is usually here. Work these until the mechanics are automatic.";

export type CategoryPrimer = {
  tagline: string;
  primer: string;
  note?: string;
};

export const FOUNDATIONS_CATEGORY_PRIMERS: Partial<
  Record<Category, CategoryPrimer>
> = {
  python_fluency: {
    tagline:
      "The language everything else is written in — fluency here removes friction everywhere else.",
    primer:
      "Before APIs, agents, or evals, you need Python that flows without stopping to look things up. These are the everyday idioms — the data structures, typing, and testing habits — that turn “I could figure it out” into “I just wrote it.” Weakness here shows up as slowness in every later stage.",
  },
  concurrency: {
    tagline:
      "LLM work is mostly waiting on the network — concurrency is how you stop waiting serially.",
    primer:
      "Calling a model is I/O-bound: you spend almost all your time waiting for a response. Knowing when to reach for asyncio, threads, or processes — and getting rate limits right — is the difference between a batch job that finishes in minutes and one that drags for hours or gets you throttled.",
    note: "Rule of thumb: asyncio for many network calls, threads for blocking libraries you can't make async, and processes for CPU-bound work. The GIL is why that last case needs processes, not threads.",
  },
  developer_tools: {
    tagline:
      "Git and the shell are the tools you use in front of the customer — you can't fumble them.",
    primer:
      "In a live session you'll navigate a repo, wrangle files, and untangle a messy history on someone else's screen. None of it is glamorous, but hesitation here is visible and erodes trust. Build the muscle memory so the tooling disappears and you can stay focused on the actual problem.",
  },
  data_engineering: {
    tagline:
      "Most real work touches the customer's data before it touches their model.",
    primer:
      "Before there's an LLM feature, there's a warehouse, a pile of CSVs, or a stream of telemetry. Being able to slice that data yourself — in SQL, pandas, or DuckDB — means you can scope the problem and analyze your own eval results without waiting on a data team.",
  },
};

/** Strip markdown backticks so seed descriptions read cleanly as plain glosses. */
export function plainGloss(description: string): string {
  return description.replace(/`/g, "");
}
