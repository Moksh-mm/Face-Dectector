import { NextResponse } from "next/server";
import { clearScanSession } from "@/lib/scan-session";

/** "Not you? Scan again": ends the visitor's session. */
export async function POST(request: Request) {
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  clearScanSession(response, request);
  return response;
}
