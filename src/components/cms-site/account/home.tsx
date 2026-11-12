"use client";
import {
  ArrowRight,
  CalendarDays,
  Flame,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { QrCode } from "lucide-react";
import { money } from "@/domain/shared/units";
import { CustomerQrSheet } from "./qr-sheet";
import { TenantLink as Link } from "../context";
import {
  countdown,
  longDate,
  Ring,
  SectionTitle,
  useNow,
  type Account,
  type ReorderItem,
} from "./shared";

/** Hero: points ring, level, streak and the two main calls to action. */
export function AccountHero({
  account,
  onJoin,
  joining,
}: {
  account: Account;
  onJoin: () => void;
  joining: boolean;
}) {
  const { customer, rewards, engagement: e } = account;
  const next = [...rewards]
    .sort((a, b) => a.points_cost - b.points_cost)
    .find((r) => r.points_cost > customer.points);
  const available = rewards.filter((r) => r.points_cost <= customer.points);
  const ringValue = next ? customer.points / next.points_cost : 1;
  const first = customer.name.trim().split(/\s+/)[0];
  const [card, setCard] = useState(false);
  return (
    <section className="ca-hero" id="fidelite">
      <div className="ca-hero-text">
        <p className="ca-kicker">Bonjour {first}</p>
        <h1>Mon espace gourmand</h1>
        <div className="ca-chips">
          <span className={`ca-level ca-level-${e.level.key}`}>
            <Sparkles size={14} /> {e.level.name}
          </span>
          {e.streak > 0 && (
            <span className="ca-chip">
              <Flame size={14} /> Série de {e.streak} mois
            </span>
          )}
          {available.length > 0 && (
            <span className="ca-chip ca-chip-accent">
              {available.length} cadeau{available.length > 1 ? "x" : ""} à
              débloquer
            </span>
          )}
        </div>
        {e.level.next ? (
          <div className="ca-level-bar">
            <div>
              <span>Niveau {e.level.next.name}</span>
              <b>encore {e.level.next.missing} pts</b>
            </div>
            <progress max={1} value={e.level.progress} />
          </div>
        ) : (
          <p className="ca-muted">Vous avez atteint le plus haut niveau. Bravo !</p>
        )}
        <div className="ca-cta">
          <Link href="/commander" className="ca-button">
            <ShoppingBag size={18} /> Commander
          </Link>
          <Link href="/reservations" className="ca-button ca-button-soft">
            <CalendarDays size={18} /> Réserver une table
          </Link>
          <button className="ca-button ca-button-soft" onClick={() => setCard(true)}>
            <QrCode size={18} /> Ma carte membre
          </button>
        </div>
        {card && (
          <CustomerQrSheet
            kind="customer"
            title="Ma carte membre"
            description="Présentez-la en caisse : l’équipe retrouve votre compte et vos points en un scan."
            close={() => setCard(false)}
          />
        )}
      </div>
      <div className="ca-hero-ring">
        <Ring value={ringValue}>
          <strong>{customer.points}</strong>
          <span>points</span>
        </Ring>
        {customer.loyaltyConsent ? (
          <p className="ca-ring-caption">
            {next
              ? `${next.points_cost - customer.points} pts avant « ${next.name} »`
              : rewards.length
                ? "Tous vos cadeaux sont disponibles"
                : `${e.settings.points_per_euro} pt gagné par euro`}
          </p>
        ) : (
          <button
            className="ca-button ca-button-small"
            onClick={onJoin}
            disabled={joining}
          >
            {joining ? "Activation…" : "Activer ma fidélité"}
          </button>
        )}
      </div>
    </section>
  );
}

/** Live flash promotions with countdowns; a tap adds the dish to the cart. */
export function FlashStrip({
  account,
  onAdd,
}: {
  account: Account;
  onAdd: (items: ReorderItem[]) => void;
}) {
  const now = useNow();
  const live = account.engagement.flash.filter(
    (f) => Date.parse(f.ends_at) > now,
  );
  if (!live.length) return null;
  return (
    <section className="ca-card ca-flash">
      <SectionTitle
        kicker="Ventes flash"
        title="Seulement pour quelques heures"
        action={<Zap className="ca-flash-icon" aria-hidden="true" />}
      />
      <div className="ca-scroller" role="list">
        {live.map((f) => (
          <article key={f.id} role="listitem" className="ca-flash-item">
            <div className="ca-flash-media">
              {f.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.image} alt="" loading="lazy" />
              ) : (
                <span aria-hidden="true">
                  <Zap />
                </span>
              )}
              <b className="ca-flash-off">
                −{Math.round((1 - f.price / f.regular_price) * 100)} %
              </b>
            </div>
            <div className="ca-flash-body">
              <small>{f.category}</small>
              <h3>{f.name}</h3>
              <p className="ca-price">
                <b>{money(f.price)}</b>
                <s>{money(f.regular_price)}</s>
              </p>
              {f.member_bonus_points > 0 && (
                <span className="ca-chip ca-chip-accent">
                  +{f.member_bonus_points} pts membre
                </span>
              )}
              <p className="ca-countdown" aria-live="off">
                Fin dans {countdown(f.ends_at, now)}
              </p>
              <button
                className="ca-button ca-button-small"
                onClick={() =>
                  onAdd([{ menu: f.menu_id, quantity: 1, choices: [], note: "" }])
                }
              >
                J’en profite <ArrowRight size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function Missions({
  account,
  onNavigate,
}: {
  account: Account;
  onNavigate: (target: string) => void;
}) {
  const missions = account.engagement.missions;
  if (!missions.length) return null;
  return (
    <section className="ca-card">
      <SectionTitle kicker="Vos défis" title="Missions du moment" />
      <ul className="ca-missions">
        {missions.map((m) => {
          const content = (
            <>
              <span className="ca-mission-text">
                <b>{m.title}</b>
                <small>{m.detail}</small>
              </span>
              <span className="ca-mission-reward">{m.reward}</span>
            </>
          );
          return (
            <li key={m.key}>
              {m.href.startsWith("#") ? (
                <button onClick={() => onNavigate(m.href.slice(1))}>
                  {content}
                </button>
              ) : (
                <Link href={m.href}>{content}</Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Last order in one tap, plus the next booking. */
export function QuickActions({
  account,
  onReorder,
}: {
  account: Account;
  onReorder: (items: ReorderItem[]) => void;
}) {
  const now = useNow(60000);
  const last = account.orders.find((o) => o.reorder_items.length);
  const booking = account.engagement.reservations
    .filter(
      (b) =>
        Date.parse(b.starts_at) > now &&
        ["requested", "confirmed"].includes(b.status),
    )
    .at(-1);
  if (!last && !booking) return null;
  return (
    <div className="ca-grid-2">
      {last && (
        <section className="ca-card ca-quick">
          <p className="ca-kicker">Votre dernière envie</p>
          <h3>Commande #{last.number}</h3>
          <p className="ca-muted">
            {last.items.map((i) => `${i.quantity} × ${i.name}`).join(" · ")}
          </p>
          <button
            className="ca-button ca-button-small"
            onClick={() => onReorder(last.reorder_items)}
          >
            <RefreshCw size={16} /> Recommander en 1 clic
          </button>
        </section>
      )}
      {booking && (
        <section className="ca-card ca-quick">
          <p className="ca-kicker">Prochaine réservation</p>
          <h3>{longDate(booking.starts_at)}</h3>
          <p className="ca-muted">
            {booking.guests} pers. ·{" "}
            {booking.status === "confirmed" ? "Confirmée" : "En attente de confirmation"}
            {account.engagement.settings.booking_points > 0 &&
              ` · +${account.engagement.settings.booking_points} pts à votre arrivée`}
          </p>
        </section>
      )}
    </div>
  );
}
