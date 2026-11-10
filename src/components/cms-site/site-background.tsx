"use client";
import { useEffect } from "react";
import { siteBackgrounds, siteBackgroundStyle, type SiteBackgroundId } from "@/features/cms/site-backgrounds";
import "./site-background.css";

/** Aperçu fidèle au fond public, sans image externe. */
export function SiteBackgroundPreview({ design }: { design: SiteBackgroundId }) {
  return (
    <div className={`site-background-preview is-${siteBackgrounds[design].tier}`} style={siteBackgroundStyle(design)}>
      <span className="site-background-preview-mark" aria-hidden="true">{siteBackgrounds[design].icon}</span>
      <span className="site-background-preview-label">{siteBackgrounds[design].label}</span>
      {siteBackgrounds[design].tier === "deluxe" && <span className="site-background-preview-glow" aria-hidden="true" />}
    </div>
  );
}

/** Parallaxe limitée à quelques pixels et coupée si l’utilisateur réduit les animations. */
export function SiteBackgroundMotion({ design }: { design: SiteBackgroundId | null }) {
  useEffect(() => {
    if (!design || siteBackgrounds[design].tier !== "deluxe" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const onMove = (event: PointerEvent) => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const site = document.querySelector<HTMLElement>(".donut-site[data-site-background]");
        site?.style.setProperty("--site-bg-shift-x", `${Math.round((event.clientX / innerWidth - .5) * 24)}px`);
        site?.style.setProperty("--site-bg-shift-y", `${Math.round((event.clientY / innerHeight - .5) * 16)}px`);
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => { window.removeEventListener("pointermove", onMove); if (frame) cancelAnimationFrame(frame); };
  }, [design]);
  return null;
}
