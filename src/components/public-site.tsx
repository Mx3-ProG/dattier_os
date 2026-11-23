"use client";
import { ProductRecommendations } from "./product-recommendations";
import { ProductDetails } from "./product-details";
import { productPath } from "@/domain/shared/product-pages";
import Image from "next/image";
import { dishImages, foodMedia } from "./public/food-media";
import { LocationMap } from "./public/location-map";
import Link from "next/link";
import { sitePath } from "./public/navigation";
import { useEffect, useRef, useState } from "react";
import { MapPin, Phone, Minus, Plus } from "lucide-react";
import type { MenuItem, Restaurant } from "@/shared/types";
import { money } from "@/domain/shared/units";
import { Form } from "./forms";
import { SiteHeader } from "./public/site-header";
import { SiteFooter } from "./public/site-footer";
import { Booking } from "./public/booking";
import {
  HomeFaq,
  HomeIntro,
  HomeMenuPreview,
  HomePracticalInfo,
  HomeReservation,
  HomeSpecialties,
  HomeStory,
  HomeStrip,
} from "./public/home-sections";
import { ScrollReveal } from "./public/home-motion";
export function PublicSite({
  route,
  product,
  menuItems = [],
  composing = false,
  starter,
}: {
  route: string;
  product?: MenuItem;
  menuItems?: MenuItem[];
  composing?: boolean;
  starter?: MenuItem;
}) {
  const canStart = starter?.enabled && starter.portions > 0;
  const [data, setData] = useState<{
      menu: MenuItem[];
      restaurants: Restaurant[];
    } | null>(null),
    [category, setCategory] = useState(canStart ? "Entrées" : "Plats"),
    [cart, setCart] = useState<Record<string, number>>(() =>
      canStart ? { [starter.id]: 1 } : {},
    ),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    const refresh = () =>
      fetch("/api/v1/public?restaurant=bernay")
        .then((r) => r.json())
        .then((d) => {
          if (d.error) throw new Error(d.error);
          setData(d);
          setError("");
        })
        .catch(() => setError("Connexion au restaurant impossible."));
    void refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);
  // Le message de confirmation s'affiche en haut de page : on l'amène
  // dans la zone visible, sous le header sticky.
  const messageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (message) messageRef.current?.scrollIntoView({ block: "center" });
  }, [message]);
  const restaurant = data?.restaurants.find((r) => r.id === "bernay");
  const address =
    restaurant?.address || "29 Rue du Général Leclerc, 27300 Bernay";
  const lines = data?.menu.filter((m) => cart[m.id] > 0) ?? [];
  const count = lines.reduce((sum, m) => sum + cart[m.id], 0);
  const total = lines.reduce((sum, m) => sum + m.price * cart[m.id], 0);
  const orderKey = useRef<{ payload: string; key: string } | null>(null);
  const ordering = route === "commander" || route === "qr";
  const submit = async (endpoint: string, body: unknown) => {
    const r = await fetch(`/api/v1/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await r.json();
    if (!r.ok) throw new Error(result.error);
    setMessage(
      `Votre demande ${result.id.slice(0, 6)} est enregistrée. Le restaurant doit encore la confirmer. Aucun e-mail ni SMS n’a été envoyé.`,
    );
  };
  return (
    <div className="public-site">
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>
      <div className="public-demo">
        Site de démonstration · Prix, recettes et disponibilités fictifs ·{" "}
        <Link href="/demo">Entrer dans STUDIO OS ↗</Link>
      </div>
      <SiteHeader />
      <main id="contenu" tabIndex={-1}>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <div className="success" role="status" ref={messageRef}>
            {message}
          </div>
        )}
        {route === "" ? (
          <>
            <ScrollReveal />
            <HomeIntro restaurant={restaurant} />
            <HomeStrip />
            <HomeSpecialties />
            <HomeStory />
            <HomeMenuPreview menu={data?.menu} />
            <HomeReservation />
            <HomeFaq />
            <HomePracticalInfo restaurant={restaurant} />
          </>
        ) : null}
        {product && (
          <section className="public-section">
            <ProductDetails
              product={product}
              image={dishImages[product.name]}
              demo
            >
              <Link className="btn outline" href={sitePath("/carte")}>
                Retour à la carte
              </Link>
              <Link className="btn primary" href={sitePath("/commander")}>
                Voir le click & collect
              </Link>
            </ProductDetails>
            <ProductRecommendations
              product={product}
              items={data?.menu ?? menuItems}
              href={(item) => sitePath(productPath(item.id))}
              image={(item) => dishImages[item.name]}
            >
              <Link
                className="btn primary"
                href={sitePath(
                  `/commander?composer=${encodeURIComponent(product.id)}`,
                )}
              >
                Composer mon repas
              </Link>
            </ProductRecommendations>
          </section>
        )}
        {(route === "carte" || ordering) && (
          <section
            className="public-section tasting-menu"
            data-has-cart={ordering && count > 0}
          >
            <span className="eyebrow">
              {ordering ? "CLICK & COLLECT" : "À SAVOURER, À PARTAGER"}
            </span>
            <h1>
              {composing
                ? "Composez votre repas."
                : ordering
                  ? "La maison, à emporter."
                  : "Notre carte."}
            </h1>
            <p>
              Carte de démonstration. Prix, compositions et allergènes non
              validés par le restaurant.
            </p>
            {!ordering && (
              <Link className="btn primary" href={sitePath("/commander")}>
                Commander à emporter
              </Link>
            )}
            {ordering && (
              <p>
                {route === "qr"
                  ? "Choisissez vos plats et envoyez votre demande à l’équipe."
                  : `Composez votre panier, indiquez l’heure souhaitée et retirez votre commande après confirmation au ${address}.`}
              </p>
            )}
            {composing && (
              <p>
                {canStart
                  ? `${starter.name} a été ajouté au panier. Choisissez de quoi l’accompagner.`
                  : starter
                    ? `${starter.name} est indisponible. Vous pouvez composer votre repas avec les articles en stock.`
                    : "Choisissez un plat et ajoutez les accompagnements qui vous font envie."}
              </p>
            )}
            <div className="tabs" aria-label="Catégories de la carte">
              {["Entrées", "Plats", "Desserts", "Boissons"].map((c) => (
                <button
                  key={c}
                  className={c === category ? "active" : ""}
                  aria-pressed={c === category}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              ))}
            </div>
            {!data && !error && <p role="status">Chargement de la carte…</p>}
            {data && !data.menu.some((m) => m.category === category) && (
              <p>Aucun plat dans cette catégorie pour le moment.</p>
            )}
            <div className="public-menu-grid">
              {data?.menu
                .filter((m) => m.category === category)
                .map((m) => (
                  <article key={m.id} className="public-menu-item">
                    {dishImages[m.name] && (
                      <Link
                        className="dish-photo"
                        href={sitePath(productPath(m.id))}
                        aria-label={`Voir la fiche de ${m.name}`}
                      >
                        <Image
                          src={dishImages[m.name]}
                          alt=""
                          fill
                          sizes="(max-width: 700px) 100vw, 33vw"
                        />
                      </Link>
                    )}
                    <div className="dish-copy">
                      <h3>
                        <Link
                          className="product-name-link"
                          href={sitePath(productPath(m.id))}
                        >
                          {m.name}
                        </Link>
                      </h3>
                      <p>{m.description}</p>
                      <small>
                        {!m.enabled
                          ? "Indisponible"
                          : m.portions > 0
                            ? "Disponible"
                            : "Rupture de stock"}
                      </small>
                    </div>
                    <div className="dish-actions">
                      <b>{money(m.price)}</b>
                      {ordering && (
                        <div className="stepper">
                          <button
                            aria-label={`Retirer ${m.name}`}
                            disabled={!cart[m.id]}
                            onClick={() => {
                              orderKey.current = null;
                              setCart((current) => ({
                                ...current,
                                [m.id]: Math.max(0, (current[m.id] || 0) - 1),
                              }));
                            }}
                          >
                            <Minus size={15} />
                          </button>
                          <span aria-live="polite">
                            <span className="sr-only">
                              {m.name} dans le panier :{" "}
                            </span>
                            {cart[m.id] || 0}
                          </span>
                          <button
                            aria-label={`Ajouter ${m.name}`}
                            disabled={
                              !m.enabled ||
                              (cart[m.id] || 0) >= Math.min(50, m.portions)
                            }
                            onClick={() => {
                              orderKey.current = null;
                              setCart((current) => ({
                                ...current,
                                [m.id]: Math.min(
                                  50,
                                  m.portions,
                                  (current[m.id] || 0) + 1,
                                ),
                              }));
                            }}
                          >
                            <Plus size={15} />
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
            </div>
            {ordering && (
              <div className="card public-form" id="panier" tabIndex={-1}>
                <h2>Votre panier</h2>
                {count === 0 && (
                  <p>Ajoutez un plat à votre panier pour continuer.</p>
                )}
                {lines.map((m) => (
                  <p key={m.id}>
                    {cart[m.id]} × {m.name} · {money(m.price * cart[m.id])}
                  </p>
                ))}
                {count > 0 && (
                  <p>
                    <strong>Total · {money(total)}</strong>
                  </p>
                )}
                <p>
                  La disponibilité sera revérifiée lors de l’acceptation par le
                  personnel. Aucun paiement en ligne.
                </p>
                {count > 0 && (
                  <Form
                    label={
                      route === "qr"
                        ? "Envoyer la demande"
                        : "Demander le retrait"
                    }
                    fields={[
                      { name: "customer", label: "Votre nom" },
                      { name: "contact", label: "Téléphone ou e-mail" },
                      {
                        name: "desiredAt",
                        label: "Heure souhaitée",
                        type: "datetime-local",
                      },
                      { name: "note", label: "Instructions", required: false },
                    ]}
                    onSubmit={async (v) => {
                      const table =
                        route === "qr"
                          ? new URLSearchParams(window.location.search).get(
                              "table",
                            )
                          : null;
                      const order = {
                        restaurant: "bernay",
                        channel: route === "qr" ? "qr" : "takeaway",
                        table: table || undefined,
                        customer: v.customer,
                        contact: v.contact,
                        desiredAt: new Date(v.desiredAt).toISOString(),
                        items: Object.entries(cart)
                          .filter(([, q]) => q > 0)
                          .map(([menu, quantity]) => ({
                            menu,
                            quantity,
                            note: v.note,
                          })),
                      };
                      const payload = JSON.stringify(order);
                      if (orderKey.current?.payload !== payload) {
                        orderKey.current = {
                          payload,
                          key: crypto.randomUUID(),
                        };
                      }
                      await submit("public-order", {
                        ...order,
                        key: orderKey.current.key,
                      });
                      orderKey.current = null;
                      setCart({});
                    }}
                  />
                )}
              </div>
            )}
            {ordering && count > 0 && (
              <div className="cart-dock">
                <a className="btn primary" href="#panier">
                  Voir le panier · {count} · {money(total)}
                </a>
              </div>
            )}
          </section>
        )}
        {route === "reservations" && <Booking />}
        {route === "contact" && (
          <section className="public-section">
            <span className="eyebrow">À BIENTÔT CHEZ NOUS</span>
            <h1>Au cœur de Bernay.</h1>
            <div className="two-grid">
              <div className="card">
                <MapPin />
                <h2>{restaurant?.name || "Studio Restau"}</h2>
                <p>{address}</p>
                {restaurant?.phone && (
                  <Link
                    className="with-icon"
                    href={`tel:${restaurant?.phone.replaceAll(" ", "")}`}
                  >
                    <Phone size={17} /> {restaurant?.phone}
                  </Link>
                )}
                <p>Horaires à confirmer auprès de l’établissement.</p>
              </div>
              <LocationMap address={address} />
            </div>
          </section>
        )}
        {route === "histoire" && (
          <section className="public-section editorial">
            <span className="eyebrow">NOTRE MAISON</span>
            <h1>
              La cuisine comme
              <br />
              <em>un trait d’union.</em>
            </h1>
            <p>
              Studio Restau est un restaurant de cuisine tunisienne et
              maghrébine à Bernay. Couscous, tajines et thé à la menthe
              composent cette carte de démonstration inspirée des plats
              communiqués.
            </p>
            <p>
              L’histoire de l’équipe, ses origines et ses engagements seront
              ajoutés après validation par le restaurant.
            </p>
            <div className="story-photo">
              <Image
                src={foodMedia.tajine}
                alt="Illustration d’un tajine aux olives et au citron"
                fill
                sizes="(max-width: 700px) 100vw, 65vw"
              />
            </div>
            <Link href={sitePath("/carte")} className="btn primary">
              Explorer la carte
            </Link>
          </section>
        )}
        {route === "galerie" && (
          <section className="public-section">
            <h1>À table, en images.</h1>
            <p>Images d’illustration générées pour la démonstration.</p>
            <div className="public-menu-grid">
              {Object.entries(dishImages).map(([name, src]) => (
                <figure key={name} className="public-menu-item">
                  <div className="dish-photo">
                    <Image
                      src={src}
                      alt=""
                      fill
                      sizes="(max-width: 700px) 100vw, 33vw"
                    />
                  </div>
                  <figcaption className="dish-copy">{name}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}
        {[
          "avis",
          "compte",
          "mentions-legales",
          "confidentialite",
          "cookies",
        ].includes(route) && (
          <section className="public-section editorial">
            <span className="eyebrow">INFORMATIONS · V0 LOCALE</span>
            <h1>
              {
                {
                  avis: "Vos mots, notre plaisir",
                  compte: "Votre espace client",
                  "mentions-legales": "Mentions légales",
                  confidentialite: "Confidentialité",
                  cookies: "Cookies",
                }[route]
              }
            </h1>
            <p>
              {
                {
                  avis: "Aucun avis client n’est publié dans cette démonstration. Les références communiquées devront être vérifiées avant publication.",
                  compte:
                    "L’authentification et l’espace personnel client ne sont pas encore disponibles. Vous pouvez déposer une demande de réservation ou de commande sans compte.",
                  "mentions-legales":
                    "Contenu à compléter et valider avant publication : identité de l’exploitant, raison sociale, immatriculation, directeur de publication et hébergeur.",
                  confidentialite:
                    "Contenu à compléter et valider avant publication : responsable du traitement, finalités, bases légales, durée de conservation et exercice des droits. Cette démo conserve les saisies dans une base locale. Utilisez des coordonnées fictives.",
                  cookies:
                    "La démo utilise un cookie de session technique HttpOnly pour les profils du personnel. Aucun traceur publicitaire ou outil de mesure d’audience n’est intégré. Politique à valider avant publication.",
                }[route]
              }
            </p>
            <Link className="btn secondary" href={sitePath("/reservations")}>
              Accéder aux réservations
            </Link>
          </section>
        )}
      </main>
      <SiteFooter restaurant={restaurant} />
    </div>
  );
}
