import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

type Tone = "neutral" | "warm" | "danger" | "success";

const tones: Record<Tone, string> = {
  neutral: "bg-accent-soft text-accent",
  warm: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  danger: "bg-danger/10 text-danger",
  success: "bg-success/12 text-success",
};

/**
 * One friendly screen for anything that is not the happy path: an illustration,
 * what happened, what to do, and the button to do it. Written so that nothing
 * here can look like the app broke.
 */
export function StateCard({
  icon,
  tone = "neutral",
  title,
  children,
  actions,
  alert = false,
}: {
  icon: ReactNode;
  tone?: Tone;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  /** Use for errors that interrupt the user; polite status otherwise. */
  alert?: boolean;
}) {
  return (
    <section
      role={alert ? "alert" : "status"}
      className="anim-enter mx-auto my-auto flex w-full max-w-sm flex-col items-center py-6 text-center"
    >
      <div
        className={cx(
          "mb-7 grid size-24 place-items-center rounded-[2rem] ring-1 ring-line",
          tones[tone]
        )}
      >
        <span className="size-11">{icon}</span>
      </div>
      <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{title}</h2>
      {children && <p className="mt-3 text-base leading-relaxed text-muted text-balance">{children}</p>}
      {actions && <div className="mt-9 flex w-full flex-col gap-3">{actions}</div>}
    </section>
  );
}
