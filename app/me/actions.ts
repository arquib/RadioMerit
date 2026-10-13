"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, getSession } from "@/lib/auth/session";

/** Pick your name from the merit list. The shared doctor password is the only check. */
export async function identify(fd: FormData) {
  const s = await getSession();
  if (!s || s.role !== "doctor") redirect("/login");
  const candidate = await prisma.candidate.findUnique({ where: { id: String(fd.get("candidateId") ?? "") } });
  if (!candidate) redirect("/me");
  await createSession("doctor", { candidateId: candidate.id });
  redirect("/");
}

export async function switchName() {
  const s = await getSession();
  if (!s || s.role !== "doctor") redirect("/login");
  await createSession("doctor");
  redirect("/me");
}
