import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { v4 as uuid } from "uuid";
import { mutateState } from "@/lib/store";
import { RecordStudyTimeInput } from "@/lib/types";

/** YYYY-MM-DD in UTC. Daily logs use UTC dates for determinism across timezones. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * POST /api/study-time
 *
 * Body: { topicId: string, seconds: number (1..120), date?: "YYYY-MM-DD" }
 *
 * Atomically:
 *  - increments `topic.secondsStudied` and stamps `lastStudiedAt`
 *  - auto-promotes `not_started` → `in_progress` (never overrides `done`)
 *  - upserts today's daily log, adding the *whole-minute delta* to
 *    `minutesStudied` (so sub-minute increments are buffered on the topic
 *    record and not lost) and ensuring the topic is in `topicsTouched`.
 *
 * Designed to work with both `fetch()` (periodic flush) and
 * `navigator.sendBeacon()` (page unload). sendBeacon posts as a Blob with
 * Content-Type: text/plain, so we read text and JSON.parse manually.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    const text = await req.text();
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = RecordStudyTimeInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { topicId, seconds, date } = parsed.data;
  const day = date ?? todayUtc();

  let topicFound = false;
  let minuteDelta = 0;

  mutateState((state) => {
    const topics = state.topics.map((t) => {
      if (t.id !== topicId) return t;
      topicFound = true;
      const prevSeconds = t.secondsStudied;
      const nextSeconds = prevSeconds + seconds;
      minuteDelta = Math.floor(nextSeconds / 60) - Math.floor(prevSeconds / 60);
      const nextStatus = t.status === "not_started" ? "in_progress" : t.status;
      return {
        ...t,
        status: nextStatus,
        secondsStudied: nextSeconds,
        lastStudiedAt: new Date().toISOString(),
      };
    });

    if (!topicFound) return state;

    // Upsert today's daily log.
    const existingIdx = state.dailyLogs.findIndex((l) => l.date === day);
    let dailyLogs = state.dailyLogs;
    if (existingIdx >= 0) {
      const existing = dailyLogs[existingIdx];
      const updated = {
        ...existing,
        minutesStudied: existing.minutesStudied + minuteDelta,
        topicsTouched: existing.topicsTouched.includes(topicId)
          ? existing.topicsTouched
          : [...existing.topicsTouched, topicId],
      };
      dailyLogs = dailyLogs.map((l, i) => (i === existingIdx ? updated : l));
    } else {
      dailyLogs = [
        ...dailyLogs,
        {
          id: uuid(),
          date: day,
          minutesStudied: minuteDelta,
          topicsTouched: [topicId],
          reflection: "",
        },
      ];
    }

    return { ...state, topics, dailyLogs };
  });

  if (!topicFound) {
    return NextResponse.json({ error: "topic_not_found" }, { status: 404 });
  }

  // Revalidate so server components re-render with new totals on next nav.
  revalidatePath("/topics");
  revalidatePath(`/topics/${topicId}`);
  revalidatePath(`/topics/${topicId}/guide`);
  revalidatePath("/log");

  return NextResponse.json({ ok: true });
}
