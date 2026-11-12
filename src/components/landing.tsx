import { plans, additionalRestaurantPrice } from "@/features/platform/pricing";
import { activePromotion, trialDays, type Promotion } from "@/features/platform/promotion";
import { BlackFridayBar } from "@/components/black-friday-bar";
import { addonCatalog, addonMonthlyCents } from "@/features/addons/catalog";
import Link from "next/link";
import { LegalLinks } from "@/components/legal/legal-page";
import { PlatformCookieConsent } from "@/components/legal/platform-cookie-consent";
import {
  ArrowUpRight,
  BookOpen,
  Wrench,
  MessageCircle,
  Boxes,
  Clock,
  Eye,
  HeartHandshake,
  LayoutDashboard,
  PenLine,
  Smile,
  UserCog,
  Building2,
  CalendarDays,
  Check,
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
  Store,
} from "lucide-react";

const modules = [
  {
    icon: ReceiptText,
    title: "Des ventes qui avancent",
    text: "Retrouvez vos commandes au même endroit, en boutique, sur place ou depuis votre site, selon votre activité.",
  },
  {
    icon: LayoutGrid,
    title: "Gardez le fil de votre commerce",
    text: "Suivez vos espaces, vos commandes et votre activité en direct. Pour la restauration, aménagez aussi votre salle et vos tables en quelques gestes.",
  },
  {
    icon: CalendarDays,
    title: "Accueillez l’esprit libre",
    text: "Les demandes et réservations arrivent dans votre espace. Votre équipe sait ce qui l’attend.",
  },
  {
    icon: Boxes,
    title: "Anticipez les manques",
    text: "Gardez un œil sur vos stocks et vos achats. Votre catalogue suit le rythme de votre activité.",
  },
  {
    icon: Users,
    title: "Une équipe au diapason",
    text: "Vente, opérations, direction : chacun retrouve ses tâches et ses accès, sur les mêmes données.",
  },
  {
    icon: Globe,
    title: "Donnez envie de venir",
    text: "Partez d’un modèle, ajoutez vos photos et composez un site à votre image. Prévisualisez vos pages avant de les publier.",
  },
  {
    icon: ShoppingBag,
    title: "Faites revenir vos clients",
    text: "Un site, une boutique en ligne et des fiches clients reliés à votre activité. La fidélité est disponible en option.",
  },
  {
    icon: Sparkles,
    title: "Personnalisez votre expérience",
    text: "Adaptez STUDIO à vos besoins spécifiques avec des add-ons et des options de personnalisation. Rien n'est laissé au hasard.",
  }
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

const steps = [
  {
    title: "Créez votre compte",
    text: "Un compte propriétaire, une organisation : votre espace est prêt.",
  },
  {
    title: "Ajoutez votre structure",
    text: "Nom, catalogue, espace de travail. La création est guidée pas à pas avec un tutoriel ultra complet et simple d'utilisation.",
  },
  {
    title: "Lancez votre activité",
    text: "Invitez l'équipe, composez votre site et commencez à suivre vos commandes.",
  },
];

const faq = (days: number) => [
  {
    q: "L’IA peut-elle agir sans mon accord ?",
    a: "Non. STUDIO VOICE prépare les actions et vous demande de les confirmer. Vous pouvez lui écrire ou lui parler, selon la compatibilité de votre navigateur. Les réponses utilisent des crédits, avec des recharges payantes distinctes de votre abonnement.",
  },
  {
    q: "Puis-je essayer gratuitement et arrêter quand je veux ?",
    a: `Oui. À la création de votre espace, vous disposez de ${days} jours d’essai gratuits, sans paiement initial. À la fin, l’accès payant ne démarre qu’après activation de votre abonnement. Vous pouvez arrêter votre essai ou résilier votre abonnement à tout moment depuis votre espace, sans engagement. Les options et crédits IA sont facturés séparément.`,
  },
  {
    q: "Puis-je essayer avant de créer mon compte ?",
    a: "Oui. La démonstration montre un restaurant fictif pour explorer concrètement les écrans et le travail d’une équipe.",
  },
  {
    q: "Mes données sont-elles visibles par d’autres commerces ?",
    a: "Non. Chaque structure ne voit que ses propres données. Le cloisonnement est appliqué directement par la base de données, pas seulement par l’interface.",
  },
  {
    q: "J’ouvre une deuxième adresse, que se passe-t-il ?",
    a: "L’abonnement inclut un établissement. Ajoutez des établissements à 39 € TTC par mois chacun. Ils bénéficient tous de l’abonnement de votre organisation et conservent leurs propres données.",
  },
  {
    q: "Le code est-il ouvert ?",
    a: "Oui. STUDIO OS est distribué sous licence AGPL-3.0. Le code de la version en service reste consultable à tout moment en ligne.",
  },
  {
    q: "Comment puis-je migrer mes données ?",
    a: "Nous vous accompagnons dans la migration de vos données. Contactez notre support pour plus d'informations.",
  },
  {
    q: "Puis-je essayer avant de créer mon compte ?",
    a: "Oui. La démonstration montre un restaurant fictif pour explorer concrètement les écrans et le travail d’une équipe.",
  },
  {
    q: "Mes données sont-elles visibles par d’autres commerces ?",
    a: "Non. Chaque structure ne voit que ses propres données. Le cloisonnement est appliqué directement par la base de données, pas seulement par l’interface.",
  },
  {
    q: "39 euros par mois seulement, vous êtes sûr ?",
    a: "L’abonnement inclut un établissement. Un dashboard administrateur professionnel pour la gestion de votre activité. Une boutique en ligne intégrée pour accueillir vos clients et encaisser vos commandes. L'abonnement inclut également un système d'intelligence artificielle pour optimiser votre activité sans effort."
  },
  {
    q: "À quoi servent les add-ons ?",
    a: "Les add-ons permettent d’ajouter des fonctionnalités supplémentaires à votre abonnement de base. Vous pouvez les activer selon vos besoins, sans engagement, et évoluer à votre rythme. Tous les add-ons sont facturés séparément et peuvent être activés ou désactivés depuis votre espace client. Ils sont conçus pour répondre à des besoins spécifiques de votre commerce, comme la fidélisation des clients, l’optimisation des stocks ou l’intégration avec d’autres services. Vous pouvez consulter la liste complète des add-ons disponibles et leurs tarifs sur notre site. Chaque add-on est conçu pour améliorer votre expérience et vous offrir plus de contrôle sur votre activité, tout en restant flexible et adapté à vos besoins et surtout ils permettent de ne pas alourdir votre abonnement de base avec des fonctionnalités que vous n’utilisez pas. Vous pouvez donc choisir les add-ons qui correspondent le mieux à votre commerce et les activer ou désactiver uniquement lorsque vous en avez besoin. Certains de nos add-ons sont inclus dans l’abonnement de base, tandis que d’autres sont disponibles en option, certains add-ons sont purement stylistiques et vous permettent de personnaliser votre expérience utilisateur et celle de vos clients.",
  },
  {
    q: "Comment puis-je gérer mes add-ons ?",
    a: "Vous pouvez gérer vos add-ons directement depuis votre espace client. Vous pouvez activer ou désactiver les add-ons selon vos besoins, et vous pouvez également consulter les détails de chaque add-on, y compris les fonctionnalités qu’il offre et son coût mensuel. Pour activer un add-on, il vous suffit de cliquer sur le bouton d’activation correspondant dans votre espace client. Vous serez alors facturé pour l’add-on à partir du mois suivant. Pour désactiver un add-on, cliquez sur le bouton de désactivation correspondant. Vous ne serez plus facturé pour cet add-on à partir du mois suivant. Vous pouvez également consulter l’historique de vos add-ons et voir quels add-ons sont actuellement actifs ou inactifs. Si vous avez des questions sur la gestion de vos add-ons, n’hésitez pas à contacter notre support client pour obtenir de l’aide.",
  },
  {
    q: "Quel prix dois-je payer pour les add-ons ?",
    a: "Les prix des add-ons varient selon les fonctionnalités incluses, vous pourrez trouver des add-ons qui coûtent entre 3 et 99 euros en une fois ou payer mensuellement. Vous pouvez consulter la liste complète des add-ons disponibles et leurs tarifs sur notre site. Chaque add-on est conçu pour améliorer votre expérience et vous offrir plus de contrôle sur votre activité, tout en restant flexible et adapté à vos besoins."
  }
];

function Cta({ demoHref, inverse, days, promo }: { demoHref?: string; inverse?: boolean; days: number; promo: Promotion | null }) {
  return (
    <div className="landing-cta">
      <Link
        className={`landing-btn ${inverse ? "light" : "primary"}`}
        href="/checkout/39"
      >
        {promo ? `Je m’abonne à ${promo.price} € / mois` : `Essayer gratuitement ${days} jours`} <ArrowUpRight size={16} aria-hidden />
      </Link>
      <Link className="landing-btn outline" href={demoHref || "/guide"}>
        {demoHref ? "Me projeter dans la démo" : "Découvrir comment ça marche"}
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
  demoHref,
  account = null,
}: {
  demo: boolean;
  demoHref?: string;
  account?: Account | null;
}) {
  const promo = activePromotion();
  const days = trialDays();
  return (
    <div className="landing">
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>
      {promo && <BlackFridayBar promo={promo} />}
      <header className="landing-header">
        <Link href="/" className="landing-brand">
          <Store size={20} aria-hidden /> STUDIO OS
        </Link>
        <nav aria-label="Navigation principale">
          <a href="#modules">Votre quotidien</a>
          <a href="#cuisine-ia">STUDIO VOICE</a>

          <a href="#offres">Offres</a>
          <a href="#equipe">Studio ATS</a>
          <Link href="/guide">Guide</Link>
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
              Moins de gestion. Plus de passion.
            </span>
            <h1>
              Votre commerce avance.
              <br /> Vous gardez <em>la main.</em>
            </h1>
            <p className="landing-lead">
              Vous avez lancé votre affaire pour la faire vivre, pas pour passer
              vos soirées à jongler entre les outils. STUDIO OS réunit vos
              clients, vos ventes, votre équipe, vos stocks et votre site dans
              un même espace. Moins d’administratif, plus de temps pour vos idées
              et les personnes qui comptent.
            </p>
            <p className="landing-note">
              Relation client (CRM), gestion de votre activité (ERP) et création
              de site (CMS) : les outils de votre commerce réunis au même endroit.
            </p>
            <Cta demoHref={demoHref} days={days} promo={promo} />
            <div className="landing-trust-links">
              <a href="#equipe">Maintenu par Studio ATS</a>
              <Link href="/guide">Un guide ouvert à tous</Link>
              <a href="#preuves">
                Voir par vous-même <ArrowUpRight size={14} aria-hidden />
              </a>
            </div>
            <p className="landing-note">
              {promo
                ? `Black Friday : ${promo.price} € TTC / mois pendant ${promo.months} mois avec le code ${promo.code}, puis 39 € · Sans engagement, résiliable à tout moment`
                : `${days} jours gratuits · Puis 39 € TTC / mois après activation · Sans engagement`}
            </p>
          </div>
          <div className="landing-hero-scene">
            <div className="landing-scene-title">
              <Heart size={18} aria-hidden /> Votre énergie a mieux à faire.
            </div>
            <div className="landing-board" aria-hidden>
              <div className="landing-board-bar">
                <span />
                <span />
                <span />
                <strong>Votre commerce aujourd’hui</strong>
              </div>
              <div className="landing-board-cols">
                {[
                  {
                    icon: LayoutGrid,
                    label: "Ventes",
                    items: ["Commande · reçue", "Client · à rappeler"],
                  },
                  {
                    icon: ShoppingBag,
                    label: "Boutique",
                    items: ["Produit · en ligne", "Retrait · à préparer"],
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
                <CalendarDays size={15} /> Votre activité, au même endroit
              </div>
            </div>
            <p className="landing-scene-caption">
              Moins d’allers-retours entre vos outils. Plus de présence auprès
              de vos clients.
            </p>
            <span className="landing-note">
              Illustration d’une journée avec STUDIO OS
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
                Un client ici. Une commande là. Et vous, entre les deux.
              </h3>
              <p>
                Un fichier clients, un suivi des stocks, des messages à l’équipe :
                passer de l’un à l’autre finit par prendre toute la place.
              </p>
              <div className="landing-story-answer">
                <Check size={20} aria-hidden />
                <p>
                  <strong>Retrouvez un fil commun.</strong> Clients, commandes,
                  réservations et stocks se retrouvent dans le même espace.
                </p>
              </div>
              <Link href="/guide#service">
                Voir un parcours de vente{" "}
                <ArrowUpRight size={16} aria-hidden />
              </Link>
            </article>
            <article>
              <span className="landing-eyebrow">
                Le site qui attend toujours
              </span>
              <h3>Votre activité change. Votre site devrait pouvoir suivre.</h3>
              <p>
                Devoir demander chaque modification, relancer, puis attendre :
                votre actualité ne devrait pas dépendre de ces allers-retours.
              </p>
              <div className="landing-story-answer">
                <Check size={20} aria-hidden />
                <p>
                  <strong>Reprenez la main sur votre vitrine.</strong> Modèles,
                  photos, pages et aperçu avant publication dans votre abonnement.
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
                Site, gestion, clients : multiplier les prestations rend le
                budget difficile à lire et les responsabilités difficiles à
                suivre.
              </p>
              <div className="landing-story-answer">
                <Check size={20} aria-hidden />
                <p>
                  <strong>Choisissez un périmètre clair.</strong> Un abonnement à
                  39 € TTC par mois réunit la gestion, le site et la boutique.
                  Ajoutez seulement les options dont vous avez besoin.
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
              Un client à retrouver, un stock à vérifier, un chiffre à consulter
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
            <span className="landing-eyebrow">
              De l’ouverture à la fermeture
            </span>
            <h2>Votre journée est déjà bien remplie. Allégeons-la.</h2>
            <p>
              Le bon renseignement, au bon endroit. De vos clients à vos ventes,
              de votre site à vos stocks : retrouvez le fil sans tout ressaisir.
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
              Simple dès le premier jour
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
              catalogue et le site suivent les stocks.
            </li>
            <li>
              <Check size={18} aria-hidden /> Chacun voit son poste : pas
              d’écran surchargé pour votre équipe.
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
              Votre commerce a son propre espace. Commandes, clients, stocks
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
                commerces.
              </p>
            </article>
            <article>
              <Building2 size={22} aria-hidden />
              <h3>Une structure, un espace</h3>
              <p>
                Même avec plusieurs adresses, chaque structure garde son équipe,
                son catalogue, son site et ses clients.
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
                  ? "Explorez l’activité en démo"
                  : "Suivez le cycle d’une commande"}
              </h3>
              <p>
                {demoHref
                  ? "Explorez un établissement fictif et ses écrans avant de vous engager."
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
              votre commerce.
            </p>
            <a className="landing-btn primary" href="#contact">
              Parlons de votre commerce <ArrowUpRight size={16} aria-hidden />
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
                  des parcours pour découvrir les fonctions de votre espace.
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
            <h2>Un abonnement. Des add-ons à la carte.</h2>
            <p>
              {days} jours d’essai gratuits, sans paiement initial. Puis un établissement
              inclus à 39 € TTC par mois après activation. Chaque établissement supplémentaire coûte{" "}
              {additionalRestaurantPrice} € TTC par mois et bénéficie du même
              abonnement. Le hors ligne, la sécurité, la traçabilité et les
              tutoriels sont inclus. Résiliation à tout moment, sans engagement.
            </p>
          </div>
          <aside className="landing-referral">
            <div>
              <span className="landing-eyebrow">
                Le bouche-à-oreille vous récompense
              </span>
              <h3>Votre abonnement peut passer à 0 €.</h3>
              <p>
                Dès 3 filleuls payants, votre abonnement Studio est offert.
                Crédits IA et établissements supplémentaires hors avantage.
              </p>
            </div>
            <Link className="landing-btn outline" href="/platform/parrainage">
              Découvrir le parrainage <ArrowUpRight size={16} aria-hidden />
            </Link>
          </aside>
          <div className="landing-plans">
            {plans.map((p) => (
              <article key={p.price} className="landing-plan" data-featured>
                <span className="landing-eyebrow">Votre activité, à votre façon</span>
                <h3>{p.title}</h3>
                {promo ? (
                  <strong className="landing-plan-quota">
                    <s>{p.price} €</s> {promo.price} € TTC / mois pendant {promo.months} mois
                    <span className="landing-plan-promo">
                      Code {promo.code} · puis {p.price} € TTC / mois · jusqu’au {promo.lastDay} minuit
                    </span>
                  </strong>
                ) : (
                  <strong className="landing-plan-quota">
                    {p.price} € TTC / mois
                  </strong>
                )}
                <ul>
                  {p.features.map((feature) => (
                    <li key={feature}>
                      <Check size={16} aria-hidden /> {feature}
                    </li>
                  ))}
                </ul>
                <Link className="landing-btn light" href={`/checkout/${p.price}`}>
                  {promo ? `Je m’abonne à ${promo.price} € / mois` : `Essayer ${p.title} gratuitement`}
                </Link>
              </article>
            ))}
            <article className="landing-plan">
              <span className="landing-eyebrow">Selon vos besoins</span>
              <h3>Add-ons</h3>
            
              <ul>
                {addonCatalog
                  .filter((addon) => addon.includedFrom === null)
                  .map((addon) => (
                    <li key={addon.id}>
                      <Check size={16} aria-hidden /> {addon.name}
                    </li>
                  ))}
              </ul>
              <p>Activez-les depuis votre espace, sans engagement, évoluez à votre rythme.</p>
            </article>
          </div>
        </section>

        <section className="landing-section" id="questions">
          <div className="landing-heading">
            <span className="landing-eyebrow">Questions</span>
            <h2>Avant de vous lancer.</h2>
          </div>
          <div className="landing-faq">
            {faq(days).map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <ClientSpace account={account} />
        <section className="landing-section landing-contact" id="contact">
          <div className="landing-heading">
            <span className="landing-eyebrow">Parlons de votre quotidien</span>
            <h2>
              Votre commerce ne rentre pas dans une case. Vos questions non
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
              Présentez votre commerce, vos outils actuels et ce que vous
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
              Revoir l’offre
            </a>
          </div>
        </section>

        <section className="landing-final">
          <h2>Votre affaire mérite votre énergie. Vous aussi.</h2>
          <p>
            {demo
              ? "Prenez le temps de vous projeter dans la démo. Imaginez votre prochaine journée avec moins de choses à gérer."
              : "Commencez par ce qui vous pèse le plus. Les clients, le site, les commandes : avancez à votre rythme."}
          </p>
          <Cta demoHref={demoHref} inverse days={days} promo={promo} />
        </section>
      </main>

      <footer className="landing-footer">
        <span className="landing-brand">
          <Store size={18} aria-hidden /> STUDIO OS
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
          <LegalLinks />
        </nav>
        <small>© Wayne-web SAS · STUDIO OS, logiciel libre sous licence AGPL-3.0</small>
      </footer>
      <PlatformCookieConsent />
    </div>
  );
}
