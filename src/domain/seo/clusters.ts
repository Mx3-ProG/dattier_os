/** Construit une clé de cluster SEO stable, sans données client. */
export function clusterKey(parts: { module: string; industry?: string; city?: string }) {
  return [parts.module, parts.industry || "all", parts.city || "all"]
    .map((p) => p.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, ""))
    .join(":");
}
