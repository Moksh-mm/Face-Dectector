import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/admin-auth";
import { errorResponse, getPersonSummary } from "@/lib/immich";

/** Admin only: one person and their photo count. */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/immich/people/[id]">
) {
  const denied = await adminGuard(request);
  if (denied) return denied;

  const { id } = await ctx.params;

  try {
    return NextResponse.json(await getPersonSummary(id));
  } catch (error) {
    return errorResponse(error);
  }
}
