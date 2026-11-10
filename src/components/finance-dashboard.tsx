"use client";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  FinanceDashboard as Data,
  Metric,
} from "@/features/finance/dashboard";
import { money } from "@/lib/domain";
import { Button } from "./ui/button";

const periods = [
  ["today", "Aujourd’hui"],
  ["week", "Cette semaine"],
  ["month", "Ce mois"],
  ["year", "Cette année"],
  ["custom", "Période"],
] as const;
type Period = (typeof periods)[number][0];
const statusLabels: Record<Metric["status"], string> = {
  confirmed: "Confirmé",
  partial: "Incomplet",
  estimate: "Estimation",
  missing: "Non disponible",
};
const methods: Record<string, string> = {
  card: "Carte",
  cash: "Espèces",
  other: "Autre",
  online: "En ligne",
};
const shortDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    timeZone: "Europe/Paris",
  });

function Tile({ label, metric }: { label: string; metric: Metric }) {
  return (
    <article className="metric card">
      <span>{label}</span>
      <strong>{metric.value === null ? "—" : money(metric.value)}</strong>
      <small>
        <b>{statusLabels[metric.status]}.</b> {metric.note}
      </small>
    </article>
  );
}

/** Pilotage par période. Les notions restent séparées, avec leur niveau de fiabilité. */
export function FinanceDashboard({ restaurant }: { restaurant: string }) {
  const [period, setPeriod] = useState<Period>("month"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [table, setTable] = useState(false);
  useEffect(() => {
    if (period === "custom" && (!from || !to || from > to)) return;
    const query = new URLSearchParams({ period });
    if (period === "custom") {
      query.set("from", from);
      query.set("to", to);
    }
    let alive = true;
    fetch(
      `/api/restaurants/${encodeURIComponent(restaurant)}/finance/dashboard?${query}`,
    )
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error?.message || "Accès impossible.");
        if (alive) {
          setData(body);
          setError("");
        }
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [restaurant, period, from, to]);
  return (
    <>
      <div role="group" aria-label="Période" className="finance-periods">
        {periods.map(([id, label]) => (
          <Button
            key={id}
            variant={period === id ? "default" : "secondary"}
            aria-pressed={period === id}
            onClick={() => setPeriod(id)}
          >
            {label}
          </Button>
        ))}
        {period === "custom" && (
          <>
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
            </label>
          </>
        )}
      </div>
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      {!data ? (
        !error && <p>Chargement des indicateurs…</p>
      ) : (
        <>
          <div className="metrics">
            <Tile label="Encaissements TTC" metric={data.metrics.cash} />
            <Tile label="Chiffre d’affaires HT" metric={data.metrics.revenue} />
            <Tile label="Trésorerie" metric={data.metrics.treasury} />
            <Tile
              label="Résultat comptable"
              metric={data.metrics.accountingResult}
            />
          </div>
          <p className="note">
            Ces quatre notions ne sont pas interchangeables : un encaissement
            n’est pas un chiffre d’affaires, et aucun des deux n’est votre solde
            bancaire.
          </p>
          <section className="card chart-card">
            <div className="section-heading">
              <div>
                <h2>Encaissements par jour</h2>
                <p>
                  {data.averageTicket === null
                    ? "Règlements déclarés, TTC."
                    : `Ticket moyen ${money(data.averageTicket)}${data.byMethod.length ? " · " : ""}${data.byMethod.map((m) => `${methods[m.method] ?? m.method} ${money(m.total)}`).join(" · ")}`}
                </p>
              </div>
              <Button variant="ghost" onClick={() => setTable((t) => !t)}>
                {table ? "Voir le graphique" : "Voir le tableau"}
              </Button>
            </div>
            {table ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Jour</th>
                      <th>Encaissements</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.daily.map((d) => (
                      <tr key={d.day}>
                        <td>{shortDay(d.day)}</td>
                        <td>{money(d.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : data.daily.length ? (
              <div className="chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.daily}
                    margin={{ top: 15, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid vertical={false} strokeOpacity={0.25} />
                    <XAxis
                      dataKey="day"
                      tickFormatter={shortDay}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={24}
                    />
                    <YAxis
                      tickFormatter={(v) => money(Number(v))}
                      tickLine={false}
                      axisLine={false}
                      width={78}
                    />
                    <Tooltip
                      cursor={{ fillOpacity: 0.08 }}
                      labelFormatter={(d) => shortDay(String(d))}
                      formatter={(v) => money(Number(v))}
                    />
                    <Bar
                      isAnimationActive={false}
                      dataKey="total"
                      name="Encaissements"
                      fill="var(--appearance-link, #ad6545)"
                      maxBarSize={28}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="empty">Aucun règlement sur la période.</p>
            )}
          </section>
          <div className="section-heading">
            <h2>Détail de la période</h2>
          </div>
          <div className="metrics">
            <Tile label="TVA collectée" metric={data.metrics.vatCollected} />
            <Tile label="TVA déductible" metric={data.metrics.vatDeductible} />
            <Tile label="Dépenses" metric={data.metrics.expenses} />
            <Tile label="Coût matière" metric={data.metrics.materialCost} />
            <Tile label="Marge estimée" metric={data.metrics.margin} />
            <Tile
              label="Résultat avant personnel"
              metric={data.metrics.resultBeforeStaff}
            />
            <Tile
              label="Résultat prévisionnel"
              metric={data.metrics.forecastResult}
            />
            <Tile label="À recevoir en ligne" metric={data.metrics.onlineDue} />
            <Tile
              label="Factures clients à encaisser"
              metric={data.metrics.receivables}
            />
            <Tile label="Coûts de personnel" metric={data.metrics.staffCost} />
            <Tile
              label="Coûts fournisseurs"
              metric={data.metrics.supplierCost}
            />
            <Tile
              label="Factures à régler"
              metric={data.metrics.unpaidInvoices}
            />
          </div>
        </>
      )}
    </>
  );
}
