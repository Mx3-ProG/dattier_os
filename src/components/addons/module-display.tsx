"use client";
import { createContext, useContext } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  moduleScreens,
  sectorGatedModules,
  type DisplayableModule,
  type ModuleDisplay,
} from "@/features/modules/display";

export type ModuleDisplayValue = {
  display: readonly ModuleDisplay[];
  /** Écrans actuellement visibles dans le tableau de bord pour ce profil. */
  accessible: readonly string[];
  industry?: string;
  canManage: boolean;
  busy: boolean;
  setDisplay: (module: DisplayableModule, shown: boolean | null) => Promise<void>;
};
export const ModuleDisplayContext = createContext<ModuleDisplayValue | null>(null);

/**
 * Troisième geste de chaque add-on, à côté de « Désinstaller » et « Suspendre » :
 * afficher ou masquer son entrée dans le tableau de bord. N'ouvre aucun droit.
 */
export function ModuleDisplayControl({ module, label }: { module: DisplayableModule | null; label: string }) {
  const value = useContext(ModuleDisplayContext);
  if (!value || !module) return null;
  const choice = value.display.find((entry) => entry.module_id === module)?.shown;
  const visible = moduleScreens(module).some((screen) => value.accessible.includes(screen));
  const outOfSector = value.industry !== undefined && value.industry !== "restaurant" && sectorGatedModules.has(module);
  const status = visible
    ? choice === true && outOfSector ? "Affiché dans le tableau de bord (hors secteur restauration)" : "Affiché dans le tableau de bord"
    : choice === false
      ? "Masqué du tableau de bord"
      : choice === true
        ? "Affichage demandé : visible dès que l’add-on est installé, actif et autorisé pour votre profil"
        : outOfSector
          ? "Non affiché : prévu pour la restauration"
          : "Non affiché dans le tableau de bord";
  return (
    <div className="addon-display" data-visible={visible}>
      <p className="addon-hint">
        {visible ? <Eye size={15} aria-hidden /> : <EyeOff size={15} aria-hidden />} {status}
      </p>
      {value.canManage && (
        <Button
          variant="secondary"
          disabled={value.busy}
          aria-label={`${visible ? "Masquer" : "Afficher"} ${label} dans le tableau de bord`}
          onClick={() => void value.setDisplay(module, !visible)}
        >
          {visible ? "Masquer du tableau de bord" : "Afficher dans le tableau de bord"}
        </Button>
      )}
      {value.canManage && choice !== undefined && (
        <button type="button" className="addon-link" disabled={value.busy} onClick={() => void value.setDisplay(module, null)}>
          Rétablir l’affichage par défaut
        </button>
      )}
    </div>
  );
}
