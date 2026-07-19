"use client";

import { useTransition } from "react";
import { setAgenticStatus } from "@/lib/actions";
import { STATUS_LABELS, type Status } from "@/lib/types";

const NEXT_STATUS: Record<Status, Status> = {
  not_started: "in_progress",
  in_progress: "done",
  done: "not_started",
};

function statusColor(status: Status): string {
  switch (status) {
    case "not_started":
      return "bg-zinc-100 text-zinc-600 hover:bg-zinc-200";
    case "in_progress":
      return "bg-amber-100 text-amber-800 hover:bg-amber-200";
    case "done":
      return "bg-green-100 text-green-800 hover:bg-green-200";
  }
}

/**
 * A clickable status pill that cycles not_started → in_progress → done and
 * persists the change via the setAgenticStatus server action. Mirrors the
 * Topics status system, adapted for inline toggling (no detail page).
 */
export function AgenticStatusButton({
  id,
  status,
}: {
  id: string;
  status: Status;
}) {
  const [pending, startTransition] = useTransition();

  function cycle() {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("status", NEXT_STATUS[status]);
    startTransition(() => {
      void setAgenticStatus(fd);
    });
  }

  return (
    <button
      type="button"
      onClick={cycle}
      disabled={pending}
      aria-label={`Status: ${STATUS_LABELS[status]}. Click to change.`}
      title="Click to change status"
      className={`text-xs px-2 py-0.5 rounded whitespace-nowrap transition-colors disabled:opacity-50 ${statusColor(status)}`}
    >
      {STATUS_LABELS[status]}
    </button>
  );
}
