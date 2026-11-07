import { registry, addableTypes } from "./registry";
import type { Section, SiteConfig } from "./schema";
export function insertDroppedMedia(
  config: SiteConfig,
  pageKey: string,
  targetId: string | null,
  media: { kind: "image" | "video"; url: string },
  allowed: Parameters<typeof addableTypes>[2],
  admin: boolean,
  id: string,
): string {
  const page = config.pages[pageKey];
  if (!page || ["protected", "legal"].includes(page.kind))
    throw new Error(
      "Cette page est protégée. Choisissez une page de contenu pour déposer vos médias.",
    );
  const target = page.sections.find((s) => s.id === targetId);
  if (target?.lock === 3 || target?.type === "system")
    throw new Error(
      "Ce bloc est protégé. Déposez le média sur une section personnalisable.",
    );
  const editable = (field: string) =>
    target &&
    (admin ||
      target.lock === 1 ||
      (target.lock === 2 &&
        registry[target.type].partialFields.includes(field)));
  if (target && media.kind === "image") {
    const field = registry[target.type].fields.find(
      (f) => f.kind === "image" && editable(f.key),
    );
    if (field) {
      const props = target.props as Record<string, unknown>;
      props[field.key] = { ...(props[field.key] as object), src: media.url };
      return target.id;
    }
    if (target.type === "gallery" && editable("images")) {
      if (target.props.images.length >= 24)
        throw new Error("La galerie contient déjà 24 images.");
      target.props.images.push({ src: media.url, alt: "" });
      return target.id;
    }
  }
  if (
    target?.type === "video" &&
    media.kind === "video" &&
    editable("source")
  ) {
    target.props.source = {
      kind: "file",
      src: media.url,
      poster: target.props.source.poster,
    };
    return target.id;
  }
  const type = media.kind === "image" ? "textImage" : "video";
  if (
    !["content", "custom"].includes(page.kind) ||
    page.sections.length >= 40 ||
    !addableTypes(config, page.kind, allowed).includes(type)
  )
    throw new Error(
      "L’ajout de ce média n’est pas autorisé sur cette page, ou sa limite de sections est atteinte.",
    );
  const section = {
    id,
    type,
    lock: 1,
    visible: true,
    required: false,
    props: registry[type].create!(),
  } as Section;
  if (section.type === "textImage")
    section.props.image = { src: media.url, alt: "" };
  if (section.type === "video")
    section.props.source = { kind: "file", src: media.url, poster: "" };
  const index = target
    ? page.sections.indexOf(target) + 1
    : page.sections.length;
  page.sections.splice(index, 0, section);
  return section.id;
}
