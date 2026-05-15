"use client";

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
}

/**
 * Editable, syntax-highlighted code area. Combines react-simple-code-editor's
 * lightweight textarea-over-pre pattern with prism-react-renderer + our slate
 * theme, so the colors match the static <CodeBlock> elsewhere on the page.
 */
export function CodeEditor({
  value,
  onChange,
  language = "python",
  placeholder,
  minLines = 4,
  className = "",
  readOnly = false,
  ariaLabel = "Editable code",
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

  // Minimum height = minLines * line-height (1.6em on text-[15px] ~= 24px).
  const minHeight = `${minLines * 1.6}em`;

  return (
    <div
      className={`bg-[#1e293b] text-[#e2e8f0] overflow-x-auto ${className}`}
      style={{ minHeight }}
    >
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
        style={{
          fontFamily:
            "var(--font-geist-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace)",
          fontSize: 15,
          lineHeight: 1.6,
          minHeight,
          caretColor: "#e2e8f0",
        }}
        aria-label={ariaLabel}
      />
    </div>
  );
}
