import { getState } from "@/lib/store";
import { PracticeClient } from "./client";

export const dynamic = "force-dynamic";

export default async function PracticePage() {
  const state = await getState();
  const completed = state.practiceReps.filter((r) => r.completedAt).length;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Practice Reps</h1>
        <p className="text-sm text-zinc-500 mt-1.5">
          {state.practiceReps.length} reps &middot; {completed} completed
        </p>
        <p className="text-sm text-zinc-500 mt-2 leading-relaxed">
          Timed cold builds. Start the clock, work from the prompt, then capture a short retro.
        </p>
      </div>
      <PracticeClient reps={state.practiceReps} />
    </div>
  );
}
