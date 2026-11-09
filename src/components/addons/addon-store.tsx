"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { LoadingScreenView } from "@/components/loading-screens/engine";
import { storeLoadingConfig } from "@/components/loading-screens/tenant-loader";
import {
  defaultLoadingSettings,
  isLoadingRenderer,
  loadingRenderers,
  type LoadingRendererDefinition,
  type LoadingScreenConfig,
  type LoadingSettingsInput,
} from "@/features/addons/loading-screens";
import {
  compatibilityLabels,
  featuresCategoryId,
  filterProducts,
  formatPrice,
  isOwned,
  isInstalled,
  productAction,
  type StoreFilters,
  type StoreProduct,
  type StoreState,
} from "@/features/addons/store-catalog";
import { analyticsKind, earthTrackerProduct } from "@/features/analytics/modules";
import { plannedAddons } from "@/features/addons/planned-catalog";
import "./addon-store.css";
import "@/components/analytics/earth-tracker.css";

// La démonstration embarque three.js : téléchargée seulement à la demande.
const EarthTrackerDemo = dynamic(() =>
  import("@/components/analytics/earth-tracker-demo").then((m) => m.EarthTrackerDemo),
);

const endpoint = (restaurant: string, path: string) =>
  `/api/restaurants/${encodeURIComponent(restaurant)}/${path}`;
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || "Opération indisponible.");
  return body as T;
}
const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const definitionOf = (product: StoreProduct): LoadingRendererDefinition | null =>
  isLoadingRenderer(product.renderer) ? loadingRenderers[product.renderer] : null;

/** Vitrine sans WebGL : le point animé illustre le produit et se présente comme fictif. */
function AnalyticsPreview() {
  return (
    <div className="addon-preview">
      <div className="et-preview">
        <div className="et-preview-earth">
          <i className="et-preview-dot" style={{ left: "52%", top: "28%" }} />
          <i className="et-preview-dot" style={{ left: "30%", top: "44%", animationDelay: ".8s" }} />
          <i className="et-preview-dot" style={{ left: "68%", top: "62%", animationDelay: "1.5s" }} />
        </div>
        <small>Aperçu · données fictives</small>
      </div>
    </div>
  );
}

/** Aperçu animé réel : téléchargé à l’approche de l’écran et mis en pause hors de la vue. */
function LivePreview({
  product,
  primary,
  secondary,
  speed = 1,
  message,
}: {
  product: StoreProduct;
  primary?: string | null;
  secondary?: string | null;
  speed?: number;
  message?: string | null;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = holder.current;
    if (!element) return;
    if (!("IntersectionObserver" in window)) {
      setSeen(true);
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setSeen(true);
        setVisible(entry.isIntersecting);
      },
      { rootMargin: "160px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const definition = definitionOf(product);
  return (
    <div className="addon-preview" ref={holder}>
      {seen && definition && isLoadingRenderer(product.renderer) && (
        <LoadingScreenView
          renderer={product.renderer}
          variant="preview"
          size={120}
          paused={!visible}
          primary={(definition.colorable && primary) || definition.primary}
          secondary={(definition.colorable && secondary) || definition.secondary}
          background={definition.background}
          text={definition.text}
          speed={speed}
          message={message}
        />
      )}
    </div>
  );
}

function ProductCard({
  product,
  state,
  busy,
  onInstall,
  onBuy,
  onActivate,
  onSetInstallation,
  onOpenModule,
}: {
  product: StoreProduct;
  state: StoreState;
  busy: boolean;
  onInstall: (product: StoreProduct) => void;
  onBuy: (product: StoreProduct) => void;
  onActivate: (product: StoreProduct) => void;
  onSetInstallation: (product: StoreProduct, installed: boolean) => void;
  onOpenModule?: (module: string) => void;
}) {
  const [demoOpen, setDemoOpen] = useState(false);
  const isAnalytics = product.kind === analyticsKind;
  const isEstimation = product.kind === "estimation";
  const license = state.licenses.find((entry) => entry.product_id === product.id);
  const owned = isOwned(license);
  const installed = owned && isInstalled(state, product.id);
  const activeId = isEstimation ? product.id : isAnalytics
    ? state.analyticsCollecting
      ? product.id
      : null
    : state.settings?.enabled
      ? state.settings.product_id
      : null;
  const action = productAction(
    product,
    license,
    state.pending.some((entry) => entry.product_id === product.id),
    activeId,
  );
  const definition = definitionOf(product);
  const statusText = {
    active: isEstimation ? "Installé · prêt à configurer" : isAnalytics ? "Installé · mesure active" : "Installé · activé",
    activate: isAnalytics ? "Installé · mesure non activée" : "Installé · non activé",
    install: "Non installé",
    buy: "Non acquis",
    resume: "Paiement en attente",
    suspended: "Licence suspendue : litige de paiement en cours",
    unavailable: "Indisponible à la vente",
  }[action];
  return (
    <article className="card addon-card" aria-label={product.name} data-addon={product.id}>
      {isAnalytics ? <AnalyticsPreview /> : isEstimation ? <div className="addon-preview addon-estimation-preview"><strong>€</strong><span>Prix · coûts · marge</span></div> : <LivePreview product={product} />}
      <div className="addon-card-head">
        <h3>{product.name}</h3>
        <span className="addon-badges">
          <span className={`addon-badge ${product.pricing_mode === "free" ? "is-free" : "is-premium"}`}>
            {product.pricing_mode === "free" ? "Gratuit" : "Premium"}
          </span>
          {owned && <span className="addon-badge is-owned">Possédé</span>}
        </span>
      </div>
      <p>{product.description}</p>
      {isEstimation && <p className="addon-hint">Le site internet doit être installé pour publier le simulateur public.</p>}
      <p className="addon-price">
        <strong>{formatPrice(product)}</strong>
        {product.pricing_mode === "one_time" && <span> · paiement unique, sans abonnement</span>}
      </p>
      {license?.valid_until && <p className="addon-hint">Accès valable jusqu’au {new Date(license.valid_until).toLocaleDateString("fr-FR")}</p>}
      <p className="addon-status" data-status={action}>{owned && !installed ? "Possédé · désinstallé" : statusText}</p>
      <dl className="addon-facts">
        <div>
          <dt>Compatibilité</dt>
          <dd>{product.compatibility.map((entry) => compatibilityLabels[entry] ?? entry).join(", ")}</dd>
        </div>
        <div>
          <dt>{isEstimation ? "Destination" : isAnalytics ? "Comprend" : "Personnalisation"}</dt>
          <dd>
            {isEstimation ? "Pilotage · Estimation et page publique"
              : isAnalytics
              ? "Globe 3D et carte 2D, classements par zone, activité quasi réelle, consentement et conservation configurables"
              : definition?.colorable
                ? "Couleurs, vitesse, logo, message"
                : "Vitesse, logo, message"}
          </dd>
        </div>
      </dl>
      {isAnalytics && (
        <Button variant="secondary" onClick={() => setDemoOpen(true)}>
          Voir la démonstration
        </Button>
      )}
      {demoOpen && <EarthTrackerDemo onClose={() => setDemoOpen(false)} />}
      {action === "install" && (
        <Button disabled={busy || !state.canBuy} onClick={() => onInstall(product)}>
          Installer
        </Button>
      )}
      {(action === "buy" || action === "resume") && (
        <>
          <Button disabled={busy || !state.canBuy || !state.checkoutReady} onClick={() => onBuy(product)}>
            {action === "resume" ? "Reprendre le paiement" : `Acheter · ${formatPrice(product)}`}
          </Button>
          {!state.checkoutReady && <p className="addon-hint">L’achat en ligne n’est pas encore ouvert.</p>}
          {state.checkoutReady && !state.canBuy && (
            <p className="addon-hint">L’achat est réservé au super admin de l’établissement.</p>
          )}
        </>
      )}
      {license?.status === "active" && owned && state.canBuy && (
        <Button variant="secondary" disabled={busy} onClick={() => {
          if (!installed || window.confirm(`Désinstaller ${product.name} pour cet établissement ? Ses données et son droit d’accès seront conservés.`))
            onSetInstallation(product, !installed);
        }}>
          {installed ? "Désinstaller" : "Réinstaller sans paiement"}
        </Button>
      )}
      {installed && isAnalytics && (action === "activate" || action === "active") && onOpenModule && (
        <Button onClick={() => onOpenModule("audience")}>Ouvrir {product.name}</Button>
      )}
      {installed && isEstimation && onOpenModule && <Button onClick={() => onOpenModule("estimation")}>Configurer l’estimation</Button>}
      {installed && !isAnalytics && !isEstimation && action === "activate" && (
        <Button variant="secondary" disabled={busy || !state.canCustomize} onClick={() => onActivate(product)}>
          Activer
        </Button>
      )}
      {installed && !isAnalytics && !isEstimation && action === "active" && <Button disabled>Écran actif</Button>}
    </article>
  );
}

type Draft = Omit<LoadingSettingsInput, "revision">;
const draftFrom = (state: StoreState): Draft => ({
  productId: state.settings?.product_id ?? null,
  enabled: state.settings?.enabled ?? false,
  primaryColor: state.settings?.primary_color ?? null,
  secondaryColor: state.settings?.secondary_color ?? null,
  speed: state.settings?.speed ?? 1,
  showLogo: state.settings?.show_logo ?? false,
  message: state.settings?.message ?? null,
});

function Customizer({
  state,
  busy,
  onSave,
}: {
  state: StoreState;
  busy: boolean;
  onSave: (draft: Draft) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(state));
  const library = state.products.filter((product) =>
    product.kind === "loading_screen" && isInstalled(state, product.id) && state.licenses.some((license) => license.product_id === product.id && license.status === "active"),
  );
  const selected = library.find((product) => product.id === draft.productId) ?? null;
  const definition = selected && definitionOf(selected);
  const update = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  return (
    <section className="card addon-customizer" aria-label="Personnaliser l’écran de chargement">
      <h3>Personnaliser l’écran de chargement</h3>
      <p>
        Un seul écran est actif par établissement. Toute l’équipe de cet établissement le voit
        automatiquement.
      </p>
      <div className="addon-customizer-grid">
        <div className="addon-customizer-form">
          <label>
            Animation
            <select
              value={draft.productId ?? ""}
              onChange={(event) =>
                // Les couleurs restent propres à une animation : un changement repart des siennes.
                update({ productId: event.target.value || null, primaryColor: null, secondaryColor: null })
              }
            >
              <option value="">Aucune (écran natif)</option>
              {library.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>
          <label className="addon-check">
            <input
              type="checkbox"
              checked={draft.enabled}
              disabled={!draft.productId}
              onChange={(event) => update({ enabled: event.target.checked })}
            />
            Activer cet écran pour l’établissement
          </label>
          {definition?.colorable ? (
            <div className="addon-colors">
              <label>
                Couleur principale
                <input
                  type="color"
                  value={draft.primaryColor ?? definition.primary}
                  onChange={(event) => update({ primaryColor: event.target.value })}
                />
              </label>
              <label>
                Couleur secondaire
                <input
                  type="color"
                  value={draft.secondaryColor ?? definition.secondary}
                  onChange={(event) => update({ secondaryColor: event.target.value })}
                />
              </label>
            </div>
          ) : (
            selected && <p className="addon-hint">Les couleurs de cette animation ne sont pas modifiables.</p>
          )}
          <label>
            Vitesse : {new Intl.NumberFormat("fr-FR").format(draft.speed)}×
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.25}
              value={draft.speed}
              onChange={(event) => update({ speed: Number(event.target.value) })}
            />
          </label>
          <label className="addon-check">
            <input
              type="checkbox"
              checked={draft.showLogo}
              onChange={(event) => update({ showLogo: event.target.checked })}
            />
            Afficher le logo de l’établissement
          </label>
          {draft.showLogo && !state.logo && (
            <p className="addon-hint">Aucun logo n’est encore enregistré pour cet établissement.</p>
          )}
          <label>
            Message personnalisé
            <input
              type="text"
              maxLength={80}
              value={draft.message ?? ""}
              placeholder="Préparation de votre espace"
              onChange={(event) => update({ message: event.target.value || null })}
            />
          </label>
          <div className="addon-actions">
            <Button disabled={busy} onClick={() => onSave(draft)}>
              Enregistrer
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => update({ ...defaultLoadingSettings })}
            >
              Réinitialiser
            </Button>
          </div>
        </div>
        <div className="addon-customizer-preview">
          {selected ? (
            <LivePreview
              key={selected.id}
              product={selected}
              primary={draft.primaryColor}
              secondary={draft.secondaryColor}
              speed={draft.speed}
              message={draft.message}
            />
          ) : (
            <p className="addon-hint">Choisissez une animation pour la prévisualiser.</p>
          )}
        </div>
      </div>
    </section>
  );
}

export function AddonStore({
  restaurant,
  mode,
  filters,
  onFiltersChange,
  onOpenShop,
  onOpenModule,
  onLicensesChanged,
}: {
  restaurant: string;
  mode: "shop" | "library";
  filters: StoreFilters;
  onFiltersChange: (filters: StoreFilters) => void;
  onOpenShop: () => void;
  onOpenModule?: (module: string) => void;
  onLicensesChanged?: () => Promise<void> | void;
}) {
  const [state, setState] = useState<StoreState | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const url = endpoint(restaurant, "addons/store");
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () =>
      request<StoreState>(url)
        .then((next) => {
          if (!alive) return;
          setState(next);
          setRevision((value) => value + 1);
          setError("");
          // Après un paiement, la licence arrive par le webhook : on ne relit que pendant cette attente.
          if (next.pending.length) timer = setTimeout(tick, 10000);
        })
        .catch((reason: Error) => {
          if (alive) setError(reason.message);
        });
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [url]);
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = (settings: Draft, current: StoreState, success: string) =>
    run(async () => {
      const result = await request<{ state: StoreState; config: LoadingScreenConfig | null }>(
        endpoint(restaurant, "loading-screen"),
        jsonInit("PUT", { ...settings, revision: current.settings?.revision ?? 0 }),
      );
      setState(result.state);
      setRevision((value) => value + 1);
      storeLoadingConfig(restaurant, result.config);
      setNotice(success);
    });
  const install = (product: StoreProduct) =>
    run(async () => {
      setState(await request<StoreState>(url, jsonInit("POST", { action: "install", product: product.id })));
      setRevision((value) => value + 1);
      setNotice(`${product.name} est installé. Vous pouvez l’activer quand vous le souhaitez.`);
      if (product.id === earthTrackerProduct || product.kind === "estimation") await onLicensesChanged?.();
    });
  const setInstallation = (product: StoreProduct, installed: boolean) =>
    run(async () => {
      setState(await request<StoreState>(url, jsonInit("POST", { action: "set-installation", product: product.id, installed })));
      setRevision((value) => value + 1);
      setNotice(installed ? `${product.name} est réinstallé sans nouveau paiement.` : `${product.name} est désinstallé ; votre droit d’accès est conservé.`);
      if (product.id === earthTrackerProduct || product.kind === "estimation") await onLicensesChanged?.();
    });
  const buy = (product: StoreProduct) =>
    run(async () => {
      const { url: target } = await request<{ url: string }>(
        url,
        jsonInit("POST", { action: "purchase", product: product.id }),
      );
      const destination = new URL(target);
      if (destination.protocol !== "https:" || destination.hostname !== "checkout.stripe.com")
        throw new Error("Destination de paiement invalide");
      window.location.assign(destination.href);
    });
  const activate = (product: StoreProduct) => {
    if (!state) return;
    void save(
      { ...draftFrom(state), productId: product.id, enabled: true, primaryColor: null, secondaryColor: null },
      state,
      `${product.name} est maintenant l’écran de chargement de cet établissement.`,
    );
  };
  const messages = (
    <>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </>
  );
  if (!state) return error ? messages : <p role="status">Chargement de la boutique…</p>;
  const card = (product: StoreProduct) => (
    <ProductCard
      key={product.id}
      product={product}
      state={state}
      busy={busy}
      onInstall={install}
      onBuy={buy}
      onActivate={activate}
      onSetInstallation={setInstallation}
      onOpenModule={onOpenModule}
    />
  );
  if (mode === "library") {
    const allOwned = state.products.filter((product) =>
      isOwned(state.licenses.find((license) => license.product_id === product.id)),
    );
    const owned = allOwned.filter((product) => product.kind === "loading_screen");
    const tools = allOwned.filter((product) => product.kind !== "loading_screen");
    return (
      <section className="addon-store" aria-label="Mes écrans de chargement">
        {tools.length > 0 && (
          <section aria-label="Mes outils d’analyse">
            <h2>Mes outils d’analyse</h2>
            <div className="addon-grid">{tools.map(card)}</div>
          </section>
        )}
        <h2>Mes écrans de chargement</h2>
        <p>Vos achats restent acquis : vous pouvez les réactiver gratuitement à tout moment.</p>
        {messages}
        {owned.length === 0 ? (
          <div className="card addon-empty">
            <p>Aucun écran installé. L’écran natif de la plateforme reste utilisé.</p>
            <Button variant="secondary" onClick={onOpenShop}>
              Découvrir les écrans de chargement
            </Button>
          </div>
        ) : (
          <>
            <div className="addon-grid">{owned.map(card)}</div>
            <Customizer key={revision} state={state} busy={busy} onSave={(draft) => save(draft, state, "Écran de chargement enregistré pour toute l’équipe.")} />
          </>
        )}
      </section>
    );
  }
  const filtered = filterProducts(state.products, state.licenses, filters);
  const set = <K extends keyof StoreFilters>(key: K, value: StoreFilters[K]) =>
    onFiltersChange({ ...filters, [key]: value });
  const categories = [
    { id: "all", name: "Toutes" },
    ...state.categories,
    { id: featuresCategoryId, name: "Fonctionnalités" },
  ];
  const shown = state.categories
    .map((category) => ({
      category,
      products: filtered.filter((product) => product.category_id === category.id),
    }))
    .filter((group) => group.products.length > 0);
  return (
    <section className="addon-store" aria-label="Catalogue par catégorie">
      {messages}
      <div className="addon-filters">
        <div role="group" aria-label="Catégories" className="addon-chips">
          {categories.map((category) => (
            <Button
              key={category.id}
              variant={filters.category === category.id ? "default" : "secondary"}
              aria-pressed={filters.category === category.id}
              onClick={() => set("category", category.id)}
            >
              {category.name}
            </Button>
          ))}
        </div>
        <label>
          Prix
          <select value={filters.price} onChange={(event) => set("price", event.target.value as StoreFilters["price"])}>
            <option value="all">Tous les prix</option>
            <option value="free">Gratuit</option>
            <option value="paid">Payant</option>
          </select>
        </label>
        <label>
          Disponibilité
          <select
            value={filters.availability}
            onChange={(event) => set("availability", event.target.value as StoreFilters["availability"])}
          >
            <option value="all">Toutes</option>
            <option value="available">Disponible</option>
            <option value="unavailable">Indisponible</option>
          </select>
        </label>
        <label>
          Acquisition
          <select
            value={filters.acquisition}
            onChange={(event) => set("acquisition", event.target.value as StoreFilters["acquisition"])}
          >
            <option value="all">Tous</option>
            <option value="owned">Possédés</option>
            <option value="not-owned">Non possédés</option>
          </select>
        </label>
      </div>
      {shown.map(({ category, products }) => (
        <section key={category.id} aria-label={category.name}>
          <h2>{category.name}</h2>
          {category.description && <p>{category.description}</p>}
          <div className="addon-grid">{products.map(card)}</div>
        </section>
      ))}
      {filters.category === "all" && filters.acquisition !== "owned" && filters.availability !== "available" && (
        <section aria-label="Add-ons à venir" className="addon-roadmap">
          <h2>À venir · composez votre espace par métier</h2>
          <p>Ces idées donnent un aperçu des futures rubriques. Elles ne sont ni installables ni en vente pour le moment.</p>
          {["Restauration", "BTP", "Coiffure", "Commerce", "Tous métiers"].map((industry) => (
            <div key={industry}>
              <h3>{industry}</h3>
              <div className="addon-grid">
                {plannedAddons.filter((addon) => addon.industry === industry).map((addon) => (
                  <article className="card addon-card addon-planned" key={addon.id} aria-label={addon.name}>
                    <div className="addon-card-head"><h4>{addon.name}</h4><span className="addon-badge">À venir</span></div>
                    <p>{addon.description}</p>
                    <p><strong>Future rubrique :</strong> {addon.destination}</p>
                    <p className="addon-hint">Disponibilité et tarif à définir.</p>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </section>
  );
}
