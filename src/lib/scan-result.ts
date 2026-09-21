import {
  getPersonSummary,
  getPersonThumbnailDataUrl,
  toPublicPerson,
} from "@/lib/immich";
import type { Recognition } from "@/lib/recognize";
import { CANDIDATE_TTL_SECONDS } from "@/lib/scan-session";
import type { ScanResult } from "@/lib/scan-types";
import { signToken } from "@/lib/tokens";

/**
 * Turns the recognizer's internal outcome (which carries person ids) into the
 * public one. Also reports who matched, so the caller can start a session; that
 * id stays on the server.
 */
export async function toScanResult(
  recognition: Recognition
): Promise<{ result: ScanResult; matchedPersonId?: string }> {
  switch (recognition.status) {
    case "matched": {
      const person = toPublicPerson(await getPersonSummary(recognition.personId));
      return {
        result: { status: "matched", person },
        matchedPersonId: recognition.personId,
      };
    }

    case "ambiguous": {
      const candidates = await Promise.all(
        recognition.candidates.map(async ({ personId }) => ({
          ...toPublicPerson(await getPersonSummary(personId)),
          token: signToken("candidate", CANDIDATE_TTL_SECONDS, personId),
          avatar: await getPersonThumbnailDataUrl(personId),
        }))
      );
      return { result: { status: "ambiguous", candidates } };
    }

    default:
      return { result: { status: recognition.status } };
  }
}
