import Link from "next/link";
import {
  ArrowUpRight,
  Boxes,
  Clock,
  Eye,
  HeartHandshake,
  LayoutDashboard,
  PenLine,
  Smile,
  Sparkles,
  UserCog,
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
  RefreshCw,
  Rocket,
  Wallet,
} from "lucide-react";
import {
  CURRENT_VERSION,
  current,
  daysUntil,
  formatDate,
  releases,
} from "@/lib/releases";

// Page de présentation de Dattier OS. Uniquement des faits vérifiables dans
// le code : modules existants, isolation par structure, quotas des offres
// (database/migrations/017_tenancy_plans.sql). Ni témoignage, ni chiffre client.

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

// Ce que l'outil change au quotidien : le ressenti d'abord, la fonction qui le permet ensuite.
const outcomes = [
  {
    icon: Smile,
    feeling: "Des services plus sereins",
    text: "Fini les bons perdus et les allers-retours en cuisine : chacun sait quoi faire, au bon moment.",
    because: "Commandes envoyées directement en cuisine et au bar",
  },
  {
    icon: Clock,
    feeling: "Du temps rendu",
    text: "Moins de ressaisie, moins de tableurs le soir. Vous passez ce temps en salle, ou chez vous.",
    because: "Une saisie unique, à jour partout",
  },
  {
    icon: HeartHandshake,
    feeling: "Une équipe alignée",
    text: "La salle, la cuisine et le bar regardent la même information. Moins de tensions, plus de coups de main.",
    because: "Un poste et des accès par métier",
  },
  {
    icon: Sparkles,
    feeling: "Une vitrine dont vous êtes fier",
    text: "Un site à votre image, que vous modifiez vous-même, sans dépendre d’une agence.",
    because: "Studio de site, réservation et boutique intégrés",
  },
  {
    icon: Eye,
    feeling: "Tout sous contrôle",
    text: "Ventes, stocks, réservations : vous savez où vous en êtes, sans attendre la fin du mois.",
    because: "Tableau de bord et historique en temps réel",
  },
];

// Engagement de maintenance : calendrier réel tiré de src/lib/releases.ts.
const promises = [
  {
    icon: Code2,
    title: "Libre",
    text: "Code ouvert, sans enfermement : vos données et votre outil restent les vôtres.",
  },
  {
    icon: Wallet,
    title: "Accessible",
    text: "Un seul abonnement remplace la pile d’outils séparés, sans matériel imposé.",
  },
  {
    icon: Rocket,
    title: "Toujours à jour",
    text: "Les dernières technologies du web, mises à niveau tous les six mois.",
  },
  {
    icon: RefreshCw,
    title: "Maintenu",
    text: "Correctifs chaque mois si besoin, failles de sécurité corrigées sans attendre.",
  },
];

function Roadmap() {
  const upcoming = releases.filter((r) => !r.released).slice(0, 3);
  const nextRelease = upcoming[0];
  return (
    <section className="landing-section landing-roadmap" id="mises-a-jour">
      <div className="landing-heading">
        <span className="landing-eyebrow">Maintenu dans la durée</span>
        <h2>Un outil libre, qui ne vieillit pas.</h2>
        <p>
          Nous avons créé Dattier OS pour que chaque restaurateur accède
          rapidement, simplement et à moindre coût à tous les outils numériques
          de son métier. Et pour qu’ils restent à jour : une mise à jour
          importante tous les six mois, à dates annoncées.
        </p>
      </div>
      <div className="landing-roadmap-grid">
        <ul className="landing-promises">
          {promises.map((p) => (
            <li key={p.title}>
              <p.icon size={20} aria-hidden />
              <div>
                <h3>{p.title}</h3>
                <p>{p.text}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="landing-releases">
          <div className="landing-releases-head">
            <span>Feuille de route</span>
            {nextRelease && (
              <strong>
                Prochaine mise à jour dans {daysUntil(nextRelease.date)} jours
              </strong>
            )}
          </div>
          <ol>
            <li data-current>
              <span className="landing-release-v">v{CURRENT_VERSION}</span>
              <span className="landing-release-copy">
                <strong>{current.title}</strong>
                <small>En service depuis le {formatDate(current.date)}</small>
              </span>
              <span className="landing-release-tag">Actuelle</span>
            </li>
            {upcoming.map((r) => (
              <li key={r.version}>
                <span className="landing-release-v">v{r.version}</span>
                <span className="landing-release-copy">
                  <strong>{r.title}</strong>
                  <small>
                    <time dateTime={r.date}>{formatDate(r.date)}</time>
                  </small>
                </span>
                <span className="landing-release-tag">Prévue</span>
              </li>
            ))}
          </ol>
          <Link className="landing-releases-link" href="/source#calendrier">
            Calendrier complet et politique de maintenance{" "}
            <ArrowUpRight size={15} aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}

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

const plans = [
  {
    name: "Essentiel",
    pitch: "Pour un établissement qui veut tout piloter au même endroit.",
    structures: "1 structure",
    features: [
      "Tous les modules : commandes, salle, réservations, stocks, équipe",
      "Site web et boutique de l’établissement",
      "Accès de l’équipe par rôle et par poste",
      "Données isolées dans votre propre espace",
    ],
  },
  {
    name: "Premium",
    pitch: "Pour les restaurateurs qui gèrent plusieurs adresses.",
    structures: "Jusqu’à 10 structures",
    features: [
      "Tout ce que contient l’offre Essentiel",
      "Plusieurs structures dans un même compte",
      "Un site, une boutique et une équipe par structure",
      "Chaque structure reste cloisonnée des autres",
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
    q: "Le logiciel est-il mis à jour ?",
    a: "Oui. Une mise à jour importante sort tous les six mois, le premier mardi de mai et de novembre, avec des correctifs entre les deux. Le calendrier est public sur la page Code source.",
  },
  {
    q: "Le code est-il ouvert ?",
    a: "Oui. Dattier OS est distribué sous licence AGPL-3.0 et peut être auto-hébergé. Le code de la version en service reste consultable.",
  },
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
        className={`landing-btn ${demo ? "outline" : inverse ? "light" : "primary"}`}
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

// Raccourcis de l'espace client : tableau de bord, équipe, studio du site, site publié.
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
      <div className="landing-heading">
        <span className="landing-eyebrow">Déjà client ?</span>
        <h2>
          {account
            ? `Bonjour ${account.name}, votre espace vous attend.`
            : "Retrouvez votre espace en un clic."}
        </h2>
        <p>
          Tableau de bord, équipe et accès, modification et publication de votre
          site : tout se pilote depuis votre espace client.
        </p>
      </div>
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
        <Link href="/" className="landing-brand">
          <UtensilsCrossed size={20} aria-hidden /> DATTIER <span>OS</span>
        </Link>
        <nav aria-label="Navigation principale">
          <a href="#modules">Modules</a>
          <a href="#isolation">Vos données</a>
          <a href="#mises-a-jour">Mises à jour</a>
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
            <Cta demo={demo} />
            <p className="landing-note">
              Open source (AGPL-3.0) · Données cloisonnées par structure ·
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

        <section className="landing-section landing-outcomes">
          <div className="landing-heading">
            <span className="landing-eyebrow">Ce que ça change pour vous</span>
            <h2>Moins de stress, plus de restaurant.</h2>
            <p>
              Un logiciel ne vaut que par ce qu’il vous rend : du calme pendant
              le coup de feu, du temps après la fermeture, et la fierté d’un
              établissement qui tourne.
            </p>
          </div>
          <div className="landing-outcome-grid">
            {outcomes.map((o) => (
              <article key={o.feeling} className="landing-card">
                <o.icon size={22} aria-hidden />
                <h3>{o.feeling}</h3>
                <p>{o.text}</p>
                <span className="landing-because">
                  <Check size={14} aria-hidden /> {o.because}
                </span>
              </article>
            ))}
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
              <h3>Open source</h3>
              <p>
                Code ouvert sous AGPL-3.0, vérifiable et auto-hébergeable sur
                votre propre serveur.
              </p>
            </article>
          </div>
        </section>

        <Roadmap />

        <section className="landing-section" id="offres">
          <div className="landing-heading">
            <span className="landing-eyebrow">Offres</span>
            <h2>Une adresse ou plusieurs, le même OS.</h2>
            <p>
              Les deux offres donnent accès à tous les modules. Elles ne
              diffèrent que par le nombre de structures gérées.
            </p>
          </div>
          <div className="landing-plans">
            {plans.map((p) => (
              <article
                key={p.name}
                className="landing-plan"
                data-featured={p.featured || undefined}
              >
                <span className="landing-eyebrow">Offre</span>
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
                  Choisir {p.name}
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

        <ClientSpace account={account} />

        <section className="landing-final">
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
          <UtensilsCrossed size={18} aria-hidden /> DATTIER <span>OS</span>
        </span>
        <nav aria-label="Liens utiles">
          {demo && <Link href="/demo">Démonstration</Link>}
          {demo && <Link href="/site-demo">Exemple de site restaurant</Link>}
          <Link href="/platform">Espace client</Link>
          <Link href="/source">Code source, versions et licence</Link>
        </nav>
        <small>
          © Dattier OS · v{CURRENT_VERSION} · Logiciel libre sous licence
          AGPL-3.0
        </small>
      </footer>
    </div>
  );
}
