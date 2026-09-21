import { adminGuard } from "@/lib/admin-auth";
import { errorResponse, ImmichError, isUuid, proxyImage } from "@/lib/immich";

/** Admin only: any person's face crop. */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/immich/people/[id]/thumbnail">
) {
  const denied = await adminGuard(request);
  if (denied) return denied;

  const { id } = await ctx.params;

  try {
    if (!isUuid(id)) throw new ImmichError("not_found");
    return await proxyImage(`/people/${id}/thumbnail`);
  } catch (error) {
    return errorResponse(error);
  }
}
