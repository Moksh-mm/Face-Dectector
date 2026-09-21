import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "@/components/brand";
import { cx } from "@/lib/cx";

/**
 * Chrome for the admin pages. Shares the app's typography, tokens and touch
 * targets, but stays plainly a tool: no hero, no gradients, no marketing. The
 * "Admin" badge on the logo makes it obvious this is not the public app.
 */
export function AdminShell({
  current,
  action,
  children,
}: {
  current?: "index" | "people";
  action?: ReactNode;
  children: ReactNode;
}) {
  const tab = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex min-h-11 items-center rounded-full px-4 text-sm font-medium transition-colors",
        active ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"
      )}
    >
      {label}
    </Link>
  );

  return (
    <>
      <header className="sticky top-0 z-30 bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex min-h-16 w-full max-w-5xl flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 sm:px-6">
          <Brand href="/admin" suffix="Admin" />
          <nav aria-label="Admin" className="flex items-center gap-1">
            {tab("/admin", "Index", current === "index")}
            {tab("/people", "People", current === "people")}
          </nav>
          {action && <div className="ml-auto">{action}</div>}
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-6 sm:px-6">
        {children}
      </main>
    </>
  );
}
