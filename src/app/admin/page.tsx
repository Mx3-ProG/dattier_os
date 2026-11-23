import { redirect } from "next/navigation";
import { actor } from "@/infrastructure/auth/session";
import { isSuperAdminEmail } from "@/infrastructure/auth/superadmin";

export const dynamic = "force-dynamic";

export default async function AdminRedirect() {
  const user = await actor().catch(() => null);
  if (!user || !isSuperAdminEmail(user.email)) {
    redirect("/platform");
  }
  redirect("/platform/admin");
}
