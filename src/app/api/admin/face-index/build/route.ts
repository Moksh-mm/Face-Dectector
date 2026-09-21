import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/admin-auth";
import { startBuild } from "@/lib/face-index-builder";

/**
 * Starts a rebuild and returns immediately: the build takes minutes, so the
 * caller polls GET /api/admin/face-index for progress rather than holding a
 * request open.
 */
export async function POST(request: Request) {
  const denied = await adminGuard(request);
  if (denied) return denied;

  const { started, state } = startBuild();

  if (!started) {
    return NextResponse.json(
      {
        error: { code: "already_running", message: "A build is already running." },
        build: state,
      },
      { status: 409 }
    );
  }

  return NextResponse.json({ build: state }, { status: 202 });
}
