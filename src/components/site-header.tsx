import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "@/components/brand";
import { cx } from "@/lib/cx";

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex min-h-11 items-center rounded-full px-4 text-sm font-medium transition-colors",
        active ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"
      )}
    >
      {children}
    </Link>
  );
}

/**
 * Public navigation, kept to the two things a visitor can do. "My Photos" only
 * appears once there is something to show. Nothing here points at admin pages.
 */
export function SiteHeader({
  current,
  hasPhotos = false,
}: {
  current?: "scan" | "photos";
  hasPhotos?: boolean;
}) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-soft"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Brand />
          {/* Two destinations or none: a lone link would just look like a stray button. */}
          {hasPhotos && (
            <nav aria-label="Main" className="flex items-center gap-1">
              <NavLink href="/scan" active={current === "scan"}>
                Scan
              </NavLink>
              <NavLink href="/photos" active={current === "photos"}>
                My Photos
              </NavLink>
            </nav>
          )}
        </div>
      </header>
    </>
  );
}
