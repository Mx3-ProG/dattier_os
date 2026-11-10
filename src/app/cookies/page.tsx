import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection } from "@/components/legal/legal-page";
import { CookieSettingsButton } from "@/components/legal/platform-cookie-consent";
import { legalEntity } from "@/features/legal/entity";
import { platformConsentKey } from "@/features/legal/consent";
import "../landing.css";
import "../guide/guide.css";
import "../legal.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Politique cookies · STUDIO OS",
  description:
    "Les cookies et traceurs utilisés par STUDIO OS : fonctionnement, connexion, mesure des visites et des ventes, provenance des visiteurs. Modifiez vos choix à tout moment.",
};

const e = legalEntity;

type Tracker = [name: string, purpose: string, duration: string, kind: string];
const essential: Tracker[] = [
  ["atacuisine_session", "Maintient votre connexion sécurisée à l’espace client", "Durée de la session", "Cookie HttpOnly"],
  ["atacuisine_identity", "Rattache la session à votre compte et à vos établissements", "Durée de la session", "Cookie HttpOnly"],
  ["atacuisine_oidc", "Protège l’étape de connexion contre la falsification", "Quelques minutes", "Cookie HttpOnly"],
  ["atacuisine_parrain", "Mémorise le code du parrain lorsque vous suivez volontairement un lien de parrainage", "30 jours", "Cookie"],
  ["atacuisine_public_mode", "Retient le thème clair ou sombre choisi", "12 mois", "Cookie"],
  [platformConsentKey, "Enregistre vos choix relatifs aux cookies", "6 mois", "Stockage local"],
];
const optional: Tracker[] = [
  ["Mesure d’audience et des ventes", "Pages vues, parcours, appareil, zone géographique approximative, essais et abonnements issus de la visite", "13 mois maximum, données agrégées conservées 25 mois", "Cookie ou stockage local"],
  ["Provenance et campagnes", "Source de la visite : moteur de recherche, réseau social, partenaire, campagne (paramètres UTM)", "13 mois maximum", "Cookie ou stockage local"],
];

function Trackers({ rows }: { rows: Tracker[] }) {
  return (
    <div className="legal-table-wrap">
      <table className="legal-table">
        <thead>
          <tr>
            <th scope="col">Nom ou catégorie</th>
            <th scope="col">Finalité</th>
            <th scope="col">Durée</th>
            <th scope="col">Type</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, purpose, duration, kind]) => (
            <tr key={name}>
              <td>
                <code>{name}</code>
              </td>
              <td>{purpose}</td>
              <td>{duration}</td>
              <td>{kind}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const sections: LegalSection[] = [
  {
    id: "definition",
    title: "Qu’est-ce qu’un cookie",
    body: (
      <p>
        Un cookie est un petit fichier déposé sur votre appareil lors de la visite d’un site. Cette politique couvre
        aussi les technologies équivalentes (stockage local du navigateur, identifiants, paramètres de liens), que
        nous appelons ensemble « traceurs ». Elle s’applique au site {e.product} : page d’accueil, guide, pages
        d’information et espace client.
      </p>
    ),
  },
  {
    id: "usages",
    title: "À quoi servent nos traceurs",
    body: (
      <>
        <p>
          {e.product} est une plateforme de commerce complète : site internet, boutique en ligne, paiement, comptes
          clients, fidélité et pilotage. Comme pour toute solution de ce type, les traceurs servent à trois choses :
        </p>
        <div className="legal-grid three">
          <article>
            <h3>Faire fonctionner</h3>
            <p>Connexion sécurisée, protection des formulaires, parrainage, préférences d’affichage.</p>
          </article>
          <article>
            <h3>Mesurer les visites</h3>
            <p>Combien de visiteurs, quelles pages, quels appareils, depuis quelle région.</p>
          </article>
          <article>
            <h3>Suivre les ventes</h3>
            <p>Quelles visites aboutissent à un essai ou un abonnement, et quelles sources les ont amenées.</p>
          </article>
        </div>
        <p>
          Seuls les traceurs essentiels sont déposés sans votre accord. Les autres ne s’activent que si vous les
          acceptez. Nous n’utilisons aucun cookie publicitaire tiers et ne revendons aucune donnée.
        </p>
      </>
    ),
  },
  {
    id: "essentiels",
    title: "Traceurs essentiels",
    body: (
      <>
        <p>
          Strictement nécessaires au service que vous demandez, ils sont exemptés de consentement (article 82 de la
          loi Informatique et Libertés). Les bloquer empêcherait notamment la connexion à l’espace client.
        </p>
        <Trackers rows={essential} />
      </>
    ),
  },
  {
    id: "optionnels",
    title: "Traceurs soumis à votre accord",
    body: (
      <>
        <p>
          Déposés uniquement si vous les acceptez, par catégorie. Ils sont opérés par {e.product} pour son propre
          compte ; les statistiques produites sont agrégées et ne servent qu’à améliorer le site, nos contenus et
          notre offre.
        </p>
        <Trackers rows={optional} />
      </>
    ),
  },
  {
    id: "sites-commercants",
    title: "Sur les sites créés avec STUDIO OS",
    body: (
      <>
        <p>
          Chaque commerçant publie son propre site et sa boutique avec {e.product}. Ces sites disposent de leur
          propre bandeau cookies et de leur propre politique, sous la responsabilité du commerçant. La Plateforme y
          met à disposition :
        </p>
        <ul className="legal-list">
          <li>le panier et le compte client, qui utilisent uniquement le stockage strictement nécessaire ;</li>
          <li>une mesure d’audience sans cookie, sans profil individuel et sans conservation de l’adresse IP ;</li>
          <li>le suivi des commandes, du chiffre d’affaires et de la fidélité, à partir des ventes réelles ;</li>
          <li>le blocage des contenus externes (cartes, vidéos) tant que le visiteur ne les a pas acceptés.</li>
        </ul>
      </>
    ),
  },
  {
    id: "choix",
    title: "Gérer vos choix",
    body: (
      <>
        <p>
          Vous pouvez accepter, refuser ou personnaliser les traceurs à tout moment. Refuser est aussi simple
          qu’accepter et n’a aucune conséquence sur votre accès au site. Votre choix est conservé 6 mois, puis vous
          est redemandé. Un signal « Global Privacy Control » envoyé par votre navigateur vaut refus.
        </p>
        <p>
          <CookieSettingsButton className="landing-btn primary small">Modifier mes choix maintenant</CookieSettingsButton>
        </p>
        <p>
          Vous pouvez aussi supprimer ou bloquer les cookies depuis les réglages de votre navigateur (Chrome,
          Firefox, Safari, Edge). Pour en savoir plus sur vos droits, consultez notre{" "}
          <Link href="/confidentialite">Politique de confidentialité</Link> ou le site de la{" "}
          <a href="https://www.cnil.fr/fr/cookies-et-autres-traceurs" target="_blank" rel="noopener noreferrer">
            CNIL
          </a>
          .
        </p>
      </>
    ),
  },
];

export default function Page() {
  return (
    <LegalPage
      current="/cookies"
      eyebrow="Politique cookies"
      title={
        <>
          Des cookies utiles, <em>à votre main.</em>
        </>
      }
      lead="Les traceurs qui font fonctionner STUDIO OS, ceux qui mesurent les visites et les ventes, et la façon de changer d’avis en un clic."
      sections={sections}
    />
  );
}
