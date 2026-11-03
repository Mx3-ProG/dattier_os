import { RestaurantHub } from "@/components/platform/restaurant-hub";
export default async function Page({
  params,
}: {
  params: Promise<{ restaurant: string }>;
}) {
  const { restaurant } = await params;
  return <RestaurantHub restaurant={restaurant} />;
}
