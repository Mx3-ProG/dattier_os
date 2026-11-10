"use client";
import { useEffect, useSyncExternalStore } from "react";
import { UtensilsLoader } from "@/components/brand/utensils";
import {
  isLoadingCacheKey,
  loadingCacheKey,
  parseLoadingCache,
  restaurantFromLocation,
  type LoadingScreenConfig,
} from "@/features/addons/loading-screens";
import { LoadingScreenView, preloadLoadingScreen } from "./engine";
import "./engine.css";

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}
function readRaw(restaurant: string) {
  try {
    return localStorage.getItem(loadingCacheKey(restaurant));
  } catch {
    return null;
  }
}
export function storeLoadingConfig(restaurant: string, config: LoadingScreenConfig | null) {
  try {
    if (config) localStorage.setItem(loadingCacheKey(restaurant), JSON.stringify(config));
    else localStorage.removeItem(loadingCacheKey(restaurant));
  } catch {
    // Stockage indisponible : le fallback natif reste utilisé.
  }
  notify();
}
/** À la déconnexion, rien de propre à un établissement ne reste sur l’appareil. */
export function clearLoadingConfigs() {
  try {
    for (const key of Object.keys(localStorage))
      if (isLoadingCacheKey(key)) localStorage.removeItem(key);
  } catch {
    // Stockage indisponible : aucun cache à effacer.
  }
  notify();
}
/**
 * Écran de l’établissement sélectionné. Il ne bloque jamais le chargement :
 * sans configuration connue, le fallback natif s’affiche sans délai réseau.
 */
export function TenantLoader({
  restaurant,
  label = "Préparation de votre espace",
}: {
  restaurant?: string;
  label?: string;
}) {
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      const id = restaurantFromLocation(location.pathname, location.search) ?? restaurant;
      return id ? `${id}\n${readRaw(id) ?? ""}` : "";
    },
    () => "",
  );
  const separator = raw.indexOf("\n");
  const config =
    separator > 0 ? parseLoadingCache(raw.slice(separator + 1) || null, raw.slice(0, separator)) : null;
  if (!config)
    return (
      <div className="ls-native">
        <UtensilsLoader label={label} />
      </div>
    );
  return <LoadingScreenView {...config} label={label} />;
}
/**
 * Met à jour en arrière-plan la configuration de l’établissement courant et
 * précharge son animation, pour un affichage immédiat au prochain chargement.
 */
export function LoadingScreenSync({ restaurant }: { restaurant: string }) {
  useEffect(() => {
    const controller = new AbortController();
    const run = async () => {
      try {
        const response = await fetch(
          `/api/restaurants/${encodeURIComponent(restaurant)}/loading-screen`,
          { signal: controller.signal },
        );
        if (response.status === 401 || response.status === 403) {
          storeLoadingConfig(restaurant, null);
          return;
        }
        if (!response.ok) return;
        const { config } = (await response.json()) as { config: LoadingScreenConfig | null };
        storeLoadingConfig(restaurant, config);
        if (config) void preloadLoadingScreen(config.renderer);
      } catch {
        // Réseau indisponible : on conserve la dernière configuration connue.
      }
    };
    const idle = "requestIdleCallback" in window;
    const handle = idle ? requestIdleCallback(() => void run()) : window.setTimeout(() => void run(), 200);
    return () => {
      controller.abort();
      if (idle) cancelIdleCallback(handle);
      else clearTimeout(handle);
    };
  }, [restaurant]);
  return null;
}
