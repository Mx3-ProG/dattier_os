"use client";
import { workspaceNavigation } from "@/features/navigation/catalog";
import { restaurantOnlyNavigation } from "@/features/onboarding/catalog";
import { dashboardEntries } from "@/features/modules/display";
import { currentNavigation } from "@/core/navigation/registry";
import { moduleCategory } from "@/features/appearance/categories";
import { CategoryBadge } from "./appearance/category-badge";
import {
  AppearanceScope,
  AppearanceButton,
} from "@/components/appearance/appearance";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useState, useRef } from "react";
import {
  LayoutDashboard,
  UtensilsCrossed,
  ClipboardList,
  ChefHat,
  Wine,
  CalendarDays,
  Package,
  BookOpen,
  Truck,
  Users,
  Clock,
  Wallet,
  ClipboardCheck,
  FileText,
  FileSignature,
  Landmark,
  CalendarOff,
  HandCoins,
  Banknote,
  Receipt,
  Heart,
  Settings,
  Activity,
  Globe,
  Earth,
  Calculator,
  Bell,
  Menu,
  ChevronDown,
  ArrowUpRight,
  Leaf,
  ShieldCheck,
  GraduationCap,
  QrCode,
} from "lucide-react";
import { roleLabels } from "@/lib/permissions";
import type { Snapshot } from "@/lib/types";
import { Dining, Kds, OrderList } from "./operations";
import { AddonsCenter } from "./addons-center";
import {
  LoadingScreenSync,
  TenantLoader,
} from "./loading-screens/tenant-loader";
import { Management } from "./management";
import { NotificationsPage } from "./notifications";
import { HistoryPage } from "./history";
import dynamic from "next/dynamic";
const Overview = dynamic(() => import("./overview").then((m) => m.Overview), {
  loading: () => <p>Chargement du tableau de bord…</p>,
});
const Finance = dynamic(() => import("./overview").then((m) => m.Finance));
const BillingCenter = dynamic(() =>
  import("./billing-center").then((m) => m.BillingCenter),
);
const HrCenter = dynamic(() => import("./hr-center").then((m) => m.HrCenter));
const BankCenter = dynamic(() =>
  import("./bank-center").then((m) => m.BankCenter),
);
const InvoicesCenter = dynamic(() =>
  import("./invoices-center").then((m) => m.InvoicesCenter),
);
const PayoutsCenter = dynamic(() =>
  import("./payouts-center").then((m) => m.PayoutsCenter),
);
// Le globe et three.js ne sont téléchargés qu’à l’ouverture de cette page.
const EarthTracker = dynamic(() =>
  import("./analytics/earth-tracker").then((m) => m.EarthTracker),
);
const EstimationCenter = dynamic(() => import("./estimation/center").then((m) => m.EstimationCenter));
const ProspectScannerCenter = dynamic(() => import("./pilotage-addons/center").then((m) => m.ProspectScannerCenter));
const PipelineCrmCenter = dynamic(() => import("./pilotage-addons/center").then((m) => m.PipelineCrmCenter));
const CustomerHealthCenter = dynamic(() => import("./pilotage-addons/center").then((m) => m.CustomerHealthCenter));
const OffersCenter = dynamic(() => import("./offers/offers-center").then((m) => m.OffersCenter));
const TradeCenter = dynamic(() => import("./trade/trade-center").then((m) => m.TradeCenter));
const FinanceCenter = dynamic(() =>
  import("./finance-center").then((m) => m.FinanceCenter),
);
import { Tutorial } from "./tutorial/tour";
import { CuisineIa } from "./assistant/cuisine-ia";
import { QrPortfolio } from "./qr/qr-portfolio";
const navigationIcons = {
  Package,
  LayoutDashboard,
  Activity,
  QrCode,
  UtensilsCrossed,
  ClipboardList,
  ChefHat,
  Wine,
  CalendarDays,
  BookOpen,
  Truck,
  Users,
  Clock,
  CalendarOff,
  Wallet,
  ClipboardCheck,
  FileSignature,
  FileText,
  Landmark,
  HandCoins,
  Banknote,
  Receipt,
  Heart,
  Settings,
  Globe,
  Earth,
  Calculator,
  ShieldCheck,
};
const decorateNavigation = (
  entries: ReturnType<typeof workspaceNavigation.list>,
) => entries.map((entry) => ({ ...entry, icon: navigationIcons[entry.icon] }));
const modules = decorateNavigation(workspaceNavigation.list());
const centerPages = {
  notifications: "Notifications",
  history: "Historique",
} as const;
type ModuleGroup = (typeof modules)[number]["group"];
// Barre d’onglets façon app mobile (tablette et téléphone) : cinq entrées
// maximum, chacune regroupant une ou plusieurs familles du menu latéral.
const dockTabs: {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
  groups: ModuleGroup[];
}[] = [
  {
    id: "pilotage",
    label: "Pilotage",
    icon: LayoutDashboard,
    groups: ["PILOTAGE", "PILOTAGE FINANCIER"],
  },
  {
    id: "operations",
    label: "Opérations",
    icon: UtensilsCrossed,
    groups: ["OPÉRATIONS"],
  },
  { id: "gestion", label: "Gestion", icon: Package, groups: ["GESTION"] },
  { id: "equipe", label: "Équipe", icon: Users, groups: ["ÉQUIPE"] },
  { id: "clients", label: "Clients", icon: Heart, groups: ["RELATION CLIENT"] },
];
export function Workspace() {
  const router = useRouter();
  const [data, setData] = useState<Snapshot | null>(null),
    [restaurant, setRestaurant] = useState("bernay"),
    [module, setModule] = useState(""),
    [error, setError] = useState(""),
    [mobile, setMobile] = useState(false),
    [guide, setGuide] = useState(false),
    [dockSheet, setDockSheet] = useState(""),
    [updated, setUpdated] = useState("");
  const cursor = useRef(0);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const r = query.get("restaurant");
    const requestedModule = query.get("module");
    if (r) setRestaurant(r);
    if (
      requestedModule &&
      (requestedModule in centerPages ||
        modules.some((item) => item.id === requestedModule))
    )
      setModule(requestedModule);
  }, []);
  const load = useCallback(async () => {
    const r = await fetch(
      `/api/v1/state?restaurant=${encodeURIComponent(restaurant)}`,
    );
    const d = await r.json();
    if (r.status === 401) {
      router.push("/platform");
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
    cursor.current = 0;
    const timer = setInterval(() => {
      void fetch(
        `/api/restaurants/${encodeURIComponent(restaurant)}/events?after=${cursor.current}`,
      )
        .then((r) => {
          if (!r.ok) throw new Error("Synchronisation indisponible.");
          return r.json();
        })
        .then((d) => {
          const changed = d.cursor !== cursor.current;
          cursor.current = d.cursor;
          if (changed || d.events.length) refresh();
        })
        .catch(() => refresh());
    }, 5000);
    const fallback = setInterval(refresh, 30000);
    return () => {
      alive = false;
      clearInterval(timer);
      clearInterval(fallback);
    };
  }, [load, restaurant]);
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
      return d.result as unknown;
      return d.result;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    }
  }
  const allowed = data
    ? decorateNavigation(
        dashboardEntries(workspaceNavigation.resolve({
          plan: data.plan,
          roles: data.user.roles ?? data.user.role,
          addons: data.addons,
          licenses: data.licenses,
          uninstalledAddons: data.uninstalledAddons,
          activeModules: data.activeModules,
          modules: data.modules,
        }), data.restaurant.industry, restaurantOnlyNavigation, data.moduleDisplay).map((entry) =>
            entry.id === "trade-tools" && data.restaurant.industry !== "restaurant"
              ? { ...entry, name: "Mon métier" } : entry),
      )
    : [];
  // Notifications et historique : pages de l’espace, ouvertes par la cloche.
  const center = Object.hasOwn(centerPages, module)
    ? (module as keyof typeof centerPages)
    : null;
  const current = currentNavigation(
    allowed,
    center ? "" : module,
    data?.user.role,
  );
  const activeId = center ?? current?.id;
  const title = center ? centerPages[center] : current?.name;
  const navigate = (s: string) => {
    if (["site", "security"].includes(s)) {
      router.push(`/restaurant/${restaurant}/${s}`);
      return;
    }
    setModule(s);
    setMobile(false);
    setDockSheet("");
    window.scrollTo({ top: 0 });
  };
  const dock = dockTabs
    .map((tab) => ({
      ...tab,
      items: allowed.filter((m) =>
        (tab.groups as readonly string[]).includes(m.group),
      ),
    }))
    .filter((tab) => tab.items.length > 0);
  const openSheet = dock.find((tab) => tab.id === dockSheet);
  if (!data && !error)
    return (
      <TenantLoader
        restaurant={restaurant}
        label="Votre restaurant se prépare"
      />
    );
  if (!data)
    return (
      <main className="loading">
        <Leaf />
        <h1>STUDIO OS</h1>
        <p>{error || "Votre restaurant se prépare…"}</p>
        <Link href="/platform">Mes restaurants et connexion</Link>
      </main>
    );
  return (
    <AppearanceScope userId={data.user.id} className="workspace">
      <LoadingScreenSync restaurant={restaurant} />
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <Link href="/dashboard" className="brand">
          <span className="brand-mark">
            <Leaf size={23} />
          </span>
          STUDIO OS
        </Link>
        <AppearanceButton />
        <div className="restaurant-switch" data-tour="restaurant-switch">
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
        <nav data-tour="nav">
          {allowed.map((m, i) => (
            <div key={m.id}>
              {(i === 0 || allowed[i - 1].group !== m.group) && (
                <span className="nav-group">{m.group}</span>
              )}
              <button
                className={activeId === m.id ? "active" : ""}
                data-tour={`nav-${m.id}`}
                data-activity-category={moduleCategory(m.id)}
                onClick={() => navigate(m.id)}
              >
                <m.icon size={18} />
                {m.name}
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
        <Link
          href={`/r/${restaurant}`}
          target="_blank"
          className="public-link"
          data-tour="public-link"
        >
          <Globe size={17} /> Voir le site public <ArrowUpRight size={16} />
        </Link>
        <Link
          href={`/restaurant/${restaurant}`}
          className="sidebar-profile"
          data-tour="profile"
        >
          <span className="avatar">{data.user.name.slice(0, 2)}</span>
          <div>
            <b>{data.user.name}</b>
            <small>
              {roleLabels[data.user.role]}
              {data.demo ? " · démo" : ""}
            </small>
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
              Mon établissement <span>/</span> <b>{title}</b>
            </span>
          </div>
          <div className="topbar-actions">
            <span className="live" data-tour="live">
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
              className="guide-button"
              data-tour="guide-button"
              aria-label="Guide et visite guidée"
              onClick={() => setGuide(true)}
            >
              <GraduationCap size={16} /> <span>Guide</span>
            </button>
            <button
              className="icon-button notification-button"
              data-tour="notifications"
              aria-label={`Notifications${data.unreadNotifications ? ` (${data.unreadNotifications} non lues)` : ""}`}
              aria-current={center === "notifications" ? "page" : undefined}
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
        {data.demo ? (
          <div className="demo-banner" data-tour="banner">
            <span>ESPACE DÉMONSTRATION</span> Données fictives · opérations
            locales · aucun encaissement réel{" "}
            <Link href="/demo">Changer de profil →</Link>
          </div>
        ) : (
          <div className="demo-banner" data-tour="banner">
            <span>{data.restaurant.name}</span>
            <Link href={`/restaurant/${restaurant}`}>
              Administrer le restaurant
            </Link>
            <Link href="/platform">Mes restaurants</Link>
          </div>
        )}
        <main
          className="content"
          data-activity-category={moduleCategory(center ? "overview" : current?.id || "overview")}
        >
          <CategoryBadge category={moduleCategory(center ? "overview" : current?.id || "overview")} />
          {error && (
            <div className="error" role="alert">
              {error}
              <button aria-label="Fermer l’erreur" onClick={() => setError("")}>
                ×
              </button>
            </div>
          )}
          {(center || current?.id !== "overview") && (
            <div className="page-heading">
              <span className="eyebrow">{data.restaurant.name}</span>
              <h1>{title}</h1>
            </div>
          )}
          {center === "notifications" ? (
            <NotificationsPage
              data={data}
              act={act}
              allowed={allowed.map((m) => m.id)}
              navigate={navigate}
            />
          ) : center === "history" ? (
            <HistoryPage key={restaurant} data={data} />
          ) : current?.id === "addons" ? (
            <AddonsCenter
              key={restaurant}
              plan={data.plan}
              restaurant={restaurant}
              accountId={data.user.id}
              accessibleModules={allowed.map((entry) => entry.id)}
              moduleDisplay={data.moduleDisplay ?? []}
              industry={data.restaurant.industry}
              navigate={navigate}
              onModulesChanged={load}
            />
          ) : current?.id === "overview" ? (
            data.restaurant.industry && data.restaurant.industry !== "restaurant"
              ? <section className="card"><h1>Bienvenue chez {data.restaurant.name}</h1><p>Votre espace {data.restaurant.trade || "professionnel"} réunit vos outils, votre équipe et votre activité.</p><div className="actions"><button onClick={() => navigate("trade-tools")}>Ouvrir mes outils métier</button><Link href={"/restaurant/" + restaurant + "/import-clients"}>Importer des clients</Link><Link href={"/restaurant/" + restaurant + "?module=team"}>Inviter mon équipe</Link></div></section>
              : <Overview data={data} navigate={navigate} />
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
          ) : current?.id === "qr" ? (
            <QrPortfolio restaurant={restaurant} />
          ) : current?.id === "audience" ? (
            <EarthTracker key={restaurant} restaurant={restaurant} />
          ) : current?.id === "estimation" ? (
            <EstimationCenter key={restaurant} restaurant={restaurant} />
          ) : current?.id === "prospect-scanner" ? (
            <ProspectScannerCenter key={restaurant} restaurant={restaurant} onOpenCrm={() => navigate("pipeline-crm")} />
          ) : current?.id === "pipeline-crm" ? (
            <PipelineCrmCenter key={restaurant} restaurant={restaurant} />
          ) : current?.id === "customer-health" ? (
            <CustomerHealthCenter key={restaurant} restaurant={restaurant} />
          ) : current?.id === "services" || current?.id === "products" ? (
            <OffersCenter
              key={`${current.id}-${restaurant}`}
              restaurant={restaurant}
              kind={current.id}
              onOpenSite={allowed.some((entry) => entry.id === "site") ? () => navigate("site") : undefined}
              onOpenStock={allowed.some((entry) => entry.id === "stocks") ? () => navigate("stocks") : undefined}
            />
          ) : current?.id === "trade-tools" ? (
            <TradeCenter key={restaurant} restaurant={restaurant} act={act} onOpenStore={() => navigate("addons")} />
          ) : current?.id === "finance" ? (
            <Finance data={data} />
          ) : current?.id === "accounting" ? (
            <FinanceCenter key={restaurant} restaurant={restaurant} />
          ) : current?.id === "billing" ? (
            <BillingCenter key={restaurant} restaurant={restaurant} />
          ) : current?.id === "invoices" ? (
            <InvoicesCenter key={restaurant} restaurant={restaurant} />
          ) : current?.id === "bank" ? (
            <BankCenter key={restaurant} restaurant={restaurant} />
          ) : current?.id === "hr" || current?.id === "payroll" ? (
            <HrCenter
              key={`${current.id}-${restaurant}`}
              restaurant={restaurant}
              payrollView={current.id === "payroll"}
            />
          ) : current?.id === "payouts" ? (
            <PayoutsCenter key={restaurant} restaurant={restaurant} />
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
          STUDIO OS <span>Un service bien orchestré.</span>
          <small>
            {data.demo
              ? "Démonstration · données fictives"
              : "STUDIO OS · commandes et stocks partagés"}
          </small>
        </footer>
      </div>
      {dock.length > 0 && (
        <>
          {openSheet && (
            <>
              <button
                className="dock-scrim"
                aria-label="Fermer le menu"
                onClick={() => setDockSheet("")}
              />
              <div
                className="dock-sheet"
                role="dialog"
                aria-label={openSheet.label}
              >
                {openSheet.items.map((m, i) => (
                  <div key={m.id}>
                    {(i === 0 || openSheet.items[i - 1].group !== m.group) &&
                      openSheet.groups.length > 1 && (
                        <span className="nav-group">{m.group}</span>
                      )}
                    <button
                      className={activeId === m.id ? "active" : ""}
                      onClick={() => navigate(m.id)}
                    >
                      <m.icon size={18} />
                      {m.name}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
          <nav className="workspace-dock" aria-label="Navigation rapide">
            {dock.map((tab) => {
              const active = tab.items.some((m) => m.id === activeId);
              return (
                <button
                  key={tab.id}
                  className={`${active ? "active" : ""} ${dockSheet === tab.id ? "open" : ""}`}
                  aria-current={active ? "page" : undefined}
                  aria-expanded={
                    tab.items.length > 1 ? dockSheet === tab.id : undefined
                  }
                  onClick={() =>
                    tab.items.length === 1
                      ? navigate(tab.items[0].id)
                      : setDockSheet(dockSheet === tab.id ? "" : tab.id)
                  }
                >
                  <tab.icon size={21} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </>
      )}
      {data.restaurant.industry === "restaurant" && <CuisineIa restaurant={restaurant} execute={act} onNavigate={navigate} />}
      {data.restaurant.industry === "restaurant" && <Tutorial
        data={data}
        restaurant={restaurant}
        modules={allowed.map((m) => m.id)}
        navigate={navigate}
        open={guide}
        setOpen={setGuide}
      />}
    </AppearanceScope>
  );
}
