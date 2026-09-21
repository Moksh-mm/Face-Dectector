import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AssetGallery } from "@/components/asset-gallery";
import { AlertIcon } from "@/components/icons";
import { PersonAvatar } from "@/components/person-avatar";
import { ScanAgainButton } from "@/components/scan-again-button";
import { SiteHeader } from "@/components/site-header";
import { StateCard } from "@/components/state-card";
import {
  describePublicError,
  getPersonSummary,
  toPublicPerson,
  type PublicPerson,
} from "@/lib/immich";
import { getScanSession } from "@/lib/scan-session";

export const metadata: Metadata = {
  title: "Your Photos",
  robots: { index: false, follow: false },
};

/**
 * A visitor's photos. The URL carries nothing: who they are comes from the
 * signed session cookie, checked here on the server before anything renders.
 * No session (or an expired one) sends them back to scan.
 */
export default async function PhotosPage() {
  const session = await getScanSession();
  if (!session) redirect("/scan?expired=1");

  let person: PublicPerson;
  try {
    person = toPublicPerson(await getPersonSummary(session.personId));
  } catch (error) {
    // The person was merged or deleted in Immich since the scan.
    const { code, message } = describePublicError(error);
    if (code === "not_found") redirect("/scan?expired=1");

    return (
      <>
        <SiteHeader current="photos" hasPhotos />
        <main id="main" className="mx-auto w-full max-w-lg flex-1 px-5 pt-10">
          <StateCard
            alert
            tone="warm"
            icon={<AlertIcon className="size-full" />}
            title="We couldn't load your photos"
            actions={<ScanAgainButton variant="primary">Scan Again</ScanAgainButton>}
          >
            {message}
          </StateCard>
        </main>
      </>
    );
  }

  const count = person.photoCount;

  return (
    <>
      <SiteHeader current="photos" hasPhotos />

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 sm:px-6">
        <header className="anim-enter flex flex-col items-center gap-3 pb-10 pt-6 text-center sm:pt-10">
          <div className="rounded-full bg-cta p-[3px] shadow-glow">
            <PersonAvatar
              src="/api/photos/avatar"
              name={person.name ?? ""}
              size={160}
              className="size-20 ring-[3px] ring-background sm:size-24"
            />
          </div>
          <div>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Your Photos</h1>
            {count !== null && (
              <p className="mt-2 text-lg text-muted">
                {count} {count === 1 ? "moment" : "moments"}
              </p>
            )}
            {person.name && <p className="mt-1 text-base font-medium">{person.name}</p>}
          </div>
          <ScanAgainButton>Not you? Scan again</ScanAgainButton>
        </header>

        <AssetGallery loadingLabel="Finding your photos..." total={count} />
      </main>
    </>
  );
}
