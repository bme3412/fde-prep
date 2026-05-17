"use client";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function ReflectionMarkdown({ markdown }: { markdown: string }) {
  return (
    <div className="prose prose-sm prose-zinc max-w-none text-sm text-zinc-700">
      <Markdown remarkPlugins={[remarkGfm]}>{markdown}</Markdown>
    </div>
  );
}
