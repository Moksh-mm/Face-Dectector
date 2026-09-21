import { createHmac, timingSafeEqual } from "node:crypto";
import { isStrongSecret } from "@/lib/config";
import { ImmichError } from "@/lib/immich";

/**
 * Stateless signed tokens: no database, nothing to store or clean up.
 *
 * A token is `base64url(payload).base64url(hmac)`. The payload names its own
 * `kind`, and that is covered by the signature, so a token issued for one
 * purpose (say, choosing among candidates) is rejected everywhere else (say,
 * as a photo session). Server-side only: SESSION_SECRET never leaves the server.
 */

export type TokenKind = "scan" | "candidate" | "admin";

type Payload = { k: TokenKind; p?: string; exp: number };

const MIN_SECRET_LENGTH = 32;

function secret() {
  const value = process.env.SESSION_SECRET;
  // Missing, short, a placeholder, or low-entropy: refuse rather than sign with it.
  if (!isStrongSecret(value, MIN_SECRET_LENGTH)) {
    throw new ImmichError("session_not_configured");
  }
  return value;
}

const b64 = (input: string | Buffer) => Buffer.from(input).toString("base64url");
const mac = (data: string) => createHmac("sha256", secret()).update(data).digest();

function equal(a: Buffer, b: Buffer) {
  return a.length === b.length && timingSafeEqual(a, b);
}

/** `personId` is optional because the admin token is not about any person. */
export function signToken(kind: TokenKind, ttlSeconds: number, personId?: string) {
  const payload: Payload = {
    k: kind,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    ...(personId ? { p: personId } : {}),
  };
  const body = b64(JSON.stringify(payload));
  return `${body}.${b64(mac(body))}`;
}

/**
 * Returns the payload if the token is genuine, unexpired and of the expected
 * kind; otherwise null. Never throws on bad input: a malformed or forged token
 * is just "not a valid token".
 */
export function verifyToken(
  token: string | undefined | null,
  kind: TokenKind
): { personId?: string; expiresAt: number } | null {
  if (!token) return null;

  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;

  let expected: Buffer;
  try {
    expected = mac(body);
  } catch (error) {
    // A missing secret is a server fault, not a bad token: surface it.
    if (error instanceof ImmichError) throw error;
    return null;
  }
  if (!equal(Buffer.from(signature, "base64url"), expected)) return null;

  let payload: Payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (payload.k !== kind) return null;
  if (typeof payload.exp !== "number" || payload.exp <= Date.now() / 1000) {
    return null;
  }
  return { personId: payload.p, expiresAt: payload.exp };
}

/**
 * Binds one asset to one person. The server issues this when it lists a
 * person's photos, and demands it back when the browser asks for the image, so
 * asking for an asset that was never in your own list fails without a lookup
 * against Immich for every thumbnail. Only meaningful together with a valid
 * scan session for the same person.
 */
export function assetSignature(personId: string, assetId: string) {
  return b64(mac(`asset|${personId}|${assetId}`)).slice(0, 32);
}

export function isValidAssetSignature(
  personId: string,
  assetId: string,
  supplied: string | null
) {
  if (!supplied) return false;
  return equal(Buffer.from(supplied), Buffer.from(assetSignature(personId, assetId)));
}
