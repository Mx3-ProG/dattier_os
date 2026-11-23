"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { money } from "@/domain/shared/units";
import { Form, Modal, type Field } from "./forms";
import { Button } from "./ui/button";

type Candidate = {
  kind: string;
  targets: string[];
  label: string;
  difference: number;
  confidence: "high" | "medium";
};
type Movement = {
  id: string;
  booked_on: string;
  amount: number;
  label: string;
  status: string;
  note: string | null;
};
type State = {
  autoMatch: boolean;
  accounts: {
    id: string;
    label: string;
    balance: number | null;
    asOf: string | null;
  }[];
  toReview: number;
  open: (Movement & { duplicate: boolean; candidates: Candidate[] })[];
  recent: (Movement & {
    match_id: string | null;
    match_label: string | null;
    difference: number | null;
  })[];
};
type Editor = {
  title: string;
  fields: Field[];
  submit: (values: Record<string, string>) => Promise<void>;
};
/** « 12,50 » ou « -12.50 » en centimes. Une saisie illisible est refusée. */
function toCents(value: string) {
  const clean = value.replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(clean))
    throw new Error(`Montant invalide : ${value}.`);
  return Math.round(Number(clean) * 100);
}

export function BankCenter({ restaurant }: { restaurant: string }) {
  const [state, setState] = useState<State | null>(null),
    [account, setAccount] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [editor, setEditor] = useState<Editor | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const url = `/api/restaurants/${encodeURIComponent(restaurant)}/bank`;
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
      await send(action);
      if (done) setNotice(done);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const upload = async (list: FileList | null, target: string) => {
    const chosen = list?.[0];
    if (!chosen) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "x-account": target,
          "x-filename": encodeURIComponent(chosen.name),
        },
        body: chosen,
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.message || "Import impossible.");
      setNotice(
        body.duplicateFile
          ? "Ce relevé a déjà été importé."
          : [
              `${body.added} mouvement(s) ajouté(s), ${body.skipped} déjà connu(s).`,
              body.matched
                ? `${body.matched} rapproché(s) automatiquement.`
                : "",
              body.balanceWarning ?? "",
            ]
              .filter(Boolean)
              .join(" "),
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  };
  if (!state)
    return error ? (
      <p className="note" role="alert">
        {error}
      </p>
    ) : (
      <p>Chargement de la banque…</p>
    );
  const target = account || state.accounts[0]?.id || "";
  const addAccount = () =>
    setEditor({
      title: "Ajouter un compte bancaire",
      fields: [
        { name: "label", label: "Nom du compte", maxLength: 80 },
        {
          name: "opening",
          label: "Solde de départ en euros (facultatif)",
          required: false,
        },
        {
          name: "date",
          label: "Date de ce solde (facultatif)",
          type: "date",
          required: false,
        },
      ],
      submit: async (v) => {
        const created = await send({
          action: "account",
          label: v.label,
          openingBalance: v.opening ? toCents(v.opening) : null,
          openingDate: v.date || null,
        });
        setAccount(created.id);
      },
    });
  const ignore = (id: string) =>
    setEditor({
      title: "Écarter ce mouvement",
      fields: [
        {
          name: "note",
          label: "Motif, conservé dans l’historique (5 caractères minimum)",
          maxLength: 200,
        },
      ],
      submit: async (v) => {
        await send({ action: "ignore", id, note: v.note });
      },
    });
  const undo = (id: string) =>
    setEditor({
      title: "Annuler ce rapprochement",
      fields: [
        {
          name: "reason",
          label: "Motif (10 caractères minimum)",
          maxLength: 150,
        },
      ],
      submit: async (v) => {
        await send({ action: "undo", id, reason: v.reason });
      },
    });
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Comptes et relevés</h2>
          <p>
            Importez un relevé CSV, OFX ou CAMT.053 téléchargé depuis votre
            banque. Un même mouvement n’entre jamais deux fois.
          </p>
        </div>
        <div>
          <input
            ref={file}
            type="file"
            hidden
            accept=".csv,.txt,.ofx,.qfx,.xml"
            onChange={(e) => void upload(e.target.files, target)}
          />
          <Button variant="secondary" disabled={busy} onClick={addAccount}>
            Ajouter un compte
          </Button>{" "}
          <Button
            disabled={busy || !target}
            onClick={() => file.current?.click()}
          >
            Importer un relevé
          </Button>
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
        {state.accounts.map((a) => (
          <article className="metric card" key={a.id}>
            <span>{a.label}</span>
            <strong>{a.balance === null ? "—" : money(a.balance)}</strong>
            <small>
              {a.balance === null
                ? "Solde inconnu : indiquez un solde de départ ou importez un relevé qui le contient."
                : `Au ${a.asOf ?? "—"}`}
            </small>
            {state.accounts.length > 1 && (
              <Button
                variant={target === a.id ? "default" : "ghost"}
                aria-pressed={target === a.id}
                onClick={() => setAccount(a.id)}
              >
                {target === a.id ? "Compte d’import" : "Importer ici"}
              </Button>
            )}
          </article>
        ))}
        {!state.accounts.length && (
          <p className="empty">Ajoutez d’abord un compte bancaire.</p>
        )}
      </div>

      <div className="section-heading">
        <h2>À rapprocher ({state.toReview})</h2>
        <label>
          <input
            type="checkbox"
            checked={state.autoMatch}
            disabled={busy}
            onChange={(e) =>
              run({ action: "autoMatch", enabled: e.target.checked })
            }
          />{" "}
          Rapprocher seul les cas sans ambiguïté
        </label>
      </div>
      <p className="note">
        Rien n’est inventé : un mouvement sans correspondance reste ici jusqu’à
        votre décision. Aucune vente ni facture n’est créée pour le justifier.
      </p>
      <div className="card table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Libellé</th>
              <th>Montant</th>
              <th>Correspondances possibles</th>
              <th>Décision</th>
            </tr>
          </thead>
          <tbody>
            {state.open.map((t) => (
              <tr key={t.id}>
                <td>{t.booked_on}</td>
                <td>
                  {t.label}
                  {t.duplicate && (
                    <>
                      <br />
                      <small>
                        <b>Attention :</b> mouvement très proche d’un autre,
                        doublon possible.
                      </small>
                    </>
                  )}
                </td>
                <td>{money(t.amount)}</td>
                <td>
                  {t.candidates.map((c) => (
                    <div key={`${c.kind}-${c.targets.join()}`}>
                      <Button
                        variant={
                          c.confidence === "high" ? "default" : "secondary"
                        }
                        disabled={busy}
                        onClick={() =>
                          run(
                            {
                              action: "match",
                              id: t.id,
                              kind: c.kind,
                              targets: c.targets,
                            },
                            "Mouvement rapproché.",
                          )
                        }
                      >
                        {c.label}
                      </Button>
                      {c.difference > 0 && (
                        <small> · commission {money(c.difference)}</small>
                      )}
                    </div>
                  ))}
                  {!t.candidates.length && "Aucune correspondance trouvée"}
                </td>
                <td>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => ignore(t.id)}
                  >
                    Écarter
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!state.open.length && (
          <p className="empty">Aucun mouvement à rapprocher.</p>
        )}
      </div>

      <div className="section-heading">
        <h2>Déjà traités</h2>
      </div>
      <div className="card table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Libellé</th>
              <th>Montant</th>
              <th>Traitement</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {state.recent.map((t) => (
              <tr key={t.id}>
                <td>{t.booked_on}</td>
                <td>{t.label}</td>
                <td>{money(t.amount)}</td>
                <td>
                  {t.status === "matched"
                    ? t.match_label
                    : `Écarté : ${t.note ?? ""}`}
                </td>
                <td>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      t.status === "matched"
                        ? undo(t.id)
                        : run({ action: "restore", id: t.id })
                    }
                  >
                    {t.status === "matched" ? "Annuler" : "Reprendre"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!state.recent.length && (
          <p className="empty">Aucun mouvement traité.</p>
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
