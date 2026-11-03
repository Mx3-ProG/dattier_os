import { redirect } from "next/navigation";
import { productionEnabled } from "@/lib/database/db";
import { PublicSite } from "@/components/public-site";
import { notFound } from "next/navigation";
export default async function Page({
  params,
}: {
  params: Promise<{ page?: string[] }>;
}) {
  if (productionEnabled()) redirect("/platform");
  const { page } = await params;
  const route = page?.join("/") || "";
  if (
    ![
      "",
      "histoire",
      "carte",
      "reservations",
      "commander",
      "galerie",
      "avis",
      "contact",
      "compte",
      "mentions-legales",
      "confidentialite",
      "cookies",
      "qr",
    ].includes(route)
  )
    notFound();
  return <PublicSite route={route} />;
}
