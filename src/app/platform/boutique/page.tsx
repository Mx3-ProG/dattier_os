import type { Metadata } from "next";
import { AddonStoreAdmin } from "@/components/addons/store-admin";

export const metadata: Metadata = { title: "Boutique d’add-ons · Administration" };

export default function Page() {
  return <AddonStoreAdmin />;
}
