"use client";

import { useMemo } from "react";
import Editor from "react-simple-code-editor";
import { Highlight } from "prism-react-renderer";
import { slateTheme, normalizeLang } from "./CodeBlock";

interface CodeEditorProps {
  /** Current code value. */
  value: string;
  /** Called on every keystroke with the new code. */
  onChange: (next: string) => void;
  /** Language hint passed to Prism (python, bash, json, ...). */
  language?: string;
  /** Placeholder when value is empty. */
  placeholder?: string;
  /** Minimum number of visible lines (sets initial height). */
  minLines?: number;
  /** Optional extra Tailwind classes for the outer wrapper. */
  className?: string;
  /** Disable editing (for read-only views). */
  readOnly?: boolean;
  /** ARIA label for the editor textarea. */
  ariaLabel?: string;
  /** Render a line-number gutter on the left edge. */
  showLineNumbers?: boolean;
}

/* ── Python-aware editor conventions ──────────────────────────────────────
 *
 * react-simple-code-editor handles tab/shift-tab/auto-pair/indent-preservation
 * out of the box. For Python we layer extra behavior on top via a capture-
 * phase keydown listener, so we can intercept Enter/Tab/Cmd+/ before rsce's
 * own handlers run.
 *
 *   • Enter: if the previous line ends in `:` add one extra indent level;
 *           if the previous line is a terminal statement (return/pass/break/
 *           continue/raise) dedent one level.
 *   • Tab:  insert 4 spaces (PEP-8) instead of rsce's default 2.
 *   • Cmd+/: toggle `# ` comments on the current line or selection block.
 *
 * Cursor position is restored after React commits the new value via rAF.
 */

const PY_INDENT = "    "; // 4 spaces, PEP-8

function isPyDedentLine(trimmed: string): boolean {
  return /^(return\b|pass\b|break\b|continue\b|raise\b)/.test(trimmed);
}

function setCursor(ta: HTMLTextAreaElement, start: number, end = start) {
  // requestAnimationFrame ensures React has committed the new value to the DOM.
  requestAnimationFrame(() => {
    ta.selectionStart = start;
    ta.selectionEnd = end;
  });
}

export function CodeEditor({
  value,
  onChange,
  language = "python",
  placeholder,
  minLines = 4,
  className = "",
  readOnly = false,
  ariaLabel = "Editable code",
  showLineNumbers = false,
}: CodeEditorProps) {
  const lang = normalizeLang(language);

  function highlight(code: string) {
    // We render the same per-line/per-token structure as <CodeBlock> so the
    // colors stay consistent. react-simple-code-editor overlays a transparent
    // textarea on top of this content, so font metrics must match exactly.
    return (
      <Highlight theme={slateTheme} code={code} language={lang}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <>
            {tokens.map((line, i) => {
              const lineProps = getLineProps({ line });
              return (
                <div key={i} {...lineProps}>
                  {line.length === 0 ? (
                    // Preserve empty lines so the textarea overlay aligns.
                    <span>{"\n"}</span>
                  ) : (
                    line.map((token, key) => {
                      const tokenProps = getTokenProps({ token });
                      return <span key={key} {...tokenProps} />;
                    })
                  )}
                </div>
              );
            })}
          </>
        )}
      </Highlight>
    );
  }

  // ── Python-aware key handling ─────────────────────────────────────────
  function onKeyDownCapture(e: React.KeyboardEvent<HTMLDivElement>) {
    if (readOnly || lang !== "python") return;
    const target = e.target as HTMLElement;
    if (target.tagName !== "TEXTAREA") return;
    const ta = target as HTMLTextAreaElement;

    // Cmd/Ctrl + / → toggle comment on current line(s).
    if ((e.metaKey || e.ctrlKey) && e.key === "/") {
      e.preventDefault();
      e.stopPropagation();
      toggleComment(ta);
      return;
    }

    // Plain Enter (no modifiers): Python-aware indent.
    if (
      e.key === "Enter" &&
      !e.shiftKey &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey
    ) {
      if (ta.selectionStart !== ta.selectionEnd) return; // selection: defer to rsce
      const { value: v, selectionStart } = ta;
      const lineStart = v.lastIndexOf("\n", selectionStart - 1) + 1;
      const currentLine = v.slice(lineStart, selectionStart);
      const trimmed = currentLine.trim();
      const indent = (currentLine.match(/^[ \t]*/) || [""])[0];

      // Strip a trailing inline comment before checking for `:` so that
      //   `if x:  # branch` still triggers extra indent.
      const codePart = currentLine.replace(/#.*$/, "").trimEnd();
      const endsWithColon = codePart.endsWith(":");

      let newIndent = indent;
      if (endsWithColon) {
        newIndent = indent + PY_INDENT;
      } else if (isPyDedentLine(trimmed) && indent.length >= PY_INDENT.length) {
        newIndent = indent.slice(0, -PY_INDENT.length);
      }

      e.preventDefault();
      e.stopPropagation();
      const insert = "\n" + newIndent;
      const next =
        v.slice(0, selectionStart) + insert + v.slice(ta.selectionEnd);
      onChange(next);
      setCursor(ta, selectionStart + insert.length);
      return;
    }

    // Plain Tab with no selection: 4 spaces. (Selections fall through to
    // rsce's block-indent which works correctly.)
    if (e.key === "Tab" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      if (ta.selectionStart !== ta.selectionEnd) return;
      e.preventDefault();
      e.stopPropagation();
      const { value: v, selectionStart } = ta;
      const next =
        v.slice(0, selectionStart) + PY_INDENT + v.slice(selectionStart);
      onChange(next);
      setCursor(ta, selectionStart + PY_INDENT.length);
      return;
    }
  }

  function toggleComment(ta: HTMLTextAreaElement) {
    const { value: v, selectionStart, selectionEnd } = ta;
    const blockStart = v.lastIndexOf("\n", selectionStart - 1) + 1;
    const nlAfter = v.indexOf("\n", selectionEnd);
    const blockEnd = nlAfter === -1 ? v.length : nlAfter;

    const block = v.slice(blockStart, blockEnd);
    const lines = block.split("\n");
    const nonEmpty = lines.filter((l) => l.trim().length > 0);
    const allCommented =
      nonEmpty.length > 0 && nonEmpty.every((l) => /^\s*#/.test(l));

    let newLines: string[];
    if (allCommented) {
      newLines = lines.map((l) => l.replace(/^(\s*)# ?/, "$1"));
    } else {
      const minIndent = nonEmpty.length
        ? Math.min(
            ...nonEmpty.map((l) => (l.match(/^[ \t]*/) || [""])[0].length),
          )
        : 0;
      newLines = lines.map((l) => {
        if (l.trim().length === 0) return l;
        return l.slice(0, minIndent) + "# " + l.slice(minIndent);
      });
    }

    const newBlock = newLines.join("\n");
    const next = v.slice(0, blockStart) + newBlock + v.slice(blockEnd);
    onChange(next);
    setCursor(ta, blockStart, blockStart + newBlock.length);
  }

  // ── Layout ────────────────────────────────────────────────────────────
  // Minimum height = minLines * line-height (1.6em on text-[15px] ~= 24px).
  const minHeight = `${minLines * 1.6}em`;

  // Line numbers derived from value. Count is max(actual lines, minLines)
  // so the gutter doesn't visually shrink when the editor is empty.
  const lineCount = useMemo(() => {
    const actual = value.split("\n").length;
    return Math.max(actual, minLines);
  }, [value, minLines]);

  const editorStyle = {
    fontFamily:
      "var(--font-geist-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace)",
    fontSize: 15,
    lineHeight: 1.6,
    minHeight,
    caretColor: "#e2e8f0",
  } as const;

  return (
    <div
      onKeyDownCapture={onKeyDownCapture}
      className={`relative flex bg-[#1e293b] text-[#e2e8f0] overflow-x-auto ${className}`}
      style={{ minHeight }}
    >
      {showLineNumbers && (
        <div
          aria-hidden="true"
          className="select-none sticky left-0 z-10 bg-[#1e293b] text-right text-slate-500 border-r border-white/5"
          style={{
            fontFamily: editorStyle.fontFamily,
            fontSize: editorStyle.fontSize,
            lineHeight: editorStyle.lineHeight,
            paddingTop: 16,
            paddingBottom: 16,
            paddingLeft: 12,
            paddingRight: 12,
            minHeight,
          }}
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <Editor
          value={value}
          onValueChange={onChange}
          highlight={highlight}
          padding={{ top: 16, right: 20, bottom: 16, left: 20 }}
          placeholder={placeholder}
          readOnly={readOnly}
          textareaId={ariaLabel}
          textareaClassName="focus:outline-none"
          preClassName="whitespace-pre"
          tabSize={4}
          insertSpaces
          style={editorStyle}
          aria-label={ariaLabel}
        />
      </div>
    </div>
  );
}
