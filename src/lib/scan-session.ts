import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { ImmichError } from "@/lib/immich";
import { signToken, verifyToken } from "@/lib/tokens";

/**
 * The visitor's temporary "you are person X" session.
 *
 * It lives in an HttpOnly cookie rather than in a URL. A token in a URL leaks
 * into browser history, screenshots, referrers and server logs, and can be
 * edited or shared; a cookie the page's JavaScript cannot even read does none
 * of that. The person id is inside the signed token, so the browser has no id
 * to change and no way to ask for anyone else's photos.
 */

export const SCAN_COOKIE = "scan_session";

/** How long a scan keeps working. Long enough to browse, short enough to matter. */
const DEFAULT_TTL_MINUTES = 30;

export function scanSessionTtlSeconds() {
  const minutes = Number(process.env.SCAN_SESSION_TTL_MINUTES);
  const bounded = Number.isFinite(minutes) && minutes > 0 ? Math.min(minutes, 240) : DEFAULT_TTL_MINUTES;
  return Math.round(bounded * 60);
}

/** Candidates are only good for the moment the visitor spends choosing. */
export const CANDIDATE_TTL_SECONDS = 5 * 60;

/** Secure cookies need HTTPS; over plain HTTP (LAN testing) they would be dropped. */
function isHttps(request: Request) {
  if (new URL(request.url).protocol === "https:") return true;
  return request.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https";
}

export function cookieOptions(request: Request, maxAge: number, sameSite: "lax" | "strict" = "lax") {
  return {
    httpOnly: true,
    secure: isHttps(request),
    sameSite,
    path: "/",
    maxAge,
  } as const;
}

export function issueScanSession(response: NextResponse, request: Request, personId: string) {
  const ttl = scanSessionTtlSeconds();
  response.cookies.set(SCAN_COOKIE, signToken("scan", ttl, personId), cookieOptions(request, ttl));
}

export function clearScanSession(response: NextResponse, request: Request) {
  response.cookies.set(SCAN_COOKIE, "", cookieOptions(request, 0));
}

export type ScanSession = { personId: string; expiresAt: number };

/** The current visitor's session, or null if there is none or it is invalid. */
export async function getScanSession(): Promise<ScanSession | null> {
  const store = await cookies();
  const verified = verifyToken(store.get(SCAN_COOKIE)?.value, "scan");
  if (!verified?.personId) return null;
  return { personId: verified.personId, expiresAt: verified.expiresAt };
}

/** For route handlers: the session, or a 401 the browser turns into "scan again". */
export async function requireScanSession(): Promise<ScanSession> {
  const session = await getScanSession();
  if (!session) throw new ImmichError("session_required");
  return session;
}
