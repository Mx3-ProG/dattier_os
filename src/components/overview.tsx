"use client";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowUpRight,
  UtensilsCrossed,
  Users,
  Wallet,
  Clock,
  ArrowRight,
} from "lucide-react";
import type { Snapshot } from "@/lib/types";
import { money, dateTime } from "@/lib/domain";
import { Badge } from "./forms";
import { Button } from "./ui/button";
export function Overview({
  data,
  navigate,
}: {
  data: Snapshot;
  navigate: (s: string) => void;
}) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
  }).format(new Date());
  const revenue = data.sales.find((s) => s.day === today)?.total || 0,
    active = data.orders.filter((o) => o.status === "active"),
    occupied = data.tables.filter((t) => t.status === "occupied").length;
  const totals = data.orders
    .filter((o) => o.status === "paid")
    .flatMap((o) => o.items)
    .reduce<Record<string, number>>(
      (s, i) => ({ ...s, [i.name]: (s[i.name] || 0) + i.quantity }),
      {},
    );
  const best = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  return (
    <>
      <div className="welcome">
        <div>
          <div className="eyebrow">LE GOÛT DU TRAVAIL BIEN FAIT</div>
          <h1>
            Bonjour {data.user.name}
            <span className="serif">,</span>
            <br />
            votre restaurant prend vie.
          </h1>
          <p>Un regard sur l’essentiel, du premier couvert au dernier thé.</p>
          <Button onClick={() => navigate("dining")}>
            Voir le service <ArrowUpRight size={17} />
          </Button>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <span className="arch" />
          <span className="sun" />
          <div className="plate">
            <span>✳</span>
          </div>
          <i className="leaf one" />
          <i className="leaf two" />
          <span className="art-caption">L’ESPRIT DU DATTIER</span>
        </div>
      </div>
      <div className="metrics">
        {[
          {
            title: "CA déclaré aujourd’hui",
            value: money(revenue),
            detail: "Règlements déclarés · démo",
            icon: Wallet,
          },
          {
            title: "Commandes en cours",
            value: active.length,
            detail: `${data.orders.filter((o) => o.status === "pending").length} demandes à confirmer`,
            icon: UtensilsCrossed,
          },
          {
            title: "Tables occupées",
            value: `${occupied} / ${data.tables.length}`,
            detail: "Un service qui se partage",
            icon: Users,
          },
          {
            title: "Préparations prêtes",
            value: active
              .flatMap((o) => o.items)
              .filter((i) => i.status === "ready").length,
            detail: "À servir sans attendre",
            icon: Clock,
          },
        ].map((m) => (
          <article className="metric card" key={m.title}>
            <div>
              <span>{m.title}</span>
              <m.icon size={19} />
            </div>
            <strong>{m.value}</strong>
            <small>{m.detail}</small>
          </article>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="card chart-card">
          <div className="section-heading">
            <div>
              <h2>Le rythme des ventes</h2>
              <p>Règlements déclarés · historique de démonstration</p>
            </div>
            <span className="pill">14 jours</span>
          </div>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data.sales.slice(-14)}
                margin={{ top: 15, right: 10, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="sales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#b56643" stopOpacity={0.24} />
                    <stop offset="100%" stopColor="#b56643" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#eee9e1" />
                <XAxis
                  dataKey="day"
                  tickFormatter={(v) => v.slice(8)}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "#89887d" }}
                />
                <YAxis
                  tickFormatter={(v) => `${v / 100} €`}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "#89887d" }}
                  width={55}
                />
                <Tooltip formatter={(v) => money(Number(v))} />
                <Area
                  isAnimationActive={false}
                  type="monotone"
                  dataKey="total"
                  name="CA déclaré"
                  stroke="#ad6545"
                  strokeWidth={2.5}
                  fill="url(#sales)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="card target-card">
          <span className="eyebrow">CHAQUE SERVICE COMPTE</span>
          <h2>Objectif du jour</h2>
          <div
            className="goal-ring"
            style={
              {
                "--progress": `${Math.min(100, (revenue / data.restaurant.goal) * 100)}%`,
              } as React.CSSProperties
            }
          >
            <div>
              <strong>
                {Math.round((revenue / data.restaurant.goal) * 100)}
                <small>%</small>
              </strong>
              <span>de l’objectif déclaré</span>
            </div>
          </div>
          <div className="between">
            <span>{money(revenue)}</span>
            <b>{money(data.restaurant.goal)}</b>
          </div>
          <p className="muted">
            Objectif fictif, modifiable dans les paramètres.
          </p>
        </section>
        <section className="card">
          <div className="section-heading">
            <h2>À la une du service</h2>
            <button className="text-button" onClick={() => navigate("orders")}>
              Tout voir <ArrowRight size={14} />
            </button>
          </div>
          {active.length ? (
            active.slice(0, 4).map((o) => (
              <div className="compact-row" key={o.id}>
                <span className="mini-icon">
                  <UtensilsCrossed size={18} />
                </span>
                <div>
                  <b>
                    {o.table_number ? `Table ${o.table_number}` : "À emporter"}
                  </b>
                  <small>
                    {o.items.map((i) => `${i.quantity} ${i.name}`).join(", ")}
                  </small>
                </div>
                <Badge status={o.status} />
              </div>
            ))
          ) : (
            <div className="quiet-state">
              <UtensilsCrossed />
              <h3>Prêt pour les premières tablées.</h3>
              <p>
                Ouvrez la table 8 pour commencer le parcours de démonstration.
              </p>
              <button
                className="text-button"
                onClick={() => navigate("dining")}
              >
                Ouvrir la salle →
              </button>
            </div>
          )}
        </section>
        <section className="card">
          <div className="section-heading">
            <h2>Les favoris de la maison</h2>
            <span className="eyebrow">QUANTITÉS SERVIES</span>
          </div>
          {best.map(([name, count], i) => (
            <div className="best-row" key={name}>
              <span>0{i + 1}</span>
              <div>
                <b>{name}</b>
                <div className="bar-track">
                  <i
                    style={{ width: `${(count / (best[0]?.[1] || 1)) * 100}%` }}
                  />
                </div>
              </div>
              <b>{count}</b>
            </div>
          ))}
          <p className="muted">Calculé à partir des commandes réglées.</p>
        </section>
      </div>
      <div className="section-heading">
        <h2>Dernières nouvelles</h2>
        <button
          className="text-button"
          onClick={() => navigate("notifications")}
        >
          Toutes les notifications →
        </button>
      </div>
      <div className="three-grid">
        {data.notifications.slice(0, 3).map((n) => (
          <article className="card news" key={n.id}>
            <span className="dot" />
            <p>{n.message}</p>
            <small>{dateTime(n.created_at)}</small>
          </article>
        ))}
      </div>
    </>
  );
}
export function Finance({ data }: { data: Snapshot }) {
  const total = data.payments.reduce((s, p) => s + p.amount, 0),
    expenses = data.expenses.reduce((s, e) => s + e.amount, 0),
    paid = data.orders.filter((o) => o.status === "paid");
  const exportCsv = () => {
    const csv =
      "date;montant_eur\n" +
      data.payments
        .map((p) => `${p.created_at};${(p.amount / 100).toFixed(2)}`)
        .join("\n");
    const url = URL.createObjectURL(
      new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "dattier-reglements-demo.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Pilotage financier</h2>
          <p>
            Données opérationnelles fictives · aucun justificatif comptable
            certifié.
          </p>
        </div>
        <Button onClick={exportCsv}>Exporter les règlements CSV</Button>
      </div>
      <div className="metrics">
        <article className="metric card">
          <span>CA déclaré · toutes dates</span>
          <strong>{money(total)}</strong>
        </article>
        <article className="metric card">
          <span>Ticket moyen par déclaration</span>
          <strong>{money(total / Math.max(1, data.payments.length))}</strong>
        </article>
        <article className="metric card">
          <span>Dépenses déclarées</span>
          <strong>{money(expenses)}</strong>
        </article>
        <article className="metric card">
          <span>Coût matière théorique vendu</span>
          <strong>
            {money(
              paid
                .flatMap((o) => o.items)
                .filter((i) => i.status === "served")
                .reduce(
                  (s, i) => s + (i.material_cost || 0) * 100 * i.quantity,
                  0,
                ),
            )}
          </strong>
        </article>
      </div>
      <p className="note">
        Les bases HT/TTC ne sont pas validées. Aucune marge comptable n’est
        calculée à partir de ces montants.
      </p>
      <div className="card table-scroll">
        <table>
          <thead>
            <tr>
              <th>Jour</th>
              <th>Règlements déclarés</th>
            </tr>
          </thead>
          <tbody>
            {data.sales.map((s) => (
              <tr key={s.day}>
                <td>{s.day}</td>
                <td>{money(s.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
