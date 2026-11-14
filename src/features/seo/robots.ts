/**
 * robots.txt generation. robots.txt only asks well-behaved crawlers not to fetch
 * URLs: it is neither access control nor a de-indexing tool. Private areas stay
 * protected by authentication and `noindex`.
 */

/** Crawlers that fetch pages to answer or cite in AI search results. */
export const AI_SEARCH_BOTS = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
] as const;
/** Crawlers (or control tokens) that collect content for model training. */
export const AI_TRAINING_BOTS = [
  "GPTBot",
  "ClaudeBot",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "meta-externalagent",
] as const;

export type AiCrawlerPrefs = { search: boolean; training: boolean };
export const defaultAiCrawlers: AiCrawlerPrefs = { search: true, training: true };

/** Paths of a restaurant site that carry no search value (session, cart, account). */
export const TENANT_PRIVATE_PATHS = [
  "/api/",
  "/auth/",
  "/compte",
  "/account",
  "/checkout",
  "/panier",
  "/suivi",
  "/qr",
];
export const PLATFORM_PRIVATE_PATHS = [
  "/api/",
  "/auth/",
  "/commerce/",
  "/restaurant/",
  "/platform",
  "/dashboard",
  "/offline",
  "/demo",
  "/avantage",
];

type Group = { agents: readonly string[]; allow?: string[]; disallow: string[] };
function render(groups: Group[], sitemaps: string[]) {
  const out = groups.map((g) =>
    [
      ...g.agents.map((a) => `User-agent: ${a}`),
      ...(g.allow ?? []).map((p) => `Allow: ${p}`),
      ...g.disallow.map((p) => `Disallow: ${p}`),
    ].join("\n"),
  );
  return [...out, ...sitemaps.map((s) => `Sitemap: ${s}`)].join("\n\n") + "\n";
}

export function tenantRobots(input: {
  /** Base the robots file is served from (prefix for private paths on the platform). */
  pathPrefix: string;
  sitemapUrl: string | null;
  blockAll: boolean;
  ai?: Partial<AiCrawlerPrefs>;
}) {
  if (input.blockAll) return render([{ agents: ["*"], disallow: ["/"] }], []);
  const ai = { ...defaultAiCrawlers, ...input.ai };
  const priv = TENANT_PRIVATE_PATHS.map((p) => input.pathPrefix + p);
  const groups: Group[] = [{ agents: ["*"], allow: ["/"], disallow: priv }];
  // A crawler obeys only the most specific group naming it, so private paths are repeated.
  if (!ai.search) groups.push({ agents: AI_SEARCH_BOTS, disallow: ["/"] });
  if (!ai.training) groups.push({ agents: AI_TRAINING_BOTS, disallow: ["/"] });
  return render(groups, input.sitemapUrl ? [input.sitemapUrl] : []);
}

export function platformRobots(input: { blockAll: boolean; sitemapUrl: string | null }) {
  if (input.blockAll) return render([{ agents: ["*"], disallow: ["/"] }], []);
  return render(
    [
      {
        agents: ["*"],
        allow: ["/"],
        // Restaurant sites without their own domain live under /r/{id}: keep them
        // crawlable, but not their session pages.
        disallow: [
          ...PLATFORM_PRIVATE_PATHS,
          ...TENANT_PRIVATE_PATHS.filter((p) => p !== "/api/").map((p) => `/r/*${p}`),
        ],
      },
    ],
    input.sitemapUrl ? [input.sitemapUrl] : [],
  );
}
