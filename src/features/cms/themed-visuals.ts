import data from "./themed-visuals.json";

export const themedVisuals = data;
export type ThemedVisualId = keyof typeof data;
export const themedVisualIds = Object.keys(data) as ThemedVisualId[];
export const isThemedVisual = (value: unknown): value is ThemedVisualId =>
  typeof value === "string" && Object.hasOwn(data, value);
export const themedPrice = (id: ThemedVisualId) => ({ free: 0, six: 600, nine: 900, deluxe: 1900 })[data[id].tier];
