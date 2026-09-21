import { NextResponse } from "next/server";
import { publicErrorResponse, proxyImage } from "@/lib/immich";
import { authorizeAsset } from "@/lib/photo-access";

const SIZES = ["thumbnail", "preview"];

/** A photo from the visitor's own list. See authorizeAsset for the checks. */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/photos/assets/[id]/thumbnail">
) {
  const { id } = await ctx.params;
  const size = new URL(request.url).searchParams.get("size") ?? "thumbnail";

  if (!SIZES.includes(size)) {
    return NextResponse.json(
      { error: { code: "bad_request", message: "Invalid size." } },
      { status: 400 }
    );
  }

  try {
    await authorizeAsset(request, id);
    // Private to this browser, and short-lived so a shared device does not
    // keep one visitor's photos around for the next.
    return await proxyImage(`/assets/${id}/thumbnail?size=${size}`, "private, max-age=300");
  } catch (error) {
    return publicErrorResponse(error);
  }
}
