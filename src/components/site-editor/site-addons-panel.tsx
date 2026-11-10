"use client";
import Link from "next/link";
import { LoadingScreenView } from "@/components/loading-screens/engine";
import { SiteNotFound } from "@/components/cms-site/site-not-found";
import { SiteDecoration } from "@/components/cms-site/site-decoration";
import { SiteBackgroundPreview } from "@/components/cms-site/site-background";
import { isLoadingRenderer, loadingRenderers, type LoadingRendererDefinition } from "@/features/addons/loading-screens";
import type { SiteConfig } from "@/features/cms/schema";
import { effectiveNotFound, effectiveSiteBackground, effectiveSiteDecoration, effectiveSiteLoader, notFoundDefaults, type SiteAddonData } from "@/features/cms/site-addons";

type Update = (mutate: (c: SiteConfig) => void, key?: string) => void;

/** Identité · add-ons du site : écran de chargement et page 404, choisis parmi les add-ons acquis. */
export function SiteAddonIdentity({ config, update, addons, storeHref }: { config: SiteConfig; update: Update; addons: SiteAddonData; storeHref: string }) {
  const loader = effectiveSiteLoader(config.branding.loader, addons.loadingScreens);
  const notFound = config.branding.notFound;
  const design = effectiveNotFound(notFound, addons.notFoundPages);
  const decoration = effectiveSiteDecoration(config.branding.decoration, addons.decorations);
  const background = effectiveSiteBackground(config.branding.background, addons.backgrounds);
  const setNotFound = (patch: Partial<NonNullable<SiteConfig["branding"]["notFound"]>>, key: string) =>
    update((c) => {
      c.branding.notFound = { product: null, title: "", message: "", button: "", ...c.branding.notFound, ...patch };
    }, key);
  const definition: LoadingRendererDefinition | null = loader && isLoadingRenderer(loader) ? loadingRenderers[loader] : null;
  return (
    <section className="site-addon-identity" aria-label="Add-ons du site">
      <h4>Écran de chargement du site</h4>
      <p className="muted">Affiché à vos visiteurs pendant le passage d’une page à l’autre, sans jamais retarder le site.</p>
      <label className="site-field">
        Animation
        <select value={config.branding.loader?.product ?? ""} onChange={(event) => update((c) => { c.branding.loader = { product: event.target.value || null }; }, "b.loader")}>
          <option value="">Aucune animation</option>
          {addons.loadingScreens.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
      </label>
      {addons.loadingScreens.length === 0 && <p className="muted">Aucun écran de chargement installé.</p>}
      {definition && loader && (
        <div className="site-addon-identity-preview">
          <LoadingScreenView renderer={loader} variant="preview" size={110} primary={definition.primary} secondary={definition.secondary}
            background={definition.background} text={definition.text} speed={1} message={config.branding.publicName || null} />
        </div>
      )}

      <h4>Décoration de Noël du site</h4>
      <p className="muted">Choisissez un décor installé pour habiller les pages publiques.</p>
      <label className="site-field">
        Décoration
        <select value={config.branding.decoration?.product ?? ""} onChange={(event) => update((c) => { c.branding.decoration = { product: event.target.value || null }; }, "b.decoration")}>
          <option value="">Aucune décoration</option>
          {addons.decorations.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
      </label>
      {decoration && <div className="site-addon-identity-preview"><SiteDecoration design={decoration} preview /></div>}

      <h4>Fond du site</h4>
      <p className="muted">Choisissez un fond installé. Le texte et les boutons conservent leurs couleurs actuelles.</p>
      <label className="site-field">
        Fond
        <select value={config.branding.background?.product ?? ""} onChange={(event) => update((c) => { c.branding.background = { product: event.target.value || null }; }, "b.background")}>
          <option value="">Fond du thème actuel</option>
          {addons.backgrounds.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
      </label>
      {background && <div className="site-addon-identity-preview"><SiteBackgroundPreview design={background} /></div>}

      <h4>Page 404</h4>
      <p className="muted">La page affichée quand un visiteur suit un lien qui n’existe plus.</p>
      <label className="site-field">
        Modèle
        <select value={notFound?.product ?? ""} onChange={(event) => setNotFound({ product: event.target.value || null }, "b.nf.product")}>
          <option value="">Assiette vide (par défaut)</option>
          {addons.notFoundPages.filter((entry) => entry.renderer !== "plate").map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
      </label>
      <label className="site-field">
        Titre
        <input maxLength={120} value={notFound?.title ?? ""} placeholder={notFoundDefaults.title} onChange={(event) => setNotFound({ title: event.target.value }, "b.nf.title")} />
      </label>
      <label className="site-field">
        Message
        <textarea rows={2} maxLength={400} value={notFound?.message ?? ""} placeholder={notFoundDefaults.message} onChange={(event) => setNotFound({ message: event.target.value }, "b.nf.message")} />
      </label>
      <label className="site-field">
        Texte du bouton
        <input maxLength={60} value={notFound?.button ?? ""} placeholder={notFoundDefaults.button} onChange={(event) => setNotFound({ button: event.target.value }, "b.nf.button")} />
      </label>
      <div className="site-addon-identity-preview">
        <SiteNotFound preview design={design} title={notFound?.title || notFoundDefaults.title} message={notFound?.message || notFoundDefaults.message}
          button={notFound?.button || notFoundDefaults.button} home="#" brand={config.branding.publicName} logo={config.branding.logo.src}
          colors={{ primary: config.theme.colors.primary, background: config.theme.colors.background, text: config.theme.colors.text }} />
      </div>
      <p className="muted">
        Plus de modèles et d’animations dans la <Link href={storeHref}>boutique d’add-ons</Link>.
      </p>
    </section>
  );
}
