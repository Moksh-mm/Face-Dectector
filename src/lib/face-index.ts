import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { EMBEDDING_DIMENSIONS, FACE_MODEL } from "@/lib/face-recognition";

/**
 * The face index: normalized embeddings labelled with the Immich person they
 * belong to. Server-side only — it is never sent to the browser, in whole or
 * in part.
 */

export const INDEX_VERSION = 1;

export type IndexedFace = {
  personId: string;
  assetId: string;
  embedding: number[];
};

/**
 * Which sampled photos the build managed to read. Ids only: no embeddings, no
 * image bytes, no error text. Optional, because indexes written before partial
 * builds were allowed do not carry it — those still load unchanged.
 */
export type IndexCoverage = {
  indexedAssetIds: string[];
  failedAssetIds: string[];
};

export type FaceIndex = {
  version: number;
  model: string;
  createdAt: string;
  faces: IndexedFace[];
  coverage?: IndexCoverage;
};

export type FaceIndexStats = {
  facesIndexed: number;
  peopleIndexed: number;
  model: string;
  createdAt: string;
  /** Unique photos the build read successfully. */
  indexedAssets: number;
  /** Unique photos it could not read; null when the index predates coverage. */
  failedAssets: number | null;
  /** True when the index was applied with some photos missing. */
  partial: boolean;
};

// Where the index lives. Configurable so it can be kept outside the project
// tree (and so tests can work on a copy instead of the real biometric data).
const INDEX_DIR = process.env.FACE_INDEX_DIR
  ? path.resolve(process.env.FACE_INDEX_DIR)
  : path.join(process.cwd(), "data");
const INDEX_PATH = path.join(INDEX_DIR, "face-index.json");

export function statsFor(index: FaceIndex): FaceIndexStats {
  const failedAssets = index.coverage?.failedAssetIds.length ?? null;

  return {
    facesIndexed: index.faces.length,
    peopleIndexed: new Set(index.faces.map((f) => f.personId)).size,
    model: index.model,
    createdAt: index.createdAt,
    // Without coverage, the photos that contributed a face are the only ones
    // the file knows about; that undercounts, but never invents a number.
    indexedAssets:
      index.coverage?.indexedAssetIds.length ??
      new Set(index.faces.map((f) => f.assetId)).size,
    failedAssets,
    partial: failedAssets !== null && failedAssets > 0,
  };
}

function isValid(value: unknown): value is FaceIndex {
  const index = value as Partial<FaceIndex> | null;
  if (!index || index.version !== INDEX_VERSION) return false;
  if (typeof index.model !== "string" || typeof index.createdAt !== "string") {
    return false;
  }
  if (!Array.isArray(index.faces)) return false;

  // Coverage is optional; when present it must be two arrays of ids.
  if (index.coverage !== undefined) {
    const { indexedAssetIds, failedAssetIds } = index.coverage;
    const ids = (value: unknown) =>
      Array.isArray(value) && value.every((id) => typeof id === "string");
    if (!ids(indexedAssetIds) || !ids(failedAssetIds)) return false;
  }

  return index.faces.every(
    (face) =>
      typeof face?.personId === "string" &&
      typeof face?.assetId === "string" &&
      Array.isArray(face?.embedding) &&
      face.embedding.length === EMBEDDING_DIMENSIONS &&
      face.embedding.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

// Parsed index, keyed by the file's mtime: a rebuild replaces the file, which
// changes the mtime and so invalidates this without any explicit signal.
let cached: { mtimeMs: number; index: FaceIndex } | null = null;

/** Returns null when no index has been built yet, or the file is unusable. */
export async function loadIndex(): Promise<FaceIndex | null> {
  let mtimeMs: number;
  try {
    mtimeMs = (await stat(INDEX_PATH)).mtimeMs;
  } catch {
    cached = null;
    return null;
  }

  if (cached?.mtimeMs === mtimeMs) return cached.index;

  try {
    const parsed: unknown = JSON.parse(await readFile(INDEX_PATH, "utf8"));
    if (!isValid(parsed)) return null;

    cached = { mtimeMs, index: parsed };
    return parsed;
  } catch {
    return null;
  }
}

/** A crashed build can leave its temp file behind; it holds biometric data. */
async function removeStaleTemporaryFiles() {
  const cutoff = Date.now() - 10 * 60_000;

  for (const name of await readdir(INDEX_DIR).catch(() => [] as string[])) {
    if (!name.startsWith("face-index.json.") || !name.endsWith(".tmp")) continue;

    const file = path.join(INDEX_DIR, name);
    // Only old ones: a fresh one may belong to a build running right now.
    const info = await stat(file).catch(() => null);
    if (info && info.mtimeMs < cutoff) await unlink(file).catch(() => {});
  }
}

/**
 * Replaces the index safely:
 *
 *   write a temp file -> read it back and validate it -> atomic rename
 *
 * The rename is the only step that touches the live file, and it happens last,
 * after the new content is proven readable. Any earlier failure removes the temp
 * file and leaves the previous index exactly as it was.
 */
export async function saveIndex(
  faces: IndexedFace[],
  coverage?: IndexCoverage
): Promise<FaceIndex> {
  const index: FaceIndex = {
    version: INDEX_VERSION,
    model: FACE_MODEL,
    createdAt: new Date().toISOString(),
    faces,
    // Omitted entirely when the caller has nothing to record, so the file keeps
    // the exact shape older servers expect.
    ...(coverage ? { coverage } : {}),
  };

  await mkdir(INDEX_DIR, { recursive: true, mode: 0o700 });
  await removeStaleTemporaryFiles();

  const temporaryPath = `${INDEX_PATH}.${process.pid}.tmp`;
  try {
    // 0600: readable by this server's user only. (Ignored on Windows.)
    await writeFile(temporaryPath, JSON.stringify(index), {
      encoding: "utf8",
      mode: 0o600,
    });

    const onDisk: unknown = JSON.parse(await readFile(temporaryPath, "utf8"));
    if (
      !isValid(onDisk) ||
      onDisk.faces.length !== faces.length ||
      onDisk.coverage?.indexedAssetIds.length !==
        coverage?.indexedAssetIds.length ||
      onDisk.coverage?.failedAssetIds.length !== coverage?.failedAssetIds.length
    ) {
      throw new Error("The new index failed validation, so it was not applied.");
    }

    await rename(temporaryPath, INDEX_PATH);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }

  return index;
}
