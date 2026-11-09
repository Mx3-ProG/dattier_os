import type { Metadata } from "next";
import { ReferralProgram } from "@/components/platform/referral-program";

export const metadata: Metadata = { title: "Programme parrain · STUDIO OS" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ organisation?: string }>;
}) {
  const { organisation } = await searchParams;
  return <ReferralProgram organization={organisation} />;
}
