import { getState } from "@/lib/store";

export default function LogPage() {
  const state = getState();
  const logs = [...state.dailyLogs].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Daily Log</h1>
      {logs.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No log entries yet. Use the dashboard to log your study time.
        </p>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => (
            <div key={log.id} className="bg-white border border-zinc-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-sm">{log.date}</span>
                <span className="text-xs text-zinc-400">{log.minutesStudied} min</span>
              </div>
              <p className="text-xs text-zinc-500">
                {log.topicsTouched.length} topics touched
              </p>
              {log.reflection && (
                <p className="text-sm text-zinc-600 mt-2">{log.reflection}</p>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-zinc-400">
        TODO: Calendar view, topic name resolution, markdown rendering for reflections.
      </p>
    </div>
  );
}
