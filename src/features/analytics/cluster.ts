import { zonePosition, type Zone } from "./aggregate";

/** Géométrie du globe, testable sans WebGL. Le rayon vaut 1 ; +Y vise le pôle Nord. */
const RAD = Math.PI / 180;
export function latLngToVector(lat: number, lng: number): [number, number, number] {
  const phi = lat * RAD,
    lambda = lng * RAD;
  return [Math.cos(phi) * Math.cos(lambda), Math.sin(phi), -Math.cos(phi) * Math.sin(lambda)];
}
export function vectorToLatLng(x: number, y: number, z: number) {
  const length = Math.hypot(x, y, z) || 1;
  return { lat: Math.asin(y / length) / RAD, lng: Math.atan2(-z, x) / RAD };
}
export function angularDistance(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const u = latLngToVector(a.lat, a.lng),
    v = latLngToVector(b.lat, b.lng);
  const dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  return Math.acos(Math.min(1, Math.max(-1, dot))) / RAD;
}

export type GlobePoint = {
  id: string;
  lat: number;
  lng: number;
  weight: number;
  country: string;
  label: string;
  sessions: number;
  approximate: boolean;
};
export type GlobeCluster = {
  id: string;
  lat: number;
  lng: number;
  weight: number;
  sessions: number;
  label: string;
  members: number;
  country: string;
  approximate: boolean;
};
export function zonesToPoints(zones: readonly Zone[]): GlobePoint[] {
  const points: GlobePoint[] = [];
  for (const zone of zones) {
    const position = zonePosition(zone);
    if (!position || zone.pageviews <= 0) continue;
    points.push({
      id: `${zone.country}|${zone.region}|${zone.city}`,
      lat: position.lat,
      lng: position.lng,
      weight: zone.pageviews,
      country: zone.country,
      label: zone.label,
      sessions: zone.sessions,
      approximate: position.approximate,
    });
  }
  return points;
}
/** Regroupe les points proches : plus la caméra s’éloigne, plus la maille s’élargit. */
export const clusterCell = (cameraDistance: number) =>
  Math.max(1, Math.min(14, Math.round((cameraDistance - 1) * 6)));
export function clusterPoints(points: readonly GlobePoint[], cellDegrees: number): GlobeCluster[] {
  const sorted = [...points].sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
  const clusters: (GlobeCluster & { x: number; y: number; z: number })[] = [];
  for (const point of sorted) {
    const found = clusters.find((cluster) => angularDistance(cluster, point) <= cellDegrees);
    const [x, y, z] = latLngToVector(point.lat, point.lng);
    if (!found) {
      clusters.push({
        id: point.id,
        lat: point.lat,
        lng: point.lng,
        weight: point.weight,
        sessions: point.sessions,
        label: point.label,
        members: 1,
        country: point.country,
        approximate: point.approximate,
        x: x * point.weight,
        y: y * point.weight,
        z: z * point.weight,
      });
      continue;
    }
    found.weight += point.weight;
    found.sessions += point.sessions;
    found.members += 1;
    found.x += x * point.weight;
    found.y += y * point.weight;
    found.z += z * point.weight;
    Object.assign(found, vectorToLatLng(found.x, found.y, found.z));
  }
  return clusters.map(({ x: _x, y: _y, z: _z, ...cluster }) =>
    cluster.members > 1
      ? { ...cluster, label: `${cluster.label} et ${cluster.members - 1} zone${cluster.members > 2 ? "s" : ""} proche${cluster.members > 2 ? "s" : ""}` }
      : cluster,
  );
}
