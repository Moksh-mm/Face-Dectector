import { notFound, redirect } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { AssetGallery } from "@/components/asset-gallery";
import { AlertIcon, ChevronLeftIcon } from "@/components/icons";
import { PersonAvatar } from "@/components/person-avatar";
import { StateCard } from "@/components/state-card";
import { ButtonLink } from "@/components/ui/button";
import { isAdmin } from "@/lib/admin-auth";
import {
  describeError,
  getPerson,
  getPersonAssetCount,
  type Person,
} from "@/lib/immich";

const BackLink = () => (
  <ButtonLink href="/people" variant="ghost" size="sm">
    <ChevronLeftIcon className="size-4" />
    Back
  </ButtonLink>
);

export default async function PersonPage({
  params,
}: {
  params: Promise<{ personId: string }>;
}) {
  // Checked here as well as in the layout: this page reads Immich directly.
  if (!(await isAdmin())) redirect("/admin");

  const { personId } = await params;

  let person: Person;
  try {
    person = await getPerson(personId);
  } catch (error) {
    const { code, message } = describeError(error);
    if (code === "not_found") notFound();

    return (
      <AdminShell current="people" action={<BackLink />}>
        <StateCard
          alert
          tone="warm"
          icon={<AlertIcon className="size-full" />}
          title="Couldn't load this person"
        >
          {message}
        </StateCard>
      </AdminShell>
    );
  }

  const count = await getPersonAssetCount(person.id);

  return (
    <AdminShell current="people" action={<BackLink />}>
      <header className="mb-8 flex flex-col items-center gap-3 text-center">
        <PersonAvatar
          id={person.id}
          name={person.name}
          size={224}
          className="w-24 ring-1 ring-line sm:w-32"
        />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {person.isNamed ? person.name : "Unnamed person"}
          </h1>
          {count !== null && (
            <p className="mt-1 text-sm text-muted">
              {count} {count === 1 ? "photo" : "photos"}
            </p>
          )}
        </div>
      </header>

      <AssetGallery personId={person.id} total={count} />
    </AdminShell>
  );
}
