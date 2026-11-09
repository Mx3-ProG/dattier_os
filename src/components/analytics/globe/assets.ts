import type { GlobeAssets, GlobeEngineFactory } from "./types";

/** Point de branchement unique des ressources 3D. */
export const globeAssets: GlobeAssets = { earthTextureUrl: null };
/** Chargement différé : three.js n’est jamais inclus dans un autre paquet que celui du globe. */
export const loadGlobeEngine = (): Promise<GlobeEngineFactory> =>
  import("./three-engine").then((module) => module.createThreeGlobe);

export function webglAvailable() {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}
/** Atlas chargé à la demande ; le détail 1:110m suffit sur mobile. */
export async function loadWorldFeatures(detailed: boolean) {
  const [{ feature }, atlas] = await Promise.all([
    import("topojson-client"),
    detailed ? import("world-atlas/countries-50m.json") : import("world-atlas/countries-110m.json"),
  ]);
  const topology = (atlas.default ?? atlas) as unknown as Parameters<typeof feature>[0] & {
    objects: { countries: Parameters<typeof feature>[1] };
  };
  return feature(topology, topology.objects.countries) as unknown as GeoJSON.FeatureCollection<
    GeoJSON.MultiPolygon | GeoJSON.Polygon
  >;
}
