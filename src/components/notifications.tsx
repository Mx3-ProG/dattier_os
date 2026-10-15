"use client";
import { useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { can } from "@/lib/permissions";
import { dateTime } from "@/lib/domain";
import type { Notice, Snapshot } from "@/lib/types";
import {
  isNotificationType,
  notificationCatalog,
  notificationTypes,
} from "@/features/notifications/catalog";
type Act = (a: Record<string, unknown>) => Promise<void>;
const priorityLabels: Record<Notice["priority"], string> = {
  low: "Info",
  normal: "À savoir",
  high: "Important",
  critical: "Urgent",
};
const label = (type: string) =>
  isNotificationType(type) ? notificationCatalog[type].label : "Information";
export function NotificationCenter({
  data,
  act,
  modules,
  navigate,
  close,
}: {
  data: Snapshot;
  act: Act;
  modules: string[];
  navigate: (module: string) => void;
  close: () => void;
}) {
  const [tab, setTab] = useState<"all" | "unread" | "settings">("all"),
    [pending, setPending] = useState<Record<string, boolean>>({});
  const quiet = () => {};
  const open = (n: Notice) => {
    if (!n.read) act({ action: "read", id: n.id }).catch(quiet);
    if (n.module && modules.includes(n.module)) {
      navigate(n.module);
      close();
    }
  };
  const list =
    tab === "unread"
      ? data.notifications.filter((n) => !n.read)
      : data.notifications;
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
  const receivable = notificationTypes.filter((t) => {
    const p = notificationCatalog[t].permissions;
    return !p || p.some((x) => can(data.user, x));
  });
  return (
    <section
      className="notification-panel card"
      aria-label="Centre de notifications"
    >
      <div className="section-heading">
        <h2>
          Notifications{" "}
          {data.unreadNotifications > 0 && (
            <span className="pill">{data.unreadNotifications} non lues</span>
          )}
        </h2>
        <button
          aria-label="Fermer les notifications"
          className="icon-button"
          onClick={close}
        >
          <X />
        </button>
      </div>
      <div className="notification-tabs" role="tablist">
        {(
          [
            ["all", "Toutes"],
            ["unread", "Non lues"],
            ["settings", "Préférences"],
          ] as const
        ).map(([id, name]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {name}
          </button>
        ))}
      </div>
      {tab === "settings" ? (
        <div className="notification-preferences">
          <p className="muted">
            Choisissez les alertes que vous recevez. Les alertes urgentes
            restent toujours affichées.
          </p>
          {receivable.map((t) => {
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
                  <small>
                    {kind.group}
                    {locked ? " · toujours active" : ""}
                  </small>
                </span>
              </label>
            );
          })}
        </div>
      ) : (
        <>
          {data.unreadNotifications > 0 && (
            <button
              className="text-button"
              onClick={() => act({ action: "read" }).catch(quiet)}
            >
              Tout marquer comme lu
            </button>
          )}
          {!list.length && (
            <p className="muted">
              {tab === "unread"
                ? "Tout est à jour."
                : "Aucune notification pour le moment."}
            </p>
          )}
          {list.map((n) => (
            <button
              className={`notification priority-${n.priority} ${n.read ? "read" : ""}`}
              key={n.id}
              onClick={() => open(n)}
            >
              <span className="notification-meta">
                <span className="notification-tag">
                  {priorityLabels[n.priority]}
                </span>
                {label(n.type)}
                {!n.read && <i aria-label="Non lue" />}
              </span>
              <b>{n.message}</b>
              <small>
                {dateTime(n.created_at)}
                {n.module && modules.includes(n.module) && (
                  <>
                    {" "}
                    · Ouvrir <ArrowUpRight size={12} />
                  </>
                )}
              </small>
            </button>
          ))}
        </>
      )}
    </section>
  );
}
