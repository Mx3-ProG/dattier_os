const TTL = 60_000;
const cache = new Map<string, { data: unknown; at: number }>();

function key(restaurant: string, host: string, route: string, demo: boolean) {
  return `${restaurant}\u0000${host}\u0000${route}\u0000${demo ? "demo" : "live"}`;
}

export function getSiteCache(restaurant: string, host: string, route: string, demo: boolean) {
  const entry = cache.get(key(restaurant, host, route, demo));
  if (!entry) return null;
  if (Date.now() - entry.at > TTL) {
    cache.delete(key(restaurant, host, route, demo));
    return null;
  }
  return entry.data;
}

export function setSiteCache(restaurant: string, host: string, route: string, demo: boolean, data: unknown) {
  cache.set(key(restaurant, host, route, demo), { data, at: Date.now() });
  if (cache.size > 100) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0]?.[0];
    if (oldest) cache.delete(oldest);
  }
}

export function invalidateSiteCache(restaurant: string) {
  for (const k of cache.keys()) {
    if (k.startsWith(restaurant + "\u0000")) cache.delete(k);
  }
}
