"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Ends the visitor's session on the server, then returns to the scan. */
export function ScanAgainButton({
  children,
  variant = "ghost",
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function scanAgain() {
    setBusy(true);
    await fetch("/api/scan/logout", { method: "POST" }).catch(() => {});
    router.push("/scan");
  }

  return (
    <Button variant={variant} size="sm" onClick={scanAgain} disabled={busy}>
      {children}
    </Button>
  );
}
