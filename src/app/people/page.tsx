"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-shell";
import { AlertIcon, UsersIcon } from "@/components/icons";
import { PersonAvatar } from "@/components/person-avatar";
import { StateCard } from "@/components/state-card";
import { Button } from "@/components/ui/button";
import { errorMessage, fetchJson } from "@/lib/api-client";
import { cx } from "@/lib/cx";
import type { Person } from "@/lib/immich";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; people: Person[] };

function PersonCard({ person }: { person: Person }) {
  return (
    <li>
      <Link
        href={`/people/${person.id}`}
        className="group flex flex-col items-center gap-3 rounded-2xl bg-surface p-3 ring-1 ring-line transition duration-200 hover:shadow-lift active:scale-[0.98]"
      >
        <PersonAvatar
          id={person.id}
          name={person.name}
          size={200}
          className="w-full transition duration-200 group-hover:scale-[1.03]"
        />
        <span
          className={cx(
            "max-w-full truncate text-sm font-medium",
            !person.isNamed && "text-muted"
          )}
        >
          {person.isNamed ? person.name : "Unnamed"}
        </span>
      </Link>
    </li>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {children}
    </ul>
  );
}

function LoadingGrid() {
  return (
    <div aria-busy="true" aria-label="Loading people">
      <Grid>
        {Array.from({ length: 12 }, (_, i) => (
          <li key={i} className="flex flex-col items-center gap-3 rounded-2xl bg-surface p-3 ring-1 ring-line">
            <div className="shimmer aspect-square w-full rounded-full" />
            <div className="shimmer h-4 w-2/3 rounded-full" />
          </li>
        ))}
      </Grid>
    </div>
  );
}

export default function PeoplePage() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [showUnnamed, setShowUnnamed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    fetchJson<{ people: Person[] }>("/api/immich/people", controller.signal)
      .then(({ people }) => setState({ status: "ready", people }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState({ status: "error", message: errorMessage(error) });
      });

    return () => controller.abort();
  }, [attempt]);

  function retry() {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }

  const people = state.status === "ready" ? state.people : [];
  const named = people.filter((p) => p.isNamed);
  const unnamed = people.filter((p) => !p.isNamed);

  return (
    <AdminShell current="people">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">People</h1>
        {state.status === "ready" && (
          <p className="mt-1 text-sm text-muted">
            {named.length} named · {unnamed.length} unnamed
          </p>
        )}
      </header>

      <div className="space-y-10">
        {state.status === "loading" && <LoadingGrid />}

        {state.status === "error" && (
          <StateCard
            alert
            tone="warm"
            icon={<AlertIcon className="size-full" />}
            title="Couldn't load people"
            actions={
              <Button size="lg" onClick={retry}>
                Try again
              </Button>
            }
          >
            {state.message}
          </StateCard>
        )}

        {state.status === "ready" && people.length === 0 && (
          <StateCard icon={<UsersIcon className="size-full" />} title="No people found">
            Immich hasn&apos;t recognized any faces yet. Check that face detection has
            finished.
          </StateCard>
        )}

        {state.status === "ready" && people.length > 0 && (
          <>
            {named.length > 0 ? (
              <Grid>
                {named.map((p) => (
                  <PersonCard key={p.id} person={p} />
                ))}
              </Grid>
            ) : (
              <p className="text-sm text-muted">
                None of the recognized people have names yet. Name a face in Immich&apos;s
                People tab, or browse the unnamed faces below.
              </p>
            )}

            {unnamed.length > 0 && (
              <section className="space-y-4">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowUnnamed((v) => !v)}
                  aria-expanded={showUnnamed}
                >
                  {showUnnamed ? "Hide" : "Show"} unnamed faces ({unnamed.length})
                </Button>
                {showUnnamed && (
                  <Grid>
                    {unnamed.map((p) => (
                      <PersonCard key={p.id} person={p} />
                    ))}
                  </Grid>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}
