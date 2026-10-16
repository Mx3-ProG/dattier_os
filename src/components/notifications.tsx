"use client";
import { createElement, useState } from "react";
import {
  ArrowUpRight,
  Bell,
  CheckCheck,
  History,
  SlidersHorizontal,
} from "lucide-react";
import { can, type Subject } from "@/lib/permissions";
import { dateTime } from "@/lib/domain";
import type { Notice, Snapshot } from "@/lib/types";
import {
  categories,
  category,
  notificationRetentionDays,
  targetModule,
} from "@/features/events/categories";
import {
  isNotificationType,
  notificationCatalog,
  notificationTypes,
  type NotificationType,
} from "@/features/notifications/catalog";
import { modules } from "./modules";
type Act = (a: Record<string, unknown>) => Promise<void>;
const quiet = () => {};
export const priorityLabels: Record<Notice["priority"], string> = {
  low: "Info",
  normal: "À savoir",
  high: "Important",
  critical: "Urgent",
};
const icons = new Map<string, (typeof modules)[number]["icon"]>(
  modules.map((m) => [m.id, m.icon]),
);
export const CategoryIcon = ({
  id,
  size = 17,
}: {
  id: string;
  size?: number;
}) => {
  return createElement(icons.get(id) ?? Bell, { size, "aria-hidden": true });
};
const typeLabel = (type: string) =>
  isNotificationType(type) ? notificationCatalog[type].label : "Information";
/** Une rubrique est visible si le profil a au moins une de ses permissions. */
export const canSeeCategory = (user: Subject, id: string) => {
  const p = category(id).permissions;
  return !p || p.some((x) => can(user, x));
};
function receivable(user: Subject, t: NotificationType) {
  const kind = notificationCatalog[t];
  if ("permissions" in kind) return kind.permissions.some((x) => can(user, x));
  return kind.categories.some((c) => canSeeCategory(user, c));
}
export function NotificationsPage({
  data,
  act,
  allowed,
  navigate,
}: {
  data: Snapshot;
  act: Act;
  allowed: string[];
  navigate: (module: string) => void;
}) {
  const [filter, setFilter] = useState("all"),
    [unreadOnly, setUnreadOnly] = useState(false),
    [settings, setSettings] = useState(false),
    [pending, setPending] = useState<Record<string, boolean>>({});
  const visible = data.notifications.filter((n) => !unreadOnly || !n.read);
  const grouped = categories
    .map((c) => ({
      ...c,
      items: visible.filter((n) => category(n.module).id === c.id),
      unread: data.notifications.filter(
        (n) => category(n.module).id === c.id && !n.read,
      ).length,
    }))
    .filter((c) => c.items.length);
  const shown = grouped.filter((c) => filter === "all" || c.id === filter);
  const open = (n: Notice) => {
    if (!n.read) act({ action: "read", id: n.id }).catch(quiet);
    const target = targetModule(n.module, allowed);
    if (target) navigate(target);
  };
  const saved = new Set(
    data.notificationPreferences.filter((p) => p.muted).map((p) => p.type),
  );
  const isMuted = (t: string) => pending[t] ?? saved.has(t);
  const toggle = (type: string, muted: boolean) => {
    setPending((p) => ({ ...p, [type]: muted }));
    act({ action: "notificationPreference", type, muted })
      .catch(quiet)
      .finally(() =>
        setPending((p) => {
          const next = { ...p };
          delete next[type];
          return next;
        }),
      );
  };
  const types = notificationTypes.filter((t) => receivable(data.user, t));
  const prefGroups = [
    ...new Set(types.map((t) => notificationCatalog[t].group)),
  ];
  return (
    <div className="notifications-page">
      <div className="notifications-toolbar">
        <p className="muted">
          {data.unreadNotifications
            ? `${data.unreadNotifications} non lue${data.unreadNotifications > 1 ? "s" : ""}`
            : "Tout est lu"}{" "}
          · {notificationRetentionDays} derniers jours, classés par rubrique
        </p>
        <div>
          <button
            className={`chip ${unreadOnly ? "active" : ""}`}
            aria-pressed={unreadOnly}
            onClick={() => setUnreadOnly(!unreadOnly)}
          >
            Non lues seulement
          </button>
          {data.unreadNotifications > 0 && (
            <button
              className="chip"
              onClick={() => act({ action: "read" }).catch(quiet)}
            >
              <CheckCheck size={15} /> Tout marquer comme lu
            </button>
          )}
          <button
            className={`chip ${settings ? "active" : ""}`}
            aria-expanded={settings}
            onClick={() => setSettings(!settings)}
          >
            <SlidersHorizontal size={15} /> Préférences
          </button>
          <button className="chip" onClick={() => navigate("history")}>
            <History size={15} /> Historique complet
          </button>
        </div>
      </div>
      {settings && (
        <section
          className="card notification-preferences"
          aria-label="Préférences de notification"
        >
          <h2>Ce que vous recevez</h2>
          <p className="muted">
            Les alertes urgentes restent toujours affichées.
          </p>
          <div className="preference-groups">
            {prefGroups.map((g) => (
              <fieldset key={g}>
                <legend>{g}</legend>
                {types
                  .filter((t) => notificationCatalog[t].group === g)
                  .map((t) => {
                    const kind = notificationCatalog[t],
                      locked = kind.priority === "critical";
                    return (
                      <label key={t}>
                        <input
                          type="checkbox"
                          checked={locked || !isMuted(t)}
                          disabled={locked}
                          onChange={(e) => toggle(t, !e.target.checked)}
                        />
                        <span>
                          {kind.label}
                          {locked && <small>Toujours active</small>}
                        </span>
                      </label>
                    );
                  })}
              </fieldset>
            ))}
          </div>
        </section>
      )}
      {grouped.length > 1 && (
        <nav className="category-chips" aria-label="Rubriques">
          <button
            className={`chip ${filter === "all" ? "active" : ""}`}
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            Toutes <b>{visible.length}</b>
          </button>
          {grouped.map((c) => (
            <button
              key={c.id}
              className={`chip ${filter === c.id ? "active" : ""}`}
              aria-pressed={filter === c.id}
              onClick={() => setFilter(c.id)}
            >
              <CategoryIcon id={c.id} size={15} /> {c.label}{" "}
              {c.unread > 0 && <b className="chip-count">{c.unread}</b>}
            </button>
          ))}
        </nav>
      )}
      {!shown.length && (
        <div className="card empty-state">
          <p>
            {unreadOnly
              ? "Aucune notification non lue."
              : `Aucune notification ces ${notificationRetentionDays} derniers jours.`}
          </p>
          <button className="text-button" onClick={() => navigate("history")}>
            Consulter l’historique →
          </button>
        </div>
      )}
      <div className="notification-sections">
        {shown.map((c) => {
          const target = targetModule(c.id, allowed);
          return (
            <section
              key={c.id}
              className="card notification-section"
              aria-label={c.label}
            >
              <header>
                <span className="category-icon">
                  <CategoryIcon id={c.id} />
                </span>
                <div>
                  <h2>{c.label}</h2>
                  <small>
                    {c.items.length} notification{c.items.length > 1 ? "s" : ""}
                    {c.unread
                      ? ` · ${c.unread} non lue${c.unread > 1 ? "s" : ""}`
                      : ""}
                  </small>
                </div>
                {target && (
                  <button
                    className="text-button"
                    onClick={() => navigate(target)}
                  >
                    Ouvrir <ArrowUpRight size={14} />
                  </button>
                )}
              </header>
              {c.items.map((n) => (
                <button
                  key={n.id}
                  className={`notification priority-${n.priority} ${n.read ? "read" : ""}`}
                  onClick={() => open(n)}
                >
                  <span className="notification-meta">
                    <span className="notification-tag">
                      {priorityLabels[n.priority]}
                    </span>
                    {!n.message.startsWith(typeLabel(n.type)) &&
                      typeLabel(n.type)}
                    {!n.read && <i aria-label="Non lue" />}
                  </span>
                  <b>{n.message}</b>
                  <small>
                    {n.actor_name ? `Par ${n.actor_name}` : "Automatique"} ·{" "}
                    {dateTime(n.created_at)}
                  </small>
                </button>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
