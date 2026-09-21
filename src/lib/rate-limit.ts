import { isIP } from "node:net";
import { intEnv } from "@/lib/config";
import { ImmichError, publicErrorResponse } from "@/lib/immich";

/**
 * In-memory rate limiting for a single Node.js server. No Redis: state lives in
 * this process, which is exactly right for one server and wrong for several
 * (each instance would count separately; see DEPLOYMENT.md).
 *
 * WHO IS "THE CLIENT"?
 * Next.js only fills in x-forwarded-for when the caller did not send one, so
 * with no proxy in front, that header is whatever the client says it is. It
 * cannot be trusted on its own. So:
 *
 *  - TRUSTED_PROXY_HOPS=N (N >= 1): a reverse proxy YOU control appends the
 *    address it saw. The client is the Nth entry from the RIGHT; anything a
 *    client wrote in front of that is ignored.
 *  - TRUSTED_PROXY_HOPS=0 (default): there is no proxy to trust, so the header
 *    is used only as a best-effort key.
 *
 * Either way the GLOBAL limit, which depends on no header, is the real ceiling
 * on how much work anyone (or everyone together) can cause.
 */

/** Sliding-window counter: at most `limit` events in any `windowMs`. */
class SlidingWindow {
  private hits = new Map<string, number[]>();
  private operations = 0;

  constructor(
    readonly limit: number,
    readonly windowMs: number,
    // A flood of made-up keys must not grow memory without bound.
    private readonly maxKeys = 10_000
  ) {}

  private live(key: string, now: number) {
    const list = this.hits.get(key);
    if (!list) return [];

    const cutoff = now - this.windowMs;
    while (list.length && list[0] <= cutoff) list.shift();
    if (list.length === 0) {
      this.hits.delete(key);
      return [];
    }
    return list;
  }

  count(key: string, now = Date.now()) {
    return this.live(key, now).length;
  }

  /** Seconds until this key may act again; 0 if it may act now. */
  retryAfterSeconds(key: string, now = Date.now()) {
    const list = this.live(key, now);
    if (list.length < this.limit) return 0;
    return Math.max(1, Math.ceil((list[0] + this.windowMs - now) / 1000));
  }

  add(key: string, now = Date.now()) {
    const list = this.live(key, now);
    list.push(now);
    this.hits.delete(key); // re-insert so the oldest keys are evicted first
    this.hits.set(key, list);
    this.tidy(now);
  }

  /** Counts the event if allowed. */
  hit(key: string, now = Date.now()) {
    const retryAfterSeconds = this.retryAfterSeconds(key, now);
    if (retryAfterSeconds > 0) return { allowed: false, retryAfterSeconds };
    this.add(key, now);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  clear(key: string) {
    this.hits.delete(key);
  }

  private tidy(now: number) {
    if (++this.operations % 256 === 0) {
      for (const key of this.hits.keys()) this.live(key, now);
    }
    while (this.hits.size > this.maxKeys) {
      const oldest = this.hits.keys().next().value;
      if (oldest === undefined) break;
      this.hits.delete(oldest);
    }
  }
}

// Route bundles can each get their own copy of this module; the counters must
// be shared, or every route would count separately. globalThis is one per process.
const registry = globalThis as unknown as {
  __faceFinderLimiters?: Map<string, SlidingWindow>;
};

function limiter(name: string, limit: number, windowMs: number) {
  const all = (registry.__faceFinderLimiters ??= new Map());
  const id = `${name}:${limit}:${windowMs}`;

  let found = all.get(id);
  if (!found) {
    found = new SlidingWindow(limit, windowMs);
    all.set(id, found);
  }
  return found;
}

/** IPv6 clients get a whole /64 to themselves, so rotating within it buys nothing. */
function normalizeAddress(value: string | undefined): string | null {
  if (!value) return null;

  let address = value.trim().replace(/^\[|\]$/g, "");
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(address)) address = address.replace(/:\d+$/, "");

  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) address = mapped[1];

  const kind = isIP(address);
  if (kind === 0) return null;
  if (kind === 4) return address;

  const halves = address.split("::");
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length > 1 && halves[1] ? halves[1].split(":") : [];
  const groups =
    halves.length > 1
      ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right]
      : left;

  return `${groups
    .slice(0, 4)
    .map((group) => (parseInt(group || "0", 16) || 0).toString(16))
    .join(":")}::/64`;
}

/** Which client is this? See the note at the top of the file. */
export function clientKey(request: Request): string {
  const hops = intEnv("TRUSTED_PROXY_HOPS", 0, 0, 5);
  const entries = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const chosen = hops >= 1 ? entries[entries.length - hops] : entries[entries.length - 1];
  return normalizeAddress(chosen) ?? "unknown";
}

/** A 429 with the generic message and a Retry-After the browser can honour. */
export function tooManyRequests(retryAfterSeconds: number) {
  const response = publicErrorResponse(new ImmichError("rate_limited"));
  response.headers.set("Retry-After", String(Math.max(1, retryAfterSeconds)));
  response.headers.set("Cache-Control", "no-store");
  return response;
}

const windowMs = () => intEnv("RATE_LIMIT_WINDOW_SECONDS", 60, 1, 3600) * 1000;

/**
 * Face recognition costs the ML service ~1 s of CPU per call, so it is the
 * expensive route. Every attempt counts, successful or not, so a bad upload
 * cannot be retried for free.
 *
 * Defaults: 10 per minute per client, 60 per minute across everyone.
 */
export function limitRecognize(request: Request): Response | null {
  const perClient = limiter(
    "recognize",
    intEnv("RATE_LIMIT_RECOGNIZE_PER_MINUTE", 10, 1, 100_000),
    windowMs()
  ).hit(clientKey(request));
  if (!perClient.allowed) return tooManyRequests(perClient.retryAfterSeconds);

  const overall = limiter(
    "recognize-global",
    intEnv("RATE_LIMIT_RECOGNIZE_GLOBAL_PER_MINUTE", 60, 1, 100_000),
    windowMs()
  ).hit("all");
  if (!overall.allowed) return tooManyRequests(overall.retryAfterSeconds);

  return null;
}

/**
 * Failed admin sign-ins, per client: 5 in 15 minutes by default. Only FAILURES
 * are counted, and a success clears the count, so the real administrator is
 * not slowed down. Requests carrying a valid admin cookie never reach this.
 */
export function adminFailures() {
  return limiter(
    "admin-failures",
    intEnv("RATE_LIMIT_ADMIN_FAILURES", 5, 1, 1000),
    intEnv("RATE_LIMIT_ADMIN_WINDOW_SECONDS", 900, 1, 86_400) * 1000
  );
}
