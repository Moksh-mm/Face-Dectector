import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isStrongSecret } from "@/lib/config";
import { ImmichError, errorResponse } from "@/lib/immich";
import { adminFailures, clientKey, tooManyRequests } from "@/lib/rate-limit";
import { cookieOptions } from "@/lib/scan-session";
import { signToken, verifyToken } from "@/lib/tokens";

/**
 * Admin access for /admin, /people and every /api/immich and /api/admin route.
 *
 * Deliberately small: one shared secret (ADMIN_TOKEN), exchanged once for a
 * signed HttpOnly cookie so browser pages and <img> tags work, or sent as an
 * `x-admin-token` header by scripts. Not a user-account system.
 *
 * Guessing the secret is limited the same way on both doors (the sign-in form
 * and the header): five wrong attempts per client per 15 minutes, then 429.
 * Only WRONG attempts count; a valid cookie never touches the limiter, and a
 * correct sign-in clears the client's count.
 */

export const ADMIN_COOKIE = "admin_session";
const ADMIN_TTL_SECONDS = 8 * 60 * 60;

/** Slows down guessing, and makes a wrong token cost the same as a right one. */
const WRONG_TOKEN_DELAY_MS = 500;

/** The configured secret, or null when it is missing, a placeholder, or too short. */
function configuredToken(): string | null {
  const token = process.env.ADMIN_TOKEN;
  return isStrongSecret(token, 16) ? token : null;
}

/** Compares digests so neither the content nor the length of the secret leaks. */
function tokenMatches(supplied: string, expected: string) {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(supplied), digest(expected));
}

const deny = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message } }, { status });

const notConfigured = () =>
  deny(503, "admin_not_configured", "ADMIN_TOKEN is missing or too weak on the server.");

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** True when this request carries a valid admin cookie. For pages and layouts. */
export async function isAdmin() {
  try {
    const store = await cookies();
    return verifyToken(store.get(ADMIN_COOKIE)?.value, "admin") !== null;
  } catch (error) {
    // No usable SESSION_SECRET means no cookie can be genuine.
    if (error instanceof ImmichError) return false;
    throw error;
  }
}

/** Returns a response to send back when the request is not from an admin. */
export async function adminGuard(request: Request): Promise<NextResponse | null> {
  const expected = configuredToken();
  if (!expected) return notConfigured();

  // A valid cookie is the normal path, and is never rate limited.
  if (await isAdmin()) return null;

  const header = request.headers.get("x-admin-token");
  // No credentials at all is not a guess, so it is not counted (otherwise
  // anyone could lock the administrator out just by browsing).
  if (!header) return deny(401, "unauthorized", "Admin sign-in required.");

  const client = clientKey(request);
  const wait = adminFailures().retryAfterSeconds(client);
  if (wait > 0) return tooManyRequests(wait);

  if (tokenMatches(header, expected)) {
    adminFailures().clear(client);
    return null;
  }

  adminFailures().add(client);
  await delay(WRONG_TOKEN_DELAY_MS);
  return deny(401, "unauthorized", "Admin sign-in required.");
}

/** Exchanges the shared secret for an admin cookie. */
export async function signInAdmin(request: Request, supplied: string) {
  const client = clientKey(request);

  // Locked out: refused even if this attempt would have been right, or the
  // lockout would only slow an attacker down, not stop them.
  const wait = adminFailures().retryAfterSeconds(client);
  if (wait > 0) return tooManyRequests(wait);

  const expected = configuredToken();
  if (!expected) return notConfigured();

  if (!supplied || !tokenMatches(supplied, expected)) {
    adminFailures().add(client);
    await delay(WRONG_TOKEN_DELAY_MS);
    // The same answer however close the guess was.
    return deny(401, "unauthorized", "Invalid admin token.");
  }

  adminFailures().clear(client);

  try {
    const response = NextResponse.json({ ok: true });
    response.cookies.set(
      ADMIN_COOKIE,
      signToken("admin", ADMIN_TTL_SECONDS),
      cookieOptions(request, ADMIN_TTL_SECONDS, "strict")
    );
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

export function signOutAdmin(request: Request) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, "", cookieOptions(request, 0, "strict"));
  return response;
}
