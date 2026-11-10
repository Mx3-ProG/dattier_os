import type { Zone } from "./aggregate";
import { toZones, type GeoRow } from "./aggregate";

/**
 * DONNÉES FICTIVES de la vitrine de la boutique. Ce module n’est importé que par le composant
 * de démonstration, qui les annonce comme telles : jamais par le service ni par une API.
 */
const row = (country: string, city: string, lat: number, lng: number, pageviews: number): GeoRow => ({
  country,
  region: "",
  city,
  lat,
  lng,
  pageviews,
  sessions: Math.ceil(pageviews * 0.45),
  visitors: Math.ceil(pageviews * 0.35),
});
export const demoZones: Zone[] = toZones([
  row("FR", "Paris", 49, 2.5, 980),
  row("FR", "Lyon", 45.5, 5, 340),
  row("FR", "Marseille", 43.5, 5.5, 210),
  row("BE", "Bruxelles", 51, 4.5, 160),
  row("GB", "Londres", 51.5, 0, 240),
  row("DE", "Berlin", 52.5, 13.5, 130),
  row("ES", "Madrid", 40.5, -3.5, 120),
  row("US", "New York", 40.5, -74, 190),
  row("CA", "Montréal", 45.5, -73.5, 150),
  row("MA", "Casablanca", 33.5, -7.5, 110),
  row("JP", "Tokyo", 35.5, 139.5, 70),
  row("BR", "São Paulo", -23.5, -46.5, 60),
  row("AU", "Sydney", -34, 151, 40),
]);
