"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  DownloadIcon,
  ShareIcon,
} from "@/components/icons";
import type { AssetSource } from "@/lib/asset-source";
import { cx } from "@/lib/cx";
import type { Asset } from "@/lib/immich";

/** navigator.share exists only in some browsers, and never during SSR. */
const subscribeNever = () => () => {};
const shareSupported = () => typeof navigator !== "undefined" && "share" in navigator;

/** How far (px) a swipe must travel to count. Small enough to feel light. */
const SWIPE_DISTANCE = 60;
const SWIPE_CLOSE_DISTANCE = 110;
/** Under this much movement a press is a tap, not a drag. */
const TAP_SLOP = 8;

const pill =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white/15 px-6 text-sm font-medium text-white backdrop-blur transition hover:bg-white/25 active:scale-[0.97] disabled:opacity-50";

const roundButton =
  "grid size-12 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25 active:scale-95";

type Gesture = { x: number; y: number; axis: "x" | "y" | null };

export function PhotoViewer({
  assets,
  source,
  index,
  total,
  onClose,
  onNavigate,
}: {
  assets: Asset[];
  source: AssetSource;
  index: number;
  /** The person's real photo count, when known (more may be loaded later). */
  total?: number | null;
  onClose: () => void;
  onNavigate: (nextIndex: number) => void;
}) {
  const asset = assets[index];
  const hasPrevious = index > 0;
  const hasNext = index < assets.length - 1;

  const canShare = useSyncExternalStore(subscribeNever, shareSupported, () => false);
  const [busy, setBusy] = useState(false);
  // Tied to an asset id so navigating away clears it without an effect.
  const [note, setNote] = useState<{ id: string; text: string } | null>(null);

  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [direction, setDirection] = useState<"next" | "prev" | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [sharpId, setSharpId] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const gesture = useRef<Gesture | null>(null);

  const go = (delta: 1 | -1) => {
    const target = index + delta;
    if (target < 0 || target >= assets.length) return;
    setDirection(delta === 1 ? "next" : "prev");
    onNavigate(target);
  };

  // Keyboard, scroll lock, and focus: focus moves into the viewer and returns to
  // the photo that opened it, and Tab cannot wander out to the page behind.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && hasPrevious) go(-1);
      if (event.key === "ArrowRight" && hasNext) go(1);

      if (event.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), a[href], video[controls]"
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
    // `go` closes over index and length, so it is re-bound with them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, hasPrevious, hasNext, onClose, onNavigate]);

  // Have the next photo's preview ready before the swipe lands on it.
  useEffect(() => {
    const next = assets[index + 1];
    if (next && next.type === "IMAGE") {
      new window.Image().src = source.thumbnailUrl(next, "preview");
    }
  }, [assets, index, source]);

  // ---- touch and mouse gestures -------------------------------------------

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    // Let the video's own controls (and any link/button) work normally.
    if ((event.target as Element).closest("button, a, video")) return;
    gesture.current = { x: event.clientX, y: event.clientY, axis: null };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g) return;

    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    if (!g.axis) {
      if (Math.hypot(dx, dy) < TAP_SLOP) return;
      g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    // Horizontal follows the finger both ways; vertical only pulls downward.
    setDrag(
      g.axis === "x"
        ? { x: dx, y: 0, active: true }
        : { x: 0, y: Math.max(0, dy), active: true }
    );
  }

  /** Is this point on the photo itself, as opposed to the empty backdrop? */
  function isOnPhoto(clientX: number, clientY: number) {
    const stage = stageRef.current?.getBoundingClientRect();
    if (!stage || !asset.width || !asset.height) return true;

    const fit = Math.min(stage.width / asset.width, stage.height / asset.height);
    const width = asset.width * fit;
    const height = asset.height * fit;
    const left = stage.left + (stage.width - width) / 2;
    const top = stage.top + (stage.height - height) / 2;
    return clientX >= left && clientX <= left + width && clientY >= top && clientY <= top + height;
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;

    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    setDrag({ x: 0, y: 0, active: false });

    if (g.axis === "x" && Math.abs(dx) > SWIPE_DISTANCE) go(dx < 0 ? 1 : -1);
    else if (g.axis === "y" && dy > SWIPE_CLOSE_DISTANCE) onClose();
    else if (!g.axis) {
      // A tap: empty space closes; the photo toggles the controls.
      if (isOnPhoto(event.clientX, event.clientY)) setShowControls((shown) => !shown);
      else onClose();
    }
  }

  function onPointerCancel() {
    gesture.current = null;
    setDrag({ x: 0, y: 0, active: false });
  }

  // ---- actions -----------------------------------------------------------

  async function share() {
    const { id, originalFileName } = asset;
    setBusy(true);
    setNote(null);

    try {
      const response = await fetch(source.originalUrl(asset));
      if (!response.ok) throw new Error();

      const blob = await response.blob();
      const file = new File([blob], originalFileName, { type: blob.type });

      if (!navigator.canShare?.({ files: [file] })) {
        setNote({ id, text: "Sharing files isn't supported in this browser." });
        return;
      }
      await navigator.share({ files: [file], title: "My photo" });
    } catch (error) {
      // The user dismissing the share sheet is not an error worth showing.
      if ((error as Error)?.name !== "AbortError") {
        setNote({ id, text: "We couldn't share that photo. Please try again." });
      }
    } finally {
      setBusy(false);
    }
  }

  const takenAt = new Date(asset.fileCreatedAt).toLocaleDateString(undefined, {
    dateStyle: "long",
  });
  const isSharp = sharpId === asset.id;
  const fade = 1 - Math.min(drag.y / 600, 0.85);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Photo from ${takenAt}`}
      className="anim-viewer fixed inset-0 z-50 text-white"
      style={{ backgroundColor: `rgba(0, 0, 0, ${fade})` }}
    >
      {/* The photo. Touch handling lives here so the buttons stay ordinary. */}
      <div
        ref={stageRef}
        className="absolute inset-0 touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <div
          key={asset.id}
          className={cx(
            "absolute inset-0",
            direction === "next" && "anim-slide-right",
            direction === "prev" && "anim-slide-left"
          )}
        >
          <div
            className="absolute inset-0"
            style={{
              transform: `translate3d(${drag.x}px, ${drag.y}px, 0) scale(${1 - Math.min(drag.y / 1200, 0.12)})`,
              transition: drag.active ? "none" : "transform 220ms ease",
            }}
          >
            {asset.type === "VIDEO" ? (
              <video
                src={source.originalUrl(asset)}
                poster={source.thumbnailUrl(asset, "preview")}
                controls
                playsInline
                className="size-full object-contain"
              />
            ) : (
              <>
                {/* The grid thumbnail is already cached: it shows at once, blurred,
                    while the sharper preview loads and fades in over it. */}
                <Image
                  src={source.thumbnailUrl(asset, "thumbnail")}
                  alt=""
                  aria-hidden="true"
                  fill
                  unoptimized
                  draggable={false}
                  className={cx(
                    "object-contain blur-lg transition-opacity duration-500",
                    isSharp ? "opacity-0" : "opacity-100"
                  )}
                />
                <Image
                  src={source.thumbnailUrl(asset, "preview")}
                  alt={`Photo from ${takenAt}`}
                  fill
                  unoptimized
                  priority
                  draggable={false}
                  onLoad={() => setSharpId(asset.id)}
                  className={cx(
                    "object-contain transition-opacity duration-500",
                    isSharp ? "opacity-100" : "opacity-0"
                  )}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Controls sit above the photo and fade away when you tap it. */}
      <div
        className={cx(
          "pointer-events-none absolute inset-0 transition-opacity duration-200",
          showControls ? "opacity-100" : "opacity-0"
        )}
      >
        <div className="pointer-events-auto absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <p className="pl-2 text-sm font-medium tabular-nums text-white/90" aria-live="polite">
            {index + 1} of {Math.max(total ?? 0, assets.length)}
          </p>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={roundButton}
          >
            <CloseIcon className="size-5" />
          </button>
        </div>

        {hasPrevious && (
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Previous photo"
            className={cx(roundButton, "pointer-events-auto absolute left-4 top-1/2 hidden -translate-y-1/2 md:grid")}
          >
            <ChevronLeftIcon className="size-6" />
          </button>
        )}
        {hasNext && (
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Next photo"
            className={cx(roundButton, "pointer-events-auto absolute right-4 top-1/2 hidden -translate-y-1/2 md:grid")}
          >
            <ChevronRightIcon className="size-6" />
          </button>
        )}

        <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 bg-gradient-to-t from-black/70 to-transparent p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {note?.id === asset.id && (
            <p role="status" className="text-sm text-white/80">
              {note.text}
            </p>
          )}
          <div className="flex items-center gap-3">
            <a
              href={source.originalUrl(asset)}
              download={asset.originalFileName}
              aria-label="Download"
              className={pill}
            >
              <DownloadIcon className="size-5" />
              Download
            </a>
            {canShare && (
              <button type="button" onClick={share} disabled={busy} className={pill}>
                <ShareIcon className="size-5" />
                {busy ? "Preparing..." : "Share"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
