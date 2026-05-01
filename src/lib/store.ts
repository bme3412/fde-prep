import fs from "node:fs";
import path from "node:path";
import { type AppState, AppStateSchema } from "./types";
import { seedState } from "./seed";

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");

/** In-memory cache — survives within a single serverless invocation. */
let cachedState: AppState | null = null;

function isWritableFs(): boolean {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    // Quick write test
    const testFile = path.join(DATA_DIR, ".write-test");
    fs.writeFileSync(testFile, "", "utf-8");
    fs.unlinkSync(testFile);
    return true;
  } catch {
    return false;
  }
}

function writeState(state: AppState): void {
  cachedState = state;
  if (isWritableFs()) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  }
}

/** Read and parse the state, falling back to in-memory seed on read-only filesystems. */
export function getState(): AppState {
  if (cachedState) return cachedState;

  // Try reading the committed state.json
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
      cachedState = AppStateSchema.parse(raw);
      return cachedState;
    }
  } catch {
    // Fall through to seed
  }

  // Seed in memory (and persist to disk if possible)
  const initial = seedState();
  writeState(initial);
  return initial;
}

/** Apply a mutation to the state (persisted to disk when possible, always in memory). */
export function mutateState(fn: (state: AppState) => AppState): AppState {
  const current = getState();
  const next = fn(current);
  writeState(next);
  return next;
}
