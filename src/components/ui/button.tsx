import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex select-none items-center justify-center gap-2 rounded-full font-medium " +
  "transition-[transform,filter,background-color,color,opacity] duration-200 " +
  "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  // The one loud button on a screen.
  primary: "bg-cta text-white shadow-glow hover:brightness-110",
  secondary: "bg-surface-2 text-foreground hover:bg-line",
  ghost: "text-muted hover:bg-surface-2 hover:text-foreground",
};

// Every size is at least 44px tall: the minimum comfortable touch target.
const sizes: Record<Size, string> = {
  sm: "min-h-11 px-4 text-sm",
  md: "min-h-12 px-6 text-base",
  lg: "min-h-14 px-8 text-lg",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cx(base, variants[variant], sizes[size], extra);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  href,
  variant,
  size,
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}
