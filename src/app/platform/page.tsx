import { redirect } from "next/navigation";
import { PlatformHome } from "@/components/platform/home";
import { plans } from "@/features/platform/pricing";

export default async function Page({ searchParams }: {
  searchParams: Promise<{ plan?: string; invitation?: string }>;
}) {
  const { plan, invitation } = await searchParams;
  const offer = plans.find(({ price }) => String(price) === plan);
  if (offer && !invitation) redirect(`/checkout/${offer.price}`);
  return <PlatformHome />;
}
