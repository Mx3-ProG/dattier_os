import { redirect } from "next/navigation";
import { cache } from "react";
import type { Metadata } from "next";
import { menu } from "@/application/snapshot";
import { getDb, productionEnabled } from "@/infrastructure/database/db";
import { PublicSite } from "@/components/public-site";
import { notFound } from "next/navigation";
type Props = {
  params: Promise<{ page?: string[] }>;
  searchParams: Promise<{ composer?: string }>;
};
const demoMenu = cache(async () => menu(await getDb(), "bernay"));
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { page } = await params;
  if (productionEnabled() || page?.length !== 2 || page[0] !== "produits")
    return {};
  const product = (await demoMenu()).find((item) => item.id === page[1]);
  return {
    title: product ? `${product.name} · Studio Restau` : undefined,
    robots: { index: false, follow: false },
  };
}
export default async function Page({ params, searchParams }: Props) {
  if (productionEnabled()) redirect("/platform");
  const { page } = await params;
  if (page?.length === 2 && page[0] === "produits") {
    const menuItems = await demoMenu();
    const product = menuItems.find((item) => item.id === page[1]);
    if (!product) notFound();
    return (
      <PublicSite route="produit" product={product} menuItems={menuItems} />
    );
  }
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
  if (route === "commander") {
    const { composer } = await searchParams;
    if (typeof composer === "string") {
      const starter = composer
        ? (await demoMenu()).find((item) => item.id === composer)
        : undefined;
      return (
        <PublicSite
          key={`composer-${composer}`}
          route={route}
          composing
          starter={starter}
        />
      );
    }
  }
  return <PublicSite route={route} />;
}
