import { notFound } from "next/navigation";
import { demoEnabled, publicDemoEnabled } from "@/infrastructure/database/db";
import { Demo } from "@/components/demo";
import { safeReturnTo } from "@/infrastructure/auth/oidc";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  if (!demoEnabled()) notFound();
  const { returnTo } = await searchParams;
  return <Demo shared={publicDemoEnabled()} returnTo={typeof returnTo === "string" ? safeReturnTo(returnTo) : undefined} />;
}
