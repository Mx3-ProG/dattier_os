import type { Presentation } from "@/features/cms/schema";
import { siteTemplates } from "@/features/cms/templates";
import {
  badgeEffectIds,
  buttonEffectIds,
  cardEffectIds,
  effectDescriptions,
  effectIsPremium,
  effectLabels,
  titleEffectIds,
  type BadgeEffectId,
  type ButtonEffectId,
  type CardEffectId,
  type EffectId,
  type TitleEffectId,
} from "@/features/cms/effects";
import { useTenantSite } from "../cms-site/context";

/** Une liste d'effets proposés pour un emplacement du modèle. */
type Slot = {
  key: "title" | "button" | "card" | "badge";
  label: string;
  ids: readonly EffectId[];
};

const SLOTS: Slot[] = [
  { key: "title", label: "Titre de la bannière", ids: titleEffectIds },
  { key: "button", label: "Bouton principal", ids: buttonEffectIds },
  { key: "card", label: "Cartes de la carte", ids: cardEffectIds },
  { key: "badge", label: "Pastilles d’avantages", ids: badgeEffectIds },
];

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
  const current = siteTemplates.find((t) => t.id === value.layout);
  const premium = current?.premium ?? false;
  const effects = value.effects ?? current?.effects;

  const setEffect = (slot: Slot["key"], id: string) => {
    const next = { ...(effects ?? current?.effects) } as Record<string, string>;
    next[slot] = id;
    change({
      ...value,
      effects: next as unknown as NonNullable<Presentation["effects"]>,
    });
  };

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
          animation premium. Les effets d’interface restent disponibles : ils
          peuvent être changés ou coupés à tout moment.
        </p>
      )}

      <div className="site-effects">
        <label className="site-check">
          <input
            type="checkbox"
            checked={!!effects}
            onChange={(e) =>
              change({
                ...value,
                effects: e.target.checked
                  ? effects ?? current?.effects
                  : undefined,
              })
            }
          />{" "}
          Effets d’interface (reflets, dégradés, étincelles)
        </label>
        {effects &&
          SLOTS.map((slot) => (
            <label className="site-field" key={slot.key}>
              {slot.label}
              <select
                value={(effects as Record<string, string>)[slot.key] ?? "none"}
                onChange={(e) => setEffect(slot.key, e.target.value)}
              >
                {slot.ids.map((id) => {
                  const locked = effectIsPremium(id) && !premium;
                  return (
                    <option key={id} value={id} disabled={locked}>
                      {effectLabels[id]}
                      {locked ? " · Premium" : ""}
                    </option>
                  );
                })}
              </select>
              <small>{effectDescriptions[(effects as Record<string, string>)[slot.key] as EffectId]}</small>
            </label>
          ))}
        {effects && (
          <small>
            Les effets suivent votre palette et vos polices. Ils sont coupés si
            vous désactivez les animations, et si le visiteur demande moins de
            mouvement.
          </small>
        )}
      </div>
    </fieldset>
  );
}

export type { TitleEffectId, ButtonEffectId, CardEffectId, BadgeEffectId };
