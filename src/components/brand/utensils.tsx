import "./brand.css";

import { FORK_PATH, KNIFE_PATH } from "./paths";

function Fork() {
  return <path d={FORK_PATH} />;
}
function Knife() {
  return <path d={KNIFE_PATH} />;
}

/** Logo fixe : couverts croisés en X. */
export function UtensilsMark({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={3.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <g transform="rotate(-45 24 24)">
        <Fork />
      </g>
      <g transform="rotate(45 24 24)">
        <Knife />
      </g>
    </svg>
  );
}

/**
 * Écran de chargement : la fourchette et le couteau s'envolent, tournoient
 * l'un autour de l'autre puis se recroisent dans un petit « tchin ».
 */
export function UtensilsLoader({
  label = "Chargement",
  fullscreen = true,
}: {
  label?: string;
  fullscreen?: boolean;
}) {
  return (
    <div
      className={fullscreen ? "dattier-loader is-fullscreen" : "dattier-loader"}
      role="status"
      aria-live="polite"
    >
      <div className="dattier-loader-stage">
        <svg
          viewBox="-12 -12 72 72"
          className="dattier-loader-svg"
          fill="none"
          stroke="currentColor"
          strokeWidth={3.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <g className="dattier-loader-spark">
            <path d="M24 -4v5M10 0l3 4M38 0l-3 4" />
          </g>
          <g className="dattier-loader-fork">
            <Fork />
          </g>
          <g className="dattier-loader-knife">
            <Knife />
          </g>
        </svg>
        <span className="dattier-loader-shadow" aria-hidden />
      </div>
      <p className="dattier-loader-label">
        {label}
        <span aria-hidden className="dattier-loader-dots">
          <i>.</i>
          <i>.</i>
          <i>.</i>
        </span>
      </p>
    </div>
  );
}
