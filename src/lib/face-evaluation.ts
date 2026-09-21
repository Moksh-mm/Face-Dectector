import type { FaceIndex } from "@/lib/face-index";
import { matchFace } from "@/lib/face-matcher";

/**
 * Measures the matcher against the index's own labelled faces.
 *
 * Querying a face against an index that still contains it would match itself
 * at similarity 1.0 and prove nothing, so the query is always held out:
 *
 *  - Closed set (leave one face out): the person is still enrolled via their
 *    other faces. Measures accuracy for people the index knows.
 *  - Open set (leave one person out): all of that person's faces are removed,
 *    so the right answer is "no match". Measures how often a stranger would be
 *    wrongly identified as somebody else.
 *
 * Labels are Immich's own clustering, so the ground truth is only as good as
 * Immich's. Runs entirely server-side; nothing returned is an embedding.
 */

type ScoreSummary = { min: number; mean: number; max: number } | null;

export type EvaluationReport = {
  closedSet: {
    queries: number;
    skippedSingleFacePeople: number;
    correct: number;
    wrongPerson: number;
    ambiguousContainingCorrect: number;
    ambiguousMissingCorrect: number;
    noMatch: number;
    accuracy: number;
    wrongPersonRate: number;
    noMatchRate: number;
    /** Scores of correct matches: the low end is where accuracy is at risk. */
    correctScores: ScoreSummary;
    /** Scores of wrong matches: the high end is where false accepts hide. */
    wrongScores: ScoreSummary;
    /** A sample of the wrong-person matches, to inspect for split clusters. */
    wrongMatches: { expected: string; got: string }[];
  };
  openSet: {
    queries: number;
    correctlyRejected: number;
    falselyMatched: number;
    falselyAmbiguous: number;
    falseAcceptRate: number;
    /** Strongest similarity any stranger reached, matched or not. */
    highestImpostorScore: number | null;
  };
  matchTimeMs: { average: number; max: number; samples: number };
};

const summarise = (values: number[]): ScoreSummary =>
  values.length === 0
    ? null
    : {
        min: Math.min(...values),
        mean: values.reduce((a, b) => a + b, 0) / values.length,
        max: Math.max(...values),
      };

const round = (n: number, places = 4) => Number(n.toFixed(places));

export function evaluateIndex(index: FaceIndex): EvaluationReport {
  const faceCount = new Map<string, number>();
  for (const face of index.faces) {
    faceCount.set(face.personId, (faceCount.get(face.personId) ?? 0) + 1);
  }

  const timings: number[] = [];
  const timed = <T>(run: () => T): T => {
    const start = performance.now();
    const result = run();
    timings.push(performance.now() - start);
    return result;
  };

  // ---- closed set -----------------------------------------------------
  let queries = 0;
  let skipped = 0;
  let correct = 0;
  let wrong = 0;
  let ambiguousWith = 0;
  let ambiguousWithout = 0;
  let noMatch = 0;
  const correctScores: number[] = [];
  const wrongScores: number[] = [];
  const wrongMatches: { expected: string; got: string }[] = [];

  index.faces.forEach((face, i) => {
    // With no other face of theirs enrolled, a correct answer is impossible.
    if ((faceCount.get(face.personId) ?? 0) < 2) {
      skipped++;
      return;
    }
    queries++;

    const result = timed(() =>
      matchFace(face.embedding, index, { excludeFaceIndex: i })
    );

    if (result.status === "no_match") {
      noMatch++;
    } else if (result.status === "ambiguous") {
      if (result.candidates.some((c) => c.personId === face.personId)) {
        ambiguousWith++;
      } else {
        ambiguousWithout++;
      }
    } else if (result.personId === face.personId) {
      correct++;
      correctScores.push(result.score);
    } else {
      wrong++;
      wrongScores.push(result.score);
      if (wrongMatches.length < 20) {
        wrongMatches.push({ expected: face.personId, got: result.personId });
      }
    }
  });

  // ---- open set -------------------------------------------------------
  let openQueries = 0;
  let rejected = 0;
  let falseMatch = 0;
  let falseAmbiguous = 0;
  let highestImpostor: number | null = null;

  for (const face of index.faces) {
    openQueries++;
    const result = timed(() =>
      matchFace(face.embedding, index, { excludePersonId: face.personId })
    );

    const top =
      result.status === "matched"
        ? result.score
        : result.status === "ambiguous"
          ? result.candidates[0].score
          : result.score;
    if (top !== null && (highestImpostor === null || top > highestImpostor)) {
      highestImpostor = top;
    }

    if (result.status === "no_match") rejected++;
    else if (result.status === "matched") falseMatch++;
    else falseAmbiguous++;
  }

  const rate = (n: number, of: number) => (of === 0 ? 0 : round(n / of));

  return {
    closedSet: {
      queries,
      skippedSingleFacePeople: skipped,
      correct,
      wrongPerson: wrong,
      ambiguousContainingCorrect: ambiguousWith,
      ambiguousMissingCorrect: ambiguousWithout,
      noMatch,
      accuracy: rate(correct, queries),
      wrongPersonRate: rate(wrong, queries),
      noMatchRate: rate(noMatch, queries),
      correctScores: round3(summarise(correctScores)),
      wrongScores: round3(summarise(wrongScores)),
      wrongMatches,
    },
    openSet: {
      queries: openQueries,
      correctlyRejected: rejected,
      falselyMatched: falseMatch,
      falselyAmbiguous: falseAmbiguous,
      falseAcceptRate: rate(falseMatch + falseAmbiguous, openQueries),
      highestImpostorScore:
        highestImpostor === null ? null : round(highestImpostor),
    },
    matchTimeMs: {
      average: round(timings.reduce((a, b) => a + b, 0) / (timings.length || 1)),
      max: round(Math.max(0, ...timings)),
      samples: timings.length,
    },
  };
}

function round3(summary: ScoreSummary): ScoreSummary {
  return summary && {
    min: round(summary.min),
    mean: round(summary.mean),
    max: round(summary.max),
  };
}
