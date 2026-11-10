"use client";
import { pilotageWidgets } from "@/features/pilotage/catalog";
import { usePilotagePreferences } from "@/features/pilotage/use-preferences";
import { activityPresentation } from "@/features/appearance/categories";
import { CategoryBadge } from "./appearance/category-badge";
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
import { FinanceDashboard } from "./finance-dashboard";
import { Badge } from "./forms";
import { Button } from "./ui/button";
import { QrOverviewCard } from "./qr/qr-portfolio";
export function Overview({
  data,
  navigate,
}: {
  data: Snapshot;
  navigate: (s: string) => void;
}) {
  const { visible, toggle, reset, error, ready, busy, dirty, save, reload } =
    usePilotagePreferences(data.restaurant.id, data.user.id);
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
          <span className="art-caption">L’ESPRIT STUDIO OS</span>
        </div>
      </div>
      <details className="card" style={{ marginBottom: 20, padding: 16 }}>
        <summary style={{ cursor: "pointer" }}>
          Personnaliser mon pilotage
        </summary>
        <p>
          Choisissez les blocs de votre vue d’ensemble, puis enregistrez-les
          dans votre compte pour les retrouver sur vos autres appareils, dans
          cet établissement.
        </p>
        <p>
          Masquer un bloc ne désactive pas son module et ne modifie pas votre
          abonnement.
        </p>
        <fieldset disabled={!ready || busy} style={{ border: 0, padding: 0 }}>
          <legend>Blocs affichés</legend>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 16,
              margin: "12px 0",
            }}
          >
            {pilotageWidgets.map((widget) => (
              <label
                key={widget.id}
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <input
                  type="checkbox"
                  checked={visible(widget.id)}
                  onChange={() => toggle(widget.id)}
                />
                {widget.label}
              </label>
            ))}
          </div>
        </fieldset>
        <Button variant="secondary" disabled={!ready || busy} onClick={reset}>
          Tout réafficher
        </Button>
        <Button disabled={!ready || busy || !dirty} onClick={save}>
          {busy ? "Enregistrement…" : "Enregistrer dans mon compte"}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={reload}>
          Recharger mes préférences
        </Button>
        <p role="status">
          {!ready
            ? error
              ? "Préférences indisponibles. Vous pouvez réessayer de les recharger."
              : "Chargement des préférences…"
            : dirty
              ? "Choix non enregistrés dans votre compte."
              : "Préférences enregistrées dans votre compte."}
        </p>
        {error && <p role="alert">{error}</p>}
      </details>
      {!pilotageWidgets.some((widget) => visible(widget.id)) && (
        <p className="note">
          Tous les blocs sont masqués. Utilisez « Personnaliser mon pilotage »
          pour les réafficher.
        </p>
      )}
      <div className="metrics">
        {[
          {
            id: "receipts" as const,
            title: "Encaissé aujourd’hui",
            value: money(revenue),
            detail: data.demo
              ? "Règlements déclarés · démo"
              : "Règlements déclarés",
            icon: Wallet,
          },
          {
            id: "orders" as const,
            title: "Commandes en cours",
            value: active.length,
            detail: `${data.orders.filter((o) => o.status === "pending").length} demandes à confirmer`,
            icon: UtensilsCrossed,
          },
          {
            id: "tables" as const,
            title: "Tables occupées",
            value: `${occupied} / ${data.tables.filter((t) => !t.archived_at).length}`,
            detail: "Un service qui se partage",
            icon: Users,
          },
          {
            id: "ready" as const,
            title: "Préparations prêtes",
            value: active
              .flatMap((o) => o.items)
              .filter((i) => i.status === "ready").length,
            detail: "À servir sans attendre",
            icon: Clock,
          },
        ]
          .filter((m) => visible(m.id))
          .map((m) => (
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
        {visible("sales") && (
          <section className="card chart-card">
            <div className="section-heading">
              <div>
                <h2>Le rythme des ventes</h2>
                <p>
                  {data.demo
                    ? "Règlements déclarés · historique de démonstration"
                    : "Historique des règlements déclarés"}
                </p>
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
                      <stop
                        offset="0%"
                        stopColor="var(--appearance-link, #b56643)"
                        stopOpacity={0.24}
                      />
                      <stop
                        offset="100%"
                        stopColor="var(--appearance-link, #b56643)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    vertical={false}
                    stroke="var(--appearance-line, #eee9e1)"
                  />
                  <XAxis
                    dataKey="day"
                    tickFormatter={(v) => v.slice(8)}
                    axisLine={false}
                    tickLine={false}
                    tick={{
                      fontSize: 11,
                      fill: "var(--appearance-muted, #89887d)",
                    }}
                  />
                  <YAxis
                    tickFormatter={(v) => `${v / 100} €`}
                    axisLine={false}
                    tickLine={false}
                    tick={{
                      fontSize: 11,
                      fill: "var(--appearance-muted, #89887d)",
                    }}
                    width={55}
                  />
                  <Tooltip formatter={(v) => money(Number(v))} />
                  <Area
                    isAnimationActive={false}
                    type="monotone"
                    dataKey="total"
                    name="Encaissements déclarés"
                    stroke="var(--appearance-link, #ad6545)"
                    strokeWidth={2.5}
                    fill="url(#sales)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}
        {visible("goal") && (
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
            <p className="muted">Objectif modifiable dans les paramètres.</p>
          </section>
        )}
        {visible("service") && (
          <section className="card">
            <div className="section-heading">
              <h2>À la une du service</h2>
              <button
                className="text-button"
                onClick={() => navigate("orders")}
              >
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
                      {o.table_number
                        ? `Table ${o.table_number}`
                        : "À emporter"}
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
                  Ouvrez une table depuis le plan de salle pour commencer le
                  service.
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
        )}
        {visible("favorites") && (
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
                      style={{
                        width: `${(count / (best[0]?.[1] || 1)) * 100}%`,
                      }}
                    />
                  </div>
                </div>
                <b>{count}</b>
              </div>
            ))}
            <p className="muted">Calculé à partir des commandes réglées.</p>
          </section>
        )}
        {visible("qr") && (
          <QrOverviewCard
            restaurant={data.restaurant.id}
            onOpen={() => navigate("qr")}
          />
        )}
      </div>
      {visible("news") && (
        <>
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
              <article
                className="card news"
                data-activity-category={
                  activityPresentation(n.message).category
                }
                key={n.id}
              >
                <CategoryBadge
                  category={activityPresentation(n.message).category}
                />
                <span className="dot" />
                <p>{n.message}</p>
                <small>{dateTime(n.created_at)}</small>
              </article>
            ))}
          </div>
        </>
      )}
    </>
  );
}
export function Finance({ data }: { data: Snapshot }) {
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
    a.download = data.demo
      ? "atacuisine-reglements-demo.csv"
      : "atacuisine-reglements.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Pilotage financier</h2>
          <p>
            {data.demo ? "Données fictives · " : "Données opérationnelles · "}
            aucun justificatif comptable certifié.
          </p>
        </div>
        <Button onClick={exportCsv}>Exporter les règlements CSV</Button>
      </div>
      <FinanceDashboard restaurant={data.restaurant.id} />
    </>
  );
}
