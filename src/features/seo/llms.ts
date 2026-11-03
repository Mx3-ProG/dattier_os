import type { SiteConfig } from "@/features/cms/schema";
import type { Product, Settings } from "@/features/commerce/schema";
import { plain, type PlaceholderContext } from "@/features/cms/text";
import { indexablePages } from "./sitemap";
import { pageUrl } from "./urls";
import { siteLocale } from "./locale";

/**
 * Optional /llms.txt (proposal from llmstxt.org): a Markdown summary of the
 * public site for AI tools. It is not a standard and guarantees neither
 * indexing nor citation; it only repeats what the site already publishes.
 */
export type LlmsInput = {
  config: SiteConfig;
  context: PlaceholderContext;
  canonicalBase: string;
  settings: Settings | null;
  products: Product[];
  publishedAt: string | null;
};
const labels = {
  fr: {
    info: "Informations pratiques",
    address: "Adresse",
    phone: "Téléphone",
    hours: "Horaires",
    pages: "Pages",
    menu: "Carte",
    prices: "Prix publiés sur le site, susceptibles d’évoluer",
    out: "indisponible actuellement",
    updated: "Dernière mise à jour du site",
    sep: " : ",
  },
  en: {
    info: "Practical information",
    address: "Address",
    phone: "Phone",
    hours: "Opening hours",
    pages: "Pages",
    menu: "Menu",
    prices: "Prices as published on the site, subject to change",
    out: "currently unavailable",
    updated: "Site last updated",
    sep: ": ",
  },
};
/** Markdown is the format: neutralise characters that would break links or headings. */
const md = (s: string) =>
  s
    .replace(/[\r\n]+/g, " ")
    .replace(/[[\]]/g, "")
    .trim();

/** Whether the file is published for this site (opt-in, indexable sites only). */
export function llmsEnabled(config: SiteConfig) {
  return config.seo.llmsTxt === true && config.seo.noIndex === false;
}

export function buildLlmsTxt(input: LlmsInput) {
  const { config, context, canonicalBase, settings } = input;
  const locale = siteLocale(config);
  const t = locale.language.startsWith("fr") ? labels.fr : labels.en;
  const name = md(context.name || plain(config.seo.shareName, context));
  const description = md(
    plain(config.branding.description || config.seo.description, context),
  );
  const physical = config.business?.type !== "Organization";
  const lines = [`# ${name}`, ""];
  if (description) lines.push(`> ${description}`, "");

  const info = [
    physical && context.address
      ? `- ${t.address}${t.sep}${md(context.address)}`
      : "",
    context.phone ? `- ${t.phone}${t.sep}${md(context.phone)}` : "",
    physical && context.opening_hours
      ? `- ${t.hours}${t.sep}${md(context.opening_hours)}`
      : "",
    ...(config.business?.cuisines.length
      ? [`- ${config.business.cuisines.map(md).join(", ")}`]
      : []),
  ].filter(Boolean);
  if (info.length) lines.push(`## ${t.info}`, "", ...info, "");

  const pages = indexablePages(config).map((key) => {
    const page = config.pages[key];
    const title = md(plain(page.seo.title || page.title, context));
    const desc = md(plain(page.seo.description, context));
    return `- [${title}](${pageUrl(canonicalBase, key)})${desc ? `: ${desc}` : ""}`;
  });
  if (pages.length) lines.push(`## ${t.pages}`, "", ...pages, "");

  const products = input.products.filter((p) => p.enabled);
  const menuVisible = indexablePages(config).includes("carte");
  if (products.length && menuVisible) {
    const currency = new Intl.NumberFormat(locale.language, {
      style: "currency",
      currency: "EUR",
    });
    const categories = [
      ...new Set([
        ...(settings?.categories ?? []),
        ...products.map((p) => p.category),
      ]),
    ].filter((c) => products.some((p) => p.category === c));
    lines.push(`## ${t.menu}`, "", `${t.prices}.`, "");
    for (const category of categories) {
      lines.push(`### ${md(category)}`, "");
      for (const p of products.filter((x) => x.category === category))
        lines.push(
          `- ${md(p.name)} — ${currency.format(p.price / 100)}${p.portions > 0 ? "" : ` (${t.out})`}${p.description ? `: ${md(p.description)}` : ""}`,
        );
      lines.push("");
    }
  }
  if (input.publishedAt)
    lines.push(
      `${t.updated}${t.sep}${new Date(input.publishedAt).toISOString().slice(0, 10)}`,
      "",
    );
  return lines.join("\n");
}
