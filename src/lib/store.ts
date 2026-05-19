import fs from "node:fs";
import path from "node:path";
import { Redis } from "@upstash/redis";
import { type AppState, AppStateSchema } from "./types";
import { seedState } from "./seed";

/*
 * State persistence strategy
 * --------------------------
 * The whole app state is one JSON blob (~50–100KB). We store it under a single
 * key in Upstash Redis so browser + phone see the same data.
 *
 * If Upstash env vars are absent (e.g. local dev without provisioning), we fall
 * back to a filesystem JSON file. That keeps the dev loop fast and offline.
 *
 * State is small, mutations are infrequent, and there is only one user → no
 * locking. Read-modify-write is fine.
 */

const KV_KEY = "fde-prep:state";
const DATA_DIR = path.join(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");

const hasUpstash =
  !!process.env.UPSTASH_REDIS_REST_URL &&
  !!process.env.UPSTASH_REDIS_REST_TOKEN;

const redis: Redis | null = hasUpstash ? Redis.fromEnv() : null;

/** In-memory cache per serverless invocation. */
let cachedState: AppState | null = null;

function isWritableFs(): boolean {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const testFile = path.join(DATA_DIR, ".write-test");
    fs.writeFileSync(testFile, "", "utf-8");
    fs.unlinkSync(testFile);
    return true;
  } catch {
    return false;
  }
}

/**
 * Merge any newly-added seed entries (topics, practiceReps) into an existing
 * persisted state. Preserves user-edited fields on entries that already exist;
 * appends new entries from the seed.
 */
function mergeNewSeedEntries(existing: AppState): AppState {
  const seed = seedState();
  const existingTopicIds = new Set(existing.topics.map((t) => t.id));
  const newTopics = seed.topics.filter((t) => !existingTopicIds.has(t.id));

  const existingRepIds = new Set(existing.practiceReps.map((r) => r.id));
  const newReps = seed.practiceReps.filter((r) => !existingRepIds.has(r.id));

  if (newTopics.length === 0 && newReps.length === 0) return existing;

  return {
    ...existing,
    topics: [...existing.topics, ...newTopics],
    practiceReps: [...existing.practiceReps, ...newReps],
  };
}

async function readBackend(): Promise<AppState | null> {
  if (redis) {
    const raw = await redis.get<AppState>(KV_KEY);
    return raw ? AppStateSchema.parse(raw) : null;
  }
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
      return AppStateSchema.parse(raw);
    }
  } catch {
    /* fall through */
  }
  return null;
}

async function writeBackend(state: AppState): Promise<void> {
  cachedState = state;
  if (redis) {
    await redis.set(KV_KEY, state);
    return;
  }
  if (isWritableFs()) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  }
}

/**
 * One-shot migration. If KV is empty but a local data/state.json exists,
 * import it before seeding from scratch. Runs at most once per cold start
 * since after migration the KV key is populated.
 */
function readLocalJsonIfAny(): AppState | null {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
    return AppStateSchema.parse(raw);
  } catch {
    return null;
  }
}

/** Read and parse the state, seeding on first read. */
export async function getState(): Promise<AppState> {
  if (cachedState) return cachedState;

  const stored = await readBackend();
  if (stored) {
    const merged = mergeNewSeedEntries(stored);
    if (merged !== stored) await writeBackend(merged);
    else cachedState = stored;
    return merged;
  }

  // Migration path: KV is empty but local JSON exists → import it once.
  if (redis) {
    const local = readLocalJsonIfAny();
    if (local) {
      const merged = mergeNewSeedEntries(local);
      await writeBackend(merged);
      return merged;
    }
  }

  const initial = seedState();
  await writeBackend(initial);
  return initial;
}

/** Apply a mutation to the state. */
export async function mutateState(
  fn: (state: AppState) => AppState,
): Promise<AppState> {
  const current = await getState();
  const next = fn(current);
  await writeBackend(next);
  return next;
}
