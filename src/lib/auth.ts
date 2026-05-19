/**
 * Lightweight passcode gate.
 *
 * The app has one user (brendan). We do not need a real auth system, just a
 * "is this person carrying the right cookie" check.
 *
 * Design:
 *   - The user types a passcode at /login.
 *   - The server compares it to APP_PASSCODE (env var).
 *   - On success, we set an httpOnly cookie whose value is
 *     HMAC-SHA256(APP_PASSCODE, APP_SESSION_SECRET) hex-encoded. The raw
 *     passcode is never put in the cookie.
 *   - proxy.ts recomputes the same HMAC on every request and constant-time
 *     compares it with the cookie value.
 *
 * If APP_PASSCODE is unset (e.g. local dev), the gate is disabled — every
 * request passes through. This keeps the dev loop fast.
 *
 * Implementation note: runs in the Edge runtime, so we use Web Crypto
 * (crypto.subtle) instead of node:crypto.
 */

export const AUTH_COOKIE = "fde-auth";
export const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 60; // 60 days

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return hex(sig);
}

/**
 * Compute the value that a valid auth cookie should hold.
 * Returns null when the gate is disabled (no APP_PASSCODE set).
 */
export async function expectedAuthValue(): Promise<string | null> {
  const passcode = process.env.APP_PASSCODE;
  if (!passcode) return null;
  const secret = process.env.APP_SESSION_SECRET ?? passcode;
  return hmacSha256Hex(passcode, secret);
}

/**
 * Constant-time string compare. Returns false on length mismatch without
 * leaking timing info on the contents.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Verify a candidate passcode. Returns the cookie value to set on success,
 * or null on failure / disabled gate.
 */
export async function verifyPasscode(input: string): Promise<string | null> {
  const passcode = process.env.APP_PASSCODE;
  if (!passcode) return null;
  if (!timingSafeEqual(input, passcode)) return null;
  return await expectedAuthValue();
}
