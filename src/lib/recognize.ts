import { loadIndex } from "@/lib/face-index";
import { matchFace } from "@/lib/face-matcher";
import { detectFaces } from "@/lib/face-recognition";
import { ImmichError } from "@/lib/immich";
import { imageDimensions } from "@/lib/image-info";

/**
 * Upload validation and the recognition pipeline behind POST /api/recognize.
 *
 * Privacy: the image lives in memory for the length of one request. Nothing
 * here writes it, or any embedding, to disk or to a log.
 */

/**
 * The camera UI downscales to ~100-300 KB, so this only ever rejects abuse.
 * Kept under Vercel's 4.5 MB request-body limit (multipart framing included),
 * so an oversized upload is refused by this app's own, friendlier error.
 */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/**
 * Largest picture accepted, in pixels. The camera UI sends at most 1280 on the
 * long edge; this leaves room for a 12-megapixel phone photo and nothing more.
 */
const MAX_IMAGE_SIDE = 4096;
const MAX_IMAGE_PIXELS = 16_000_000;

/** Multipart framing around the file: boundaries, headers, small fields. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** What the browser is allowed to learn. No scores, embeddings or ML output. */
export type Recognition =
  | { status: "matched"; personId: string }
  | { status: "ambiguous"; candidates: { personId: string }[] }
  | { status: "no_match" }
  | { status: "no_face" }
  | { status: "multiple_faces" };

export type Timings = { mlMs: number; matchMs: number };

/** Identifies the format from its leading bytes; the declared type is only a hint. */
function sniffType(bytes: Uint8Array): string | null {
  const starts = (...signature: number[]) =>
    signature.every((byte, i) => bytes[i] === byte);

  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  // "RIFF" .... "WEBP"
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 &&
      bytes[10] === 0x42 && bytes[11] === 0x50) {
    return "image/webp";
  }
  return null;
}

/**
 * Reads the request body, refusing to buffer more than the limit. The
 * Content-Length header is only a hint (it can be absent or wrong), so the
 * stream itself is counted.
 */
async function readBodyLimited(request: Request, limit: number) {
  const declared = Number(request.headers.get("content-length"));
  if (declared > limit) throw new ImmichError("too_large");
  if (!request.body) throw new ImmichError("invalid_request");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    received += value.byteLength;
    if (received > limit) {
      await reader.cancel();
      throw new ImmichError("too_large");
    }
    chunks.push(value);
  }

  return new Blob(chunks as BlobPart[]);
}

/** Validates the multipart upload and returns the image bytes. */
export async function readUploadedImage(request: Request): Promise<ArrayBuffer> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    throw new ImmichError("invalid_request");
  }

  const body = await readBodyLimited(
    request,
    MAX_IMAGE_BYTES + MULTIPART_OVERHEAD_BYTES
  );

  let form: FormData;
  try {
    form = await new Response(body, {
      headers: { "content-type": contentType },
    }).formData();
  } catch {
    throw new ImmichError("invalid_request");
  }

  // A text field named "image" (e.g. a file path) is not an upload.
  const file = form.get("image");
  if (!(file instanceof File)) throw new ImmichError("invalid_request");

  if (file.size === 0) throw new ImmichError("invalid_image");
  if (file.size > MAX_IMAGE_BYTES) throw new ImmichError("too_large");
  if (!ALLOWED_TYPES.includes(file.type)) throw new ImmichError("unsupported_image");

  const bytes = await file.arrayBuffer();
  const sniffed = sniffType(new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 12)));
  if (!sniffed) throw new ImmichError("invalid_image");
  if (sniffed !== file.type) throw new ImmichError("invalid_image");

  // A tiny file can still declare an enormous picture, and decoding that would
  // exhaust the ML service's memory. Read the size from the header and refuse.
  const size = imageDimensions(new Uint8Array(bytes), sniffed);
  if (!size) throw new ImmichError("invalid_image");
  if (
    size.width > MAX_IMAGE_SIDE ||
    size.height > MAX_IMAGE_SIDE ||
    size.width * size.height > MAX_IMAGE_PIXELS
  ) {
    throw new ImmichError("too_large");
  }

  return bytes;
}

export async function recognizeImage(
  image: ArrayBuffer
): Promise<{ result: Recognition; timings: Timings }> {
  // Fail before spending ML time if there is nothing to match against.
  const index = await loadIndex();
  if (!index) throw new ImmichError("index_unavailable");

  const mlStart = performance.now();
  const faces = await detectFaces(image);
  const mlMs = performance.now() - mlStart;

  const timings = (matchMs: number): Timings => ({ mlMs, matchMs });

  if (faces.length === 0) {
    return { result: { status: "no_face" }, timings: timings(0) };
  }
  // Picking one of several faces could identify the wrong person.
  if (faces.length > 1) {
    return { result: { status: "multiple_faces" }, timings: timings(0) };
  }

  const matchStart = performance.now();
  const match = matchFace(faces[0].embedding, index);
  const matchMs = performance.now() - matchStart;

  switch (match.status) {
    case "matched":
      return {
        result: { status: "matched", personId: match.personId },
        timings: timings(matchMs),
      };
    case "ambiguous":
      return {
        result: {
          status: "ambiguous",
          candidates: match.candidates.map(({ personId }) => ({ personId })),
        },
        timings: timings(matchMs),
      };
    default:
      return { result: { status: "no_match" }, timings: timings(matchMs) };
  }
}
