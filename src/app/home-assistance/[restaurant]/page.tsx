import { homePortal } from "@/features/home-assistance/portal";
import { HomePortalView } from "@/components/home-assistance/portal-view";
export const dynamic = "force-dynamic";
export default async function HomeAssistancePortal({params}:{params:Promise<{restaurant:string}>}) {
  const {restaurant}=await params;
  const data=await homePortal(restaurant);
  return <HomePortalView restaurant={restaurant} data={data as Parameters<typeof HomePortalView>[0]["data"]} />;
}
