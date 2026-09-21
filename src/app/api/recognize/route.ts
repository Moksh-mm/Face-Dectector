import { NextResponse } from "next/server";
import { publicErrorResponse } from "@/lib/immich";
import { limitRecognize } from "@/lib/rate-limit";
import { readUploadedImage, recognizeImage } from "@/lib/recognize";
import { toScanResult } from "@/lib/scan-result";
import { clearScanSession, issueScanSession } from "@/lib/scan-session";

// Never cache: every response is about one person's face.
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Identifies which Immich person a face belongs to.
 *
 * Accepts multipart/form-data with an `image` file. The image stays in memory
 * and is discarded when the request ends. The response carries only the
 * outcome and what the visitor may see: never person ids, scores, embeddings
 * or anything from the ML service. A match starts a short-lived session (an
 * HttpOnly cookie); any other outcome ends the previous one, so the next person
 * to use a shared device cannot inherit the last person's photos.
 */
export async function POST(request: Request) {
  // First, before the upload is read or any ML time is spent: 10 attempts per
  // minute per client and 60 across everyone by default (see rate-limit.ts).
  const limited = limitRecognize(request);
  if (limited) return limited;

  try {
    const image = await readUploadedImage(request);
    const { result: recognition, timings } = await recognizeImage(image);
    const { result, matchedPersonId } = await toScanResult(recognition);

    const headers: Record<string, string> = { ...NO_STORE };
    // Timing is diagnostic only, and stays out of production responses.
    if (process.env.NODE_ENV !== "production") {
      headers["Server-Timing"] =
        `ml;dur=${timings.mlMs.toFixed(1)}, match;dur=${timings.matchMs.toFixed(2)}`;
    }

    const response = NextResponse.json(result, { headers });
    if (matchedPersonId) issueScanSession(response, request, matchedPersonId);
    else clearScanSession(response, request);
    return response;
  } catch (error) {
    const response = publicErrorResponse(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
