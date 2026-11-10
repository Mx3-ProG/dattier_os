"use client";
import { useId } from "react";
import "./liquid.css";

/** Période de 200 : le déplacement d’une période reboucle sans à-coup. */
const WAVE = "M-200 0q50-16 100 0t100 0 100 0 100 0 100 0V140H-200Z";
export default function Liquid() {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg viewBox="0 0 200 200" className="ls-liquid">
      <defs>
        <clipPath id={`${id}c`}>
          <circle cx="100" cy="100" r="78" />
        </clipPath>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--ls-secondary)" />
          <stop offset="1" stopColor="var(--ls-primary)" />
        </linearGradient>
      </defs>
      <circle className="ls-liquid-shell" cx="100" cy="100" r="84" />
      <g clipPath={`url(#${id}c)`}>
        <g className="ls-liquid-level">
          <path className="ls-liquid-wave is-back" d={WAVE} transform="translate(0 92)" />
          <g transform="translate(0 100)">
            <path className="ls-liquid-wave is-front" d={WAVE} fill={`url(#${id}g)`} />
          </g>
        </g>
        <circle className="ls-liquid-bubble" cx="74" cy="168" r="5" />
        <circle className="ls-liquid-bubble is-b" cx="122" cy="176" r="3.5" />
        <circle className="ls-liquid-bubble is-c" cx="100" cy="172" r="4.5" />
      </g>
    </svg>
  );
}
