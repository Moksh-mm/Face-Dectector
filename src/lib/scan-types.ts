import type { PublicPerson } from "@/lib/immich";

/**
 * What the browser learns from a scan. Deliberately contains no person ids,
 * similarity scores, embeddings or anything from the ML service: identity is
 * carried by the HttpOnly session cookie, which the page cannot read or edit.
 */

export type PublicCandidate = PublicPerson & {
  /** Opaque and short-lived; the only thing that can be traded for a session. */
  token: string;
  /** Face crop, inlined so no id-bearing image URL is needed before sign-in. */
  avatar: string;
};

export type ScanResult =
  | { status: "matched"; person: PublicPerson }
  | { status: "ambiguous"; candidates: PublicCandidate[] }
  | { status: "no_match" | "no_face" | "multiple_faces" };
