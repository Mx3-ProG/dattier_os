"use client";
import { useTenantSite } from "./context";

import { TenantLink as Link } from "./context";
import { useCallback, useEffect, useState } from "react";
import { Gift, History, LogOut, RefreshCw, Sparkles, Star } from "lucide-react";
import type {
  CustomerAccount as Account,
  ShopOrder,
} from "@/features/commerce/schema";
import { money } from "@/lib/domain";

import { CustomerAuth } from "./customer-auth";
import { Modal } from "../forms";

type ReorderItem = ShopOrder["reorder_items"][number];

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

export function CustomerAccount({
  onReorder,
}: {
  onReorder: (items: ReorderItem[]) => void;
}) {
  const { request: fetch, shopPost } = useTenantSite();
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [reviewOrder, setReviewOrder] = useState<ShopOrder | null>(null);
  const [reviewMenu, setReviewMenu] = useState("");
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState(reviewSuggestions[0]);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewedOrder, setReviewedOrder] = useState("");

  const openReview = (order: ShopOrder) => {
    const first = order.items.find((item) => item.status !== "cancelled");
    if (!first) return;
    const suggestion =
      reviewSuggestions[order.number % reviewSuggestions.length];
    setReviewOrder(order);
    setReviewMenu(first.menu_id);
    setReviewRating(5);
    setReviewText(suggestion);
    setError("");
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/shop/account");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setAccount(data);
    } catch (reason) {
      setAccount(null);
      if (!/Connexion|Clé de compte/.test((reason as Error).message))
        setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }, [fetch]);

  useEffect(() => {
    const token = new URLSearchParams(location.search).get("reset") || "";
    setResetToken(token);
    if (!token) void load();
    else setLoading(false);
  }, [load]);

  if (loading)
    return (
      <section className="donut-section donut-account">
        <p>Chargement de votre espace gourmand…</p>
      </section>
    );

  if (!account)
    return (
      <section className="donut-section donut-account donut-account-empty">
        <p className="donut-kicker">ESPACE CLIENT PRIVÉ</p>
        <h1>Votre fidélité, à votre nom.</h1>
        <p>
          Créez votre compte quand vous le souhaitez. Il vous permettra de
          commander, retrouver vos points et recommander en quelques secondes.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <CustomerAuth
          resetToken={resetToken}
          initialMode={resetToken ? "reset" : "register"}
          onAuthenticated={() => {
            setResetToken("");
            void load();
          }}
        />
      </section>
    );

  return (
    <section className="donut-section donut-account">
      <div className="donut-account-heading">
        <div>
          <p className="donut-kicker">BON RETOUR, {account.customer.name}</p>
          <h1>Mon espace gourmand</h1>
        </div>
        <div className="donut-account-actions">
          <button className="donut-text-link" onClick={() => void load()}>
            <RefreshCw size={16} /> Actualiser
          </button>
          <button
            className="donut-text-link"
            onClick={async () => {
              await shopPost("customer-logout", {});
              setAccount(null);
            }}
          >
            <LogOut size={16} /> Déconnexion
          </button>
        </div>
      </div>
      <div className="donut-account-summary">
        <article className="donut-points-card">
          <Star fill="currentColor" />
          <span>Mon solde fidélité</span>
          <strong>{account.customer.points}</strong>
          <b>points</b>
          <small>
            {account.customer.loyaltyConsent
              ? "Programme de fidélité actif"
              : "Programme non activé"}
          </small>
        </article>
        <article className="donut-rewards-card">
          <Gift />
          <div>
            <span>Mes prochaines récompenses</span>
            {account.rewards.length ? (
              <ul>
                {account.rewards.slice(0, 4).map((reward) => (
                  <li key={reward.id}>
                    <span>{reward.name}</span>
                    <b>
                      {account.customer.points >= reward.points_cost
                        ? "Disponible"
                        : `${reward.points_cost - account.customer.points} points à gagner`}
                    </b>
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                Les récompenses seront affichées ici dès leur publication par
                l’établissement.
              </p>
            )}
          </div>
        </article>
      </div>
      <div className="donut-order-history">
        <div>
          <History />
          <span>
            <p className="donut-kicker">HISTORIQUE</p>
            <h2>Mes anciennes commandes</h2>
          </span>
        </div>
        {account.orders.length ? (
          account.orders.map((order) => (
            <article key={order.order_id}>
              <header>
                <span>
                  <strong>Commande #{order.number}</strong>
                  <small>{orderDate(order.created_at)}</small>
                </span>
                <b>{money(order.total)}</b>
              </header>
              <p>
                {order.items
                  .map((item) => `${item.quantity} × ${item.name}`)
                  .join(" · ")}
              </p>
              <footer>
                <Link
                  href={`/suivi#${order.token}`}
                  className="donut-text-link"
                >
                  Voir le détail
                </Link>
                <div className="donut-order-actions">
                  <button
                    type="button"
                    className="donut-button compact outline donut-rate-order"
                    disabled={
                      !order.items.some((item) => item.status !== "cancelled")
                    }
                    onClick={() => openReview(order)}
                  >
                    <Star size={16} /> Laisser un avis
                  </button>
                  <button
                    className="donut-button compact"
                    disabled={!order.reorder_items.length}
                    onClick={() => onReorder(order.reorder_items)}
                  >
                    Recommander <RefreshCw size={16} />
                  </button>
                </div>
              </footer>
              {reviewedOrder === order.order_id && (
                <p className="donut-review-sent" role="status">
                  Merci ! Votre avis est en attente de validation.
                </p>
              )}
            </article>
          ))
        ) : (
          <p>Aucune commande enregistrée dans cet espace.</p>
        )}
      </div>
      <p className="donut-account-note">
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
                await shopPost("review", {
                  menu: reviewMenu,
                  rating: reviewRating,
                  body: reviewText,
                });
                setReviewedOrder(reviewOrder.order_id);
                setReviewOrder(null);
              } catch (reason) {
                setError((reason as Error).message);
              } finally {
                setReviewBusy(false);
              }
            }}
          >
            <label>
              Produit de cette commande
              <select
                value={reviewMenu}
                onChange={(event) => setReviewMenu(event.target.value)}
                required
              >
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
              <select
                value={reviewRating}
                onChange={(event) =>
                  setReviewRating(Number(event.target.value))
                }
              >
                {[5, 4, 3, 2, 1].map((rating) => (
                  <option value={rating} key={rating}>
                    {rating} étoile{rating > 1 ? "s" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Votre avis prérempli et modifiable
              <textarea
                minLength={10}
                maxLength={1000}
                value={reviewText}
                onChange={(event) => setReviewText(event.target.value)}
                required
              />
            </label>
            <button
              type="button"
              className="donut-review-suggestion"
              onClick={() => {
                const current = reviewSuggestions.indexOf(reviewText);
                setReviewText(
                  reviewSuggestions[
                    (current + 1 + reviewSuggestions.length) %
                      reviewSuggestions.length
                  ],
                );
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
