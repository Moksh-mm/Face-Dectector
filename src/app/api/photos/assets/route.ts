import { NextResponse } from "next/server";
import { publicErrorResponse, getPersonAssets } from "@/lib/immich";
import { requireScanSession } from "@/lib/scan-session";
import { assetSignature } from "@/lib/tokens";

/**
 * The visitor's own photos, one page at a time. There is no person id in the
 * URL: whose photos these are comes only from the signed session cookie, so
 * there is nothing to edit to see someone else's.
 */
export async function GET(request: Request) {
  const page = Number(new URL(request.url).searchParams.get("page") ?? "1");

  if (!Number.isInteger(page) || page < 1) {
    return NextResponse.json(
      { error: { code: "bad_request", message: "Invalid page." } },
      { status: 400 }
    );
  }

  try {
    const { personId } = await requireScanSession();
    const { assets, nextPage } = await getPersonAssets(personId, page);

    return NextResponse.json(
      {
        assets: assets.map((asset) => ({
          ...asset,
          // Proof that this asset came from this person's own list.
          sig: assetSignature(personId, asset.id),
        })),
        nextPage,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return publicErrorResponse(error);
  }
}
