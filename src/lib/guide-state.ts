"use client";

/*
 * Per-block localStorage state for interactive guide blocks (reveals, answers,
 * flashcard progress, etc.). Modeled after saved-runs.ts: same `useSyncExternalStore`
 * pattern, same cross-tab + same-tab change events, no server round-trip.
 *
 * Scope is a free-form string the caller provides — typically a stable composite
 * like `{topicSlug}:scenario_predict:{label}`. Different scopes are independent.
 * Same scope across machines/sessions does NOT sync; this is purely browser-local.
 *
 * Storage format: a single JSON value under the localStorage key. The hook
 * accepts any JSON-serializable T.
 */

import { useCallback, useMemo, useSyncExternalStore } from "react";

const PREFIX = "fde-prep:guide:v1:";
const CHANGE_EVENT = "fde-prep:guide-state-change";

function keyFor(scope: string): string {
  return PREFIX + scope;
}

/** Dispatched after any local write so same-tab subscribers update. */
function notifyChange(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

/** Subscribe to both cross-tab `storage` and same-tab change events. */
function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

/**
 * A `useState`-shaped hook backed by localStorage.
 *
 * On the server (and on first client render before hydration), the hook
 * returns `initial` — `useSyncExternalStore`'s getServerSnapshot path. After
 * hydration the React tree re-renders with the persisted value.
 *
 * If the JSON in localStorage is corrupt, falls back to `initial`.
 */
export function usePersistedState<T>(
  scope: string,
  initial: T,
): [T, (next: T | ((prev: T) => T)) => void, () => void] {
  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(keyFor(scope));
  }, [scope]);

  const raw = useSyncExternalStore(subscribe, getSnapshot, () => null);

  const value = useMemo<T>(() => {
    if (raw == null) return initial;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
    // `initial` is intentionally excluded — callers typically pass a fresh
    // object literal each render, which would invalidate the memo every time
    // even though the value semantics don't change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      if (typeof window === "undefined") return;
      const resolved =
        typeof next === "function"
          ? (next as (prev: T) => T)(value)
          : next;
      try {
        window.localStorage.setItem(keyFor(scope), JSON.stringify(resolved));
        notifyChange();
      } catch {
        // localStorage full or disabled — silently degrade to in-memory only
      }
    },
    [scope, value],
  );

  const clear = useCallback(() => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(keyFor(scope));
    notifyChange();
  }, [scope]);

  return [value, setValue, clear];
}

/** Best-effort id derivation for use in localStorage keys. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
