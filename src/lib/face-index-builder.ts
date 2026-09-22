import {
  detectFaces,
  intersectionOverUnion,
  type BoundingBox,
} from "@/lib/face-recognition";
import {
  loadIndex,
  saveIndex,
  statsFor,
  type FaceIndexStats,
  type IndexedFace,
} from "@/lib/face-index";
import {
  ImmichError,
  backgroundTimeoutMs,
  describeError,
  getAllPeople,
  immichFetch,
} from "@/lib/immich";

/**
 * Builds the face index from Immich's own recognition results.
 *
 * For each person: take a sample of their assets, ask Immich which faces it
 * found there and which belong to this person, run the same preview image
 * through the ML service, and keep the embedding whose box lines up with
 * Immich's. That way a group photo contributes the right face to the right
 * person instead of one embedding per asset.
 */

/** Sampled per person. Four was enough for 68/69 in the investigation. */
const ASSETS_PER_PERSON = 4;

/** Nobody waits on a rebuild, so its Immich calls get the long timeout. */
const BACKGROUND = { timeoutMs: backgroundTimeoutMs() };

/** Above this, an ML box and an Immich box are the same face. */
const BOX_MATCH_THRESHOLD = 0.5;

export type BuildStatus = "idle" | "queued" | "building" | "complete" | "failed";

export type BuildState = {
  status: BuildStatus;
  processed: number;
  total: number;
  facesIndexed: number;
  peopleIndexed: number;
  /** Unique photos read successfully so far. Counts only, never ids. */
  indexedAssets: number;
  /** Unique photos that could not be read. */
  failedAssets: number;
  /** True once a result is applied with photos missing: not a clean build. */
  partial: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
};

const idleState: BuildState = {
  status: "idle",
  processed: 0,
  total: 0,
  facesIndexed: 0,
  peopleIndexed: 0,
  indexedAssets: 0,
  failedAssets: 0,
  partial: false,
  startedAt: null,
  finishedAt: null,
  error: null,
};

// Module-level so progress survives between requests. Single server process
// only: a restart mid-build resets this to idle and leaves the previous index
// file untouched, because the index is written once at the end.
let state: BuildState = { ...idleState };
let running: Promise<void> | null = null;

export function getBuildState(): BuildState {
  return { ...state };
}

type FaceBox = BoundingBox & { personId: string };

async function immichFaceBoxes(assetId: string): Promise<FaceBox[]> {
  const response = await immichFetch(`/faces?id=${assetId}`, {}, BACKGROUND);
  const faces: Array<{
    boundingBoxX1: number;
    boundingBoxY1: number;
    boundingBoxX2: number;
    boundingBoxY2: number;
    person: { id: string } | null;
  }> = await response.json();

  return faces
    .filter((face) => face.person)
    .map((face) => ({
      x1: face.boundingBoxX1,
      y1: face.boundingBoxY1,
      x2: face.boundingBoxX2,
      y2: face.boundingBoxY2,
      personId: face.person!.id,
    }));
}

async function sampleAssetIds(personId: string): Promise<string[]> {
  const response = await immichFetch("/search/metadata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      personIds: [personId],
      page: 1,
      size: ASSETS_PER_PERSON,
      order: "desc",
    }),
  }, { retry: true, ...BACKGROUND });
  const { assets } = await response.json();

  return (assets.items as Array<{ id: string }>).map((asset) => asset.id);
}

async function embeddingsForAsset(
  assetId: string,
  eligible: Set<string>
): Promise<IndexedFace[]> {
  const boxes = await immichFaceBoxes(assetId);
  if (boxes.length === 0) return [];

  // Immich detects on the preview, so its boxes only line up with ours there.
  const response = await immichFetch(
    `/assets/${assetId}/thumbnail?size=preview`,
    {},
    BACKGROUND
  );
  const faces = await detectFaces(await response.arrayBuffer());

  const indexed: IndexedFace[] = [];
  for (const face of faces) {
    // Match against every Immich box, eligible or not, so a face belonging to
    // an ineligible person is dropped rather than attributed to a neighbour.
    const box = boxes.find(
      (candidate) =>
        intersectionOverUnion(face.boundingBox, candidate) > BOX_MATCH_THRESHOLD
    );
    if (box && eligible.has(box.personId)) {
      indexed.push({
        personId: box.personId,
        assetId,
        embedding: face.embedding,
      });
    }
  }

  return indexed;
}

/** Raised when a finished build should NOT replace the working index. */
class BuildRefused extends Error {}

/**
 * At or above this share of failures the run looks like an outage rather than
 * a few bad photos, so the result is not trusted at all. Below it, the photos
 * that did work are real results and worth serving.
 */
const OUTAGE_FAILED_FRACTION = 0.6;

/** A rebuild that finds less than this share of the current index is suspect. */
const MIN_SHARE_OF_PREVIOUS = 0.5;

/**
 * A rebuild replaces the index that recognition depends on, so it must prove
 * itself first. Photos that fail are skipped, which is right for one bad file
 * and disastrous when Immich or the ML service is down: every photo "fails",
 * the build "succeeds" with nothing in it, and the good index is overwritten.
 *
 * Failing some photos is not the same as failing at the job, though. Refusing
 * the whole result over a minority of unreadable photos left recognition with
 * no index at all, which is strictly worse for the visitor than an index that
 * is missing some photos. So a run is refused only when it is empty, when it
 * looks like an outage, or when it is far smaller than the index it would
 * replace; otherwise it is applied and reported as partial.
 *
 * Returns whether the accepted result is incomplete.
 */
async function vetReplacement(
  faces: IndexedFace[],
  failed: number,
  attempted: number
): Promise<{ partial: boolean }> {
  if (faces.length === 0) {
    throw new BuildRefused(
      "The rebuild found no faces, so the current index was kept. Check that Immich and the face recognition service are running."
    );
  }

  // max(3, ...) keeps a handful of bad photos in a tiny library from reading
  // as an outage.
  if (failed > Math.max(3, attempted * OUTAGE_FAILED_FRACTION)) {
    throw new BuildRefused(
      `${failed} of ${attempted} photos could not be processed, so the current index was kept. Check that Immich and the face recognition service are running, then rebuild.`
    );
  }

  const previous = await loadIndex();
  if (previous) {
    const previousPeople = new Set(previous.faces.map((f) => f.personId)).size;
    const people = new Set(faces.map((f) => f.personId)).size;
    if (
      faces.length < previous.faces.length * MIN_SHARE_OF_PREVIOUS ||
      people < previousPeople * MIN_SHARE_OF_PREVIOUS
    ) {
      throw new BuildRefused(
        "The new index is much smaller than the current one, so it was not applied. Check Immich, then rebuild."
      );
    }
  }

  // With no previous index there is nothing to protect: a first index that
  // holds real faces and does not look like an outage is worth serving, even
  // incomplete, because the alternative is no recognition at all.
  return { partial: failed > 0 };
}

/** What the admin sees when a build fails: never a raw error. */
function publicBuildError(error: unknown) {
  if (error instanceof BuildRefused) return error.message;
  if (error instanceof ImmichError) return describeError(error).message;
  describeError(error); // logged, with secrets and URLs scrubbed
  return "The index build failed, and the current index was kept. See the server log.";
}

async function run() {
  const faces: IndexedFace[] = [];

  try {
    // Plan first, so progress is against a real total rather than an estimate.
    // Only people Immich lists in GET /people are eligible: Immich hides people
    // below its minFaces threshold, and the app's People page would not show
    // them, so a match to one would land on a person the user cannot browse.
    const people = await getAllPeople(BACKGROUND);
    const eligible = new Set(people.map((person) => person.id));
    const jobs: string[] = [];
    for (const person of people) {
      jobs.push(...(await sampleAssetIds(person.id)));
    }

    state = {
      ...state,
      status: "building",
      total: jobs.length,
      processed: 0,
    };

    // Ids, so a photo sampled by several people counts once and so the two
    // outcomes stay distinguishable for the index file.
    const indexed = new Set<string>();
    const failed = new Set<string>();
    for (const assetId of jobs) {
      // Two people can sample the same group photo; process it once.
      if (!indexed.has(assetId) && !failed.has(assetId)) {
        try {
          faces.push(...(await embeddingsForAsset(assetId, eligible)));
          indexed.add(assetId);
        } catch (error) {
          // One unreadable asset should not abandon a multi-minute build, but
          // it is counted: a build where everything failed must not be applied.
          failed.add(assetId);
          describeError(error); // logged once per distinct cause, not per photo
        }
      }

      state = {
        ...state,
        processed: state.processed + 1,
        facesIndexed: faces.length,
        peopleIndexed: new Set(faces.map((f) => f.personId)).size,
        indexedAssets: indexed.size,
        failedAssets: failed.size,
      };
    }

    const attempted = indexed.size + failed.size;
    const { partial } = await vetReplacement(faces, failed.size, attempted);
    await saveIndex(faces, {
      indexedAssetIds: [...indexed],
      failedAssetIds: [...failed],
    });

    state = {
      ...state,
      status: "complete",
      partial,
      finishedAt: new Date().toISOString(),
    };
  } catch (error) {
    state = {
      ...state,
      status: "failed",
      finishedAt: new Date().toISOString(),
      // A fixed message, never the image bytes, an embedding or a raw error.
      error: publicBuildError(error),
    };
  } finally {
    running = null;
  }
}

/** Starts a build unless one is already running. Returns immediately. */
export function startBuild(): { started: boolean; state: BuildState } {
  if (running) return { started: false, state: getBuildState() };

  state = {
    ...idleState,
    status: "queued",
    startedAt: new Date().toISOString(),
  };
  running = run();

  return { started: true, state: getBuildState() };
}

export async function currentIndexStats(): Promise<FaceIndexStats | null> {
  const index = await loadIndex();
  return index ? statsFor(index) : null;
}
