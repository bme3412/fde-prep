"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { ProgressUnit } from "@/lib/guide-types";
import {
  isProgressUnitDone,
  readPersistedRaw,
  sectionDoneScope,
  subscribeGuideState,
} from "@/lib/guide-state";
import { GuideProgress, SectionCheckbox } from "./components";

type GuideShellContextValue = {
  topicSlug: string;
  openSections: Set<number>;
  toggleSection: (index: number) => void;
  openSection: (index: number) => void;
  sectionDone: boolean[];
};

const GuideShellContext = createContext<GuideShellContextValue | null>(null);

function useGuideShell(): GuideShellContextValue {
  const ctx = useContext(GuideShellContext);
  if (!ctx) throw new Error("GuideShellContext missing");
  return ctx;
}

function useSectionDoneFlags(
  topicSlug: string,
  sectionTitles: string[],
): boolean[] {
  const titlesKey = sectionTitles.join("\0");
  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined") {
      return sectionTitles.map(() => "0").join(",");
    }
    return sectionTitles
      .map((title, i) => {
        const raw = readPersistedRaw(sectionDoneScope(topicSlug, i, title));
        return isProgressUnitDone("section-done", raw) ? "1" : "0";
      })
      .join(",");
    // sectionTitles is stable per guide page mount (from RSC props).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicSlug, titlesKey]);

  const raw = useSyncExternalStore(
    subscribeGuideState,
    getSnapshot,
    () => sectionTitles.map(() => "0").join(","),
  );

  return useMemo(() => raw.split(",").map((c) => c === "1"), [raw]);
}

export function GuideShell({
  topicSlug,
  sectionTitles,
  progressUnits,
  children,
}: {
  topicSlug: string;
  sectionTitles: string[];
  progressUnits: ProgressUnit[];
  children: ReactNode;
}) {
  const sectionDone = useSectionDoneFlags(topicSlug, sectionTitles);

  const firstIncomplete = sectionDone.findIndex((d) => !d);
  const defaultOpenIndex =
    firstIncomplete >= 0
      ? firstIncomplete
      : Math.max(0, sectionTitles.length - 1);

  // null = follow defaultOpenIndex; Set = user (or TOC) has taken control
  const [manualOpen, setManualOpen] = useState<Set<number> | null>(null);

  const openSections = useMemo(() => {
    if (manualOpen) return manualOpen;
    return new Set([defaultOpenIndex]);
  }, [manualOpen, defaultOpenIndex]);

  const toggleSection = useCallback(
    (index: number) => {
      setManualOpen((prev) => {
        const base = prev ?? new Set([defaultOpenIndex]);
        const next = new Set(base);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        return next;
      });
    },
    [defaultOpenIndex],
  );

  const openSection = useCallback(
    (index: number) => {
      setManualOpen((prev) => {
        const base = prev ?? new Set([defaultOpenIndex]);
        const next = new Set(base);
        next.add(index);
        return next;
      });
    },
    [defaultOpenIndex],
  );

  // Hash navigation: open target section when hash changes (TOC / continue).
  useEffect(() => {
    function handleHash() {
      const hash = window.location.hash;
      const match = /^#section-(\d+)$/.exec(hash);
      if (!match) return;
      const idx = Number(match[1]);
      if (Number.isNaN(idx) || idx < 0 || idx >= sectionTitles.length) return;
      openSection(idx);
      requestAnimationFrame(() => {
        document.getElementById(`section-${idx}`)?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }
    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, [sectionTitles.length, openSection]);

  const continueIndex = defaultOpenIndex;
  const allDone = firstIncomplete < 0 && sectionTitles.length > 0;

  const ctx = useMemo(
    () => ({
      topicSlug,
      openSections,
      toggleSection,
      openSection,
      sectionDone,
    }),
    [topicSlug, openSections, toggleSection, openSection, sectionDone],
  );

  return (
    <GuideShellContext.Provider value={ctx}>
      <div className="mb-6 sticky top-0 z-20 -mx-1 px-1 sm:mx-0 sm:px-0 py-2 bg-zinc-50/95 backdrop-blur border-b border-zinc-200/80">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 shadow-sm">
          <div className="text-sm text-zinc-600">
            <span className="font-semibold text-zinc-800">
              Section {continueIndex + 1} of {sectionTitles.length}
            </span>
            {allDone ? (
              <span className="text-emerald-600 font-medium">
                {" "}
                · All sections checked
              </span>
            ) : (
              <span className="text-zinc-400">
                {" "}
                · {sectionDone.filter(Boolean).length} done
              </span>
            )}
          </div>
          <a
            href={`#section-${continueIndex}`}
            onClick={(e) => {
              e.preventDefault();
              openSection(continueIndex);
              window.history.replaceState(null, "", `#section-${continueIndex}`);
              document.getElementById(`section-${continueIndex}`)?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            }}
            className="text-sm font-medium text-zinc-800 hover:text-zinc-600 underline underline-offset-2"
          >
            Continue
          </a>
        </div>
      </div>

      <div className="mb-8">
        <GuideProgress topicSlug={topicSlug} units={progressUnits} />
      </div>

      <nav className="mb-10 bg-white border border-zinc-200 rounded-xl p-4 sm:p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3">
          Sections
        </h2>
        <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
          {sectionTitles.map((title, si) => (
            <li key={si}>
              <a
                href={`#section-${si}`}
                onClick={(e) => {
                  e.preventDefault();
                  openSection(si);
                  window.history.replaceState(null, "", `#section-${si}`);
                  requestAnimationFrame(() => {
                    document.getElementById(`section-${si}`)?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  });
                }}
                className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors py-1 flex items-center gap-2"
              >
                <span className="text-zinc-400 font-mono text-xs shrink-0">
                  {si + 1}.
                </span>
                <span className="min-w-0 truncate">{title}</span>
                {sectionDone[si] && (
                  <span className="text-emerald-500 text-xs shrink-0" aria-label="Done">
                    ✓
                  </span>
                )}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="space-y-4">{children}</div>
    </GuideShellContext.Provider>
  );
}

export function GuideSectionPanel({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: ReactNode;
}) {
  const { topicSlug, openSections, toggleSection } = useGuideShell();
  const isOpen = openSections.has(index);

  return (
    <section
      id={`section-${index}`}
      className="scroll-mt-24 rounded-xl border border-zinc-200 bg-white overflow-hidden"
    >
      <div className="flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-zinc-100 bg-zinc-50/80">
        <button
          type="button"
          onClick={() => toggleSection(index)}
          aria-expanded={isOpen}
          className="flex flex-1 items-center gap-3 min-w-0 text-left group"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className={`shrink-0 text-zinc-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
            aria-hidden
          >
            <path
              d="M6 4L10 8L6 12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-2xl font-bold text-zinc-200 font-mono leading-none shrink-0">
            {String(index + 1).padStart(2, "0")}
          </span>
          <h2 className="text-lg sm:text-xl font-bold text-zinc-900 flex-1 min-w-0 truncate group-hover:text-zinc-700">
            {title}
          </h2>
        </button>
        <SectionCheckbox
          topicSlug={topicSlug}
          sectionIndex={index}
          sectionTitle={title}
        />
      </div>
      {isOpen && <div className="p-4 sm:p-5 space-y-6">{children}</div>}
    </section>
  );
}
