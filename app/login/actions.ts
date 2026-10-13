"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { roleForPassword } from "@/lib/auth/passwords";
import { clearFailures, lockedFor, recordFailure } from "@/lib/auth/rate-limit";
import { createSession, deleteSession } from "@/lib/auth/session";

export type LoginState = { error?: string };

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const ip = await clientIp();
  const locked = lockedFor(ip);
  if (locked) return { error: `Too many attempts. Try again in ${locked} minute${locked === 1 ? "" : "s"}.` };

  const role = roleForPassword(String(formData.get("password") ?? ""));
  if (!role) {
    recordFailure(ip);
    await new Promise((r) => setTimeout(r, 400));
    return { error: "Wrong password." };
  }
  clearFailures(ip);
  await createSession(role);
  redirect(role === "admin" ? "/admin" : "/me");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
