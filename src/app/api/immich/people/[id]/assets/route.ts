import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/admin-auth";
import { errorResponse, getPersonAssets } from "@/lib/immich";

/** Admin only: any person's photos. Visitors use /api/photos/assets instead. */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/immich/people/[id]/assets">
) {
  const denied = await adminGuard(request);
  if (denied) return denied;

  const { id } = await ctx.params;
  const page = Number(new URL(request.url).searchParams.get("page") ?? "1");

  if (!Number.isInteger(page) || page < 1) {
    return NextResponse.json(
      { error: { code: "bad_request", message: "Invalid page." } },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(await getPersonAssets(id, page));
  } catch (error) {
    return errorResponse(error);
  }
}
