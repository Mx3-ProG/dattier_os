import { PublicSite } from "@/components/public-site";
import { notFound } from "next/navigation";
export default async function Page({
  params,
}: {
  params: Promise<{ page?: string[] }>;
}) {
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
