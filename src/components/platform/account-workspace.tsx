"use client";
import {
  AppearanceScope,
  AppearanceButton,
} from "@/components/appearance/appearance";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  Leaf,
  LayoutDashboard,
  Building2,
  Plus,
  Menu,
  X,
  LogOut,
  ArrowUpRight,
} from "lucide-react";
export function AccountWorkspace({
  children,
  userId,
  name,
  restaurants,
  canCreate,
}: {
  children: ReactNode;
  userId?: string;
  name?: string;
  restaurants: { id: string; name: string; plan: number }[];
  canCreate: boolean;
}) {
  const [mobile, setMobile] = useState(false);
  const first = restaurants.find((r) => r.plan > 0);
  return (
    <AppearanceScope
      userId={userId}
      className="workspace restaurant-workspace account-workspace"
    >
      <aside
        className={`sidebar ${mobile ? "open" : ""}`}
        id="account-navigation"
      >
        <Link href="/platform" className="brand">
          <span className="brand-mark">
            <Leaf size={23} />
          </span>
          atacuisine
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
          <small>VOTRE ESPACE</small>
          <strong>{name || "Mes restaurants"}</strong>
        </div>
        <nav aria-label="Navigation de votre espace">
          <span className="nav-group">PILOTAGE</span>
          <Link
            className="restaurant-nav-link active"
            aria-current="page"
            href="/platform"
          >
            <Building2 size={18} />
            Mes restaurants
          </Link>
          {first && (
            <Link
              className="restaurant-nav-link"
              href={`/dashboard?restaurant=${encodeURIComponent(first.id)}`}
            >
              <LayoutDashboard size={18} />
              Poste de travail
            </Link>
          )}
          <span className="nav-group">MES ÉTABLISSEMENTS</span>
          {restaurants
            .filter((r) => r.plan > 0)
            .map((r) => (
              <Link
                className="restaurant-nav-link"
                key={r.id}
                href={`/restaurant/${encodeURIComponent(r.id)}`}
              >
                <Building2 size={18} />
                <span>{r.name}</span>
              </Link>
            ))}
          {canCreate && (
            <a
              className="restaurant-nav-link"
              href="#ajouter-etablissement"
              onClick={() => setMobile(false)}
            >
              <Plus size={18} />
              Ajouter un établissement
            </a>
          )}
        </nav>
        {name && (
          <form className="account-logout" action="/auth/logout" method="post">
            <button>
              <LogOut size={16} />
              Se déconnecter
            </button>
          </form>
        )}
        <div className="sidebar-profile">
          <span className="avatar">{name?.slice(0, 2) || "AC"}</span>
          <div>
            <b>{name || "Votre compte"}</b>
            <small>Espace de gestion</small>
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
              aria-controls="account-navigation"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            <span>Mon espace</span>
            <span>/</span>
            <strong>Mes restaurants</strong>
          </div>
          {first && (
            <Link
              className="restaurant-back-workspace"
              href={`/dashboard?restaurant=${encodeURIComponent(first.id)}`}
            >
              Poste de travail
              <ArrowUpRight size={15} />
            </Link>
          )}
        </header>
        {children}
      </div>
    </AppearanceScope>
  );
}
