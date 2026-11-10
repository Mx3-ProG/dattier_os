"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Eye, EyeOff, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageDrop } from "./image-drop";
import {
  availabilitySummary,
  deliveryDelay,
  deliveryModes,
  duration,
  euro,
  serviceLocations,
  stockModes,
  vatRates,
  weekDays,
  type OffersState,
  type Product,
  type ProductInput,
  type Service,
  type ServiceInput,
} from "@/features/offers/model";
import "./offers.css";

type Kind = "services" | "products";
const endpoint = (restaurant: string) => `/api/restaurants/${encodeURIComponent(restaurant)}/offers`;

async function call(restaurant: string, body?: unknown): Promise<OffersState> {
  const response = await fetch(endpoint(restaurant), body === undefined ? undefined : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || "Opération indisponible.");
  return result as OffersState;
}

/** Saisie en euros (virgule ou point), stockage en centimes. */
const toCents = (value: string) => {
  const number = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : 0;
};
const fromCents = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2).replace(".", ","));

const blankService = (): ServiceInput => ({
  name: "", category: "", summary: "", description: "", durationMinutes: 60, bufferMinutes: 0,
  priceCents: 0, priceFrom: false, vatRate: 20, capacity: 1, location: "on_site",
  availability: [1, 2, 3, 4, 5].map((day) => ({ day, start: "09:00", end: "18:00" })),
  noticeHours: 2, images: [], published: false,
});
const blankProduct = (): ProductInput => ({
  name: "", category: "", sku: "", summary: "", description: "", priceCents: 0, compareAtCents: null,
  vatRate: 20, images: [], deliveryModes: ["pickup"], deliveryMinDays: 0, deliveryMaxDays: 0,
  shippingFeeCents: 0, weightGrams: null, stockMode: "none", stockQuantity: 0, stockThreshold: 0,
  stockIngredientId: null, published: false, featured: false,
});
/** Champs modifiables seulement : les dates et la disponibilité calculée restent côté serveur. */
function serviceInput(item: Service): ServiceInput {
  const rest: Partial<Service> = { ...item };
  delete rest.createdAt; delete rest.updatedAt;
  return rest as ServiceInput;
}
function productInput(item: Product): ProductInput {
  const rest: Partial<Product> = { ...item };
  delete rest.createdAt; delete rest.updatedAt; delete rest.availability;
  return rest as ProductInput;
}

const availabilityLabels = { available: "En stock", low: "Stock bas", out: "Rupture" } as const;

export function OffersCenter({
  restaurant,
  kind,
  onOpenSite,
  onOpenStock,
}: {
  restaurant: string;
  kind: Kind;
  onOpenSite?: () => void;
  onOpenStock?: () => void;
}) {
  const [state, setState] = useState<OffersState | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [visibility, setVisibility] = useState<"all" | "published" | "hidden">("all");
  const [service, setService] = useState<ServiceInput | null>(null);
  const [product, setProduct] = useState<ProductInput | null>(null);
  const isServices = kind === "services";

  const refresh = useCallback(() => {
    call(restaurant).then(setState).catch((cause) => setError((cause as Error).message));
  }, [restaurant]);
  useEffect(refresh, [refresh]);

  async function run(body: unknown, message: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      setState(await call(restaurant, body));
      setNotice(message);
      return true;
    } catch (cause) {
      setError((cause as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const items: (Service | Product)[] = useMemo(
    () => (state ? (isServices ? state.services : state.products) : []),
    [state, isServices],
  );
  const categories = useMemo(
    () => [...new Set(items.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")),
    [items],
  );
  const visible = items.filter((item) =>
    (!category || item.category === category) &&
    (visibility === "all" || (visibility === "published") === item.published) &&
    (!query || `${item.name} ${item.category} ${item.summary}`.toLocaleLowerCase("fr").includes(query.toLocaleLowerCase("fr"))),
  );
  const editing = isServices ? service : product;
  const singular = isServices ? "service" : "produit";
  const published = items.filter((item) => item.published).length;

  if (!state && !error) return <p role="status">Chargement des {isServices ? "services" : "produits"}…</p>;

  return (
    <section className="offers" aria-label={isServices ? "Services" : "Produits"}>
      {error && <p role="alert" className="offer-error">{error}</p>}
      {notice && <p role="status" className="offer-notice">{notice}</p>}
      {state && !state.website && (
        <p className="offer-hint">
          Votre site internet n’est pas installé : vos {isServices ? "services" : "produits"} « Sur le site » y apparaîtront dès son installation.
        </p>
      )}

      {editing ? (
        isServices ? (
          <ServiceForm
            restaurant={restaurant}
            value={service!}
            busy={busy}
            onChange={(update) => setService((current) => (current ? update(current) : current))}
            onCancel={() => setService(null)}
            onSave={async (value) => {
              if (await run({ action: "save-service", service: value }, value.id ? "Service enregistré." : "Service créé."))
                setService(null);
            }}
          />
        ) : (
          <ProductForm
            restaurant={restaurant}
            value={product!}
            stock={state?.stock ?? []}
            busy={busy}
            onOpenStock={onOpenStock}
            onChange={(update) => setProduct((current) => (current ? update(current) : current))}
            onCancel={() => setProduct(null)}
            onSave={async (value) => {
              if (await run({ action: "save-product", product: value }, value.id ? "Produit enregistré." : "Produit créé."))
                setProduct(null);
            }}
          />
        )
      ) : (
        <>
          <div className="offers-toolbar">
            <div className="offers-summary">
              <strong>{items.length} {singular}{items.length > 1 ? "s" : ""}</strong>
              <span>{published} sur le site</span>
            </div>
            <label className="offers-search">
              <Search size={16} aria-hidden />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Rechercher un ${singular}`} aria-label={`Rechercher un ${singular}`} />
            </label>
            {categories.length > 0 && (
              <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Catégorie">
                <option value="">Toutes les catégories</option>
                {categories.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
              </select>
            )}
            <select value={visibility} onChange={(event) => setVisibility(event.target.value as typeof visibility)} aria-label="Visibilité sur le site">
              <option value="all">Tous</option>
              <option value="published">Sur le site</option>
              <option value="hidden">Masqués du site</option>
            </select>
            {state?.canEdit && (
              <Button onClick={() => (isServices ? setService(blankService()) : setProduct(blankProduct()))}>
                <Plus size={16} /> {isServices ? "Nouveau service" : "Nouveau produit"}
              </Button>
            )}
          </div>

          {items.length === 0 ? (
            <div className="offers-empty card">
              <h2>{isServices ? "Ajoutez votre premier service" : "Ajoutez votre premier produit"}</h2>
              <p>
                {isServices
                  ? "Décrivez chaque prestation : durée, prix, jours et horaires de disponibilité. Vous choisissez ensuite celles qui apparaissent sur votre site."
                  : "Ajoutez photos, description, prix et délais de livraison. Le suivi du stock est facultatif. Vous choisissez ensuite les produits visibles sur votre site."}
              </p>
              {state?.canEdit && (
                <Button onClick={() => (isServices ? setService(blankService()) : setProduct(blankProduct()))}>
                  <Plus size={16} /> {isServices ? "Créer un service" : "Créer un produit"}
                </Button>
              )}
            </div>
          ) : visible.length === 0 ? (
            <p>Aucun {singular} ne correspond à ces filtres.</p>
          ) : (
            <div className="offers-grid">
              {visible.map((item) => (
                <article className="offer-card" key={item.id} aria-label={item.name}>
                  <div className="offer-card-media">
                    {item.images[0] ? <img src={item.images[0]} alt="" /> : <span aria-hidden>{item.name.slice(0, 1).toUpperCase()}</span>}
                    <span className={`offer-pill ${item.published ? "is-on" : ""}`}>
                      {item.published ? <Eye size={13} aria-hidden /> : <EyeOff size={13} aria-hidden />}
                      {item.published ? "Sur le site" : "Masqué du site"}
                    </span>
                  </div>
                  <div className="offer-card-body">
                    {item.category && <small>{item.category}</small>}
                    <h3>{item.name}</h3>
                    {item.summary && <p>{item.summary}</p>}
                    {"durationMinutes" in item ? (
                      <ul className="offer-facts">
                        <li><strong>{item.priceFrom ? "Dès " : ""}{euro(item.priceCents)}</strong></li>
                        <li>{duration(item.durationMinutes)}{item.bufferMinutes ? ` + ${item.bufferMinutes} min de battement` : ""}</li>
                        <li>{serviceLocations[item.location]}{item.capacity > 1 ? ` · ${item.capacity} pers.` : ""}</li>
                        <li className="offer-muted">{availabilitySummary(item.availability).join(" · ") || "Aucun créneau défini"}</li>
                      </ul>
                    ) : (
                      <ul className="offer-facts">
                        <li>
                          <strong>{euro(item.priceCents)}</strong>
                          {item.compareAtCents !== null && <s className="offer-muted"> {euro(item.compareAtCents)}</s>}
                        </li>
                        <li>{deliveryDelay(item.deliveryMinDays, item.deliveryMaxDays)} · {item.deliveryModes.map((mode) => deliveryModes[mode]).join(", ")}</li>
                        <li>
                          {item.stockMode === "none" ? <span className="offer-muted">Stock non suivi</span> : (
                            <span className={`offer-stock is-${item.availability}`}>
                              {availabilityLabels[item.availability]}
                              {item.stockMode === "own" ? ` · ${item.stockQuantity} en stock` : " · relié au stock"}
                            </span>
                          )}
                        </li>
                        {item.featured && <li className="offer-muted">Mis en avant sur le site</li>}
                      </ul>
                    )}
                  </div>
                  {state?.canEdit && (
                    <div className="offer-card-actions">
                      <Button variant="secondary" disabled={busy} onClick={() => ("durationMinutes" in item ? setService(serviceInput(item)) : setProduct(productInput(item as Product)))}>
                        <Pencil size={15} /> Modifier
                      </Button>
                      <Button
                        variant={item.published ? "secondary" : "default"}
                        disabled={busy}
                        onClick={() => void run(
                          { action: "publish", kind: isServices ? "service" : "product", id: item.id, published: !item.published },
                          item.published ? `${item.name} est retiré du site.` : `${item.name} est affiché sur le site.`,
                        )}
                      >
                        {item.published ? <EyeOff size={15} /> : <Eye size={15} />} {item.published ? "Retirer du site" : "Afficher sur le site"}
                      </Button>
                      {"stockMode" in item && item.stockMode === "own" && (
                        <span className="offer-stepper" aria-label="Ajuster le stock">
                          <button type="button" disabled={busy || item.stockQuantity === 0} onClick={() => void run({ action: "adjust-stock", id: item.id, delta: -1 }, "Stock mis à jour.")} aria-label="Retirer une unité">−</button>
                          <span>{item.stockQuantity}</span>
                          <button type="button" disabled={busy} onClick={() => void run({ action: "adjust-stock", id: item.id, delta: 1 }, "Stock mis à jour.")} aria-label="Ajouter une unité">+</button>
                        </span>
                      )}
                      <button type="button" className="offer-icon" disabled={busy} title="Dupliquer" aria-label={`Dupliquer ${item.name}`}
                        onClick={() => void run({ action: "duplicate", kind: isServices ? "service" : "product", id: item.id }, `${item.name} est dupliqué (masqué du site).`)}>
                        <Copy size={16} />
                      </button>
                      <button type="button" className="offer-icon is-danger" disabled={busy} title="Supprimer" aria-label={`Supprimer ${item.name}`}
                        onClick={() => {
                          if (window.confirm(`Supprimer « ${item.name} » ? Il sera retiré du site.`))
                            void run({ action: "archive", kind: isServices ? "service" : "product", id: item.id }, `${item.name} est supprimé.`);
                        }}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
          {onOpenSite && published > 0 && (
            <p className="offer-hint">
              Pour les montrer aux visiteurs, ajoutez la section « {isServices ? "Nos services" : "Nos produits"} » à une page de votre site.{" "}
              <button type="button" className="offer-link" onClick={onOpenSite}>Ouvrir mon site</button>
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Field({ label, hint, children, wide }: { label: string; hint?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`offer-field ${wide ? "is-wide" : ""}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Money({ value, onChange, label, hint, optional }: { value: number | null; onChange: (cents: number | null) => void; label: string; hint?: string; optional?: boolean }) {
  const [text, setText] = useState(fromCents(value));
  return (
    <Field label={label} hint={hint}>
      <span className="offer-money">
        <input inputMode="decimal" value={text} placeholder={optional ? "Facultatif" : "0,00"}
          onChange={(event) => {
            // Valeur enregistrée à chaque frappe : « Entrée » dans ce champ ne perd jamais le prix.
            setText(event.target.value);
            onChange(optional && !event.target.value.trim() ? null : toCents(event.target.value));
          }}
          onBlur={() => setText(fromCents(optional && !text.trim() ? null : toCents(text)))} />
        <span>€ TTC</span>
      </span>
    </Field>
  );
}
const int = (value: string, min = 0) => Math.max(min, Math.round(Number(value) || 0));

function ServiceForm({ restaurant, value, busy, onChange, onCancel, onSave }: {
  restaurant: string; value: ServiceInput; busy: boolean;
  onChange: (update: (current: ServiceInput) => ServiceInput) => void; onCancel: () => void; onSave: (value: ServiceInput) => void;
}) {
  const set = <K extends keyof ServiceInput>(key: K, next: ServiceInput[K]) => onChange((current) => ({ ...current, [key]: next }));
  const slots = (day: number) => value.availability.filter((slot) => slot.day === day);
  const setSlots = (day: number, next: ServiceInput["availability"]) =>
    onChange((current) => ({
      ...current,
      availability: [...current.availability.filter((slot) => slot.day !== day), ...next].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start)),
    }));
  return (
    <form className="offer-form" onSubmit={(event) => { event.preventDefault(); onSave(value); }}>
      <header>
        <h2>{value.id ? `Modifier « ${value.name} »` : "Nouveau service"}</h2>
        <div className="offer-form-actions">
          <Button type="button" variant="secondary" onClick={onCancel}>Annuler</Button>
          <Button disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</Button>
        </div>
      </header>

      <fieldset>
        <legend>Informations</legend>
        <div className="offer-fields">
          <Field label="Nom du service"><input required maxLength={160} value={value.name} onChange={(event) => set("name", event.target.value)} placeholder="Coupe et brushing" /></Field>
          <Field label="Catégorie" hint="Regroupe vos services sur le site."><input maxLength={80} value={value.category} onChange={(event) => set("category", event.target.value)} placeholder="Coiffure" /></Field>
          <Field label="Résumé" hint="Une phrase affichée sur la carte du service." wide><input maxLength={280} value={value.summary} onChange={(event) => set("summary", event.target.value)} /></Field>
          <Field label="Description détaillée" wide><textarea rows={5} maxLength={5000} value={value.description} onChange={(event) => set("description", event.target.value)} placeholder="Déroulé, ce qui est inclus, conseils avant le rendez-vous…" /></Field>
        </div>
      </fieldset>

      <fieldset>
        <legend>Durée et tarif</legend>
        <div className="offer-fields">
          <Field label="Durée (minutes)" hint={duration(value.durationMinutes)}><input type="number" min={5} max={1440} step={5} value={value.durationMinutes} onChange={(event) => set("durationMinutes", int(event.target.value, 5))} /></Field>
          <Field label="Temps de battement (minutes)" hint="Préparation ou nettoyage après le service."><input type="number" min={0} max={240} step={5} value={value.bufferMinutes} onChange={(event) => set("bufferMinutes", int(event.target.value))} /></Field>
          <Money label="Prix" value={value.priceCents} onChange={(cents) => set("priceCents", cents ?? 0)} />
          <Field label="TVA"><select value={value.vatRate} onChange={(event) => set("vatRate", Number(event.target.value))}>{vatRates.map((rate) => <option key={rate} value={rate}>{String(rate).replace(".", ",")} %</option>)}</select></Field>
          <label className="offer-check"><input type="checkbox" checked={value.priceFrom} onChange={(event) => set("priceFrom", event.target.checked)} /> Afficher « à partir de » (prix variable)</label>
          <Field label="Participants simultanés" hint="1 pour un rendez-vous individuel."><input type="number" min={1} max={500} value={value.capacity} onChange={(event) => set("capacity", int(event.target.value, 1))} /></Field>
          <Field label="Lieu"><select value={value.location} onChange={(event) => set("location", event.target.value as ServiceInput["location"])}>{Object.entries(serviceLocations).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field>
          <Field label="Délai de prévenance (heures)" hint="Réservation possible au plus tard … heures avant."><input type="number" min={0} max={2160} value={value.noticeHours} onChange={(event) => set("noticeHours", int(event.target.value))} /></Field>
        </div>
      </fieldset>

      <fieldset>
        <legend>Disponibilités</legend>
        <div className="offer-presets">
          <button type="button" className="offer-link" onClick={() => set("availability", [1, 2, 3, 4, 5].map((day) => ({ day, start: "09:00", end: "18:00" })))}>Lun–Ven 9 h–18 h</button>
          <button type="button" className="offer-link" onClick={() => set("availability", [2, 3, 4, 5, 6].map((day) => ({ day, start: "09:00", end: "19:00" })))}>Mar–Sam 9 h–19 h</button>
          <button type="button" className="offer-link" onClick={() => set("availability", [])}>Tout effacer</button>
        </div>
        <div className="offer-week">
          {[1, 2, 3, 4, 5, 6, 0].map((day) => (
            <div className="offer-day" key={day} data-open={slots(day).length > 0}>
              <label className="offer-check">
                <input type="checkbox" checked={slots(day).length > 0}
                  onChange={(event) => setSlots(day, event.target.checked ? [{ day, start: "09:00", end: "18:00" }] : [])} />
                {weekDays[day]}
              </label>
              <div className="offer-slots">
                {slots(day).map((slot, index) => (
                  <span className="offer-slot" key={index}>
                    <input type="time" value={slot.start} aria-label={`${weekDays[day]} début`} onChange={(event) => setSlots(day, slots(day).map((entry, i) => (i === index ? { ...entry, start: event.target.value } : entry)))} />
                    –
                    <input type="time" value={slot.end} aria-label={`${weekDays[day]} fin`} onChange={(event) => setSlots(day, slots(day).map((entry, i) => (i === index ? { ...entry, end: event.target.value } : entry)))} />
                    <button type="button" className="offer-icon" aria-label="Retirer ce créneau" onClick={() => setSlots(day, slots(day).filter((_, i) => i !== index))}><Trash2 size={14} /></button>
                  </span>
                ))}
                {slots(day).length > 0 && slots(day).length < 6 && (
                  <button type="button" className="offer-link" onClick={() => setSlots(day, [...slots(day), { day, start: "14:00", end: "18:00" }])}>+ créneau</button>
                )}
                {slots(day).length === 0 && <span className="offer-muted">Fermé</span>}
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Photos</legend>
        <ImageDrop restaurant={restaurant} images={value.images} onChange={(images) => set("images", images)} disabled={busy} />
      </fieldset>

      <fieldset>
        <legend>Site internet</legend>
        <label className="offer-check"><input type="checkbox" checked={value.published} onChange={(event) => set("published", event.target.checked)} /> Afficher ce service sur mon site</label>
      </fieldset>
    </form>
  );
}

function ProductForm({ restaurant, value, stock, busy, onOpenStock, onChange, onCancel, onSave }: {
  restaurant: string; value: ProductInput; stock: OffersState["stock"]; busy: boolean; onOpenStock?: () => void;
  onChange: (update: (current: ProductInput) => ProductInput) => void; onCancel: () => void; onSave: (value: ProductInput) => void;
}) {
  const set = <K extends keyof ProductInput>(key: K, next: ProductInput[K]) => onChange((current) => ({ ...current, [key]: next }));
  const toggleMode = (mode: ProductInput["deliveryModes"][number], on: boolean) =>
    onChange((current) => ({
      ...current,
      deliveryModes: on ? [...new Set([...current.deliveryModes, mode])] : current.deliveryModes.filter((entry) => entry !== mode),
    }));
  return (
    <form className="offer-form" onSubmit={(event) => { event.preventDefault(); onSave(value); }}>
      <header>
        <h2>{value.id ? `Modifier « ${value.name} »` : "Nouveau produit"}</h2>
        <div className="offer-form-actions">
          <Button type="button" variant="secondary" onClick={onCancel}>Annuler</Button>
          <Button disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</Button>
        </div>
      </header>

      <fieldset>
        <legend>Photos</legend>
        <ImageDrop restaurant={restaurant} images={value.images} onChange={(images) => set("images", images)} disabled={busy} />
      </fieldset>

      <fieldset>
        <legend>Informations</legend>
        <div className="offer-fields">
          <Field label="Nom du produit"><input required maxLength={160} value={value.name} onChange={(event) => set("name", event.target.value)} placeholder="Bougie parfumée 200 g" /></Field>
          <Field label="Catégorie"><input maxLength={80} value={value.category} onChange={(event) => set("category", event.target.value)} placeholder="Décoration" /></Field>
          <Field label="Référence (SKU)" hint="Facultatif, pour vos inventaires."><input maxLength={64} value={value.sku} onChange={(event) => set("sku", event.target.value)} /></Field>
          <Field label="Résumé" hint="Une phrase affichée sous le nom du produit." wide><input maxLength={280} value={value.summary} onChange={(event) => set("summary", event.target.value)} /></Field>
          <Field label="Description du produit" hint="Matières, dimensions, conseils d’utilisation, garanties…" wide><textarea rows={6} maxLength={5000} value={value.description} onChange={(event) => set("description", event.target.value)} /></Field>
        </div>
      </fieldset>

      <fieldset>
        <legend>Prix</legend>
        <div className="offer-fields">
          <Money label="Prix de vente" value={value.priceCents} onChange={(cents) => set("priceCents", cents ?? 0)} />
          <Money label="Prix barré" hint="Ancien prix affiché barré lors d’une promotion." optional value={value.compareAtCents} onChange={(cents) => set("compareAtCents", cents)} />
          <Field label="TVA"><select value={value.vatRate} onChange={(event) => set("vatRate", Number(event.target.value))}>{vatRates.map((rate) => <option key={rate} value={rate}>{String(rate).replace(".", ",")} %</option>)}</select></Field>
        </div>
      </fieldset>

      <fieldset>
        <legend>Livraison et délais</legend>
        <div className="offer-checks">
          {Object.entries(deliveryModes).map(([mode, label]) => (
            <label className="offer-check" key={mode}>
              <input type="checkbox" checked={value.deliveryModes.includes(mode as ProductInput["deliveryModes"][number])}
                onChange={(event) => toggleMode(mode as ProductInput["deliveryModes"][number], event.target.checked)} /> {label}
            </label>
          ))}
        </div>
        <div className="offer-fields">
          <Field label="Délai minimal (jours)"><input type="number" min={0} max={365} value={value.deliveryMinDays} onChange={(event) => { const min = int(event.target.value); onChange((current) => ({ ...current, deliveryMinDays: min, deliveryMaxDays: Math.max(min, current.deliveryMaxDays) })); }} /></Field>
          <Field label="Délai maximal (jours)" hint={deliveryDelay(value.deliveryMinDays, value.deliveryMaxDays)}><input type="number" min={value.deliveryMinDays} max={365} value={value.deliveryMaxDays} onChange={(event) => set("deliveryMaxDays", int(event.target.value))} /></Field>
          {value.deliveryModes.some((mode) => mode !== "pickup") && (
            <Money label="Frais de livraison" value={value.shippingFeeCents} onChange={(cents) => set("shippingFeeCents", cents ?? 0)} />
          )}
          {value.deliveryModes.includes("shipping") && (
            <Field label="Poids (grammes)" hint="Utile pour calculer l’expédition."><input type="number" min={0} value={value.weightGrams ?? ""} onChange={(event) => set("weightGrams", event.target.value === "" ? null : int(event.target.value))} /></Field>
          )}
        </div>
      </fieldset>

      <fieldset>
        <legend>Stock (facultatif)</legend>
        <div className="offer-checks">
          {Object.entries(stockModes).map(([mode, label]) => (
            <label className="offer-check" key={mode}>
              <input type="radio" name="stock-mode" checked={value.stockMode === mode}
                onChange={() => onChange((current) => ({ ...current, stockMode: mode as ProductInput["stockMode"], stockIngredientId: mode === "linked" ? current.stockIngredientId ?? stock[0]?.id ?? null : null }))}
                disabled={mode === "linked" && stock.length === 0} /> {label}
            </label>
          ))}
        </div>
        {value.stockMode === "own" && (
          <div className="offer-fields">
            <Field label="Quantité en stock"><input type="number" min={0} value={value.stockQuantity} onChange={(event) => set("stockQuantity", int(event.target.value))} /></Field>
            <Field label="Seuil d’alerte" hint="« Stock bas » sous cette quantité."><input type="number" min={0} value={value.stockThreshold} onChange={(event) => set("stockThreshold", int(event.target.value))} /></Field>
          </div>
        )}
        {value.stockMode === "linked" && (
          <Field label="Article de Stocks & inventaire" hint="La disponibilité suit les lots de cet article.">
            <select value={value.stockIngredientId ?? ""} onChange={(event) => set("stockIngredientId", event.target.value || null)}>
              {stock.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.available} {entry.unit === "unit" ? "unité(s)" : entry.unit} disponibles</option>)}
            </select>
          </Field>
        )}
        {stock.length === 0 && (
          <p className="offer-hint">
            Aucun article dans Stocks & inventaire pour le moment.
            {onOpenStock && <> <button type="button" className="offer-link" onClick={onOpenStock}>Ouvrir les stocks</button></>}
          </p>
        )}
      </fieldset>

      <fieldset>
        <legend>Site internet</legend>
        <label className="offer-check"><input type="checkbox" checked={value.published} onChange={(event) => set("published", event.target.checked)} /> Afficher ce produit sur mon site</label>
        <label className="offer-check"><input type="checkbox" checked={value.featured} onChange={(event) => set("featured", event.target.checked)} /> Mettre en avant (affiché en premier)</label>
      </fieldset>
    </form>
  );
}
