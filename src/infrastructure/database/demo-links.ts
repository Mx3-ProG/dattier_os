import { demoEnabled } from "./db";
/** Liens vers la démo : locale (/demo) ou publique (ATACUISINE_PUBLIC_DEMO_URL, ex. https://demo.studio-os.digital). */
export function demoLinks(): { demoHref?: string; demoSiteHref?: string } {
  if (demoEnabled()) return { demoHref: "/demo", demoSiteHref: "/site-demo" };
  const raw = process.env.ATACUISINE_PUBLIC_DEMO_URL;
  if (!raw) return {};
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return {};
    return {
      demoHref: new URL(url.pathname === "/" ? "/demo" : url.pathname, url).href,
      demoSiteHref: new URL("/site-demo", url).href,
    };
  } catch {
    return {};
  }
}
