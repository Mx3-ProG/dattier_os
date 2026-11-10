import { CustomerImport } from "@/components/platform/customer-import";
export default async function Page({params}:{params:Promise<{restaurant:string}>}) {
  const {restaurant}=await params;
  return <CustomerImport restaurant={restaurant} />;
}
