import { publicErrorResponse, proxyImage } from "@/lib/immich";
import { requireScanSession } from "@/lib/scan-session";

/** The visitor's own face crop. No id in the URL: it comes from the session. */
export async function GET() {
  try {
    const { personId } = await requireScanSession();
    return await proxyImage(`/people/${personId}/thumbnail`, "private, no-store");
  } catch (error) {
    return publicErrorResponse(error);
  }
}
