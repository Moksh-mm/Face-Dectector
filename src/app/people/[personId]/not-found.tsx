import { AdminShell } from "@/components/admin-shell";
import { UsersIcon } from "@/components/icons";
import { StateCard } from "@/components/state-card";
import { ButtonLink } from "@/components/ui/button";

export default function PersonNotFound() {
  return (
    <AdminShell current="people">
      <StateCard
        icon={<UsersIcon className="size-full" />}
        title="Person not found"
        actions={
          <ButtonLink href="/people" size="lg">
            Back to People
          </ButtonLink>
        }
      >
        This person no longer exists in Immich.
      </StateCard>
    </AdminShell>
  );
}
