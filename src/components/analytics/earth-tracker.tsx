"use client";
import { Radio } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import {
  continentLabels,
  continentOf,
  countryName,
  geoBreakdown,
  zoneLabel,
  zonePosition,
  type Ranked,
} from "@/features/analytics/aggregate";
import { zonesToPoints } from "@/features/analytics/cluster";
import type { RangeKey } from "@/features/analytics/period";
import type { AnalyticsOverview, AnalyticsSettings, Pulse } from "@/features/analytics/service";
import { GlobeView, type PulseEvent } from "./globe/globe-view";
import "./earth-tracker.css";

const POLL_MS = 15_000;
const SUMMARY_REFRESH_MS = 30_000;
const number = new Intl.NumberFormat("fr-FR");
const percent = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 });
const ranges: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Aujourd’hui" },
  { key: "7d", label: "7 jours" },
  { key: "30d", label: "30 jours" },
  { key: "90d", label: "90 jours" },
  { key: "custom", label: "Personnalisée" },
];
type View = "3d" | "2d" | "analytics";
type Metric = "pageviews" | "sessions" | "visitors";
const metricLabels: Record<Metric, string> = {
  pageviews: "Pages vues",
  sessions: "Sessions estimées",
  visitors: "Visiteurs uniques estimés",
};
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || "Statistiques indisponibles.");
  return body as T;
}
const siteLabel = (site: string) => (site === "platform" ? "Adresse Studio OS" : site);
const pulseLabel = (pulse: Pulse) =>
  pulse.country === "ZZ" ? "Position inconnue" : zoneLabel(pulse);
function since(at: string, now: number) {
  const seconds = Math.max(0, Math.round((now - Date.parse(at)) / 1000));
  if (seconds < 60) return "à l’instant";
  if (seconds < 3600) return `il y a ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `il y a ${Math.floor(seconds / 3600)} h`;
  return `il y a ${Math.floor(seconds / 86400)} j`;
}
const axisTick = (bucket: string) =>
  bucket.includes("T")
    ? `${bucket.slice(11)} h`
    : new Date(`${bucket}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="card et-stat">
      <span>{label}</span>
      <strong>{number.format(value)}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}
function RankTable({
  title,
  rows,
  limit = 10,
  empty,
  selected,
  onPick,
}: {
  title: string;
  rows: readonly Ranked[];
  limit?: number;
  empty: string;
  selected?: string | null;
  onPick?: (row: Ranked) => void;
}) {
  const shown = rows.slice(0, limit);
  return (
    <section className="card et-rank" aria-label={title}>
      <h3>{title}</h3>
      {shown.length === 0 ? (
        <p className="et-muted">{empty}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Zone</th>
              <th scope="col">Pages vues</th>
              <th scope="col">Part</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.key} className={selected === row.key ? "is-selected" : undefined}>
                <th scope="row">
                  {onPick ? (
                    <button type="button" aria-pressed={selected === row.key} onClick={() => onPick(row)}>
                      {row.label}
                    </button>
                  ) : (
                    row.label
                  )}
                  <span className="et-bar" aria-hidden="true">
                    <i style={{ width: `${Math.max(row.share * 100, 1)}%` }} />
                  </span>
                </th>
                <td>{number.format(row.pageviews)}</td>
                <td>{percent.format(row.share)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
function TrafficChart({ series, metric }: { series: AnalyticsOverview["series"]; metric: Metric }) {
  return (
    <div className="et-chart" role="img" aria-label={`${metricLabels[metric]} sur la période`}>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="et-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--appearance-link, #ad6545)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--appearance-link, #ad6545)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--appearance-line, #eee9e1)" />
          <XAxis dataKey="bucket" tickFormatter={axisTick} tickLine={false} axisLine={false} minTickGap={36} tick={{ fontSize: 12, fill: "var(--muted)" }} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} tick={{ fontSize: 12, fill: "var(--muted)" }} />
          <Tooltip
            formatter={(value) => [number.format(Number(value)), metricLabels[metric]]}
            labelFormatter={(bucket) => axisTick(String(bucket))}
            contentStyle={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 10, color: "var(--ink)" }}
          />
          <Area type="monotone" dataKey={metric} stroke="var(--appearance-link, #ad6545)" strokeWidth={2} fill="url(#et-area)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
function Settings({
  restaurant,
  overview,
  onSaved,
  onPurged,
}: {
  restaurant: string;
  overview: AnalyticsOverview;
  onSaved: (settings: AnalyticsSettings) => void;
  onPurged: () => void;
}) {
  const url = `/api/restaurants/${encodeURIComponent(restaurant)}/analytics/earth`;
  const settings = overview.settings;
  const [draft, setDraft] = useState({
    enabled: settings.collection_enabled,
    consentMode: settings.consent_mode,
    geoPrecision: settings.geo_precision,
    retentionDays: settings.retention_days,
  });
  const [acknowledged, setAcknowledged] = useState(settings.consent_mode === "exemption_declared");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = !overview.canManage || busy;
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const saved = await request<AnalyticsSettings>(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          ...(draft.consentMode === "exemption_declared" ? { exemptionAcknowledged: acknowledged } : {}),
          revision: settings.revision,
        }),
      });
      onSaved(saved);
      setMessage({ ok: true, text: "Réglages enregistrés. Vos statistiques existantes sont conservées." });
    } catch (error) {
      setMessage({ ok: false, text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }
  async function purge() {
    setBusy(true);
    setMessage(null);
    try {
      await request(url, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm }),
      });
      setConfirm("");
      onPurged();
      setMessage({ ok: true, text: "Toutes les statistiques de cet établissement ont été supprimées." });
    } catch (error) {
      setMessage({ ok: false, text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card et-settings" aria-label="Collecte et confidentialité">
      <h3>Collecte et confidentialité</h3>
      {!overview.canManage && <p className="et-muted">Ces réglages sont réservés au propriétaire de l’établissement.</p>}
      <form onSubmit={save}>
        <label className="et-check">
          <input
            type="checkbox"
            disabled={locked}
            checked={draft.enabled}
            onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
          />
          <span>
            <strong>Mesurer les visites de mon site</strong>
            <small>La désactivation arrête la collecte sans supprimer vos statistiques.</small>
          </span>
        </label>
        <fieldset disabled={locked}>
          <legend>Base de la mesure</legend>
          <label className="et-radio">
            <input
              type="radio"
              name="consent"
              checked={draft.consentMode === "consent_required"}
              onChange={() => setDraft({ ...draft, consentMode: "consent_required" })}
            />
            <span>
              <strong>Avec le consentement du visiteur (recommandé)</strong>
              <small>Seules les visites acceptées dans le bandeau sont comptées : vos chiffres sous-estiment le trafic réel.</small>
            </span>
          </label>
          <label className="et-radio">
            <input
              type="radio"
              name="consent"
              checked={draft.consentMode === "exemption_declared"}
              onChange={() => setDraft({ ...draft, consentMode: "exemption_declared" })}
            />
            <span>
              <strong>Sans consentement préalable, avec droit d’opposition</strong>
              <small>Possible seulement si les conditions d’exemption qui vous sont applicables sont réunies.</small>
            </span>
          </label>
          {draft.consentMode === "exemption_declared" && (
            <div className="et-exemption">
              <p>Cette évaluation vous revient, en tant que responsable du traitement. En France, la CNIL exige notamment que :</p>
              <ul>
                <li>la mesure serve uniquement à vos propres statistiques d’audience ;</li>
                <li>les données ne soient ni recoupées avec d’autres traitements, ni transmises à des tiers ;</li>
                <li>vos visiteurs soient informés et puissent s’y opposer facilement ;</li>
                <li>la localisation ne soit pas plus précise que la ville, et la conservation limitée (25 mois au plus).</li>
              </ul>
              <label className="et-check">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                />
                <span>J’ai vérifié ces conditions pour mon établissement. Ce choix est enregistré avec son auteur et sa date.</span>
              </label>
            </div>
          )}
        </fieldset>
        <div className="et-settings-row">
          <label>
            Précision géographique
            <select
              disabled={locked}
              value={draft.geoPrecision}
              onChange={(event) => setDraft({ ...draft, geoPrecision: event.target.value as AnalyticsSettings["geo_precision"] })}
            >
              <option value="city">Ville (maille d’environ 50 km)</option>
              <option value="region">Région</option>
              <option value="country">Pays</option>
            </select>
          </label>
          <label>
            Conservation
            <select
              disabled={locked}
              value={draft.retentionDays}
              onChange={(event) => setDraft({ ...draft, retentionDays: Number(event.target.value) })}
            >
              <option value={90}>3 mois</option>
              <option value={180}>6 mois</option>
              <option value={395}>13 mois</option>
              <option value={790}>25 mois</option>
              {![90, 180, 395, 790].includes(draft.retentionDays) && <option value={draft.retentionDays}>{draft.retentionDays} jours</option>}
            </select>
          </label>
        </div>
        {overview.canManage && (
          <Button disabled={busy || (draft.consentMode === "exemption_declared" && !acknowledged)}>Enregistrer</Button>
        )}
      </form>
      {message && <p role={message.ok ? "status" : "alert"}>{message.text}</p>}
      <p className="et-muted">
        Pour ne pas compter vos propres visites depuis votre domaine, ouvrez une fois votre site avec{" "}
        <code>?studio-exclude=1</code> sur chaque appareil. Les comptes de votre équipe connectés à la plateforme sont déjà exclus.
      </p>
      {overview.canPurge && (
        <details className="et-danger">
          <summary>Supprimer définitivement les statistiques</summary>
          <p>Action irréversible, sur toutes les périodes de cet établissement. Saisissez SUPPRIMER pour confirmer.</p>
          <div className="et-settings-row">
            <input
              aria-label="Confirmation de suppression"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
            <Button type="button" variant="danger" disabled={busy || confirm !== "SUPPRIMER"} onClick={() => void purge()}>
              Supprimer
            </Button>
          </div>
        </details>
      )}
    </section>
  );
}

export function EarthTracker({ restaurant }: { restaurant: string }) {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [error, setError] = useState("");
  const [range, setRange] = useState<RangeKey>("7d");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [site, setSite] = useState("");
  const [view, setView] = useState<View>("3d");
  const [metric, setMetric] = useState<Metric>("pageviews");
  const [country, setCountry] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [continent, setContinent] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null);
  const [pulseEvents, setPulseEvents] = useState<PulseEvent[]>([]);
  const [recent, setRecent] = useState<Pulse[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const cursor = useRef<string | null>(null);
  const lastRefresh = useRef(0);
  const base = `/api/restaurants/${encodeURIComponent(restaurant)}/analytics/earth`;
  const query = useMemo(() => {
    const params = new URLSearchParams({ range });
    if (range === "custom") {
      params.set("from", custom.from);
      params.set("to", custom.to);
    }
    if (site) params.set("site", site);
    return params.toString();
  }, [range, custom, site]);
  const waitingDates = range === "custom" && (!custom.from || !custom.to);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const next = await request<AnalyticsOverview>(`${base}?${query}`, { signal });
      setOverview(next);
      setRecent(next.pulses);
      cursor.current = next.cursor;
      lastRefresh.current = Date.now();
      setError("");
    },
    [base, query],
  );
  useEffect(() => {
    if (waitingDates) return;
    const controller = new AbortController();
    load(controller.signal).catch((reason: Error) => {
      if (reason.name !== "AbortError") setError(reason.message);
    });
    return () => controller.abort();
  }, [load, waitingDates]);
  // Quasi temps réel : une seule requête légère par intervalle, suspendue si l’onglet est masqué.
  const includesToday = overview?.period.to === new Date(now).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
  const collecting = overview?.settings.collection_enabled === true;
  useEffect(() => {
    if (!collecting || waitingDates) return;
    const poll = async () => {
      if (document.hidden || !cursor.current) return;
      setNow(Date.now());
      const params = new URLSearchParams({ view: "live", since: cursor.current });
      if (site) params.set("site", site);
      const live = await request<{ pulses: Pulse[]; cursor: string }>(`${base}?${params}`).catch(() => null);
      if (!live?.pulses.length) return;
      cursor.current = live.cursor;
      setRecent((current) => [...live.pulses, ...current].slice(0, 12));
      const placed = [...live.pulses].reverse().flatMap((pulse) => {
        const position = zonePosition(pulse);
        return position ? [{ id: pulse.occurred_at, lat: position.lat, lng: position.lng }] : [];
      });
      setPulseEvents((current) => [...current, ...placed].slice(-24));
      // Les compteurs viennent toujours du serveur : ils restent cohérents avec les agrégats.
      if (includesToday && Date.now() - lastRefresh.current > SUMMARY_REFRESH_MS) await load().catch(() => undefined);
    };
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(timer);
  }, [base, site, collecting, includesToday, load, waitingDates]);

  const zones = useMemo(() => overview?.zones ?? [], [overview]);
  const filteredZones = useMemo(
    () =>
      zones.filter(
        (zone) =>
          (!continent || (continentOf(zone.country) ?? "??") === continent) &&
          (!country || zone.country === country) &&
          (!region || `${zone.country}|${zone.region}` === region),
      ),
    [zones, continent, country, region],
  );
  const points = useMemo(() => zonesToPoints(filteredZones), [filteredZones]);
  const breakdown = useMemo(() => geoBreakdown(filteredZones), [filteredZones]);
  if (!overview)
    return error ? <p role="alert">{error}</p> : <p role="status">Chargement des statistiques…</p>;
  const pickCountry = (code: string) => {
    setCountry((current) => (current === code ? null : code));
    setRegion(null);
    const position = zonePosition({ country: code, lat: null, lng: null });
    if (position) setFocus({ lat: position.lat, lng: position.lng });
  };
  const selectedCountry = country ? overview.countries.find((entry) => entry.key === country) : null;
  const countryRegions = country ? overview.regions.filter((entry) => entry.country === country) : [];
  const countryCities = country ? breakdown.cities : [];
  const { totals } = overview;
  const empty = totals.pageviews === 0;
  return (
    <div className="earth-tracker">
      <div className="et-toolbar">
        <div className="et-chips" role="group" aria-label="Période">
          {ranges.map((entry) => (
            <Button
              key={entry.key}
              variant={range === entry.key ? "default" : "secondary"}
              aria-pressed={range === entry.key}
              onClick={() => setRange(entry.key)}
            >
              {entry.label}
            </Button>
          ))}
        </div>
        {range === "custom" && (
          <div className="et-dates">
            <label>
              Du
              <input type="date" value={custom.from} onChange={(event) => setCustom({ ...custom, from: event.target.value })} />
            </label>
            <label>
              Au
              <input type="date" value={custom.to} onChange={(event) => setCustom({ ...custom, to: event.target.value })} />
            </label>
          </div>
        )}
        {overview.sites.length > 1 && (
          <label className="et-site">
            Site
            <select value={site} onChange={(event) => setSite(event.target.value)}>
              <option value="">Tous mes sites</option>
              {overview.sites.map((entry) => (
                <option key={entry} value={entry}>
                  {siteLabel(entry)}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="et-chips" role="group" aria-label="Affichage">
          {([["3d", "Globe 3D"], ["2d", "Carte 2D"], ["analytics", "Vue analytique"]] as const).map(([key, label]) => (
            <Button key={key} variant={view === key ? "default" : "secondary"} aria-pressed={view === key} onClick={() => setView(key)}>
              {label}
            </Button>
          ))}
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      {!collecting && (
        <p className="et-notice" role="status">
          La mesure est désactivée : aucune visite n’est enregistrée.{" "}
          {overview.canManage ? "Activez-la dans « Collecte et confidentialité », en bas de page." : "Le propriétaire de l’établissement peut l’activer."}
        </p>
      )}
      {collecting && !overview.geoAvailable && (
        <p className="et-notice" role="status">
          Cet hébergement ne fournit pas de géolocalisation approximative : les visites restent comptées, en « Position inconnue ». Consultez ANALYTICS_GEO_SOURCE dans la documentation.
        </p>
      )}
      <div className="et-stats">
        <Stat label="Visites (sessions estimées)" value={totals.sessions} />
        <Stat label="Pages vues" value={totals.pageviews} />
        <Stat label="Visiteurs uniques estimés" value={totals.visitors} note="Cumul quotidien, sans suivi d’un jour à l’autre" />
        <Stat label="Pays représentés" value={totals.countries} />
      </div>
      <p className="et-muted et-requests">
        Le collecteur a reçu {number.format(totals.requests)} requête{totals.requests > 1 ? "s" : ""}, dont {number.format(totals.filtered)} écartée{totals.filtered > 1 ? "s" : ""} (robots, équipe, doublons). Une requête n’est pas un visiteur.
        {overview.settings.consent_mode === "consent_required" && collecting && " Seules les visites consenties sont comptées."}
      </p>
      {(continent || country || region) && (
        <p className="et-filter-note" role="status">
          Filtre : {[continent && continentLabels[continent as keyof typeof continentLabels], country && countryName(country), region && `région ${region.split("|")[1]}`].filter(Boolean).join(" · ")}.{" "}
          <button
            type="button"
            onClick={() => {
              setContinent(null);
              setCountry(null);
              setRegion(null);
            }}
          >
            Tout afficher
          </button>
        </p>
      )}
      {view !== "analytics" ? (
        <div className="et-main">
          <div className="et-visual">
            <GlobeView
              points={points}
              pulses={pulseEvents}
              mode={view}
              focus={focus}
              selectedCountry={country}
              onSelectCountry={pickCountry}
              onFallback={() => setView("2d")}
            />
            {empty && (
              <p className="et-empty-note" role="status">
                Aucune visite enregistrée sur cette période : le globe ne montre que des données réelles.
              </p>
            )}
            {totals.unplaced > 0 && (
              <p className="et-muted">{number.format(totals.unplaced)} pages vues sans position connue ne sont pas placées sur le globe.</p>
            )}
          </div>
          <aside className="et-side">
            {selectedCountry ? (
              <section className="card et-country" aria-label={`Statistiques : ${selectedCountry.label}`}>
                <h3>{selectedCountry.label}</h3>
                <dl>
                  <div><dt>Pages vues</dt><dd>{number.format(selectedCountry.pageviews)}</dd></div>
                  <div><dt>Sessions estimées</dt><dd>{number.format(selectedCountry.sessions)}</dd></div>
                  <div><dt>Part du trafic</dt><dd>{percent.format(selectedCountry.share)}</dd></div>
                </dl>
                {countryRegions.length > 0 && (
                  <div className="et-chips" role="group" aria-label="Régions">
                    {countryRegions.map((entry) => (
                      <Button
                        key={entry.key}
                        variant={region === entry.key ? "default" : "secondary"}
                        aria-pressed={region === entry.key}
                        onClick={() => setRegion(region === entry.key ? null : entry.key)}
                      >
                        {entry.key.split("|")[1]} · {number.format(entry.pageviews)}
                      </Button>
                    ))}
                  </div>
                )}
                {countryCities.length > 0 && (
                  <ul className="et-list">
                    {countryCities.slice(0, 6).map((entry) => (
                      <li key={entry.key}>
                        <span>{entry.label.split(",")[0]}</span>
                        <b>{number.format(entry.pageviews)}</b>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : (
              <RankTable
                title="Top pays"
                rows={overview.countries}
                limit={6}
                empty="Pas encore de données."
                selected={country}
                onPick={(row) => pickCountry(row.key)}
              />
            )}
            <section className="card et-activity" aria-label="Activité récente">
              <h3>
                <Radio size={15} aria-hidden="true" /> Activité récente
              </h3>
              <p className="et-muted">Quasi réel : actualisé toutes les 15 secondes.</p>
              {recent.length === 0 ? (
                <p className="et-muted">Aucune visite durant les dernières 48 heures.</p>
              ) : (
                <ul className="et-list">
                  {recent.slice(0, 7).map((pulse) => (
                    <li key={pulse.occurred_at}>
                      <span>{pulseLabel(pulse)}</span>
                      <time dateTime={pulse.occurred_at}>{since(pulse.occurred_at, now)}</time>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      ) : (
        <div className="et-analytics">
          <section className="card et-traffic" aria-label="Évolution du trafic">
            <div className="et-traffic-head">
              <h3>Évolution : {metricLabels[metric]}</h3>
              <label>
                Mesure
                <select value={metric} onChange={(event) => setMetric(event.target.value as Metric)}>
                  {(Object.keys(metricLabels) as Metric[]).map((key) => (
                    <option key={key} value={key}>
                      {metricLabels[key]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {empty ? <p className="et-muted">Aucune visite sur cette période.</p> : <TrafficChart series={overview.series} metric={metric} />}
          </section>
          <RankTable title="Top 10 des pays" rows={breakdown.countries} empty="Pas encore de données." selected={country} onPick={(row) => pickCountry(row.key)} />
          <RankTable title="Top 10 des villes" rows={breakdown.cities} empty="Aucune ville identifiée : selon la précision choisie ou l’hébergement." />
          <RankTable
            title="Répartition par continent"
            rows={overview.continents}
            empty="Pas encore de données."
            selected={continent}
            onPick={(row) => {
              setContinent((current) => (current === row.key ? null : row.key));
              setCountry(null);
              setRegion(null);
            }}
          />
          <section className="card et-rank" aria-label="Pages les plus consultées">
            <h3>Pages les plus consultées</h3>
            {overview.pages.length === 0 ? (
              <p className="et-muted">Pas encore de données.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th scope="col">Page</th>
                    <th scope="col">Pages vues</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.pages.map((page) => (
                    <tr key={page.path}>
                      <th scope="row"><code>{page.path}</code></th>
                      <td>{number.format(page.pageviews)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}
      <Settings
        key={overview.settings.revision}
        restaurant={restaurant}
        overview={overview}
        onSaved={() => void load().catch((reason: Error) => setError(reason.message))}
        onPurged={() => void load().catch((reason: Error) => setError(reason.message))}
      />
    </div>
  );
}
