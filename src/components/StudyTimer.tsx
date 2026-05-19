"use client";

/*
 * StudyTimer
 * ──────────
 * Tracks active study time on a topic/guide page and ships it to the server
 * for cumulative per-topic and per-day totals.
 *
 * "Active" means ALL of:
 *   1. document.visibilityState === "visible"  (tab is in foreground)
 *   2. window has focus                         (browser window is focused)
 *   3. user interacted within IDLE_THRESHOLD_MS (mouse / key / scroll / click)
 *
 * Buffering / flushing strategy:
 *   - 1s tick increments an in-memory `pendingSeconds` counter when active.
 *   - Every FLUSH_INTERVAL_MS we POST the buffered seconds via fetch.
 *   - On visibilitychange → hidden and on pagehide we flush via
 *     navigator.sendBeacon (survives the unload race that fetch loses).
 *
 * The server clamps a single request to ≤120 seconds, so a runaway client
 * cannot inflate totals. The local buffer is reset only after a successful
 * dispatch — failed flushes carry over to the next attempt.
 */

import { useEffect, useRef, useState } from "react";

const IDLE_THRESHOLD_MS = 60_000; // 60s of no activity → pause
const FLUSH_INTERVAL_MS = 30_000; // flush every 30s
const TICK_MS = 1_000;
const MAX_FLUSH_SECONDS = 120; // matches server-side clamp

type Props = {
  topicId: string;
  /** Cumulative seconds already stored server-side (from RSC). */
  initialSeconds: number;
};

export function StudyTimer({ topicId, initialSeconds }: Props) {
  // Total seconds shown in the badge = persisted base + uncommitted buffer.
  const [persistedSeconds, setPersistedSeconds] = useState(initialSeconds);
  const [bufferedSeconds, setBufferedSeconds] = useState(0);
  const [active, setActive] = useState(false);

  // Refs for values read inside intervals / event listeners without
  // re-creating the effect on every state change.
  const bufferRef = useRef(0);
  // Initialized in the effect below — Date.now() / document.hasFocus() are
  // impure and must not be called during render.
  const lastActivityRef = useRef<number>(0);
  const hasFocusRef = useRef<boolean>(false);

  /** Send buffered seconds to the server. Returns true on success. */
  const flushFetch = async (): Promise<void> => {
    const seconds = bufferRef.current;
    if (seconds <= 0) return;
    const payload = Math.min(seconds, MAX_FLUSH_SECONDS);
    try {
      const res = await fetch("/api/study-time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId, seconds: payload }),
        keepalive: true, // best-effort survival of unload
      });
      if (res.ok) {
        bufferRef.current -= payload;
        setBufferedSeconds(bufferRef.current);
        setPersistedSeconds((p) => p + payload);
      }
    } catch {
      // Network blip — keep the buffer, retry next interval.
    }
  };

  /** Synchronous flush for visibility/unload via sendBeacon. */
  const flushBeacon = (): void => {
    const seconds = bufferRef.current;
    if (seconds <= 0) return;
    const payload = Math.min(seconds, MAX_FLUSH_SECONDS);
    const ok = navigator.sendBeacon(
      "/api/study-time",
      // sendBeacon with a Blob lets us set Content-Type; our route handler
      // reads .text() and JSON.parse so this works.
      new Blob([JSON.stringify({ topicId, seconds: payload })], {
        type: "application/json",
      }),
    );
    if (ok) {
      bufferRef.current -= payload;
      // No state update — we're unmounting/hiding.
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Initialize activity timestamp + focus state so we count a fresh tab
    // as active. These are impure reads kept out of render.
    lastActivityRef.current = Date.now();
    hasFocusRef.current = document.hasFocus();

    const markActivity = () => {
      lastActivityRef.current = Date.now();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        flushBeacon();
      } else {
        markActivity();
      }
    };
    const onFocus = () => {
      hasFocusRef.current = true;
      markActivity();
    };
    const onBlur = () => {
      hasFocusRef.current = false;
    };
    const onPageHide = () => {
      flushBeacon();
    };

    const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
      "mousemove",
      "keydown",
      "scroll",
      "click",
      "touchstart",
    ];
    ACTIVITY_EVENTS.forEach((e) =>
      window.addEventListener(e, markActivity, { passive: true }),
    );
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    window.addEventListener("pagehide", onPageHide);

    // 1-second tick: increment buffer if active.
    const tickId = window.setInterval(() => {
      const visible = document.visibilityState === "visible";
      const recentActivity =
        Date.now() - lastActivityRef.current < IDLE_THRESHOLD_MS;
      const isActive = visible && hasFocusRef.current && recentActivity;
      setActive(isActive);
      if (isActive) {
        bufferRef.current += 1;
        setBufferedSeconds(bufferRef.current);
      }
    }, TICK_MS);

    // Periodic flush.
    const flushId = window.setInterval(() => {
      void flushFetch();
    }, FLUSH_INTERVAL_MS);

    return () => {
      window.clearInterval(tickId);
      window.clearInterval(flushId);
      ACTIVITY_EVENTS.forEach((e) =>
        window.removeEventListener(e, markActivity),
      );
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pagehide", onPageHide);
      // Best-effort flush of remaining buffer on unmount (route changes).
      flushBeacon();
    };
    // We intentionally bind this effect to topicId only. The closures over
    // setState/refs are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId]);

  const totalSeconds = persistedSeconds + bufferedSeconds;
  const totalMinutes = Math.floor(totalSeconds / 60);

  return (
    <div
      className="inline-flex items-center gap-2 text-xs text-zinc-500 bg-zinc-50 border border-zinc-200 rounded-full px-3 py-1"
      title={
        active
          ? "Tracking study time — pauses after 60s idle or when the tab loses focus."
          : "Paused — move the mouse, type, or click to resume tracking."
      }
    >
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${active ? "bg-green-500" : "bg-zinc-300"}`}
        aria-hidden
      />
      <span className="tabular-nums">
        Studied: <strong className="text-zinc-700 font-semibold">{totalMinutes}m</strong>
      </span>
      <span className="text-zinc-400">{active ? "tracking" : "paused"}</span>
    </div>
  );
}
