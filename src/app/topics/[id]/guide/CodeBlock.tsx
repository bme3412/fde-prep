"use client";

import { Highlight, type PrismTheme } from "prism-react-renderer";

/*
 * Custom slate theme tuned for the #1e293b background used throughout the
 * guide UI. Token colors picked for high contrast on dark slate while staying
 * close to the VS Code Dark+ palette people recognize.
 */
export const slateTheme: PrismTheme = {
  plain: {
    color: "#e2e8f0", // slate-200 — base text
    backgroundColor: "#1e293b", // slate-800
  },
  styles: [
    // Comments — muted blue-grey
    {
      types: ["comment", "prolog", "doctype", "cdata"],
      style: { color: "#64748b", fontStyle: "italic" }, // slate-500
    },
    // Strings — soft amber/peach
    {
      types: ["string", "char", "attr-value", "url"],
      style: { color: "#fbbf24" }, // amber-400
    },
    // Keywords / control flow — pink/rose
    {
      types: ["keyword", "selector", "important", "atrule", "rule"],
      style: { color: "#f472b6" }, // pink-400
    },
    // Function names — sky blue
    {
      types: ["function", "function-variable"],
      style: { color: "#7dd3fc" }, // sky-300
    },
    // Class names / types — teal
    {
      types: ["class-name", "maybe-class-name", "builtin", "constant"],
      style: { color: "#5eead4" }, // teal-300
    },
    // Numbers / booleans — orange
    {
      types: ["number", "boolean"],
      style: { color: "#fb923c" }, // orange-400
    },
    // Operators / punctuation — light slate
    {
      types: ["operator", "punctuation"],
      style: { color: "#cbd5e1" }, // slate-300
    },
    // Variables / parameters — light sky
    {
      types: ["variable", "parameter"],
      style: { color: "#e2e8f0" }, // slate-200
    },
    // Property / attribute names — light blue
    {
      types: ["property", "attr-name", "tag"],
      style: { color: "#93c5fd" }, // blue-300
    },
    // Decorators / annotations
    {
      types: ["decorator", "annotation"],
      style: { color: "#c4b5fd" }, // violet-300
    },
    // Regex / special
    {
      types: ["regex", "important"],
      style: { color: "#fda4af" }, // rose-300
    },
    // Inserted (diff)
    {
      types: ["inserted"],
      style: { color: "#86efac" }, // green-300
    },
    // Deleted (diff)
    {
      types: ["deleted"],
      style: { color: "#fca5a5" }, // red-300
    },
  ],
};

/**
 * Map our friendly language hints to Prism language identifiers.
 * Anything unknown falls back to plain text (no highlighting, just colors plain).
 */
export function normalizeLang(lang: string | undefined): string {
  if (!lang) return "text";
  const l = lang.toLowerCase();
  if (l === "py" || l === "python") return "python";
  if (l === "sh" || l === "bash" || l === "shell" || l === "zsh") return "bash";
  if (l === "js" || l === "javascript") return "javascript";
  if (l === "ts" || l === "typescript") return "typescript";
  if (l === "json") return "json";
  if (l === "yaml" || l === "yml") return "yaml";
  if (l === "html") return "markup";
  if (l === "css") return "css";
  if (l === "diff") return "diff";
  return "text";
}

interface CodeBlockProps {
  /** The code to highlight. */
  code: string;
  /** Language hint: "python" | "bash" | "json" | "text" | etc. */
  language?: string;
  /** Optional extra Tailwind classes for the outer <pre>. */
  className?: string;
}

/**
 * A drop-in replacement for the raw <pre>{code}</pre> blocks used throughout
 * the guide UI. Renders with syntax highlighting on a #1e293b slate background,
 * using a custom theme that matches the existing dark-slate aesthetic.
 */
export function CodeBlock({
  code,
  language,
  className = "",
}: CodeBlockProps) {
  const lang = normalizeLang(language);

  // Strip a single trailing newline so we don't render an extra blank line.
  const trimmed = code.endsWith("\n") ? code.slice(0, -1) : code;

  return (
    <Highlight theme={slateTheme} code={trimmed} language={lang}>
      {({ className: prismClassName, style, tokens, getLineProps, getTokenProps }) => (
        <pre
          className={`${prismClassName} px-4 sm:px-5 py-4 text-sm sm:text-[15px] leading-relaxed font-mono overflow-x-auto whitespace-pre ${className}`}
          style={style}
        >
          {tokens.map((line, i) => {
            const lineProps = getLineProps({ line });
            return (
              <div key={i} {...lineProps}>
                {line.map((token, key) => {
                  const tokenProps = getTokenProps({ token });
                  return <span key={key} {...tokenProps} />;
                })}
              </div>
            );
          })}
        </pre>
      )}
    </Highlight>
  );
}
