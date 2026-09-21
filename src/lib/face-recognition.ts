import { configuredUrl } from "@/lib/config";
import { ImmichError, failureDetail } from "@/lib/immich";

/**
 * Client for Immich's machine-learning service (InsightFace buffalo_l).
 *
 * Privacy: images passed through here are held in memory only. Nothing in this
 * module writes an image or an embedding to disk, or logs either one.
 */

/** Matches Immich's own machineLearning.facialRecognition settings. */
export const FACE_MODEL = "buffalo_l";
export const MIN_DETECTION_SCORE = 0.7;
export const EMBEDDING_DIMENSIONS = 512;

/** Immich's maxDistance 0.5 as cosine distance, i.e. similarity >= 0.5. */
export const MATCH_THRESHOLD = 0.5;

const ENTRIES = JSON.stringify({
  "facial-recognition": {
    detection: { modelName: FACE_MODEL, options: { minScore: MIN_DETECTION_SCORE } },
    recognition: { modelName: FACE_MODEL },
  },
});

export type BoundingBox = { x1: number; y1: number; x2: number; y2: number };

export type DetectedFace = {
  boundingBox: BoundingBox;
  score: number;
  /** Unit-length, so cosine similarity is a plain dot product. */
  embedding: number[];
};

function mlUrl() {
  // Missing, malformed, or carrying credentials: treated as not configured.
  const url = configuredUrl("IMMICH_ML_URL");
  if (!url) throw new ImmichError("ml_not_configured");
  return url;
}

/**
 * The ML service can take ~10 s on a cold start, and a call is normally ~1 s.
 * Beyond this it is stalled, and waiting longer only ties up the request.
 */
const ML_TIMEOUT_MS = 30_000;

/** The service returns the vector as a JSON string, not an array. */
function parseEmbedding(raw: unknown): number[] {
  let value = raw;

  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      throw new ImmichError("ml_invalid_response");
    }
  }

  if (!Array.isArray(value) || value.length !== EMBEDDING_DIMENSIONS) {
    throw new ImmichError("ml_invalid_response");
  }

  let sumOfSquares = 0;
  for (const n of value) {
    if (typeof n !== "number" || !Number.isFinite(n)) {
      throw new ImmichError("ml_invalid_response");
    }
    sumOfSquares += n * n;
  }

  const magnitude = Math.sqrt(sumOfSquares);
  if (magnitude === 0) throw new ImmichError("ml_invalid_response");

  return (value as number[]).map((n) => n / magnitude);
}

function parseBoundingBox(raw: unknown): BoundingBox {
  const box = raw as Partial<BoundingBox> | undefined;
  const values = [box?.x1, box?.y1, box?.x2, box?.y2];

  if (values.some((v) => typeof v !== "number" || !Number.isFinite(v))) {
    throw new ImmichError("ml_invalid_response");
  }
  return { x1: box!.x1!, y1: box!.y1!, x2: box!.x2!, y2: box!.y2! };
}

/**
 * Detects faces in an image and returns one normalized embedding per face.
 * Returns an empty array when the image contains no detectable face.
 */
export async function detectFaces(image: ArrayBuffer): Promise<DetectedFace[]> {
  const form = new FormData();
  form.append("entries", ENTRIES);
  form.append("image", new Blob([image]), "image.jpg");

  // Resolved before the try: a configuration fault is not a connection fault.
  const url = mlUrl();

  let response: Response;
  try {
    response = await fetch(`${url}/predict`, {
      method: "POST",
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(ML_TIMEOUT_MS),
    });
  } catch (error) {
    // Not retried: a call costs ML time, and retrying would double the load.
    throw new ImmichError("ml_unreachable", failureDetail(error));
  }

  if (!response.ok) {
    // The service answers 500 both for images it cannot decode and for its own
    // faults. If it is otherwise healthy, the image is the likelier cause. One
    // retry, because a single missed probe would blame the service for what is
    // really a bad upload.
    const healthy = (await pingMl()) || (await pingMl());
    throw new ImmichError(healthy ? "invalid_image" : "ml_error");
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ImmichError("ml_invalid_response");
  }

  const faces = (body as Record<string, unknown>)?.["facial-recognition"];
  if (!Array.isArray(faces)) throw new ImmichError("ml_invalid_response");

  return faces.map((face) => {
    const score = (face as { score?: unknown })?.score;
    if (typeof score !== "number" || !Number.isFinite(score)) {
      throw new ImmichError("ml_invalid_response");
    }

    return {
      boundingBox: parseBoundingBox((face as { boundingBox?: unknown })?.boundingBox),
      score,
      embedding: parseEmbedding((face as { embedding?: unknown })?.embedding),
    };
  });
}

/** Cosine similarity of two unit-length embeddings. */
export function similarity(a: number[], b: number[]) {
  let total = 0;
  for (let i = 0; i < a.length; i++) total += a[i] * b[i];
  return total;
}

/** Intersection-over-union, used to line ML boxes up with Immich's stored boxes. */
export function intersectionOverUnion(a: BoundingBox, b: BoundingBox) {
  const width = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const height = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  const overlap = width * height;

  const area = (r: BoundingBox) => (r.x2 - r.x1) * (r.y2 - r.y1);
  const union = area(a) + area(b) - overlap;

  return union <= 0 ? 0 : overlap / union;
}

/** True when the ML service is configured and answering. */
export async function pingMl(): Promise<boolean> {
  try {
    const response = await fetch(`${mlUrl()}/ping`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
