import { LocationMap } from "./location-map";
import Image from "next/image";
import { foodMedia } from "./food-media";
import Link from "next/link";
import { Fragment } from "react";
import { ArrowUpRight, ChevronDown, MapPin, Phone } from "lucide-react";
import type { MenuItem, Restaurant } from "@/lib/types";
import { homeAnchors, sitePath } from "./navigation";
import { QuickBooking, TiltCard, useHeroMotion } from "./home-motion";

// Sections de l'accueil. Chaque section porte un id (ancre de navigation)
// et un attribut data-scene ; les blocs marqués data-reveal apparaissent au
// défilement (voir ScrollReveal dans home-motion.tsx).
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
    <header className="section-head" data-reveal>
      <span className="eyebrow">{eyebrow}</span>
      <h2 id={id}>{children}</h2>
    </header>
  );
}

export function HomeIntro({ restaurant }: { restaurant?: Restaurant }) {
  const ref = useHeroMotion();
  return (
    <section
      ref={ref}
      className="public-hero"
      data-scene="intro"
      aria-label="Introduction"
    >
      <Image
        className="hero-food"
        src={foodMedia.couscous}
        alt=""
        fill
        sizes="100vw"
        preload
      />
      <div className="hero-veil" aria-hidden />
      <div className="hero-glow" aria-hidden />
      <svg
        className="hero-arch"
        viewBox="0 0 200 300"
        aria-hidden
        preserveAspectRatio="xMidYMax meet"
      >
        <path d="M6 300V100a94 94 0 0 1 188 0v200" />
        <path d="M22 300V104a78 78 0 0 1 156 0v196" />
      </svg>
      <div className="hero-inner">
        <div className="public-hero-copy">
          <span className="eyebrow">UNE ESCALE EN MÉDITERRANÉE</span>
          <h1>
            <SplitWords text="Un couscous qui fume." from={0} />
            <br />
            <em>
              <SplitWords text="Et tout le monde se rapproche." from={4} />
            </em>
          </h1>
          <p>
            Semoule légère, bouillon parfumé et harissa à doser à votre goût.
            Une escale tunisienne au cœur de Bernay.
          </p>
          <div className="actions">
            <Link className="btn light" href={sitePath("/reservations")}>
              Réserver une table <ArrowUpRight size={17} aria-hidden />
            </Link>
            <Link className="btn ghost" href={sitePath("/carte")}>
              Explorer la carte
            </Link>
          </div>
          <Link className="hero-order" href={sitePath("/commander")}>
            Click & collect <ArrowUpRight size={16} aria-hidden />
          </Link>
          <div className="hero-address">
            <MapPin size={17} aria-hidden />{" "}
            {restaurant?.address || "29 Rue du Général Leclerc, Bernay"}
          </div>
        </div>
        <QuickBooking />
      </div>
      <a className="hero-scroll" href={`#${homeAnchors.specialites}`}>
        <span>Découvrir</span>
        <ChevronDown size={18} aria-hidden />
      </a>
    </section>
  );
}

// Découpe un texte en mots animés l'un après l'autre (--i = rang du mot).
// Les espaces restent hors des mots (inline-block) : le titre se lit
// normalement et garde ses espaces.
function SplitWords({ text, from }: { text: string; from: number }) {
  return text.split(" ").map((w, i, all) => (
    <Fragment key={i}>
      <span
        className="hero-word"
        style={{ "--i": from + i } as React.CSSProperties}
      >
        {w}
      </span>
      {i < all.length - 1 ? " " : null}
    </Fragment>
  ));
}

const stripWords = [
  "CUISINE TUNISIENNE",
  "L’ART DE RECEVOIR",
  "LE PLAISIR DE PARTAGER",
  "BERNAY, NORMANDIE",
];

// Bandeau défilant : la suite est doublée pour boucler sans saut.
export function HomeStrip() {
  return (
    <div className="public-strip" aria-hidden>
      <div className="strip-track">
        {[0, 1].map((k) => (
          <div className="strip-run" key={k}>
            {stripWords.map((w) => (
              <span key={w}>
                {w}
                <i>✳</i>
              </span>
            ))}
          </div>
        ))}
      </div>
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
      <div data-reveal>
        <p>
          Un couscous à partager, les parfums d’un tajine, un thé à la menthe
          pour prolonger l’instant. Bienvenue au Studio Restau.
        </p>
        <Link href={sitePath("/histoire")} className="text-button">
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
  { name: "Le couscous", line: "À partager.", image: foodMedia.couscous },
  { name: "Les tajines", line: "Pour leurs parfums.", image: foodMedia.tajine },
  {
    name: "Le thé à la menthe",
    line: "Pour prolonger l’instant.",
    image: foodMedia.tea,
  },
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
          <TiltCard
            key={s.name}
            className="specialty-card"
            style={{ "--d": i } as React.CSSProperties}
          >
            <Link href={sitePath("/carte")} className="specialty-link">
              <Image
                src={s.image}
                alt=""
                fill
                sizes="(max-width: 700px) 100vw, 33vw"
              />
              <div className="specialty-caption">
                <h3>{s.name}</h3>
                <p>{s.line}</p>
              </div>
              <ArrowUpRight className="specialty-arrow" size={22} aria-hidden />
            </Link>
          </TiltCard>
        ))}
      </ul>
      <p className="muted">
        Images d’illustration générées pour la démonstration.
      </p>
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
        {menuCategories.map((c, i) => {
          const items = menu?.filter((m) => m.category === c) || [];
          return (
            <li key={c} data-reveal style={{ "--d": i } as React.CSSProperties}>
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
        <Link className="btn primary" href={sitePath("/carte")}>
          Voir toute la carte <ArrowUpRight size={17} aria-hidden />
        </Link>
        <Link className="btn outline" href={sitePath("/commander")}>
          Commander à emporter
        </Link>
      </div>
      <p className="muted">
        Carte de démonstration synchronisée avec STUDIO OS. Prix, compositions
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
      <Link href={sitePath("/avis")} className="text-button">
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
        Choisissez votre jour et votre heure sur le calendrier, puis votre table
        directement sur le plan de la salle. L’équipe confirme ensuite.
      </p>
      <Link className="btn light" href={sitePath("/reservations")}>
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
      <div className="faq-list" data-reveal>
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
      <dl className="info-grid" data-reveal>
        <div>
          <dt>Adresse</dt>
          <dd>
            <span className="with-icon">
              <MapPin size={17} aria-hidden />{" "}
              {restaurant?.address || "29 Rue du Général Leclerc, 27300 Bernay"}
            </span>
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
      <LocationMap
        address={
          restaurant?.address || "29 Rue du Général Leclerc, 27300 Bernay"
        }
      />
      <Link href={sitePath("/contact")} className="text-button">
        Toutes les informations de contact →
      </Link>
    </section>
  );
}
