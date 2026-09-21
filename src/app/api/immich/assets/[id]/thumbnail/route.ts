import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/admin-auth";
import { errorResponse, ImmichError, isUuid, proxyImage } from "@/lib/immich";

const SIZES = ["thumbnail", "preview"];

/** Admin only: any asset in the library. Visitors use /api/photos/assets/... */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/immich/assets/[id]/thumbnail">
) {
  const denied = await adminGuard(request);
  if (denied) return denied;

  const { id } = await ctx.params;
  const size = new URL(request.url).searchParams.get("size") ?? "thumbnail";

  if (!SIZES.includes(size)) {
    return NextResponse.json(
      { error: { code: "bad_request", message: "Invalid size." } },
      { status: 400 }
    );
  }

  try {
    if (!isUuid(id)) throw new ImmichError("not_found");
    return await proxyImage(`/assets/${id}/thumbnail?size=${size}`);
  } catch (error) {
    return errorResponse(error);
  }
}
