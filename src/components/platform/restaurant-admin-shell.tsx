"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  BadgePercent,
  ChevronRight,
  Globe2,
  LayoutDashboard,
  Leaf,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Store,
  UsersRound,
  Wifi,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { can, roleLabels, type Role } from "@/lib/permissions";
import {
  availableRestaurantModules,
  restaurantModuleHref,
  type RestaurantModuleId,
} from "@/features/platform/admin-navigation";
import { plans } from "@/features/platform/pricing";
import { CuisineIa, openCuisineIa } from "@/components/assistant/cuisine-ia";
import "./platform.css";

const moduleIcons = {
  team: UsersRound,
  shop: Store,
  loyalty: BadgePercent,
  site: Globe2,
  domains: Globe2,
  seo: ArrowUpRight,
  inventory: PackageCheck,
  security: ShieldCheck,
  reconciliation: Wifi,
  integrations: PackageCheck,
} satisfies Record<RestaurantModuleId, LucideIcon>;

const quickActions: RestaurantModuleId[] = [
  "shop",
  "team",
  "inventory",
  "site",
  "security",
];

export function RestaurantAdminShell({
  restaurant,
  restaurantName,
  plan,
  userRoles,
  activeModule,
  pageTitle,
  contentClassName,
  children,
}: {
  restaurant: string;
  restaurantName: string;
  plan: number;
  userRoles: Role[];
  activeModule?: RestaurantModuleId;
  pageTitle?: string;
  contentClassName?: string;
  children: ReactNode;
}) {
  const modules = availableRestaurantModules(userRoles, plan);
  const quick = [...new Set([...(activeModule ? [activeModule] : []), ...quickActions])]
    .filter((id) => modules.some((module) => module.id === id))
    .slice(0, 4);
  const planTitle = plans.find((item) => item.price === plan)?.title;

  return (
    <main className="platform restaurant-admin-shell">
      <header className="admin-shell-header">
        <div className="admin-shell-top">
          <Link className="admin-shell-brand" href="/platform">
            <span className="admin-shell-mark">
              <Leaf size={18} />
            </span>
            <span>atacuisine</span>
          </Link>
          <div className="admin-shell-context">
            <Link href="/platform">Mes restaurants</Link>
            <ChevronRight size={14} aria-hidden="true" />
            <strong title={restaurantName}>{restaurantName}</strong>
            {planTitle && <span className="admin-plan-badge">{planTitle}</span>}
            {userRoles[0] && (
              <span
                className="admin-role-badge"
                title={userRoles.map((role) => roleLabels[role]).join(" · ")}
              >
                {roleLabels[userRoles[0]]}
                {userRoles.length > 1 ? ` +${userRoles.length - 1}` : ""}
              </span>
            )}
          </div>
          <div className="admin-shell-actions">
            <button
              type="button"
              className="admin-shell-secondary admin-ia-link"
              onClick={() => openCuisineIa()}
            >
              <Sparkles size={16} />
              <span>Cuisine IA</span>
            </button>
            {plan >= 69 && (
              <Link
                className="admin-shell-secondary"
                href={`/r/${encodeURIComponent(restaurant)}`}
                target="_blank"
              >
                <Globe2 size={16} />
                <span>Voir le site</span>
                <ArrowUpRight size={13} />
              </Link>
            )}
            {can(userRoles, "orders") && (
              <Link
                className="admin-shell-secondary admin-offline-link"
                href={`/offline?restaurant=${encodeURIComponent(restaurant)}`}
              >
                <Wifi size={16} />
                <span>Hors ligne</span>
              </Link>
            )}
            <Link
              className="admin-shell-primary"
              href={`/dashboard?restaurant=${encodeURIComponent(restaurant)}`}
            >
              <LayoutDashboard size={16} />
              <span>Poste de travail</span>
            </Link>
          </div>
        </div>
        <nav className="admin-module-nav" aria-label="Administration du restaurant">
          <div className="admin-module-nav-inner">
            {modules.map(({ id, label }) => {
              const Icon = moduleIcons[id];
              return (
                <Link
                  key={id}
                  href={restaurantModuleHref(restaurant, id)}
                  aria-current={activeModule === id ? "page" : undefined}
                  title={label}
                >
                  <Icon size={15} aria-hidden="true" />
                  <span>{id === "seo" ? "SEO et IA" : label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      <div className={`admin-shell-content ${contentClassName ?? ""}`}>
        {pageTitle && (
          <div className="admin-page-heading">
            <span>{restaurantName} · {userRoles.map((role) => roleLabels[role]).join(" · ")}</span>
            <h1>{pageTitle}</h1>
          </div>
        )}
        {children}
      </div>

      <nav className="admin-action-dock" aria-label="Raccourcis rapides">
        <div className="admin-action-dock-inner">
          <Link className="admin-dock-item" href="/platform">
            <Store size={18} aria-hidden="true" />
            <span>Restaurants</span>
          </Link>
          {quick.map((id) => {
            const moduleInfo = modules.find((candidate) => candidate.id === id)!;
            const Icon = moduleIcons[id];
            const label =
              id === "shop"
                ? "Commandes"
                : id === "inventory"
                  ? "Stocks"
                  : moduleInfo.label;
            return (
              <Link
                className="admin-dock-item"
                key={id}
                href={restaurantModuleHref(restaurant, id)}
                aria-current={activeModule === id ? "page" : undefined}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            );
          })}
          <Link
            className="admin-dock-item admin-dock-primary"
            href={`/dashboard?restaurant=${encodeURIComponent(restaurant)}`}
          >
            <LayoutDashboard size={18} aria-hidden="true" />
            <span>Poste de travail</span>
          </Link>
        </div>
      </nav>
      <CuisineIa restaurant={restaurant} docked />
    </main>
  );
}
