"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-shell";
import { Brand } from "@/components/brand";
import { AlertIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ApiError, fetchJson, postJson } from "@/lib/api-client";
import type { FaceIndexStats } from "@/lib/face-index";
import type { BuildState } from "@/lib/face-index-builder";

type Status = {
  build: BuildState;
  index: FaceIndexStats | null;
  mlAvailable: boolean;
};

const STATUS_LABEL: Record<BuildState["status"], string> = {
  idle: "Idle",
  queued: "Queued",
  building: "Building",
  complete: "Complete",
  failed: "Failed",
};

const loadStatus = () => fetchJson<Status>("/api/admin/face-index");

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 truncate text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export default function AdminPage() {
  const [checking, setChecking] = useState(true);
  // null means signed out. The signed-in state lives in an HttpOnly cookie the
  // page cannot read, so this is just what the server last told us.
  const [status, setStatus] = useState<Status | null>(null);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Already signed in from an earlier visit?
  useEffect(() => {
    loadStatus()
      .then(setStatus)
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  const building =
    status?.build.status === "building" || status?.build.status === "queued";

  // Poll only while a build is actually running.
  useEffect(() => {
    if (!building) return;

    const timer = setInterval(() => {
      loadStatus()
        .then(setStatus)
        .catch(() => {});
    }, 1000);

    return () => clearInterval(timer);
  }, [building]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      await postJson("/api/admin/session", { token });
      setToken(""); // no longer needed in memory
      setStatus(await loadStatus());
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/admin/session", { method: "DELETE" }).catch(() => {});
    setStatus(null);
  }

  async function rebuild() {
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/admin/face-index/build", { method: "POST" });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error?.message ?? "Could not start the build.");
      }
      setStatus(await loadStatus());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <main id="main" className="mx-auto w-full max-w-sm flex-1 px-5 py-20">
        <p role="status" className="text-sm text-muted">
          Checking sign-in...
        </p>
      </main>
    );
  }

  // Signed out: a plain sign-in card, with no admin navigation to tease.
  if (!status) {
    return (
      <main
        id="main"
        className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-16"
      >
        <div className="mb-8 flex justify-center">
          <Brand href="/scan" suffix="Admin" />
        </div>
        <h1 className="mb-6 text-center text-2xl font-semibold tracking-tight">Admin sign-in</h1>
        <form onSubmit={signIn} className="space-y-3">
          <label htmlFor="admin-token" className="block text-sm font-medium">
            Admin token
          </label>
          <input
            id="admin-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
            className="min-h-12 w-full rounded-full bg-surface px-5 text-base ring-1 ring-line outline-none transition focus:ring-2 focus:ring-accent"
          />
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={busy || token.length === 0}
          >
            {busy ? "Checking..." : "Sign in"}
          </Button>
          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
        </form>
      </main>
    );
  }

  const build = status.build;
  const index = status.index;
  const percent =
    build.total > 0 ? Math.round((build.processed / build.total) * 100) : 0;

  return (
    <AdminShell
      current="index"
      action={
        <Button variant="ghost" size="sm" onClick={signOut}>
          Sign out
        </Button>
      }
    >
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Face Recognition Index</h1>
        <p className="mt-1 text-sm text-muted">Last built: {formatDate(index?.createdAt ?? null)}</p>
      </header>

      {!status.mlAvailable && (
        <p
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-2xl bg-amber-500/10 p-4 text-sm ring-1 ring-amber-500/30"
        >
          <AlertIcon className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
          The face recognition service isn&apos;t reachable. Check that the Immich
          machine-learning container is running.
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Status" value={STATUS_LABEL[build.status]} />
        <Stat label="Faces" value={index?.facesIndexed ?? 0} />
        <Stat label="People" value={index?.peopleIndexed ?? 0} />
        <Stat label="Model" value={index?.model ?? "—"} />
      </section>

      {index?.partial && (
        <p className="mt-6 flex items-start gap-3 rounded-2xl bg-amber-500/10 p-4 text-sm ring-1 ring-amber-500/30">
          <AlertIcon className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            This index is partial: {index.failedAssets} of{" "}
            {index.indexedAssets + (index.failedAssets ?? 0)} sampled photos
            could not be read, so some people may be missing. Recognition works
            with the {index.indexedAssets} photos that were indexed. Rebuild once
            Immich and the machine-learning service are healthy.
          </span>
        </p>
      )}

      {building && (
        <section className="mt-8 space-y-3" aria-live="polite">
          <p className="text-sm font-medium">Building face index...</p>
          <div
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
          >
            <div
              className="h-full rounded-full bg-cta transition-[width] duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="text-sm tabular-nums text-muted">
            {percent}% · processing {build.processed} / {build.total} photos ·{" "}
            {build.facesIndexed} faces found
          </p>
        </section>
      )}

      {build.status === "failed" && build.error && (
        <p
          role="alert"
          className="mt-8 rounded-2xl bg-danger/10 p-4 text-sm text-danger ring-1 ring-danger/20"
        >
          {build.error}
        </p>
      )}

      <div className="mt-10 flex flex-wrap items-center gap-4">
        <Button onClick={rebuild} disabled={busy || building}>
          {building ? "Building..." : "Rebuild Face Index"}
        </Button>
        <p className="text-xs text-muted">
          Takes several minutes. You can leave this page open.
        </p>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </AdminShell>
  );
}
