"use server";

import { revalidatePath } from "next/cache";
import { mutateState, getState } from "./store";
import {
  UpdateTopicStatusInput,
  UpdateTopicNotesInput,
  LogDailyInput,
  CompletePracticeRepInput,
  StartPracticeRepInput,
} from "./types";
import { v4 as uuid } from "uuid";

export async function updateTopicStatus(formData: FormData) {
  const parsed = UpdateTopicStatusInput.parse({
    id: formData.get("id"),
    status: formData.get("status"),
  });

  await mutateState((state) => ({
    ...state,
    topics: state.topics.map((t) =>
      t.id === parsed.id
        ? {
            ...t,
            status: parsed.status,
            completedAt: parsed.status === "done" ? new Date().toISOString() : t.completedAt,
          }
        : t,
    ),
  }));

  revalidatePath("/");
  revalidatePath("/topics");
  revalidatePath(`/topics/${parsed.id}`);
}

export async function updateTopicNotes(formData: FormData) {
  const parsed = UpdateTopicNotesInput.parse({
    id: formData.get("id") as string,
    notes: formData.get("notes") as string,
  });

  await mutateState((state) => ({
    ...state,
    topics: state.topics.map((t) =>
      t.id === parsed.id ? { ...t, notes: parsed.notes } : t,
    ),
  }));

  revalidatePath(`/topics/${parsed.id}`);
}

export async function logDaily(formData: FormData) {
  const topicsTouched = formData.getAll("topicsTouched").map(String);
  const parsed = LogDailyInput.parse({
    date: formData.get("date") as string,
    minutesStudied: Number(formData.get("minutesStudied")),
    topicsTouched,
    reflection: (formData.get("reflection") as string) || "",
  });

  await mutateState((state) => {
    const existing = state.dailyLogs.findIndex((l) => l.date === parsed.date);
    const entry = { id: existing >= 0 ? state.dailyLogs[existing].id : uuid(), ...parsed };
    const dailyLogs =
      existing >= 0
        ? state.dailyLogs.map((l, i) => (i === existing ? entry : l))
        : [...state.dailyLogs, entry];
    return { ...state, dailyLogs };
  });

  revalidatePath("/");
  revalidatePath("/log");
}

export async function startPracticeRep(formData: FormData) {
  const parsed = StartPracticeRepInput.parse({
    id: formData.get("id") as string,
  });

  // We don't track start time in the model — the UI can use local state.
  // This is a no-op server action placeholder for future use.
  void parsed;
}

export async function completePracticeRep(formData: FormData) {
  const parsed = CompletePracticeRepInput.parse({
    id: formData.get("id") as string,
    retroNotes: (formData.get("retroNotes") as string) || "",
  });

  await mutateState((state) => ({
    ...state,
    practiceReps: state.practiceReps.map((r) =>
      r.id === parsed.id
        ? { ...r, completedAt: new Date().toISOString(), retroNotes: parsed.retroNotes }
        : r,
    ),
  }));

  revalidatePath("/practice");
}

/** Helper to get current state — thin wrapper for use in server components */
export async function fetchState() {
  return await getState();
}
