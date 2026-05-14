"use client";

import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  CodePredict as CodePredictData,
  ScenarioPredict as ScenarioPredictData,
  Flashcard as FlashcardData,
  MiniChallenge as MiniChallengeData,
  KeyInsight as KeyInsightData,
  MethodRef as MethodRefData,
  CodeComparison as CodeComparisonData,
  WarmUp as WarmUpData,
  MultipleChoice as MultipleChoiceData,
} from "@/lib/guide-types";
import { runPython, type RunResult } from "@/lib/pyodide-runtime";

/*
 * Design system:
 *   - All cards: white bg, border-zinc-200, rounded-xl
 *   - All code: bg-[#1e293b] text-[#e2e8f0] (slate-800/slate-100 equivalent)
 *   - All headers: light zinc-50 bg with a small colored dot for type
 *   - All primary buttons: zinc-800, all secondary: zinc text links
 *   - Spacing: p-4 mobile, p-5 desktop
 */

const CODE_BG = "bg-[#1e293b]";
const CODE_TEXT = "text-[#e2e8f0]";
const CODE_CLASSES = `${CODE_BG} ${CODE_TEXT} px-4 sm:px-5 py-4 text-sm sm:text-[15px] leading-relaxed font-mono overflow-x-auto whitespace-pre`;
const CARD = "rounded-xl border border-zinc-200 bg-white overflow-hidden";
const BTN_PRIMARY = "bg-zinc-800 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors active:scale-[0.98]";
const BTN_PRIMARY_FULL = `w-full sm:w-auto ${BTN_PRIMARY}`;

function CardHeader({ dot, label, meta }: { dot: string; label: string; meta?: string }) {
  return (
    <div className="px-4 sm:px-5 py-3 border-b border-zinc-100 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
        <span className="text-xs font-semibold tracking-wide uppercase text-zinc-500">
          {label}
        </span>
      </div>
      {meta && (
        <span className="text-xs text-zinc-400 font-mono truncate max-w-[50%] text-right">
          {meta}
        </span>
      )}
    </div>
  );
}

// ── CodePredict ────────────────────────────────────────────────────────────

type RunStatus = "idle" | "loading" | "running" | "done";

export function CodePredict({ data }: { data: CodePredictData }) {
  const [code, setCode] = useState(data.code);
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);

  const isEdited = code !== data.code;
  const lineCount = Math.max(4, code.split("\n").length);

  async function handleRun() {
    setRunStatus(
      typeof window !== "undefined" && window.loadPyodide ? "running" : "loading",
    );
    try {
      const result = await runPython(code);
      setRunResult(result);
    } catch (e) {
      setRunResult({
        stdout: "",
        stderr: "",
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setRunStatus("done");
    }
  }

  return (
    <div className={CARD}>
      <CardHeader dot="bg-zinc-800" label="Code Playground" meta={data.label} />

      {/* Editable code block */}
      <div className={`${CODE_BG} relative`}>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          rows={lineCount}
          aria-label="Editable code"
          className={`${CODE_TEXT} bg-transparent px-4 sm:px-5 py-4 text-sm sm:text-[15px] leading-relaxed font-mono w-full resize-y focus:outline-none whitespace-pre`}
        />
        {isEdited && (
          <button
            type="button"
            onClick={() => setCode(data.code)}
            className="absolute top-2 right-2 text-[10px] uppercase tracking-wide font-mono text-zinc-400 hover:text-zinc-200 bg-black/30 px-2 py-1 rounded"
          >
            Reset code
          </button>
        )}
      </div>

      <div className="p-4 sm:p-5 space-y-3">
        {/* Run controls */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleRun}
            disabled={runStatus === "loading" || runStatus === "running"}
            className={`${BTN_PRIMARY} disabled:opacity-60 disabled:cursor-wait`}
          >
            {runStatus === "loading" && "Loading Python runtime…"}
            {runStatus === "running" && "Running…"}
            {runStatus === "idle" && "Run code"}
            {runStatus === "done" && "Run again"}
          </button>
          {isEdited && (
            <span className="text-xs text-amber-600 font-medium">Code edited</span>
          )}
          {runStatus === "loading" && (
            <span className="text-xs text-zinc-500">
              First run downloads Pyodide (~10MB). Cached after this.
            </span>
          )}
        </div>

        {/* Output */}
        {runResult && (
          <div className="text-sm space-y-1">
            <span className="text-zinc-400 text-xs font-medium uppercase tracking-wide">
              Output:
            </span>
            {runResult.error ? (
              <pre className="bg-red-50 text-red-800 border border-red-200 px-3 py-2 rounded text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                {runResult.error}
                {runResult.stderr && "\n" + runResult.stderr}
              </pre>
            ) : (
              <pre className={`${CODE_BG} ${CODE_TEXT} px-3 py-2 rounded text-sm sm:text-[15px] font-mono overflow-x-auto whitespace-pre`}>
                {runResult.stdout || "(no output)"}
              </pre>
            )}
          </div>
        )}

        {/* Optional explanation disclosure */}
        {(data.explanation || data.output) && (
          <div className="pt-1">
            {!showExplanation ? (
              <button
                type="button"
                onClick={() => setShowExplanation(true)}
                className="text-xs text-zinc-500 hover:text-zinc-800 underline"
              >
                Show explanation
              </button>
            ) : (
              <div className="space-y-3 border-t border-zinc-100 pt-3">
                {data.output && (
                  <div className="text-sm space-y-1">
                    <span className="text-zinc-400 text-xs font-medium uppercase tracking-wide">
                      Expected output{isEdited ? " (for original code)" : ""}:
                    </span>
                    <pre className={`${CODE_BG} ${CODE_TEXT} px-3 py-2 rounded text-sm sm:text-[15px] font-mono overflow-x-auto whitespace-pre`}>
                      {data.output}
                    </pre>
                  </div>
                )}
                {data.explanation && (
                  <div className="text-sm text-zinc-600 bg-zinc-50 rounded-lg p-4 border border-zinc-100 leading-relaxed">
                    {data.explanation}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowExplanation(false)}
                  className="text-xs text-zinc-400 hover:text-zinc-600 underline"
                >
                  Hide explanation
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── ScenarioPredict ────────────────────────────────────────────────────────

export function ScenarioPredict({ data }: { data: ScenarioPredictData }) {
  const [revealed, setRevealed] = useState(false);
  const [userGuess, setUserGuess] = useState("");

  return (
    <div className={CARD}>
      <CardHeader dot="bg-zinc-800" label="Scenario" meta={data.label} />

      <pre className={CODE_CLASSES}>{data.scenario}</pre>

      <div className="p-4 sm:p-5 space-y-3">
        <div className="text-sm font-medium text-zinc-800">{data.question}</div>
        {!revealed ? (
          <>
            <textarea
              value={userGuess}
              onChange={(e) => setUserGuess(e.target.value)}
              rows={2}
              placeholder="Type your answer..."
              className="border border-zinc-200 rounded-lg px-3 py-2.5 text-sm w-full font-mono bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-300"
            />
            <button type="button" onClick={() => setRevealed(true)} className={BTN_PRIMARY_FULL}>
              Reveal Answer
            </button>
          </>
        ) : (
          <div className="space-y-3">
            {userGuess && (
              <div className="text-sm">
                <span className="text-zinc-400 text-xs font-medium uppercase tracking-wide">You said:</span>
                <div className="mt-1 bg-zinc-50 px-3 py-2 rounded border border-zinc-200 font-mono text-sm text-zinc-800 whitespace-pre-wrap overflow-x-auto">
                  {userGuess}
                </div>
              </div>
            )}
            <div className="text-sm">
              <span className="text-zinc-400 text-xs font-medium uppercase tracking-wide">Answer:</span>
              <pre className={`mt-1 ${CODE_BG} ${CODE_TEXT} px-3 py-2 rounded text-sm sm:text-[15px] font-mono overflow-x-auto whitespace-pre`}>
                {data.answer}
              </pre>
            </div>
            <div className="text-sm text-zinc-600 bg-zinc-50 rounded-lg p-4 border border-zinc-100 leading-relaxed">
              {data.explanation}
            </div>
            <button
              type="button"
              onClick={() => { setRevealed(false); setUserGuess(""); }}
              className="text-xs text-zinc-400 hover:text-zinc-600 underline"
            >
              Reset
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── FlashcardDeck ──────────────────────────────────────────────────────────

export function FlashcardDeck({ cards }: { cards: FlashcardData[] }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [score, setScore] = useState({ knew: 0, missed: 0 });

  const card = cards[index];
  const isFinished = index >= cards.length;

  function handleResponse(knew: boolean) {
    setScore((s) => (knew ? { ...s, knew: s.knew + 1 } : { ...s, missed: s.missed + 1 }));
    setFlipped(false);
    setIndex((i) => i + 1);
  }

  if (isFinished) {
    const pct = Math.round((score.knew / cards.length) * 100);
    return (
      <div className={`${CARD} p-6 sm:p-8 text-center space-y-4`}>
        <div className="text-lg font-bold text-zinc-900">Deck Complete</div>
        <div className="flex justify-center gap-4 sm:gap-6 text-sm">
          <div className="bg-zinc-100 text-zinc-800 rounded-lg px-4 py-2 font-medium">
            {score.knew} knew
          </div>
          <div className="bg-zinc-100 text-zinc-800 rounded-lg px-4 py-2 font-medium">
            {score.missed} missed
          </div>
        </div>
        <div className="text-2xl font-bold text-zinc-900">{pct}%</div>
        {score.missed > 0 && (
          <p className="text-sm text-zinc-500">
            Come back tomorrow and run through again to lock these in.
          </p>
        )}
        <button
          type="button"
          onClick={() => { setIndex(0); setFlipped(false); setScore({ knew: 0, missed: 0 }); }}
          className={BTN_PRIMARY}
        >
          Restart Deck
        </button>
      </div>
    );
  }

  return (
    <div className={CARD}>
      {/* Header */}
      <div className="px-4 sm:px-5 py-3 border-b border-zinc-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-zinc-800 shrink-0" />
          <span className="text-xs font-semibold tracking-wide uppercase text-zinc-500">
            Flashcard
          </span>
          <span className="text-xs text-zinc-400 font-mono font-medium">
            {index + 1}/{cards.length}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
          <span>{score.knew}&#10003;</span>
          <span>{score.missed}&#10007;</span>
        </div>
      </div>

      {/* Progress track */}
      <div className="h-0.5 bg-zinc-100">
        <div
          className="h-0.5 bg-zinc-400 transition-all duration-300"
          style={{ width: `${((index) / cards.length) * 100}%` }}
        />
      </div>

      {/* Card body */}
      <div className="p-5 sm:p-8 min-h-[160px] sm:min-h-[180px] flex flex-col justify-center">
        {card.context && (
          <div className="text-xs text-zinc-400 uppercase tracking-wide font-semibold text-center mb-3">
            {card.context}
          </div>
        )}
        <div className="text-[15px] sm:text-base leading-relaxed font-medium text-center text-zinc-800">
          {card.front}
        </div>
        {flipped && (
          <div className="mt-5 sm:mt-6 pt-5 sm:pt-6 border-t border-dashed border-zinc-200 text-sm text-zinc-600 text-center leading-relaxed">
            {card.back}
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="border-t border-zinc-100 px-4 sm:px-6 py-4 flex justify-center gap-3">
        {!flipped ? (
          <button type="button" onClick={() => setFlipped(true)} className={`w-full sm:w-auto ${BTN_PRIMARY}`}>
            Flip Card
          </button>
        ) : (
          <div className="flex gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => handleResponse(true)}
              className="flex-1 sm:flex-none bg-zinc-800 text-white px-6 py-3 sm:py-2.5 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors active:scale-[0.98]"
            >
              Knew It
            </button>
            <button
              type="button"
              onClick={() => handleResponse(false)}
              className="flex-1 sm:flex-none bg-white text-zinc-800 border border-zinc-300 px-6 py-3 sm:py-2.5 rounded-lg text-sm font-medium hover:bg-zinc-50 transition-colors active:scale-[0.98]"
            >
              Missed It
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── MiniChallenge ──────────────────────────────────────────────────────────

export function MiniChallenge({ data }: { data: MiniChallengeData }) {
  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  const [userCode, setUserCode] = useState("");

  return (
    <div className={CARD}>
      <CardHeader dot="bg-amber-500" label="Challenge" meta={data.title} />

      <div className="p-4 sm:p-5 space-y-5">
        {/* Prompt */}
        <div className="guide-prose text-sm text-zinc-700">
          <Markdown remarkPlugins={[remarkGfm]}>{data.prompt}</Markdown>
        </div>

        {/* Hints */}
        {data.hints.length > 0 && (
          <div className="space-y-2">
            {data.hints.slice(0, hintsRevealed).map((hint, i) => (
              <div key={i} className="text-sm bg-zinc-50 text-zinc-700 border border-zinc-200 rounded-lg px-4 py-2.5">
                <span className="font-semibold text-zinc-500">Hint {i + 1}:</span>{" "}{hint}
              </div>
            ))}
            {hintsRevealed < data.hints.length && (
              <button
                type="button"
                onClick={() => setHintsRevealed((h) => h + 1)}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-700 underline py-1"
              >
                Show hint ({hintsRevealed + 1}/{data.hints.length})
              </button>
            )}
          </div>
        )}

        {/* Workspace */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
            Your solution
          </label>
          <textarea
            value={userCode}
            onChange={(e) => setUserCode(e.target.value)}
            rows={8}
            spellCheck={false}
            className="border border-zinc-200 rounded-lg px-3 sm:px-4 py-3 text-sm sm:text-[15px] leading-relaxed w-full font-mono bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-300"
            placeholder="# Write your solution here..."
          />
        </div>

        {/* Solution */}
        {!showSolution ? (
          <button type="button" onClick={() => setShowSolution(true)} className={BTN_PRIMARY_FULL}>
            Show Reference Solution
          </button>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg overflow-hidden">
              <div className={`${CODE_BG} px-4 py-1.5 text-xs text-zinc-500 font-mono border-b border-white/10`}>
                reference solution
              </div>
              <pre className={CODE_CLASSES}>{data.solution}</pre>
            </div>
            <div className="text-sm bg-zinc-50 rounded-lg p-4 border border-zinc-100 leading-relaxed text-zinc-700">
              <span className="font-semibold text-zinc-900">Takeaway:</span> {data.takeaway}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Prose (markdown rendering) ─────────────────────────────────────────────

export function Prose({ markdown }: { markdown: string }) {
  return (
    <div className="guide-prose text-sm text-zinc-700 leading-relaxed">
      <Markdown remarkPlugins={[remarkGfm]}>{markdown}</Markdown>
    </div>
  );
}

// ── KeyInsight ─────────────────────────────────────────────────────────────

export function KeyInsightBlock({ data }: { data: KeyInsightData }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 sm:p-5 space-y-2">
      <div className="text-xs font-semibold tracking-wide uppercase text-zinc-500">
        {data.label}
      </div>
      <div className="guide-prose text-sm text-zinc-800 leading-relaxed">
        <Markdown remarkPlugins={[remarkGfm]}>{data.insight}</Markdown>
      </div>
    </div>
  );
}

// ── MethodRef — API reference card with tap-to-expand ──────────────────

export function MethodRefBlock({ data }: { data: MethodRefData }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className={CARD}>
      <CardHeader dot="bg-zinc-400" label="API Reference" meta={data.title} />

      {/* Import line */}
      <div className={`${CODE_BG} px-4 py-2`}>
        <code className="text-sm sm:text-[15px] font-mono text-zinc-400">{data.importLine}</code>
      </div>

      {/* Methods list */}
      <div className="divide-y divide-zinc-100">
        {data.methods.map((method, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setExpanded(expanded === i ? null : i)}
            className="w-full text-left px-4 py-3 hover:bg-zinc-50 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <code className="text-sm sm:text-[15px] font-mono font-semibold text-zinc-800 bg-zinc-100 px-2 py-0.5 rounded shrink-0">
                {method.signature}
              </code>
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                className={`shrink-0 mt-1 text-zinc-300 transition-transform ${expanded === i ? "rotate-180" : ""}`}
              >
                <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p className="text-xs sm:text-sm text-zinc-500 mt-1.5 leading-relaxed">
              {method.description}
            </p>
            {expanded === i && method.returns && (
              <div className="mt-2 text-xs bg-zinc-50 text-zinc-600 rounded px-3 py-2 border border-zinc-200 font-mono">
                <span className="text-zinc-400 font-sans text-[10px] uppercase tracking-wide font-semibold">Returns: </span>
                {method.returns}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── CodeComparison — side-by-side before/after ────────────────────────────

export function CodeComparisonBlock({ data }: { data: CodeComparisonData }) {
  return (
    <div className={CARD}>
      <CardHeader dot="bg-zinc-400" label="Compare" meta={data.label} />
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-zinc-200">
        {/* Left pane */}
        <div>
          <div className="px-4 py-2 border-b border-zinc-100">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {data.left.title}
            </span>
          </div>
          <pre className={CODE_CLASSES}>{data.left.code}</pre>
          {data.left.annotation && (
            <div className="px-4 py-2 text-xs text-zinc-500 bg-zinc-50 border-t border-zinc-100">
              {data.left.annotation}
            </div>
          )}
        </div>
        {/* Right pane */}
        <div>
          <div className="px-4 py-2 border-b border-zinc-100">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {data.right.title}
            </span>
          </div>
          <pre className={CODE_CLASSES}>{data.right.code}</pre>
          {data.right.annotation && (
            <div className="px-4 py-2 text-xs text-zinc-500 bg-zinc-50 border-t border-zinc-100">
              {data.right.annotation}
            </div>
          )}
        </div>
      </div>
      {data.takeaway && (
        <div className="px-4 sm:px-5 py-3 text-sm text-zinc-600 bg-zinc-50 border-t border-zinc-100 leading-relaxed">
          {data.takeaway}
        </div>
      )}
    </div>
  );
}

// ── WarmUp — lightweight fill-in-the-blank ────────────────────────────────

export function WarmUpBlock({ data }: { data: WarmUpData }) {
  const [revealed, setRevealed] = useState(false);
  const [userAnswer, setUserAnswer] = useState("");

  return (
    <div className={CARD}>
      <CardHeader dot="bg-emerald-500" label="Try It" meta={data.title} />
      <div className="p-4 sm:p-5 space-y-3">
        <div className="guide-prose text-sm text-zinc-700">
          <Markdown remarkPlugins={[remarkGfm]}>{data.prompt}</Markdown>
        </div>
        {!revealed ? (
          <>
            <input
              type="text"
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              placeholder="Your answer..."
              className="border border-zinc-200 rounded-lg px-3 py-2.5 text-sm w-full font-mono bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-300"
              onKeyDown={(e) => e.key === "Enter" && setRevealed(true)}
            />
            <button type="button" onClick={() => setRevealed(true)} className={BTN_PRIMARY_FULL}>
              Check
            </button>
          </>
        ) : (
          <div className="space-y-3">
            {userAnswer && (
              <div className="text-sm space-y-1">
                <span className="text-zinc-400 text-xs font-medium uppercase tracking-wide">You said:</span>
                <code className="block bg-zinc-50 px-3 py-2 rounded border border-zinc-200 font-mono text-zinc-800">{userAnswer}</code>
              </div>
            )}
            <div className="text-sm space-y-1">
              <span className="text-zinc-400 text-xs font-medium uppercase tracking-wide">Answer:</span>
              <code className="block bg-zinc-50 px-3 py-2 rounded border border-zinc-200 font-mono text-zinc-800">{data.answer}</code>
            </div>
            <div className="text-sm text-zinc-600 bg-zinc-50 rounded-lg p-4 border border-zinc-100 leading-relaxed">
              {data.explanation}
            </div>
            <button
              type="button"
              onClick={() => { setRevealed(false); setUserAnswer(""); }}
              className="text-xs text-zinc-400 hover:text-zinc-600 underline"
            >
              Reset
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── MultipleChoice ─────────────────────────────────────────────────────────

export function MultipleChoiceBlock({ data }: { data: MultipleChoiceData }) {
  const [picked, setPicked] = useState<number | null>(null);
  const correctIdx = data.choices.findIndex((c) => c.correct);
  const isAnswered = picked !== null;
  const isCorrect = picked === correctIdx;

  return (
    <div className={CARD}>
      <CardHeader dot="bg-indigo-500" label="Multiple Choice" meta={data.title} />
      <div className="p-4 sm:p-5 space-y-4">
        {/* Prompt */}
        <div className="guide-prose text-sm text-zinc-800 leading-relaxed">
          <Markdown remarkPlugins={[remarkGfm]}>{data.prompt}</Markdown>
        </div>

        {/* Optional code block */}
        {data.code && (
          <pre className={`${CODE_CLASSES} rounded-lg`}>{data.code}</pre>
        )}

        {/* Choices */}
        <div className="space-y-2">
          {data.choices.map((choice, i) => {
            const isPicked = picked === i;
            const isCorrectChoice = i === correctIdx;

            // Color states
            let stateClass = "border-zinc-200 bg-white hover:bg-zinc-50";
            if (isAnswered) {
              if (isCorrectChoice) {
                stateClass = "border-emerald-400 bg-emerald-50";
              } else if (isPicked) {
                stateClass = "border-red-400 bg-red-50";
              } else {
                stateClass = "border-zinc-200 bg-white opacity-60";
              }
            }

            return (
              <button
                key={i}
                type="button"
                disabled={isAnswered}
                onClick={() => setPicked(i)}
                className={`w-full text-left border rounded-lg px-4 py-3 transition-colors ${stateClass} disabled:cursor-default`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-xs font-mono font-semibold text-zinc-400 mt-0.5 shrink-0">
                    {String.fromCharCode(65 + i)}.
                  </span>
                  <div className="flex-1 text-sm text-zinc-800 font-mono whitespace-pre-wrap break-words">
                    {choice.text}
                  </div>
                  {isAnswered && isCorrectChoice && (
                    <span className="text-emerald-600 text-sm font-semibold shrink-0">
                      &#10003;
                    </span>
                  )}
                  {isAnswered && isPicked && !isCorrectChoice && (
                    <span className="text-red-600 text-sm font-semibold shrink-0">
                      &#10007;
                    </span>
                  )}
                </div>
                {isAnswered && (isPicked || isCorrectChoice) && choice.rationale && (
                  <div className="mt-2 ml-7 text-xs text-zinc-600 leading-relaxed">
                    {choice.rationale}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Result + explanation */}
        {isAnswered && (
          <div className="space-y-2 pt-1">
            <div
              className={`text-sm font-semibold ${isCorrect ? "text-emerald-700" : "text-red-700"}`}
            >
              {isCorrect ? "Correct" : "Not quite"}
            </div>
            <div className="text-sm text-zinc-700 bg-zinc-50 border border-zinc-100 rounded-lg p-4 leading-relaxed">
              {data.explanation}
            </div>
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="text-xs text-zinc-400 hover:text-zinc-600 underline"
            >
              Reset
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Progress tracker ───────────────────────────────────────────────────────

export function GuideProgress({
  totalPredicts,
  totalScenarios,
  totalChallenges,
  totalFlashcardDecks,
  totalWarmUps,
  totalMCQs = 0,
}: {
  totalPredicts: number;
  totalScenarios: number;
  totalChallenges: number;
  totalFlashcardDecks: number;
  totalWarmUps: number;
  totalMCQs?: number;
}) {
  const total = totalPredicts + totalScenarios + totalChallenges + totalFlashcardDecks + totalWarmUps + totalMCQs;
  const items = [
    totalPredicts > 0 && `${totalPredicts} prediction${totalPredicts !== 1 ? "s" : ""}`,
    totalWarmUps > 0 && `${totalWarmUps} try-it${totalWarmUps !== 1 ? "s" : ""}`,
    totalMCQs > 0 && `${totalMCQs} multiple-choice`,
    totalScenarios > 0 && `${totalScenarios} scenario${totalScenarios !== 1 ? "s" : ""}`,
    totalFlashcardDecks > 0 && `${totalFlashcardDecks} flashcard deck${totalFlashcardDecks !== 1 ? "s" : ""}`,
    totalChallenges > 0 && `${totalChallenges} challenge${totalChallenges !== 1 ? "s" : ""}`,
  ].filter(Boolean);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline gap-x-1 gap-y-1 text-sm text-zinc-600">
        <span className="font-semibold text-zinc-800">{total} exercises:</span>
        <span>{items.join(" · ")}</span>
      </div>
    </div>
  );
}
