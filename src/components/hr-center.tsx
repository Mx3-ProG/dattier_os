"use client";
import { useCallback, useEffect, useState } from "react";
import { dateTime, money } from "@/domain/shared/units";
import { Form, Modal, type Field } from "./forms";
import { Button } from "./ui/button";

type Anomaly = { kind: string; day: string; message: string };
type Employee = {
  profileId: string;
  name: string;
  hasContract: boolean;
  workedMinutes: number;
  complementary: number;
  band1: number;
  band2: number;
  band3: number;
  absenceDays: Record<string, number>;
  anomalies: Anomaly[];
};
type State = {
  month: string;
  canPay: boolean;
  canManage: boolean;
  team: { id: string; name: string }[];
  variables: { employees: Employee[]; rulesConfirmed: boolean };
  entries: {
    id: string;
    name: string;
    event: string;
    created_at: string;
    source: string;
    reason: string | null;
  }[];
  absences: {
    id: string;
    name: string;
    kind: string;
    starts_on: string;
    ends_on: string;
    status: string;
  }[];
  settings: {
    base_minutes: number;
    band1_until: number;
    band2_until: number;
    band1_rate_bp: number;
    band2_rate_bp: number;
    band3_rate_bp: number;
    employer_rate_bp: number | null;
    rules_confirmed: boolean;
  };
  contracts: {
    id: string;
    name: string;
    kind: string;
    weekly_minutes: number;
    hourly_rate: number;
    starts_on: string;
    ends_on: string | null;
  }[];
  cost: {
    gross: number;
    loaded: number | null;
    workedMinutes: number;
    unknownEmployees: string[];
  } | null;
  period: { status: string; closed_at: string } | null;
};
type Editor = {
  title: string;
  fields: Field[];
  submit: (values: Record<string, string>) => Promise<void>;
};
const hours = (m: number) => `${(m / 60).toFixed(2).replace(".", ",")} h`;
const absenceKinds = [
  { value: "paid_leave", label: "Congés payés" },
  { value: "sick", label: "Maladie" },
  { value: "unpaid", label: "Sans solde" },
  { value: "family", label: "Événement familial" },
  { value: "other", label: "Autre" },
];
const kindLabel = (kind: string) =>
  absenceKinds.find((k) => k.value === kind)?.label ?? kind;
const statusLabels: Record<string, string> = {
  requested: "Demandée",
  approved: "Validée",
  rejected: "Refusée",
  cancelled: "Annulée",
};
const events = [
  { value: "start", label: "Prise de poste" },
  { value: "break", label: "Début de pause" },
  { value: "resume", label: "Reprise" },
  { value: "end", label: "Fin de service" },
];
const eventLabel = (e: string) => events.find((x) => x.value === e)?.label ?? e;
/** « 12,50 » en centimes. Une saisie illisible est refusée. */
function number(value: string, what: string) {
  const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
  if (!value.trim() || !Number.isFinite(parsed) || parsed < 0)
    throw new Error(`${what} invalide.`);
  return parsed;
}

export function HrCenter({
  restaurant,
  payrollView,
}: {
  restaurant: string;
  payrollView: boolean;
}) {
  const [state, setState] = useState<State | null>(null),
    [month, setMonth] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [editor, setEditor] = useState<Editor | null>(null);
  const url = `/api/restaurants/${encodeURIComponent(restaurant)}/hr`;
  const load = useCallback(async () => {
    const response = await fetch(month ? `${url}?month=${month}` : url);
    const body = await response.json();
    if (!response.ok)
      throw new Error(body.error?.message || "Accès impossible.");
    setState(body);
    setMonth((m) => m || body.month);
  }, [url, month]);
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
  if (!state)
    return error ? (
      <p className="note" role="alert">
        {error}
      </p>
    ) : (
      <p>Chargement…</p>
    );
  const people = state.team.map((t) => ({ value: t.id, label: t.name }));
  const correct = (profile?: string, day?: string) =>
    setEditor({
      title: "Corriger un pointage",
      fields: [
        {
          name: "profile",
          label: "Collaborateur",
          value: profile ?? "",
          options: people,
        },
        {
          name: "event",
          label: "Pointage à ajouter",
          value: "end",
          options: events,
        },
        {
          name: "at",
          label: "Date et heure",
          type: "datetime-local",
          value: day ? `${day}T23:00` : "",
        },
        {
          name: "reason",
          label: "Motif, conservé dans l’historique (10 caractères minimum)",
          maxLength: 200,
        },
      ],
      submit: async (v) => {
        await send({
          action: "correct",
          profile: v.profile,
          event: v.event,
          at: new Date(v.at).toISOString(),
          reason: v.reason,
        });
      },
    });
  const voidEntry = (entry: string) =>
    setEditor({
      title: "Annuler ce pointage",
      fields: [
        {
          name: "reason",
          label:
            "Motif (10 caractères minimum). Le pointage reste dans l’historique.",
          maxLength: 200,
        },
      ],
      submit: async (v) => {
        await send({ action: "void", entry, reason: v.reason });
      },
    });
  const absence = () =>
    setEditor({
      title: "Enregistrer une absence",
      fields: [
        { name: "profile", label: "Collaborateur", options: people },
        {
          name: "kind",
          label: "Type",
          value: "paid_leave",
          options: absenceKinds,
        },
        { name: "from", label: "Du", type: "date" },
        { name: "to", label: "Au", type: "date" },
      ],
      submit: async (v) => {
        await send({
          action: "absence",
          profile: v.profile,
          kind: v.kind,
          from: v.from,
          to: v.to,
          status: "approved",
        });
      },
    });
  const contract = () =>
    setEditor({
      title: "Enregistrer un contrat",
      fields: [
        { name: "profile", label: "Collaborateur", options: people },
        {
          name: "kind",
          label: "Type",
          value: "cdi",
          options: [
            { value: "cdi", label: "CDI" },
            { value: "cdd", label: "CDD" },
            { value: "extra", label: "Extra" },
            { value: "apprentice", label: "Apprentissage" },
            { value: "other", label: "Autre" },
          ],
        },
        { name: "weekly", label: "Heures par semaine", value: "35" },
        { name: "rate", label: "Taux horaire brut en euros" },
        { name: "from", label: "Début", type: "date" },
        {
          name: "to",
          label: "Fin (facultatif)",
          type: "date",
          required: false,
        },
      ],
      submit: async (v) => {
        await send({
          action: "contract",
          profile: v.profile,
          kind: v.kind,
          weeklyMinutes: Math.round(number(v.weekly, "Durée") * 60),
          hourlyRate: Math.round(number(v.rate, "Taux") * 100),
          from: v.from,
          to: v.to || null,
        });
      },
    });
  const s = state.settings;
  const rules = () =>
    setEditor({
      title: "Règles d’heures supplémentaires",
      fields: [
        {
          name: "base",
          label: "Durée hebdomadaire de base (heures)",
          value: s.base_minutes / 60,
        },
        {
          name: "until1",
          label: "Fin de la 1re tranche (heures)",
          value: s.band1_until / 60,
        },
        {
          name: "rate1",
          label: "Majoration 1re tranche (%)",
          value: s.band1_rate_bp / 100,
        },
        {
          name: "until2",
          label: "Fin de la 2e tranche (heures)",
          value: s.band2_until / 60,
        },
        {
          name: "rate2",
          label: "Majoration 2e tranche (%)",
          value: s.band2_rate_bp / 100,
        },
        {
          name: "rate3",
          label: "Majoration au-delà (%)",
          value: s.band3_rate_bp / 100,
        },
        {
          name: "employer",
          label: "Charges patronales estimées (%, facultatif)",
          value: s.employer_rate_bp === null ? "" : s.employer_rate_bp / 100,
          required: false,
        },
        {
          name: "confirmed",
          label: "Ces règles correspondent à mon établissement",
          value: s.rules_confirmed ? "yes" : "no",
          options: [
            { value: "no", label: "Pas encore vérifiées" },
            { value: "yes", label: "Vérifiées avec mon gestionnaire de paie" },
          ],
        },
      ],
      submit: async (v) => {
        await send({
          action: "rules",
          baseMinutes: Math.round(number(v.base, "Durée") * 60),
          band1Until: Math.round(number(v.until1, "Tranche") * 60),
          band2Until: Math.round(number(v.until2, "Tranche") * 60),
          band1RateBp: Math.round(number(v.rate1, "Majoration") * 100),
          band2RateBp: Math.round(number(v.rate2, "Majoration") * 100),
          band3RateBp: Math.round(number(v.rate3, "Majoration") * 100),
          employerRateBp: v.employer
            ? Math.round(number(v.employer, "Charges") * 100)
            : null,
          confirmed: v.confirmed === "yes",
        });
      },
    });
  const reopen = () =>
    setEditor({
      title: "Rouvrir ce mois",
      fields: [
        {
          name: "reason",
          label: "Motif (10 caractères minimum)",
          maxLength: 200,
        },
      ],
      submit: async (v) => {
        await send({ action: "reopen", month: state.month, reason: v.reason });
      },
    });
  const closed = state.period?.status === "closed";
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>{payrollView ? "Variables de paie" : "Heures consolidées"}</h2>
          <p>
            Calculées depuis le pointage, sans ressaisie. Une sortie oubliée
            n’est jamais estimée : elle reste à corriger. Aucun bulletin ni
            déclaration n’est produit ici.
          </p>
        </div>
        <label>
          Mois{" "}
          <input
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
          />
        </label>
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
      {!state.variables.rulesConfirmed && (
        <p className="note" role="status">
          Les majorations affichées sont des valeurs proposées d’après la
          convention HCR. Faites-les vérifier par votre gestionnaire de paie
          avant toute clôture.
        </p>
      )}
      {payrollView && state.canPay && (
        <>
          <div className="metrics">
            <article className="metric card">
              <span>Coût estimé du mois</span>
              <strong>
                {state.cost
                  ? money(state.cost.loaded ?? state.cost.gross)
                  : "—"}
              </strong>
              <small>
                {state.cost?.loaded === null
                  ? "Brut hors charges patronales, heures pointées."
                  : "Avec charges estimées, heures pointées."}
              </small>
            </article>
            <article className="metric card">
              <span>Mois</span>
              <strong>{closed ? "Clôturé" : "Ouvert"}</strong>
              <small>
                {closed
                  ? `Variables figées le ${dateTime(state.period!.closed_at)}`
                  : "Clôturez pour figer et exporter les variables."}
              </small>
            </article>
          </div>
          <div className="section-heading">
            <div />
            <div>
              <Button variant="secondary" disabled={busy} onClick={rules}>
                Règles
              </Button>{" "}
              <Button variant="secondary" disabled={busy} onClick={contract}>
                Ajouter un contrat
              </Button>{" "}
              {closed ? (
                <>
                  <a
                    className="btn secondary"
                    href={`${url}/export?month=${state.month}`}
                  >
                    Exporter le CSV
                  </a>{" "}
                  <Button variant="ghost" disabled={busy} onClick={reopen}>
                    Rouvrir
                  </Button>
                </>
              ) : (
                <Button
                  disabled={busy}
                  onClick={() =>
                    run(
                      { action: "close", month: state.month },
                      "Mois clôturé : les variables sont figées.",
                    )
                  }
                >
                  Clôturer le mois
                </Button>
              )}
            </div>
          </div>
        </>
      )}
      <div className="card table-scroll">
        <table>
          <thead>
            <tr>
              <th>Collaborateur</th>
              <th>Travaillées</th>
              <th>Complém.</th>
              <th>Sup. tr. 1</th>
              <th>Sup. tr. 2</th>
              <th>Sup. tr. 3</th>
              <th>Absences</th>
              <th>À vérifier</th>
            </tr>
          </thead>
          <tbody>
            {state.variables.employees.map((e) => (
              <tr key={e.profileId}>
                <td>
                  {e.name}
                  {payrollView && !e.hasContract && (
                    <>
                      <br />
                      <small>Sans contrat</small>
                    </>
                  )}
                </td>
                <td>{hours(e.workedMinutes)}</td>
                <td>{hours(e.complementary)}</td>
                <td>{hours(e.band1)}</td>
                <td>{hours(e.band2)}</td>
                <td>{hours(e.band3)}</td>
                <td>
                  {Object.entries(e.absenceDays)
                    .map(([k, d]) => `${kindLabel(k)} : ${d} j`)
                    .join(", ") || "—"}
                </td>
                <td>
                  {e.anomalies.map((a) => (
                    <div key={`${a.kind}-${a.day}`}>
                      {a.day} : {a.message}{" "}
                      {state.canManage && (
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() => correct(e.profileId, a.day)}
                        >
                          Corriger
                        </Button>
                      )}
                    </div>
                  ))}
                  {!e.anomalies.length && "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!state.variables.employees.length && (
          <p className="empty">Aucune heure pointée ce mois-ci.</p>
        )}
      </div>
      <p className="note">
        Une semaine appartient au mois de son dimanche. Jours d’absence
        ouvrables, hors dimanche, jours fériés non déduits.
      </p>

      {payrollView && state.canPay && (
        <>
          <div className="section-heading">
            <h2>Contrats</h2>
          </div>
          <div className="card table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Collaborateur</th>
                  <th>Type</th>
                  <th>Heures / semaine</th>
                  <th>Taux brut</th>
                  <th>Début</th>
                  <th>Fin</th>
                </tr>
              </thead>
              <tbody>
                {state.contracts.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.kind.toUpperCase()}</td>
                    <td>{hours(c.weekly_minutes)}</td>
                    <td>{money(c.hourly_rate)}</td>
                    <td>{c.starts_on}</td>
                    <td>{c.ends_on ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!state.contracts.length && (
              <p className="empty">Aucun contrat enregistré.</p>
            )}
          </div>
        </>
      )}

      <div className="section-heading">
        <h2>Absences et congés</h2>
        {state.canManage && (
          <Button variant="secondary" disabled={busy} onClick={absence}>
            Enregistrer une absence
          </Button>
        )}
      </div>
      <div className="card table-scroll">
        <table>
          <thead>
            <tr>
              <th>Collaborateur</th>
              <th>Type</th>
              <th>Du</th>
              <th>Au</th>
              <th>État</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {state.absences.map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td>{kindLabel(a.kind)}</td>
                <td>{a.starts_on}</td>
                <td>{a.ends_on}</td>
                <td>{statusLabels[a.status] ?? a.status}</td>
                <td>
                  {state.canManage && a.status === "requested" && (
                    <Button
                      disabled={busy}
                      onClick={() =>
                        run({
                          action: "absenceStatus",
                          id: a.id,
                          status: "approved",
                        })
                      }
                    >
                      Valider
                    </Button>
                  )}{" "}
                  {state.canManage &&
                    !["rejected", "cancelled"].includes(a.status) && (
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          run({
                            action: "absenceStatus",
                            id: a.id,
                            status:
                              a.status === "requested"
                                ? "rejected"
                                : "cancelled",
                          })
                        }
                      >
                        {a.status === "requested" ? "Refuser" : "Annuler"}
                      </Button>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!state.absences.length && <p className="empty">Aucune absence.</p>}
      </div>

      <div className="section-heading">
        <h2>Pointages du mois</h2>
        {state.canManage && (
          <Button variant="secondary" disabled={busy} onClick={() => correct()}>
            Ajouter une correction
          </Button>
        )}
      </div>
      <div className="card table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Collaborateur</th>
              <th>Pointage</th>
              <th>Origine</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {state.entries.map((t) => (
              <tr key={t.id}>
                <td>{dateTime(t.created_at)}</td>
                <td>{t.name}</td>
                <td>{eventLabel(t.event)}</td>
                <td>
                  {t.source === "correction"
                    ? `Correction : ${t.reason ?? ""}`
                    : "Pointage"}
                </td>
                <td>
                  {state.canManage && (
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => voidEntry(t.id)}
                    >
                      Annuler
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!state.entries.length && (
          <p className="empty">Aucun pointage ce mois-ci.</p>
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
