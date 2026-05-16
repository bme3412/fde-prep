/*
 * Per-block localStorage history of code runs the user has explicitly saved.
 *
 * Scope is a free-form string the caller provides — typically a stable block
 * identifier like the CodePredict `label`. The same scope on different
 * machines/sessions does NOT sync; this is purely browser-local.
 *
 * Constraints:
 *   • Max 20 entries per scope, newest first. Older entries fall off.
 *   • Per-entry stdout is capped at STDOUT_CAP characters; longer output is
 *     truncated with a sentinel so the panel doesn't bloat localStorage.
 */

export interface SavedRun {
  id: string;
  code: string;
  stdout?: string;
  stderr?: string;
  error?: string;
  timestamp: number;
}

const PREFIX = "fde-prep:saved-runs:v1:";
const CHANGE_EVENT = "fde-prep:saved-runs-change";
const MAX_ENTRIES = 20;
const STDOUT_CAP = 16_000;

function keyFor(scope: string): string {
  return PREFIX + scope;
}

/** Dispatched after any local write so same-tab subscribers can update. */
function notifyChange(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

/** Subscribe to both cross-tab `storage` and same-tab change events. */
export function subscribeToRuns(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function cap(text: string | undefined): string | undefined {
  if (!text) return text;
  if (text.length <= STDOUT_CAP) return text;
  return text.slice(0, STDOUT_CAP) + "\n…[truncated]";
}

export function loadRuns(scope: string): SavedRun[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is SavedRun =>
        typeof r === "object" &&
        r !== null &&
        typeof r.id === "string" &&
        typeof r.code === "string" &&
        typeof r.timestamp === "number",
    );
  } catch {
    return [];
  }
}

export function saveRun(
  scope: string,
  run: Omit<SavedRun, "id" | "timestamp">,
): SavedRun {
  const entry: SavedRun = {
    code: run.code,
    stdout: cap(run.stdout),
    stderr: cap(run.stderr),
    error: run.error,
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2),
    timestamp: Date.now(),
  };
  const existing = loadRuns(scope);
  const next = [entry, ...existing].slice(0, MAX_ENTRIES);
  window.localStorage.setItem(keyFor(scope), JSON.stringify(next));
  notifyChange();
  return entry;
}

export function deleteRun(scope: string, id: string): void {
  const next = loadRuns(scope).filter((r) => r.id !== id);
  window.localStorage.setItem(keyFor(scope), JSON.stringify(next));
  notifyChange();
}

export function clearRuns(scope: string): void {
  window.localStorage.removeItem(keyFor(scope));
  notifyChange();
}

/** "2m ago", "yesterday", or a locale date for anything older than a week. */
export function formatRelative(ts: number, now: number = Date.now()): string {
  const diff = now - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

/** Full timestamp for hover tooltips: "Mar 4, 2026, 9:42 AM". */
export function formatAbsolute(ts: number): string {
  return new Date(ts).toLocaleString();
}
