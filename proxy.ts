import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, decodeSession } from "@/lib/auth/token";

// Optimistic check only: pages and Server Actions verify the session again themselves.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = decodeSession(request.cookies.get(COOKIE)?.value);
  const home = !session ? "/login" : session.role === "admin" ? "/admin" : session.candidateId ? "/" : "/me";

  if (pathname === "/login") {
    return session ? NextResponse.redirect(new URL(home, request.url)) : NextResponse.next();
  }
  if (!session) return NextResponse.redirect(new URL("/login", request.url));
  if (pathname.startsWith("/admin") && session.role !== "admin") return NextResponse.redirect(new URL(home, request.url));
  if (session.role === "doctor" && !session.candidateId && pathname !== "/me") {
    return NextResponse.redirect(new URL("/me", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|icon.svg|robots.txt).*)"],
};
