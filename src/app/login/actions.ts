"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, COOKIE_MAX_AGE_SECONDS, verifyPasscode } from "@/lib/auth";

export async function submitPasscode(formData: FormData) {
  const passcode = String(formData.get("passcode") ?? "");
  const from = String(formData.get("from") ?? "/topics");

  const cookieValue = await verifyPasscode(passcode);
  if (!cookieValue) {
    redirect(`/login?from=${encodeURIComponent(from)}&error=1`);
  }

  const jar = await cookies();
  jar.set(AUTH_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });

  redirect(from.startsWith("/") ? from : "/topics");
}
