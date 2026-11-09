"use client";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { useEffect, useMemo, useState } from "react";
import { countryGeo } from "@/features/analytics/country-geo";
import { clusterPoints, type GlobePoint } from "@/features/analytics/cluster";
import { loadWorldFeatures } from "./assets";

const WIDTH = 960;
const HEIGHT = 500;
const projection = geoNaturalEarth1().fitExtent(
  [[6, 6], [WIDTH - 6, HEIGHT - 6]],
  { type: "Sphere" },
);
const numericToAlpha = new Map(Object.entries(countryGeo).map(([alpha, entry]) => [entry[0], alpha]));

/** Rendu de repli sans WebGL, et vue choisie par l’utilisateur : SVG, léger, sans boucle d’animation. */
export function WorldMap2D({
  points,
  showMarkers,
  selectedCountry,
  pulses,
  onSelectCountry,
}: {
  points: readonly GlobePoint[];
  showMarkers: boolean;
  selectedCountry: string | null;
  pulses: readonly { id: string; lat: number; lng: number }[];
  onSelectCountry: (country: string) => void;
}) {
  const [world, setWorld] = useState<Awaited<ReturnType<typeof loadWorldFeatures>> | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    loadWorldFeatures(false)
      .then((features) => alive && setWorld(features))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);
  const shapes = useMemo(() => {
    if (!world) return [];
    const path = geoPath(projection);
    return world.features.map((feature) => ({
      id: String(feature.id ?? ""),
      alpha: numericToAlpha.get(String(feature.id ?? "")) ?? null,
      d: path(feature) ?? "",
      name: (feature.properties as { name?: string } | null)?.name ?? "",
    }));
  }, [world]);
  const sphere = useMemo(() => geoPath(projection)({ type: "Sphere" }) ?? "", []);
  const clusters = useMemo(() => clusterPoints(points, 3), [points]);
  const heaviest = clusters.reduce((max, cluster) => Math.max(max, cluster.weight), 1);
  if (error) return <p className="et-map-error">La carte n’a pas pu être chargée. Les classements restent disponibles ci-dessous.</p>;
  return (
    <svg className="et-map" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Carte du monde des zones d’origine des visites" data-testid="et-map-2d">
      <path d={sphere} className="et-map-sphere" />
      {shapes.map((shape) => (
        <path
          key={shape.id + shape.name}
          d={shape.d}
          className={`et-map-land${shape.alpha && shape.alpha === selectedCountry ? " is-selected" : ""}`}
          onClick={() => shape.alpha && onSelectCountry(shape.alpha)}
        />
      ))}
      {showMarkers &&
        clusters.map((cluster) => {
          const at = projection([cluster.lng, cluster.lat]);
          if (!at) return null;
          return (
            <circle
              key={cluster.id}
              cx={at[0]}
              cy={at[1]}
              r={3 + 11 * Math.sqrt(cluster.weight / heaviest)}
              className="et-map-marker"
              onClick={() => onSelectCountry(cluster.country)}
            >
              <title>{`${cluster.label} : ${cluster.weight} pages vues`}</title>
            </circle>
          );
        })}
      {pulses.map((pulse) => {
        const at = projection([pulse.lng, pulse.lat]);
        return at ? <circle key={pulse.id} cx={at[0]} cy={at[1]} r={5} className="et-map-pulse" /> : null;
      })}
    </svg>
  );
}
