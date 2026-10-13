import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { identify } from "./actions";

export const metadata: Metadata = { title: "Who are you?" };

export default async function Me({ searchParams }: PageProps<"/me">) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role === "admin") redirect("/admin");
  const candidates = await prisma.candidate.findMany({ orderBy: { order: "asc" } });
  const pick = Number((await searchParams).pick);
  const picked = candidates.find((c) => c.order === pick);

  if (picked) {
    return (
      <div className="narrow">
        <h1>#{picked.order} {picked.name}</h1>
        <p className="muted">{picked.indexNo}</p>
        <form action={identify} className="form">
          <input type="hidden" name="candidateId" value={picked.id} />
          <button type="submit">Yes, this is me</button>
        </form>
        <p><Link href="/me">← Not you? Pick another name</Link></p>
      </div>
    );
  }
  return (
    <div className="narrow">
      <h1>Who are you?</h1>
      <p className="muted">Pick your name from the order-of-merit list.</p>
      <ul className="names">
        {candidates.map((c) => (
          <li key={c.id}>
            <Link href={`/me?pick=${c.order}`}>
              <span className="num order">#{c.order}</span>
              <span>{c.name}<small>{c.indexNo}</small></span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
