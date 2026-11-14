"use client";
import { moduleCategory } from "@/features/appearance/categories";
import { CategoryBadge } from "@/components/appearance/category-badge";
import {
  AppearanceScope,
  AppearanceButton,
} from "@/components/appearance/appearance";

import Link from "next/link";
import {
  ArrowUpRight,
  BadgePercent,
  Menu,
  X,
  Search,
  Plug,
  Globe2,
  LayoutDashboard,
  Leaf,
  PackageCheck,
  ShieldCheck,
  Store,
  UsersRound,
  Wifi,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { can, roleLabels, type Role } from "@/core/permissions";
import {
  availableRestaurantModules,
  restaurantModuleHref,
  type RestaurantModuleId,
} from "@/features/platform/admin-navigation";
import dynamic from "next/dynamic";
const CuisineIa = dynamic(
  () =>
    import("@/components/assistant/cuisine-ia")
      .then((m) => m.CuisineIa)
      .catch(() => () => null),
  { ssr: false },
);
import { AdminTutorial } from "@/components/tutorial/tour";
import type { Industry } from "@/features/onboarding/catalog";
import "./platform.css";
import { adaptText } from "@/core/tenant/vocabulary";

const moduleIcons = {
  team: UsersRound,
  shop: Store,
  loyalty: BadgePercent,
  site: Globe2,
  domains: Globe2,
  seo: Search,
  inventory: PackageCheck,
  security: ShieldCheck,
  reconciliation: Wifi,
  integrations: Plug,
} satisfies Record<RestaurantModuleId, LucideIcon>;

const moduleDescriptions: Partial<Record<RestaurantModuleId, string>> = {
  team: "Les bonnes personnes, les bons accès. Organisez votre équipe en toute simplicité.",
  shop: "Votre boutique, vos commandes en ligne et les retours de vos clients, au même endroit.",
  loyalty: "Donnez à vos clients de bonnes raisons de revenir.",
  site: "Votre présence en ligne, à votre image.",
  domains:
    "Votre restaurant, à sa propre adresse. Gérez les domaines de votre site.",
  seo: "Aidez vos futurs clients à vous trouver sur les moteurs de recherche et les assistants IA.",
  inventory: "Gardez une vue claire sur vos stocks et vos approvisionnements.",
  security:
    "Suivez la santé de votre établissement et protégez les accès de votre équipe.",
  reconciliation:
    "Retrouvez les opérations à vérifier après une utilisation hors ligne.",
  integrations: "Reliez vos outils aux services de votre restaurant.",
};

export function RestaurantAdminShell({
  restaurant,
  restaurantName,
  industry = "restaurant",
  plan,
  userRoles,
  addons,
  activeModule,
  pageTitle,
  contentClassName,
  children,
  demo = false,
}: {
  restaurant: string;
  restaurantName: string;
  industry?: Industry;
  plan: number;
  userRoles: Role[];
  addons: string[];
  activeModule?: RestaurantModuleId;
  pageTitle?: string;
  contentClassName?: string;
  children: ReactNode;
  demo?: boolean;
}) {
  const [mobile, setMobile] = useState(false);
  const modules = availableRestaurantModules(userRoles, plan, addons);
  const dashboard = `/dashboard?restaurant=${encodeURIComponent(restaurant)}`;
  const isSite = activeModule === "site";
  const title = adaptText(
    isSite
      ? "Mon site web"
      : modules.find((m) => m.id === activeModule)?.label ||
        pageTitle ||
        "Mon établissement",
    industry,
  );
  useEffect(() => {
    if (!mobile) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobile(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [mobile]);
  return (
    <AppearanceScope
      className={`workspace restaurant-workspace ${isSite ? "web-studio-workspace" : ""}`}
    >
      <aside
        className={`sidebar ${mobile ? "open" : ""}`}
        id="restaurant-navigation"
      >
        <Link href={dashboard} className="brand">
          <span className="brand-mark">
            <Leaf size={23} />
          </span>
          STUDIO OS
        </Link>
        <AppearanceButton />
        <button
          className="icon-button admin-sidebar-close"
          aria-label="Fermer la navigation"
          onClick={() => setMobile(false)}
        >
          <X size={18} />
        </button>
        <div className="restaurant-switch">
          <small>VOTRE ÉTABLISSEMENT</small>
          <strong>{restaurantName}</strong>
        </div>
        <nav aria-label="Navigation de l’établissement">
          <span className="nav-group">POSTE DE TRAVAIL</span>
          <Link className="restaurant-nav-link" href={dashboard}>
            <LayoutDashboard size={18} />
            Vue d’ensemble
          </Link>
          <span className="nav-group">{adaptText("Mon restaurant", industry).toUpperCase()}</span>
          {modules.map(({ id, label }) => {
            const Icon = moduleIcons[id];
            return (
              <Link
                key={id}
                data-activity-category={moduleCategory(id)}
                className={`restaurant-nav-link ${activeModule === id ? "active" : ""}`}
                data-tour={`admin-nav-${id}`}
                href={restaurantModuleHref(restaurant, id)}
                aria-current={activeModule === id ? "page" : undefined}
                onClick={() => setMobile(false)}
              >
                <Icon size={18} />
                <span>{adaptText(id === "site" ? "Mon site web" : label, industry)}</span>
              </Link>
            );
          })}
          <span className="nav-group">MON ESPACE</span>
          <Link className="restaurant-nav-link" href="/platform">
            <Store size={18} />
            Mes établissements
          </Link>
          {can(userRoles, "orders") && (
            <Link
              className="restaurant-nav-link"
              data-tour="admin-offline"
              href={`/offline?restaurant=${encodeURIComponent(restaurant)}`}
            >
              <Wifi size={18} />
              Mode hors ligne
            </Link>
          )}
        </nav>
        {plan >= 39 && (
          <Link
            href={`/r/${encodeURIComponent(restaurant)}`}
            target="_blank"
            className="public-link"
          >
            <Globe2 size={17} />
            Voir le site public
            <ArrowUpRight size={16} />
          </Link>
        )}
        <div className="sidebar-profile">
          <span className="avatar">{restaurantName.slice(0, 2)}</span>
          <div>
            <b>{restaurantName}</b>
            <small>{userRoles.map((r) => roleLabels[r]).join(" · ")}</small>
          </div>
        </div>
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
          <div className="restaurant-breadcrumb">
            <button
              className="icon-button mobile-toggle"
              aria-label="Ouvrir la navigation"
              aria-expanded={mobile}
              aria-controls="restaurant-navigation"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            <span>Mon établissement</span>
            <span>/</span>
            <strong>{title}</strong>
          </div>
          <Link className="restaurant-back-workspace" href={dashboard}>
            Poste de travail
            <ArrowUpRight size={15} />
          </Link>
        </header>
        <main
          className={`restaurant-workspace-content ${isSite ? "studio-main" : "platform"} ${contentClassName || ""}`}
        >
          <CategoryBadge
            category={moduleCategory(activeModule || "overview")}
          />
          {!isSite && (
            <div className="restaurant-page-heading">
              <span>{restaurantName} · MON ÉTABLISSEMENT</span>
              <h1>{title}</h1>
              {activeModule && moduleDescriptions[activeModule] && (
                <p>{adaptText(moduleDescriptions[activeModule] ?? "", industry)}</p>
              )}
            </div>
          )}
          {children}
        </main>
        {demo && (
          <footer className="restaurant-demo-note">
            Démonstration · données fictives · aucun paiement réel
          </footer>
        )}
      </div>
      {industry === "restaurant" && <CuisineIa restaurant={restaurant} />}
      {<AdminTutorial
        restaurant={restaurant}
        surface={`admin:${activeModule ?? ""}`}
      />}
    </AppearanceScope>
  );
}

// Alias neutre pour la vision multi-métiers (compatibilité conservée).
export { RestaurantAdminShell as BusinessAdminShell };
