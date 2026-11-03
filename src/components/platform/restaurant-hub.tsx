"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import "./platform.css";
import { ShopSettings } from "./shop-settings";
import { LoyaltyPanel } from "./loyalty-panel";
import type { Settings } from "@/features/commerce/schema";
type Member = { id: string; name: string; email: string; role: string };
type ShopOrder = {
  order_id: string;
  number: number;
  customer_name: string;
  total: number;
  payment_status: string;
  items: { name: string; quantity: number; status: string }[];
};
const roleOptions = [
  "OWNER",
  "MANAGER",
  "WAITER",
  "CHEF",
  "BARTENDER",
  "STOCK_MANAGER",
  "PURCHASING",
  "ACCOUNTANT",
];
const tabs = [
  ["team", "Équipe"],
  ["shop", "Boutique et avis"],
  ["loyalty", "Fidélité"],
  ["site", "Mon site"],
  ["domains", "Domaines"],
  ["inventory", "Stocks et achats"],
  ["security", "Sécurité"],
  ["reconciliation", "Conflits hors ligne"],
  ["integrations", "Connexions"],
];
export function RestaurantHub({ restaurant }: { restaurant: string }) {
  const router = useRouter();
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [tab, setTab] = useState("team"),
    [responseData, setData] = useState<Record<string, unknown>>(),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [email, setEmail] = useState(""),
    [roles, setRoles] = useState(["WAITER"]),
    [invite, setInvite] = useState(""),
    [domain, setDomain] = useState(""),
    [stock, setStock] = useState<{
      ingredients: { id: string; name: string; unit: string }[];
      lots: { id: string; name: string; quantity: number }[];
      suppliers: { id: string; name: string }[];
    }>(),
    [ingredientName, setIngredientName] = useState(""),
    [unit, setUnit] = useState("g"),
    [supplier, setSupplier] = useState(""),
    [due, setDue] = useState(""),
    [purchaseLines, setPurchaseLines] = useState<
      { ingredient: string; quantity: number; unit: string }[]
    >([]),
    [counts, setCounts] = useState<Record<string, string>>({});
  const api = useCallback(
    async (body?: unknown) => {
      const r = await fetch(
        `/api/restaurants/${encodeURIComponent(restaurant)}/${tab === "reconciliation" ? "security" : tab === "domains" ? "site" : tab}`,
        body
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : undefined,
      );
      const d = await r.json();
      if (r.status === 401) {
        router.push(`/auth/login?returnTo=/restaurant/${restaurant}`);
        throw new Error("Connexion requise.");
      }
      if (!r.ok) throw new Error(d.error?.message || "Opération impossible.");
      return d;
    },
    [restaurant, tab, router],
  );
  const data = responseData?._module === tab ? responseData : undefined;
  useEffect(() => {
    let active = true;
    setData(undefined);
    setError("");
    void api()
      .then(async (d) => {
        if (!active) return;
        setData({ ...d, _module: tab });
        if (tab === "inventory") {
          const response = await fetch(
            `/api/v1/state?restaurant=${restaurant}`,
          );
          if (response.ok && active) setStock(await response.json());
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [api, tab, restaurant, refreshVersion]);

  async function perform(body: unknown) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const d = await api(body);
      if (d.token)
        setInvite(`${location.origin}/platform?invitation=${d.token}`);
      if (d.record) setMessage(`DNS TXT : ${d.record} → ${d.value}`);
      else setMessage("Modification enregistrée.");
      setRefreshVersion((value) => value + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const members = (data?.members || []) as Member[];
  return (
    <main className="platform">
      <header>
        <Link href="/platform">← Mes restaurants</Link>
        <h1>Administration du restaurant</h1>
        <div className="actions">
          <Link className="button" href={`/dashboard?restaurant=${restaurant}`}>
            Poste de travail
          </Link>
          <Link href={`/r/${restaurant}`}>Site et boutique</Link>
          <Link href={`/offline?restaurant=${restaurant}`}>
            Poste hors ligne
          </Link>
        </div>
      </header>
      <nav aria-label="Modules du restaurant">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            aria-pressed={tab === id}
            disabled={busy}
            onClick={() => {
              if (["site", "security"].includes(id)) {
                router.push(`/restaurant/${restaurant}/${id}`);
                return;
              }
              setData(undefined);
              setTab(id);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="success">
          {message}
        </p>
      )}
      {!data ? (
        <p role="status">Chargement…</p>
      ) : (
        <>
          {tab === "team" && (
            <>
              <section>
                <h2>Inviter un collaborateur</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void perform({ action: "invite", email, roles });
                  }}
                >
                  <label>
                    E-mail
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </label>
                  <fieldset>
                    <legend>Rôles dans cet établissement</legend>
                    {roleOptions.map((role) => (
                      <label className="inline" key={role}>
                        <input
                          type="checkbox"
                          checked={roles.includes(role)}
                          onChange={(e) =>
                            setRoles(
                              e.target.checked
                                ? [...roles, role]
                                : roles.filter((r) => r !== role),
                            )
                          }
                        />
                        {role}
                      </label>
                    ))}
                  </fieldset>
                  <button disabled={busy || !roles.length}>
                    Créer le lien d’invitation
                  </button>
                </form>
                {invite && (
                  <p>
                    Lien à transmettre : <a href={invite}>{invite}</a>
                  </p>
                )}
                <p>
                  Le destinataire devra se connecter avec cette adresse
                  vérifiée. Le lien expire après sept jours.
                </p>
              </section>
              <section>
                <h2>Équipe et accès</h2>
                {[...new Set(members.map((m) => m.id))].map((id) => {
                  const m = members.find((m) => m.id === id)!;
                  return (
                    <article key={id}>
                      <h3>{m.name}</h3>
                      <p>
                        {m.email} ·{" "}
                        {members
                          .filter((x) => x.id === id)
                          .map((x) => x.role)
                          .join(", ")}
                      </p>
                      <button
                        disabled={busy}
                        onClick={() =>
                          perform({
                            action: "membership",
                            profile: id,
                            roles: [],
                          })
                        }
                      >
                        Retirer les accès à cet établissement
                      </button>
                    </article>
                  );
                })}
              </section>
            </>
          )}
          {tab === "domains" && (
            <>
              <section>
                <h2>Domaine personnalisé</h2>
                <p>
                  Après la preuve DNS, le domaine doit aussi pointer vers votre
                  hébergement et disposer d’un certificat HTTPS.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void perform({ action: "domain", hostname: domain });
                  }}
                >
                  <label>
                    Nom de domaine
                    <input
                      required
                      placeholder="restaurant.fr"
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                    />
                  </label>
                  <button disabled={busy}>Obtenir la preuve DNS</button>
                </form>
                {(
                  data.domains as {
                    hostname: string;
                    verified_at: string | null;
                  }[]
                ).map((d) => (
                  <article key={d.hostname}>
                    <p>
                      {d.hostname} · {d.verified_at ? "Vérifié" : "À vérifier"}
                    </p>
                    <div className="actions">
                      <button
                        disabled={busy}
                        onClick={() =>
                          perform({
                            action: "verifyDomain",
                            hostname: d.hostname,
                          })
                        }
                      >
                        Vérifier le DNS
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          perform({
                            action: "removeDomain",
                            hostname: d.hostname,
                          })
                        }
                      >
                        Retirer
                      </button>
                    </div>
                  </article>
                ))}
              </section>
            </>
          )}
          {tab === "loyalty" && (
            <LoyaltyPanel
              rewards={
                data.rewards as {
                  id: string;
                  name: string;
                  points_cost: number;
                  active: boolean;
                }[]
              }
              busy={busy}
              submit={(a) => void perform(a)}
            />
          )}
          {tab === "shop" && (
            <>
              <section>
                <h2>Commandes boutique</h2>
                {(data.orders as ShopOrder[]).map((o) => (
                  <article key={o.order_id}>
                    <h3>
                      Commande #{o.number} · {o.customer_name}
                    </h3>
                    <p>
                      {o.items
                        .map((i) => `${i.quantity} × ${i.name} (${i.status})`)
                        .join(", ")}
                    </p>
                    <p>
                      {(o.total / 100).toFixed(2)} € ·{" "}
                      {o.payment_status === "paid" ? "Réglée" : "À régler"}
                    </p>
                    <div className="actions">
                      {["preparing", "ready", "served", "cancelled"].map(
                        (value) => (
                          <button
                            disabled={busy}
                            key={value}
                            onClick={() =>
                              perform({
                                action: "transition",
                                data: { id: o.order_id, value },
                              })
                            }
                          >
                            {
                              (
                                {
                                  preparing: "Commencer",
                                  ready: "Prêt",
                                  served: "Remis",
                                  cancelled: "Annuler",
                                } as Record<string, string>
                              )[value]
                            }
                          </button>
                        ),
                      )}
                      {o.payment_status !== "paid" &&
                        ["cash", "card"].map((value) => (
                          <button
                            key={value}
                            disabled={busy}
                            onClick={() =>
                              perform({
                                action: "settle",
                                data: { id: o.order_id, value },
                              })
                            }
                          >
                            Déclarer {value === "cash" ? "espèces" : "carte"}
                          </button>
                        ))}
                    </div>
                  </article>
                ))}
              </section>
              <section>
                <h2>Avis à modérer</h2>
                {(
                  data.reviews as {
                    id: string;
                    product: string;
                    body: string;
                    rating: number;
                    status: string;
                  }[]
                ).map((review) => (
                  <article key={review.id}>
                    <h3>
                      {review.product} · {review.rating}/5
                    </h3>
                    <p>{review.body}</p>
                    <p>{review.status}</p>
                    <div className="actions">
                      {["published", "rejected", "archived"].map((status) => (
                        <button
                          disabled={busy}
                          key={status}
                          onClick={() =>
                            perform({
                              action: "moderate",
                              data: { id: review.id, status, reply: "" },
                            })
                          }
                        >
                          {
                            (
                              {
                                published: "Publier",
                                rejected: "Refuser",
                                archived: "Archiver",
                              } as Record<string, string>
                            )[status]
                          }
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
              </section>
              <section>
                <h2>Réglages de commande</h2>
                <ShopSettings
                  key={JSON.stringify(data.settings)}
                  initial={data.settings as Settings}
                  busy={busy}
                  save={(value) =>
                    void perform({ action: "settings", data: value })
                  }
                />
              </section>
            </>
          )}
          {tab === "inventory" && (
            <>
              <section>
                <h2>Créer un ingrédient</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void perform({
                      action: "ingredient",
                      name: ingredientName,
                      unit,
                      threshold: 0,
                      cost: 0,
                    });
                  }}
                >
                  <label>
                    Nom
                    <input
                      required
                      value={ingredientName}
                      onChange={(e) => setIngredientName(e.target.value)}
                    />
                  </label>
                  <label>
                    Unité
                    <select
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                    >
                      <option value="g">Grammes</option>
                      <option value="ml">Millilitres</option>
                      <option value="unit">Unités</option>
                    </select>
                  </label>
                  <button disabled={busy}>Créer</button>
                </form>
              </section>
              <section>
                <h2>Campagne d’inventaire</h2>
                <p>
                  Seuls les lots renseignés seront comptés. Une validation
                  applique les écarts avec historique.
                </p>
                {stock?.lots?.map((l) => (
                  <label key={l.id}>
                    {l.name} · stock actuel {l.quantity}
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={counts[l.id] ?? ""}
                      onChange={(e) =>
                        setCounts({ ...counts, [l.id]: e.target.value })
                      }
                    />
                  </label>
                ))}
                <button
                  disabled={busy}
                  onClick={() =>
                    perform({
                      action: "inventory",
                      lines: Object.entries(counts)
                        .filter(([, v]) => v !== "")
                        .map(([lot, v]) => ({ lot, counted: Number(v) })),
                    })
                  }
                >
                  Enregistrer le brouillon d’inventaire
                </button>
                {(
                  data.inventories as {
                    id: string;
                    status: string;
                    lines: number;
                  }[]
                ).map((i) => (
                  <article key={i.id}>
                    <p>
                      {i.lines} lots · {i.status}
                    </p>
                    {i.status === "draft" && (
                      <div className="actions">
                        <button
                          disabled={busy}
                          onClick={() =>
                            perform({ action: "applyInventory", id: i.id })
                          }
                        >
                          Appliquer les quantités comptées
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            perform({ action: "cancelInventory", id: i.id })
                          }
                        >
                          Annuler l’inventaire
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </section>
              <section>
                <h2>Commande fournisseur multilignes</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void perform({
                      action: "purchase",
                      supplier,
                      due,
                      lines: purchaseLines,
                    });
                  }}
                >
                  <label>
                    Fournisseur
                    <select
                      required
                      value={supplier}
                      onChange={(e) => setSupplier(e.target.value)}
                    >
                      <option value="">Choisir</option>
                      {stock?.suppliers?.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Livraison prévue
                    <input
                      required
                      type="date"
                      value={due}
                      onChange={(e) => setDue(e.target.value)}
                    />
                  </label>
                  {purchaseLines.map((line, i) => (
                    <article key={i}>
                      <label>
                        Ingrédient
                        <select
                          required
                          value={line.ingredient}
                          onChange={(e) => {
                            const ing = stock?.ingredients.find(
                              (x) => x.id === e.target.value,
                            );
                            setPurchaseLines(
                              purchaseLines.map((l, j) =>
                                j === i
                                  ? {
                                      ...l,
                                      ingredient: e.target.value,
                                      unit: ing?.unit || "g",
                                    }
                                  : l,
                              ),
                            );
                          }}
                        >
                          <option value="">Choisir</option>
                          {stock?.ingredients.map((ing) => (
                            <option key={ing.id} value={ing.id}>
                              {ing.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Quantité ({line.unit})
                        <input
                          type="number"
                          min="0.001"
                          step="any"
                          value={line.quantity}
                          onChange={(e) =>
                            setPurchaseLines(
                              purchaseLines.map((l, j) =>
                                j === i
                                  ? { ...l, quantity: Number(e.target.value) }
                                  : l,
                              ),
                            )
                          }
                        />
                      </label>
                    </article>
                  ))}
                  <div className="actions">
                    <button
                      type="button"
                      onClick={() =>
                        setPurchaseLines([
                          ...purchaseLines,
                          { ingredient: "", quantity: 1, unit: "g" },
                        ])
                      }
                    >
                      Ajouter une ligne
                    </button>
                    <button disabled={busy || !purchaseLines.length}>
                      Enregistrer la commande
                    </button>
                  </div>
                </form>
                {(
                  data.purchases as {
                    id: string;
                    supplier: string;
                    status: string;
                  }[]
                ).map((p) => (
                  <article key={p.id}>
                    <h3>{p.supplier}</h3>
                    <p>{p.status}</p>
                    {["confirmed", "partial"].includes(p.status) &&
                      (
                        data.lines as {
                          id: string;
                          document_id: string;
                          name: string;
                          unit: string;
                          quantity: number;
                          received: number;
                        }[]
                      )
                        .filter(
                          (l) =>
                            l.document_id === p.id &&
                            Number(l.received) < Number(l.quantity),
                        )
                        .map((l) => (
                          <ReceiveLine
                            key={l.id}
                            line={l}
                            busy={busy}
                            receive={(quantity, expires, location) =>
                              void perform({
                                action: "receivePurchase",
                                line: l.id,
                                quantity,
                                expires,
                                location,
                              })
                            }
                          />
                        ))}
                    {p.status === "draft" && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          perform({ action: "confirmPurchase", id: p.id })
                        }
                      >
                        Confirmer la commande fournisseur
                      </button>
                    )}
                    {!["received", "cancelled"].includes(p.status) && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          perform({ action: "cancelPurchase", id: p.id })
                        }
                      >
                        Annuler le restant
                      </button>
                    )}
                  </article>
                ))}
              </section>
            </>
          )}
          {tab === "reconciliation" && (
            <section>
              <h2>Conflits hors ligne</h2>
              <p>
                Contrôlez le ticket local et le stock avant toute décision. Un
                rejet n’applique aucune opération et conserve sa trace.
              </p>
              {(
                data.conflicts as {
                  id: string;
                  device: string;
                  error: string;
                }[]
              ).map((c) => (
                <ConflictDecision
                  key={c.id}
                  conflict={c}
                  busy={busy}
                  decide={(decision, reason) =>
                    void perform({
                      action: "resolveConflict",
                      operation: c.id,
                      decision,
                      reason,
                    })
                  }
                />
              ))}
              <h2>Incidents et tâches</h2>
              <button
                disabled={busy}
                onClick={() => perform({ action: "scanSecurity" })}
              >
                Lancer les contrôles
              </button>
              {(
                data.incidents as {
                  id: string;
                  message: string;
                  status: string;
                }[]
              ).map((i) => (
                <article key={i.id}>
                  <p>
                    {i.message} · {i.status}
                  </p>
                  <div className="actions">
                    <button
                      disabled={busy}
                      onClick={() =>
                        perform({
                          action: "incident",
                          id: i.id,
                          status: "acknowledged",
                        })
                      }
                    >
                      Prendre en charge
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        perform({
                          action: "incident",
                          id: i.id,
                          status: "resolved",
                        })
                      }
                    >
                      Marquer résolu
                    </button>
                  </div>
                </article>
              ))}
              <h2>Journal d’activité</h2>
              <p>
                Les opérations sont rattachées à leur établissement et à leur
                auteur. Ce journal ne constitue pas une sauvegarde.
              </p>
              <div className="scroll">
                {(
                  data.events as {
                    id: string;
                    action: string;
                    name: string;
                    created_at: string;
                  }[]
                ).map((e) => (
                  <article key={e.id}>
                    <strong>{e.action}</strong>
                    <p>
                      {e.name || "Visiteur"} ·{" "}
                      {new Date(e.created_at).toLocaleString("fr-FR")}
                    </p>
                  </article>
                ))}
              </div>
              <h2>Accès temporaires du support</h2>
              {(
                data.support as {
                  id: string;
                  reason: string;
                  expires_at: string;
                  revoked_at: string | null;
                }[]
              ).map((g) => (
                <article key={g.id}>
                  <p>
                    {g.reason} · jusqu’au{" "}
                    {new Date(g.expires_at).toLocaleString("fr-FR")}
                  </p>
                  {!g.revoked_at && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        perform({ action: "revokeSupport", grant: g.id })
                      }
                    >
                      Révoquer
                    </button>
                  )}
                </article>
              ))}
            </section>
          )}
          {tab === "integrations" && (
            <section>
              <h2>Services spécialisés</h2>
              <p>
                Les raccordements nécessitent un prestataire et une validation
                réelle avant leur ouverture. Aucun abonnement externe n’est
                activé ici.
              </p>
              {(data.modules as { kind: string; label: string }[]).map((m) => (
                <article key={m.kind}>
                  <h3>{m.label}</h3>
                  <p>Non raccordé · indisponible</p>
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </main>
  );
}

function ReceiveLine({
  line,
  busy,
  receive,
}: {
  line: {
    id: string;
    name: string;
    unit: string;
    quantity: number;
    received: number;
  };
  busy: boolean;
  receive: (quantity: number, expires: string, location: string) => void;
}) {
  const [quantity, setQuantity] = useState(
      Number(line.quantity) - Number(line.received),
    ),
    [expires, setExpires] = useState(""),
    [location, setLocation] = useState("Réserve");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        receive(quantity, expires, location);
      }}
    >
      <h4>
        {line.name} · restant {Number(line.quantity) - Number(line.received)}{" "}
        {line.unit}
      </h4>
      <label>
        Quantité reçue
        <input
          required
          type="number"
          min="0.001"
          step="any"
          max={Number(line.quantity) - Number(line.received)}
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
        />
      </label>
      <label>
        Date limite du lot
        <input
          required
          type="date"
          value={expires}
          onChange={(e) => setExpires(e.target.value)}
        />
      </label>
      <label>
        Emplacement
        <input
          required
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
      </label>
      <button disabled={busy}>Réceptionner ce lot</button>
    </form>
  );
}

function ConflictDecision({
  conflict,
  busy,
  decide,
}: {
  conflict: { id: string; device: string; error: string };
  busy: boolean;
  decide: (decision: string, reason: string) => void;
}) {
  const [reason, setReason] = useState(""),
    [decision, setDecision] = useState("retry");
  return (
    <article>
      <h3>{conflict.device}</h3>
      <p>{conflict.error}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          decide(decision, reason);
        }}
      >
        <label>
          Décision
          <select
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
          >
            <option value="retry">Rejouer après correction de la cause</option>
            <option value="reject">
              Rejeter et rapprocher manuellement le stock
            </option>
          </select>
        </label>
        <label>
          Vérifications et motif
          <textarea
            required
            minLength={10}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button disabled={busy}>Enregistrer la décision</button>
      </form>
    </article>
  );
}
