import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/admin-auth";
import { errorResponse, immichFetch } from "@/lib/immich";

/** Admin only: checks the server can reach Immich. Reveals server version info. */
export async function GET(request: Request) {
  const denied = await adminGuard(request);
  if (denied) return denied;

  try {
    const response = await immichFetch("/server/about");
    return NextResponse.json({
      success: true,
      status: response.status,
      data: await response.json(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
