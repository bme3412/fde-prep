import { getState } from "@/lib/store";
import {
  CATEGORIES,
  CATEGORY_GROUPS,
  CATEGORY_LABELS,
  STATUS_LABELS,
  type Category,
  type Status,
} from "@/lib/types";
import Link from "next/link";

function statusColor(status: Status): string {
  switch (status) {
    case "not_started":
      return "bg-zinc-100 text-zinc-600";
    case "in_progress":
      return "bg-amber-100 text-amber-800";
    case "done":
      return "bg-green-100 text-green-800";
  }
}

export default async function TopicsPage(props: {
  searchParams: Promise<{ status?: string }>;
}) {
  const searchParams = await props.searchParams;
  const state = await getState();
  const filterStatus = searchParams.status as Status | undefined;

  const filtered = filterStatus
    ? state.topics.filter((t) => t.status === filterStatus)
    : state.topics;

  const grouped = CATEGORIES.reduce(
    (acc, cat) => {
      const topics = filtered.filter((t) => t.category === cat);
      if (topics.length > 0) acc[cat] = topics;
      return acc;
    },
    {} as Record<Category, typeof filtered>,
  );

  return (
    <div className="space-y-8">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold">Applied AI Prep</h1>
      </div>

      {/* ── Status filter ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          href="/topics"
          className={`px-3 py-1 rounded ${!filterStatus ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}
        >
          All
        </Link>
        {(["not_started", "in_progress", "done"] as const).map((s) => (
          <Link
            key={s}
            href={`/topics?status=${s}`}
            className={`px-3 py-1 rounded ${filterStatus === s ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}
          >
            {STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      {/* ── Category-group jump nav ────────────────────────────────────── */}
      <nav className="bg-white border border-zinc-200 rounded-xl p-4 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Jump to
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
          {CATEGORY_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="text-xs font-semibold text-zinc-700 mb-1">
                {group.label}
              </div>
              <ul className="space-y-0.5">
                {group.categories.map((cat) => {
                  const count = grouped[cat]?.length ?? 0;
                  return (
                    <li key={cat}>
                      <a
                        href={`#cat-${cat}`}
                        className={`text-xs hover:text-zinc-900 transition-colors ${
                          count === 0
                            ? "text-zinc-300 pointer-events-none"
                            : "text-zinc-500"
                        }`}
                      >
                        {CATEGORY_LABELS[cat]}{" "}
                        <span className="text-zinc-400">({count})</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      {Object.entries(grouped).length === 0 && (
        <p className="text-sm text-zinc-500">No topics match this filter.</p>
      )}

      {/* ── Sections by category (grouped) ─────────────────────────────── */}
      {CATEGORY_GROUPS.map((group) => {
        const groupCats = group.categories.filter((c) => grouped[c]);
        if (groupCats.length === 0) return null;

        return (
          <div key={group.label} className="space-y-6">
            <h2 className="text-base font-semibold uppercase tracking-wide text-zinc-400 border-b border-zinc-200 pb-1">
              {group.label}
            </h2>

            {groupCats.map((cat) => {
              const topics = grouped[cat]!;
              const catDone = topics.filter((t) => t.status === "done").length;
              return (
                <section
                  key={cat}
                  id={`cat-${cat}`}
                  className="scroll-mt-4 space-y-2"
                >
                  <h3 className="text-base font-semibold text-zinc-700 flex items-baseline gap-2">
                    {CATEGORY_LABELS[cat]}
                    <span className="text-xs font-normal text-zinc-400">
                      {catDone}/{topics.length} done
                    </span>
                  </h3>
                  <div className="bg-white border border-zinc-200 rounded-lg divide-y divide-zinc-100">
                    {topics.map((topic) => (
                      <div
                        key={topic.id}
                        className="flex items-center justify-between px-4 py-3"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">
                            {topic.title}
                          </div>
                          <div className="text-xs text-zinc-400 mt-0.5">
                            ~{topic.estimatedMinutes} min
                            {topic.secondsStudied > 0 && (
                              <span className="ml-2 text-zinc-500">
                                &middot; {Math.floor(topic.secondsStudied / 60)}m studied
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span
                            className={`text-xs px-2 py-0.5 rounded ${statusColor(topic.status)}`}
                          >
                            {STATUS_LABELS[topic.status]}
                          </span>
                          <Link
                            href={`/topics/${topic.id}`}
                            className="text-sm text-zinc-600 hover:text-zinc-900 underline"
                          >
                            Open
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
