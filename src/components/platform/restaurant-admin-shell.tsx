"use client";

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
import { can, roleLabels, type Role } from "@/lib/permissions";
import {
  availableRestaurantModules,
  restaurantModuleHref,
  type RestaurantModuleId,
} from "@/features/platform/admin-navigation";
import { CuisineIa } from "@/components/assistant/cuisine-ia";
import "./platform.css";

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
  plan,
  userRoles,
  activeModule,
  pageTitle,
  contentClassName,
  children,
  demo = false,
}: {
  restaurant: string;
  restaurantName: string;
  plan: number;
  userRoles: Role[];
  activeModule?: RestaurantModuleId;
  pageTitle?: string;
  contentClassName?: string;
  children: ReactNode;
  demo?: boolean;
}) {
  const [mobile, setMobile] = useState(false);
  const modules = availableRestaurantModules(userRoles, plan);
  const dashboard = `/dashboard?restaurant=${encodeURIComponent(restaurant)}`;
  const isSite = activeModule === "site";
  const title = isSite
    ? "Mon site web"
    : modules.find((m) => m.id === activeModule)?.label ||
      pageTitle ||
      "Mon restaurant";
  useEffect(() => {
    if (!mobile) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobile(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [mobile]);
  return (
    <div
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
          atacuisine
        </Link>
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
        <nav aria-label="Navigation du restaurant">
          <span className="nav-group">POSTE DE TRAVAIL</span>
          <Link className="restaurant-nav-link" href={dashboard}>
            <LayoutDashboard size={18} />
            Vue d’ensemble
          </Link>
          <span className="nav-group">MON RESTAURANT</span>
          {modules.map(({ id, label }) => {
            const Icon = moduleIcons[id];
            return (
              <Link
                key={id}
                className={`restaurant-nav-link ${activeModule === id ? "active" : ""}`}
                href={restaurantModuleHref(restaurant, id)}
                aria-current={activeModule === id ? "page" : undefined}
                onClick={() => setMobile(false)}
              >
                <Icon size={18} />
                <span>{id === "site" ? "Mon site web" : label}</span>
              </Link>
            );
          })}
          <span className="nav-group">MON ESPACE</span>
          <Link className="restaurant-nav-link" href="/platform">
            <Store size={18} />
            Mes restaurants
          </Link>
          {can(userRoles, "orders") && (
            <Link
              className="restaurant-nav-link"
              href={`/offline?restaurant=${encodeURIComponent(restaurant)}`}
            >
              <Wifi size={18} />
              Mode hors ligne
            </Link>
          )}
        </nav>
        {plan >= 69 && (
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
            <span>Mon restaurant</span>
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
          {!isSite && (
            <div className="restaurant-page-heading">
              <span>{restaurantName} · MON RESTAURANT</span>
              <h1>{title}</h1>
              {activeModule && moduleDescriptions[activeModule] && (
                <p>{moduleDescriptions[activeModule]}</p>
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
      <CuisineIa restaurant={restaurant} />
    </div>
  );
}
