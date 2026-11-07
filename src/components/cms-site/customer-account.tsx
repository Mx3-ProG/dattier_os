"use client";
import { useTenantSite, TenantLink as Link } from "./context";
import { useCallback, useEffect, useState } from "react";
import {
  CalendarDays,
  Gift,
  History,
  Home,
  LogOut,
  RefreshCw,
  Sparkles,
  Star,
  UserPlus,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ShopOrder } from "@/features/commerce/schema";
import { money } from "@/lib/domain";
import { CustomerAuth } from "./customer-auth";
import { Modal } from "../forms";
import { AccountHero, FlashStrip, Missions, QuickActions } from "./account/home";
import {
  BadgesGrid,
  LevelsLadder,
  PointsHistory,
  RewardsWallet,
} from "./account/rewards";
import { ReferralCard } from "./account/referral";
import { longDate, SectionTitle, type Account, type ReorderItem } from "./account/shared";
import { CustomerQrSheet, QrPill } from "./account/qr-sheet";

const reviewSuggestions = [
  "J’ai vraiment aimé cette commande, tout était délicieux !",
  "Un vrai régal du début à la fin, je recommande.",
  "Très gourmand, généreux et plein de saveurs.",
  "Ce repas était délicieux, je reviendrai avec plaisir.",
  "Une excellente surprise, aussi beau que bon.",
  "Tout était frais, savoureux et préparé avec soin.",
  "J’ai adoré les saveurs et la texture, bravo à l’équipe !",
  "Une pause gourmande réussie, je me suis régalé(e).",
  "Très bonne expérience, la commande était parfaite.",
  "Délicieux et généreux, exactement ce dont j’avais envie.",
];

const orderDate = (date: string) =>
  new Date(date).toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

type Tab = "accueil" | "recompenses" | "parrainage" | "historique";
const tabs: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "accueil", label: "Accueil", icon: Home },
  { id: "recompenses", label: "Cadeaux", icon: Gift },
  { id: "parrainage", label: "Parrainage", icon: UserPlus },
  { id: "historique", label: "Historique", icon: History },
];
const referralKey = "ca-referral-code";
const bookingStatus: Record<string, string> = {
  requested: "En attente",
  confirmed: "Confirmée",
  arrived: "Venu·e ✓",
  declined: "Refusée",
  cancelled: "Annulée",
  no_show: "Absent·e",
};

/** Reads a pending referral code from the URL (kept for the login round trip). */
function pendingReferral() {
  try {
    const fromUrl = new URLSearchParams(location.search).get("parrain");
    if (fromUrl && /^[A-Za-z0-9]{8}$/.test(fromUrl)) {
      sessionStorage.setItem(referralKey, fromUrl.toUpperCase());
      return fromUrl.toUpperCase();
    }
    return sessionStorage.getItem(referralKey) || "";
  } catch {
    return "";
  }
}

export function CustomerAccount({
  onReorder,
}: {
  onReorder: (items: ReorderItem[]) => void;
}) {
  const { request: fetch, shopPost } = useTenantSite();
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<Tab>("accueil");
  const [joining, setJoining] = useState(false);
  const [referral, setReferral] = useState("");
  const [invitation, setInvitation] = useState<{
    referrer: string;
    welcome: string;
  } | null>(null);
  const [reviewOrder, setReviewOrder] = useState<ShopOrder | null>(null);
  const [reviewMenu, setReviewMenu] = useState("");
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState(reviewSuggestions[0]);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewedOrder, setReviewedOrder] = useState("");
  const [bookingQr, setBookingQr] = useState<string | null>(null);

  const openReview = (order: ShopOrder) => {
    const first = order.items.find((item) => item.status !== "cancelled");
    if (!first) return;
    setReviewOrder(order);
    setReviewMenu(first.menu_id);
    setReviewRating(5);
    setReviewText(reviewSuggestions[order.number % reviewSuggestions.length]);
    setError("");
  };

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/shop/account");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setAccount(data);
      return data as Account;
    } catch (reason) {
      setAccount(null);
      if (!/Connexion|Clé de compte/.test((reason as Error).message))
        setError((reason as Error).message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [fetch]);

  useEffect(() => {
    const code = pendingReferral();
    setReferral(code);
    const hash = (new URLSearchParams(location.search).get("onglet") ||
      location.hash.slice(1)) as Tab;
    if (tabs.some((t) => t.id === hash)) setTab(hash);
    void (async () => {
      const loaded = await load();
      if (!code) return;
      if (!loaded) {
        // Logged out: show who invites them before they sign up.
        try {
          const response = await fetch(`/api/shop/invite?code=${code}`);
          const data = await response.json();
          if (response.ok && data.invitation) setInvitation(data.invitation);
        } catch {
          /* The banner is optional. */
        }
        return;
      }
      try {
        const result = await shopPost("referral-attach", { code });
        if (result.attached)
          setNotice(
            result.welcome
              ? `Bienvenue ! Votre cadeau ${result.welcome} vous attend dans « Cadeaux ».`
              : "Bienvenue ! Votre parrainage est enregistré.",
          );
        await load();
      } catch (reason) {
        setNotice((reason as Error).message);
      } finally {
        try {
          sessionStorage.removeItem(referralKey);
          const url = new URL(location.href);
          url.searchParams.delete("parrain");
          history.replaceState(null, "", url);
        } catch {
          /* Nothing to clean. */
        }
      }
    })();
  }, [load, fetch, shopPost]);

  const go = (target: string) => {
    if (target === "fidelite") {
      setTab("accueil");
      return;
    }
    if (tabs.some((t) => t.id === target)) setTab(target as Tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  async function join() {
    setJoining(true);
    try {
      await shopPost("loyalty-join", {});
      setNotice("Programme activé : vos prochaines commandes rapportent des points.");
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setJoining(false);
    }
  }

  if (loading)
    return (
      <section className="ca ca-loading" aria-busy="true">
        <div className="ca-skeleton ca-skeleton-hero" />
        <div className="ca-skeleton" />
        <div className="ca-skeleton" />
      </section>
    );

  if (!account)
    return (
      <section className="ca ca-guest">
        {invitation && (
          <div className="ca-invite" role="status">
            <Gift />
            <span>
              <b>{invitation.referrer} vous invite !</b>
              {invitation.welcome
                ? ` Créez votre compte : ${invitation.welcome} sur votre première commande.`
                : " Créez votre compte pour rejoindre la maison."}
            </span>
          </div>
        )}
        <div className="ca-guest-hero">
          <p className="ca-kicker">Espace client privé</p>
          <h1>Votre fidélité, à votre nom.</h1>
          <p className="ca-muted">
            Un compte gratuit pour commander en click & collect, réserver,
            cumuler des points et débloquer des cadeaux.
          </p>
          <ul className="ca-perks">
            <li>
              <Star /> <span><b>Des points à chaque commande</b> échangeables contre des cadeaux</span>
            </li>
            <li>
              <Zap /> <span><b>Ventes flash</b> réservées et bonus membres</span>
            </li>
            <li>
              <UserPlus /> <span><b>Parrainage</b> : vos amis reçoivent un cadeau, vous gagnez des points</span>
            </li>
            <li>
              <Sparkles /> <span><b>Badges et niveaux</b> à débloquer au fil de vos visites</span>
            </li>
          </ul>
        </div>
        {error && (
          <p className="ca-error" role="alert">
            {error}
          </p>
        )}
        <CustomerAuth
          returnQuery={referral ? `?parrain=${referral}` : ""}
          onAuthenticated={() => {
            setLoading(true);
            void (async () => {
              const loaded = await load();
              if (loaded && referral) {
                try {
                  const result = await shopPost("referral-attach", { code: referral });
                  if (result.attached) setNotice("Bienvenue ! Votre parrainage est enregistré.");
                  sessionStorage.removeItem(referralKey);
                  await load();
                } catch (reason) {
                  setNotice((reason as Error).message);
                }
              }
            })();
          }}
        />
      </section>
    );

  const e = account.engagement;
  return (
    <section className="ca">
      <div className="ca-topbar">
        <nav className="ca-tabs" aria-label="Sections de mon espace">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                aria-current={tab === t.id ? "page" : undefined}
                onClick={() => go(t.id)}
              >
                <Icon size={20} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="ca-top-actions">
          <button className="ca-icon-button" onClick={() => void load()} aria-label="Actualiser">
            <RefreshCw size={17} />
          </button>
          <button
            className="ca-icon-button"
            aria-label="Déconnexion"
            onClick={async () => {
              await shopPost("customer-logout", {});
              setAccount(null);
            }}
          >
            <LogOut size={17} />
          </button>
        </div>
      </div>
      {notice && (
        <p className="ca-notice" role="status">
          {notice}
          <button onClick={() => setNotice("")} aria-label="Fermer">×</button>
        </p>
      )}
      {error && (
        <p className="ca-error" role="alert">
          {error}
        </p>
      )}

      {tab === "accueil" && (
        <div className="ca-stack" key="accueil">
          <AccountHero account={account} onJoin={() => void join()} joining={joining} />
          {e.welcome && (
            <button className="ca-card ca-welcome" onClick={() => go("recompenses")}>
              <Gift />
              <span>
                <b>Votre cadeau de bienvenue vous attend</b>
                <small>Code {e.welcome.code} · à utiliser avant le {new Date(e.welcome.expires_on).toLocaleDateString("fr-FR")}</small>
              </span>
            </button>
          )}
          <FlashStrip account={account} onAdd={onReorder} />
          <div className="ca-grid-2">
            <Missions account={account} onNavigate={go} />
            <ReferralTeaser account={account} onOpen={() => go("parrainage")} />
          </div>
          <QuickActions account={account} onReorder={onReorder} />
        </div>
      )}

      {tab === "recompenses" && (
        <div className="ca-stack" key="recompenses">
          <RewardsWallet account={account} onChanged={() => void load()} />
          <BadgesGrid account={account} />
          <div className="ca-grid-2">
            <LevelsLadder account={account} />
            <PointsHistory account={account} />
          </div>
        </div>
      )}

      {tab === "parrainage" && (
        <div className="ca-stack" key="parrainage">
          <ReferralCard account={account} onChanged={() => void load()} />
        </div>
      )}

      {tab === "historique" && (
        <div className="ca-stack" key="historique">
          <section className="ca-card">
            <SectionTitle kicker="Click & collect" title="Mes anciennes commandes" action={<Link href="/commander" className="ca-button ca-button-small">Nouvelle commande</Link>} />
            {account.orders.length ? (
              <div className="ca-orders">
                {account.orders.map((order) => (
                  <article key={order.order_id} className="ca-order">
                    <header>
                      <span>
                        <strong>Commande #{order.number}</strong>
                        <small>{orderDate(order.created_at)}</small>
                      </span>
                      <b>{money(order.total)}</b>
                    </header>
                    <p>{order.items.map((item) => `${item.quantity} × ${item.name}`).join(" · ")}</p>
                    {order.points_awarded > 0 && (
                      <span className="ca-chip ca-chip-accent">+{order.points_awarded} pts</span>
                    )}
                    <footer>
                      <Link href={`/suivi#${order.token}`} className="ca-link">
                        Voir le détail
                      </Link>
                      <div className="ca-order-actions">
                        <button
                          type="button"
                          className="ca-button ca-button-small ca-button-soft"
                          disabled={!order.items.some((item) => item.status !== "cancelled")}
                          onClick={() => openReview(order)}
                        >
                          <Star size={15} /> Avis
                        </button>
                        <button
                          className="ca-button ca-button-small"
                          disabled={!order.reorder_items.length}
                          onClick={() => onReorder(order.reorder_items)}
                        >
                          <RefreshCw size={15} /> Recommander
                        </button>
                      </div>
                    </footer>
                    {reviewedOrder === order.order_id && (
                      <p className="ca-success" role="status">
                        Merci ! Votre avis est en attente de validation.
                      </p>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <p className="ca-muted">
                Aucune commande pour l’instant. Votre première commande vous rapporte déjà des points !
              </p>
            )}
          </section>
          <section className="ca-card">
            <SectionTitle kicker="En salle" title="Mes réservations" action={<Link href="/reservations" className="ca-button ca-button-small ca-button-soft"><CalendarDays size={15} /> Réserver</Link>} />
            {e.reservations.length ? (
              <ul className="ca-list">
                {e.reservations.map((b) => (
                  <li key={b.id}>
                    <span>
                      <b>{longDate(b.starts_at)}</b>
                      <small>{b.guests} pers.</small>
                    </span>
                    <span className="ca-gift-tools">
                      <span className={`ca-status ${b.status === "arrived" ? "is-done" : ""}`}>
                        {bookingStatus[b.status] ?? b.status}
                      </span>
                      {["requested", "confirmed"].includes(b.status) && (
                        <QrPill label="QR de ma réservation" onClick={() => setBookingQr(b.id)} />
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ca-muted">
                Réservez connecté·e à votre compte
                {e.settings.booking_points > 0 && ` : +${e.settings.booking_points} points à votre arrivée`}.
              </p>
            )}
          </section>
        </div>
      )}

      {bookingQr && (
        <CustomerQrSheet
          kind="reservation"
          refId={bookingQr}
          title="Ma réservation"
          description="Montrez ce QR code à votre arrivée : l’équipe vous installe en un scan."
          close={() => setBookingQr(null)}
        />
      )}
      <p className="ca-note">
        Les points n’ont pas de valeur monétaire. Consultez les{" "}
        <Link href="/conditions-generales-vente">conditions du programme</Link>.
      </p>

      {reviewOrder && (
        <Modal
          title={`Noter la commande #${reviewOrder.number}`}
          description="Nous avons préparé un avis positif et cinq étoiles. Vous gardez la main sur chaque mot avant l’envoi."
          close={() => setReviewOrder(null)}
        >
          <form
            className="donut-review-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setReviewBusy(true);
              setError("");
              try {
                await shopPost("review", { menu: reviewMenu, rating: reviewRating, body: reviewText });
                setReviewedOrder(reviewOrder.order_id);
                setReviewOrder(null);
                void load();
              } catch (reason) {
                setError((reason as Error).message);
              } finally {
                setReviewBusy(false);
              }
            }}
          >
            <label>
              Produit de cette commande
              <select value={reviewMenu} onChange={(event) => setReviewMenu(event.target.value)} required>
                {Array.from(
                  new Map(
                    reviewOrder.items
                      .filter((item) => item.status !== "cancelled")
                      .map((item) => [item.menu_id, item]),
                  ).values(),
                ).map((item) => (
                  <option value={item.menu_id} key={item.menu_id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Note
              <select value={reviewRating} onChange={(event) => setReviewRating(Number(event.target.value))}>
                {[5, 4, 3, 2, 1].map((rating) => (
                  <option value={rating} key={rating}>
                    {rating} étoile{rating > 1 ? "s" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Votre avis prérempli et modifiable
              <textarea minLength={10} maxLength={1000} value={reviewText} onChange={(event) => setReviewText(event.target.value)} required />
            </label>
            <button
              type="button"
              className="donut-review-suggestion"
              onClick={() => {
                const current = reviewSuggestions.indexOf(reviewText);
                setReviewText(reviewSuggestions[(current + 1 + reviewSuggestions.length) % reviewSuggestions.length]);
              }}
            >
              <Sparkles size={16} /> Proposer un autre texte
            </button>
            {error && (
              <p className="donut-error" role="alert">
                {error}
              </p>
            )}
            <button className="donut-button" disabled={reviewBusy}>
              <Star size={17} fill="currentColor" />
              {reviewBusy ? "Envoi…" : "Envoyer mon avis"}
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}

function ReferralTeaser({ account, onOpen }: { account: Account; onOpen: () => void }) {
  const r = account.engagement.referral,
    s = account.engagement.settings;
  return (
    <button className="ca-card ca-teaser" onClick={onOpen}>
      <span className="ca-referral-icon" aria-hidden="true">
        <UserPlus />
      </span>
      <p className="ca-kicker">Parrainage</p>
      <h3>{r.rewarded ? `${r.rewarded} ami${r.rewarded > 1 ? "s" : ""} parrainé${r.rewarded > 1 ? "s" : ""}` : "Offrez un cadeau à un ami"}</h3>
      <p className="ca-muted">
        {s.welcome ? `${s.welcome} pour lui` : "Un accueil privilégié pour lui"}
        {s.referrer_points ? `, +${s.referrer_points} pts pour vous` : ""}
        {r.next ? ` · prochain palier : ${r.next.label}` : ""}
      </p>
      <span className="ca-link">Partager mon lien →</span>
    </button>
  );
}
