import type { SiteDecorationId } from "@/features/cms/site-addons";
import { isThemedVisual, themedVisuals } from "@/features/cms/themed-visuals";
import type { CSSProperties } from "react";
import "./site-decoration.css";
import "./site-decoration-themes.css";

/** Décor léger, purement visuel, sans interaction ni chargement réseau. */
export function SiteDecoration({ design, preview = false }: { design: SiteDecorationId; preview?: boolean }) {
  const visual = isThemedVisual(design) ? themedVisuals[design] : null;
  const style = visual ? { "--dec-base": visual.base, "--dec-tint": visual.tint, "--dec-accent": visual.accent } as CSSProperties : undefined;
  return (
    <div className={`site-decoration is-${design}${visual ? ` is-themed is-${visual.tier} is-${design.startsWith("space-") ? "space" : "nature"}` : ""}${preview ? " is-preview" : ""}`} style={style} aria-hidden="true">
      {design === "snowfall" && <div className="site-decoration-snow">{Array.from({ length: 15 }, (_, index) => <i key={index} style={{ left: `${index * 7 + 2}%`, animationDuration: `${8 + index * .4}s`, animationDelay: `${index * -.9}s` }}>✦</i>)}</div>}
      {design === "garland" && <div className="site-decoration-garland"><span>✦</span><b>●</b><span>✦</span><b>●</b><span>✦</span><b>●</b><span>✦</span></div>}
      {design === "lights" && <div className="site-decoration-lights">{Array.from({ length: 13 }, (_, index) => <i key={index} />)}</div>}
      {visual && <div className="site-decoration-themed">
        {Array.from({ length: 13 }, (_, index) => <span key={index} style={{ animationDelay: `${index * -.3}s` }}>{visual.icon}</span>)}
      </div>}
    </div>
  );
}
