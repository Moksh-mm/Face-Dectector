import { publicErrorResponse, proxyImage } from "@/lib/immich";
import { authorizeAsset } from "@/lib/photo-access";

/** The full-resolution file, for the viewer's Download and Share buttons. */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/photos/assets/[id]/original">
) {
  const { id } = await ctx.params;

  try {
    await authorizeAsset(request, id);
    return await proxyImage(`/assets/${id}/original`, "private, no-store");
  } catch (error) {
    return publicErrorResponse(error);
  }
}
