import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { actor } from "@/infrastructure/auth/session";
import { isSuperAdminEmail } from "@/infrastructure/auth/superadmin";
import { SuperAdminDashboard } from "@/components/platform/admin/dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Super Admin & Supervision Monolithe · STUDIO",
  description:
    "Tableau de bord de maintenance, métriques, sécurité et logs pour Super Administrateur.",
};

export default async function AdminPage() {
  const user = await actor().catch(() => null);
  if (!user) {
    redirect("/connexion?returnTo=/platform/admin");
  }

  // Strict check: ONLY the designated Super Admin email can access this page
  if (!isSuperAdminEmail(user.email)) {
    redirect("/platform");
  }

  return <SuperAdminDashboard />;
}
