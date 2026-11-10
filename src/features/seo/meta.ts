import type { SiteConfig } from "@/features/cms/schema";
import { plain, type PlaceholderContext } from "@/features/cms/text";

/**
 * Title and description actually served for a page. Same rule as the Studio
 * preview: a page without its own title gets "Page · Site name", so pages never
 * share the home page title.
 */
export function effectiveTitle(
  config: SiteConfig,
  key: string,
  context: PlaceholderContext,
) {
  const page = config.pages[key];
  return plain(
    page.seo.title ||
      (key === "home"
        ? config.seo.title
        : `${page.title} · ${config.seo.shareName}`),
    context,
  );
}
export function effectiveDescription(
  config: SiteConfig,
  key: string,
  context: PlaceholderContext,
) {
  const page = config.pages[key];
  return plain(page.seo.description || config.seo.description, context);
}
