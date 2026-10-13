import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { COOKIE, decodeSession, encodeSession, type Role } from "./token";

const MAX_AGE: Record<Role, number> = { doctor: 30 * 86_400, admin: 12 * 3_600 };

export async function createSession(role: Role, who?: { candidateId: string }) {
  const exp = Date.now() + MAX_AGE[role] * 1000;
  (await cookies()).set(COOKIE, encodeSession({ role, exp, ...who }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE[role],
  });
}

export async function deleteSession() {
  (await cookies()).delete(COOKIE);
}

export const getSession = cache(async () => decodeSession((await cookies()).get(COOKIE)?.value));

/** Every page and Server Action calls one of these; the proxy is only a first, optimistic check. */
export async function requireAdmin() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role !== "admin") redirect("/");
  return s;
}

/** A doctor session that has picked a name. */
export const requireDoctor = cache(async () => {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role === "admin") redirect("/admin");
  if (!s.candidateId) redirect("/me");
  const candidate = await prisma.candidate.findUnique({ where: { id: s.candidateId } });
  if (!candidate) redirect("/me");
  return { session: s, candidate };
});

/** For actions that return a message instead of redirecting. */
export async function doctorOrNull() {
  const s = await getSession();
  if (!s || s.role !== "doctor" || !s.candidateId) return null;
  const candidate = await prisma.candidate.findUnique({ where: { id: s.candidateId } });
  return candidate;
}
