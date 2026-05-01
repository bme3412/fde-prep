import { getState } from "@/lib/store";
import { updateTopicStatus, updateTopicNotes } from "@/lib/actions";
import { getGuideForTopic } from "@/lib/guides";
import { CATEGORY_LABELS, STATUS_LABELS, STATUSES } from "@/lib/types";
import { notFound } from "next/navigation";
import Link from "next/link";
import { TopicDescription, TopicNotesForm } from "./client";

export default async function TopicDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const state = getState();
  const topic = state.topics.find((t) => t.id === id);
  if (!topic) return notFound();

  const hasGuide = getGuideForTopic(topic.title) !== null;

  return (
    <div className="max-w-3xl mx-auto px-1 sm:px-0">
      {/* Back link */}
      <Link
        href="/topics"
        className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-600 transition-colors mb-6"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
          <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        All Topics
      </Link>

      {/* Header card */}
      <div className="bg-white border border-zinc-200 rounded-xl p-5 sm:p-6 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <span className="inline-block text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1.5">
              {CATEGORY_LABELS[topic.category]}
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 leading-tight">
              {topic.title}
            </h1>
            <p className="text-sm text-zinc-500 mt-1.5">~{topic.estimatedMinutes} min estimated</p>
          </div>

          {/* Status form — stacks on mobile, inline on desktop */}
          <form action={updateTopicStatus} className="flex items-center gap-2 shrink-0">
            <input type="hidden" name="id" value={topic.id} />
            <select
              name="status"
              id="status"
              defaultValue={topic.status}
              className="border border-zinc-200 rounded-lg px-3 py-2 text-sm bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-300 min-w-[130px]"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors active:scale-95"
            >
              Save
            </button>
          </form>
        </div>

        {topic.completedAt && (
          <p className="text-xs text-zinc-400 mt-3 pt-3 border-t border-zinc-100">
            Completed {new Date(topic.completedAt).toLocaleDateString()}
          </p>
        )}
      </div>

      {/* Study guide CTA */}
      {hasGuide && (
        <Link
          href={`/topics/${topic.id}/guide`}
          className="flex items-center justify-between bg-amber-50 border border-amber-200 text-amber-900 px-5 py-3.5 rounded-xl text-sm font-medium hover:bg-amber-100 transition-colors mb-4 active:scale-[0.99]"
        >
          <span>Open Interactive Study Guide</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
            <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Link>
      )}

      {/* Description */}
      <div className="bg-white border border-zinc-200 rounded-xl p-5 sm:p-6 mb-4">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">
          What to learn
        </h2>
        <div className="prose prose-sm prose-zinc max-w-none text-zinc-700 leading-relaxed">
          <TopicDescription markdown={topic.description} />
        </div>
      </div>

      {/* Resources */}
      <div className="bg-white border border-zinc-200 rounded-xl p-5 sm:p-6 mb-4">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">
          Resources
        </h2>
        <ul className="space-y-2">
          {topic.resources.map((r, i) => (
            <li key={i}>
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between text-sm text-blue-600 hover:text-blue-800 transition-colors bg-blue-50/50 hover:bg-blue-50 rounded-lg px-4 py-2.5 border border-blue-100"
              >
                <span>{r.label}</span>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0 ml-2">
                  <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </a>
            </li>
          ))}
        </ul>
      </div>

      {/* Notes */}
      <div className="bg-white border border-zinc-200 rounded-xl p-5 sm:p-6">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">
          Your Notes
        </h2>
        <TopicNotesForm topicId={topic.id} initialNotes={topic.notes} action={updateTopicNotes} />
      </div>
    </div>
  );
}
