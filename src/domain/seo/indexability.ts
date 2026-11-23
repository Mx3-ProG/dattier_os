/** Contexte minimal pour décider si une page publique peut être indexée. */
export type IndexabilityContext = {
  demo: boolean;
  preview: boolean;
  mirror: boolean;
  addonInstalled: boolean;
  archived: boolean;
  suspended: boolean;
  siteNoIndex: boolean;
  pageNoIndex: boolean;
  pageVisible: boolean;
  pageKind: string;
  productPage: boolean;
  productVisible?: boolean;
};

/** Décision unique d’indexabilité. Toute page publique doit l’utiliser. */
export function indexable(ctx: IndexabilityContext): boolean {
  if (ctx.demo) return false;
  if (ctx.preview) return false;
  if (ctx.mirror) return false;
  if (!ctx.addonInstalled) return false;
  if (ctx.archived || ctx.suspended) return false;
  if (ctx.siteNoIndex) return false;
  if (ctx.pageNoIndex) return false;
  if (ctx.pageKind === "protected") return false;
  if (ctx.productPage && !ctx.pageVisible) return false;
  if (!ctx.pageVisible && !ctx.productPage) return false;
  return true;
}
