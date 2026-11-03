import { WebsiteStudio } from "@/components/site-editor/entry";
import { demoEnabled } from "@/lib/database/db";
import "@/app/site-editor.css";
import "@/app/site-sections.css";
export default async function Page({
  params,
}: {
  params: Promise<{ restaurant: string }>;
}) {
  const { restaurant } = await params;
  return <WebsiteStudio restaurant={restaurant} demo={demoEnabled()} />;
}
