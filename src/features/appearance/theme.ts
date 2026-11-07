import { z } from "zod";
import { defaultCategoryColors } from "./categories";
const colorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((v) => v.toLowerCase());
export const categoryColorsSchema = z
  .object({
    pilotage: colorSchema,
    operations: colorSchema,
    management: colorSchema,
    team: colorSchema,
    finance: colorSchema,
    customers: colorSchema,
    configuration: colorSchema,
  })
  .strict();

export const appearanceSchema = z
  .object({
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .transform((v) => v.toLowerCase()),
    font: z.enum(["default", "inter", "nunito", "poppins"]),
    mode: z.enum(["light", "dark"]).default("light"),
    textSize: z.enum(["standard", "large", "extraLarge"]).default("standard"),
    categoryColors: categoryColorsSchema.default(defaultCategoryColors),
  })
  .strict();
export type Appearance = z.infer<typeof appearanceSchema>;
export const defaultAppearance: Appearance = {
  color: "#344d3e",
  font: "default",
  mode: "light",
  textSize: "standard",
  categoryColors: defaultCategoryColors,
};
export const palettes = [
  ["Originale", "#344d3e"],
  ["Rose", "#b73578"],
  ["Bleu", "#2563b8"],
  ["Violet", "#7950b5"],
  ["Orange", "#b85318"],
  ["Turquoise", "#087e83"],
] as const;
export const fonts = {
  default: "Arial, Helvetica, sans-serif",
  inter: '"Atacuisine Inter", Arial, sans-serif',
  nunito: '"Atacuisine Nunito", Arial, sans-serif',
  poppins: '"Atacuisine Poppins", Arial, sans-serif',
};
const rgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
export function luminance(hex: string) {
  const values = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
export function contrast(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function mix(hex: string, target: number, amount: number) {
  return (
    "#" +
    rgb(hex)
      .map((v) =>
        Math.round(v + (target - v) * amount)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export function themeVariables(
  value: Pick<Appearance, "color" | "font"> & Partial<Appearance>,
): Record<string, string> {
  // Keep white button labels legible, including when a pale custom color is chosen.
  let accent = value.color;
  for (let i = 0; contrast(accent, "#ffffff") < 4.7 && i < 100; i++)
    accent = mix(accent, 0, 0.05);
  const dark = value.mode === "dark";
  const categoryVars: Record<string, string> = {};
  for (const [key, color] of Object.entries(
    value.categoryColors || defaultCategoryColors,
  )) {
    let ink = color;
    const surface = dark ? mix(color, 0, 0.8) : mix(color, 255, 0.92);
    for (let i = 0; contrast(ink, surface) < 4.7 && i < 100; i++)
      ink = mix(ink, dark ? 255 : 0, 0.07);
    categoryVars[`--category-${key}-ink`] = ink;
    categoryVars[`--category-${key}-bg`] = surface;
  }
  return {
    ...categoryVars,
    "--appearance-text-scale": String(
      { standard: 1, large: 1.15, extraLarge: 1.3 }[
        value.textSize || "standard"
      ],
    ),
    "--appearance-min-text": `${14 * { standard: 1, large: 1.15, extraLarge: 1.3 }[value.textSize || "standard"]}px`,
    colorScheme: dark ? "dark" : "light",
    "--appearance-link": dark
      ? mix(value.color, 255, 0.65)
      : mix(accent, 0, 0.15),
    "--appearance-hover": mix(accent, 0, 0.15),
    "--appearance-on-accent": "#ffffff",
    "--appearance-font":
      value.font === "default" ? "initial" : fonts[value.font],
    "--appearance-accent": accent,
    "--appearance-ink": dark
      ? mix(value.color, 255, 0.94)
      : mix(accent, 0, 0.55),
    "--appearance-muted": dark
      ? mix(value.color, 255, 0.72)
      : mix(accent, 0, 0.2),
    "--appearance-bg": dark ? "#111318" : mix(value.color, 255, 0.96),
    "--appearance-surface": dark ? "#1b1e26" : mix(value.color, 255, 0.99),
    "--appearance-soft": dark ? "#292d38" : mix(value.color, 255, 0.91),
    "--appearance-line": dark ? "#646d7c" : mix(accent, 255, 0.79),
    "--appearance-white": "#ffffff",
    "--appearance-success-bg": dark ? "#193329" : "#edf3e9",
    "--appearance-success-ink": dark ? "#b4e6c3" : "#3c633b",
    "--appearance-warning-bg": dark ? "#3b2d1b" : "#fff2df",
    "--appearance-warning-ink": dark ? "#ffd89a" : "#795015",
    "--appearance-danger-bg": dark ? "#3b222a" : "#f9eae5",
    "--appearance-danger-ink": dark ? "#ffc1c1" : "#8f3e34",
    "--appearance-info-bg": dark ? "#1d303d" : "#eaf0f2",
    "--appearance-info-ink": dark ? "#b8dcf1" : "#3d6277",
  };
}
export const appearanceCacheKey = (id: string) =>
  `atacuisine-appearance:v1:${id}`;
