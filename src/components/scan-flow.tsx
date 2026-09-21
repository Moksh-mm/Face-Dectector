"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CameraCapture } from "@/components/camera-capture";
import { FrameCorners, HeroVisual, PhotoGlyph } from "@/components/hero-visual";
import {
  AlertIcon,
  ArrowRightIcon,
  BoltIcon,
  CameraIcon,
  CheckIcon,
  FaceScanIcon,
  ShieldIcon,
  SearchOffIcon,
  SparkIcon,
  UsersIcon,
} from "@/components/icons";
import { PersonAvatar } from "@/components/person-avatar";
import { SiteHeader } from "@/components/site-header";
import { StateCard } from "@/components/state-card";
import { Button } from "@/components/ui/button";
import { ApiError, postForm, postJson } from "@/lib/api-client";
import type { PublicPerson } from "@/lib/immich";
import type { PublicCandidate, ScanResult } from "@/lib/scan-types";

type ProblemKind = "no_match" | "no_face" | "multiple_faces" | "error";

type Phase =
  | { name: "intro" }
  | { name: "camera" }
  | { name: "review"; photo: Blob }
  | { name: "recognizing"; photo: Blob }
  | { name: "matched"; person: PublicPerson }
  | { name: "choose"; candidates: PublicCandidate[] }
  | { name: "problem"; kind: ProblemKind; message?: string };

/** Consumer wording for our API's error codes. Never shows server details. */
function friendlyError(error: unknown) {
  const code = error instanceof ApiError ? error.code : undefined;

  switch (code) {
    case "network":
      return "We couldn't reach the server. Check your connection and try again.";
    case "invalid_image":
    case "unsupported_image":
    case "too_large":
    case "invalid_request":
      return "We couldn't use that photo. Please take it again.";
    case "session_required":
      return "That took too long. Please scan again.";
    case "rate_limited":
      return "You're scanning a little too quickly. Please wait a moment and try again.";
    case "service_unavailable":
      return "Face matching isn't available right now. Please try again in a moment.";
    default:
      return "Something went wrong on our side. Please try again.";
  }
}

const photosFound = (count: number | null) =>
  count === null ? "Your photos are ready" : `${count} ${count === 1 ? "photo" : "photos"} found`;

/** The captured photo in a viewfinder frame, mirrored like the live view. Memory only. */
function PhotoFrame({ photo, scanning = false }: { photo: Blob; scanning?: boolean }) {
  // A data URL, not an object URL: there is nothing to revoke afterwards.
  const [src, setSrc] = useState<string>();

  useEffect(() => {
    const reader = new FileReader();
    reader.onload = () => setSrc(String(reader.result));
    reader.readAsDataURL(photo);
    return () => reader.abort();
  }, [photo]);

  return (
    <div className="relative aspect-[3/4] w-full max-w-sm overflow-hidden rounded-[2rem] bg-neutral-900 shadow-lift ring-1 ring-line">
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="Your photo" className="anim-fade size-full scale-x-[-1] object-cover" />
      )}

      {scanning && (
        <>
          <div className="absolute inset-0 bg-gradient-to-b from-accent/25 via-transparent to-accent/25" />
          <div className="anim-pulse-ring absolute inset-0 rounded-[2rem] ring-2 ring-white/50" />
          <div className="absolute inset-6">
            <FrameCorners />
            <div className="anim-scan absolute inset-x-0 h-[3px] rounded-full bg-gradient-to-r from-transparent via-white to-transparent shadow-[0_0_18px_rgba(255,255,255,0.9)]" />
          </div>
        </>
      )}
    </div>
  );
}

/** Three photos surfacing one after another: "we're going through your photos". */
function CascadeCards() {
  const cards = [
    "from-rose-300 to-orange-300",
    "from-sky-300 to-indigo-400",
    "from-emerald-300 to-teal-400",
  ];
  return (
    <div aria-hidden="true" className="flex items-end gap-3">
      {cards.map((gradient, i) => (
        <div
          key={gradient}
          className={`anim-cascade relative aspect-[3/4] w-12 overflow-hidden rounded-xl bg-gradient-to-br ${gradient} shadow-soft ring-1 ring-white/30`}
          style={{ animationDelay: `${i * 0.35}s` }}
        >
          <PhotoGlyph />
        </div>
      ))}
    </div>
  );
}

const trust = [
  { icon: BoltIcon, label: "Fast" },
  { icon: ShieldIcon, label: "Private" },
  { icon: SparkIcon, label: "Simple" },
];

export function ScanFlow({
  expired = false,
  hasSession = false,
}: {
  expired?: boolean;
  hasSession?: boolean;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ name: "intro" });
  const [opening, setOpening] = useState(false);
  const [hasPhotos, setHasPhotos] = useState(hasSession);

  const toCamera = () => setPhase({ name: "camera" });

  /** "Not you?": end the session on the server too, then scan again. */
  async function scanAgain() {
    await fetch("/api/scan/logout", { method: "POST" }).catch(() => {});
    setHasPhotos(false);
    toCamera();
  }

  async function recognize(photo: Blob) {
    setPhase({ name: "recognizing", photo });

    try {
      const form = new FormData();
      form.append("image", photo, "selfie.jpg");
      const result = await postForm<ScanResult>("/api/recognize", form);

      if (result.status === "matched") {
        setHasPhotos(true);
        setPhase({ name: "matched", person: result.person });
      } else if (result.status === "ambiguous") {
        setPhase({ name: "choose", candidates: result.candidates });
      } else {
        setPhase({ name: "problem", kind: result.status });
      }
    } catch (error) {
      setPhase({ name: "problem", kind: "error", message: friendlyError(error) });
    }
  }

  async function choose(candidate: PublicCandidate) {
    setOpening(true);
    try {
      await postJson("/api/scan/select", { token: candidate.token });
      router.push("/photos");
    } catch (error) {
      setOpening(false);
      setPhase({ name: "problem", kind: "error", message: friendlyError(error) });
    }
  }

  return (
    <>
      <SiteHeader current="scan" hasPhotos={hasPhotos} />

      <main
        id="main"
        className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center px-5 pb-10 pt-2 sm:pt-6"
      >
        {phase.name !== "intro" && <h1 className="sr-only">Scan your face to find your photos</h1>}

        {phase.name === "intro" && (
          <section className="anim-enter flex w-full flex-1 flex-col items-center justify-center pb-6 text-center">
            {expired && (
              <p
                role="status"
                className="mb-6 flex items-center gap-2 rounded-full bg-surface-2 px-4 py-2.5 text-sm font-medium"
              >
                <AlertIcon className="size-4 text-muted" />
                Your session has ended. Scan again to see your photos.
              </p>
            )}

            <HeroVisual />

            <h1 className="mt-6 text-[2.6rem] font-semibold leading-[1.05] tracking-tight text-balance sm:text-6xl">
              Find Your <span className="text-gradient">Photos</span>
            </h1>
            <p className="mt-5 max-w-sm text-lg leading-relaxed text-muted text-balance sm:text-xl">
              Scan your face and instantly discover every photo you&apos;re in.
            </p>

            <Button size="lg" className="mt-9 w-full max-w-xs" onClick={toCamera}>
              <CameraIcon className="size-5" />
              Scan My Face
            </Button>

            <ul className="mt-7 flex items-center gap-x-5 text-sm font-medium text-muted">
              {trust.map(({ icon: Icon, label }, i) => (
                <li key={label} className="flex items-center gap-1.5">
                  {i > 0 && <span aria-hidden="true" className="-ml-2.5 mr-2.5 text-line">•</span>}
                  <Icon className="size-4" />
                  {label}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted">Your photo isn&apos;t saved.</p>
          </section>
        )}

        {phase.name === "camera" && (
          <CameraCapture onCapture={(photo) => setPhase({ name: "review", photo })} />
        )}

        {phase.name === "review" && (
          <section className="anim-enter flex w-full flex-col items-center gap-7">
            <PhotoFrame photo={phase.photo} />
            <div className="flex w-full max-w-sm flex-col gap-3">
              <Button size="lg" onClick={() => recognize(phase.photo)}>
                <CheckIcon className="size-5" />
                Use This Photo
              </Button>
              <Button variant="secondary" size="lg" onClick={toCamera}>
                Retake
              </Button>
            </div>
          </section>
        )}

        {phase.name === "recognizing" && (
          <section
            role="status"
            aria-live="polite"
            className="anim-enter flex w-full flex-col items-center gap-8"
          >
            <PhotoFrame photo={phase.photo} scanning />
            <div className="text-center">
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Finding your photos...
              </h2>
              <p className="mt-2 text-base text-muted">Scanning your photo collection</p>
            </div>
            <CascadeCards />
          </section>
        )}

        {phase.name === "matched" && (
          <section
            role="status"
            className="anim-enter mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center pb-8 text-center"
          >
            <div className="relative">
              {/* The visitor's own face crop: session-scoped, no id in the URL. */}
              <div className="rounded-full bg-cta p-1 shadow-glow">
                <PersonAvatar
                  src="/api/photos/avatar"
                  name={phase.person.name ?? ""}
                  size={288}
                  className="size-36 ring-4 ring-background"
                />
              </div>
              <span className="anim-pop absolute -bottom-1 -right-1 grid size-12 place-items-center rounded-full bg-success text-white ring-4 ring-background">
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="size-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path className="anim-draw" pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </span>
            </div>

            <h2 className="mt-9 text-4xl font-semibold tracking-tight">We found you!</h2>
            {phase.person.name && (
              <p className="mt-3 text-2xl font-medium text-balance">{phase.person.name}</p>
            )}
            <p className="mt-2 text-lg text-muted">{photosFound(phase.person.photoCount)}</p>

            <div className="mt-10 flex w-full flex-col gap-3">
              <Button size="lg" onClick={() => router.push("/photos")}>
                View My Photos
                <ArrowRightIcon className="size-5" />
              </Button>
              <Button variant="ghost" onClick={scanAgain}>
                Not you? Scan again
              </Button>
            </div>
          </section>
        )}

        {phase.name === "choose" && (
          <section className="anim-enter mx-auto w-full max-w-md pt-2 text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              We found a few possible matches
            </h2>
            <p className="mt-3 text-lg text-muted">Which one are you?</p>

            <ul className="mt-9 grid grid-cols-2 gap-4">
              {phase.candidates.map((candidate, i) => (
                <li key={candidate.token}>
                  <button
                    type="button"
                    onClick={() => choose(candidate)}
                    disabled={opening}
                    className="group flex w-full flex-col items-center gap-3 rounded-[1.75rem] bg-surface p-3 pb-5 text-center shadow-soft ring-1 ring-line transition duration-200 hover:shadow-lift active:scale-[0.97] disabled:opacity-60"
                  >
                    <PersonAvatar
                      src={candidate.avatar}
                      name={candidate.name ?? `Match ${i + 1}`}
                      size={320}
                      shape="rounded"
                      className="w-full"
                    />
                    <span className="min-w-0 max-w-full">
                      <span className="line-clamp-2 break-words text-lg font-semibold leading-snug">
                        {candidate.name ?? `Person ${i + 1}`}
                      </span>
                      <span className="block text-sm text-muted">
                        {photosFound(candidate.photoCount)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <Button variant="ghost" className="mt-6" onClick={toCamera}>
              None of these? Scan again
            </Button>
          </section>
        )}

        {phase.name === "problem" && phase.kind === "no_match" && (
          <StateCard
            icon={<SearchOffIcon className="size-full" />}
            title="We couldn't find you"
            actions={
              <Button size="lg" onClick={toCamera}>
                Scan Again
              </Button>
            }
          >
            Try another photo with your face clearly visible.
          </StateCard>
        )}

        {phase.name === "problem" && phase.kind === "no_face" && (
          <StateCard
            icon={<FaceScanIcon className="size-full" />}
            title="We couldn't see a face"
            actions={
              <Button size="lg" onClick={toCamera}>
                Try Again
              </Button>
            }
          >
            Move closer and make sure your face is clearly visible.
          </StateCard>
        )}

        {phase.name === "problem" && phase.kind === "multiple_faces" && (
          <StateCard
            icon={<UsersIcon className="size-full" />}
            title="Just one face at a time"
            actions={
              <Button size="lg" onClick={toCamera}>
                Try Again
              </Button>
            }
          >
            Make sure you&apos;re the only person inside the frame.
          </StateCard>
        )}

        {phase.name === "problem" && phase.kind === "error" && (
          <StateCard
            alert
            tone="warm"
            icon={<AlertIcon className="size-full" />}
            title="Something didn't work"
            actions={
              <Button size="lg" onClick={toCamera}>
                Try Again
              </Button>
            }
          >
            {phase.message}
          </StateCard>
        )}
      </main>
    </>
  );
}
