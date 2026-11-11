"use client";
/* eslint-disable @next/next/no-img-element -- images du catalogue : chemins locaux ou HTTPS validés côté serveur. */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  BellRing,
  Check,
  ChevronRight,
  Clock,
  CreditCard,
  Minus,
  PauseCircle,
  Plus,
  ShoppingBag,
  Store,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { preparation, type Product, type Settings, type ShopOrder } from "@/features/commerce/schema";
import { useTenantSite } from "./context";

type Flow = { paused: boolean; pausedUntil: string | null; rushMinutes: number; prepMinutes: number };
type Data = { settings: Settings; products: Product[]; slots: string[]; stripe: boolean; premium?: boolean; flow?: Flow };
type Line = { menu: string; quantity: number; choices: string[]; note: string };
type Mode = "takeaway" | "onsite";
type Step = "welcome" | "menu" | "extras" | "details" | "done";
export type KioskBrand = {
  name: string;
  logo: string;
  primary: string;
  primaryDark: string;
  accent: string;
  background: string;
  text: string;
  heading: string;
  body: string;
};

const money = (cents: number) =>
  (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
const dayKey = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" });
const stages = ["waiting", "preparing", "ready", "served"] as const;
const stageLabels: Record<string, string> = {
  waiting: "Reçue",
  preparing: "En préparation",
  ready: "Prête !",
  served: "Retirée",
};
/** Retour automatique à l'accueil sur tablette : après une commande, et sans activité. */
const TABLET_DONE_SECONDS = 25;
const TABLET_IDLE_MS = 120_000;

export function linePrice(product: Product, choices: readonly string[]) {
  let price = product.price;
  for (const group of product.options)
    for (const choice of group.choices)
      if (choices.includes(`${group.id}:${choice.id}`)) price += choice.price;
  return price;
}

/** Créneaux regroupés par jour ; le premier est proposé comme « Dès que possible ». */
export function groupSlots(slots: readonly string[]) {
  const days: { day: string; slots: string[] }[] = [];
  for (const slot of slots) {
    const day = dayKey(slot);
    const last = days.at(-1);
    if (last?.day === day) last.slots.push(slot);
    else days.push({ day, slots: [slot] });
  }
  return days;
}

export function KioskOrder({
  initialData,
  brand,
  tablet,
}: {
  initialData: Data;
  brand: KioskBrand;
  tablet: boolean;
}) {
  const { restaurant, request, shopPost, href, preview } = useTenantSite();
  const storageKey = `atacuisine-kiosk:${restaurant}`;
  const [data, setData] = useState<Data>(initialData);
  const [step, setStep] = useState<Step>("welcome");
  const [mode, setMode] = useState<Mode>("takeaway");
  const [cart, setCart] = useState<Line[]>([]);
  const [category, setCategory] = useState("");
  const [picking, setPicking] = useState<Product | null>(null);
  const [choices, setChoices] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [slot, setSlot] = useState("");
  const [laterOpen, setLaterOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [payment, setPayment] = useState<"counter" | "stripe">("counter");
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [receipt, setReceipt] = useState<ShopOrder | null>(null);
  const [countdown, setCountdown] = useState(TABLET_DONE_SECONDS);
  const [toast, setToast] = useState("");
  const lastStage = useRef("");
  const [countAtExtras, setCountAtExtras] = useState(0);

  const products = useMemo(() => data.products.filter((product) => product.enabled), [data.products]);
  const categories = useMemo(
    () => data.settings.categories.filter((name) => products.some((product) => product.category === name)),
    [data.settings.categories, products],
  );
  const current = category || categories[0] || "";
  const byId = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  // `index` : position dans le panier, même si un produit est devenu indisponible.
  const lines = cart.flatMap((line, index) => {
    const product = byId.get(line.menu);
    return product ? [{ ...line, index, product, unit: linePrice(product, line.choices) }] : [];
  });
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const total = lines.reduce((sum, line) => sum + line.unit * line.quantity, 0);
  const paused = data.flow?.paused === true;
  const closed = !data.settings.open || !data.slots.length;

  const refresh = useCallback(async () => {
    const response = await request("/api/shop/catalog");
    if (response.ok) setData(await response.json());
  }, [request]);

  const reset = useCallback(() => {
    setStep("welcome");
    setCart([]);
    setPicking(null);
    setSlot("");
    setLaterOpen(false);
    setName("");
    setEmail("");
    setTerms(false);
    setPayment("counter");
    setError("");
    setToken("");
    setReceipt(null);
    setCategory("");
    lastStage.current = "";
    try {
      localStorage.removeItem(storageKey);
      sessionStorage.removeItem(`atacuisine-kiosk-key:${restaurant}`);
    } catch {}
    history.replaceState(null, "", location.pathname + location.search);
  }, [restaurant, storageKey]);

  // Panier conservé sur le téléphone du client ; jamais sur une tablette partagée.
  useEffect(() => {
    const hash = location.hash.slice(1);
    if (/^[a-f0-9]{64}$/.test(hash)) {
      setToken(hash);
      setStep("done");
      return;
    }
    if (tablet) return;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (saved && Array.isArray(saved.cart) && saved.cart.length) {
        setCart(saved.cart);
        setMode(saved.mode === "onsite" ? "onsite" : "takeaway");
        setStep("menu");
      }
    } catch {}
  }, [storageKey, tablet]);
  useEffect(() => {
    if (tablet || step === "done") return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ cart, mode }));
    } catch {}
  }, [cart, mode, step, storageKey, tablet]);

  // Créneaux et pause à jour sans recharger la page.
  useEffect(() => {
    const timer = setInterval(() => void refresh().catch(() => {}), 60_000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (slot && !data.slots.includes(slot)) setSlot("");
  }, [data.slots, slot]);

  // Suivi en direct de la commande.
  useEffect(() => {
    if (!token) return;
    let active = true;
    const load = async () => {
      const response = await request("/api/shop/receipt", { headers: { "x-order-token": token } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (!active) return;
      setReceipt(result);
      const stage = preparation(result);
      if (stage === "ready" && lastStage.current && lastStage.current !== "ready") {
        navigator.vibrate?.([200, 100, 200]);
        chime();
      }
      lastStage.current = stage;
      document.title = stage === "ready" ? `✅ Commande n° ${result.number} prête` : `Commande n° ${result.number}`;
    };
    void load().catch((e: Error) => active && setError(e.message));
    const timer = setInterval(() => void load().catch(() => {}), 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [request, token]);

  // Tablette : retour à l'accueil après la commande, ou après deux minutes sans activité.
  useEffect(() => {
    if (!tablet || step !== "done") return;
    setCountdown(TABLET_DONE_SECONDS);
    const timer = setInterval(() => setCountdown((value) => value - 1), 1000);
    return () => clearInterval(timer);
  }, [tablet, step]);
  useEffect(() => {
    if (tablet && step === "done" && countdown <= 0) reset();
  }, [countdown, reset, step, tablet]);
  useEffect(() => {
    if (!tablet || step === "welcome") return;
    let timer = setTimeout(reset, TABLET_IDLE_MS);
    const touch = () => {
      clearTimeout(timer);
      timer = setTimeout(reset, TABLET_IDLE_MS);
    };
    window.addEventListener("pointerdown", touch);
    window.addEventListener("keydown", touch);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
    };
  }, [reset, step, tablet]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 1800);
    return () => clearTimeout(timer);
  }, [toast]);

  function open(product: Product) {
    setPicking(product);
    setQuantity(1);
    // Choix obligatoires à choix unique : la première option est présélectionnée.
    setChoices(
      product.options
        .filter((group) => group.required && !group.multiple)
        .map((group) => `${group.id}:${group.choices[0].id}`),
    );
  }
  function toggleChoice(groupId: string, choiceId: string, multiple: boolean) {
    const id = `${groupId}:${choiceId}`;
    setChoices((selected) =>
      multiple
        ? selected.includes(id)
          ? selected.filter((value) => value !== id)
          : [...selected, id]
        : [...selected.filter((value) => !value.startsWith(`${groupId}:`)), id],
    );
  }
  function add(product: Product, selected: string[], amount: number) {
    setCart((items) => {
      const index = items.findIndex(
        (line) => line.menu === product.id && line.choices.join("|") === selected.join("|") && !line.note,
      );
      if (index === -1) return [...items, { menu: product.id, quantity: amount, choices: selected, note: "" }];
      return items.map((line, i) => (i === index ? { ...line, quantity: Math.min(20, line.quantity + amount) } : line));
    });
    setToast(`${product.name} ajouté`);
  }
  function change(index: number, delta: number) {
    setCart((items) =>
      items
        .map((line, i) => (i === index ? { ...line, quantity: Math.min(20, line.quantity + delta) } : line))
        .filter((line) => line.quantity > 0),
    );
  }

  // « Un petit plus ? » : catégories absentes du panier, en partant de la fin de la carte
  // (boissons, desserts), trois produits sans choix obligatoire par catégorie, six au plus.
  const extras = useMemo(() => {
    const inCart = new Set(lines.map((line) => line.product.category));
    return categories
      .filter((name) => !inCart.has(name))
      .toReversed()
      .flatMap((name) =>
        products
          .filter((product) => product.category === name && !product.options.some((group) => group.required))
          .slice(0, 3),
      )
      .slice(0, 6);
  }, [categories, lines, products]);

  const missingGroup = picking?.options.find(
    (group) => group.required && !choices.some((value) => value.startsWith(`${group.id}:`)),
  );

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const keyName = `atacuisine-kiosk-key:${restaurant}`;
      let key = sessionStorage.getItem(keyName);
      if (!key) {
        key = crypto.randomUUID();
        sessionStorage.setItem(keyName, key);
      }
      const order = await shopPost("checkout", {
        key,
        customer: name,
        email,
        consumption: mode,
        payment,
        slot,
        loyaltyConsent: false,
        termsAccepted: terms,
        items: cart,
      });
      sessionStorage.removeItem(keyName);
      sessionStorage.setItem(`atacuisine-receipt:${restaurant}`, order.token);
      localStorage.removeItem(storageKey);
      setCart([]);
      history.replaceState(null, "", `${location.pathname}${location.search}#${order.token}`);
      if (payment === "stripe") {
        const session = await shopPost("payment", { token: order.token, path: location.pathname + location.hash });
        location.href = session.url;
        return;
      }
      setToken(order.token);
      setStep("done");
    } catch (e) {
      setError((e as Error).message);
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  const style = {
    "--k-primary": brand.primary,
    "--k-primary-dark": brand.primaryDark,
    "--k-accent": brand.accent,
    "--k-bg": brand.background,
    "--k-text": brand.text,
    "--k-heading": brand.heading,
    "--k-body": brand.body,
  } as CSSProperties;
  const days = groupSlots(data.slots);
  const asap = data.slots[0];
  const today = days[0]?.slots.slice(1, 9) ?? [];
  const canSubmit = !!slot && name.trim().length >= 2 && /.+@.+\..+/.test(email) && terms && count > 0 && !busy;

  return (
    <div className={`kiosk${tablet ? " kiosk-tablet" : ""}`} style={style}>
      <header className="kiosk-top">
        <button type="button" className="kiosk-brand" onClick={() => (step === "done" ? reset() : setStep("welcome"))}>
          {brand.logo ? <img src={brand.logo} alt="" /> : <UtensilsCrossed aria-hidden />}
          <span>{brand.name}</span>
        </button>
        {step !== "welcome" && step !== "done" && (
          <span className="kiosk-mode-pill">
            {mode === "onsite" ? <UtensilsCrossed size={16} /> : <ShoppingBag size={16} />}
            {mode === "onsite" ? "Sur place" : "À emporter"}
            <button type="button" onClick={() => setMode(mode === "onsite" ? "takeaway" : "onsite")}>
              Changer
            </button>
          </span>
        )}
        {!tablet && step !== "done" && (
          <a className="kiosk-exit" href={href("/")}>
            <X size={18} /> Quitter
          </a>
        )}
      </header>

      {preview && <p className="kiosk-banner">Aperçu : aucune commande n’est enregistrée.</p>}
      {(paused || closed) && step !== "done" && (
        <p className="kiosk-banner" role="status">
          <PauseCircle size={18} />
          {paused && data.flow?.pausedUntil
            ? `Les commandes reprennent à ${time(data.flow.pausedUntil)}. Merci de votre patience !`
            : "Les commandes en ligne sont fermées pour le moment."}
        </p>
      )}

      {step === "welcome" && (
        <main className="kiosk-welcome">
          <p className="kiosk-kicker">Bienvenue chez {brand.name}</p>
          <h1>Où allez-vous savourer votre commande ?</h1>
          <div className="kiosk-modes">
            {(
              [
                ["onsite", "Sur place", "Installez-vous, on vous l’apporte au comptoir.", UtensilsCrossed],
                ["takeaway", "À emporter", "Prête à l’heure choisie, emballée pour la route.", ShoppingBag],
              ] as const
            ).map(([value, label, text, Icon]) => (
              <button
                key={value}
                type="button"
                className="kiosk-mode"
                disabled={paused || closed}
                onClick={() => {
                  setMode(value);
                  setStep("menu");
                }}
              >
                <Icon size={56} strokeWidth={1.5} aria-hidden />
                <strong>{label}</strong>
                <small>{text}</small>
              </button>
            ))}
          </div>
          {data.flow && !paused && !closed && (
            <p className="kiosk-wait">
              <Clock size={18} /> Préparation en {data.flow.prepMinutes} min environ
            </p>
          )}
        </main>
      )}

      {step === "menu" && (
        <main className="kiosk-menu">
          <nav className="kiosk-categories" aria-label="Catégories">
            {categories.map((name) => {
              const cover = products.find((product) => product.category === name)?.images[0];
              return (
                <button
                  key={name}
                  type="button"
                  aria-current={name === current}
                  onClick={() => setCategory(name)}
                >
                  {cover ? <img src={cover} alt="" /> : <span className="kiosk-dot" />}
                  {name}
                </button>
              );
            })}
          </nav>
          <section className="kiosk-grid" aria-label={current}>
            <h2>{current}</h2>
            <div>
              {products
                .filter((product) => product.category === current)
                .map((product) => (
                  <button key={product.id} type="button" className="kiosk-product" onClick={() => open(product)}>
                    <span className="kiosk-photo">
                      {product.images[0] ? <img src={product.images[0]} alt="" /> : <UtensilsCrossed aria-hidden />}
                      {product.flash && <em>Offre flash</em>}
                    </span>
                    <strong>{product.name}</strong>
                    <span className="kiosk-price">{money(product.price)}</span>
                    <span className="kiosk-add" aria-hidden>
                      <Plus size={22} />
                    </span>
                  </button>
                ))}
            </div>
          </section>
          <Basket
            lines={lines}
            total={total}
            change={change}
            next={() => {
              setCountAtExtras(count);
              setStep(extras.length ? "extras" : "details");
            }}
          />
        </main>
      )}

      {step === "extras" && (
        <main className="kiosk-extras">
          <p className="kiosk-kicker">Avant de valider</p>
          <h1>Un petit plus avec ça ?</h1>
          <div className="kiosk-extra-grid">
            {extras.map((product) => (
              <button key={product.id} type="button" className="kiosk-product" onClick={() => add(product, [], 1)}>
                <span className="kiosk-photo">
                  {product.images[0] ? <img src={product.images[0]} alt="" /> : <UtensilsCrossed aria-hidden />}
                </span>
                <strong>{product.name}</strong>
                <span className="kiosk-price">+ {money(product.price)}</span>
                <span className="kiosk-add" aria-hidden>
                  <Plus size={22} />
                </span>
              </button>
            ))}
          </div>
          <div className="kiosk-actions">
            <button type="button" className="kiosk-ghost" onClick={() => setStep("menu")}>
              <ArrowLeft size={18} /> Retour à la carte
            </button>
            <button type="button" className="kiosk-cta" onClick={() => setStep("details")}>
              {count > countAtExtras ? "Je valide" : "Non merci, je valide"} · {money(total)}{" "}
              <ChevronRight size={20} />
            </button>
          </div>
        </main>
      )}

      {step === "details" && (
        <main className="kiosk-details">
          <section>
            <h2>
              <Clock size={22} /> {mode === "onsite" ? "Pour quelle heure ?" : "Quand passez-vous la chercher ?"}
            </h2>
            {asap ? (
              <div className="kiosk-chips" role="radiogroup" aria-label="Créneau">
                <button type="button" role="radio" aria-checked={slot === asap} className="kiosk-chip kiosk-asap" onClick={() => setSlot(asap)}>
                  <strong>Dès que possible</strong>
                  <small>vers {time(asap)}</small>
                </button>
                {today.map((value) => (
                  <button key={value} type="button" role="radio" aria-checked={slot === value} className="kiosk-chip" onClick={() => setSlot(value)}>
                    {time(value)}
                  </button>
                ))}
                {days.length > 1 || (days[0]?.slots.length ?? 0) > 9 ? (
                  <button type="button" className="kiosk-chip kiosk-later" onClick={() => setLaterOpen(!laterOpen)}>
                    {laterOpen ? "Moins d’horaires" : "Plus tard…"}
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="kiosk-error">Aucun créneau disponible pour le moment.</p>
            )}
            {laterOpen &&
              days.map((group, index) => (
                <div key={group.day} className="kiosk-later-day">
                  <h3>{group.day}</h3>
                  <div className="kiosk-chips">
                    {(index === 0 ? group.slots.slice(9) : group.slots).map((value) => (
                      <button key={value} type="button" role="radio" aria-checked={slot === value} className="kiosk-chip" onClick={() => setSlot(value)}>
                        {time(value)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
          </section>
          <section>
            <h2>On vous appelle comment ?</h2>
            <div className="kiosk-fields">
              <label>
                Prénom
                <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" maxLength={100} />
              </label>
              <label>
                E-mail pour le reçu
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={150} inputMode="email" />
              </label>
            </div>
          </section>
          <section>
            <h2>Règlement</h2>
            <div className="kiosk-chips">
              <button type="button" role="radio" aria-checked={payment === "counter"} className="kiosk-chip kiosk-pay" onClick={() => setPayment("counter")}>
                <Store size={20} /> Au comptoir
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={payment === "stripe"}
                className="kiosk-chip kiosk-pay"
                disabled={!data.stripe}
                onClick={() => setPayment("stripe")}
              >
                <CreditCard size={20} /> En ligne
              </button>
            </div>
            <label className="kiosk-check">
              <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
              <span>
                J’accepte les{" "}
                <a href={href("/conditions-generales-vente")} target="_blank" rel="noreferrer">
                  conditions générales de vente
                </a>
                .
              </span>
            </label>
          </section>
          <aside className="kiosk-summary">
            <h2>Ma commande</h2>
            {lines.map((line) => (
              <p key={`${line.menu}-${line.choices.join("|")}`}>
                <span>
                  {line.quantity} × {line.product.name}
                </span>
                <b>{money(line.unit * line.quantity)}</b>
              </p>
            ))}
            <p className="kiosk-total">
              <span>Total</span>
              <b>{money(total)}</b>
            </p>
            {error && (
              <p className="kiosk-error" role="alert">
                {error}
              </p>
            )}
            <button type="button" className="kiosk-cta" disabled={!canSubmit} onClick={() => void submit()}>
              {busy ? "Envoi…" : payment === "stripe" ? `Payer ${money(total)}` : `Commander · ${money(total)}`}
            </button>
            <button type="button" className="kiosk-ghost" onClick={() => setStep("menu")}>
              <ArrowLeft size={18} /> Modifier ma commande
            </button>
          </aside>
        </main>
      )}

      {step === "done" && (
        <main className="kiosk-done">
          {receipt ? (
            <>
              <p className="kiosk-kicker">{preparation(receipt) === "cancelled" ? "Commande annulée" : "Merci " + receipt.customer_name + " !"}</p>
              <p className="kiosk-number" aria-label={`Commande numéro ${receipt.number}`}>
                {receipt.number}
              </p>
              <p className="kiosk-done-meta">
                {receipt.consumption === "onsite" ? "Sur place" : "À emporter"} · retrait vers {time(receipt.desired_at)} ·{" "}
                {receipt.payment_status === "paid"
                  ? "payée"
                  : receipt.payment_method === "counter"
                    ? "à régler au comptoir"
                    : "paiement en attente"}
              </p>
              {preparation(receipt) !== "cancelled" && (
                <ol className="kiosk-steps">
                  {stages.map((stage, index) => (
                    <li key={stage} className={index <= stages.indexOf(preparation(receipt) as (typeof stages)[number]) ? "done" : ""}>
                      <span>{index < stages.indexOf(preparation(receipt) as (typeof stages)[number]) ? <Check size={18} /> : index + 1}</span>
                      {stageLabels[stage]}
                    </li>
                  ))}
                </ol>
              )}
              {preparation(receipt) === "ready" && (
                <p className="kiosk-ready" role="status">
                  <BellRing size={22} /> Votre commande vous attend au comptoir.
                </p>
              )}
              {tablet ? (
                <button type="button" className="kiosk-cta" onClick={reset}>
                  Nouvelle commande ({Math.max(0, countdown)} s)
                </button>
              ) : (
                <p className="kiosk-done-hint">Gardez cette page ouverte : elle se met à jour toute seule.</p>
              )}
            </>
          ) : (
            <p>{error || "Chargement de votre commande…"}</p>
          )}
        </main>
      )}

      {picking && (
        <div className="kiosk-sheet-backdrop" onClick={() => setPicking(null)}>
          <div className="kiosk-sheet" role="dialog" aria-modal="true" aria-label={picking.name} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="kiosk-close" aria-label="Fermer" onClick={() => setPicking(null)}>
              <X />
            </button>
            {picking.images[0] && <img className="kiosk-sheet-photo" src={picking.images[0]} alt="" />}
            <h2>{picking.name}</h2>
            {picking.description && <p>{picking.description}</p>}
            {picking.allergens && <p className="kiosk-muted">Allergènes : {picking.allergens}</p>}
            {picking.options.map((group) => (
              <fieldset key={group.id}>
                <legend>
                  {group.label} {group.required ? <small>obligatoire</small> : <small>facultatif</small>}
                </legend>
                <div className="kiosk-chips">
                  {group.choices.map((choice) => {
                    const id = `${group.id}:${choice.id}`;
                    return (
                      <button
                        key={choice.id}
                        type="button"
                        role={group.multiple ? "checkbox" : "radio"}
                        aria-checked={choices.includes(id)}
                        className="kiosk-chip"
                        onClick={() => toggleChoice(group.id, choice.id, group.multiple)}
                      >
                        {choice.label}
                        {choice.price > 0 && <small>+ {money(choice.price)}</small>}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}
            <div className="kiosk-sheet-actions">
              <div className="kiosk-stepper">
                <button type="button" aria-label="Retirer un" onClick={() => setQuantity(Math.max(1, quantity - 1))}>
                  <Minus />
                </button>
                <b>{quantity}</b>
                <button type="button" aria-label="Ajouter un" onClick={() => setQuantity(Math.min(20, quantity + 1))}>
                  <Plus />
                </button>
              </div>
              <button
                type="button"
                className="kiosk-cta"
                disabled={!!missingGroup}
                onClick={() => {
                  add(picking, choices, quantity);
                  setPicking(null);
                }}
              >
                {missingGroup ? `Choisissez : ${missingGroup.label}` : `Ajouter · ${money(linePrice(picking, choices) * quantity)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <p className="kiosk-toast" role="status">
          <Check size={18} /> {toast}
        </p>
      )}
    </div>
  );
}

function Basket({
  lines,
  total,
  change,
  next,
}: {
  lines: { index: number; product: Product; quantity: number; unit: number; choices: string[] }[];
  total: number;
  change: (index: number, delta: number) => void;
  next: () => void;
}) {
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const [open, setOpen] = useState(false);
  return (
    <aside className={`kiosk-basket${open ? " open" : ""}`} aria-label="Ma commande">
      <button type="button" className="kiosk-basket-toggle" onClick={() => setOpen(!open)}>
        <ShoppingBag size={20} /> Ma commande · {count} · {money(total)}
      </button>
      <h2>Ma commande</h2>
      {lines.length === 0 ? (
        <p className="kiosk-muted">Touchez un produit pour l’ajouter.</p>
      ) : (
        <ul>
          {lines.map((line) => (
            <li key={`${line.product.id}-${line.choices.join("|")}`}>
              <span>
                <strong>{line.product.name}</strong>
                {line.choices.length > 0 && (
                  <small>
                    {line.product.options
                      .flatMap((group) => group.choices.filter((choice) => line.choices.includes(`${group.id}:${choice.id}`)))
                      .map((choice) => choice.label)
                      .join(", ")}
                  </small>
                )}
                <small>{money(line.unit * line.quantity)}</small>
              </span>
              <span className="kiosk-stepper small">
                <button type="button" aria-label={`Retirer un ${line.product.name}`} onClick={() => change(line.index, -1)}>
                  {line.quantity === 1 ? <Trash2 size={16} /> : <Minus size={16} />}
                </button>
                <b>{line.quantity}</b>
                <button type="button" aria-label={`Ajouter un ${line.product.name}`} onClick={() => change(line.index, 1)}>
                  <Plus size={16} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="kiosk-total">
        <span>Total</span>
        <b>{money(total)}</b>
      </p>
      <button type="button" className="kiosk-cta" disabled={!count} onClick={next}>
        Valider ma commande <ChevronRight size={20} />
      </button>
    </aside>
  );
}

/** Signal sonore discret quand la commande est prête (aucun fichier audio à charger). */
function chime() {
  try {
    const AudioContextClass = window.AudioContext;
    const context = new AudioContextClass();
    [880, 1320].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, context.currentTime + index * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.2, context.currentTime + index * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + index * 0.18 + 0.4);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + index * 0.18);
      oscillator.stop(context.currentTime + index * 0.18 + 0.45);
    });
  } catch {}
}
