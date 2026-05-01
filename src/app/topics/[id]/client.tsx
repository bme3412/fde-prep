"use client";

import { useRef } from "react";
import Markdown from "react-markdown";

export function TopicDescription({ markdown }: { markdown: string }) {
  return <Markdown>{markdown}</Markdown>;
}

export function TopicNotesForm({
  topicId,
  initialNotes,
  action,
}: {
  topicId: string;
  initialNotes: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action}>
      <input type="hidden" name="id" value={topicId} />
      <textarea
        name="notes"
        rows={6}
        defaultValue={initialNotes}
        onBlur={() => formRef.current?.requestSubmit()}
        className="border border-zinc-300 rounded px-3 py-2 text-sm w-full font-mono"
        placeholder="Your notes here (markdown supported, saves on blur)..."
      />
    </form>
  );
}
