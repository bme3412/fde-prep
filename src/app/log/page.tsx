import Link from "next/link";
import { getState } from "@/lib/store";
import type { DailyLog, Topic } from "@/lib/types";
import { ReflectionMarkdown } from "./client";

type SearchParams = Promise<{ month?: string | string[] }>;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseMonth(input: string | string[] | undefined): { year: number; month: number } {
  const raw = Array.isArray(input) ? input[0] : input;
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split("-").map(Number);
    if (m >= 1 && m <= 12) return { year: y, month: m };
  }
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

function formatMonthParam(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

function buildCalendarCells(year: number, month: number): (string | null)[] {
  // month is 1-12. Returns array of YYYY-MM-DD strings or null for blank cells,
  // padded so the first cell aligns with Sunday and length is a multiple of 7.
  const firstDayWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = Array(firstDayWeekday).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function intensityClass(minutes: number): string {
  if (minutes === 0) return "bg-white";
  if (minutes < 15) return "bg-emerald-50";
  if (minutes < 45) return "bg-emerald-100";
  if (minutes < 90) return "bg-emerald-200";
  return "bg-emerald-300";
}

export default async function LogPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const state = getState();

  const { year, month } = parseMonth(params.month);
  const monthParam = formatMonthParam(year, month);
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);

  // Topic ID -> title lookup
  const topicTitleById = new Map<string, string>(
    state.topics.map((t: Topic) => [t.id, t.title]),
  );

  // Date -> log lookup
  const logByDate = new Map<string, DailyLog>(
    state.dailyLogs.map((l: DailyLog) => [l.date, l]),
  );

  const cells = buildCalendarCells(year, month);
  const monthPrefix = monthParam;
  const monthLogs = [...state.dailyLogs]
    .filter((l) => l.date.startsWith(monthPrefix))
    .sort((a, b) => b.date.localeCompare(a.date));
  const monthTotalMinutes = monthLogs.reduce((sum, l) => sum + l.minutesStudied, 0);

  const allLogs = [...state.dailyLogs].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Daily Log</h1>

      {/* Calendar */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">
              {MONTH_NAMES[month - 1]} {year}
            </h2>
            <span className="text-xs text-zinc-500">
              {monthTotalMinutes} min · {monthLogs.length} day{monthLogs.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Link
              href={`/log?month=${formatMonthParam(prev.year, prev.month)}`}
              className="px-2 py-1 border border-zinc-300 rounded hover:bg-zinc-50"
            >
              ← Prev
            </Link>
            <Link
              href="/log"
              className="px-2 py-1 border border-zinc-300 rounded hover:bg-zinc-50"
            >
              Today
            </Link>
            <Link
              href={`/log?month=${formatMonthParam(next.year, next.month)}`}
              className="px-2 py-1 border border-zinc-300 rounded hover:bg-zinc-50"
            >
              Next →
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs text-zinc-500">
          {DAY_LABELS.map((d) => (
            <div key={d} className="py-1 font-medium">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((date, i) => {
            if (date === null) {
              return <div key={`empty-${i}`} className="aspect-square" />;
            }
            const log = logByDate.get(date);
            const day = Number(date.slice(-2));
            const minutes = log?.minutesStudied ?? 0;
            return (
              <div
                key={date}
                className={`aspect-square border border-zinc-200 rounded p-1 flex flex-col justify-between text-xs ${intensityClass(minutes)}`}
                title={
                  log
                    ? `${date}: ${minutes} min, ${log.topicsTouched.length} topics`
                    : date
                }
              >
                <span className="text-zinc-500">{day}</span>
                {log && (
                  <span className="text-right font-medium text-zinc-700">
                    {minutes}m
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Log entries */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Entries</h2>
        {allLogs.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No log entries yet. Use the dashboard to log your study time.
          </p>
        ) : (
          <div className="space-y-3">
            {allLogs.map((log) => (
              <div key={log.id} className="bg-white border border-zinc-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm">{log.date}</span>
                  <span className="text-xs text-zinc-400">{log.minutesStudied} min</span>
                </div>
                {log.topicsTouched.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {log.topicsTouched.map((topicId) => {
                      const title = topicTitleById.get(topicId);
                      return (
                        <Link
                          key={topicId}
                          href={`/topics/${topicId}`}
                          className="text-xs px-2 py-0.5 bg-zinc-100 text-zinc-700 rounded hover:bg-zinc-200"
                          title={topicId}
                        >
                          {title ?? topicId}
                        </Link>
                      );
                    })}
                  </div>
                )}
                {log.reflection && (
                  <div className="mt-2 border-t border-zinc-100 pt-2">
                    <ReflectionMarkdown markdown={log.reflection} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
