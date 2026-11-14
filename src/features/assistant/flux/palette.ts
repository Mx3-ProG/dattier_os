/* Palette complète et lisible à partir de trois couleurs choisies par FLUX.
   Chaque paire contrôlée par le CMS (rules.ts) est ajustée jusqu’à son seuil :
   un site construit par FLUX ne peut jamais être refusé pour contraste. */
import { contrast } from "@/features/cms/rules";
import type { Theme } from "@/features/cms/schema";

type Rgb = [number, number, number];
const toRgb = (hex: string): Rgb => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = ([r, g, b]: Rgb) =>
  `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
/** Mélange `a` vers `b` (0 = a, 1 = b). */
export function mix(a: string, b: string, amount: number) {
  const x = toRgb(a), y = toRgb(b);
  return toHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * amount) as Rgb);
}
const INK = "#1f1b1a";
const PAPER = "#fbf8f3";
const isLight = (hex: string) => contrast(hex, "#000000") >= contrast(hex, "#ffffff");

/** Rapproche `color` de `toward` par petits pas jusqu’au contraste voulu avec `on`. */
function ensure(color: string, on: string, min: number, toward: string) {
  let value = color;
  for (let step = 1; step <= 20 && contrast(value, on) < min; step++) value = mix(color, toward, step / 20);
  return value;
}

export function fluxColors(input: { primary: string; background: string; accent: string }): Theme["colors"] {
  const background = input.background;
  const ink = isLight(background) ? INK : PAPER;
  const text = ensure(ink, background, 4.5, isLight(background) ? "#000000" : "#ffffff");
  const muted = ensure(mix(text, background, 0.35), background, 4.5, text);
  const primary = ensure(input.primary, background, 3.2, text);
  const buttonBg = primary;
  const buttonText = contrast("#ffffff", buttonBg) >= contrast(INK, buttonBg) ? "#ffffff" : INK;
  return {
    primary,
    primaryDark: mix(primary, "#000000", 0.18),
    secondary: mix(primary, background, 0.35),
    accent: mix(input.accent, background, 0.72),
    text,
    muted,
    background,
    buttonBg,
    buttonText,
    link: primary,
  };
}
