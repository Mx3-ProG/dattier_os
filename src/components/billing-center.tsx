"use client";
import { useCallback, useEffect, useState } from "react";
import { money } from "@/lib/domain";
import { Form, Modal, type Field } from "./forms";
import { Button } from "./ui/button";

type Line = {
  line_no: number;
  label: string;
  quantity: number;
  unit_gross: number;
  line_gross: number;
  rate_bp: number;
};
type Invoice = {
  id: string;
  kind: "invoice" | "credit_note";
  number: string | null;
  status: "draft" | "issued" | "paid";
  customer_name: string;
  issue_date: string | null;
  due_date: string | null;
  gross: number;
  due: number;
  source_payment_id: string | null;
  lines: Line[];
};
type State = {
  company: {
    legal_name: string;
    legal_form: string;
    address: string;
    siren: string;
    vat_number: string | null;
    share_capital: string;
    rcs: string;
    payment_days: number;
    late_penalty: string;
  } | null;
  regime: string;
  rates: { id: string; label: string; rate_bp: number }[];
  invoices: Invoice[];
  payments: { id: string; amount: number; method: string; day: string }[];
};
type Editor = {
  title: string;
  fields: Field[];
  submit: (values: Record<string, string>) => Promise<void>;
};
const defaultPenalty =
  "En cas de retard de paiement : pénalités au taux de trois fois le taux d’intérêt légal, et indemnité forfaitaire de 40 € pour frais de recouvrement.";
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(
    new Date(),
  );
/** « 12,50 » en centimes. Une saisie illisible est refusée. */
function toCents(value: string) {
  const clean = value.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(clean))
    throw new Error(`Montant invalide : ${value || "vide"}.`);
  return Math.round(Number(clean) * 100);
}
const customerFields: Field[] = [
  { name: "customerName", label: "Client", maxLength: 200 },
  {
    name: "isBusiness",
    label: "Type de client",
    value: "no",
    options: [
      { value: "no", label: "Particulier" },
      { value: "yes", label: "Professionnel" },
    ],
  },
  {
    name: "customerAddress",
    label: "Adresse (requise pour un professionnel)",
    maxLength: 300,
    required: false,
  },
  {
    name: "customerSiren",
    label: "SIREN (requis pour un professionnel)",
    maxLength: 9,
    required: false,
  },
  {
    name: "customerVat",
    label: "N° de TVA du client (facultatif)",
    maxLength: 40,
    required: false,
  },
  {
    name: "note",
    label: "Mention libre (facultatif)",
    maxLength: 500,
    required: false,
  },
];
const customerOf = (v: Record<string, string>) => ({
  customerName: v.customerName,
  isBusiness: v.isBusiness === "yes",
  customerAddress: v.customerAddress || "",
  customerSiren: v.customerSiren || null,
  customerVat: v.customerVat || null,
  note: v.note || "",
});

export function BillingCenter({ restaurant }: { restaurant: string }) {
  const [state, setState] = useState<State | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [from, setFrom] = useState(`${today().slice(0, 4)}-01-01`),
    [to, setTo] = useState(today()),
    [editor, setEditor] = useState<Editor | null>(null);
  const base = `/api/restaurants/${encodeURIComponent(restaurant)}`;
  const url = `${base}/billing`;
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
    return body;
  };
  const run = async (action: Record<string, unknown>, done?: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const body = await send(action);
      if (done) setNotice(body.number ? `${done} ${body.number}.` : done);
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
      <p>Chargement des factures…</p>
    );
  const c = state.company;
  const editCompany = () =>
    setEditor({
      title: "Identité de facturation",
      fields: [
        {
          name: "legalName",
          label: "Raison sociale",
          value: c?.legal_name ?? "",
          maxLength: 200,
        },
        {
          name: "legalForm",
          label: "Forme juridique",
          value: c?.legal_form ?? "",
          maxLength: 60,
          required: false,
        },
        {
          name: "address",
          label: "Adresse du siège",
          value: c?.address ?? "",
          maxLength: 300,
        },
        {
          name: "siren",
          label: "SIREN (9 chiffres)",
          value: c?.siren ?? "",
          maxLength: 9,
        },
        {
          name: "vatNumber",
          label: "N° de TVA intracommunautaire",
          value: c?.vat_number ?? "",
          maxLength: 40,
          required: false,
        },
        {
          name: "shareCapital",
          label: "Capital social (société)",
          value: c?.share_capital ?? "",
          maxLength: 60,
          required: false,
        },
        {
          name: "rcs",
          label: "RCS (ville et numéro)",
          value: c?.rcs ?? "",
          maxLength: 100,
          required: false,
        },
        {
          name: "paymentDays",
          label: "Délai de paiement en jours",
          type: "number",
          min: 0,
          value: c?.payment_days ?? 30,
        },
        {
          name: "latePenalty",
          label: "Pénalités de retard (clients professionnels)",
          value: c?.late_penalty ?? defaultPenalty,
          maxLength: 500,
        },
      ],
      submit: async (v) => {
        await send({
          action: "company",
          legalName: v.legalName,
          legalForm: v.legalForm,
          address: v.address,
          siren: v.siren,
          vatNumber: v.vatNumber || null,
          shareCapital: v.shareCapital,
          rcs: v.rcs,
          paymentDays: Number(v.paymentDays),
          latePenalty: v.latePenalty,
        });
      },
    });
  const fromPayment = (p: State["payments"][number]) =>
    setEditor({
      title: `Facturer la vente de ${money(p.amount)}`,
      fields: customerFields,
      submit: async (v) => {
        const body = await send({
          action: "fromPayment",
          paymentId: p.id,
          ...customerOf(v),
        });
        setNotice(`Facture émise : ${body.number}.`);
      },
    });
  const manual = () =>
    setEditor({
      title: "Nouvelle facture (brouillon)",
      fields: [
        ...customerFields,
        {
          name: "serviceDate",
          label: "Date de la vente ou de la prestation",
          type: "date",
          value: today(),
        },
        { name: "label", label: "Désignation", maxLength: 300 },
        { name: "quantity", label: "Quantité", value: "1" },
        { name: "unit", label: "Prix unitaire TTC en euros" },
        ...(state.regime === "normal"
          ? [
              {
                name: "rate",
                label: "Taux de TVA",
                options: state.rates.map((r) => ({
                  value: r.id,
                  label: r.label,
                })),
              } as Field,
            ]
          : []),
      ],
      submit: async (v) => {
        await send({
          action: "draft",
          ...customerOf(v),
          serviceDate: v.serviceDate,
          lines: [
            {
              label: v.label,
              quantity: Number(v.quantity.replace(",", ".")),
              unitGross: toCents(v.unit),
              rateId: v.rate || null,
            },
          ],
        });
      },
    });
  const pay = (i: Invoice) =>
    setEditor({
      title:
        i.kind === "invoice"
          ? "Enregistrer un règlement"
          : "Enregistrer un remboursement",
      fields: [
        {
          name: "amount",
          label: "Montant en euros",
          value: (i.due / 100).toFixed(2),
        },
        { name: "paidOn", label: "Date", type: "date", value: today() },
        {
          name: "method",
          label: "Mode",
          value: "bank",
          options: [
            { value: "bank", label: "Virement" },
            { value: "card", label: "Carte" },
            { value: "cash", label: "Espèces" },
          ],
        },
      ],
      submit: async (v) => {
        await send({
          action: "pay",
          id: i.id,
          amount: toCents(v.amount),
          paidOn: v.paidOn,
          method: v.method,
        });
      },
    });
  const credit = (i: Invoice) =>
    setEditor({
      title: `Avoir sur ${i.number}`,
      fields: [
        ...i.lines
          .filter((l) => l.line_gross > 0)
          .map((l): Field => ({
            name: `line${l.line_no}`,
            label: `${l.label} : quantité à créditer (sur ${l.quantity})`,
            value: "0",
            required: false,
          })),
        {
          name: "all",
          label: "Portée",
          value: "all",
          options: [
            { value: "all", label: "Toute la facture" },
            { value: "lines", label: "Seulement les quantités ci-dessus" },
          ],
        },
        {
          name: "note",
          label: "Motif (facultatif)",
          maxLength: 500,
          required: false,
        },
      ],
      submit: async (v) => {
        const lines =
          v.all === "all"
            ? null
            : i.lines
                .map((l) => ({
                  line: l.line_no,
                  quantity: Number(
                    (v[`line${l.line_no}`] || "0").replace(",", "."),
                  ),
                }))
                .filter((l) => l.quantity > 0);
        if (lines && !lines.length)
          throw new Error("Indiquez au moins une quantité à créditer.");
        const body = await send({
          action: "credit",
          id: i.id,
          note: v.note || "",
          lines,
        });
        setNotice(
          body.toRefund > 0
            ? `Avoir émis : ${body.number}. ${money(body.toRefund)} restent à rembourser au client.`
            : `Avoir émis : ${body.number}.`,
        );
      },
    });
  const statusLabel = (i: Invoice) =>
    i.status === "draft"
      ? "Brouillon"
      : i.kind === "credit_note"
        ? i.due > 0
          ? "À rembourser"
          : "Soldé"
        : i.status === "paid"
          ? "Payée"
          : `Reste ${money(i.due)}`;
  const fecUrl = `${base}/finance/fec?from=${from}&to=${to}`;
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Factures clients</h2>
          <p>
            Une facture émise ne se modifie plus : elle se corrige par un avoir.
            Le PDF n’est pas une facture électronique : la transmission
            officielle passera par une plateforme agréée.
          </p>
        </div>
        <div>
          <Button variant="secondary" disabled={busy} onClick={editCompany}>
            Identité de facturation
          </Button>{" "}
          <Button disabled={busy} onClick={manual}>
            Nouvelle facture
          </Button>
        </div>
      </div>
      {!c && (
        <p className="note" role="status">
          Renseignez d’abord l’identité de votre établissement : elle figure sur
          chaque facture.
        </p>
      )}
      {state.regime === "unknown" && (
        <p className="note" role="status">
          Déclarez votre régime de TVA dans « Opérations à vérifier » pour
          pouvoir facturer.
        </p>
      )}
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
      <div className="card table-scroll">
        <table>
          <thead>
            <tr>
              <th>N°</th>
              <th>Client</th>
              <th>Émise le</th>
              <th>Échéance</th>
              <th>TTC</th>
              <th>État</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {state.invoices.map((i) => (
              <tr key={i.id}>
                <td>
                  {i.number ?? "—"}
                  {i.kind === "credit_note" && (
                    <>
                      <br />
                      <small>Avoir</small>
                    </>
                  )}
                </td>
                <td>{i.customer_name}</td>
                <td>{i.issue_date ?? "—"}</td>
                <td>{i.due_date ?? "—"}</td>
                <td>{money(i.gross)}</td>
                <td>{statusLabel(i)}</td>
                <td>
                  {i.status === "draft" ? (
                    <>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          run({ action: "issue", id: i.id }, "Facture émise :")
                        }
                      >
                        Émettre
                      </Button>{" "}
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => run({ action: "discard", id: i.id })}
                      >
                        Abandonner
                      </Button>
                    </>
                  ) : (
                    <>
                      <a href={`${url}/${i.id}/pdf`}>PDF</a>
                      {" · "}
                      <a href={`${url}/${i.id}/xml`}>XML</a>{" "}
                      {i.due > 0 && (
                        <Button disabled={busy} onClick={() => pay(i)}>
                          {i.kind === "invoice" ? "Règlement" : "Rembourser"}
                        </Button>
                      )}{" "}
                      {i.kind === "invoice" && (
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() => credit(i)}
                        >
                          Avoir
                        </Button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!state.invoices.length && (
          <p className="empty">Aucune facture pour le moment.</p>
        )}
      </div>

      <div className="section-heading">
        <h2>Ventes encaissées sans facture</h2>
      </div>
      <p className="note">
        La vente est déjà comptabilisée : la facture la documente sans créer de
        seconde écriture. Sa TVA doit être précisée.
      </p>
      <div className="card table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Montant</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {state.payments.map((p) => (
              <tr key={p.id}>
                <td>{p.day}</td>
                <td>{money(p.amount)}</td>
                <td>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => fromPayment(p)}
                  >
                    Facturer
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!state.payments.length && (
          <p className="empty">Aucune vente en attente.</p>
        )}
      </div>

      <div className="section-heading">
        <div>
          <h2>Export pour l’expert-comptable</h2>
          <p>
            Écritures de la période aux colonnes du FEC. Ce fichier est à
            contrôler et à reprendre dans le logiciel comptable : il ne vaut pas
            FEC officiel.
          </p>
        </div>
        <div>
          <label>
            Du{" "}
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>{" "}
          <label>
            au{" "}
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>{" "}
          <a className="btn secondary" href={fecUrl}>
            Exporter
          </a>
        </div>
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
