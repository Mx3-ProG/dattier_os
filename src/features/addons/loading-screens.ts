import { z } from "zod";
import { themedVisuals, type ThemedVisualId } from "@/features/cms/themed-visuals";

/**
 * Moteur commun des écrans de chargement : ce module ne dépend ni du serveur
 * ni de React, pour être partagé par l’API, l’interface et les tests.
 */
export const loadingScreenKind = "loading_screen";
export type LoadingRendererDefinition = {
  colorable: boolean;
  primary: string;
  secondary: string;
  /** Fond et texte imposés par l’animation ; null reprend le thème de l’utilisateur. */
  background: string | null;
  text: string | null;
};
export const loadingRenderers = {
  magic: { colorable: true, primary: "#b78cff", secondary: "#ffd98a", background: "#17132b", text: "#f5efff" },
  kitchen: { colorable: true, primary: "#344d3e", secondary: "#ac6848", background: null, text: null },
  "studio-s": { colorable: true, primary: "#283b32", secondary: "#c8a26a", background: null, text: null },
  liquid: { colorable: true, primary: "#1f8fd6", secondary: "#54e0c7", background: "#eef7fb", text: "#12384f" },
  neon: { colorable: true, primary: "#22e6ff", secondary: "#ff4fd8", background: "#080b1a", text: "#e6fbff" },
  coffee: { colorable: true, primary: "#6b4226", secondary: "#c98f5a", background: "#f7efe4", text: "#4a2e1b" },
  orbit: { colorable: true, primary: "#7c8cff", secondary: "#ffc27a", background: "#0a0d24", text: "#e9ecff" },
  infinity: { colorable: true, primary: "#ff7a59", secondary: "#ffd166", background: "#14161f", text: "#fff3ec" },
  crystal: { colorable: true, primary: "#5ad1e6", secondary: "#a78bfa", background: "#101828", text: "#e8f7fb" },
  golden: { colorable: false, primary: "#d9b45b", secondary: "#fff1c1", background: "#14110b", text: "#f6e7bf" },
  santa: { colorable: false, primary: "#c92f3a", secondary: "#fff7ed", background: "#18382f", text: "#fff7ed" },
  snowflake: { colorable: false, primary: "#a8d7e8", secondary: "#f6fbff", background: "#102d42", text: "#f6fbff" },
  giftbox: { colorable: false, primary: "#c93d4c", secondary: "#f3d38b", background: "#1c4038", text: "#fff7ed" },
  wreath: { colorable: false, primary: "#2d7255", secondary: "#efc87d", background: "#f7f1e6", text: "#263d34" },
  ...Object.fromEntries(Object.entries(themedVisuals).map(([id, visual]) => [id, {
    colorable: false, primary: visual.accent, secondary: visual.tint, background: visual.base, text: visual.accent,
  }])) as Record<ThemedVisualId, LoadingRendererDefinition>,
} as const satisfies Record<string, LoadingRendererDefinition>;
export type LoadingRendererId = keyof typeof loadingRenderers;
export const loadingRendererIds = Object.keys(loadingRenderers) as LoadingRendererId[];
export const isLoadingRenderer = (value: unknown): value is LoadingRendererId =>
  typeof value === "string" && Object.hasOwn(loadingRenderers, value);

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const loadingSettingsSchema = z
  .object({
    productId: z.string().min(1).max(64).nullable(),
    enabled: z.boolean(),
    primaryColor: color.nullable(),
    secondaryColor: color.nullable(),
    speed: z.number().min(0.5).max(2),
    showLogo: z.boolean(),
    // Pas de caractères de contrôle : le message est affiché tel quel à toute l’équipe.
    message: z
      .string()
      .max(80)
      .regex(/^[^\p{Cc}]*$/u)
      .nullable(),
    revision: z.number().int().min(0),
  })
  .strict()
  .refine((value) => !value.enabled || value.productId !== null, {
    message: "Choisissez un écran avant de l’activer.",
  });
export type LoadingSettingsInput = z.infer<typeof loadingSettingsSchema>;
export const defaultLoadingSettings = {
  primaryColor: null,
  secondaryColor: null,
  speed: 1,
  showLogo: false,
  message: null,
} as const;

/** Configuration effective vue par un membre de l’établissement. */
export type LoadingScreenConfig = {
  restaurant: string;
  renderer: LoadingRendererId;
  primary: string;
  secondary: string;
  background: string | null;
  text: string | null;
  speed: number;
  logo: string | null;
  message: string | null;
};
export type LoadingScreenRow = {
  renderer: string;
  primary_color: string | null;
  secondary_color: string | null;
  speed: number | string;
  show_logo: boolean;
  message: string | null;
};
/** Seuls les chemins locaux et le https sont acceptés pour un logo. */
export function safeLogo(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  if (/^\/(?![/\\])/.test(value)) return value;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}
export function resolveLoadingConfig(
  restaurant: string,
  row: LoadingScreenRow,
  logo: unknown,
): LoadingScreenConfig | null {
  if (!isLoadingRenderer(row.renderer)) return null;
  const definition: LoadingRendererDefinition = loadingRenderers[row.renderer];
  return {
    restaurant,
    renderer: row.renderer,
    primary: definition.colorable ? (row.primary_color ?? definition.primary) : definition.primary,
    secondary: definition.colorable ? (row.secondary_color ?? definition.secondary) : definition.secondary,
    background: definition.background,
    text: definition.text,
    speed: Number(row.speed) || 1,
    logo: row.show_logo ? safeLogo(logo) : null,
    message: row.message || null,
  };
}

const cachePrefix = "studio-loading-screen:v1:";
export const loadingCacheKey = (restaurant: string) => `${cachePrefix}${restaurant}`;
export const isLoadingCacheKey = (key: string) => key.startsWith(cachePrefix);
/** Un cache illisible ou d’un autre établissement est ignoré : le fallback natif prend le relais. */
export function parseLoadingCache(raw: string | null, restaurant: string): LoadingScreenConfig | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<LoadingScreenConfig> | null;
    if (!value || value.restaurant !== restaurant || !isLoadingRenderer(value.renderer)) return null;
    if (!color.safeParse(value.primary).success || !color.safeParse(value.secondary).success) return null;
    const speed = Number(value.speed);
    const definition: LoadingRendererDefinition = loadingRenderers[value.renderer];
    return {
      restaurant,
      renderer: value.renderer,
      primary: value.primary!,
      secondary: value.secondary!,
      background: definition.background,
      text: definition.text,
      speed: speed >= 0.5 && speed <= 2 ? speed : 1,
      logo: safeLogo(value.logo),
      message: typeof value.message === "string" ? value.message.slice(0, 80) : null,
    };
  } catch {
    return null;
  }
}
/** L’établissement affiché vient de l’URL, pour ne jamais montrer celui d’une page précédente. */
export function restaurantFromLocation(pathname: string, search: string): string | null {
  const query = new URLSearchParams(search).get("restaurant");
  if (query) return query;
  const match = /^\/restaurant\/([^/]+)/.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}
