import Link from "next/link";

/** A viewfinder with a dot in the middle: "finding a face". */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" className={className}>
      <defs>
        <linearGradient id="logo-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4f46e5" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#logo-gradient)" />
      <path
        d="M19 27v-5a3 3 0 0 1 3-3h5M37 19h5a3 3 0 0 1 3 3v5M45 37v5a3 3 0 0 1-3 3h-5M27 45h-5a3 3 0 0 1-3-3v-5"
        fill="none"
        stroke="#fff"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="32" r="5.5" fill="#fff" />
    </svg>
  );
}

/** The whole identity: a mark and a two-word name. Deliberately simple. */
export function Brand({ href = "/scan", suffix }: { href?: string; suffix?: string }) {
  return (
    <Link
      href={href}
      className="-ml-1 flex min-h-11 items-center gap-2.5 rounded-xl px-1 font-semibold tracking-tight"
    >
      <LogoMark className="size-8 shrink-0" />
      <span className="text-[1.05rem]">Face Finder</span>
      {suffix && (
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">
          {suffix}
        </span>
      )}
    </Link>
  );
}
