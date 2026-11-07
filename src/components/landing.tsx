import { plans, additionalRestaurantPrice } from "@/features/platform/pricing";
import Link from "next/link";
import {
  ArrowUpRight,
  Boxes,
  Building2,
  CalendarDays,
  Check,
  ChefHat,
  Code2,
  Globe,
  LayoutGrid,
  Lock,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  Users,
  UtensilsCrossed,
} from "lucide-react";

const modules = [
  {
    icon: ReceiptText,
    title: "Commandes",
    text: "Prise de commande en salle, à emporter et depuis le site. Les tickets partent directement en cuisine et au bar.",
  },
  {
    icon: LayoutGrid,
    title: "Salle",
    text: "Plan de salle à votre image, état des tables en direct et réaménagement en quelques gestes.",
  },
  {
    icon: CalendarDays,
    title: "Réservations",
    text: "Vos clients choisissent le jour, l’heure et leur table sur le plan. L’équipe retrouve la demande aussitôt.",
  },
  {
    icon: Boxes,
    title: "Stocks & achats",
    text: "Inventaires, achats et recettes. Un produit épuisé n’est plus proposé sur le site.",
  },
  {
    icon: Users,
    title: "Équipe",
    text: "Salle, cuisine, bar, direction : chacun son poste et ses accès, sur les mêmes données.",
  },
  {
    icon: Globe,
    title: "Site web",
    text: "Un studio pour composer votre vitrine : pages, identité, polices, référencement, publication et versions.",
  },
  {
    icon: ShoppingBag,
    title: "Boutique & clients",
    text: "Commande en ligne, espace client et fidélité, rattachés à votre établissement.",
  },
];

const steps = [
  {
    title: "Créez votre compte",
    text: "Un compte propriétaire, une organisation : votre espace est prêt.",
  },
  {
    title: "Ajoutez votre structure",
    text: "Nom, carte, plan de salle. La création est guidée pas à pas.",
  },
  {
    title: "Ouvrez le service",
    text: "Invitez l’équipe, publiez votre site, prenez les premières commandes.",
  },
];

const faq = [
  {
    q: "Puis-je essayer avant de créer mon compte ?",
    a: "Oui. La démonstration ouvre un restaurant fictif complet : choisissez un métier (salle, cuisine, bar, direction) et vivez un service connecté.",
  },
  {
    q: "Mes données sont-elles visibles par d’autres restaurants ?",
    a: "Non. Chaque structure ne voit que ses propres données. Le cloisonnement est appliqué directement par la base de données, pas seulement par l’interface.",
  },
  {
    q: "J’ouvre une deuxième adresse, que se passe-t-il ?",
    a: "Chaque forfait inclut un établissement. Ajoutez des établissements à 39 € HT par mois chacun. Ils bénéficient tous du forfait de votre organisation et conservent leurs propres données.",
  },
  {
    q: "Le code est-il ouvert ?",
    a: "Oui. atacuisine est distribué sous licence AGPL-3.0. Le code de la version en service reste consultable.",
  },
];

function Cta({ demoHref, inverse }: { demoHref?: string; inverse?: boolean }) {
  return (
    <div className="landing-cta">
      {demoHref && (
        <Link
          className={`landing-btn ${inverse ? "light" : "primary"}`}
          href={demoHref}
        >
          Essayer la démo <ArrowUpRight size={16} aria-hidden />
        </Link>
      )}
      <Link
        className={`landing-btn ${demoHref ? "outline" : inverse ? "light" : "primary"}`}
        href="/platform"
      >
        Créer mon compte
      </Link>
    </div>
  );
}

export function Landing({ demo, demoHref }: { demo: boolean; demoHref?: string }) {
  return (
    <div className="landing">
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>
      <header className="landing-header">
        <Link href="/" className="landing-brand">
          <UtensilsCrossed size={20} aria-hidden /> atacuisine
        </Link>
        <nav aria-label="Navigation principale">
          <a href="#modules">Modules</a>
          <a href="#isolation">Vos données</a>
          <a href="#offres">Offres</a>
          <a href="#questions">Questions</a>
        </nav>
        <Link className="landing-btn primary small" href="/platform">
          Se connecter
        </Link>
      </header>

      <main id="contenu" tabIndex={-1}>
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <span className="landing-eyebrow">
              Le logiciel de gestion des restaurateurs
            </span>
            <h1>
              Tout votre restaurant
              <br /> dans <em>un seul</em> OS.
            </h1>
            <p className="landing-lead">
              Commandes, salle, réservations, stocks, équipe, site web et
              boutique : un même outil pour la salle, la cuisine, le bar et la
              direction. Une information saisie une fois est à jour partout.
            </p>
            <Cta demoHref={demoHref} />
            <p className="landing-note">
              Clean Code (AGPL-3.0) · Données cloisonnées par structure ·
              Auto-hébergeable
            </p>
          </div>
          <div className="landing-board" aria-hidden>
            <div className="landing-board-bar">
              <span />
              <span />
              <span />
              <strong>Service du soir</strong>
            </div>
            <div className="landing-board-cols">
              {[
                {
                  icon: LayoutGrid,
                  label: "Salle",
                  items: ["Table 4 · envoyée", "Table 7 · à encaisser"],
                },
                {
                  icon: ChefHat,
                  label: "Cuisine",
                  items: ["Table 4 · en préparation", "À emporter · prête"],
                },
                {
                  icon: Boxes,
                  label: "Stocks",
                  items: ["Inventaire du jour", "Achat à valider"],
                },
              ].map((c) => (
                <div className="landing-board-col" key={c.label}>
                  <span className="landing-board-head">
                    <c.icon size={15} /> {c.label}
                  </span>
                  {c.items.map((i) => (
                    <span className="landing-ticket" key={i}>
                      {i}
                    </span>
                  ))}
                </div>
              ))}
            </div>
            <div className="landing-board-foot">
              <CalendarDays size={15} /> Réservation reçue depuis le site
            </div>
          </div>
        </section>

        <section className="landing-section" id="modules">
          <div className="landing-heading">
            <span className="landing-eyebrow">Un seul OS</span>
            <h2>Chaque métier du restaurant, enfin relié.</h2>
            <p>
              Fini les outils qui ne se parlent pas. Les modules partagent les
              mêmes données, en temps réel, sans ressaisie.
            </p>
          </div>
          <div className="landing-modules">
            {modules.map((m) => (
              <article key={m.title} className="landing-card">
                <m.icon size={22} aria-hidden />
                <h3>{m.title}</h3>
                <p>{m.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section landing-simple">
          <div className="landing-heading">
            <span className="landing-eyebrow">
              Simple dès le premier service
            </span>
            <h2>Trois étapes pour démarrer.</h2>
          </div>
          <ol className="landing-steps">
            {steps.map((s, i) => (
              <li key={s.title}>
                <span className="landing-step-num">{i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
          <ul className="landing-benefits">
            <li>
              <Check size={18} aria-hidden /> Une saisie, à jour partout : la
              carte, le site et la cuisine suivent les stocks.
            </li>
            <li>
              <Check size={18} aria-hidden /> Chacun voit son poste : pas
              d’écran surchargé pour le serveur ou le cuisinier.
            </li>
            <li>
              <Check size={18} aria-hidden /> Sur ordinateur, tablette ou
              téléphone, sans matériel imposé.
            </li>
          </ul>
        </section>

        <section className="landing-section landing-isolation" id="isolation">
          <div className="landing-heading">
            <span className="landing-eyebrow">
              Vos données restent les vôtres
            </span>
            <h2>Chaque structure ne voit que ses données.</h2>
            <p>
              Votre restaurant a son propre espace. Commandes, clients, stocks
              et équipe ne sont jamais visibles depuis un autre établissement.
            </p>
          </div>
          <div className="landing-guarantees">
            <article>
              <Lock size={22} aria-hidden />
              <h3>Cloisonnement en base</h3>
              <p>
                L’isolation est appliquée par la base de données elle-même, à
                chaque requête, et pas seulement par l’affichage.
              </p>
            </article>
            <article>
              <Building2 size={22} aria-hidden />
              <h3>Une structure, un espace</h3>
              <p>
                Même avec plusieurs adresses, chaque structure garde son équipe,
                sa carte, son site et ses clients.
              </p>
            </article>
            <article>
              <ShieldCheck size={22} aria-hidden />
              <h3>Accès par rôle et journal</h3>
              <p>
                Chacun n’accède qu’à ce que son rôle permet. Les actions
                sensibles sont tracées dans un journal d’activité.
              </p>
            </article>
            <article>
              <Code2 size={22} aria-hidden />
              <h3>Clean Code</h3>
              <p>
                Code ouvert sous AGPL-3.0, vérifiable et auto-hébergeable sur
                votre propre infrastructure.
              </p>
            </article>
          </div>
        </section>

        <section className="landing-section" id="offres">
          <div className="landing-heading">
            <span className="landing-eyebrow">Offres</span>
            <h2>Une adresse ou plusieurs, le même OS.</h2>
            <p>
              Un établissement inclus. Chaque établissement supplémentaire coûte{" "}
              {additionalRestaurantPrice} € HT par mois et bénéficie du même
              forfait. Le hors ligne, la sécurité, la traçabilité et les
              tutoriels sont inclus.
            </p>
          </div>
          <div className="landing-plans">
            {plans.map((p) => (
              <article
                key={p.price}
                className="landing-plan"
                data-featured={p.price === 69 || undefined}
              >
                <span className="landing-eyebrow">Offre</span>
                <h3>{p.title}</h3>
                <strong className="landing-plan-quota">
                  {p.price} € HT / mois
                </strong>
                <p>{p.description}</p>
                <Link
                  className={`landing-btn ${p.price === 69 ? "light" : "primary"}`}
                  href={`/checkout/${p.price}`}
                >
                  Choisir {p.title}
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section" id="questions">
          <div className="landing-heading">
            <span className="landing-eyebrow">Questions</span>
            <h2>Avant de vous lancer.</h2>
          </div>
          <div className="landing-faq">
            {faq.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="landing-final">
          <h2>Votre prochain service, dans un seul outil.</h2>
          <p>
            {demo
              ? "Découvrez atacuisine sur un restaurant de démonstration, puis créez votre espace."
              : "Créez votre espace, ajoutez votre structure et ouvrez le service."}
          </p>
          <Cta demoHref={demoHref} inverse />
        </section>
      </main>

      <footer className="landing-footer">
        <span className="landing-brand">
          <UtensilsCrossed size={18} aria-hidden /> atacuisine
        </span>
        <nav aria-label="Liens utiles">
          {demoHref && <Link href={demoHref}>Démonstration</Link>}
          {demo && <Link href="/site-demo">Exemple de site restaurant</Link>}
          <Link href="/platform">Espace client</Link>
          <Link href="/source">Code source et licence</Link>
        </nav>
        <small>© atacuisine · Logiciel libre sous licence AGPL-3.0</small>
      </footer>
    </div>
  );
}
