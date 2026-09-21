import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-auth";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * /people lists everyone in the library, so it is admin-only. This redirect is
 * the friendly part; the data itself is protected where it is served (the
 * /api/immich routes and the person page each check on their own), because a
 * layout is not re-run when the browser navigates between its pages.
 */
export default async function PeopleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isAdmin())) redirect("/admin");
  return children;
}
