"use client";
import { useCallback, useEffect, useState } from "react";
import type {
  AuditReport,
  Check,
  CheckArea,
  CheckStatus,
} from "@/features/seo/audit";

type Audit = {
  id: string;
  trigger: string;
  report: AuditReport;
  created_at: string;
};
type Observation = {
  id: string;
  observed_on: string;
  assistant: string;
  query: string;
  cited: boolean;
  evidence: string;
  created_by: string;
};
type State = {
  latest: Audit | null;
  previous: Audit | null;
  history: {
    id: string;
    trigger: string;
    created_at: string;
    counts: Record<CheckStatus, number>;
  }[];
  jobs: {
    status: string;
    attempts: number;
    available_at: string;
    last_error: string | null;
    trigger: string | null;
  }[];
  observations: Observation[];
  links: {
    site: string;
    sitemap: string;
    robots: string | null;
    llms: string | null;
  };
  integrations: {
    searchConsole: boolean;
    bingWebmaster: boolean;
    fieldData: boolean;
  };
};

const statusLabel: Record<CheckStatus, string> = {
  error: "Bloquant",
  warning: "À corriger",
  info: "À noter",
  ok: "Conforme",
};
const areas: [CheckArea, string][] = [
  ["configuration", "Configuration"],
  ["technique", "Santé technique"],
  ["donnees", "Données structurées"],
  ["geo", "Lisibilité pour les IA (GEO)"],
  ["performance", "Performance"],
];
const priorityRank = { haute: 0, moyenne: 1, basse: 2 } as const;
const when = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });

function CheckRow({ check, tag }: { check: Check; tag?: string }) {
  return (
    <li className={`seo-check seo-${check.status}`}>
      <span className="seo-status">{statusLabel[check.status]}</span>
      <div>
        <strong>
          {check.title}
          {tag && <span className="badge seo-tag">{tag}</span>}
        </strong>
        <small>{check.detail}</small>
        {check.fix && <small className="seo-fix">→ {check.fix}</small>}
      </div>
    </li>
  );
}

export function SeoDashboard({ restaurant }: { restaurant: string }) {
  const [data, setData] = useState<State | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(0);
  const endpoint = `/api/restaurants/${encodeURIComponent(restaurant)}/seo`;
  const call = useCallback(
    async (body?: unknown) => {
      const r = await fetch(
        endpoint,
        body
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : { cache: "no-store" },
      );
      const d = await r.json();
      if (!r.ok)
        throw new Error(d.error?.message || d.error || "Opération impossible.");
      return d;
    },
    [endpoint],
  );
  useEffect(() => {
    let active = true;
    call()
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [call, version]);
  async function perform(body: unknown, done: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await call(body);
      setMessage(done);
      setVersion((v) => v + 1);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!data)
    return error ? (
      <p role="alert" className="error">
        {error}
      </p>
    ) : (
      <p role="status">Chargement…</p>
    );
  const report = data.latest?.report;
  const before = new Map(
    (data.previous?.report.checks ?? []).map((c) => [c.id, c.status]),
  );
  const problem = (s?: CheckStatus) => s === "error" || s === "warning";
  const todo = (report?.checks ?? [])
    .filter((c) => problem(c.status))
    .toSorted(
      (a, b) =>
        (a.status === "error" ? -1 : 0) - (b.status === "error" ? -1 : 0) ||
        priorityRank[a.priority ?? "basse"] -
          priorityRank[b.priority ?? "basse"],
    );
  const resolved = data.previous
    ? data.previous.report.checks.filter(
        (c) =>
          problem(c.status) &&
          !problem(report?.checks.find((n) => n.id === c.id)?.status),
      )
    : [];
  const cited = data.observations.filter((o) => o.cited).length;

  return (
    <div className="seo-dashboard">
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

      <section aria-labelledby="seo-summary">
        <h2 id="seo-summary">Dernière analyse</h2>
        {data.latest && report ? (
          <>
            <p>
              {when(data.latest.created_at)} · déclenchée par :{" "}
              {data.latest.trigger}
            </p>
            <ul className="seo-counts" aria-label="Résultat des contrôles">
              {(["error", "warning", "info", "ok"] as CheckStatus[]).map(
                (s) => (
                  <li key={s} className={`seo-${s}`}>
                    <b>{report.counts[s]}</b> {statusLabel[s].toLowerCase()}
                  </li>
                ),
              )}
            </ul>
            <small className="muted">
              Contrôles calculés à partir des données publiées du site. Aucune
              note globale n’est attribuée : ces contrôles ne prédisent ni le
              classement ni les citations par les IA.
            </small>
          </>
        ) : (
          <p>Aucune analyse pour l’instant.</p>
        )}
        {data.jobs.map((j, i) => (
          <small key={i} className="muted">
            Analyse automatique{" "}
            {j.status === "failed"
              ? "en échec"
              : j.status === "running"
                ? "en cours"
                : "programmée"}
            {j.trigger ? ` (${j.trigger})` : ""}
            {j.status === "pending"
              ? ` à partir de ${when(j.available_at)}`
              : ""}
            {j.last_error ? ` · ${j.last_error}` : ""}
          </small>
        ))}
        <div className="actions">
          <button
            disabled={busy}
            onClick={() => perform({ action: "audit" }, "Analyse terminée.")}
          >
            Lancer l’analyse maintenant
          </button>
          <a href={data.links.site}>Voir le site</a>
          <a href={data.links.sitemap}>Sitemap</a>
          {data.links.robots && <a href={data.links.robots}>robots.txt</a>}
          {data.links.llms && <a href={data.links.llms}>llms.txt</a>}
        </div>
      </section>

      {report && (
        <section aria-labelledby="seo-todo">
          <h2 id="seo-todo">Recommandations</h2>
          {todo.length ? (
            <ul className="seo-list">
              {todo.map((c) => (
                <CheckRow
                  key={c.id}
                  check={c}
                  tag={
                    !data.previous
                      ? undefined
                      : problem(before.get(c.id))
                        ? `Toujours ouvert · priorité ${c.priority ?? "basse"}`
                        : `Nouveau · priorité ${c.priority ?? "basse"}`
                  }
                />
              ))}
            </ul>
          ) : (
            <p>Aucun point à corriger lors de la dernière analyse.</p>
          )}
          {resolved.length > 0 && (
            <>
              <h3>Résolu depuis l’analyse précédente</h3>
              <ul className="seo-list">
                {resolved.map((c) => (
                  <li key={c.id} className="seo-check seo-ok">
                    <span className="seo-status">Résolu</span>
                    <div>
                      <strong>{c.title}</strong>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {report &&
        areas.map(([area, label]) => {
          const checks = report.checks.filter((c) => c.area === area);
          return (
            <section key={area} aria-labelledby={`seo-${area}`}>
              <h2 id={`seo-${area}`}>{label}</h2>
              <ul className="seo-list">
                {checks.map((c) => (
                  <CheckRow key={c.id} check={c} />
                ))}
              </ul>
              {area === "performance" && (
                <p className="muted">
                  Core Web Vitals mesurés sur les visites réelles (LCP, INP, CLS
                  au 75e centile) : <b>non disponibles</b>, aucune source de
                  données terrain n’est connectée.
                </p>
              )}
            </section>
          );
        })}

      <section aria-labelledby="seo-organic">
        <h2 id="seo-organic">Visibilité organique</h2>
        <p>
          <b>Non disponible.</b> Impressions, clics, taux de clic et positions
          proviennent de Google Search Console et de Bing Webmaster Tools, qui
          ne sont pas connectés à atacuisine. Aucune estimation n’est affichée.
        </p>
        <p className="muted">
          Vous pouvez déjà déclarer votre site dans ces outils et y soumettre
          votre sitemap : {data.links.sitemap}
        </p>
      </section>

      <section aria-labelledby="seo-ai">
        <h2 id="seo-ai">Visibilité IA</h2>
        <p>
          Aucune plateforme ne publie de statistiques de citation. Cette section
          ne contient que les tests faits par votre équipe : une question posée
          à un assistant, à une date donnée, et si votre établissement a été
          cité. Les réponses des IA varient selon le moment, la formulation et
          l’utilisateur ; ces observations ne sont pas représentatives.
        </p>
        {data.observations.length > 0 && (
          <p>
            <b>
              {cited} citation(s) sur {data.observations.length} test(s)
              enregistré(s)
            </b>
          </p>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            const ok = await perform(
              {
                action: "observe",
                observedOn: f.get("observedOn"),
                assistant: f.get("assistant"),
                query: f.get("query"),
                cited: f.get("cited") === "yes",
                evidence: f.get("evidence"),
              },
              "Observation enregistrée.",
            );
            if (ok) form.reset();
          }}
        >
          <div className="grid">
            <label>
              Date du test
              <input
                type="date"
                name="observedOn"
                required
                max={new Date().toISOString().slice(0, 10)}
              />
            </label>
            <label>
              Assistant
              <input
                name="assistant"
                required
                maxLength={60}
                placeholder="ChatGPT, Claude, Gemini, Perplexity…"
              />
            </label>
            <label>
              Résultat du test
              <select name="cited" defaultValue="no">
                <option value="yes">Établissement cité</option>
                <option value="no">Non cité</option>
              </select>
            </label>
          </div>
          <label>
            Question posée
            <input
              name="query"
              required
              maxLength={300}
              placeholder="Ex. : où manger un couscous à Bernay ?"
            />
          </label>
          <label>
            Preuve ou remarque (facultatif)
            <textarea
              name="evidence"
              maxLength={1000}
              placeholder="Extrait de la réponse, lien de partage, sources citées…"
            />
          </label>
          <button disabled={busy}>Enregistrer l’observation</button>
        </form>
        {data.observations.length > 0 && (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Assistant</th>
                  <th>Question</th>
                  <th>Résultat</th>
                  <th>Preuve</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.observations.map((o) => (
                  <tr key={o.id}>
                    <td>{o.observed_on}</td>
                    <td>{o.assistant}</td>
                    <td>{o.query}</td>
                    <td>{o.cited ? "Cité" : "Non cité"}</td>
                    <td>
                      {o.evidence}
                      <small className="muted">par {o.created_by}</small>
                    </td>
                    <td>
                      <button
                        disabled={busy}
                        aria-label={`Supprimer l’observation du ${o.observed_on}`}
                        onClick={() =>
                          perform(
                            { action: "deleteObservation", id: o.id },
                            "Observation supprimée.",
                          )
                        }
                      >
                        Supprimer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data.history.length > 1 && (
        <section aria-labelledby="seo-history">
          <h2 id="seo-history">Historique des analyses</h2>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Déclencheur</th>
                  <th>Bloquant</th>
                  <th>À corriger</th>
                  <th>À noter</th>
                  <th>Conforme</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((h) => (
                  <tr key={h.id}>
                    <td>{when(h.created_at)}</td>
                    <td>{h.trigger}</td>
                    <td>{h.counts.error}</td>
                    <td>{h.counts.warning}</td>
                    <td>{h.counts.info}</td>
                    <td>{h.counts.ok}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
