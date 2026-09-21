import { adminGuard } from "@/lib/admin-auth";
import { errorResponse, ImmichError, isUuid, proxyImage } from "@/lib/immich";

/** Admin only: the full-resolution file for any asset. */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/immich/assets/[id]/original">
) {
  const denied = await adminGuard(request);
  if (denied) return denied;

  const { id } = await ctx.params;

  try {
    if (!isUuid(id)) throw new ImmichError("not_found");
    return await proxyImage(`/assets/${id}/original`);
  } catch (error) {
    return errorResponse(error);
  }
}
