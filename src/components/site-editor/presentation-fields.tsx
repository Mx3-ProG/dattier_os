import type { Presentation } from "@/features/cms/schema";
import { siteTemplates } from "@/features/cms/templates";
import { useTenantSite } from "../cms-site/context";

export function PresentationFields({
  value,
  change,
}: {
  value?: Presentation;
  change: (value: Presentation) => void;
}) {
  const t = useTenantSite().text;
  if (!value)
    return (
      <p>
        Choisissez un modèle dans la bibliothèque pour accéder à ses réglages de
        composition.
      </p>
    );
  const premium = siteTemplates.find((t) => t.id === value.layout)?.premium;
  return (
    <fieldset className="site-form">
      <legend>Composition et interactions</legend>
      <label className="site-field">
        Composition
        <select
          value={value.layout}
          onChange={(e) => {
            const t = siteTemplates.find((t) => t.id === e.target.value);
            if (t?.theme.presentation)
              change(structuredClone(t.theme.presentation));
          }}
        >
          {siteTemplates
            .filter((t) => premium || !t.premium)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.premium ? " · Premium" : ""}
              </option>
            ))}
        </select>
      </label>
      {premium ? (
        <>
          {(
            [
              ["stickyHeader", "Garder l’en-tête visible au défilement"],
              ["motion", "Animer l’apparition et les boutons"],
              ["surprise", "Afficher le clin d’œil interactif"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="site-check">
              <input
                type="checkbox"
                checked={value[key]}
                onChange={(e) => change({ ...value, [key]: e.target.checked })}
              />{" "}
              {label}
            </label>
          ))}
          <label className="site-field">
            Barre d’action persistante
            <select
              value={value.stickyAction}
              onChange={(e) =>
                change({
                  ...value,
                  stickyAction: e.target.value as Presentation["stickyAction"],
                })
              }
            >
              <option value="none">Masquée</option>
              <option value="order">Commander</option>
              <option value="reserve">{t("Réserver une table")}</option>
            </select>
          </label>
          <small>
            Les animations respectent les préférences de mouvement du visiteur.
            Le panier reste prioritaire sur la barre d’action.
          </small>
        </>
      ) : (
        <p>
          Ce modèle gratuit utilise une navigation simple, sans élément fixe ni
          animation premium.
        </p>
      )}
    </fieldset>
  );
}
