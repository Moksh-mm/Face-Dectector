import { redirect } from "next/navigation";

/** The public journey starts at the scan. /people is admin-only now. */
export default function Home() {
  redirect("/scan");
}
