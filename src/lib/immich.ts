import { NextResponse } from "next/server";
import { configuredUrl, immichApiKey, intEnv } from "@/lib/config";

/** Raw person as returned by Immich. Never sent to the browser as-is. */
type ImmichPerson = {
  id: string;
  name: string;
  birthDate: string | null;
  isHidden: boolean;
  isFavorite?: boolean;
};

type PeopleResponse = {
  people: ImmichPerson[];
  hasNextPage?: boolean;
  total: number;
};

/** What the browser is allowed to see. */
export type Person = {
  id: string;
  name: string;
  isNamed: boolean;
  isFavorite: boolean;
};

/** A person plus how many assets they appear in (null if Immich won't say). */
export type PersonSummary = Person & { photoCount: number | null };

export type ImmichErrorCode =
  | "not_configured"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "upstream_error"
  | "unreachable"
  | "internal_error"
  | "ml_not_configured"
  | "ml_unreachable"
  | "ml_error"
  | "ml_invalid_response"
  | "invalid_request"
  | "invalid_image"
  | "unsupported_image"
  | "too_large"
  | "index_unavailable"
  | "session_required"
  | "session_not_configured"
  | "not_allowed"
  | "rate_limited";

/**
 * Detailed messages, for the ADMIN. Anything a visitor can reach goes through
 * describePublicError instead, which collapses the internal ones below.
 */
const ERRORS: Record<ImmichErrorCode, { status: number; message: string }> = {
  not_configured: { status: 500, message: "Immich is not configured on the server." },
  unauthorized: { status: 401, message: "Immich rejected the API key." },
  forbidden: {
    status: 403,
    message: "The API key does not have the required permission (person.read).",
  },
  not_found: { status: 404, message: "Not found." },
  upstream_error: { status: 502, message: "Immich returned an error." },
  unreachable: { status: 503, message: "Could not reach the Immich server." },
  internal_error: { status: 500, message: "Unexpected server error." },
  ml_not_configured: {
    status: 500,
    message: "The face recognition service is not configured on the server.",
  },
  ml_unreachable: {
    status: 503,
    message: "Could not reach the face recognition service.",
  },
  ml_error: {
    status: 502,
    message: "The face recognition service returned an error.",
  },
  ml_invalid_response: {
    status: 502,
    message: "The face recognition service returned an unexpected response.",
  },
  // Raised by the recognition endpoint for bad uploads. They share this map so
  // every API route reports errors in one { error: { code, message } } shape.
  invalid_request: { status: 400, message: "Send a single image in the 'image' field." },
  invalid_image: { status: 400, message: "That file isn't a readable image." },
  unsupported_image: { status: 415, message: "Use a JPEG, PNG or WebP image." },
  too_large: { status: 413, message: "That image is too large." },
  index_unavailable: {
    status: 503,
    message: "Face matching isn't ready yet. Ask an admin to build the face index.",
  },
  session_required: {
    status: 401,
    message: "Your session has expired. Please scan again.",
  },
  session_not_configured: {
    status: 500,
    message: "Sessions are not configured on the server.",
  },
  not_allowed: { status: 403, message: "You don't have access to that photo." },
  rate_limited: {
    status: 429,
    message: "Too many attempts. Please wait a moment and try again.",
  },
};

export class ImmichError extends Error {
  constructor(
    public readonly code: ImmichErrorCode,
    /** Short, safe diagnostic for the server log only: an HTTP status or errno. */
    public readonly detail?: string
  ) {
    super(code);
  }
}

/** Faults that are the visitor's doing, or routine: not worth a log line. */
const QUIET = new Set<ImmichErrorCode>([
  "not_found",
  "invalid_request",
  "invalid_image",
  "unsupported_image",
  "too_large",
  "session_required",
  "not_allowed",
  "rate_limited",
]);

/** Strips secrets and URLs from anything about to be logged. */
function scrub(text: string) {
  let out = text;
  for (const name of ["IMMICH_API_KEY", "SESSION_SECRET", "ADMIN_TOKEN"]) {
    const secret = process.env[name];
    if (secret && secret.length >= 8) out = out.split(secret).join("[redacted]");
  }
  return out.replace(/https?:\/\/[^\s"')]+/gi, "[url]").slice(0, 300);
}

// The same fault repeating (Immich down) must not flood the log.
const lastLogged = new Map<string, number>();
const LOG_INTERVAL_MS = 10_000;

function logFailure(message: string) {
  const now = Date.now();
  if (now - (lastLogged.get(message) ?? 0) < LOG_INTERVAL_MS) return;
  lastLogged.set(message, now);
  if (lastLogged.size > 200) lastLogged.clear();
  console.error(`[face-finder] ${message}`);
}

/**
 * Maps any thrown value to { status, code, message } for the admin, and logs
 * operational faults. The log carries a code and a short diagnostic only:
 * never a URL, a secret, an image or an embedding.
 */
export function describeError(error: unknown) {
  const code = error instanceof ImmichError ? error.code : "internal_error";

  if (error instanceof ImmichError) {
    if (!QUIET.has(error.code)) {
      logFailure(error.detail ? `${error.code} (${scrub(error.detail)})` : error.code);
    }
  } else {
    // Name and message only: the whole object could carry request context, and
    // requests to the recognition endpoint contain a face image.
    logFailure(
      scrub(error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error")
    );
  }
  return { code, ...ERRORS[code] };
}

export function errorResponse(error: unknown) {
  const { code, status, message } = describeError(error);
  return NextResponse.json({ error: { code, message } }, { status });
}

/** Codes a visitor may see as they are: they describe the visitor's own request. */
const PUBLIC_AS_IS = new Set<ImmichErrorCode>([
  "not_found",
  "invalid_request",
  "invalid_image",
  "unsupported_image",
  "too_large",
  "session_required",
  "not_allowed",
  "rate_limited",
]);

/** Temporary faults in something behind the app: worth retrying shortly. */
const PUBLIC_UNAVAILABLE = new Set<ImmichErrorCode>([
  "upstream_error",
  "unreachable",
  "ml_unreachable",
  "ml_error",
  "ml_invalid_response",
  "index_unavailable",
]);

/**
 * What a visitor is told. Internal faults (Immich, the ML service, the index,
 * configuration) all collapse into two generic answers, so the response never
 * reveals what the app is built from or what is misconfigured. The specific
 * cause is in the server log.
 */
export function describePublicError(error: unknown): {
  code: string;
  status: number;
  message: string;
} {
  const detailed = describeError(error);
  const code = detailed.code as ImmichErrorCode;

  if (PUBLIC_AS_IS.has(code)) return detailed;
  if (PUBLIC_UNAVAILABLE.has(code)) {
    return {
      code: "service_unavailable",
      status: 503,
      message: "We couldn't complete that right now. Please try again in a moment.",
    };
  }
  return {
    code: "server_error",
    status: 500,
    message: "Something went wrong on our side. Please try again later.",
  };
}

export function publicErrorResponse(error: unknown) {
  const { code, status, message } = describePublicError(error);
  const response = NextResponse.json({ error: { code, message } }, { status });
  if (status === 503) response.headers.set("Retry-After", "5");
  return response;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string) {
  return UUID.test(value);
}

/**
 * How long to wait for Immich to START answering. Streaming bodies are not
 * capped. This is the limit for requests someone is waiting on, so it is short:
 * better a clear "try again" than a browser that hangs.
 */
const requestTimeoutMs = () => intEnv("IMMICH_REQUEST_TIMEOUT_MS", 8000, 500, 60_000);

/**
 * For the index rebuild, which nobody is waiting on. A busy Immich (catching up
 * on thumbnails and face detection) can take 30 s to answer a large page, and a
 * background job should wait rather than abandon the build.
 */
export const backgroundTimeoutMs = () =>
  intEnv("IMMICH_BACKGROUND_TIMEOUT_MS", 120_000, 1000, 600_000);

/** Short enough to be invisible, long enough for a dropped connection to clear. */
const RETRY_PAUSE_MS = 150;

/** Statuses that mean "briefly unavailable", not "your request is wrong". */
const TRANSIENT_STATUS = new Set([502, 503, 504]);

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function failureDetail(error: unknown) {
  const e = error as { name?: string; cause?: { code?: string } } | null;
  if (e?.name === "AbortError") return "timeout";
  return e?.cause?.code ?? e?.name ?? "error";
}

/**
 * Server-side only: attaches the API key. Throws ImmichError on any failure.
 *
 * Failure handling:
 *  - A connection failure or a 502/503/504 is retried ONCE after a short pause.
 *    Only reads are retried: GETs, and POSTs the caller marks `retry` (Immich's
 *    search is a POST but changes nothing).
 *  - A timeout is not retried: Immich is stalled, and asking again would just
 *    stall twice. Other errors (401, 404, 500...) are not retried either.
 *  - A healthy request pays for one timer and nothing else.
 */
export async function immichFetch(
  path: string,
  init: RequestInit = {},
  options: { retry?: boolean; timeoutMs?: number } = {}
) {
  const base = configuredUrl("IMMICH_URL");
  const key = immichApiKey();
  if (!base || !key) throw new ImmichError("not_configured");

  const method = (init.method ?? "GET").toUpperCase();
  const maxAttempts = method === "GET" || options.retry ? 2 : 1;
  const timeoutMs = options.timeoutMs ?? requestTimeoutMs();
  let lastFailure = "error";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${base}/api${path}`, {
        ...init,
        headers: { ...init.headers, "x-api-key": key },
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (error) {
      lastFailure = failureDetail(error);
      if (lastFailure === "timeout" || attempt === maxAttempts) {
        throw new ImmichError("unreachable", lastFailure);
      }
      await pause(RETRY_PAUSE_MS);
      continue;
    } finally {
      // Headers are in: from here the body may stream for as long as it needs.
      clearTimeout(timer);
    }

    if (TRANSIENT_STATUS.has(response.status) && attempt < maxAttempts) {
      lastFailure = `http ${response.status}`;
      await response.body?.cancel();
      await pause(RETRY_PAUSE_MS);
      continue;
    }

    if (response.ok) return response;

    const detail = `http ${response.status}`;
    if (response.status === 401) throw new ImmichError("unauthorized", detail);
    if (response.status === 403) throw new ImmichError("forbidden", detail);
    // Immich answers 400 ("Not found or no person.read access") for unknown ids.
    if (response.status === 404 || response.status === 400) {
      throw new ImmichError("not_found", detail);
    }
    throw new ImmichError("upstream_error", detail);
  }

  throw new ImmichError("unreachable", lastFailure);
}

function toPerson(p: ImmichPerson): Person {
  return {
    id: p.id,
    name: p.name,
    isNamed: p.name.trim() !== "",
    isFavorite: p.isFavorite ?? false,
  };
}

export async function getAllPeople(
  options: { timeoutMs?: number } = {}
): Promise<Person[]> {
  const people: Person[] = [];

  for (let page = 1; ; page++) {
    const response = await immichFetch(
      `/people?withHidden=false&size=500&page=${page}`,
      {},
      options
    );
    const data: PeopleResponse = await response.json();
    people.push(...data.people.map(toPerson));

    if (!data.hasNextPage) break;
  }

  return people;
}

export async function getPerson(id: string): Promise<Person> {
  if (!isUuid(id)) throw new ImmichError("not_found");
  const response = await immichFetch(`/people/${id}`);
  return toPerson(await response.json());
}

/** Streams an image from Immich to the browser without exposing the API key. */
export async function proxyImage(
  path: string,
  cacheControl = "private, max-age=3600"
) {
  const upstream = await immichFetch(path);
  if (!upstream.body) throw new ImmichError("upstream_error");

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": cacheControl,
    },
  });
}

export async function getPersonSummary(id: string): Promise<PersonSummary> {
  const [person, photoCount] = await Promise.all([
    getPerson(id),
    getPersonAssetCount(id),
  ]);
  return { ...person, photoCount };
}

/** What a scanning visitor sees about their own match. Never includes an id. */
export type PublicPerson = { name: string | null; photoCount: number | null };

export const toPublicPerson = (person: PersonSummary): PublicPerson => ({
  name: person.isNamed ? person.name : null,
  photoCount: person.photoCount,
});

/** A person's face crop as a data URL, for embedding in a JSON response. */
export async function getPersonThumbnailDataUrl(id: string): Promise<string> {
  if (!isUuid(id)) throw new ImmichError("not_found");

  const response = await immichFetch(`/people/${id}/thumbnail`);
  const type = response.headers.get("content-type") ?? "image/jpeg";
  const bytes = Buffer.from(await response.arrayBuffer());
  return `data:${type};base64,${bytes.toString("base64")}`;
}

/**
 * What the browser is allowed to see about an asset. Deliberately excludes
 * originalPath, checksum, deviceId, ownerId and other internal metadata.
 */
export type Asset = {
  id: string;
  type: "IMAGE" | "VIDEO";
  originalFileName: string;
  fileCreatedAt: string;
  width: number | null;
  height: number | null;
  /** Only on the visitor-facing list: binds this asset to the session's person. */
  sig?: string;
};

type ImmichAsset = {
  id: string;
  type: string;
  originalFileName: string;
  fileCreatedAt: string;
  width?: number | null;
  height?: number | null;
};

type SearchResponse = {
  assets: { items: ImmichAsset[]; nextPage: string | null };
};

export const ASSETS_PAGE_SIZE = 30;

export type PersonAssetsPage = {
  assets: Asset[];
  /** Next page number, or null when this was the last page. */
  nextPage: number | null;
};

/**
 * One page of the assets a person appears in, newest first.
 *
 * Uses POST /api/search/metadata with `personIds` (needs asset.read). Its
 * `nextPage` is a page number as a string, or null on the last page. The
 * response's own `total` only counts the current page, so it is ignored —
 * getPersonAssetCount is the real total.
 */
export async function getPersonAssets(
  personId: string,
  page = 1
): Promise<PersonAssetsPage> {
  if (!isUuid(personId)) throw new ImmichError("not_found");

  const response = await immichFetch("/search/metadata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      personIds: [personId],
      page,
      size: ASSETS_PAGE_SIZE,
      order: "desc",
    }),
  }, { retry: true });
  const { assets }: SearchResponse = await response.json();

  return {
    assets: assets.items.map((a) => ({
      id: a.id,
      type: a.type === "VIDEO" ? "VIDEO" : "IMAGE",
      originalFileName: a.originalFileName,
      fileCreatedAt: a.fileCreatedAt,
      width: a.width ?? null,
      height: a.height ?? null,
    })),
    nextPage: assets.nextPage ? Number(assets.nextPage) : null,
  };
}

/**
 * How many assets a person appears in, via GET /people/{id}/statistics
 * (needs person.statistics). Returns null rather than throwing: the count is a
 * nicety, and losing it should not cost us the gallery.
 */
export async function getPersonAssetCount(
  personId: string
): Promise<number | null> {
  if (!isUuid(personId)) return null;

  try {
    const response = await immichFetch(`/people/${personId}/statistics`);
    return (await response.json()).assets ?? null;
  } catch {
    return null;
  }
}
