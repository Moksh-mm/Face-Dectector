import { MATCH_THRESHOLD, similarity } from "@/lib/face-recognition";
import type { FaceIndex } from "@/lib/face-index";

/**
 * Matches a query embedding against the face index.
 *
 * Both sides are unit-length, so cosine similarity is a plain dot product.
 * Scores are for server-side decisions only and are never sent to the browser.
 */

/** Two candidates this close to each other are too close to call. */
export const AMBIGUITY_MARGIN = 0.1;

/** Most candidates offered when a result is ambiguous. */
const MAX_AMBIGUOUS_CANDIDATES = 3;

export type Candidate = { personId: string; score: number };

export type MatchResult =
  | { status: "matched"; personId: string; score: number }
  | { status: "ambiguous"; candidates: Candidate[] }
  | { status: "no_match"; score: number | null };

/** Collapses one person's per-face similarities into a single score. */
export type PersonScorer = (scores: number[]) => number;

/** Strongest single reference face. Swap for top-k mean to experiment. */
export const bestFace: PersonScorer = (scores) => Math.max(...scores);

export type MatchOptions = {
  /** Skip this index position (leave-one-out evaluation). */
  excludeFaceIndex?: number;
  /** Skip every face of this person (open-set evaluation). */
  excludePersonId?: string;
  scorer?: PersonScorer;
};

/** Every person's score against the query, strongest first. */
export function rankPeople(
  embedding: number[],
  index: FaceIndex,
  { excludeFaceIndex, excludePersonId, scorer = bestFace }: MatchOptions = {}
): Candidate[] {
  const byPerson = new Map<string, number[]>();

  for (let i = 0; i < index.faces.length; i++) {
    const face = index.faces[i];
    if (i === excludeFaceIndex || face.personId === excludePersonId) continue;

    const scores = byPerson.get(face.personId);
    const score = similarity(embedding, face.embedding);
    if (scores) scores.push(score);
    else byPerson.set(face.personId, [score]);
  }

  return [...byPerson.entries()]
    .map(([personId, scores]) => ({ personId, score: scorer(scores) }))
    .sort((a, b) => b.score - a.score);
}

export function matchFace(
  embedding: number[],
  index: FaceIndex,
  options: MatchOptions = {}
): MatchResult {
  const ranked = rankPeople(embedding, index, options);
  const [top1, top2] = ranked;

  if (!top1 || top1.score < MATCH_THRESHOLD) {
    return { status: "no_match", score: top1?.score ?? null };
  }

  // A second confident candidate close behind the first means we cannot tell
  // them apart, so offer the choice instead of guessing.
  if (
    top2 &&
    top2.score >= MATCH_THRESHOLD &&
    top1.score - top2.score <= AMBIGUITY_MARGIN
  ) {
    const candidates = ranked
      .filter(
        (candidate) =>
          candidate.score >= MATCH_THRESHOLD &&
          top1.score - candidate.score <= AMBIGUITY_MARGIN
      )
      .slice(0, MAX_AMBIGUOUS_CANDIDATES);

    return { status: "ambiguous", candidates };
  }

  return { status: "matched", personId: top1.personId, score: top1.score };
}
