"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AlertIcon, ImageIcon } from "@/components/icons";
import { PhotoViewer } from "@/components/photo-viewer";
import { StateCard } from "@/components/state-card";
import { Button, ButtonLink } from "@/components/ui/button";
import { adminSource, visitorSource, type AssetSource } from "@/lib/asset-source";
import { ApiError, errorMessage, fetchJson } from "@/lib/api-client";
import { cx } from "@/lib/cx";
import type { Asset, PersonAssetsPage } from "@/lib/immich";

const fetchPage = (source: AssetSource, page: number, signal?: AbortSignal) =>
  fetchJson<PersonAssetsPage>(source.listUrl(page), signal);

// ------------------------------------------------------------------ layout ---

/** Column count follows the screen: 2 on a phone, up to 5 on a wide desktop. */
const QUERIES = ["(min-width: 640px)", "(min-width: 1024px)", "(min-width: 1280px)"];

function subscribeColumns(onChange: () => void) {
  const lists = QUERIES.map((query) => window.matchMedia(query));
  lists.forEach((list) => list.addEventListener("change", onChange));
  return () => lists.forEach((list) => list.removeEventListener("change", onChange));
}

const currentColumns = () =>
  2 + QUERIES.filter((query) => window.matchMedia(query).matches).length;

const useColumns = () => useSyncExternalStore(subscribeColumns, currentColumns, () => 2);

/**
 * A photo's shape, kept within a comfortable range. A panorama or a very tall
 * screenshot is cropped a little rather than making one tile dominate the grid.
 */
const shapeOf = (asset: Asset) => {
  const ratio = asset.width && asset.height ? asset.width / asset.height : 4 / 3;
  return Math.min(1.7, Math.max(0.62, ratio));
};

type Placed = { asset: Asset; index: number };

/**
 * Masonry: each photo goes into whichever column is currently shortest, so the
 * columns end up level and photos read roughly left to right, newest first.
 */
function arrange(assets: Asset[], columns: number): Placed[][] {
  const lanes: Placed[][] = Array.from({ length: columns }, () => []);
  const heights = Array<number>(columns).fill(0);

  assets.forEach((asset, index) => {
    let shortest = 0;
    for (let lane = 1; lane < columns; lane++) {
      if (heights[lane] < heights[shortest] - 0.001) shortest = lane;
    }
    lanes[shortest].push({ asset, index });
    heights[shortest] += 1 / shapeOf(asset);
  });

  return lanes;
}

// ------------------------------------------------------------------- pieces ---

function Lanes({ children }: { children: React.ReactNode }) {
  return <div className="flex items-start gap-2 sm:gap-3">{children}</div>;
}

function Tile({
  asset,
  source,
  onOpen,
}: {
  asset: Asset;
  source: AssetSource;
  onOpen: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const date = new Date(asset.fileCreatedAt).toLocaleDateString(undefined, {
    dateStyle: "long",
  });

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open photo from ${date}`}
      style={{ aspectRatio: shapeOf(asset) }}
      className="group relative block w-full overflow-hidden rounded-xl bg-surface-2 ring-1 ring-line transition duration-200 hover:shadow-lift active:scale-[0.98]"
    >
      {/* The shape is reserved up front, so nothing shifts as photos arrive. */}
      {!loaded && <span className="shimmer absolute inset-0" />}
      <Image
        src={source.thumbnailUrl(asset, "thumbnail")}
        alt={`Photo from ${date}`}
        fill
        sizes="(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
        unoptimized
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={cx(
          "object-cover transition duration-500 group-hover:scale-[1.04]",
          loaded ? "opacity-100" : "opacity-0"
        )}
      />
      {asset.type === "VIDEO" && (
        <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
          <svg viewBox="0 0 12 12" aria-hidden="true" className="size-2.5 fill-current">
            <path d="M2 1.2v9.6L10.5 6z" />
          </svg>
          Video
        </span>
      )}
    </button>
  );
}

// Fixed, varied shapes so the loading state already looks like a photo wall.
const SKELETON_SHAPES = [0.75, 1, 1.33, 0.8, 1.5, 1, 0.75, 1.2, 1, 0.8, 1.33, 0.9];

function SkeletonGrid({ label }: { label?: string }) {
  const columns = useColumns();

  return (
    <div aria-busy="true" aria-label="Loading photos" className="space-y-6">
      {label && (
        <p role="status" className="text-center text-base font-medium text-muted">
          {label}
        </p>
      )}
      <Lanes>
        {Array.from({ length: columns }, (_, lane) => (
          <div key={lane} className="flex min-w-0 flex-1 flex-col gap-2 sm:gap-3">
            {SKELETON_SHAPES.filter((_, i) => i % columns === lane).map((shape, i) => (
              <div
                key={i}
                className="shimmer rounded-xl"
                style={{ aspectRatio: shape }}
              />
            ))}
          </div>
        ))}
      </Lanes>
    </div>
  );
}

// ------------------------------------------------------------------ gallery ---

/**
 * A person's photos, loaded a page at a time.
 *
 * Pass `personId` for the admin view of any person. Omit it for a visitor's
 * own photos: those come from the scan session, so no id is ever sent.
 */
export function AssetGallery({
  personId,
  loadingLabel,
  total,
}: {
  personId?: string;
  loadingLabel?: string;
  /** The real photo count, so the viewer can say "1 of 32" before all are loaded. */
  total?: number | null;
}) {
  const source = useMemo(
    () => (personId ? adminSource(personId) : visitorSource),
    [personId]
  );
  const columns = useColumns();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [message, setMessage] = useState("");
  const [expired, setExpired] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState("");
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetchPage(source, 1, controller.signal)
      .then((data) => {
        setAssets(data.assets);
        setNextPage(data.nextPage);
        setStatus("ready");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setMessage(errorMessage(error));
        setExpired(error instanceof ApiError && error.code === "session_required");
        setStatus("error");
      });

    return () => controller.abort();
  }, [source, attempt]);

  const lanes = useMemo(() => arrange(assets, columns), [assets, columns]);
  const closeViewer = useCallback(() => setViewerIndex(null), []);

  function retry() {
    setStatus("loading");
    setAttempt((n) => n + 1);
  }

  async function loadMore() {
    if (nextPage === null || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError("");

    try {
      const data = await fetchPage(source, nextPage);
      setAssets((current) => {
        const seen = new Set(current.map((a) => a.id));
        return [...current, ...data.assets.filter((a) => !seen.has(a.id))];
      });
      setNextPage(data.nextPage);
    } catch (error) {
      setLoadMoreError(errorMessage(error));
    } finally {
      setLoadingMore(false);
    }
  }

  if (status === "loading") return <SkeletonGrid label={loadingLabel} />;

  if (status === "error") {
    return expired ? (
      <StateCard
        alert
        tone="warm"
        icon={<AlertIcon className="size-full" />}
        title="Your session has ended"
        actions={
          <ButtonLink href="/scan?expired=1" size="lg">
            Scan Again
          </ButtonLink>
        }
      >
        Scan again to see your photos.
      </StateCard>
    ) : (
      <StateCard
        alert
        tone="warm"
        icon={<AlertIcon className="size-full" />}
        title="We couldn't load your photos"
        actions={
          <Button size="lg" onClick={retry}>
            Try Again
          </Button>
        }
      >
        {message}
      </StateCard>
    );
  }

  if (assets.length === 0) {
    return (
      <StateCard icon={<ImageIcon className="size-full" />} title="No photos found">
        We didn&apos;t find any photos for this profile yet.
      </StateCard>
    );
  }

  return (
    <div className="space-y-10">
      <Lanes>
        {lanes.map((lane, i) => (
          <div key={i} className="flex min-w-0 flex-1 flex-col gap-2 sm:gap-3">
            {lane.map(({ asset, index }) => (
              <Tile
                key={asset.id}
                asset={asset}
                source={source}
                onOpen={() => setViewerIndex(index)}
              />
            ))}
          </div>
        ))}
      </Lanes>

      {nextPage !== null && (
        <div className="flex flex-col items-center gap-3">
          <Button variant="secondary" size="lg" onClick={loadMore} disabled={loadingMore}>
            {loadingMore && (
              <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            )}
            {loadingMore ? "Loading..." : "Load more"}
          </Button>
          {loadMoreError && (
            <p role="alert" className="text-sm font-medium text-danger">
              {loadMoreError}
            </p>
          )}
        </div>
      )}

      {viewerIndex !== null && (
        <PhotoViewer
          assets={assets}
          source={source}
          index={viewerIndex}
          total={total}
          onClose={closeViewer}
          onNavigate={setViewerIndex}
        />
      )}
    </div>
  );
}
