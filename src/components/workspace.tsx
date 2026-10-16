"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Globe,
  Bell,
  Menu,
  ChevronDown,
  ArrowUpRight,
  Leaf,
} from "lucide-react";
import { modules } from "./modules";
import { can, type Permission, roleLabels } from "@/lib/permissions";
import type { Snapshot } from "@/lib/types";
import { Dining, Kds, OrderList } from "./operations";
import { Management } from "./management";
import { NotificationsPage } from "./notifications";
import { HistoryPage } from "./history";
import dynamic from "next/dynamic";
const Overview = dynamic(() => import("./overview").then((m) => m.Overview), {
  loading: () => <p>Chargement du tableau de bord…</p>,
});
const Finance = dynamic(() => import("./overview").then((m) => m.Finance));
export function Workspace() {
  const router = useRouter();
  const [data, setData] = useState<Snapshot | null>(null),
    [restaurant, setRestaurant] = useState("bernay"),
    [module, setModule] = useState(""),
    [error, setError] = useState(""),
    [mobile, setMobile] = useState(false),
    [updated, setUpdated] = useState("");
  const load = useCallback(async () => {
    const r = await fetch(
      `/api/v1/state?restaurant=${encodeURIComponent(restaurant)}`,
    );
    const d = await r.json();
    if (r.status === 401) {
      router.push("/demo");
      return;
    }
    if (!r.ok) throw new Error(d.error);
    setData(d);
    setUpdated(new Date().toLocaleTimeString("fr-FR"));
  }, [restaurant, router]);
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      load().catch((e) => {
        if (alive) setError(e.message);
      });
    void refresh();
    const timer = setInterval(refresh, 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [load]);
  async function act(action: Record<string, unknown>) {
    try {
      const r = await fetch("/api/v1/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...action, restaurant }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setError("");
      await load();
    } catch (e) {
      setError((e as Error).message);
      throw e;
    }
  }
  const allowed = data
    ? modules.filter(
        (m) => !m.permission || can(data.user, m.permission as Permission),
      )
    : [];
  const current =
    allowed.find((m) => m.id === module) ||
    allowed.find(
      (m) =>
        m.id ===
        (data?.user.role === "CHEF"
          ? "kitchen"
          : data?.user.role === "BARTENDER"
            ? "bar"
            : ""),
    ) ||
    allowed.find((m) => m.id !== "notifications" && m.id !== "history") ||
    allowed[0];
  const navigate = (s: string) => {
    setModule(s);
    setMobile(false);
  };
  if (!data)
    return (
      <main className="loading">
        <Leaf />
        <h1>DATTIER OS</h1>
        <p>{error || "Votre restaurant se prépare…"}</p>
        <Link href="/demo">Choisir un profil</Link>
      </main>
    );
  return (
    <div className="workspace">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <Link href="/dashboard" className="brand">
          <span className="brand-mark">
            <Leaf size={23} />
          </span>
          DATTIER <span>OS</span>
        </Link>
        <div className="restaurant-switch">
          <small>VOTRE ÉTABLISSEMENT</small>
          <select
            aria-label="Établissement"
            value={restaurant}
            onChange={(e) => {
              setRestaurant(e.target.value);
              setModule("");
            }}
          >
            {data.restaurants.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <nav>
          {allowed.map((m, i) => (
            <div key={m.id}>
              {(i === 0 || allowed[i - 1].group !== m.group) && (
                <span className="nav-group">{m.group}</span>
              )}
              <button
                className={current?.id === m.id ? "active" : ""}
                onClick={() => navigate(m.id)}
              >
                <m.icon size={18} />
                {m.name}
                {m.id === "notifications" && data.unreadNotifications > 0 && (
                  <span className="nav-count">{data.unreadNotifications}</span>
                )}
                {m.id === "orders" &&
                  data.orders.some((o) => o.status === "active") && (
                    <span className="nav-count">
                      {data.orders.filter((o) => o.status === "active").length}
                    </span>
                  )}
              </button>
            </div>
          ))}
        </nav>
        <Link href="/" target="_blank" className="public-link">
          <Globe size={17} /> Voir le site public <ArrowUpRight size={16} />
        </Link>
        <Link href="/demo" className="sidebar-profile">
          <span className="avatar">{data.user.name.slice(0, 2)}</span>
          <div>
            <b>{data.user.name}</b>
            <small>{roleLabels[data.user.role]} · démo</small>
          </div>
          <ChevronDown size={16} />
        </Link>
      </aside>
      {mobile && (
        <button
          className="sidebar-scrim"
          aria-label="Fermer la navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="workspace-main">
        <header className="topbar">
          <div>
            <button
              className="icon-button mobile-toggle"
              aria-label="Ouvrir la navigation"
              onClick={() => setMobile(!mobile)}
            >
              <Menu />
            </button>
            <span className="breadcrumb">
              Mon restaurant <span>/</span> <b>{current?.name}</b>
            </span>
          </div>
          <div className="topbar-actions">
            <span className="live">
              <i /> Synchro {updated}
            </span>
            <span className="date">
              {new Date().toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </span>
            <button
              className="icon-button notification-button"
              aria-label={`Notifications${data.unreadNotifications ? ` (${data.unreadNotifications} non lues)` : ""}`}
              aria-current={
                current?.id === "notifications" ? "page" : undefined
              }
              onClick={() => navigate("notifications")}
            >
              <Bell size={20} />
              {data.unreadNotifications > 0 && (
                <i>
                  {data.unreadNotifications > 99
                    ? "99+"
                    : data.unreadNotifications}
                </i>
              )}
            </button>
            <Link href="/demo" className="avatar small">
              {data.user.name.slice(0, 1)}
            </Link>
          </div>
        </header>
        <div className="demo-banner">
          <span>ESPACE DÉMONSTRATION</span> Données fictives · opérations
          locales · aucun encaissement réel{" "}
          <Link href="/demo">Changer de profil →</Link>
        </div>
        <main className="content">
          {error && (
            <div className="error" role="alert">
              {error}
              <button aria-label="Fermer l’erreur" onClick={() => setError("")}>
                ×
              </button>
            </div>
          )}
          {current?.id !== "overview" && (
            <div className="page-heading">
              <span className="eyebrow">{data.restaurant.name}</span>
              <h1>{current?.name}</h1>
            </div>
          )}
          {current?.id === "overview" ? (
            <Overview data={data} navigate={navigate} />
          ) : current?.id === "dining" ? (
            <Dining data={data} act={act} />
          ) : current?.id === "orders" ? (
            <OrderList data={data} act={act} />
          ) : current?.id === "kitchen" || current?.id === "bar" ? (
            <Kds
              data={data}
              station={current.id === "kitchen" ? "kitchen" : "bar"}
              act={act}
            />
          ) : current?.id === "notifications" ? (
            <NotificationsPage
              data={data}
              act={act}
              allowed={allowed.map((m) => m.id)}
              navigate={navigate}
            />
          ) : current?.id === "history" ? (
            <HistoryPage key={restaurant} data={data} />
          ) : current?.id === "finance" ? (
            <Finance data={data} />
          ) : (
            <Management
              key={`${current?.id}-${restaurant}`}
              module={current?.id || ""}
              data={data}
              act={act}
            />
          )}
        </main>
        <footer className="workspace-footer">
          DATTIER OS <span>Un service bien orchestré.</span>
          <small>V0 locale · données fictives</small>
        </footer>
      </div>
    </div>
  );
}
