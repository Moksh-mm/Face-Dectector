import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/admin-auth";
import { currentIndexStats, getBuildState } from "@/lib/face-index-builder";
import { pingMl } from "@/lib/face-recognition";

/** Index status and progress. Never returns embeddings or the index itself. */
export async function GET(request: Request) {
  const denied = await adminGuard(request);
  if (denied) return denied;

  const [index, mlAvailable] = await Promise.all([
    currentIndexStats(),
    pingMl(),
  ]);

  return NextResponse.json({ build: getBuildState(), index, mlAvailable });
}
