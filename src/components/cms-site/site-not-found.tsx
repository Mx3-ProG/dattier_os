import type { CSSProperties } from "react";
import type { NotFoundDesign } from "@/features/cms/site-addons";
import { isThemedVisual, themedVisuals } from "@/features/cms/themed-visuals";
import "./site-not-found.css";
import "./site-not-found-themes.css";

/** Page « introuvable » d’un site d’établissement : modèles en CSS pur, sans script. */
export function SiteNotFound({
  design,
  title,
  message,
  button,
  home,
  brand,
  logo,
  colors,
  preview = false,
}: {
  design: NotFoundDesign;
  title: string;
  message: string;
  button: string;
  home: string;
  brand: string;
  logo?: string | null;
  colors: { primary: string; background: string; text: string };
  preview?: boolean;
}) {
  const visual = isThemedVisual(design) ? themedVisuals[design] : null;
  const style = {
    "--nf-primary": colors.primary, "--nf-bg": colors.background, "--nf-text": colors.text,
    ...(visual ? { "--visual-base": visual.base, "--visual-tint": visual.tint, "--visual-accent": visual.accent } : {}),
  } as CSSProperties;
  return (
    <main className={`site-404 is-${design}${visual ? ` is-themed is-${visual.tier} is-${design.startsWith("space-") ? "space" : "nature"}` : ""}${preview ? " is-preview" : ""}`} style={style} data-not-found={design}>
      <div className="site-404-card">
        <p className="site-404-brand">
          {logo && /^(\/(?!\/)|https:)/.test(logo) && (
            // eslint-disable-next-line @next/next/no-img-element -- logo de l’établissement, hôte inconnu au build
            <img src={logo} alt="" />
          )}
          {brand}
        </p>
        <div className="site-404-art" aria-hidden>
          {design === "plate" && (
            <>
              <span>4</span>
              <span className="site-404-plate"><i /></span>
              <span>4</span>
            </>
          )}
          {design === "compass" && (
            <span className="site-404-compass">
              <i className="site-404-needle" />
              <b>N</b>
            </span>
          )}
          {design === "neon" && <span className="site-404-neon">4<em>0</em>4</span>}
          {design === "stars" && (
            <span className="site-404-sky">
              <i /><i /><i /><i /><i /><i />
              <strong>404</strong>
              <span className="site-404-shooting" />
            </span>
          )}
          {(["trail", "portal", "lantern", "map", "balloon"] as string[]).includes(design) && (
            <span className={`site-404-symbol is-${design}`}><i /><strong>404</strong><i /></span>
          )}
          {design === "snowglobe" && (
            <span className="site-404-snowglobe"><i className="site-404-snow" /><b>404</b><i className="site-404-snow" /><em /></span>
          )}
          {design === "candy" && <span className="site-404-candy"><i /><strong>404</strong><i /></span>}
          {design === "gingerbread" && (
            <span className="site-404-gingerbread"><i className="site-404-roof" /><strong>404</strong><i className="site-404-door" /></span>
          )}
          {design === "gifts" && (
            <span className="site-404-gifts"><i /><i /><i /><strong>404</strong></span>
          )}
          {design === "aurora" && (
            <span className="site-404-aurora"><i /><i /><i /><strong>404</strong></span>
          )}
          {design === "village" && (
            <span className="site-404-village"><i /><i /><i /><strong>404</strong></span>
          )}
          {design === "forest" && (
            <span className="site-404-forest"><i /><i /><i /><strong>404</strong></span>
          )}
          {design === "advent" && (
            <span className="site-404-advent"><i /><i /><i /><i /><strong>404</strong><i /><i /><i /><i /></span>
          )}
          {visual && (
            <span className="site-404-themed-scene">
              <i className="site-404-themed-orbit" />
              <i className="site-404-themed-orbit is-second" />
              <span className="site-404-themed-icon">{visual.icon}</span>
              <strong>404</strong>
              <i className="site-404-themed-spark is-one" /><i className="site-404-themed-spark is-two" /><i className="site-404-themed-spark is-three" />
            </span>
          )}
        </div>
        <h1>{title}</h1>
        <p className="site-404-message">{message}</p>
        <a className="site-404-button" href={home}>{button}</a>
      </div>
    </main>
  );
}
