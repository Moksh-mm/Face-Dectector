import type { CSSProperties } from "react";

/**
 * The landing illustration: a viewfinder in the middle of a drifting sea of
 * photos. Pure markup and CSS (no images, no JavaScript), so it adds nothing to
 * load time. The motion is slow and small, and stops entirely for people who
 * ask for reduced motion.
 */

/** A photo, suggested rather than drawn: a sun and two hills. */
export function PhotoGlyph() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className="absolute inset-0 size-full text-white/55">
      <circle cx="28" cy="12" r="4" fill="currentColor" />
      <path d="M0 40V29l11-9 9 8 7-5 13 10v7z" fill="currentColor" opacity="0.8" />
    </svg>
  );
}

type Card = {
  position: string;
  size: string;
  gradient: string;
  tilt: string;
  delay: string;
  duration: string;
};

// Positions are percentages of the illustration, so it scales with the screen.
const CARDS: Card[] = [
  { position: "left-[3%] top-[5%]", size: "w-[29%] aspect-[3/4]", gradient: "from-rose-300 to-orange-300", tilt: "-8deg", delay: "0s", duration: "7.5s" },
  { position: "right-[1%] top-[0%]", size: "w-[33%] aspect-[4/5]", gradient: "from-sky-300 to-indigo-400", tilt: "7deg", delay: "-2.2s", duration: "8.5s" },
  { position: "left-[0%] top-[41%]", size: "w-[27%] aspect-square", gradient: "from-emerald-300 to-teal-400", tilt: "5deg", delay: "-4s", duration: "9s" },
  { position: "right-[0%] top-[44%]", size: "w-[29%] aspect-[3/4]", gradient: "from-amber-300 to-pink-400", tilt: "-6deg", delay: "-1.4s", duration: "8s" },
  { position: "left-[13%] bottom-[1%]", size: "w-[27%] aspect-[4/3]", gradient: "from-violet-300 to-fuchsia-400", tilt: "-4deg", delay: "-5.2s", duration: "9.5s" },
  { position: "right-[15%] bottom-[0%]", size: "w-[24%] aspect-square", gradient: "from-cyan-300 to-blue-400", tilt: "6deg", delay: "-3s", duration: "7s" },
];

/** Four corner brackets: the visual shorthand for "looking at this". */
export function FrameCorners({ className = "" }: { className?: string }) {
  const corner = "absolute size-6 border-accent";
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 ${className}`}>
      <span className={`${corner} left-0 top-0 rounded-tl-xl border-l-[3px] border-t-[3px]`} />
      <span className={`${corner} right-0 top-0 rounded-tr-xl border-r-[3px] border-t-[3px]`} />
      <span className={`${corner} bottom-0 left-0 rounded-bl-xl border-b-[3px] border-l-[3px]`} />
      <span className={`${corner} bottom-0 right-0 rounded-br-xl border-b-[3px] border-r-[3px]`} />
    </div>
  );
}

export function HeroVisual() {
  return (
    <div
      aria-hidden="true"
      className="relative mx-auto aspect-[6/7] w-full max-w-[21rem] [mask-image:radial-gradient(ellipse_at_center,black_50%,transparent_98%)]"
    >
      {CARDS.map((card, i) => (
        <div
          key={i}
          className={`anim-float absolute ${card.position} ${card.size} overflow-hidden rounded-2xl bg-gradient-to-br ${card.gradient} shadow-soft ring-1 ring-white/30`}
          style={
            {
              "--tilt": card.tilt,
              animationDelay: card.delay,
              animationDuration: card.duration,
            } as CSSProperties
          }
        >
          <PhotoGlyph />
        </div>
      ))}

      {/* A soft glow so the frame reads as the subject. */}
      <div className="absolute left-1/2 top-1/2 aspect-[3/4] w-[50%] -translate-x-1/2 -translate-y-1/2 rounded-[2.5rem] bg-cta opacity-25 blur-2xl" />

      <div className="absolute left-1/2 top-1/2 aspect-[3/4] w-[46%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[2rem] bg-surface p-3 shadow-lift ring-1 ring-line">
        <div className="relative size-full">
          <FrameCorners />
          {/* A face, reduced to what a scanner would see. */}
          <svg viewBox="0 0 60 80" className="absolute inset-0 m-auto h-[62%] text-accent" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="30" cy="34" rx="15" ry="19" />
            <path d="M23 32v2M37 32v2M26 44c1.2 1.3 2.6 2 4 2s2.8-.7 4-2" />
            <path d="M8 76c1.5-11 10-16 22-16s20.5 5 22 16" opacity="0.55" />
          </svg>
          <div className="anim-scan absolute inset-x-1 top-0 h-[3px] rounded-full bg-gradient-to-r from-transparent via-accent to-transparent shadow-[0_0_14px_var(--accent)]" />
        </div>
      </div>
    </div>
  );
}
