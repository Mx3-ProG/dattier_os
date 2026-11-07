"use client";
import {
  createContext,
  useContext,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { Moon, Sun } from "lucide-react";
import { themeVariables } from "@/features/appearance/theme";
import type { Theme } from "@/features/cms/schema";
import "./public-appearance.css";
export type PublicMode = "system" | "light" | "dark";
const InitialMode = createContext<PublicMode>("system");
export function PublicModeProvider({
  initialMode,
  children,
}: {
  initialMode: PublicMode;
  children: ReactNode;
}) {
  return (
    <InitialMode.Provider value={initialMode}>{children}</InitialMode.Provider>
  );
}
const PublicTheme = createContext<
  | {
      mode: PublicMode;
      style: CSSProperties;
      setMode: (mode: PublicMode) => void;
    }
  | undefined
>(undefined);
export const usePublicAppearance = () => useContext(PublicTheme);
export function PublicAppearance({
  theme,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { theme: Theme }) {
  const initial = useContext(InitialMode);
  const [mode, setMode] = useState<PublicMode>(initial);
  const night = themeVariables({
    color: theme.colors.primary,
    font: "default",
    mode: "dark",
  });
  const style = Object.fromEntries(
    Object.entries(night)
      .filter(
        ([key]) => key.startsWith("--appearance-") && !key.includes("font"),
      )
      .map(([key, value]) => [
        key.replace("--appearance-", "--public-night-"),
        value,
      ]),
  ) as CSSProperties;
  function change(next: PublicMode) {
    setMode(next);
    // This cookie only stores a display preference; never a dashboard/account identity.
    try {
      document.cookie = `atacuisine_public_mode=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    } catch {
      /* The current page still works when persistence is blocked. */
    }
  }
  return (
    <PublicTheme.Provider value={{ mode, style, setMode: change }}>
      <div
        {...props}
        style={{ ...props.style, ...style }}
        data-public-mode={mode}
      >
        {children}
      </div>
    </PublicTheme.Provider>
  );
}
export function PublicModeSwitch() {
  const value = usePublicAppearance();
  if (!value) return null;
  return (
    <div
      className="public-mode-switch"
      role="group"
      aria-label="Apparence du site"
    >
      <button
        type="button"
        aria-pressed={value.mode === "light"}
        onClick={() => value.setMode("light")}
        aria-label="Mode jour du site"
      >
        <Sun size={17} />
        <span>Jour</span>
      </button>
      <button
        type="button"
        aria-pressed={value.mode === "dark"}
        onClick={() => value.setMode("dark")}
        aria-label="Mode nuit du site"
      >
        <Moon size={17} />
        <span>Nuit</span>
      </button>
    </div>
  );
}
