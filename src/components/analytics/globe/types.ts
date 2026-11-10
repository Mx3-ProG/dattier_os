import type { GlobeCluster, GlobePoint } from "@/features/analytics/cluster";

/**
 * Contrat entre le tableau de bord et le rendu 3D. Pour brancher un autre globe (votre dossier de
 * carte 3D, par exemple), implémentez `GlobeEngineFactory` et changez une ligne de `assets.ts` :
 * ni l’interface, ni les données, ni les API ne bougent. Voir docs/platform/EARTH_TRACKER.md.
 */
export type GlobeSelection = {
  cluster: GlobeCluster | null;
  /** Code ISO alpha-2 du pays situé sous le pointeur, si la zone touchée en est un. */
  country: string | null;
  lat: number;
  lng: number;
};
export type GlobeHover = { cluster: GlobeCluster; x: number; y: number } | null;
export type GlobeHandle = {
  setPoints(points: readonly GlobePoint[]): void;
  /** Pulsation sur une zone, à l’arrivée d’une visite. */
  pulse(lat: number, lng: number): void;
  setAutoRotate(enabled: boolean): void;
  setMarkersVisible(visible: boolean): void;
  focus(lat: number, lng: number): void;
  /** Commandes clavier et boutons : facteur de zoom (<1 rapproche), rotation en degrés. */
  zoomBy(factor: number): void;
  rotateBy(degrees: number): void;
  dispose(): void;
};
export type GlobeAssets = {
  /** Texture équirectangulaire fournie (WebP/JPEG/PNG). `null` : carte dessinée depuis Natural Earth. */
  earthTextureUrl: string | null;
};
export type GlobeEngineOptions = {
  container: HTMLElement;
  reducedMotion: boolean;
  /** Mobile ou petit écran : textures et géométries allégées. */
  lowPower: boolean;
  autoRotate: boolean;
  assets: GlobeAssets;
  onHover(hover: GlobeHover): void;
  onSelect(selection: GlobeSelection): void;
  /** Contexte WebGL perdu : l’interface bascule sur la carte 2D. */
  onContextLost(): void;
};
export type GlobeEngineFactory = (options: GlobeEngineOptions) => Promise<GlobeHandle>;
