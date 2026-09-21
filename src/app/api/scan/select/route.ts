import { NextResponse } from "next/server";
import { ImmichError, publicErrorResponse, getPersonSummary, toPublicPerson } from "@/lib/immich";
import { issueScanSession } from "@/lib/scan-session";
import { verifyToken } from "@/lib/tokens";

/**
 * Trades a candidate token for a session. The visitor can only pick among the
 * people the recognizer itself offered them: the token is signed by the server,
 * expires in minutes, and cannot be used as a session directly.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (typeof body?.token !== "string") throw new ImmichError("invalid_request");

    const candidate = verifyToken(body.token, "candidate");
    if (!candidate?.personId) throw new ImmichError("session_required");

    const person = toPublicPerson(await getPersonSummary(candidate.personId));
    const response = NextResponse.json({ person }, { headers: { "Cache-Control": "no-store" } });
    issueScanSession(response, request, candidate.personId);
    return response;
  } catch (error) {
    return publicErrorResponse(error);
  }
}
