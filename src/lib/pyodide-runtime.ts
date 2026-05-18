"use client";

/**
 * Lazy, singleton Pyodide loader for in-browser Python execution.
 *
 * Pyodide is large (~10MB). We never import it on initial page load — the
 * runtime is fetched from jsDelivr the first time a learner clicks "Run code"
 * on a CodePredict block, then cached as a module-level promise so all
 * subsequent runs reuse the same interpreter.
 *
 * A pedagogical mock of the `anthropic` SDK is registered into Pyodide's
 * filesystem during init so that tool-use snippets in the study guide can
 * execute end-to-end without an API key. See `pyodide-mock-anthropic.py.ts`.
 */

import { MOCK_ANTHROPIC_PY } from "./pyodide-mock-anthropic";

const PYODIDE_VERSION = "0.27.0";
const PYODIDE_INDEX = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const PYODIDE_SCRIPT = `${PYODIDE_INDEX}pyodide.js`;
const LOAD_TIMEOUT_MS = 30_000;

// Pyodide's API surface is intentionally typed loosely here. The official
// types live in `pyodide` on npm, which we are not bundling.
type PyodideAPI = {
  runPythonAsync: (code: string) => Promise<unknown>;
  loadPackagesFromImports: (code: string) => Promise<void>;
  FS: {
    mkdirTree: (path: string) => void;
    writeFile: (path: string, data: string) => void;
  };
};

declare global {
  interface Window {
    loadPyodide?: (opts: { indexURL: string }) => Promise<PyodideAPI>;
  }
}

let pyodidePromise: Promise<PyodideAPI> | null = null;

function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(
      `script[data-pyodide-loader="${src}"]`,
    );
    if (existing) {
      // Already injected — assume it's loaded (or will be soon).
      if (window.loadPyodide) return resolve();
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Pyodide script failed to load")),
      );
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.pyodideLoader = src;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Pyodide script failed to load from CDN"));
    document.head.appendChild(script);
  });
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}

export function getPyodide(): Promise<PyodideAPI> {
  if (pyodidePromise) return pyodidePromise;
  pyodidePromise = (async () => {
    if (typeof window === "undefined") {
      throw new Error("Pyodide can only run in the browser");
    }
    if (!window.loadPyodide) {
      await withTimeout(
        loadScriptOnce(PYODIDE_SCRIPT),
        LOAD_TIMEOUT_MS,
        "Loading Pyodide loader",
      );
    }
    if (!window.loadPyodide) {
      throw new Error("Pyodide loader did not register `loadPyodide`");
    }
    const pyodide = await withTimeout(
      window.loadPyodide({ indexURL: PYODIDE_INDEX }),
      LOAD_TIMEOUT_MS,
      "Initializing Pyodide runtime",
    );

    // Install the mock `anthropic` module on the Python path.
    pyodide.FS.mkdirTree("/home/pyodide/site-packages");
    pyodide.FS.writeFile(
      "/home/pyodide/site-packages/anthropic.py",
      MOCK_ANTHROPIC_PY,
    );
    await pyodide.runPythonAsync(`
import sys
if "/home/pyodide/site-packages" not in sys.path:
    sys.path.insert(0, "/home/pyodide/site-packages")
`);

    return pyodide;
  })().catch((err) => {
    // Clear the cache on failure so the next click can retry.
    pyodidePromise = null;
    throw err;
  });
  return pyodidePromise;
}

export type RunResult = {
  stdout: string;
  stderr: string;
  error: string | null;
};

export async function runPython(code: string): Promise<RunResult> {
  const pyodide = await getPyodide();
  // Reset stdout/stderr capture buffers before each run.
  await pyodide.runPythonAsync(`
import sys, io
sys.stdout = io.StringIO()
sys.stderr = io.StringIO()
`);
  let error: string | null = null;
  try {
    // Auto-fetch any imported packages bundled with Pyodide (pandas, numpy,
    // matplotlib, etc.). No-op for stdlib-only snippets. Best-effort: if a
    // package isn't in Pyodide's index, the import below raises with a clearer
    // error than this loader would.
    try {
      await pyodide.loadPackagesFromImports(code);
    } catch {
      // Swallow — let the actual import statement produce the user-facing error.
    }
    await pyodide.runPythonAsync(code);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const stdout = String(
    (await pyodide.runPythonAsync(`sys.stdout.getvalue()`)) ?? "",
  );
  const stderr = String(
    (await pyodide.runPythonAsync(`sys.stderr.getvalue()`)) ?? "",
  );
  return { stdout, stderr, error };
}

/** True if the runtime has already been loaded (cheap check, no network). */
export function isPyodideLoaded(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.loadPyodide &&
    pyodidePromise !== null
  );
}
