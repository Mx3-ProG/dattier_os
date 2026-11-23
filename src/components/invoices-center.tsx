"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { money } from "@/domain/shared/units";
import { Form, Modal, type Field } from "./forms";
import { Button } from "./ui/button";

type Issue = { level: "blocking" | "warning"; message: string };
type Invoice = {
  id: string;
  supplier_name: string | null;
  supplier_vat: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  net: number | null;
  vat: number | null;
  gross: number | null;
  category: string | null;
  source: "facturx" | "xml" | "ai" | "manual";
  uncertain: string[];
  status: "to_review" | "validated" | "paid" | "cancelled";
  paid_on: string | null;
  filename: string;
  issues: Issue[];
};
type State = {
  aiEnabled: boolean;
  vatRegime: string;
  categories: { id: string; label: string }[];
  invoices: Invoice[];
};
type Editor = {
  title: string;
  fields: Field[];
  submit: (values: Record<string, string>) => Promise<void>;
};
const sources = {
  facturx: "Facture électronique",
  xml: "Facture électronique",
  ai: "Lue par l’IA",
  manual: "Saisie manuelle",
};
const statuses = {
  to_review: "À valider",
  validated: "À régler",
  paid: "Réglée",
  cancelled: "Annulée",
};
const euros = (cents: number | null) =>
  cents === null ? "" : (cents / 100).toFixed(2);
/** « 12,50 » ou « 12.50 » en centimes. Une saisie illisible est refusée. */
function toCents(value: string) {
  const clean = value.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(clean))
    throw new Error(`Montant invalide : ${value || "vide"}.`);
  return Math.round(Number(clean) * 100);
}
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(
    new Date(),
  );

export function InvoicesCenter({ restaurant }: { restaurant: string }) {
  const [state, setState] = useState<State | null>(null),
    [error, setError] = useState(""),
    [results, setResults] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [editor, setEditor] = useState<Editor | null>(null);
  const files = useRef<HTMLInputElement>(null),
    camera = useRef<HTMLInputElement>(null);
  const url = `/api/restaurants/${encodeURIComponent(restaurant)}/invoices`;
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
  };
  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    setError("");
    const lines: string[] = [];
    for (const file of Array.from(list)) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "x-filename": encodeURIComponent(file.name),
          },
          body: file,
        });
        const body = await response.json();
        lines.push(
          `${file.name} : ${response.ok ? body.message : body.error?.message || "échec du dépôt."}`,
        );
      } catch {
        lines.push(`${file.name} : échec du dépôt.`);
      }
      setResults([...lines]);
    }
    await load().catch((e: Error) => setError(e.message));
    setBusy(false);
    if (files.current) files.current.value = "";
    if (camera.current) camera.current.value = "";
  };
  if (!state)
    return error ? (
      <p className="note" role="alert">
        {error}
      </p>
    ) : (
      <p>Chargement des factures…</p>
    );
  const validate = (i: Invoice) =>
    setEditor({
      title: "Vérifier et valider",
      fields: [
        {
          name: "supplierName",
          label: "Fournisseur",
          value: i.supplier_name ?? "",
          maxLength: 200,
        },
        {
          name: "supplierVat",
          label: "N° de TVA du fournisseur (facultatif)",
          value: i.supplier_vat ?? "",
          maxLength: 40,
          required: false,
        },
        {
          name: "number",
          label: "Numéro de facture",
          value: i.invoice_number ?? "",
          maxLength: 80,
        },
        {
          name: "invoiceDate",
          label: "Date de facture",
          type: "date",
          value: i.invoice_date ?? "",
        },
        {
          name: "dueDate",
          label: "Échéance (facultatif)",
          type: "date",
          value: i.due_date ?? "",
          required: false,
        },
        { name: "net", label: "Total HT en euros", value: euros(i.net) },
        { name: "vat", label: "TVA en euros", value: euros(i.vat) },
        { name: "gross", label: "Total TTC en euros", value: euros(i.gross) },
        {
          name: "category",
          label: "Catégorie de dépense",
          value: i.category ?? "other",
          options: state.categories.map((c) => ({
            value: c.id,
            label: c.label,
          })),
        },
      ],
      submit: async (v) => {
        await send({
          action: "validate",
          id: i.id,
          supplierName: v.supplierName,
          supplierVat: v.supplierVat || null,
          number: v.number,
          invoiceDate: v.invoiceDate,
          dueDate: v.dueDate || null,
          net: toCents(v.net),
          vat: toCents(v.vat),
          gross: toCents(v.gross),
          category: v.category,
        });
      },
    });
  const pay = (i: Invoice) =>
    setEditor({
      title: "Marquer comme réglée",
      fields: [
        {
          name: "paidOn",
          label: "Date du règlement",
          type: "date",
          value: today(),
        },
        {
          name: "method",
          label: "Mode",
          value: "bank",
          options: [
            { value: "bank", label: "Virement ou prélèvement" },
            { value: "card", label: "Carte" },
            { value: "cash", label: "Espèces" },
          ],
        },
      ],
      submit: async (v) => {
        await send({
          action: "pay",
          id: i.id,
          paidOn: v.paidOn,
          method: v.method,
        });
      },
    });
  const cancel = (i: Invoice) =>
    setEditor({
      title: "Annuler cette facture",
      fields: [
        {
          name: "reason",
          label: "Motif, conservé dans l’historique (10 caractères minimum)",
          maxLength: 200,
        },
      ],
      submit: async (v) => {
        await send({ action: "cancel", id: i.id, reason: v.reason });
      },
    });
  const pending = state.invoices.filter((i) => i.status === "to_review");
  const others = state.invoices.filter((i) => i.status !== "to_review");
  const documentLink = (i: Invoice) => (
    <a
      href={`${url}/${encodeURIComponent(i.id)}`}
      target="_blank"
      rel="noreferrer"
    >
      {i.filename}
    </a>
  );
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Déposer des factures</h2>
          <p>
            Photo, PDF ou facture électronique, plusieurs à la fois. Rien n’est
            comptabilisé avant votre validation, et chaque fichier reste archivé
            tel quel.
          </p>
        </div>
        <div>
          <input
            ref={files}
            type="file"
            multiple
            hidden
            accept="application/pdf,image/jpeg,image/png,image/webp,.xml"
            onChange={(e) => void upload(e.target.files)}
          />
          <input
            ref={camera}
            type="file"
            hidden
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={(e) => void upload(e.target.files)}
          />
          <Button disabled={busy} onClick={() => files.current?.click()}>
            {busy ? "Dépôt en cours…" : "Choisir des fichiers"}
          </Button>{" "}
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => camera.current?.click()}
          >
            Photographier
          </Button>
        </div>
      </div>
      {!state.aiEnabled && (
        <p className="note" role="status">
          La lecture automatique des photos et des PDF simples n’est pas activée
          sur cette installation : ils seront à saisir. Les factures
          électroniques sont lues normalement.
        </p>
      )}
      {state.vatRegime === "unknown" && (
        <p className="note" role="status">
          Déclarez votre régime de TVA dans « Opérations à vérifier » pour
          pouvoir valider vos factures.
        </p>
      )}
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      {results.length > 0 && (
        <ul className="note" role="status">
          {results.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      <div className="section-heading">
        <h2>À valider ({pending.length})</h2>
      </div>
      <div className="card table-scroll">
        <table>
          <thead>
            <tr>
              <th>Document</th>
              <th>Fournisseur</th>
              <th>N°</th>
              <th>TTC</th>
              <th>À vérifier</th>
              <th>Décision</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((i) => (
              <tr key={i.id}>
                <td>
                  {documentLink(i)}
                  <br />
                  <small>{sources[i.source]}</small>
                </td>
                <td>{i.supplier_name ?? "—"}</td>
                <td>{i.invoice_number ?? "—"}</td>
                <td>{i.gross === null ? "—" : money(i.gross)}</td>
                <td>
                  {i.issues.map((issue) => (
                    <div key={issue.message}>
                      <b>
                        {issue.level === "blocking"
                          ? "À corriger"
                          : "Attention"}{" "}
                        :
                      </b>{" "}
                      {issue.message}
                    </div>
                  ))}
                  {i.uncertain.length > 0 && (
                    <div>
                      <b>Lecture douteuse :</b> {i.uncertain.join(", ")}
                    </div>
                  )}
                  {!i.issues.length &&
                    !i.uncertain.length &&
                    "Contrôles passés"}
                </td>
                <td>
                  <Button disabled={busy} onClick={() => validate(i)}>
                    Vérifier
                  </Button>{" "}
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => cancel(i)}
                  >
                    Écarter
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!pending.length && <p className="empty">Aucune facture à valider.</p>}
      </div>

      <div className="section-heading">
        <h2>Factures traitées</h2>
      </div>
      <div className="card table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Fournisseur</th>
              <th>N°</th>
              <th>HT</th>
              <th>TVA</th>
              <th>TTC</th>
              <th>Échéance</th>
              <th>État</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {others.map((i) => (
              <tr key={i.id}>
                <td>{i.invoice_date ?? "—"}</td>
                <td>
                  {i.supplier_name ?? "—"}
                  <br />
                  <small>{documentLink(i)}</small>
                </td>
                <td>{i.invoice_number ?? "—"}</td>
                <td>{i.net === null ? "—" : money(i.net)}</td>
                <td>{i.vat === null ? "—" : money(i.vat)}</td>
                <td>{i.gross === null ? "—" : money(i.gross)}</td>
                <td>{i.due_date ?? "—"}</td>
                <td>{statuses[i.status]}</td>
                <td>
                  {i.status === "validated" && (
                    <Button disabled={busy} onClick={() => pay(i)}>
                      Réglée
                    </Button>
                  )}{" "}
                  {i.status !== "cancelled" ? (
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => cancel(i)}
                    >
                      Annuler
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        send({ action: "reopen", id: i.id }).catch((e: Error) =>
                          setError(e.message),
                        )
                      }
                    >
                      Reprendre
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!others.length && <p className="empty">Aucune facture traitée.</p>}
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
