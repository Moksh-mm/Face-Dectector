import { signInAdmin, signOutAdmin } from "@/lib/admin-auth";

/** Sign in: exchanges ADMIN_TOKEN for a signed, HttpOnly admin cookie. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  return signInAdmin(request, token);
}

/** Sign out. */
export async function DELETE(request: Request) {
  return signOutAdmin(request);
}
