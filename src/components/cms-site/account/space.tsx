"use client";
/**
 * Panneaux de l'espace client contextuel.
 *
 * Un même composant sert trois usages : le lecteur suit ses articles,
 * l'apprenant suit ses formations et leur progression, le client de services
 * suit ses prestations. Chacun a son onglet, son vide et son contenu.
 */
import { BookOpen, GraduationCap, Headphones, TrendingUp } from "lucide-react";
import type { Account } from "./shared";
import { SectionTitle } from "./shared";
import { longDate } from "./shared";
import type { FollowKind } from "./follow-button";

const KIND_META: Record<
  FollowKind,
  { title: string; empty: string; progress: (p: number) => string }
> = {
  article: {
    title: "Mes articles",
    empty: "Aucun article suivi pour l’instant.",
    progress: (p) => (p >= 100 ? "Lu" : p > 0 ? "En cours" : "À lire"),
  },
  course: {
    title: "Mes formations",
    empty: "Aucune formation suivie pour l’instant.",
    progress: (p) => (p >= 100 ? "Terminée" : p > 0 ? "En cours" : "Non commencée"),
  },
  service: {
    title: "Mes prestations",
    empty: "Aucune prestation suivie pour l’instant.",
    progress: (p) => (p >= 100 ? "Terminée" : p > 0 ? "En cours" : "Planifiée"),
  },
};

/** Onglets de l'espace client, selon le modèle de site choisi. */
export function SpacePanel({
  kind,
  account,
  onUnfollow,
}: {
  kind: FollowKind;
  account: Account;
  onUnfollow: (kind: FollowKind, refId: string) => void;
}) {
  const meta = KIND_META[kind];
  const items = account.follows.filter((f) => f.kind === kind);
  const Icon =
    kind === "article" ? BookOpen : kind === "course" ? GraduationCap : Headphones;
  return (
    <section className="ca-card">
      <SectionTitle
        kicker="Espace personnel"
        title={meta.title}
        action={
          <span className="ca-count">
            <Icon size={15} /> {items.length}
          </span>
        }
      />
      {items.length ? (
        <ul className="ca-follows">
          {items.map((item) => (
            <li key={`${item.kind}-${item.ref_id}`}>
              <span className="ca-follow-main">
                <b>{item.label || item.ref_id}</b>
                <small>
                  {meta.progress(item.progress)} ·{" "}
                  {longDate(item.updated_at)}
                </small>
              </span>
              <span className="ca-follow-bar" aria-hidden="true">
                <span style={{ width: `${item.progress}%` }} />
              </span>
              <button
                type="button"
                className="ca-button ca-button-small ca-button-soft"
                onClick={() => onUnfollow(item.kind, item.ref_id)}
              >
                Retirer
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ca-muted">{meta.empty}</p>
      )}
    </section>
  );
}

/** Progression globale : ce qui est commencé, ce qui est terminé. */
export function SpaceProgress({ account }: { account: Account }) {
  if (!account.follows.length) return null;
  const done = account.follows.filter((f) => f.progress >= 100).length;
  const average = Math.round(
    account.follows.reduce((sum, f) => sum + f.progress, 0) /
      account.follows.length,
  );
  return (
    <section className="ca-card">
      <SectionTitle kicker="Progression" title="Où j’en suis" />
      <div className="ca-progress">
        <div className="ca-progress-row">
          <span>
            <TrendingUp size={15} /> Progression moyenne
          </span>
          <b>{average} %</b>
        </div>
        <span className="ca-progress-bar" aria-hidden="true">
          <span style={{ width: `${average}%` }} />
        </span>
        <p className="ca-muted">
          {done} contenu{done > 1 ? "s" : ""} terminé{done > 1 ? "s" : ""} sur{" "}
          {account.follows.length}.
        </p>
      </div>
    </section>
  );
}
