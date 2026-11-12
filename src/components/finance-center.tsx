"use client";
import { useCallback, useEffect, useState } from "react";
import { dateTime, money } from "@/domain/shared/units";
import { Form, Modal, type Field } from "./forms";
import { Button } from "./ui/button";

type Rate = {
  id: string;
  label: string;
  rate_bp: number;
  sales_account: string;
  vat_account: string;
};
type ReviewItem = {
  id: string;
  kind: "vat_undetermined" | "amount_mismatch" | "correction";
  message: string;
  amount: number;
  occurred_at: string;
  method: "card" | "cash" | "other" | "online";
  discount: number;
  items: {
    id: string;
    name: string;
    price: number;
    quantity: number;
    vat_rate_id: string | null;
  }[];
};
type State = {
  settings: {
    vat_regime: "unknown" | "normal" | "franchise";
    cash_account: string;
    card_account: string;
    other_account: string;
    sales_account: string;
  };
  accounts: { code: string; label: string }[];
  rates: Rate[];
  products: {
    id: string;
    name: string;
    category: string;
    onsite_rate_id: string | null;
    takeaway_rate_id: string | null;
  }[];
  categories: {
    category: string;
    products: number;
    onsite_rate_id: string | null;
    takeaway_rate_id: string | null;
  }[];
  vatSummary: {
    month: string;
    label: string;
    rate_bp: number;
    net: number;
    vat: number;
  }[];
  counts: {
    events: number;
    entries: number;
    open: number;
    invoices: number;
    bank: number;
  };
  review: ReviewItem[];
  entries: {
    id: string;
    number: number;
    entry_date: string;
    label: string;
    kind: string;
    reversed: boolean;
    lines: {
      line_no: number;
      account_code: string;
      debit: number;
      credit: number;
      label: string;
    }[];
  }[];
};
type Editor = {
  title: string;
  fields: Field[];
  submit: (values: Record<string, string>) => Promise<void>;
};

const regimes = {
  unknown: "Non déclaré",
  normal: "Assujetti à la TVA",
  franchise: "Franchise en base (sans TVA)",
};
const methods = {
  card: "Carte",
  cash: "Espèces",
  other: "Autre",
  online: "En ligne",
};

export function FinanceCenter({ restaurant }: { restaurant: string }) {
  const [state, setState] = useState<State | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [editor, setEditor] = useState<Editor | null>(null),
    [choices, setChoices] = useState<Record<string, string>>({});
  const url = `/api/restaurants/${encodeURIComponent(restaurant)}/finance`;
  const load = useCallback(async () => {
    const response = await fetch(url);
    const body = await response.json();
    if (!response.ok)
      throw new Error(body.error?.message || "Accès impossible.");
    setState(body);
  }, [url]);
  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
  }, [load]);
  /** Envoie une action puis relit l’état. Une erreur remonte au formulaire qui l’a lancée. */
  const send = async (action: Record<string, unknown>) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action),
    });
    const body = await response.json();
    if (!response.ok)
      throw new Error(body.error?.message || "Opération impossible.");
    await load();
    return body as {
      posted?: number;
      outcome?: string;
      chain?: { checked: number; broken_at: number | null };
    };
  };
  /** Même envoi depuis un bouton : l’erreur s’affiche dans le bandeau. */
  const run = async (
    action: Record<string, unknown>,
    done?: (result: Awaited<ReturnType<typeof send>>) => string,
  ) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await send(action);
      if (done) setNotice(done(result));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!state)
    return error ? (
      <p className="note" role="alert">
        {error}
      </p>
    ) : (
      <p>Chargement de la pré-comptabilité…</p>
    );
  const { settings, rates, accounts } = state;
  const accountOptions = accounts.map((a) => ({
    value: a.code,
    label: `${a.code} · ${a.label}`,
  }));
  const configured = state.products.filter((p) => {
    const c = state.categories.find((x) => x.category === p.category);
    return (
      (p.onsite_rate_id || c?.onsite_rate_id) &&
      (p.takeaway_rate_id || c?.takeaway_rate_id)
    );
  }).length;
  const editSettings = () =>
    setEditor({
      title: "Régime de TVA et comptes",
      fields: [
        {
          name: "vatRegime",
          label: "Régime de TVA de l’établissement",
          value: settings.vat_regime,
          options: Object.entries(regimes).map(([value, label]) => ({
            value,
            label,
          })),
        },
        {
          name: "cashAccount",
          label: "Compte des espèces",
          value: settings.cash_account,
          options: accountOptions,
        },
        {
          name: "cardAccount",
          label: "Compte des cartes",
          value: settings.card_account,
          options: accountOptions,
        },
        {
          name: "otherAccount",
          label: "Compte des autres modes",
          value: settings.other_account,
          options: accountOptions,
        },
        {
          name: "salesAccount",
          label: "Compte de ventes sans TVA (franchise)",
          value: settings.sales_account,
          options: accountOptions,
        },
      ],
      submit: async (v) => {
        const result = await send({ action: "settings", ...v });
        if (result.posted)
          setNotice(`${result.posted} opération(s) comptabilisée(s).`);
      },
    });
  const addRate = () =>
    setEditor({
      title: "Ajouter un taux de TVA",
      fields: [
        { name: "label", label: "Nom", maxLength: 80 },
        {
          name: "ratePercent",
          label: "Taux en %",
          type: "number",
          step: "0.01",
          min: 0,
        },
        {
          name: "salesAccount",
          label: "Compte de ventes",
          options: accountOptions,
        },
        {
          name: "vatAccount",
          label: "Compte de TVA collectée",
          options: accountOptions,
        },
      ],
      submit: async (v) => {
        await send({ action: "rate", ...v });
      },
    });
  const addAccount = () =>
    setEditor({
      title: "Ajouter ou renommer un compte",
      fields: [
        { name: "code", label: "Numéro de compte", maxLength: 10 },
        { name: "label", label: "Libellé", maxLength: 120 },
      ],
      submit: async (v) => {
        await send({ action: "account", ...v });
      },
    });
  const dismiss = (id: string) =>
    setEditor({
      title: "Écarter cette opération",
      fields: [
        {
          name: "note",
          label: "Motif, conservé dans l’historique (10 caractères minimum)",
          maxLength: 300,
        },
      ],
      submit: async (v) => {
        await send({ action: "dismiss", id, note: v.note });
      },
    });
  const reverse = (id: string) =>
    setEditor({
      title: "Contre-passer cette écriture",
      fields: [
        {
          name: "reason",
          label: "Motif (10 caractères minimum)",
          maxLength: 150,
        },
      ],
      submit: async (v) => {
        await send({ action: "reverse", id, reason: v.reason });
      },
    });
  const resolve = (item: ReviewItem) => {
    const assignments = item.items.map((line) => ({
      item: line.id,
      rate: choices[line.id] || line.vat_rate_id || "",
    }));
    if (assignments.some((a) => !a.rate)) {
      setError("Choisissez un taux pour chaque ligne.");
      return;
    }
    void run({ action: "resolve", id: item.id, assignments }, (r) =>
      r.outcome === "posted"
        ? "Opération comptabilisée."
        : "L’opération reste à vérifier.",
    );
  };
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Pré-comptabilité</h2>
          <p>
            À valider par votre expert-comptable. Ce n’est ni une comptabilité
            officielle, ni une caisse certifiée.
          </p>
        </div>
      </div>
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      <div className="metrics">
        <article className="metric card">
          <span>Ventes à vérifier</span>
          <strong>{state.counts.open}</strong>
        </article>
        <article className="metric card">
          <span>Factures à valider</span>
          <strong>{state.counts.invoices}</strong>
        </article>
        <article className="metric card">
          <span>Mouvements à rapprocher</span>
          <strong>{state.counts.bank}</strong>
        </article>
        <article className="metric card">
          <span>Écritures préparées</span>
          <strong>{state.counts.entries}</strong>
        </article>
        <article className="metric card">
          <span>Régime de TVA</span>
          <strong>{regimes[settings.vat_regime]}</strong>
        </article>
        <article className="metric card">
          <span>Produits configurés</span>
          <strong>
            {configured} / {state.products.length}
          </strong>
        </article>
      </div>

      <div className="section-heading">
        <h2>À traiter</h2>
        {settings.vat_regime === "unknown" ? (
          <Button onClick={editSettings}>Déclarer le régime de TVA</Button>
        ) : (
          state.counts.open > 0 && (
            <Button
              disabled={busy}
              onClick={() =>
                run({ action: "applyConfigured" }, (r) =>
                  r.posted
                    ? `${r.posted} opération(s) comptabilisée(s).`
                    : "Aucune opération n’a pu être comptabilisée : vérifiez les produits sans taux.",
                )
              }
            >
              {settings.vat_regime === "franchise"
                ? "Comptabiliser sans TVA les opérations en attente"
                : "Appliquer la TVA configurée aux opérations en attente"}
            </Button>
          )
        )}
      </div>
      {settings.vat_regime === "normal" && state.counts.open > 0 && (
        <p className="note">
          Ce bouton applique le taux actuel de chaque produit à ses ventes
          passées encore sans taux. Vérifiez qu’il était déjà valable à ces
          dates, sinon précisez le taux ligne par ligne.
        </p>
      )}
      {settings.vat_regime === "franchise" && state.counts.open > 0 && (
        <p className="note">
          Ce bouton comptabilise sans TVA toutes les ventes en attente. Ne
          l’utilisez que si l’établissement était déjà en franchise à ces dates.
        </p>
      )}
      {state.counts.open > state.review.length && (
        <p className="note">
          Les {state.review.length} opérations les plus récentes sur{" "}
          {state.counts.open} sont affichées.
        </p>
      )}
      <div className="card table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Montant</th>
              <th>Point à vérifier</th>
              <th>Lignes vendues et TVA</th>
              <th>Décision</th>
            </tr>
          </thead>
          <tbody>
            {state.review.map((item) => (
              <tr key={item.id}>
                <td>{dateTime(item.occurred_at)}</td>
                <td>
                  {money(item.amount)}
                  <br />
                  <small>
                    {methods[item.method]}
                    {item.discount > 0
                      ? ` · remise ${money(item.discount)}`
                      : ""}
                  </small>
                </td>
                <td>{item.message}</td>
                <td>
                  {item.items.map((line) => (
                    <label key={line.id} style={{ display: "block" }}>
                      {line.quantity} × {line.name} ·{" "}
                      {money(line.price * line.quantity)}{" "}
                      {item.kind !== "amount_mismatch" &&
                        settings.vat_regime === "normal" && (
                          <select
                            aria-label={`Taux de TVA de ${line.name}`}
                            value={choices[line.id] || line.vat_rate_id || ""}
                            onChange={(e) =>
                              setChoices((c) => ({
                                ...c,
                                [line.id]: e.target.value,
                              }))
                            }
                          >
                            <option value="">Taux à préciser</option>
                            {rates.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                        )}
                    </label>
                  ))}
                </td>
                <td>
                  {item.kind !== "amount_mismatch" &&
                    settings.vat_regime === "normal" && (
                      <Button disabled={busy} onClick={() => resolve(item)}>
                        Valider
                      </Button>
                    )}{" "}
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => dismiss(item.id)}
                  >
                    Écarter
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!state.review.length && (
          <p className="empty">Rien à vérifier pour le moment.</p>
        )}
      </div>

      <div className="section-heading">
        <h2>TVA par catégorie</h2>
      </div>
      <p className="note">
        Le taux d’une catégorie s’applique à tous ses produits, sauf ceux qui
        ont leur propre taux ci-dessous. Vous restez responsable du taux choisi
        et de votre déclaration de TVA.
      </p>
      <div className="card table-scroll">
        <table>
          <thead>
            <tr>
              <th>Catégorie</th>
              <th>Produits</th>
              <th>Sur place</th>
              <th>À emporter</th>
            </tr>
          </thead>
          <tbody>
            {state.categories.map((c) => {
              const select = (
                field: "onsite_rate_id" | "takeaway_rate_id",
                label: string,
              ) => (
                <select
                  aria-label={`${label} : ${c.category}`}
                  disabled={busy}
                  value={c[field] ?? ""}
                  onChange={(e) => {
                    const next = { ...c, [field]: e.target.value || null };
                    void run({
                      action: "categoryVat",
                      category: c.category,
                      onsite: next.onsite_rate_id,
                      takeaway: next.takeaway_rate_id,
                    });
                  }}
                >
                  <option value="">À préciser</option>
                  {rates.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              );
              return (
                <tr key={c.category}>
                  <td>{c.category}</td>
                  <td>{c.products}</td>
                  <td>{select("onsite_rate_id", "TVA sur place")}</td>
                  <td>{select("takeaway_rate_id", "TVA à emporter")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="section-heading">
        <h2>Calcul de la TVA collectée</h2>
      </div>
      <p className="note">
        Calcul à partir des écritures préparées, pour vous aider à déclarer. La
        déclaration et le paiement de la TVA restent à votre charge.
      </p>
      <div className="card table-scroll">
        <table>
          <thead>
            <tr>
              <th>Mois</th>
              <th>Taux</th>
              <th>Base HT</th>
              <th>TVA collectée</th>
            </tr>
          </thead>
          <tbody>
            {state.vatSummary.map((v) => (
              <tr key={`${v.month}-${v.label}`}>
                <td>{v.month}</td>
                <td>{v.label}</td>
                <td>{money(Number(v.net))}</td>
                <td>{money(Number(v.vat))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!state.vatSummary.length && (
          <p className="empty">Aucune vente comptabilisée pour le moment.</p>
        )}
      </div>

      <div className="section-heading">
        <h2>TVA par produit</h2>
        <Button variant="secondary" onClick={editSettings}>
          Régime et comptes
        </Button>
      </div>
      <p className="note">
        Le taux dépend du produit et du mode de consommation : c’est à vous, ou
        à votre expert-comptable, de le choisir. Aucun taux n’est déduit
        automatiquement. Il s’applique aux prochaines ventes, et un taux de
        produit prime sur celui de sa catégorie.
      </p>
      <div className="card table-scroll">
        <table>
          <thead>
            <tr>
              <th>Produit</th>
              <th>Catégorie</th>
              <th>Sur place</th>
              <th>À emporter</th>
            </tr>
          </thead>
          <tbody>
            {state.products.map((p) => {
              const select = (
                field: "onsite_rate_id" | "takeaway_rate_id",
                label: string,
              ) => (
                <select
                  aria-label={`${label} : ${p.name}`}
                  disabled={busy}
                  value={p[field] ?? ""}
                  onChange={(e) => {
                    const next = { ...p, [field]: e.target.value || null };
                    void run({
                      action: "productVat",
                      menu: p.id,
                      onsite: next.onsite_rate_id,
                      takeaway: next.takeaway_rate_id,
                    });
                  }}
                >
                  <option value="">Selon la catégorie</option>
                  {rates.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              );
              return (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.category}</td>
                  <td>{select("onsite_rate_id", "TVA sur place")}</td>
                  <td>{select("takeaway_rate_id", "TVA à emporter")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!state.products.length && (
          <p className="empty">Aucun produit au catalogue.</p>
        )}
      </div>

      <div className="section-heading">
        <h2>Taux et comptes</h2>
        <div>
          <Button variant="secondary" onClick={addAccount}>
            Ajouter un compte
          </Button>{" "}
          <Button variant="secondary" onClick={addRate}>
            Ajouter un taux
          </Button>
        </div>
      </div>
      <div className="card table-scroll">
        <table>
          <thead>
            <tr>
              <th>Taux</th>
              <th>Compte de ventes</th>
              <th>Compte de TVA</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.id}>
                <td>{r.label}</td>
                <td>{r.sales_account}</td>
                <td>{r.vat_account}</td>
                <td>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => run({ action: "archiveRate", id: r.id })}
                  >
                    Archiver
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-heading">
        <h2>Journal des écritures</h2>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() =>
            run({ action: "verify" }, (r) =>
              r.chain?.broken_at
                ? `Anomalie détectée à l’écriture n° ${r.chain.broken_at}.`
                : `Journal intègre : ${r.chain?.checked ?? 0} écriture(s) contrôlée(s).`,
            )
          }
        >
          Vérifier l’intégrité
        </Button>
      </div>
      <div className="card table-scroll">
        <table>
          <thead>
            <tr>
              <th>N°</th>
              <th>Date</th>
              <th>Libellé</th>
              <th>Compte</th>
              <th>Débit</th>
              <th>Crédit</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {state.entries.flatMap((entry) =>
              entry.lines.map((line, n) => (
                <tr key={`${entry.id}-${line.line_no}`}>
                  <td>{n === 0 ? entry.number : ""}</td>
                  <td>{n === 0 ? entry.entry_date : ""}</td>
                  <td>{n === 0 ? entry.label : line.label}</td>
                  <td>{line.account_code}</td>
                  <td>{line.debit > 0 ? money(line.debit) : ""}</td>
                  <td>{line.credit > 0 ? money(line.credit) : ""}</td>
                  <td>
                    {n === 0 &&
                      entry.kind === "sale_payment" &&
                      !entry.reversed && (
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() => reverse(entry.id)}
                        >
                          Contre-passer
                        </Button>
                      )}
                    {n === 0 && entry.reversed && <small>Contre-passée</small>}
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
        {!state.entries.length && (
          <p className="empty">Aucune écriture pour le moment.</p>
        )}
      </div>
      {editor && (
        <Modal title={editor.title} close={() => setEditor(null)}>
          <Form
            fields={editor.fields}
            onSubmit={async (values) => {
              await editor.submit(values);
              setEditor(null);
            }}
          />
        </Modal>
      )}
    </>
  );
}
