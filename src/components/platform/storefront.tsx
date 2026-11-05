"use client";
import Link from "next/link";
import Image from "next/image";
import type { SiteDocument } from "@/features/site/model";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import type {
  Product,
  Settings,
  ShopOrder,
  CustomerAccount,
  PublicReview,
} from "@/features/commerce/schema";
import { Booking } from "@/components/public/booking";
import "./platform.css";
type Line = { menu: string; quantity: number; choices: string[]; note: string };
type Site = {
  name: string;
  address: string;
  phone: string;
  document: SiteDocument | null;
};
type Catalog = {
  products: Product[];
  settings: Settings;
  slots: string[];
  reviews: PublicReview[];
  site: Site;
};
export function Storefront({
  restaurant,
  route,
}: {
  restaurant: string;
  route: string;
}) {
  const router = useRouter();
  const [catalog, setCatalog] = useState<Catalog>(),
    [cart, setCart] = useState<Line[]>([]),
    [choices, setChoices] = useState<Record<string, string[]>>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [slot, setSlot] = useState(""),
    [consumption, setConsumption] = useState("takeaway"),
    [consent, setConsent] = useState(false),
    [terms, setTerms] = useState(false),
    [promo, setPromo] = useState(""),
    [receipt, setReceipt] = useState<ShopOrder>(),
    [account, setAccount] = useState<CustomerAccount>(),
    [key, setKey] = useState("");
  const base = `/r/${restaurant}`;
  const api = useCallback(
    async (action: string, body?: unknown, token?: string) => {
      const r = await fetch(
        `/api/store/${encodeURIComponent(restaurant)}/${action}`,
        {
          method: body ? "POST" : "GET",
          headers: {
            ...(body ? { "Content-Type": "application/json" } : {}),
            ...(token ? { "x-order-token": token } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || "Opération impossible.");
      return d;
    },
    [restaurant],
  );
  useEffect(() => {
    let active = true;
    void api("catalog")
      .then((d) => {
        if (active) setCatalog(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    try {
      const saved = localStorage.getItem(`dattier-cart:${restaurant}`);
      if (saved) setCart(JSON.parse(saved));
      const id =
        sessionStorage.getItem(`dattier-checkout:${restaurant}`) ||
        crypto.randomUUID();
      setKey(id);
      sessionStorage.setItem(`dattier-checkout:${restaurant}`, id);
    } catch {
      setKey(crypto.randomUUID());
    }
    const timer = setInterval(() => {
      void api("catalog")
        .then((d) => {
          if (active) setCatalog(d);
        })
        .catch(() => {});
    }, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api, restaurant]);
  useEffect(() => {
    if (route === "account")
      void api("account")
        .then((d) => {
          setAccount(d);
          setName(d.customer.name);
          setEmail(d.customer.email);
        })
        .catch(() => {});
  }, [api, route]);
  function changeCart(next: Line[]) {
    setCart(next);
    try {
      localStorage.setItem(`dattier-cart:${restaurant}`, JSON.stringify(next));
    } catch {
      setError("Le panier ne peut pas être conservé sur cet appareil.");
    }
  }
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const total = cart.reduce((sum, line) => {
    const p = catalog?.products.find((p) => p.id === line.menu);
    if (!p) return sum;
    return (
      sum +
      (p.price +
        p.options
          .flatMap((g) =>
            g.choices.map((c) => ({ ...c, key: `${g.id}:${c.id}` })),
          )
          .filter((c) => line.choices.includes(c.key))
          .reduce((s, c) => s + c.price, 0)) *
        line.quantity
    );
  }, 0);
  const page = catalog?.site.document?.pages.find(
    (p) => `page/${p.slug}` === route,
  );
  return (
    <main
      className="platform"
      style={
        catalog?.site.document
          ? ({
              "--brand": catalog.site.document.color,
              "--brand-ink":
                parseInt(catalog.site.document.color.slice(1, 3), 16) * 0.299 +
                  parseInt(catalog.site.document.color.slice(3, 5), 16) *
                    0.587 +
                  parseInt(catalog.site.document.color.slice(5, 7), 16) *
                    0.114 >
                160
                  ? "#10291f"
                  : "#ffffff",
              fontFamily:
                catalog.site.document.font === "serif"
                  ? "Georgia,serif"
                  : catalog.site.document.font === "sans"
                    ? "Arial,sans-serif"
                    : "system-ui,sans-serif",
            } as React.CSSProperties)
          : undefined
      }
    >
      <header>
        <h1>
          {catalog?.site.document?.title ||
            catalog?.site.name ||
            "Votre restaurant"}
        </h1>
        <p>{catalog?.site.document?.description}</p>
        <nav aria-label="Navigation du restaurant">
          <Link href={base}>Carte et commande</Link>
          <Link href={`${base}/reservations`}>Réserver</Link>
          <Link href={`${base}/account`}>Mon compte</Link>
          {catalog?.site.document?.pages.map((p) => (
            <Link key={p.slug} href={`${base}/page/${p.slug}`}>
              {p.title}
            </Link>
          ))}
        </nav>
      </header>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!catalog ? (
        <p role="status">Chargement du restaurant…</p>
      ) : route === "reservations" ? (
        <Booking restaurant={restaurant} />
      ) : route === "account" ? (
        <section>
          <h2>Votre espace client</h2>
          {account ? (
            <>
              <p>
                {account.customer.name} · {account.customer.points} points
              </p>
              <p>Votre compte appartient à l’organisation de ce restaurant.</p>
              <h3>Vos récompenses</h3>
              {account.rewards.map((reward) => (
                <article key={reward.id}>
                  <h3>{reward.name}</h3>
                  <p>{reward.points_cost} points</p>
                  <button
                    disabled={
                      busy || account.customer.points < reward.points_cost
                    }
                    onClick={() =>
                      action(async () => {
                        const result = await api("reward", {
                          reward: reward.id,
                          key: crypto.randomUUID(),
                        });
                        setPromo(result.code);
                        setError(`Votre code personnel : ${result.code}`);
                        setAccount(await api("account"));
                      })
                    }
                  >
                    Échanger mes points
                  </button>
                </article>
              ))}
              <h3>Vos commandes</h3>
              {account.orders.map((o) => (
                <article key={o.order_id}>
                  <h3>Commande #{o.number}</h3>
                  <p>
                    {o.items.map((i) => `${i.quantity} × ${i.name}`).join(", ")}
                  </p>
                  <button
                    onClick={() => {
                      changeCart(o.reorder_items);
                      router.push(base);
                    }}
                  >
                    Recommander
                  </button>
                  {o.items.map((i) => (
                    <ReviewForm
                      key={i.id}
                      name={i.name}
                      busy={busy}
                      submit={(rating, body) =>
                        action(async () => {
                          await api("review", {
                            menu: i.menu_id,
                            rating,
                            body,
                          });
                          setError(
                            "Avis enregistré, en attente de modération.",
                          );
                        })
                      }
                    />
                  ))}
                </article>
              ))}
            </>
          ) : (
            <>
              <p>
                Connectez-vous pour retrouver vos commandes et votre fidélité.
              </p>
              <Link
                className="button"
                href={`/auth/login?returnTo=${encodeURIComponent(`${base}/account`)}`}
              >
                Créer mon compte ou me connecter
              </Link>
            </>
          )}
        </section>
      ) : page ? (
        <section>
          <h2>{page.title}</h2>
          <p style={{ whiteSpace: "pre-wrap" }}>{page.text}</p>
        </section>
      ) : route ? (
        <section>
          <h2>Page introuvable</h2>
          <Link href={base}>Revenir à la carte</Link>
        </section>
      ) : (
        <>
          {catalog.site.document?.sections
            ?.filter((s) => s.visible)
            .map((section) => (
              <section key={section.id}>
                <h2>{section.title}</h2>
                {section.type === "image" && section.asset && (
                  <Image
                    unoptimized
                    width={1000}
                    height={600}
                    style={{ width: "100%", height: "auto", borderRadius: 12 }}
                    src={`/api/media/${restaurant}/${section.asset}`}
                    alt={section.title}
                  />
                )}
                <p style={{ whiteSpace: "pre-wrap" }}>{section.body}</p>
                {section.type === "catalog" && (
                  <a href="#restaurant-menu">Consulter la carte et commander</a>
                )}
              </section>
            ))}
          <section id="restaurant-menu">
            <h2>La carte</h2>
            {!catalog.settings.open && (
              <p className="badge">Commandes en ligne fermées</p>
            )}
            <div className="grid">
              {catalog.products.map((p) => (
                <article key={p.id}>
                  <h3>{p.name}</h3>
                  <p>{p.description}</p>
                  <p>
                    {(p.price / 100).toFixed(2)} € · {p.portions} portions
                    disponibles
                  </p>
                  {p.allergens && <small>Allergènes : {p.allergens}</small>}
                  {p.options.map((g) => (
                    <fieldset key={g.id}>
                      <legend>
                        {g.label}
                        {g.required ? " · obligatoire" : ""}
                      </legend>
                      {g.choices.map((c) => {
                        const value = `${g.id}:${c.id}`;
                        return (
                          <label className="inline" key={c.id}>
                            <input
                              type={g.multiple ? "checkbox" : "radio"}
                              name={`${p.id}:${g.id}`}
                              checked={(choices[p.id] || []).includes(value)}
                              onChange={(e) =>
                                setChoices({
                                  ...choices,
                                  [p.id]: e.target.checked
                                    ? [
                                        ...(choices[p.id] || []).filter(
                                          (x) =>
                                            g.multiple ||
                                            !x.startsWith(`${g.id}:`),
                                        ),
                                        value,
                                      ]
                                    : (choices[p.id] || []).filter(
                                        (x) => x !== value,
                                      ),
                                })
                              }
                            />
                            {c.label}
                            {c.price ? ` +${(c.price / 100).toFixed(2)} €` : ""}
                          </label>
                        );
                      })}
                    </fieldset>
                  ))}
                  <button
                    disabled={busy || !catalog.settings.open || p.portions < 1}
                    onClick={() =>
                      changeCart([
                        ...cart,
                        {
                          menu: p.id,
                          quantity: 1,
                          choices: choices[p.id] || [],
                          note: "",
                        },
                      ])
                    }
                  >
                    Ajouter au panier
                  </button>
                </article>
              ))}
            </div>
          </section>
          <section>
            <h2>Votre panier</h2>
            {cart.map((line, i) => (
              <article key={i}>
                <strong>
                  {catalog.products.find((p) => p.id === line.menu)?.name ||
                    "Produit indisponible"}
                </strong>
                <label>
                  Quantité
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={line.quantity}
                    onChange={(e) =>
                      changeCart(
                        cart.map((l, j) =>
                          j === i
                            ? { ...l, quantity: Number(e.target.value) }
                            : l,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Note de préparation
                  <input
                    maxLength={300}
                    value={line.note}
                    onChange={(e) =>
                      changeCart(
                        cart.map((l, j) =>
                          j === i ? { ...l, note: e.target.value } : l,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  onClick={() => changeCart(cart.filter((_, j) => j !== i))}
                >
                  Retirer du panier
                </button>
              </article>
            ))}
            <p>Total avant éventuelle remise : {(total / 100).toFixed(2)} €</p>
            {cart.length > 0 && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(async () => {
                    const result = await api("checkout", {
                      key,
                      customer: name,
                      email,
                      consumption,
                      payment: "counter",
                      promo,
                      loyaltyConsent: consent,
                      termsAccepted: terms,
                      slot,
                      items: cart,
                    });
                    setReceipt(result);
                    sessionStorage.setItem(
                      `dattier-order:${restaurant}`,
                      result.token,
                    );
                    changeCart([]);
                    const next = crypto.randomUUID();
                    setKey(next);
                    sessionStorage.setItem(
                      `dattier-checkout:${restaurant}`,
                      next,
                    );
                  });
                }}
              >
                <label>
                  Nom
                  <input
                    required
                    minLength={2}
                    maxLength={100}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  E-mail
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label>
                  Mode de consommation
                  <select
                    value={consumption}
                    onChange={(e) => setConsumption(e.target.value)}
                  >
                    <option value="takeaway">À emporter</option>
                    <option value="onsite">
                      Sur place, sans garantie de table
                    </option>
                  </select>
                </label>
                <label>
                  Créneau
                  <select
                    required
                    value={slot}
                    onChange={(e) => setSlot(e.target.value)}
                  >
                    <option value="">Choisir un créneau</option>
                    {catalog.slots.map((s) => (
                      <option key={s} value={s}>
                        {new Date(s).toLocaleString("fr-FR", {
                          timeZone: "Europe/Paris",
                        })}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Code promotionnel
                  <input
                    value={promo}
                    onChange={(e) => setPromo(e.target.value)}
                  />
                </label>
                <label className="inline">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  Participer au programme de fidélité
                </label>
                <label className="inline">
                  <input
                    required
                    type="checkbox"
                    checked={terms}
                    onChange={(e) => setTerms(e.target.checked)}
                  />
                  J’accepte les conditions de vente du restaurant
                </label>
                <p>
                  Paiement au comptoir. Le paiement en ligne n’est pas raccordé.
                </p>
                <button disabled={busy || !catalog.settings.open}>
                  Confirmer ma commande
                </button>
              </form>
            )}
          </section>
          {receipt && (
            <section aria-live="polite">
              <h2>Commande #{receipt.number} enregistrée</h2>
              <p>
                {receipt.payment_status === "paid"
                  ? "Paiement confirmé"
                  : "À régler au comptoir"}{" "}
                ·{" "}
                {receipt.items
                  .map((i) => `${i.quantity} × ${i.name} (${i.status})`)
                  .join(", ")}
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    const token = sessionStorage.getItem(
                      `dattier-order:${restaurant}`,
                    );
                    if (token)
                      setReceipt(await api("receipt", undefined, token));
                  })
                }
              >
                Actualiser le suivi
              </button>
            </section>
          )}
          <section>
            <h2>Avis publiés</h2>
            {catalog.reviews.map((r) => (
              <article key={r.id}>
                <p>
                  {r.rating}/5 · {r.menu_name}
                </p>
                <p>{r.body}</p>
                {r.admin_reply && (
                  <p>Réponse du restaurant : {r.admin_reply}</p>
                )}
              </article>
            ))}
          </section>
        </>
      )}
      <footer>
        <p>
          {catalog?.site.address} · {catalog?.site.phone}
        </p>
        <Link href="/source">Propulsé par atacuisine · code source</Link>
      </footer>
    </main>
  );
}
function ReviewForm({
  name,
  busy,
  submit,
}: {
  name: string;
  busy: boolean;
  submit: (rating: number, body: string) => Promise<void>;
}) {
  const [rating, setRating] = useState(5),
    [body, setBody] = useState("");
  return (
    <details>
      <summary>Donner un avis sur {name}</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(rating, body);
        }}
      >
        <label>
          Note
          <select
            value={rating}
            onChange={(e) => setRating(Number(e.target.value))}
          >
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n}/5
              </option>
            ))}
          </select>
        </label>
        <label>
          Votre avis
          <textarea
            required
            minLength={10}
            maxLength={1000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <button disabled={busy}>Envoyer à la modération</button>
      </form>
    </details>
  );
}
