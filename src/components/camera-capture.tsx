"use client";

import { useEffect, useRef, useState } from "react";
import { CameraIcon, CameraOffIcon, FaceScanIcon } from "@/components/icons";
import { StateCard } from "@/components/state-card";
import { Button } from "@/components/ui/button";
import { captureVideoFrame, fileToJpeg } from "@/lib/image-capture";

type Problem =
  | "denied"
  | "insecure"
  | "no-camera"
  | "busy"
  | "unsupported"
  | "failed";

type Status =
  | { name: "starting" }
  | { name: "live" }
  | { name: "unavailable"; problem: Problem };

const PROBLEMS: Record<Problem, { title: string; text: string; retry: boolean }> = {
  denied: {
    title: "Camera access is needed",
    text: "Allow camera access in your browser settings to scan your face.",
    retry: true,
  },
  insecure: {
    title: "Live camera isn't available here",
    text: "Browsers only allow a live camera on secure (HTTPS) pages. You can still take a photo with your camera app.",
    retry: false,
  },
  "no-camera": {
    title: "We couldn't find a camera",
    text: "There doesn't seem to be a camera on this device. You can choose a photo instead.",
    retry: true,
  },
  busy: {
    title: "Your camera is busy",
    text: "Close any other app or tab that's using the camera, then try again.",
    retry: true,
  },
  unsupported: {
    title: "Live camera isn't supported",
    text: "This browser can't open the camera. You can take a photo with your camera app instead.",
    retry: false,
  },
  failed: {
    title: "The camera didn't start",
    text: "Something went wrong opening the camera. Try again, or take a photo with your camera app.",
    retry: true,
  },
};

class CameraProblem extends Error {
  constructor(public readonly problem: Problem) {
    super(problem);
  }
}

/** Asks for the front camera, turning the browser's errors into our own. */
async function openFrontCamera(): Promise<MediaStream> {
  // getUserMedia only exists on HTTPS pages and on localhost.
  if (!window.isSecureContext) throw new CameraProblem("insecure");
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraProblem("unsupported");
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      // "ideal", not "exact": a laptop with only a back-facing or single
      // webcam should still work.
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
  } catch (error) {
    const name = (error as DOMException)?.name;
    if (name === "NotAllowedError" || name === "SecurityError") {
      throw new CameraProblem("denied");
    }
    if (name === "NotFoundError" || name === "OverconstrainedError") {
      throw new CameraProblem("no-camera");
    }
    if (name === "NotReadableError" || name === "AbortError") {
      throw new CameraProblem("busy");
    }
    throw new CameraProblem("failed");
  }
}

/**
 * Live front-camera preview with a face guide. Calls onCapture once, when the
 * user presses the shutter: no frames are uploaded continuously. The camera is
 * released as soon as this component unmounts.
 */
export function CameraCapture({ onCapture }: { onCapture: (photo: Blob) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ name: "starting" });
  const [attempt, setAttempt] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [fileProblem, setFileProblem] = useState("");

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;

    openFrontCamera()
      .then(async (opened) => {
        if (cancelled) {
          opened.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = opened;

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = opened;
        await video.play();
        if (!cancelled) setStatus({ name: "live" });
      })
      .catch((error) => {
        if (cancelled) return;
        setStatus({
          name: "unavailable",
          problem: error instanceof CameraProblem ? error.problem : "failed",
        });
      });

    return () => {
      cancelled = true;
      // Turns the camera light off.
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [attempt]);

  function retry() {
    setStatus({ name: "starting" });
    setAttempt((n) => n + 1);
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || capturing) return;
    setCapturing(true);

    try {
      onCapture(await captureVideoFrame(video));
    } catch {
      setStatus({ name: "unavailable", problem: "failed" });
    } finally {
      setCapturing(false);
    }
  }

  async function usePickedFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // so picking the same photo again still fires
    if (!file) return;

    setFileProblem("");
    setCapturing(true);
    try {
      onCapture(await fileToJpeg(file));
    } catch {
      setFileProblem("We couldn't read that photo. Try a different one.");
    } finally {
      setCapturing(false);
    }
  }

  const live = status.name === "live";
  const problem = status.name === "unavailable" ? PROBLEMS[status.problem] : null;
  const openPicker = () => fileRef.current?.click();

  return (
    <div className="anim-enter flex w-full flex-1 flex-col items-center gap-5">
      {problem ? (
        <StateCard
          alert
          tone="warm"
          icon={<CameraOffIcon className="size-full" />}
          title={problem.title}
          actions={
            <>
              {problem.retry && (
                <Button size="lg" onClick={retry}>
                  Try Again
                </Button>
              )}
              <Button
                size="lg"
                variant={problem.retry ? "secondary" : "primary"}
                onClick={openPicker}
                disabled={capturing}
              >
                <CameraIcon className="size-5" />
                Take a Photo Instead
              </Button>
            </>
          }
        >
          {problem.text}
        </StateCard>
      ) : (
        <>
          <div className="relative aspect-[3/4] w-full max-w-sm overflow-hidden rounded-[2rem] bg-neutral-950 shadow-lift ring-1 ring-line">
            {/* Mirrored so it behaves like a mirror; the captured photo is not. */}
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="absolute inset-0 h-full w-full scale-x-[-1] object-cover"
            />

            {live ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative aspect-[3/4] w-[68%]">
                  {/* The oval is clear; the huge shadow dims everything around it. */}
                  <div className="absolute inset-0 rounded-[50%] border-2 border-white/85 shadow-[0_0_0_999px_rgba(8,8,14,0.6),inset_0_0_36px_rgba(255,255,255,0.14)]" />
                  {/* A ring that breathes outward, so the guide feels alive. */}
                  <div className="anim-pulse-ring absolute inset-0 rounded-[50%] border-2 border-white/60" />
                  {/* A slow scan line, clipped to the oval. */}
                  <div className="absolute inset-0 overflow-hidden rounded-[50%]">
                    <div className="anim-scan absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-white/80 to-transparent" />
                  </div>
                </div>
              </div>
            ) : (
              <div
                role="status"
                className="shimmer absolute inset-0 flex flex-col items-center justify-center gap-4 bg-neutral-900 text-white"
              >
                <CameraIcon className="size-10 text-white/70" />
                <p className="text-sm font-medium text-white/80">Starting camera...</p>
              </div>
            )}
          </div>

          <p className="flex items-center gap-2 text-sm font-medium text-muted">
            <FaceScanIcon className="size-4" />
            Position your face in the frame
          </p>

          <button
            type="button"
            onClick={capture}
            disabled={!live || capturing}
            aria-label="Take photo"
            className="group relative grid size-20 place-items-center rounded-full disabled:opacity-40"
          >
            {live && (
              <span className="anim-pulse-ring absolute inset-0 rounded-full border-2 border-foreground/40" />
            )}
            <span className="absolute inset-0 rounded-full border-[3px] border-foreground/90" />
            <span className="size-[3.75rem] rounded-full bg-foreground transition-transform duration-150 group-hover:scale-95 group-active:scale-90" />
          </button>

          {/* Also the way in when there is no live camera (e.g. plain-HTTP pages). */}
          <Button variant="ghost" size="sm" onClick={openPicker} disabled={capturing}>
            Or take or choose a photo
          </Button>
        </>
      )}

      {fileProblem && (
        <p role="alert" className="text-sm font-medium text-danger">
          {fileProblem}
        </p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="user"
        onChange={usePickedFile}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}
