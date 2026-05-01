import { getState } from "@/lib/store";

export default function PracticePage() {
  const state = getState();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Practice Reps</h1>
      <p className="text-sm text-zinc-500">
        {state.practiceReps.length} reps &middot;{" "}
        {state.practiceReps.filter((r) => r.completedAt).length} completed
      </p>
      {state.practiceReps.map((rep) => (
        <div key={rep.id} className="bg-white border border-zinc-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">{rep.title}</h2>
            <span className="text-xs text-zinc-400">{rep.durationMinutes} min</span>
          </div>
          <p className="text-sm text-zinc-500">
            {rep.completedAt
              ? `Completed ${new Date(rep.completedAt).toLocaleDateString()}`
              : "Not yet attempted"}
          </p>
          <p className="text-xs text-zinc-400 mt-2">
            TODO: Expandable prompt markdown, start/complete buttons, retro notes form.
          </p>
        </div>
      ))}
    </div>
  );
}
