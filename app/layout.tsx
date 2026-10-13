import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Cormorant_Garamond, Open_Sans } from "next/font/google";
import { getSession } from "@/lib/auth/session";
import { logout } from "./login/actions";
import "./globals.css";

const cormorant = Cormorant_Garamond({ variable: "--font-cormorant", subsets: ["latin"], weight: ["400", "500", "600"] });
const openSans = Open_Sans({ variable: "--font-open-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "RadioMerit", template: "%s · RadioMerit" },
  description: "MD Radiology hospital allocation (unofficial)",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await getSession();
  const admin = session?.role === "admin";
  return (
    <html lang="en-GB" className={`${cormorant.variable} ${openSans.variable}`}>
      <body>
        <header className="site-header no-print">
          <Link href={admin ? "/admin" : "/"} className="site-title">RadioMerit</Link>
          {session && (
            <nav className="site-nav">
              {admin ? (
                <>
                  <Link href="/admin">Dashboard</Link>
                  <Link href="/admin/hospitals">Hospitals</Link>
                  <Link href="/admin/doctors">Doctors</Link>
                  <Link href="/admin/submissions">Submissions</Link>
                  <Link href="/admin/results">Results</Link>
                  <Link href="/admin/settings">Settings</Link>
                </>
              ) : (
                session.candidateId && (
                  <>
                    <Link href="/">My choices</Link>
                    <Link href="/results">Results</Link>
                  </>
                )
              )}
              <form action={logout}><button type="submit" className="link-button">Sign out</button></form>
            </nav>
          )}
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
