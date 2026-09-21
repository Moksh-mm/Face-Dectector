import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/admin-auth";
import { evaluateIndex } from "@/lib/face-evaluation";
import { loadIndex } from "@/lib/face-index";
import { errorResponse, ImmichError } from "@/lib/immich";

/**
 * Runs the matcher against the index's own labelled faces and returns
 * aggregate accuracy figures. Useful after every rebuild to check the index is
 * still discriminating. Returns counts and scores only, never embeddings.
 */
export async function POST(request: Request) {
  const denied = await adminGuard(request);
  if (denied) return denied;

  try {
    const index = await loadIndex();
    if (!index) throw new ImmichError("index_unavailable");

    return NextResponse.json(
      { faces: index.faces.length, ...evaluateIndex(index) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
