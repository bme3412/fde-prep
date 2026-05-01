import { getState } from "@/lib/store";
import { CATEGORIES, CATEGORY_LABELS, STATUS_LABELS, type Category, type Status } from "@/lib/types";
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
  const state = getState();
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Topics</h1>
        <div className="flex gap-2 text-sm">
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
      </div>

      {Object.entries(grouped).length === 0 && (
        <p className="text-sm text-zinc-500">No topics match this filter.</p>
      )}

      {CATEGORIES.map((cat) => {
        const topics = grouped[cat];
        if (!topics) return null;
        return (
          <section key={cat}>
            <h2 className="text-base font-semibold text-zinc-700 mb-2">
              {CATEGORY_LABELS[cat]}
              <span className="ml-2 text-xs font-normal text-zinc-400">{topics.length} topics</span>
            </h2>
            <div className="bg-white border border-zinc-200 rounded-lg divide-y divide-zinc-100">
              {topics.map((topic) => (
                <div
                  key={topic.id}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{topic.title}</div>
                    <div className="text-xs text-zinc-400 mt-0.5">
                      ~{topic.estimatedMinutes} min
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${statusColor(topic.status)}`}>
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
}
