import fs from "node:fs";
import path from "node:path";
import { type AppState, AppStateSchema } from "./types";
import { seedState } from "./seed";

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function writeState(state: AppState): void {
  ensureDataDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

/** Read and parse the state file, seeding on first run. */
export function getState(): AppState {
  ensureDataDir();
  if (!fs.existsSync(STATE_FILE)) {
    const initial = seedState();
    writeState(initial);
    return initial;
  }
  const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  return AppStateSchema.parse(raw);
}

/** Apply a mutation to the state file. */
export function mutateState(fn: (state: AppState) => AppState): AppState {
  const current = getState();
  const next = fn(current);
  writeState(next);
  return next;
}
