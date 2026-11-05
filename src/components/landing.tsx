import Link from "next/link";
import {
  ArrowUpRight,
  Building2,
  Check,
  Clock,
  Code2,
  Eye,
  Globe,
  HeartHandshake,
  LayoutDashboard,
  Lock,
  PenLine,
  ShieldCheck,
  Smile,
  Sparkles,
  UserCog,
  UtensilsCrossed,
} from "lucide-react";
import {
  FloatingDock,
  ModuleExplorer,
  Reveal,
  RotatingWord,
  Secrets,
  ServicePass,
  type Module,
} from "./landing-motion";

// Page de présentation de Dattier OS. Uniquement des faits vérifiables dans
// le code : modules existants, isolation par structure, quotas des offres
// (database/migrations/017_tenancy_plans.sql). Ni témoignage, ni chiffre client.

const modules: Module[] = [
  {
    key: "commandes",
    title: "Commandes",
    text: "Prise de commande en salle, à emporter et depuis le site.",
    detail: "Les tickets partent directement en cuisine et au bar.",
  },
  {
    key: "salle",
    title: "Salle",
    text: "Un plan de salle à votre image et l’état des tables en direct.",
    detail: "Réaménagez-le en quelques gestes, le soir même.",
  },
  {
    key: "reservations",
    title: "Réservations",
    text: "Vos clients choisissent le jour, l’heure et leur table sur le plan.",
    detail: "L’équipe retrouve la demande aussitôt.",
  },
  {
    key: "stocks",
    title: "Stocks & achats",
    text: "Inventaires, achats et recettes au même endroit.",
    detail: "Un produit épuisé n’est plus proposé sur le site.",
  },
  {
    key: "equipe",
    title: "Équipe",
    text: "Salle, cuisine, bar, direction : chacun son poste et ses accès.",
    detail: "Tout le monde travaille sur les mêmes données.",
  },
  {
    key: "site",
    title: "Site web",
    text: "Un studio pour composer votre vitrine : pages, identité, polices.",
    detail: "Référencement, publication et versions inclus.",
  },
  {
    key: "boutique",
    title: "Boutique & clients",
    text: "Commande en ligne, espace client et fidélité.",
    detail: "Le tout rattaché à votre établissement.",
  },
];

const outcomes = [
  {
    icon: Smile,
    feeling: "Des services sereins",
    text: "Fini les bons perdus : chacun sait quoi faire, au bon moment.",
    because: "Commandes envoyées en cuisine et au bar",
  },
  {
    icon: Clock,
    feeling: "Du temps rendu",
    text: "Moins de ressaisie, moins de tableurs le soir.",
    because: "Une saisie unique, à jour partout",
  },
  {
    icon: HeartHandshake,
    feeling: "Une équipe alignée",
    text: "Salle, cuisine et bar regardent la même information.",
    because: "Un poste et des accès par métier",
  },
  {
    icon: Sparkles,
    feeling: "Une vitrine qui vous ressemble",
    text: "Un site que vous modifiez vous-même, sans agence.",
    because: "Studio de site, réservation et boutique",
  },
  {
    icon: Eye,
    feeling: "Tout sous contrôle",
    text: "Ventes, stocks, réservations : sans attendre la fin du mois.",
    because: "Tableau de bord en temps réel",
  },
];

// Démarrer, servi comme un menu.
const courses = [
  {
    course: "Entrée",
    title: "Créez votre compte",
    text: "Un compte propriétaire, une organisation : votre espace est prêt.",
  },
  {
    course: "Plat",
    title: "Ajoutez votre structure",
    text: "Nom, carte, plan de salle. La création est guidée pas à pas.",
  },
  {
    course: "Dessert",
    title: "Ouvrez le service",
    text: "Invitez l’équipe, publiez votre site, prenez les premières commandes.",
  },
];

const guarantees = [
  {
    icon: Lock,
    title: "Cloisonnement en base",
    text: "Appliqué par la base de données à chaque requête, pas seulement par l’affichage.",
  },
  {
    icon: Building2,
    title: "Une structure, un espace",
    text: "Chaque adresse garde son équipe, sa carte, son site et ses clients.",
  },
  {
    icon: ShieldCheck,
    title: "Accès par rôle et journal",
    text: "Chacun n’accède qu’à son rôle. Les actions sensibles sont tracées.",
  },
  {
    icon: Code2,
    title: "Open source",
    text: "Code ouvert sous AGPL-3.0, vérifiable et auto-hébergeable.",
  },
];

const plans = [
  {
    name: "Essentiel",
    pitch: "Un établissement, tout piloté au même endroit.",
    structures: "1 structure",
    features: [
      "Tous les modules",
      "Site web et boutique",
      "Accès de l’équipe par rôle",
      "Données isolées dans votre espace",
    ],
  },
  {
    name: "Premium",
    pitch: "Pour les restaurateurs aux multiples adresses.",
    structures: "Jusqu’à 10 structures",
    features: [
      "Tout l’Essentiel",
      "Plusieurs structures, un compte",
      "Un site, une boutique, une équipe par structure",
      "Chaque structure cloisonnée des autres",
    ],
    featured: true,
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
    a: "L’offre Essentiel couvre une structure. Avec Premium, vous ajoutez vos autres établissements au même compte, chacun gardant ses données.",
  },
  {
    q: "Le code est-il ouvert ?",
    a: "Oui. Dattier OS est distribué sous licence AGPL-3.0 et peut être auto-hébergé. Le code de la version en service reste consultable.",
  },
];

const ticker = [
  "Table 4 · envoyée en cuisine",
  "Réservation · 20h30 · 4 couverts",
  "Inventaire du jour validé",
  "À emporter · prête",
  "Carte mise à jour sur le site",
  "Table 7 · à encaisser",
  "Nouveau client fidèle",
  "Achat fournisseur à valider",
];

function Cta({ demo, inverse }: { demo: boolean; inverse?: boolean }) {
  return (
    <div className="landing-cta">
      {demo && (
        <Link
          className={`landing-btn ${inverse ? "light" : "primary"}`}
          href="/demo"
        >
          Essayer la démo <ArrowUpRight size={16} aria-hidden />
        </Link>
      )}
      <Link
        className={`landing-btn ${demo ? (inverse ? "ghost" : "outline") : inverse ? "light" : "primary"}`}
        href="/platform"
      >
        Créer mon compte
      </Link>
    </div>
  );
}

export type Account = {
  name: string;
  restaurants: { id: string; name: string }[];
};

const shortcuts = (id: string) => [
  {
    icon: LayoutDashboard,
    label: "Tableau de bord",
    href: `/dashboard?restaurant=${id}`,
  },
  { icon: UserCog, label: "Équipe et accès", href: `/restaurant/${id}` },
  { icon: PenLine, label: "Modifier mon site", href: `/restaurant/${id}/site` },
  { icon: Globe, label: "Voir mon site", href: `/r/${id}` },
];

function ClientSpace({ account }: { account: Account | null }) {
  return (
    <section className="landing-section landing-client" id="espace-client">
      <Reveal className="landing-heading">
        <span className="landing-eyebrow">Déjà client ?</span>
        <h2>
          {account
            ? `Bonjour ${account.name}, votre espace vous attend.`
            : "Votre espace, en un clic."}
        </h2>
      </Reveal>
      {account && account.restaurants.length ? (
        <div className="landing-client-list">
          {account.restaurants.map((r) => (
            <article key={r.id} className="landing-client-card">
              <h3>{r.name}</h3>
              <div className="landing-shortcuts">
                {shortcuts(r.id).map((s) => (
                  <Link key={s.label} href={s.href}>
                    <s.icon size={18} aria-hidden /> {s.label}
                  </Link>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="landing-client-card">
          <div className="landing-shortcuts">
            {[
              { icon: LayoutDashboard, label: "Tableau de bord" },
              { icon: UserCog, label: "Équipe et accès" },
              { icon: PenLine, label: "Modifier mon site" },
              { icon: Globe, label: "Voir mon site" },
            ].map((s) => (
              <Link key={s.label} href="/platform">
                <s.icon size={18} aria-hidden /> {s.label}
              </Link>
            ))}
          </div>
          <Link className="landing-btn primary" href="/platform">
            Se connecter à mon espace <ArrowUpRight size={16} aria-hidden />
          </Link>
        </div>
      )}
    </section>
  );
}

export function Landing({
  demo,
  account = null,
}: {
  demo: boolean;
  account?: Account | null;
}) {
  return (
    <div className="landing">
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>
      <header className="landing-header">
        <Link href="/" className="landing-brand" title="Un, deux, trois…">
          <span className="landing-brand-mark">
            <UtensilsCrossed size={16} aria-hidden />
          </span>
          DATTIER <span>OS</span>
        </Link>
        <nav aria-label="Navigation principale">
          <a href="#modules">Modules</a>
          <a href="#isolation">Vos données</a>
          <a href="#offres">Offres</a>
          <a href="#questions">Questions</a>
          <a href="#espace-client">Espace client</a>
        </nav>
        <Link
          className="landing-btn primary small"
          href={account ? "#espace-client" : "/platform"}
        >
          {account ? "Mon espace" : "Se connecter"}
        </Link>
      </header>

      <main id="contenu" tabIndex={-1}>
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <span className="landing-pill">
              <span className="lx-live" aria-hidden /> Le logiciel des
              restaurateurs
            </span>
            <h1>
              Tout votre <RotatingWord /> dans <em>un seul</em>&nbsp;OS.
            </h1>
            <p className="landing-lead">
              Commandes, salle, réservations, stocks, équipe, site et boutique.
              Une information saisie une fois est à jour partout.
            </p>
            <Cta demo={demo} />
            <ul className="landing-tags" aria-label="En bref">
              <li>Open source · AGPL-3.0</li>
              <li>Données cloisonnées</li>
              <li>Auto-hébergeable</li>
            </ul>
          </div>
          <ServicePass />
        </section>

        <div className="landing-ticker" aria-hidden>
          <div className="landing-ticker-track">
            {[...ticker, ...ticker].map((t, i) => (
              <span key={i}>
                <UtensilsCrossed size={14} /> {t}
              </span>
            ))}
          </div>
        </div>

        <section className="landing-section">
          <Reveal className="landing-heading">
            <span className="landing-eyebrow">Ce que ça change</span>
            <h2>
              Moins de stress, <em>plus de restaurant.</em>
            </h2>
          </Reveal>
          <div className="landing-bento">
            {outcomes.map((o, i) => (
              <Reveal key={o.feeling} delay={i * 70} className="landing-tile">
                <span className="landing-tile-icon">
                  <o.icon size={22} aria-hidden />
                </span>
                <h3>{o.feeling}</h3>
                <p>{o.text}</p>
                <span className="landing-because">
                  <Check size={14} aria-hidden /> {o.because}
                </span>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="landing-section landing-modules-sec" id="modules">
          <Reveal className="landing-heading">
            <span className="landing-eyebrow">Un seul OS</span>
            <h2>Chaque poste du restaurant, enfin relié.</h2>
            <p>Touchez un module : ils partagent tous les mêmes données.</p>
          </Reveal>
          <Reveal>
            <ModuleExplorer modules={modules} />
          </Reveal>
        </section>

        <section className="landing-section landing-menu-sec">
          <Reveal className="landing-menu">
            <div className="landing-menu-head">
              <span className="landing-eyebrow">Menu du jour</span>
              <h2>Démarrer, en trois services.</h2>
            </div>
            <ol>
              {courses.map((c) => (
                <li key={c.course}>
                  <span className="landing-course">{c.course}</span>
                  <span className="landing-menu-line">
                    <strong>{c.title}</strong>
                    <i aria-hidden />
                    <em>inclus</em>
                  </span>
                  <p>{c.text}</p>
                </li>
              ))}
            </ol>
            <p className="landing-menu-foot">
              Ordinateur, tablette ou téléphone · sans matériel imposé
            </p>
          </Reveal>
        </section>

        <section className="landing-section landing-isolation" id="isolation">
          <Reveal className="landing-heading">
            <span className="landing-eyebrow">Vos données restent les vôtres</span>
            <h2>Chaque structure ne voit que ses données.</h2>
          </Reveal>
          <div className="landing-guarantees">
            {guarantees.map((g, i) => (
              <Reveal key={g.title} delay={i * 80}>
                <article>
                  <g.icon size={22} aria-hidden />
                  <h3>{g.title}</h3>
                  <p>{g.text}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="landing-section" id="offres">
          <Reveal className="landing-heading">
            <span className="landing-eyebrow">Offres</span>
            <h2>Une adresse ou plusieurs, le même OS.</h2>
            <p>Tous les modules dans les deux. Seul le nombre de structures change.</p>
          </Reveal>
          <div className="landing-plans">
            {plans.map((p, i) => (
              <Reveal key={p.name} delay={i * 100}>
                <article
                  className="landing-plan"
                  data-featured={p.featured || undefined}
                >
                  {p.featured && (
                    <span className="landing-plan-badge">Multi-adresses</span>
                  )}
                  <h3>{p.name}</h3>
                  <strong className="landing-plan-quota">{p.structures}</strong>
                  <p>{p.pitch}</p>
                  <ul>
                    {p.features.map((f) => (
                      <li key={f}>
                        <Check size={16} aria-hidden /> {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    className={`landing-btn ${p.featured ? "light" : "primary"}`}
                    href="/platform"
                  >
                    Choisir {p.name} <ArrowUpRight size={16} aria-hidden />
                  </Link>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="landing-section" id="questions">
          <Reveal className="landing-heading">
            <span className="landing-eyebrow">Questions</span>
            <h2>Avant de vous lancer.</h2>
          </Reveal>
          <div className="landing-faq">
            {faq.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <ClientSpace account={account} />

        <section className="landing-final">
          <span className="lx-shape lx-shape-a" aria-hidden />
          <span className="lx-shape lx-shape-c" aria-hidden />
          <h2>Votre prochain service, dans un seul outil.</h2>
          <p>
            {demo
              ? "Découvrez Dattier OS sur un restaurant de démonstration, puis créez votre espace."
              : "Créez votre espace, ajoutez votre structure et ouvrez le service."}
          </p>
          <Cta demo={demo} inverse />
        </section>
      </main>

      <footer className="landing-footer">
        <span className="landing-brand">
          <span className="landing-brand-mark">
            <UtensilsCrossed size={16} aria-hidden />
          </span>
          DATTIER <span>OS</span>
        </span>
        <nav aria-label="Liens utiles">
          {demo && <Link href="/demo">Démonstration</Link>}
          {demo && <Link href="/site-demo">Exemple de site restaurant</Link>}
          <Link href="/platform">Espace client</Link>
          <Link href="/source">Code source et licence</Link>
        </nav>
        <small>
          © Dattier OS · Logiciel libre sous licence AGPL-3.0 ·{" "}
          <span className="landing-hint">↑↑↓↓←→←→ B A</span>
        </small>
      </footer>

      <FloatingDock
        plans={plans.map((p) => ({ name: p.name, quota: p.structures }))}
      />
      <Secrets />
    </div>
  );
}
