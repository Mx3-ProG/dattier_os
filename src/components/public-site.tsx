"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Leaf, ArrowUpRight, MapPin, Phone, Minus, Plus } from "lucide-react";
import type { MenuItem, Restaurant } from "@/lib/types";
import { money } from "@/lib/domain";
import { Form } from "./forms";
import { Button } from "./ui/button";
export function PublicSite({ route }: { route: string }) {
  const router = useRouter();
  const [data, setData] = useState<{
      menu: MenuItem[];
      restaurants: Restaurant[];
    } | null>(null),
    [category, setCategory] = useState("Plats"),
    [cart, setCart] = useState<Record<string, number>>({}),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    const refresh = () =>
      fetch("/api/v1/public?restaurant=bernay")
        .then((r) => r.json())
        .then((d) => (d.error ? setError(d.error) : setData(d)))
        .catch(() => setError("Connexion au restaurant impossible."));
    void refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);
  const restaurant = data?.restaurants.find((r) => r.id === "bernay");
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
      <div className="public-demo">
        Site de démonstration · Prix, recettes et disponibilités fictifs ·{" "}
        <Link href="/demo">Entrer dans DATTIER OS ↗</Link>
      </div>
      <header className="public-header">
        <Link className="public-brand" href="/">
          <Leaf />
          <span>
            le dattier<small>HEFSI · BERNAY</small>
          </span>
        </Link>
        <nav>
          <Link href="/histoire">Notre maison</Link>
          <Link href="/carte">La carte</Link>
          <Link href="/commander">À emporter</Link>
          <Link href="/contact">Nous trouver</Link>
        </nav>
        <Link className="btn primary" href="/reservations">
          Réserver une table <ArrowUpRight size={16} />
        </Link>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <div className="success" role="status">
          {message}
        </div>
      )}
      {route === "" ? (
        <>
          <section className="public-hero">
            <div>
              <span className="eyebrow">UNE ESCALE EN MÉDITERRANÉE</span>
              <h1>
                La chaleur d’un lieu.
                <br />
                <em>Le goût du partage.</em>
              </h1>
              <p>
                Au cœur de Bernay, découvrez une cuisine tunisienne et
                maghrébine, entre traditions généreuses et plaisirs simples.
              </p>
              <div className="actions">
                <Link className="btn primary" href="/carte">
                  Découvrir notre carte <ArrowUpRight size={17} />
                </Link>
                <Link className="text-button" href="/reservations">
                  Prendre place à notre table →
                </Link>
              </div>
              <div className="hero-address">
                <MapPin size={17} />{" "}
                {restaurant?.address || "29 Rue du Général Leclerc, Bernay"}
              </div>
            </div>
            <div
              className="public-art"
              role="img"
              aria-label="Illustration décorative d’une assiette méditerranéenne"
            >
              <div className="sun-disc" />
              <div className="food-plate">
                <span className="couscous" />
                <i />
                <i />
                <i />
                <i />
                <i />
                <b>✳</b>
              </div>
              <span className="art-word">
                Un peu de soleil
                <br />
                <em>dans votre assiette.</em>
              </span>
              <div className="olive-branch">❧</div>
            </div>
          </section>
          <div className="public-strip">
            <span>CUISINE TUNISIENNE</span>
            <i>✳</i>
            <span>L’ART DE RECEVOIR</span>
            <i>✳</i>
            <span>LE PLAISIR DE PARTAGER</span>
            <i>✳</i>
            <span>BERNAY, NORMANDIE</span>
          </div>
          <section className="public-section two-grid">
            <div>
              <span className="eyebrow">L’ESPRIT DE LA MAISON</span>
              <h2>
                Une table qui
                <br />
                <em>rapproche.</em>
              </h2>
            </div>
            <div>
              <p>
                Un couscous à partager, les parfums d’un tajine, un thé à la
                menthe pour prolonger l’instant. Bienvenue au Dattier Hefsi.
              </p>
              <Link href="/histoire" className="text-button">
                Découvrir la maison →
              </Link>
              <p className="muted">
                Présentation éditoriale de démonstration, à valider avec le
                restaurant.
              </p>
            </div>
          </section>
        </>
      ) : null}
      {(route === "carte" || ordering) && (
        <section className="public-section">
          <span className="eyebrow">À SAVOURER, À PARTAGER</span>
          <h1>{ordering ? "La maison, à emporter." : "Notre carte."}</h1>
          <p>
            Carte de démonstration. Prix, compositions et allergènes non validés
            par le restaurant.
          </p>
          <div className="tabs">
            {["Entrées", "Plats", "Desserts", "Boissons"].map((c) => (
              <button
                key={c}
                className={c === category ? "active" : ""}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="public-menu-grid">
            {data?.menu
              .filter((m) => m.category === category)
              .map((m) => (
                <article key={m.id} className="public-menu-item">
                  <div>
                    <h3>{m.name}</h3>
                    <p>{m.description}</p>
                    <small>
                      {m.enabled && m.portions > 0
                        ? "Disponible en démonstration"
                        : "Indisponible"}
                    </small>
                  </div>
                  <div>
                    <b>{money(m.price)}</b>
                    {ordering && (
                      <div className="stepper">
                        <button
                          aria-label={`Retirer ${m.name}`}
                          disabled={!cart[m.id]}
                          onClick={() =>
                            setCart({
                              ...cart,
                              [m.id]: Math.max(0, (cart[m.id] || 0) - 1),
                            })
                          }
                        >
                          <Minus size={15} />
                        </button>
                        <span>{cart[m.id] || 0}</span>
                        <button
                          aria-label={`Ajouter ${m.name}`}
                          disabled={
                            !m.enabled ||
                            (cart[m.id] || 0) >= Math.min(50, m.portions)
                          }
                          onClick={() =>
                            setCart({ ...cart, [m.id]: (cart[m.id] || 0) + 1 })
                          }
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
            <div className="card public-form">
              <h2>Votre demande</h2>
              {data?.menu
                .filter((m) => cart[m.id] > 0)
                .map((m) => (
                  <p key={m.id}>
                    {cart[m.id]} × {m.name} · {money(m.price * cart[m.id])}
                  </p>
                ))}
              <p>
                La disponibilité sera revérifiée lors de l’acceptation par le
                personnel. Aucun paiement en ligne.
              </p>
              <Form
                label="Envoyer la demande"
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
                      ? new URLSearchParams(window.location.search).get("table")
                      : null;
                  await submit("public-order", {
                    restaurant: "bernay",
                    channel: route === "qr" ? "qr" : "takeaway",
                    table: table || undefined,
                    key: crypto.randomUUID(),
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
                  });
                  setCart({});
                }}
              />
            </div>
          )}
        </section>
      )}
      {route === "reservations" && (
        <section className="public-section two-grid">
          <div>
            <span className="eyebrow">ON VOUS GARDE UNE PLACE ?</span>
            <h1>
              Les bons moments
              <br />
              <em>se réservent.</em>
            </h1>
            <p>
              Choisissez votre créneau. Votre demande apparaît directement
              auprès de l’équipe, qui doit l’accepter et vous affecter une
              table.
            </p>
            <p className="muted">
              Démonstration locale : aucune réservation réelle auprès du
              restaurant.
            </p>
          </div>
          <div className="card public-form">
            <Form
              label="Demander une réservation"
              fields={[
                { name: "name", label: "Votre nom" },
                { name: "contact", label: "Téléphone ou e-mail" },
                {
                  name: "guests",
                  label: "Nombre de personnes",
                  type: "number",
                  min: 1,
                  value: 2,
                },
                {
                  name: "start",
                  label: "Date et heure",
                  type: "datetime-local",
                },
                {
                  name: "note",
                  label: "Une attention particulière ?",
                  required: false,
                },
              ]}
              onSubmit={(v) =>
                submit("reservation", {
                  ...v,
                  restaurant: "bernay",
                  start: new Date(v.start).toISOString(),
                })
              }
            />
          </div>
        </section>
      )}
      {route === "contact" && (
        <section className="public-section">
          <span className="eyebrow">À BIENTÔT CHEZ NOUS</span>
          <h1>Au cœur de Bernay.</h1>
          <div className="two-grid">
            <div className="card">
              <MapPin />
              <h2>{restaurant?.name || "Le Dattier Hefsi"}</h2>
              <p>{restaurant?.address}</p>
              <Link href={`tel:${restaurant?.phone.replaceAll(" ", "")}`}>
                <Phone size={17} /> {restaurant?.phone}
              </Link>
              <p>Horaires à confirmer auprès de l’établissement.</p>
              <Link
                href="https://www.openstreetmap.org/search?query=29%20Rue%20du%20G%C3%A9n%C3%A9ral%20Leclerc%20Bernay"
                target="_blank"
                rel="noreferrer"
              >
                Voir la localisation ↗
              </Link>
            </div>
            <div className="contact-art">
              <Leaf size={100} />
              <p>
                La Méditerranée
                <br />a rendez-vous en Normandie.
              </p>
            </div>
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
            Le Dattier Hefsi est un restaurant de cuisine tunisienne et
            maghrébine à Bernay. Couscous, tajines et thé à la menthe composent
            cette carte de démonstration inspirée des plats communiqués.
          </p>
          <p>
            L’histoire de l’équipe, ses origines et ses engagements seront
            ajoutés après validation par le restaurant.
          </p>
          <Link href="/carte" className="btn primary">
            Explorer la carte
          </Link>
        </section>
      )}
      {[
        "galerie",
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
                galerie: "Les images de la maison",
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
                galerie:
                  "Les photographies et vidéos officielles restent à fournir. Les illustrations du site sont décoratives et ne représentent pas les plats servis.",
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
          <Button
            variant="secondary"
            onClick={() => router.push("/reservations")}
          >
            Accéder aux réservations
          </Button>
        </section>
      )}
      <footer className="public-footer">
        <Link href="/" className="public-brand">
          <Leaf />
          <span>
            le dattier<small>LA GÉNÉROSITÉ EN HÉRITAGE · TEXTE DÉMO</small>
          </span>
        </Link>
        <div>
          <Link href="/galerie">Galerie</Link>
          <Link href="/avis">Avis</Link>
          <Link href="/compte">Compte client</Link>
          <Link href="/mentions-legales">Mentions légales</Link>
          <Link href="/confidentialite">Confidentialité</Link>
          <Link href="/cookies">Cookies</Link>
        </div>
        <small>© Dattier OS · Démonstration non publiée</small>
      </footer>
    </div>
  );
}
