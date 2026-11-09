"use client";
import dynamic from "next/dynamic";
import type { CSSProperties, ComponentType } from "react";
import type { LoadingRendererId } from "@/features/addons/loading-screens";
import "./engine.css";

/** Un fichier par animation : seules celles réellement affichées sont téléchargées. */
const loaders: Record<LoadingRendererId, () => Promise<{ default: ComponentType }>> = {
  magic: () => import("./screens/magic"),
  kitchen: () => import("./screens/kitchen"),
  "studio-s": () => import("./screens/studio-s"),
  liquid: () => import("./screens/liquid"),
  neon: () => import("./screens/neon"),
  coffee: () => import("./screens/coffee"),
  orbit: () => import("./screens/orbit"),
  infinity: () => import("./screens/infinity"),
  crystal: () => import("./screens/crystal"),
  golden: () => import("./screens/golden"),
};
const screens = Object.fromEntries(
  Object.entries(loaders).map(([id, load]) => [id, dynamic(load, { ssr: false })]),
) as Record<LoadingRendererId, ComponentType>;
export const preloadLoadingScreen = (renderer: LoadingRendererId) => loaders[renderer]();

export type LoadingScreenViewProps = {
  renderer: LoadingRendererId;
  primary: string;
  secondary: string;
  background: string | null;
  text: string | null;
  speed: number;
  logo?: string | null;
  message?: string | null;
  label?: string;
  variant?: "fullscreen" | "inline" | "preview";
  paused?: boolean;
  size?: number;
};
export function LoadingScreenView({
  renderer,
  primary,
  secondary,
  background,
  text,
  speed,
  logo,
  message,
  label = "Chargement",
  variant = "fullscreen",
  paused = false,
  size = 200,
}: LoadingScreenViewProps) {
  const Screen = screens[renderer];
  const preview = variant === "preview";
  const style = {
    "--ls-primary": primary,
    "--ls-secondary": secondary,
    "--ls-speed": speed,
    "--ls-size": `${size}px`,
    "--ls-size-number": size,
    ...(background ? { "--ls-bg": background } : {}),
    ...(text ? { "--ls-text": text } : {}),
  } as CSSProperties;
  return (
    <div
      className={`ls-screen${variant === "fullscreen" ? " is-fullscreen" : ""}${preview ? " is-preview" : ""}${paused ? " is-paused" : ""}`}
      style={style}
      data-loading-screen={renderer}
      {...(preview ? { "aria-hidden": true } : { role: "status", "aria-live": "polite" as const })}
    >
      {logo && (
        // eslint-disable-next-line @next/next/no-img-element -- logo du client, hôte inconnu au build
        <img className="ls-logo" src={logo} alt="" />
      )}
      <div className="ls-frame" aria-hidden>
        <div className="ls-stage">
          <Screen />
        </div>
      </div>
      {(!preview || message) && <p className="ls-label">{message || label}</p>}
    </div>
  );
}
