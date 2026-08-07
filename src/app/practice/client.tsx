"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentPropsWithoutRef,
} from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useRouter } from "next/navigation";
import type { PracticeRep } from "@/lib/types";
import { completePracticeRep } from "@/lib/actions";
import { CodeBlock } from "@/app/topics/[id]/guide/CodeBlock";

const SESSION_PREFIX = "fde-prep:practice-session:v1:";

type SessionState = {
  startedAt: number; // epoch ms
  durationMinutes: number;
};

function readSession(id: string): SessionState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_PREFIX + id);
    if (!raw) return null;
    return JSON.parse(raw) as SessionState;
  } catch {
    return null;
  }
}

function writeSession(id: string, session: SessionState) {
  sessionStorage.setItem(SESSION_PREFIX + id, JSON.stringify(session));
}

function clearSession(id: string) {
  sessionStorage.removeItem(SESSION_PREFIX + id);
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

const markdownComponents: Components = {
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children, ...props }: ComponentPropsWithoutRef<"code">) => {
    const text = String(children).replace(/\n$/, "");
    const match = /language-(\w+)/.exec(className || "");
    const isBlock = match !== null || text.includes("\n");
    if (isBlock) {
      return (
        <CodeBlock
          code={text}
          language={match ? match[1] : "text"}
          className="rounded-lg my-3"
        />
      );
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
};

function StatusBadge({
  completed,
  inProgress,
}: {
  completed: boolean;
  inProgress: boolean;
}) {
  if (completed) {
    return (
      <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
        Completed
      </span>
    );
  }
  if (inProgress) {
    return (
      <span className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
        In progress
      </span>
    );
  }
  return (
    <span className="text-xs font-medium text-zinc-500 bg-zinc-50 border border-zinc-200 px-2 py-0.5 rounded-md">
      Not started
    </span>
  );
}

function PracticeRepCard({
  rep,
  defaultExpanded,
}: {
  rep: PracticeRep;
  defaultExpanded: boolean;
}) {
  const router = useRouter();
  const completed = Boolean(rep.completedAt);
  const [expanded, setExpanded] = useState(defaultExpanded && !completed);
  const [session, setSession] = useState<SessionState | null>(() =>
    completed ? null : readSession(rep.id),
  );
  const [now, setNow] = useState(() => Date.now());
  const [retroNotes, setRetroNotes] = useState(rep.retroNotes || "");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!session || completed) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [session, completed]);

  const elapsedSeconds = session
    ? Math.floor((now - session.startedAt) / 1000)
    : 0;
  const remainingSeconds = session
    ? session.durationMinutes * 60 - elapsedSeconds
    : null;
  const overtime = remainingSeconds !== null && remainingSeconds < 0;

  const start = useCallback(() => {
    const next: SessionState = {
      startedAt: Date.now(),
      durationMinutes: rep.durationMinutes,
    };
    writeSession(rep.id, next);
    setSession(next);
    setNow(Date.now());
    setExpanded(true);
  }, [rep.id, rep.durationMinutes]);

  async function onComplete(formData: FormData) {
    setPending(true);
    try {
      await completePracticeRep(formData);
      clearSession(rep.id);
      setSession(null);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full text-left px-5 py-4 flex items-start justify-between gap-3 hover:bg-zinc-50/80 transition-colors"
      >
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-zinc-900">{rep.title}</h2>
            <StatusBadge completed={completed} inProgress={Boolean(session)} />
          </div>
          <p className="text-xs text-zinc-400">
            {rep.durationMinutes} min
            {completed && rep.completedAt && (
              <>
                {" "}
                · Completed {new Date(rep.completedAt).toLocaleDateString()}
              </>
            )}
            {session && !completed && remainingSeconds !== null && (
              <>
                {" "}
                ·{" "}
                <span className={overtime ? "text-red-600 font-medium" : "text-zinc-600"}>
                  {overtime
                    ? `+${formatClock(-remainingSeconds)} over`
                    : `${formatClock(remainingSeconds)} left`}
                </span>
                <span className="text-zinc-400">
                  {" "}
                  (elapsed {formatClock(elapsedSeconds)})
                </span>
              </>
            )}
          </p>
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          className={`shrink-0 mt-1 text-zinc-400 transition-transform ${expanded ? "rotate-90" : ""}`}
          aria-hidden
        >
          <path
            d="M6 4L10 8L6 12"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-zinc-100 px-5 py-5 space-y-5">
          <div className="prose prose-sm prose-zinc max-w-none text-zinc-700">
            <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {rep.promptMarkdown}
            </Markdown>
          </div>

          {!completed && (
            <div className="flex flex-wrap items-center gap-3">
              {!session ? (
                <button
                  type="button"
                  onClick={start}
                  className="bg-zinc-800 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors"
                >
                  Start ({rep.durationMinutes} min)
                </button>
              ) : (
                <div className="text-sm text-zinc-600 bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-2.5 font-mono">
                  {overtime ? (
                    <span className="text-red-700">
                      Overtime {formatClock(-remainingSeconds!)}
                    </span>
                  ) : (
                    <span>{formatClock(remainingSeconds!)} remaining</span>
                  )}
                  <span className="text-zinc-400"> · elapsed {formatClock(elapsedSeconds)}</span>
                </div>
              )}
            </div>
          )}

          {completed ? (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Retro notes
              </h3>
              {rep.retroNotes ? (
                <p className="text-sm text-zinc-700 whitespace-pre-wrap bg-zinc-50 border border-zinc-100 rounded-lg p-4">
                  {rep.retroNotes}
                </p>
              ) : (
                <p className="text-sm text-zinc-400 italic">No retro notes saved.</p>
              )}
            </div>
          ) : (
            <form action={onComplete} className="space-y-3 border-t border-zinc-100 pt-5">
              <input type="hidden" name="id" value={rep.id} />
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Retro notes
                </span>
                <textarea
                  name="retroNotes"
                  value={retroNotes}
                  onChange={(e) => setRetroNotes(e.target.value)}
                  rows={4}
                  placeholder="What went well? What would you redo? Gaps to study?"
                  className="border border-zinc-200 rounded-lg px-3 py-2.5 text-sm w-full bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-300"
                />
              </label>
              <button
                type="submit"
                disabled={pending}
                className="bg-zinc-800 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors disabled:opacity-60"
              >
                {pending ? "Saving…" : "Mark complete"}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export function PracticeClient({ reps }: { reps: PracticeRep[] }) {
  const nextUpId = useMemo(
    () => reps.find((r) => !r.completedAt)?.id ?? null,
    [reps],
  );
  const nextUp = reps.find((r) => r.id === nextUpId);

  return (
    <div className="space-y-4">
      {nextUp && (
        <p className="text-sm text-zinc-600">
          Next up:{" "}
          <span className="font-medium text-zinc-900">{nextUp.title}</span>
        </p>
      )}
      {reps.map((rep) => (
        <PracticeRepCard
          key={rep.id}
          rep={rep}
          defaultExpanded={rep.id === nextUpId}
        />
      ))}
    </div>
  );
}
