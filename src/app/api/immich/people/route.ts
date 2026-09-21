import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/admin-auth";
import { errorResponse, getAllPeople } from "@/lib/immich";

/** Admin only: lists everyone in the library. */
export async function GET(request: Request) {
  const denied = await adminGuard(request);
  if (denied) return denied;

  try {
    const people = await getAllPeople();
    return NextResponse.json({ total: people.length, people });
  } catch (error) {
    return errorResponse(error);
  }
}
