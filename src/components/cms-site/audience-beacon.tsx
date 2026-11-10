"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  audienceChoice,
  audienceExclusionKey,
  consentChangedEvent,
  consentStorageKey,
  mayCollect,
} from "@/features/analytics/consent";
import { useTenantSite } from "./context";

const endpoint = "/api/analytics/collect";
const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
/**
 * Collecteur du site public : pas de cookie, pas d’identifiant, aucune dépendance.
 * L’envoi attend le temps mort du navigateur et ne bloque ni l’affichage ni les interactions.
 * Le corps ne contient que l’adresse de la page : l’établissement est résolu par le serveur.
 */
export function AudienceBeacon() {
  const pathname = usePathname();
  const { restaurant, audience, preview } = useTenantSite();
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (preview || !audience) return;
    // Un membre de l’équipe peut exclure son navigateur avec ?studio-exclude=1 (voir les réglages).
    try {
      const param = new URLSearchParams(location.search).get("studio-exclude");
      if (param === "1") localStorage.setItem(audienceExclusionKey(restaurant), "1");
      if (param === "0") localStorage.removeItem(audienceExclusionKey(restaurant));
    } catch {
      /* Sans stockage, l’exclusion ne peut pas être retenue. */
    }
    const send = () => {
      if (sent.current === pathname) return;
      const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
      const allowed = mayCollect({
        mode: audience,
        choice: audienceChoice(read(consentStorageKey(restaurant))),
        refusalSignal: nav.globalPrivacyControl === true || nav.doNotTrack === "1",
        excluded: read(audienceExclusionKey(restaurant)) === "1",
      });
      if (!allowed) return;
      sent.current = pathname;
      const body = JSON.stringify({ path: pathname });
      const queued =
        typeof nav.sendBeacon === "function" &&
        nav.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
      if (!queued)
        void fetch(endpoint, {
          method: "POST",
          keepalive: true,
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body,
        }).catch(() => undefined);
    };
    const schedule = () => {
      if ("requestIdleCallback" in window) window.requestIdleCallback(send, { timeout: 3000 });
      else setTimeout(send, 800);
    };
    schedule();
    // Accord donné après l’arrivée sur la page : la page courante devient mesurable.
    window.addEventListener(consentChangedEvent, schedule);
    return () => window.removeEventListener(consentChangedEvent, schedule);
  }, [pathname, restaurant, audience, preview]);
  return null;
}
