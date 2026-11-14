"use client";
/**
 * Adaptateur React Bits pour le site public.
 *
 * Les couleurs viennent de la configuration du thème (hex réels), jamais de
 * variables CSS : React Bits analyse les couleurs dans un canvas, qui ne sait
 * pas résoudre `var(--x)`. La palette reste donc pilotée par l'établissement.
 */
import type { CSSProperties, ReactNode } from "react";
import type {
  BadgeEffectId,
  ButtonEffectId,
  CardEffectId,
  TemplateEffects,
  TitleEffectId,
} from "@/features/cms/effects";
import ShinyText from "../reactbits/ShinyText/ShinyText";
import GradientText from "../reactbits/GradientText/GradientText";
import GlareHover from "../reactbits/GlareHover/GlareHover";
import ClickSpark from "../reactbits/ClickSpark/ClickSpark";

/** Palette du thème, en hex, telle que le CMS l'a enregistrée. */
export type EffectPalette = {
  /** Couleur du texte : celle du titre de la bannière. */
  text: string;
  /** Couleur d'accent : celle du reflet et des étincelles. */
  accent: string;
  /** Couleur principale : celle du dégradé animé. */
  primary: string;
  /** Couleur du texte des boutons, pour le contraste. */
  onAccent: string;
};

export const hasEffects = (effects?: Partial<TemplateEffects>) =>
  !!effects &&
  (effects.title !== "none" ||
    effects.button !== "none" ||
    effects.card !== "none");

/**
 * Titre de bannière : reflet ou dégradé animé.
 * Le dégradé part de la couleur du texte : sur fond clair comme sur fond
 * sombre, le titre reste lisible.
 */
export function EffectTitle({
  effect,
  palette,
  children,
}: {
  effect: TitleEffectId;
  palette: EffectPalette;
  children: ReactNode;
}) {
  if (effect === "shine")
    return (
      <ShinyText
        color={palette.text}
        shineColor={palette.accent}
        speed={3}
        angle={110}
        shineWidth={34}
        softness={0.85}
        trigger="loop"
        className="effect-title"
      >
        {children}
      </ShinyText>
    );
  if (effect === "gradient")
    return (
      <GradientText
        colors={[palette.text, palette.accent, palette.primary, palette.text]}
        animationSpeed={7}
        variant="linear"
        angle={100}
        className="effect-title"
      >
        {children}
      </GradientText>
    );
  return <>{children}</>;
}

/**
 * Pastille d'avantage : un voile qui traverse la pastille au survol.
 * L'effet est purement CSS : le texte garde la couleur du thème et reste
 * lisible sur fond clair comme sur fond sombre.
 */
export function EffectBadge({
  effect,
  children,
}: {
  effect: BadgeEffectId;
  children: ReactNode;
}) {
  if (effect === "none") return <>{children}</>;
  return (
    <span className={`effect-badge effect-badge--${effect}`}>{children}</span>
  );
}

/** Bouton : reflet au survol ou étincelles au clic. */
export function EffectButton({
  effect,
  palette,
  children,
  className,
  style,
}: {
  effect: ButtonEffectId;
  palette: EffectPalette;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  if (effect === "glare")
    return (
      <GlareHover
        glareColor={palette.accent}
        glareOpacity={0.45}
        glareAngle={-45}
        variant="streak"
        mode="hover"
        transitionDuration={550}
        className={className}
        style={{ width: "auto", height: "auto", ...style }}
      >
        {children}
      </GlareHover>
    );
  if (effect === "spark")
    return (
      <ClickSpark
        sparkColor={palette.accent}
        sparkSize={9}
        sparkCount={14}
        duration={480}
        shape="dot"
        direction={90}
        glow={0.4}
        className={className}
        style={{ width: "auto", height: "auto", display: "inline-block", ...style }}
      >
        {children}
      </ClickSpark>
    );
  return <>{children}</>;
}

/** Carte : voile ou reflet diagonal au survol. */
export function EffectCard({
  effect,
  palette,
  children,
  className,
  style,
}: {
  effect: CardEffectId;
  palette: EffectPalette;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  if (effect === "sheen" || effect === "streak")
    return (
      <GlareHover
        glareColor={palette.accent}
        glareOpacity={effect === "sheen" ? 0.28 : 0.4}
        glareAngle={effect === "sheen" ? -20 : -35}
        glareSize={effect === "sheen" ? 22 : 30}
        variant={effect === "sheen" ? "sheen" : "streak"}
        mode="hover"
        rimGlint={false}
        transitionDuration={effect === "sheen" ? 700 : 600}
        className={`effect-card ${className ?? ""}`}
        style={{ width: "auto", height: "auto", ...style }}
      >
        {children}
      </GlareHover>
    );
  return <>{children}</>;
}
