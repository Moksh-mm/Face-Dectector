import { ScanFlow } from "@/components/scan-flow";
import { getScanSession } from "@/lib/scan-session";

/** The public entry point. All state lives in the client component. */
export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const { expired } = await searchParams;
  // Only to decide whether the header offers "My Photos": read on the server,
  // from the same cookie check the photos page uses. Nothing is passed on.
  const hasSession = (await getScanSession()) !== null;

  return <ScanFlow expired={expired === "1"} hasSession={hasSession} />;
}
