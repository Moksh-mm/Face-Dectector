import { ImmichError, isUuid } from "@/lib/immich";
import { requireScanSession, type ScanSession } from "@/lib/scan-session";
import { isValidAssetSignature } from "@/lib/tokens";

/**
 * Decides whether this visitor may fetch this asset. Three separate checks, in
 * this order, so the failure tells the browser the right thing to do:
 *
 *  1. a valid, unexpired scan session (else 401: scan again),
 *  2. a well-formed asset id (else 404),
 *  3. a signature that binds THIS asset to THIS session's person (else 403).
 *
 * The signature is only ever handed out by /api/photos/assets, for photos that
 * Immich itself lists under the session's person. Asking for any other asset,
 * including one that belongs to a different person, has no valid signature.
 */
export async function authorizeAsset(
  request: Request,
  assetId: string
): Promise<ScanSession> {
  const session = await requireScanSession();
  if (!isUuid(assetId)) throw new ImmichError("not_found");

  const signature = new URL(request.url).searchParams.get("sig");
  if (!isValidAssetSignature(session.personId, assetId, signature)) {
    throw new ImmichError("not_allowed");
  }
  return session;
}
