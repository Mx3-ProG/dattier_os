/**
 * Effets d'interface ajoutés par React Bits. Chaque modèle choisit sa
 * combinaison : deux modèles ne partagent jamais la même signature.
 * Les effets les plus coûteux en CPU sont réservés au premium.
 */
export const titleEffectIds = ["none", "shine", "gradient"] as const;
export const buttonEffectIds = ["none", "glare", "spark"] as const;
export const cardEffectIds = ["none", "sheen", "streak"] as const;
export const badgeEffectIds = ["none", "shine", "gradient"] as const;

export type TitleEffectId = (typeof titleEffectIds)[number];
export type ButtonEffectId = (typeof buttonEffectIds)[number];
export type CardEffectId = (typeof cardEffectIds)[number];
export type BadgeEffectId = (typeof badgeEffectIds)[number];
export type EffectId = TitleEffectId | ButtonEffectId | CardEffectId;

export const effectLabels: Record<EffectId, string> = {
  none: "Aucun effet",
  shine: "Titre qui brille",
  gradient: "Titre en dégradé animé",
  glare: "Reflet au survol",
  spark: "Étincelles au clic",
  sheen: "Voile lumineux sur la carte",
  streak: "Reflet diagonal sur la carte",
};

export const effectDescriptions: Record<EffectId, string> = {
  none: "Le site reste sobre et rapide.",
  shine: "Un reflet traverse le titre de la bannière.",
  gradient: "Le titre de la bannière change de couleur en continu.",
  glare: "Un reflet glisse sur le bouton au survol.",
  spark: "Une gerbe d’étincelles part du bouton au clic.",
  sheen: "Un voile lumineux traverse les cartes au survol.",
  streak: "Un reflet diagonal balaie les cartes au survol.",
};

/** Effets réservés aux modèles premium : ils coûtent du CPU sur mobile. */
export const premiumEffectIds: EffectId[] = ["spark"];

/**
 * Signature d'un modèle : ce que l'on voit dans le catalogue et ce qui est
 * appliqué au site public.
 */
export type TemplateEffects = {
  /** Titre de la bannière d'accueil. */
  title: TitleEffectId;
  /** Bouton principal de la bannière. */
  button: ButtonEffectId;
  /** Cartes de produits, de services et de biens. */
  card: CardEffectId;
  /** Pastilles d'avantages sous la bannière. */
  badge: BadgeEffectId;
};

export const defaultEffects: TemplateEffects = {
  title: "none",
  button: "none",
  card: "none",
  badge: "none",
};

export const effectIsPremium = (id: EffectId) => premiumEffectIds.includes(id);

export const effectsAreValid = (
  effects: Partial<TemplateEffects> | undefined,
): effects is TemplateEffects =>
  !!effects &&
  titleEffectIds.includes(effects.title as TitleEffectId) &&
  buttonEffectIds.includes(effects.button as ButtonEffectId) &&
  cardEffectIds.includes(effects.card as CardEffectId) &&
  badgeEffectIds.includes(effects.badge as BadgeEffectId);
