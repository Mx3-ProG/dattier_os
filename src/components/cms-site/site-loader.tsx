"use client";
import { useEffect, useSyncExternalStore } from "react";
import { LoadingScreenView } from "@/components/loading-screens/engine";
import { isLoadingRenderer, loadingRenderers, type LoadingRendererDefinition, type LoadingRendererId } from "@/features/addons/loading-screens";
import { siteLoaderKey } from "@/features/cms/site-addons";

type Stored = { renderer: LoadingRendererId; name: string };
const read = () => {
  try {
    return localStorage.getItem(siteLoaderKey(location.host, location.pathname)) ?? "";
  } catch {
    return "";
  }
};
const subscribe = (listener: () => void) => {
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
};
function parse(raw: string): Stored | null {
  try {
    const value = JSON.parse(raw) as Partial<Stored>;
    return isLoadingRenderer(value.renderer) ? { renderer: value.renderer, name: String(value.name ?? "").slice(0, 80) } : null;
  } catch {
    return null;
  }
}
/** Mémorise l’écran choisi par l’établissement pour les prochaines navigations du visiteur. */
export function SiteLoaderSync({ renderer, name }: { renderer: LoadingRendererId | null; primary: string; name: string }) {
  useEffect(() => {
    try {
      const key = siteLoaderKey(location.host, location.pathname);
      if (renderer) localStorage.setItem(key, JSON.stringify({ renderer, name }));
      else localStorage.removeItem(key);
    } catch {
      // Stockage indisponible : le site se charge simplement sans animation.
    }
  }, [renderer, name]);
  return null;
}
/** Écran affiché pendant le chargement d’une page du site. Sans choix connu : rien, aucun délai. */
export function SiteLoader() {
  const raw = useSyncExternalStore(subscribe, read, () => "");
  const stored = raw ? parse(raw) : null;
  if (!stored) return null;
  const definition: LoadingRendererDefinition = loadingRenderers[stored.renderer];
  return (
    <LoadingScreenView
      renderer={stored.renderer}
      primary={definition.primary}
      secondary={definition.secondary}
      background={definition.background}
      text={definition.text}
      speed={1}
      label={stored.name ? `${stored.name} arrive…` : "Chargement…"}
    />
  );
}
