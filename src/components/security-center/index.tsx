"use client";
import { UtensilsLoader } from "@/components/brand/utensils";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Archive,
  ServerCrash,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";
import { dateTime } from "@/domain/shared/units";
import { Button } from "../ui/button";
import { Modal } from "../forms";
import {
  modules,
  remediationLabels,
  resolutionLabels,
  resolutionStatuses,
  severities,
  severityLabels,
  severityName,
  type ArchiveRow,
  type Diagnosis,
  type Metric,
  type Remediation,
  type SecurityEvent,
  type SecurityIncident,
  type SecurityOverview,
} from "@/features/ops-security/model";

type Tab = "overview" | "journal" | "incidents" | "corrections" | "archives";
const tabs: [Tab, string][] = [
  ["overview", "Tableau de bord"],
  ["journal", "Journal d’activité"],
  ["incidents", "Incidents"],
  ["corrections", "Corrections"],
  ["archives", "Archives"],
];
const healthLabels = {
  ok: "Opérationnel",
  degraded: "Dégradé",
  down: "Indisponible",
  unmonitored: "Non surveillé",
  not_configured: "Non configuré",
} as const;
const levelLabels = {
  A: "Correction automatique autorisée",
  B: "Autorisation obligatoire",
  C: "Intervention humaine",
} as const;
const moduleLabel = (m: string) => (modules as Record<string, string>)[m] ?? m;

function Severity({ value }: { value: number }) {
  const name = severityName(value);
  return (
    <span className={`badge security-severity sev-${value}`}>
      {severityLabels[name]}
    </span>
  );
}
function Resolution({ status }: { status: string | null }) {
  if (!status) return null;
  return (
    <span className={`badge security-resolution res-${status}`}>
      {resolutionLabels[status as keyof typeof resolutionLabels] ?? status}
    </span>
  );
}
function MetricCard({
  title,
  metric,
  icon: Icon,
}: {
  title: string;
  metric: Metric;
  icon: typeof Activity;
}) {
  return (
    <article className="metric card">
      <div>
        <span>{title}</span>
        <Icon size={19} />
      </div>
      {metric.available ? (
        <>
          <strong>{metric.value}</strong>
          <small>{metric.detail}</small>
        </>
      ) : (
        <>
          <strong className="security-unavailable">{metric.reason}</strong>
          <small>Aucune valeur n’est affichée sans mesure réelle.</small>
        </>
      )}
    </article>
  );
}

export function SecurityCenter({ restaurant }: { restaurant: string }) {
  const [tab, setTab] = useState<Tab>("overview"),
    [data, setData] = useState<SecurityOverview | null>(null),
    [events, setEvents] = useState<SecurityEvent[]>([]),
    [incidents, setIncidents] = useState<SecurityIncident[]>([]),
    [remediations, setRemediations] = useState<Remediation[]>([]),
    [archives, setArchives] = useState<ArchiveRow[]>([]),
    [filters, setFilters] = useState<Record<string, string>>({}),
    [selected, setSelected] = useState<SecurityEvent | null>(null),
    [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);

  const api = useCallback(
    async <T,>(view: string, params: Record<string, string> = {}) => {
      const q = new URLSearchParams({ restaurant, view });
      for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
      const r = await fetch(`/api/ops-security/${restaurant}?${q}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      return d as T;
    },
    [restaurant],
  );
  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/ops-security/${restaurant}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, restaurant }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await refresh();
      return d;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const refresh = useCallback(async () => {
    try {
      setData(await api<SecurityOverview>("overview"));
      if (tab === "journal") {
        const params = { ...filters };
        for (const k of ["from", "to"])
          if (params[k]) params[k] = new Date(params[k]).toISOString();
        setEvents(await api<SecurityEvent[]>("events", params));
      }
      if (tab === "incidents" || tab === "overview")
        setIncidents(await api<SecurityIncident[]>("incidents"));
      if (tab === "corrections")
        setRemediations(await api<Remediation[]>("remediations"));
      if (tab === "archives") setArchives(await api<ArchiveRow[]>("archives"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [api, tab, filters]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function analyze(eventId: string) {
    try {
      setDiagnosis(await api<Diagnosis>("diagnose", { event: eventId }));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function analyzeIncident(incident: SecurityIncident) {
    try {
      const linked = await api<SecurityEvent[]>("events", {
        incident: incident.id,
        limit: "1",
      });
      if (!linked[0])
        throw new Error("Aucun événement visible pour cet incident.");
      setSelected(null);
      await analyze(linked[0].event_id);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function download(day: string) {
    try {
      const archive = await api<{ events: unknown[] }>("archive", { day });
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(archive, null, 2)], {
          type: "application/json",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `journal-securite-${restaurant}-${day}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!data)
    return error ? (
      <section className="security-access-state" role="alert">
        <ShieldCheck size={22} aria-hidden="true" />
        <div>
          <h2>Ce centre n’est pas disponible avec votre profil</h2>
          <p>{error}</p>
          <div className="actions">
            <Link href={`/restaurant/${restaurant}`}>
              Retour à l’administration
            </Link>
            <Link href={`/dashboard?restaurant=${encodeURIComponent(restaurant)}`}>
              Ouvrir le poste de travail
            </Link>
          </div>
        </div>
      </section>
    ) : (
      <UtensilsLoader label="Chargement du centre de sécurité" fullscreen={false} />
    );
  const admin = data.platformAdmin;
  const open = incidents.filter(
    (i) => !["auto_resolved", "manually_resolved"].includes(i.status),
  );

  return (
    <div className="security-center">
      <div className="section-heading">
        <div>
          <h2>Que se passe-t-il dans votre CRM ?</h2>
          <p className="muted">
            Journal conservé {data.retentionDays} jours · mis à jour{" "}
            {dateTime(data.generatedAt)} · actualisation toutes les 15 s
          </p>
        </div>
        <span className={`pill security-mode ${data.mode}`}>
          {data.mode === "observation"
            ? "Mode observation : aucune correction exécutée"
            : "Corrections sûres actives"}
        </span>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
          <button aria-label="Fermer l’erreur" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      {notice && (
        <div className="success" role="status">
          {notice}
          <button aria-label="Fermer" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}
      <div
        className="tabs"
        role="tablist"
        aria-label="Sections du centre de sécurité"
      >
        {tabs.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
            {id === "incidents" && open.length > 0 && ` (${open.length})`}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div className="metrics security-metrics">
            <MetricCard
              title="État du système"
              metric={data.metrics.system}
              icon={ShieldCheck}
            />
            <MetricCard
              title="Incidents critiques"
              metric={data.metrics.critical}
              icon={AlertOctagon}
            />
            <MetricCard
              title="Avertissements"
              metric={data.metrics.warnings}
              icon={AlertTriangle}
            />
            <MetricCard
              title="Événements récents"
              metric={data.metrics.recent}
              icon={Activity}
            />
            <MetricCard
              title="Corrections automatiques"
              metric={data.metrics.remediations}
              icon={Wrench}
            />
            <MetricCard
              title="Sessions actives"
              metric={data.metrics.sessions}
              icon={Users}
            />
            <MetricCard
              title="Dernière archive"
              metric={data.metrics.lastArchive}
              icon={Archive}
            />
            <MetricCard
              title="Services indisponibles"
              metric={data.metrics.unavailable}
              icon={ServerCrash}
            />
          </div>
          <div className="two-grid">
            <section className="card">
              <h3>Composants</h3>
              <ul className="security-health">
                {data.health.map((h) => (
                  <li key={h.id}>
                    <span
                      className={`security-dot ${h.state}`}
                      aria-hidden="true"
                    />
                    <div>
                      <b>{h.label}</b>
                      <small>{h.detail}</small>
                    </div>
                    <span className={`badge security-health-${h.state}`}>
                      {healthLabels[h.state]}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="card">
              <h3>Incidents ouverts</h3>
              {open.length ? (
                <div className="timeline">
                  {open.slice(0, 6).map((i) => (
                    <div key={i.id}>
                      <span className="timeline-dot" />
                      <div>
                        <b>{i.title}</b>
                        <small>{i.user_message}</small>
                        <div className="security-badges">
                          <Severity value={i.severity} />
                          <Resolution status={i.status} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty">
                  Aucun incident ouvert pour cet établissement.
                </p>
              )}
            </section>
          </div>
        </>
      )}

      {tab === "journal" && (
        <>
          <form
            className="card security-filters"
            onSubmit={(e) => {
              e.preventDefault();
              const values = Object.fromEntries(
                new FormData(e.currentTarget),
              ) as Record<string, string>;
              setFilters(values);
            }}
          >
            <label>
              Recherche
              <input
                name="q"
                defaultValue={filters.q}
                placeholder="Message, type, code…"
              />
            </label>
            <label>
              Du
              <input
                name="from"
                type="datetime-local"
                defaultValue={filters.from}
              />
            </label>
            <label>
              Au
              <input
                name="to"
                type="datetime-local"
                defaultValue={filters.to}
              />
            </label>
            <label>
              Gravité minimale
              <select
                name="minSeverity"
                defaultValue={filters.minSeverity ?? ""}
              >
                <option value="">Toutes</option>
                {severities.map((s) => (
                  <option key={s} value={s}>
                    {severityLabels[s]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Module
              <select name="module" defaultValue={filters.module ?? ""}>
                <option value="">Tous</option>
                {Object.entries(modules).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Type d’action
              <input
                name="type"
                defaultValue={filters.type}
                placeholder="ex. auth., order."
              />
            </label>
            <label>
              Utilisateur (identifiant)
              <input
                name="actor"
                defaultValue={filters.actor}
                placeholder="ex. sarah"
              />
            </label>
            <label>
              Résolution
              <select name="resolution" defaultValue={filters.resolution ?? ""}>
                <option value="">Tous les statuts</option>
                {resolutionStatuses.map((s) => (
                  <option key={s} value={s}>
                    {resolutionLabels[s]}
                  </option>
                ))}
              </select>
            </label>
            {admin && (
              <label>
                Établissement
                <select name="scope" defaultValue={filters.scope ?? ""}>
                  <option value="">Tous les établissements autorisés</option>
                  <option value={restaurant}>Établissement sélectionné</option>
                  <option value="platform">
                    Plateforme (hors établissement)
                  </option>
                </select>
              </label>
            )}
            <div className="security-filter-actions">
              <Button>Filtrer</Button>
              <Button
                type="reset"
                variant="ghost"
                onClick={() => setFilters({})}
              >
                Effacer
              </Button>
            </div>
          </form>
          <div className="card table-scroll">
            <table className="security-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Gravité</th>
                  <th>Module</th>
                  <th>Ce qui s’est passé</th>
                  <th>Utilisateur</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.event_id}>
                    <td>{dateTime(e.occurred_at)}</td>
                    <td>
                      <Severity value={e.severity} />
                    </td>
                    <td>{moduleLabel(e.module)}</td>
                    <td>
                      <button
                        className="text-button security-open"
                        onClick={() => setSelected(e)}
                      >
                        {e.message}
                      </button>
                    </td>
                    <td>
                      {e.actor_name ??
                        (e.actor_id ? e.actor_id : "Système / visiteur")}
                    </td>
                    <td>
                      {e.resolution_status ? (
                        <Resolution status={e.resolution_status} />
                      ) : e.status === "failure" ? (
                        "Échec"
                      ) : e.status === "success" ? (
                        "Réussi"
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!events.length && (
              <p className="empty">
                Aucun événement enregistré pour ces critères.
              </p>
            )}
          </div>
        </>
      )}

      {tab === "incidents" && (
        <div className="security-cards">
          {incidents.map((i) => (
            <IncidentCard
              key={i.id}
              incident={i}
              admin={admin}
              busy={busy}
              analyze={() => analyzeIncident(i)}
              update={(status, note) =>
                post({ op: "incidentStatus", id: i.id, status, note })
              }
            />
          ))}
          {!incidents.length && (
            <p className="empty card">
              Aucun incident détecté pour cet établissement.
            </p>
          )}
        </div>
      )}

      {tab === "corrections" && (
        <>
          {admin && (
            <section className="card security-mode-card">
              <div>
                <h3>Mode de correction automatique</h3>
                <p className="muted">
                  En observation, les règles détectent et notent la correction
                  qu’elles auraient tentée, sans l’exécuter. Le mode actif
                  n’exécute que les opérations de niveau A (idempotentes, au
                  plus 3 tentatives).
                </p>
              </div>
              <Button
                variant={data.mode === "active" ? "secondary" : "default"}
                disabled={busy}
                onClick={() =>
                  post({
                    op: "mode",
                    mode: data.mode === "active" ? "observation" : "active",
                  })
                }
              >
                {data.mode === "active"
                  ? "Revenir en observation"
                  : "Activer les corrections sûres"}
              </Button>
            </section>
          )}
          <div className="security-cards">
            {remediations.map((r) => (
              <article className="card" key={r.id}>
                <div className="section-heading">
                  <div>
                    <h3>{r.action_label}</h3>
                    <p className="muted">
                      Incident : {r.incident_title} · demandée{" "}
                      {dateTime(r.requested_at)}
                    </p>
                  </div>
                  <span className={`badge security-remediation ${r.status}`}>
                    {remediationLabels[r.status] ?? r.status}
                  </span>
                </div>
                <p>
                  Niveau {r.intervention_level} ·{" "}
                  {levelLabels[r.intervention_level]} · tentatives {r.attempts}/
                  {r.max_attempts}
                  {r.next_attempt_at &&
                    ` · prochaine ${dateTime(r.next_attempt_at)}`}
                </p>
                {r.last_result && (
                  <p className="muted">Résultat : {r.last_result}</p>
                )}
                {r.status === "awaiting_approval" && (
                  <dl className="security-proposal">
                    {(
                      [
                        ["problem", "Problème détecté"],
                        ["cause", "Cause probable"],
                        ["action", "Action proposée"],
                        ["risks", "Risques"],
                        ["consequences", "Conséquences possibles"],
                        ["expected", "Résultat attendu"],
                      ] as const
                    ).map(([k, label]) => (
                      <div key={k}>
                        <dt>{label}</dt>
                        <dd>{r.proposal[k]}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {r.status === "awaiting_approval" && admin && (
                  <div className="actions">
                    <Button
                      disabled={busy}
                      onClick={() => post({ op: "approve", id: r.id })}
                    >
                      Autoriser et exécuter
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => post({ op: "reject", id: r.id, note: "" })}
                    >
                      Refuser
                    </Button>
                  </div>
                )}
                {r.status === "awaiting_approval" && !admin && (
                  <p className="muted">
                    En attente de l’autorisation du administrateur autorisé
                    Studio ATS.
                  </p>
                )}
              </article>
            ))}
            {!remediations.length && (
              <p className="empty card">
                Aucune correction proposée ni tentée.
              </p>
            )}
          </div>
        </>
      )}

      {tab === "archives" && (
        <>
          <section className="card security-mode-card">
            <div>
              <h3>Archivage quotidien</h3>
              <p className="muted">
                Chaque nuit après 00 h 10, la journée précédente est archivée,
                scellée par une empreinte SHA-256 chaînée à la précédente, puis
                vérifiée. Les journaux de plus de {data.retentionDays} jours
                sont ensuite purgés. Commandes, paiements, clients et
                l’historique d’activité ne sont jamais concernés. Ce n’est pas
                une sauvegarde de la base.
              </p>
            </div>
            {admin && (
              <div className="actions">
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={async () => {
                    const r = await post({ op: "run", job: "verify" });
                    if (r)
                      setNotice(
                        `${r.checked} archive(s) vérifiée(s) · ${r.issues.length} anomalie(s).`,
                      );
                  }}
                >
                  Vérifier l’intégrité
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={async () => {
                    const r = await post({ op: "run", job: "archive" });
                    if (r) setNotice(`${r.length} jour(s) traité(s).`);
                  }}
                >
                  Archiver les jours manquants
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={async () => {
                    const r = await post({ op: "run", job: "detect" });
                    if (r)
                      setNotice(`${r.opened.length} nouvel(s) incident(s).`);
                  }}
                >
                  Lancer la détection
                </Button>
              </div>
            )}
          </section>
          <div className="card table-scroll">
            <table className="security-table">
              <thead>
                <tr>
                  <th>Journée</th>
                  <th>Événements</th>
                  <th>Empreinte</th>
                  <th>Créée le</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {archives.map((a) => (
                  <tr key={a.day}>
                    <td>{a.day}</td>
                    <td>
                      {admin
                        ? `${a.event_count} (dont ${a.restaurant_event_count} ici)`
                        : a.restaurant_event_count}
                    </td>
                    <td>
                      <code title={a.sha256 ?? ""}>
                        {a.sha256?.slice(0, 12)}…
                      </code>
                    </td>
                    <td>{dateTime(a.created_at)}</td>
                    <td>
                      <Button variant="ghost" onClick={() => download(a.day)}>
                        Exporter
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!archives.length && (
              <p className="empty">
                Aucune archive pour l’instant : la première est créée après
                minuit pour la journée écoulée.
              </p>
            )}
          </div>
        </>
      )}

      {selected && !diagnosis && (
        <Modal
          title="Détail de l’événement"
          description={`${dateTime(selected.occurred_at)} · ${moduleLabel(selected.module)}`}
          close={() => setSelected(null)}
        >
          <EventDetail event={selected} />
          <div className="actions">
            <Button onClick={() => analyze(selected.event_id)}>
              Analyser l’incident
            </Button>
          </div>
        </Modal>
      )}
      {diagnosis && (
        <Modal
          title="Analyse de l’incident"
          description="Analyse par règles déterministes. Une cause non confirmée est présentée comme une hypothèse."
          close={() => {
            setDiagnosis(null);
            setSelected(null);
          }}
        >
          <DiagnosisView d={diagnosis} />
        </Modal>
      )}
    </div>
  );
}

function IncidentCard({
  incident: i,
  admin,
  busy,
  analyze,
  update,
}: {
  incident: SecurityIncident;
  admin: boolean;
  busy: boolean;
  analyze: () => void;
  update: (status: string, note: string) => Promise<unknown>;
}) {
  const [note, setNote] = useState("");
  const closed = ["auto_resolved", "manually_resolved"].includes(i.status);
  const platform = i.restaurant_id === null;
  return (
    <article className="card">
      <div className="section-heading">
        <div>
          <h3>{i.title}</h3>
          <p className="muted">
            {moduleLabel(i.module)} · détecté {dateTime(i.opened_at)}
            {i.occurrences > 1 &&
              ` · constaté lors de ${i.occurrences} contrôles`}
            {platform && " · plateforme"}
          </p>
        </div>
        <div className="security-badges">
          <Severity value={i.severity} />
          <Resolution status={i.status} />
        </div>
      </div>
      <p>{i.user_message}</p>
      <p className="muted">
        Niveau {i.intervention_level} · {levelLabels[i.intervention_level]}
        {i.resolution_note && ` · ${i.resolution_note}`}
      </p>
      {admin && i.context && (
        <details>
          <summary>Détail technique</summary>
          <pre className="security-pre">
            {JSON.stringify(i.context, null, 2)}
          </pre>
        </details>
      )}
      <div className="actions">
        <Button variant="secondary" onClick={analyze}>
          Analyser l’incident
        </Button>
        {!closed && (admin || !platform) && (
          <>
            {i.status !== "analyzing" && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => update("analyzing", "")}
              >
                Marquer en cours d’analyse
              </Button>
            )}
            <input
              className="security-note"
              aria-label="Intervention réalisée"
              placeholder="Intervention réalisée…"
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button
              variant="ghost"
              disabled={busy || !note.trim()}
              onClick={() =>
                update("manually_resolved", note).then(() => setNote(""))
              }
            >
              Résolu manuellement
            </Button>
          </>
        )}
      </div>
    </article>
  );
}

function EventDetail({ event: e }: { event: SecurityEvent }) {
  const rows: [string, string | null][] = [
    ["Type", e.event_type],
    ["Action", e.action],
    ["Utilisateur", e.actor_name ?? e.actor_id],
    ["Établissement", e.restaurant_id ?? "Plateforme"],
    ["Ressource", e.resource_id],
    ["Code d’erreur", e.error_code],
    ["Corrélation", e.correlation_id],
    ["Session", e.session_id],
    ["Identifiant", e.event_id],
  ];
  return (
    <div className="security-detail">
      <p className="security-message">{e.message}</p>
      <div className="security-badges">
        <Severity value={e.severity} />
        <Resolution status={e.resolution_status} />
      </div>
      <dl>
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
      {e.technical_details ? (
        <details>
          <summary>Détail technique</summary>
          <pre className="security-pre">
            {JSON.stringify(e.technical_details, null, 2)}
          </pre>
        </details>
      ) : (
        <p className="muted">
          Le détail technique est réservé au support Studio ATS.
        </p>
      )}
    </div>
  );
}

function DiagnosisView({ d }: { d: Diagnosis }) {
  return (
    <div className="security-detail">
      <p className="security-message">{d.event.message}</p>
      <div className="security-badges">
        <Severity value={d.event.severity} />
        {d.status !== "none" && <Resolution status={d.status} />}
      </div>
      <h4>Chronologie reconstituée</h4>
      <div className="timeline security-timeline">
        {d.timeline.map((e) => (
          <div
            key={e.event_id}
            className={e.event_id === d.event.event_id ? "current" : ""}
          >
            <span className={`timeline-dot sev-dot-${e.severity}`} />
            <div>
              <b>
                {new Date(e.occurred_at).toLocaleTimeString("fr-FR", {
                  timeZone: "Europe/Paris",
                })}{" "}
                — {e.message}
              </b>
              <small>
                {moduleLabel(e.module)} ·{" "}
                {severityLabels[severityName(e.severity)]}
              </small>
            </div>
          </div>
        ))}
      </div>
      <h4>Composants concernés</h4>
      <p>{d.components.map(moduleLabel).join(", ")}</p>
      <h4>Causes possibles</h4>
      <ul className="security-list">
        {d.causes.map((c) => (
          <li key={c.text}>
            <span className={`badge ${c.confirmed ? "confirmed" : "pending"}`}>
              {c.confirmed ? "Confirmée" : "Hypothèse"}
            </span>{" "}
            {c.text}
          </li>
        ))}
      </ul>
      {d.checks.length > 0 && (
        <>
          <h4>Vérifications proposées</h4>
          <ul className="security-list">
            {d.checks.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </>
      )}
      <h4>Corrections déjà tentées</h4>
      {d.remediations.length ? (
        <ul className="security-list">
          {d.remediations.map((r) => (
            <li key={r.id}>
              {r.action_label} · {remediationLabels[r.status] ?? r.status} ·{" "}
              {r.attempts}/{r.max_attempts} tentative(s)
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Aucune correction tentée pour cet événement.</p>
      )}
    </div>
  );
}
