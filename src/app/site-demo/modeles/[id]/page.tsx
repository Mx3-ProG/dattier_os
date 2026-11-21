import { notFound } from "next/navigation";
import { DonutStore } from "@/components/cms-site/store";
import { TenantSiteProvider } from "@/components/cms-site/context";
import { defaultConfig } from "@/features/cms/defaults";
import { applySiteTemplate, siteTemplates } from "@/features/cms/templates";
import "@/app/donuts.css";
import "@/app/site-sections.css";
import "@/app/customer-account.css";

export const metadata = { title: "Aperçu du modèle", robots: {index:false, follow:false} };

export default async function TemplatePreview({params,searchParams}: {
  params:Promise<{id:string}>; searchParams:Promise<{page?:string}>;
}) {
  const {id} = await params;
  const template = siteTemplates.find(item=>item.id===id);
  if (!template) notFound();
  const {page="home"} = await searchParams;
  const config=applySiteTemplate(defaultConfig(),template,true);
  if (!Object.hasOwn(config.pages,page)) notFound();
  config.branding.publicName=template.name;
  return <TenantSiteProvider restaurant={id} preview shopEnabled={false} showcase={`/site-demo/modeles/${id}`}>
    <DonutStore route={page} config={config} context={{name:template.name}} preview templateDemo initialData={{
      settings:{open:false,prepMinutes:15,interval:15,capacity:1,hours:[],categories:[],address:"",phone:"",logo:"",googleBusinessUrl:"",googleReviewUrl:""},
      products:[],slots:[],reviews:[],stripe:false,
    }}/>
  </TenantSiteProvider>;
}
