/**
 * Validated access to configuration. Every helper fails SAFE: a missing,
 * malformed, placeholder or too-short value is treated as "not configured",
 * never quietly accepted. Nothing here logs a value.
 */

/** Values people paste in and forget to replace. */
const PLACEHOLDER = /^(your[_-]|change-?me|placeholder|replace[_-]?me|example|todo|xxx)|_here$/i;

export function looksLikePlaceholder(value: string) {
  return PLACEHOLDER.test(value.trim());
}

/**
 * A usable secret: long enough, not a placeholder, and not something like
 * "aaaaaaaaaaaaaaaa" that is long but carries no entropy.
 */
export function isStrongSecret(value: string | undefined, minLength: number): value is string {
  if (!value || value.length < minLength) return false;
  if (looksLikePlaceholder(value)) return false;
  return new Set(value).size >= 8;
}

/** An integer setting, clamped to a sane range; junk falls back to the default. */
export function intEnv(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * An http(s) base URL without a trailing slash, or null. URLs with embedded
 * credentials are rejected: they would leak into logs and error messages.
 */
export function configuredUrl(name: string): string | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/** The Immich API key, or null when it is missing, a placeholder, or too short. */
export function immichApiKey(): string | null {
  const key = process.env.IMMICH_API_KEY?.trim();
  return isStrongSecret(key, 16) ? key : null;
}
