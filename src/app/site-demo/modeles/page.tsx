import type { Metadata } from "next";
import { PublicTemplates } from "@/components/site-editor/public-templates";

export const metadata: Metadata = {
  title: "Modèles de sites internet · Studio OS",
  description: "Explorez tous les modèles de sites internet, dont GTA Like, et ouvrez leur démonstration avant de créer votre site.",
};

export default function TemplatesPage() {
  return <PublicTemplates />;
}
