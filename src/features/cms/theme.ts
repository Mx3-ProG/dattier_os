import { defaultTheme } from "./defaults";
import type { FontId, Theme } from "./schema";

/**
 * Closed font library. Web fonts are self-hosted at build time by next/font
 * (src/app/fonts.ts): visitors never call Google. Stacks end with safe fallbacks.
 */
export const fonts: Record<
  FontId,
  { label: string; stack: string; kind: "serif" | "sans" }
> = {
  georgia: {
    label: "Georgia (actuelle des titres)",
    stack: 'Georgia, "Times New Roman", serif',
    kind: "serif",
  },
  arial: {
    label: "Arial (actuelle des textes)",
    stack: "Arial, Helvetica, sans-serif",
    kind: "sans",
  },
  system: {
    label: "Police du système",
    stack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    kind: "sans",
  },
  trebuchet: {
    label: "Trebuchet",
    stack: '"Trebuchet MS", "Lucida Sans", Arial, sans-serif',
    kind: "sans",
  },
  playfair: {
    label: "Playfair Display",
    stack: "var(--font-playfair), Georgia, serif",
    kind: "serif",
  },
  fraunces: {
    label: "Fraunces",
    stack: "var(--font-fraunces), Georgia, serif",
    kind: "serif",
  },
  dmSerif: {
    label: "DM Serif Display",
    stack: "var(--font-dm-serif), Georgia, serif",
    kind: "serif",
  },
  poppins: {
    label: "Poppins",
    stack: "var(--font-poppins), Arial, sans-serif",
    kind: "sans",
  },
  nunito: {
    label: "Nunito",
    stack: "var(--font-nunito), Arial, sans-serif",
    kind: "sans",
  },
  inter: {
    label: "Inter",
    stack: "var(--font-inter), Arial, sans-serif",
    kind: "sans",
  },
};

/**
 * CSS for the public site, limited to what differs from the default theme:
 * with the default theme it is empty, so the site renders exactly as before.
 * Every interpolated value is a validated hex colour, number or allowlisted stack.
 */
export function themeCss(theme: Theme): string {
  const d = defaultTheme;
  const c = theme.colors;
  const rules: string[] = [];
  const vars: string[] = [];
  const v = (name: string, key: keyof Theme["colors"]) => {
    vars.push(`${name}:${c[key]}`);
  };
  v("--pink", "primary");
  v("--pink-dark", "primaryDark");
  v("--cyan", "secondary");
  v("--site-accent", "accent");
  v("--site-ink", "text");
  v("--site-muted", "muted");
  v("--cream", "background");
  if (vars.length) rules.push(`.donut-site{${vars.join(";")}}`);
  if (
    c.buttonBg !== d.colors.buttonBg ||
    c.buttonText !== d.colors.buttonText ||
    c.primary !== d.colors.primary
  )
    rules.push(
      `.donut-site .donut-button:not(.outline):not(.dark),.donut-mobile-cart{background:var(--public-accent,${c.buttonBg});color:var(--public-on-accent,${c.buttonText})!important}`,
      `.donut-site .donut-button:not(.outline):not(.dark):hover{background:var(--public-accent,${c.buttonBg});filter:brightness(.9)}`,
    );
  if (c.link !== d.colors.link)
    rules.push(
      `.donut-site .donut-text-link{color:var(--public-link,${c.link});border-bottom-color:var(--public-link,${c.link})}`,
    );
  if (theme.fonts.heading !== d.fonts.heading)
    rules.push(
      `.donut-site h1,.donut-site h2,.donut-site .donut-brand{font-family:${fonts[theme.fonts.heading].stack}}`,
    );
  if (theme.fonts.body !== d.fonts.body)
    rules.push(`.donut-site{font-family:${fonts[theme.fonts.body].stack}}`);
  if (theme.fonts.button !== d.fonts.button)
    rules.push(
      `.donut-site .donut-button,.donut-site .donut-text-link{font-family:${fonts[theme.fonts.button].stack}}`,
    );
  if (theme.headingScale !== d.headingScale)
    rules.push(
      `.donut-site h1{font-size:calc(clamp(52px,5.7vw,88px)*${theme.headingScale})}`,
    );
  if (theme.subheadingScale !== d.subheadingScale)
    rules.push(
      `.donut-site h2{font-size:calc(clamp(38px,4.2vw,62px)*${theme.subheadingScale})}`,
    );
  if (theme.headingWeight !== d.headingWeight)
    rules.push(
      `.donut-site h1,.donut-site h2{font-weight:${theme.headingWeight}}`,
    );
  if (theme.letterSpacing !== d.letterSpacing)
    rules.push(
      `.donut-site h1,.donut-site h2{letter-spacing:${theme.letterSpacing === "normal" ? "-1px" : "0"}}`,
    );
  return rules.join("\n");
}
