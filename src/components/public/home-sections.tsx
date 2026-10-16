import Link from "next/link";
import { ArrowUpRight, MapPin, Phone } from "lucide-react";
import type { MenuItem, Restaurant } from "@/lib/types";
import { homeAnchors } from "./navigation";

// Sections de l'accueil. Chaque section porte un id (ancre de navigation)
// et un attribut data-scene, point d'accroche prévu pour les futures
// animations au défilement (ScrollTrigger) sans modifier le balisage.
// Aucun contenu commercial n'est inventé : ce qui manque est signalé par
// <MissingContent>.

function MissingContent({ children }: { children: React.ReactNode }) {
  return (
    <p className="missing-content">À fournir par le restaurant : {children}</p>
  );
}

function Heading({
  id,
  eyebrow,
  children,
}: {
  id: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <header className="section-head">
      <span className="eyebrow">{eyebrow}</span>
      <h2 id={id}>{children}</h2>
    </header>
  );
}

export function HomeIntro({ restaurant }: { restaurant?: Restaurant }) {
  return (
    <section
      className="public-hero"
      data-scene="intro"
      aria-label="Introduction"
    >
      <div className="public-hero-copy">
        <span className="eyebrow">UNE ESCALE EN MÉDITERRANÉE</span>
        <h1>
          La chaleur d’un lieu.
          <br />
          <em>Le goût du partage.</em>
        </h1>
        <p>
          Au cœur de Bernay, découvrez une cuisine tunisienne et maghrébine,
          entre traditions généreuses et plaisirs simples.
        </p>
        <div className="actions">
          <Link className="btn primary" href="/reservations">
            Réserver une table <ArrowUpRight size={17} aria-hidden />
          </Link>
          <Link className="btn outline" href="/carte">
            Découvrir notre carte
          </Link>
        </div>
        <div className="hero-address">
          <MapPin size={17} aria-hidden />{" "}
          {restaurant?.address || "29 Rue du Général Leclerc, Bernay"}
        </div>
      </div>
      {/* Emplacement média : illustration décorative actuelle, à remplacer
          par une vidéo ou une scène 3D lorsque les visuels officiels existeront. */}
      <div
        className="public-art"
        data-scene-media
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
  );
}

export function HomeStrip() {
  return (
    <div className="public-strip" aria-hidden>
      <span>CUISINE TUNISIENNE</span>
      <i>✳</i>
      <span>L’ART DE RECEVOIR</span>
      <i>✳</i>
      <span>LE PLAISIR DE PARTAGER</span>
      <i>✳</i>
      <span>BERNAY, NORMANDIE</span>
    </div>
  );
}

export function HomeStory() {
  return (
    <section
      id={homeAnchors.histoire}
      className="public-section two-grid"
      data-scene="story"
      aria-labelledby="story-title"
    >
      <Heading id="story-title" eyebrow="L’ESPRIT DE LA MAISON">
        Une table qui
        <br />
        <em>rapproche.</em>
      </Heading>
      <div>
        <p>
          Un couscous à partager, les parfums d’un tajine, un thé à la menthe
          pour prolonger l’instant. Bienvenue au Dattier Hefsi.
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
  );
}

// Les trois familles de plats citées dans la présentation existante.
// Descriptions, photographies et sélection définitive restent à fournir.
const specialties = [
  { name: "Le couscous", line: "À partager." },
  { name: "Les tajines", line: "Pour leurs parfums." },
  { name: "Le thé à la menthe", line: "Pour prolonger l’instant." },
];

export function HomeSpecialties() {
  return (
    <section
      id={homeAnchors.specialites}
      className="public-section"
      data-scene="specialties"
      aria-labelledby="specialties-title"
    >
      <Heading id="specialties-title" eyebrow="NOS SPÉCIALITÉS">
        Les incontournables <em>de la maison.</em>
      </Heading>
      <ul className="specialty-grid">
        {specialties.map((s, i) => (
          <li key={s.name} className="specialty-card">
            <span className="specialty-index" aria-hidden>
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3>{s.name}</h3>
            <p>{s.line}</p>
          </li>
        ))}
      </ul>
      <MissingContent>
        sélection des spécialités, descriptions et photographies officielles des
        plats.
      </MissingContent>
    </section>
  );
}

const menuCategories = ["Entrées", "Plats", "Desserts", "Boissons"];

export function HomeMenuPreview({ menu }: { menu?: MenuItem[] }) {
  return (
    <section
      id={homeAnchors.carte}
      className="public-section menu-preview"
      data-scene="menu"
      aria-labelledby="menu-title"
    >
      <Heading id="menu-title" eyebrow="À SAVOURER, À PARTAGER">
        Notre carte.
      </Heading>
      <ul className="menu-preview-grid">
        {menuCategories.map((c) => {
          const items = menu?.filter((m) => m.category === c) || [];
          return (
            <li key={c}>
              <h3>{c}</h3>
              {menu ? (
                <p>
                  {items
                    .slice(0, 3)
                    .map((m) => m.name)
                    .join(" · ") || "—"}
                  {items.length > 3 ? " …" : ""}
                </p>
              ) : (
                <p aria-busy>Chargement…</p>
              )}
            </li>
          );
        })}
      </ul>
      <div className="actions">
        <Link className="btn primary" href="/carte">
          Voir toute la carte <ArrowUpRight size={17} aria-hidden />
        </Link>
        <Link className="btn outline" href="/commander">
          Commander à emporter
        </Link>
      </div>
      <p className="muted">
        Carte de démonstration synchronisée avec DATTIER OS. Prix, compositions
        et allergènes non validés par le restaurant.
      </p>
    </section>
  );
}

export function HomeReviews() {
  return (
    <section
      id={homeAnchors.avis}
      className="public-section"
      data-scene="reviews"
      aria-labelledby="reviews-title"
    >
      <Heading id="reviews-title" eyebrow="AVIS CLIENTS">
        Vos mots, <em>notre plaisir.</em>
      </Heading>
      <p>
        Aucun avis client n’est publié dans cette démonstration. Les avis
        proviendront des plateformes publiques (Google, Tripadvisor…) une fois
        leur intégration validée.
      </p>
      <MissingContent>
        liste des plateformes d’avis à afficher et accord sur leurs conditions
        d’utilisation.
      </MissingContent>
      <Link href="/avis" className="text-button">
        En savoir plus →
      </Link>
    </section>
  );
}

export function HomeReservation() {
  return (
    <section
      id={homeAnchors.reservation}
      className="public-section reservation-cta"
      data-scene="reservation"
      aria-labelledby="reservation-title"
    >
      <Heading id="reservation-title" eyebrow="ON VOUS GARDE UNE PLACE ?">
        Les bons moments <em>se réservent.</em>
      </Heading>
      <p>
        Choisissez votre jour et votre heure sur le calendrier, puis votre
        table directement sur le plan de la salle. L’équipe confirme ensuite.
      </p>
      <Link className="btn light" href="/reservations">
        Choisir ma table <ArrowUpRight size={17} aria-hidden />
      </Link>
    </section>
  );
}

// Réponses décrivant uniquement le fonctionnement actuel du site.
const faq = [
  {
    q: "Faut-il créer un compte pour réserver ?",
    a: "Non. Vous pouvez déposer une demande de réservation ou de commande à emporter sans compte.",
  },
  {
    q: "Ma réservation est-elle confirmée immédiatement ?",
    a: "Votre demande retient le créneau et la table choisie sur le plan. L’équipe doit ensuite la confirmer.",
  },
  {
    q: "Peut-on payer en ligne ?",
    a: "Non, aucun paiement en ligne n’est proposé sur ce site.",
  },
  {
    q: "Proposez-vous la vente à emporter ?",
    a: "Vous pouvez envoyer une demande de commande à emporter depuis la page dédiée. La disponibilité est revérifiée par le personnel.",
  },
];

export function HomeFaq() {
  return (
    <section
      id={homeAnchors.faq}
      className="public-section"
      data-scene="faq"
      aria-labelledby="faq-title"
    >
      <Heading id="faq-title" eyebrow="QUESTIONS FRÉQUENTES">
        Bon à savoir.
      </Heading>
      <div className="faq-list">
        {faq.map((f) => (
          <details key={f.q}>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>
      <MissingContent>
        horaires, accessibilité, stationnement, allergènes, groupes et
        privatisation.
      </MissingContent>
    </section>
  );
}

export function HomePracticalInfo({ restaurant }: { restaurant?: Restaurant }) {
  return (
    <section
      id={homeAnchors.infos}
      className="public-section"
      data-scene="info"
      aria-labelledby="info-title"
    >
      <Heading id="info-title" eyebrow="INFORMATIONS PRATIQUES">
        Au cœur de Bernay.
      </Heading>
      <dl className="info-grid">
        <div>
          <dt>Adresse</dt>
          <dd>
            <span className="with-icon">
              <MapPin size={17} aria-hidden /> {restaurant?.address || "—"}
            </span>
            <a
              className="text-button"
              href="https://www.openstreetmap.org/search?query=29%20Rue%20du%20G%C3%A9n%C3%A9ral%20Leclerc%20Bernay"
              target="_blank"
              rel="noreferrer"
            >
              Voir la localisation ↗
            </a>
          </dd>
        </div>
        <div>
          <dt>Téléphone</dt>
          <dd>
            {restaurant ? (
              <a
                className="with-icon"
                href={`tel:${restaurant.phone.replaceAll(" ", "")}`}
              >
                <Phone size={17} aria-hidden /> {restaurant.phone}
              </a>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div>
          <dt>Horaires</dt>
          <dd>Horaires à confirmer auprès de l’établissement.</dd>
        </div>
      </dl>
      <Link href="/contact" className="text-button">
        Toutes les informations de contact →
      </Link>
    </section>
  );
}
