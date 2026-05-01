import { getState } from "@/lib/store";
import { logDaily } from "@/lib/actions";
import { CATEGORY_LABELS, STATUS_LABELS } from "@/lib/types";
import type { Topic } from "@/lib/types";
import Link from "next/link";

function computeStreak(dates: string[]): number {
  if (dates.length === 0) return 0;
  const sorted = [...dates].sort().reverse();
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // Streak must include today or yesterday to be active
  if (sorted[0] !== today && sorted[0] !== yesterday) return 0;

  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    const curr = new Date(sorted[i]);
    const diff = (prev.getTime() - curr.getTime()) / 86400000;
    if (diff === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-4">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-zinc-500">{label}</div>
    </div>
  );
}

function TopicRow({ topic }: { topic: Topic }) {
  return (
    <Link
      href={`/topics/${topic.id}`}
      className="flex items-center justify-between py-2 px-3 rounded hover:bg-zinc-100 transition-colors"
    >
      <div>
        <span className="font-medium">{topic.title}</span>
        <span className="ml-2 text-xs text-zinc-400">{CATEGORY_LABELS[topic.category]}</span>
      </div>
      <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">
        {STATUS_LABELS[topic.status]}
      </span>
    </Link>
  );
}

export default function Dashboard() {
  const state = getState();

  const totalMinutes = state.dailyLogs.reduce((sum, l) => sum + l.minutesStudied, 0);
  const topicsDone = state.topics.filter((t) => t.status === "done").length;
  const topicsTotal = state.topics.length;
  const streak = computeStreak(state.dailyLogs.map((l) => l.date));
  const inProgress = state.topics.filter((t) => t.status === "in_progress");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Minutes Studied" value={totalMinutes} />
        <StatCard label="Topics Done" value={`${topicsDone} / ${topicsTotal}`} />
        <StatCard label="Day Streak" value={streak} />
        <StatCard label="Practice Reps Done" value={state.practiceReps.filter((r) => r.completedAt).length} />
      </div>

      {/* In Progress */}
      <section>
        <h2 className="text-lg font-semibold mb-2">In Progress</h2>
        {inProgress.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No topics in progress.{" "}
            <Link href="/topics" className="underline">
              Pick one to start.
            </Link>
          </p>
        ) : (
          <div className="bg-white border border-zinc-200 rounded-lg divide-y divide-zinc-100">
            {inProgress.map((topic) => (
              <TopicRow key={topic.id} topic={topic} />
            ))}
          </div>
        )}
      </section>

      {/* Today panel */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Log Today</h2>
        <form action={logDaily} className="bg-white border border-zinc-200 rounded-lg p-4 space-y-4">
          <input type="hidden" name="date" value={today} />
          <div>
            <label htmlFor="minutesStudied" className="block text-sm font-medium mb-1">
              Minutes studied
            </label>
            <input
              type="number"
              name="minutesStudied"
              id="minutesStudied"
              min={0}
              defaultValue={0}
              className="border border-zinc-300 rounded px-3 py-1.5 text-sm w-32"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Topics touched</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-48 overflow-y-auto">
              {state.topics.map((topic) => (
                <label key={topic.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="topicsTouched" value={topic.id} />
                  {topic.title}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="reflection" className="block text-sm font-medium mb-1">
              Reflection
            </label>
            <textarea
              name="reflection"
              id="reflection"
              rows={3}
              className="border border-zinc-300 rounded px-3 py-1.5 text-sm w-full"
              placeholder="What did you learn today?"
            />
          </div>
          <button
            type="submit"
            className="bg-zinc-900 text-white px-4 py-2 rounded text-sm hover:bg-zinc-700 transition-colors"
          >
            Save Log
          </button>
        </form>
      </section>
    </div>
  );
}
