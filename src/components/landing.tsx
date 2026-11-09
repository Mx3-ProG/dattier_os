import { plans, additionalRestaurantPrice } from "@/features/platform/pricing";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  Wrench,
  MessageCircle,
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
  Sparkles,
  Heart,
  Clock3,
  Users,
  UtensilsCrossed,
} from "lucide-react";

const modules = [
  {
    icon: ReceiptText,
    title: "Un service qui respire",
    text: "Prise de commande en salle, à emporter et depuis le site. Les tickets partent directement en cuisine et au bar.",
  },
  {
    icon: LayoutGrid,
    title: "Gardez le fil en salle",
    text: "Plan de salle à votre image, état des tables en direct et réaménagement en quelques gestes.",
  },
  {
    icon: CalendarDays,
    title: "Accueillez l’esprit libre",
    text: "Vos clients choisissent le jour, l’heure et leur table sur le plan. L’équipe retrouve la demande aussitôt.",
  },
  {
    icon: Boxes,
    title: "Anticipez les manques",
    text: "Inventaires, achats et recettes. Un produit épuisé n’est plus proposé sur le site.",
  },
  {
    icon: Users,
    title: "Une équipe au diapason",
    text: "Salle, cuisine, bar, direction : chacun son poste et ses accès, sur les mêmes données.",
  },
  {
    icon: Globe,
    title: "Donnez envie de venir",
    text: "Partez d’un modèle, ajoutez vos photos et composez un site à votre image. Prévisualisez vos pages avant de les publier.",
  },
  {
    icon: ShoppingBag,
    title: "Faites revenir vos clients",
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
    q: "L’IA peut-elle agir sans mon accord ?",
    a: "Non. STUDIO VOICE prépare les actions et vous demande de les confirmer. Vous pouvez lui écrire ou lui parler, selon la compatibilité de votre navigateur. Les réponses utilisent des crédits, avec des recharges payantes distinctes de votre abonnement.",
  },
  {
    q: "Puis-je avoir un abonnement à 0 € ?",
    a: "Oui, grâce au parrainage : 3 filleuls payants offrent le forfait Exploitation, 5 le forfait Site et fidélité et 10 le forfait Boutique en ligne. Ce sont des avantages conditionnés aux filleuls payants, pas un forfait gratuit sans condition. Les crédits IA et les éventuels établissements supplémentaires restent séparés.",
  },
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
    a: "Oui. STUDIO OS est distribué sous licence AGPL-3.0. Le code de la version en service reste consultable.",
  },
];

function Cta({ demoHref, inverse }: { demoHref?: string; inverse?: boolean }) {
  return (
    <div className="landing-cta">
      <a
        className={`landing-btn ${inverse ? "light" : "primary"}`}
        href="#offres"
      >
        Choisir mon accompagnement <ArrowUpRight size={16} aria-hidden />
      </a>
      <Link className="landing-btn outline" href={demoHref || "/guide"}>
        {demoHref ? "Me projeter dans la démo" : "Découvrir comment ça marche"}
      </Link>
    </div>
  );
}

export function Landing({
  demo,
  demoHref,
}: {
  demo: boolean;
  demoHref?: string;
}) {
  return (
    <div className="landing">
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>
      <header className="landing-header">
        <Link href="/" className="landing-brand">
          <UtensilsCrossed size={20} aria-hidden /> STUDIO OS
        </Link>
        <nav aria-label="Navigation principale">
          <a href="#modules">Votre quotidien</a>
          <a href="#cuisine-ia">STUDIO VOICE</a>

          <a href="#offres">Offres</a>
          <a href="#equipe">Studio ATS</a>
          <Link href="/guide">Guide</Link>
        </nav>
        <Link className="landing-btn primary small" href="/platform">
          Se connecter
        </Link>
      </header>

      <main id="contenu" tabIndex={-1}>
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <span className="landing-eyebrow">
              Moins de gestion. Plus de passion.
            </span>
            <h1>
              Retrouvez le plaisir
              <br /> de tenir <em>votre restaurant.</em>
            </h1>
            <p className="landing-lead">
              Vous avez ouvert pour régaler, accueillir, partager. Pas pour
              passer vos soirées à tout gérer. STUDIO OS rassemble votre
              quotidien et vous aide avec l’IA, pour garder du temps et de
              l’énergie pour ce qui compte.
            </p>
            <Cta demoHref={demoHref} />
            <div className="landing-trust-links">
              <a href="#equipe">Maintenu par Studio ATS</a>
              <Link href="/guide">Un guide ouvert à tous</Link>
              <a href="#preuves">
                Voir par vous-même <ArrowUpRight size={14} aria-hidden />
              </a>
            </div>
            <p className="landing-note">
              Dès 39 € HT / mois · Sur vos appareils · Vous gardez la main
            </p>
          </div>
          <div className="landing-hero-scene">
            <div className="landing-scene-title">
              <Heart size={18} aria-hidden /> Ce soir, soyez là où vous aimez
              être.
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
            <p className="landing-scene-caption">
              Moins d’allers-retours entre vos outils. Plus de présence auprès
              de vos clients.
            </p>
            <span className="landing-note">
              Illustration d’un service avec STUDIO OS
            </span>
          </div>
        </section>

        <section
          className="landing-promise"
          aria-label="Du temps pour l’essentiel"
        >
          <p>
            <Clock3 size={20} aria-hidden /> Du temps pour votre métier.
          </p>
          <p>
            <Users size={20} aria-hidden /> De l’attention pour votre équipe.
          </p>
          <p>
            <Heart size={20} aria-hidden /> De l’énergie pour vous aussi.
          </p>
        </section>

        <section className="landing-section landing-stories" id="quotidien">
          <div className="landing-heading">
            <span className="landing-eyebrow">Ça vous parle ?</span>
            <h2>
              Votre temps mérite mieux que des outils qui vous en prennent.
            </h2>
            <p>
              Quand la gestion déborde sur le reste, ce n’est pas seulement une
              question de logiciel. C’est une soirée écourtée, une idée remise à
              plus tard, un client qu’on n’a pas eu le temps de saluer.
            </p>
          </div>
          <div className="landing-story-grid">
            <article>
              <span className="landing-eyebrow">
                Les informations dispersées
              </span>
              <h3>
                La réservation ici. La commande là. Et vous, entre les deux.
              </h3>
              <p>
                Un agenda, un fichier de stocks, des messages à l’équipe :
                passer de l’un à l’autre finit par prendre toute la place.
              </p>
              <div className="landing-story-answer">
                <Check size={20} aria-hidden />
                <p>
                  <strong>Retrouvez un fil commun.</strong> Salle, commandes,
                  réservations et stocks se retrouvent dans le même espace.
                </p>
              </div>
              <Link href="/guide#service">
                Suivre un service de bout en bout{" "}
                <ArrowUpRight size={16} aria-hidden />
              </Link>
            </article>
            <article>
              <span className="landing-eyebrow">
                Le site qui attend toujours
              </span>
              <h3>Votre carte change. Votre site devrait pouvoir suivre.</h3>
              <p>
                Devoir demander chaque modification, relancer, puis attendre :
                votre actualité ne devrait pas dépendre de ces allers-retours.
              </p>
              <div className="landing-story-answer">
                <Check size={20} aria-hidden />
                <p>
                  <strong>Reprenez la main sur votre vitrine.</strong> Modèles,
                  photos, pages et aperçu avant publication, avec le forfait
                  Site et fidélité.
                </p>
              </div>
              <Link href="/guide">
                Découvrir les parcours du guide{" "}
                <ArrowUpRight size={16} aria-hidden />
              </Link>
            </article>
            <article>
              <span className="landing-eyebrow">
                Les dépenses qui s’accumulent
              </span>
              <h3>
                Un abonnement de plus devrait vous apporter quelque chose.
              </h3>
              <p>
                Site, gestion, fidélité : multiplier les prestations rend le
                budget difficile à lire et les responsabilités difficiles à
                suivre.
              </p>
              <div className="landing-story-answer">
                <Check size={20} aria-hidden />
                <p>
                  <strong>Choisissez un périmètre clair.</strong> La gestion dès
                  39 € HT par mois, le site et la fidélité à 69 €, la boutique à
                  99 €.
                </p>
              </div>
              <a href="#offres">
                Comparer ce qui est inclus{" "}
                <ArrowUpRight size={16} aria-hidden />
              </a>
            </article>
          </div>
          <p className="landing-note">
            Situations illustratives : ces exemples ne sont pas des témoignages
            clients ni des gains mesurés.
          </p>
        </section>

        <section className="landing-section landing-ai" id="cuisine-ia">
          <div className="landing-heading">
            <span className="landing-eyebrow">
              <Sparkles size={16} aria-hidden /> Découvrez STUDIO VOICE
            </span>
            <h2>
              Une chose de moins
              <br />à porter tout seul.
            </h2>
            <p>
              Une commande à saisir, un stock à vérifier, un chiffre à retrouver
              ? Dites simplement ce dont vous avez besoin. Votre assistant vous
              aide à avancer, sans chercher dans tous les menus.
            </p>
            <ul className="landing-ai-benefits">
              <li>
                <Check size={18} aria-hidden /> Vous demandez, à l’écrit ou à la
                voix.
              </li>
              <li>
                <Check size={18} aria-hidden /> STUDIO VOICE prépare les actions.
              </li>
              <li>
                <Check size={18} aria-hidden /> Vous vérifiez et confirmez.
                Toujours.
              </li>
            </ul>
            <a className="landing-btn primary" href="#offres">
              Faire de la place dans mes journées{" "}
              <ArrowUpRight size={16} aria-hidden />
            </a>
            <p className="landing-note">
              Utilisation par crédits, recharges payantes séparées du forfait.
              Voix selon le navigateur.
            </p>
          </div>
          <div className="landing-ai-example">
            <span className="landing-eyebrow">Exemple de conversation</span>
            <p className="landing-ai-question">
              « Commande 5 kg de farine chez mon fournisseur. »
            </p>
            <div className="landing-ai-answer">
              <Sparkles size={22} aria-hidden />
              <h3>La demande devient une action à valider.</h3>
              <p>
                STUDIO VOICE prépare la commande et vous demande les informations
                manquantes. Vous relisez avant de confirmer.
              </p>
              <span className="landing-ai-status">
                <ShieldCheck size={16} aria-hidden /> Votre accord avant toute
                action
              </span>
            </div>
            <p className="landing-note">
              Illustration du parcours : aucune commande n’est envoyée depuis
              cette page.
            </p>
          </div>
        </section>

        <section className="landing-section" id="modules">
          <div className="landing-heading">
            <span className="landing-eyebrow">
              Du premier café au dernier couvert
            </span>
            <h2>Votre journée est déjà bien remplie. Allégeons-la.</h2>
            <p>
              Le bon renseignement, au bon endroit. De la salle à la cuisine, de
              votre site à vos stocks : retrouvez le fil sans tout ressaisir.
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
            <h2>Vous n’avez pas à tout apprendre d’un coup.</h2>
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
            <h2>L’esprit tranquille, même quand vous déléguez.</h2>
            <p>
              Votre restaurant a son propre espace. Commandes, clients, stocks
              et équipe ne sont jamais visibles depuis un autre établissement.
            </p>
          </div>
          <div className="landing-guarantees">
            <article>
              <Lock size={22} aria-hidden />
              <h3>Votre activité reste privée</h3>
              <p>
                Vos informations restent dans votre établissement. Vous
                travaillez avec votre équipe, sans les partager avec les autres
                restaurants.
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
              <h3>Chacun trouve sa place</h3>
              <p>
                Chacun n’accède qu’à ce que son rôle permet. Les actions
                sensibles sont tracées dans un journal d’activité.
              </p>
            </article>
            <article>
              <Code2 size={22} aria-hidden />
              <h3>La liberté de choisir</h3>
              <p>
                Code ouvert sous AGPL-3.0, vérifiable et auto-hébergeable sur
                votre propre infrastructure.
              </p>
            </article>
          </div>
        </section>

        <section className="landing-section" id="preuves">
          <div className="landing-heading">
            <span className="landing-eyebrow">La confiance se vérifie</span>
            <h2>Ne vous contentez pas de nous croire. Explorez.</h2>
            <p>
              Avant de choisir votre outil, regardez comment il fonctionne. Les
              parcours, le rôle de l’IA et le code sont accessibles pour vous
              aider à décider.
            </p>
          </div>
          <div className="landing-proof-grid">
            <Link href={demoHref || "/guide#service"}>
              <LayoutGrid size={24} aria-hidden />
              <h3>
                {demoHref
                  ? "Vivez un service en démo"
                  : "Suivez le cycle d’un service"}
              </h3>
              <p>
                {demoHref
                  ? "Explorez un restaurant fictif et les écrans des différents métiers avant de vous engager."
                  : "De la prise de commande à la table libérée, comprenez chaque étape."}
              </p>
              <span>
                Explorer le fonctionnement{" "}
                <ArrowUpRight size={17} aria-hidden />
              </span>
            </Link>
            <Link href="/guide#cuisine-ia">
              <BookOpen size={24} aria-hidden />
              <h3>Comprenez ce que fait l’IA</h3>
              <p>
                Demandes, confirmations et crédits : le guide explique son
                fonctionnement concret.
              </p>
              <span>
                Lire le guide STUDIO VOICE <ArrowUpRight size={17} aria-hidden />
              </span>
            </Link>
            <Link href="/guide#evolutions">
              <Wrench size={24} aria-hidden />
              <h3>Suivez les évolutions</h3>
              <p>
                Retrouvez les repères sur la version présentée et la maintenance
                assurée par Studio ATS.
              </p>
              <span>
                Évolutions et maintenance <ArrowUpRight size={17} aria-hidden />
              </span>
            </Link>
            <Link href="/source">
              <Code2 size={24} aria-hidden />
              <h3>Un produit ouvert</h3>
              <p>
                Consultez les informations sur le code source et la licence
                AGPL-3.0.
              </p>
              <span>
                Consulter le code et la licence{" "}
                <ArrowUpRight size={17} aria-hidden />
              </span>
            </Link>
          </div>
        </section>

        <section className="landing-section landing-team" id="equipe">
          <div className="landing-heading">
            <span className="landing-eyebrow">Derrière STUDIO OS</span>
            <h2>Une plateforme. Une équipe identifiée.</h2>
            <p>
              Studio ATS assure le développement et la maintenance de STUDIO OS.
              Un même interlocuteur pour faire évoluer l’outil qui accompagne
              votre restaurant.
            </p>
            <a className="landing-btn primary" href="#contact">
              Parlons de votre restaurant <ArrowUpRight size={16} aria-hidden />
            </a>
          </div>
          <div className="landing-team-commitments">
            <article>
              <Wrench size={22} aria-hidden />
              <div>
                <h3>La maintenance a un nom</h3>
                <p>
                  Studio ATS prend en charge l’entretien technique et les
                  corrections de la plateforme.
                </p>
              </div>
            </article>
            <article>
              <BookOpen size={22} aria-hidden />
              <div>
                <h3>Des explications à portée de main</h3>
                <p>
                  Un guide consultable avant et après votre inscription, avec
                  des parcours adaptés aux métiers du restaurant.
                </p>
              </div>
            </article>
            <article>
              <ShieldCheck size={22} aria-hidden />
              <div>
                <h3>Vous gardez la décision</h3>
                <p>
                  Vos accès suivent les rôles de votre équipe. STUDIO VOICE
                  prépare les actions et attend votre confirmation.
                </p>
              </div>
            </article>
          </div>
        </section>

        <section className="landing-section" id="offres">
          <div className="landing-heading">
            <span className="landing-eyebrow">Offres</span>
            <h2>Choisissez ce qui vous simplifie la vie.</h2>
            <p>
              Un établissement inclus. Chaque établissement supplémentaire coûte{" "}
              {additionalRestaurantPrice} € HT par mois et bénéficie du même
              forfait. Le hors ligne, la sécurité, la traçabilité et les
              tutoriels sont inclus.
            </p>
          </div>
          <aside className="landing-referral">
            <div>
              <span className="landing-eyebrow">
                Le bouche-à-oreille vous récompense
              </span>
              <h3>Votre forfait peut passer à 0 €.</h3>
              <p>
                Dès 3 filleuls payants pour Exploitation, 5 pour Site et
                fidélité, 10 pour Boutique en ligne. Crédits IA et
                établissements supplémentaires hors avantage.
              </p>
            </div>
            <Link className="landing-btn outline" href="/platform/parrainage">
              Découvrir le parrainage <ArrowUpRight size={16} aria-hidden />
            </Link>
          </aside>
          <div className="landing-plans">
            {plans.map((p) => (
              <article
                key={p.price}
                className="landing-plan"
                data-featured={p.price === 69 || undefined}
              >
                <span className="landing-eyebrow">
                  {p.price === 39
                    ? "Soufflez pendant le service"
                    : p.price === 69
                      ? "Faites rayonner votre adresse"
                      : "Prolongez l’expérience en ligne"}
                </span>
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

        <section className="landing-section landing-contact" id="contact">
          <div className="landing-heading">
            <span className="landing-eyebrow">Parlons de votre quotidien</span>
            <h2>
              Votre restaurant ne rentre pas dans une case. Vos questions non
              plus.
            </h2>
            <p>
              Votre organisation, vos outils actuels, votre site ou votre
              prochaine ouverture : préparez les points qui comptent pour
              choisir une solution adaptée.
            </p>
          </div>
          <div className="landing-contact-panel">
            <MessageCircle size={28} aria-hidden />
            <h3>Échangez avec Studio ATS.</h3>
            <p>
              Présentez votre restaurant, vos outils actuels et ce que vous
              aimeriez simplifier. Retrouvez l’équipe sur son site officiel pour
              lui poser vos questions.
            </p>
            <a
              className="landing-btn primary"
              href="https://www.studio-ats.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              Contacter Studio ATS <ArrowUpRight size={16} aria-hidden />
              <span className="sr-only"> (nouvel onglet)</span>
            </a>
            <Link className="landing-btn outline" href="/guide#questions">
              Trouver une réponse dans le guide{" "}
              <ArrowUpRight size={16} aria-hidden />
            </Link>
            <a className="landing-btn outline" href="#offres">
              Revoir les forfaits
            </a>
          </div>
        </section>

        <section className="landing-final">
          <h2>Votre restaurant mérite votre énergie. Vous aussi.</h2>
          <p>
            {demo
              ? "Prenez le temps de vous projeter dans la démo. Imaginez votre prochain service avec moins de choses à gérer."
              : "Commencez par ce qui vous pèse le plus. Le service, le site, les commandes : avancez à votre rythme."}
          </p>
          <Cta demoHref={demoHref} inverse />
        </section>
      </main>

      <footer className="landing-footer">
        <span className="landing-brand">
          <UtensilsCrossed size={18} aria-hidden /> STUDIO OS
        </span>
        <nav aria-label="Liens utiles">
          {demoHref && <Link href={demoHref}>Démonstration</Link>}
          {demo && <Link href="/site-demo">Exemple de site restaurant</Link>}
          <Link href="/guide">Comment ça marche</Link>
          <Link href="/guide#evolutions">Évolutions et maintenance</Link>
          <a
            href="https://www.studio-ats.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Studio ATS · site officiel
            <span className="sr-only"> (nouvel onglet)</span>
          </a>
          <a href="#contact">Contact et questions</a>
          <Link href="/platform">Espace client</Link>
          <Link href="/source">Code source et licence</Link>
        </nav>
        <small>© STUDIO OS · Logiciel libre sous licence AGPL-3.0</small>
      </footer>
    </div>
  );
}
