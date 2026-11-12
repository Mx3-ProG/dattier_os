"use client";
import {
  availablePilotageWidgets,
  defaultHiddenPilotageWidgets,
  type PilotageSource,
  type PilotageWidgetId,
} from "@/features/pilotage/catalog";
import { usePilotagePreferences } from "@/features/pilotage/use-preferences";
import { useMemo } from "react";
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
  CalendarDays,
  Package,
  HardHat,
  FileText,
  ClipboardCheck,
  Wrench,
  Heart,
  UserCheck,
  Mail,
} from "lucide-react";
import type { Snapshot } from "@/shared/types";
import { money, dateTime } from "@/domain/shared/units";
import { FinanceDashboard } from "./finance-dashboard";
import { Badge } from "./forms";
import { Button } from "./ui/button";
import { QrOverviewCard } from "./qr/qr-portfolio";
import { adaptText, businessTerms } from "@/core/tenant/vocabulary";
const parisDay = (value: string) =>
  new Date(value).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
export function Overview({
  data,
  navigate,
}: {
  data: Snapshot;
  navigate: (s: string) => void;
}) {
  const industry = data.restaurant.industry;
  const trade = data.tradePilotage ?? {};
  // Données réellement présentes dans cet établissement : chaque bloc en dépend.
  const sources = useMemo(() => {
    const modules = new Set(data.modules ?? []);
    const set = new Set<PilotageSource>(["payments", "activity", "qr"]);
    // Blocs de commandes : seulement si le module Commandes est activé pour ce métier.
    if (modules.has("orders")) set.add("orders");
    if (data.activeModules?.floor && data.tables.length) set.add("floor");
    if (modules.has("kitchen") || modules.has("bar")) set.add("kitchen");
    if (data.ingredients.length) set.add("stock");
    if (data.activeModules?.["table-booking"]) set.add("reservations");
    if (data.customers.length) set.add("customers");
    if (data.shifts.length) set.add("team");
    const tools = data.tradePilotage ?? {};
    if (tools.agenda) set.add("agenda");
    if (tools.sites) set.add("sites");
    if (tools.quotes) set.add("quotes");
    if (tools.reports) set.add("reports");
    if (tools.equipment) set.add("equipment");
    if (tools.salonStock) set.add("salon-stock");
    if (tools.followups) set.add("followups");
    return set;
  }, [data]);
  const offered = useMemo(() => availablePilotageWidgets(sources), [sources]);
  const defaults = useMemo(
    () => defaultHiddenPilotageWidgets(industry, sources),
    [industry, sources],
  );
  const { visible, toggle, reset, error, ready, busy, dirty, save, reload } =
    usePilotagePreferences(data.restaurant.id, data.user.id, defaults);
  const shown = (id: PilotageWidgetId) =>
    offered.some((widget) => widget.id === id) && visible(id);
  const restaurantTrade = !industry || industry === "restaurant";
  const t = (text: string) => adaptText(text, industry);
  const welcome = businessTerms(industry).welcome;
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
          <div className="eyebrow">{welcome.eyebrow}</div>
          <h1>
            Bonjour {data.user.name}
            <span className="serif">,</span>
            <br />
            {welcome.title}
          </h1>
          <p>{welcome.lead}</p>
          <Button onClick={() => navigate(restaurantTrade ? "dining" : "operations")}>
            {restaurantTrade ? "Voir le service" : "Voir l’activité"} <ArrowUpRight size={17} />
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
          <span className="art-caption">{welcome.caption}</span>
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
            {offered.map((widget) => (
              <label
                key={widget.id}
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <input
                  type="checkbox"
                  checked={visible(widget.id)}
                  onChange={() => toggle(widget.id)}
                />
                {t(widget.label)}
              </label>
            ))}
          </div>
        </fieldset>
        <Button variant="secondary" disabled={!ready || busy} onClick={reset}>
          Revenir aux blocs conseillés
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
      {!offered.some((widget) => visible(widget.id)) && (
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
            id: "preparing" as const,
            title: "Commandes en préparation",
            value: active.filter((o) =>
              o.items.some((i) => i.status === "waiting" || i.status === "preparing"),
            ).length,
            detail: "Lancées, pas encore prêtes",
            icon: Clock,
          },
          {
            id: "tables" as const,
            title: t("Tables occupées"),
            value: `${occupied} / ${data.tables.filter((t) => !t.archived_at).length}`,
            detail: restaurantTrade ? "Un service qui se partage" : "Un espace qui se partage",
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
          {
            id: "stock" as const,
            title: "Stocks à surveiller",
            value: data.ingredients.filter((i) => i.available <= i.threshold).length,
            detail: "Sous le seuil d’alerte",
            icon: Package,
          },
          {
            id: "reservations" as const,
            title: "Réservations du jour",
            value: data.reservations.filter(
              (r) => parisDay(r.starts_at) === today && ["requested", "confirmed", "arrived"].includes(r.status),
            ).length,
            detail: "Demandes et confirmées",
            icon: CalendarDays,
          },
          {
            id: "customers" as const,
            title: "Clients fidèles",
            value: data.customers.length,
            detail: "Dans votre fichier clients",
            icon: Heart,
          },
          {
            id: "team" as const,
            title: "Équipe planifiée aujourd’hui",
            value: new Set(
              data.shifts
                .filter((shift) => parisDay(shift.starts_at) === today)
                .map((shift) => shift.profile_id),
            ).size,
            detail: "Selon le planning",
            icon: UserCheck,
          },
          {
            id: "appointments" as const,
            title: "Rendez-vous aujourd’hui",
            value: trade.agenda?.today ?? 0,
            detail: "Hors annulés et absents",
            icon: CalendarDays,
          },
          {
            id: "salon-stock" as const,
            title: "Produits sous le seuil",
            value: trade.salonStock?.low ?? 0,
            detail: "À recommander",
            icon: Package,
          },
          {
            id: "sites" as const,
            title: "Chantiers en cours",
            value: trade.sites?.active ?? 0,
            detail: "D’après le planning",
            icon: HardHat,
          },
          {
            id: "quotes" as const,
            title: "Devis en attente",
            value: trade.quotes?.pending ?? 0,
            detail: "Envoyés, sans réponse",
            icon: FileText,
          },
          {
            id: "reserves" as const,
            title: "Réserves à lever",
            value: trade.reports?.reservesOpen ?? 0,
            detail: "Chantiers concernés",
            icon: ClipboardCheck,
          },
          {
            id: "equipment" as const,
            title: "Matériel à entretenir",
            value: trade.equipment?.due ?? 0,
            detail: "Dans les 7 jours",
            icon: Wrench,
          },
          {
            id: "followups" as const,
            title: "Relances paniers",
            value: trade.followups?.week ?? 0,
            detail: "Sur les 7 derniers jours",
            icon: Mail,
          },
        ]
          .filter((m) => shown(m.id))
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
        {shown("sales") && (
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
        {shown("goal") && (
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
        {shown("service") && (
          <section className="card">
            <div className="section-heading">
              <h2>{restaurantTrade ? "À la une du service" : "À la une de l’activité"}</h2>
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
                        ? t(`Table ${o.table_number}`)
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
                <h3>{restaurantTrade ? "Prêt pour les premières tablées." : "Prêt pour vos premiers clients."}</h3>
                <p>
                  {restaurantTrade
                    ? "Ouvrez une table depuis le plan de salle pour commencer le service."
                    : "Enregistrez une commande ou ouvrez un poste depuis le plan de l’espace pour commencer."}
                </p>
                <button
                  className="text-button"
                  onClick={() => navigate(restaurantTrade ? "dining" : "operations")}
                >
                  {restaurantTrade ? "Ouvrir la salle →" : "Ouvrir mes opérations →"}
                </button>
              </div>
            )}
          </section>
        )}
        {shown("favorites") && (
          <section className="card">
            <div className="section-heading">
              <h2>{restaurantTrade ? "Les favoris de la maison" : "Les meilleures ventes"}</h2>
              <span className="eyebrow">{restaurantTrade ? "QUANTITÉS SERVIES" : "QUANTITÉS VENDUES"}</span>
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
        {shown("agenda") && (
          <section className="card">
            <div className="section-heading">
              <h2>Prochains rendez-vous</h2>
              <button
                className="text-button"
                onClick={() => navigate("tool-appointment-booking")}
              >
                Agenda <ArrowRight size={14} />
              </button>
            </div>
            {trade.agenda?.upcoming.length ? (
              trade.agenda.upcoming.map((appointment) => (
                <div className="compact-row" key={appointment.start + appointment.client}>
                  <span className="mini-icon">
                    <CalendarDays size={18} />
                  </span>
                  <div>
                    <b>{appointment.client}</b>
                    <small>
                      {dateTime(appointment.start)}
                      {appointment.service ? ` · ${appointment.service}` : ""}
                    </small>
                  </div>
                  <span className="pill">{appointment.status}</span>
                </div>
              ))
            ) : (
              <p className="muted">Aucun rendez-vous à venir.</p>
            )}
          </section>
        )}
        {shown("qr") && (
          <QrOverviewCard
            restaurant={data.restaurant.id}
            onOpen={() => navigate("qr")}
          />
        )}
      </div>
      {shown("news") && (
        <>
          <div className="section-heading">
            <h2>Dernières nouvelles</h2>
            <button
              className="text-button"
              onClick={() => navigate("activity")}
            >
              Journal d’activité →
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
