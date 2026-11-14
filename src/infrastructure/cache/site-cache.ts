const TTL = 60_000;
const cache = new Map<string, { data: unknown; at: number }>();

function key(restaurant: string, host: string, mode: string, demo: boolean) {
  return `${restaurant}\u0000${host}\u0000${mode}\u0000${demo ? "demo" : "live"}`;
}

export function getSiteCache(restaurant: string, host: string, mode: string, demo: boolean) {
  const entry = cache.get(key(restaurant, host, mode, demo));
  if (!entry) return null;
  if (Date.now() - entry.at > TTL) {
    cache.delete(key(restaurant, host, mode, demo));
    return null;
  }
  return entry.data;
}

export function setSiteCache(restaurant: string, host: string, mode: string, demo: boolean, data: unknown) {
  cache.set(key(restaurant, host, mode, demo), { data, at: Date.now() });
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
