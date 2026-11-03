import { Fragment, type ReactNode } from "react";

/**
 * Safe text format of the CMS. Content is stored as plain text:
 *  - a line break renders as <br />,
 *  - *words* render as <em> (the pink emphasis of the site),
 *  - {{restaurant.x}} placeholders from a fixed allowlist are substituted.
 * Output is React nodes only (escaped by React): no HTML is ever interpreted.
 */
export const placeholderKeys = [
  "name",
  "address",
  "phone",
  "email",
  "description",
  "opening_hours",
  "logo",
  "primary_color",
] as const;
export type PlaceholderContext = Partial<
  Record<(typeof placeholderKeys)[number], string>
>;
const PLACEHOLDER = /\{\{\s*restaurant\.([a-z_]+)\s*\}\}/g;

/** Substitutes allowlisted placeholders; unknown ones are left untouched. */
export function resolvePlaceholders(text: string, ctx: PlaceholderContext) {
  return text.replace(PLACEHOLDER, (whole, key: string) =>
    (placeholderKeys as readonly string[]).includes(key) &&
    ctx[key as keyof PlaceholderContext] !== undefined
      ? ctx[key as keyof PlaceholderContext]!
      : whole,
  );
}

function lines(text: string, key: string): ReactNode[] {
  return text
    .split("\n")
    .flatMap((line, i) =>
      i === 0 ? [line] : [<br key={`${key}-br-${i}`} />, line],
    );
}

/** Renders the safe format. Emphasis may span line breaks. */
export function rich(text: string, ctx: PlaceholderContext = {}): ReactNode {
  // Split on emphasis markers first, so substituted values can never open one.
  const parts = text.split("*");
  const closed = parts.length % 2 === 1;
  return parts.map((part, i) => {
    const value = resolvePlaceholders(part, ctx);
    const emphasis = i % 2 === 1 && (closed || i < parts.length - 1);
    const literal = i % 2 === 1 && !emphasis ? `*${value}` : value;
    return emphasis ? (
      <em key={i}>{lines(value, `e${i}`)}</em>
    ) : (
      <Fragment key={i}>{lines(literal, `t${i}`)}</Fragment>
    );
  });
}
/** Plain text (placeholders resolved, markers removed): for alt texts and metadata. */
export const plain = (text: string, ctx: PlaceholderContext = {}) =>
  resolvePlaceholders(text, ctx)
    .replaceAll("*", "")
    .replace(/\s*\n\s*/g, " ");

/** Accepted link targets: internal paths and anchors, https, tel and mailto. */
export const SAFE_HREF =
  /^(\/(?!\/)[A-Za-z0-9\-._~/%#?=&]*|#[A-Za-z0-9\-_]+|https:\/\/[^\s"'<>]+|tel:\+?[0-9 .()-]{3,20}|mailto:[^\s"'<>@]+@[^\s"'<>]+)$/;
export const isSafeHref = (href: string) => SAFE_HREF.test(href);
