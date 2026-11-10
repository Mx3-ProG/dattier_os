import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection } from "@/components/legal/legal-page";
import { legalEntity } from "@/features/legal/entity";
import "../landing.css";
import "../guide/guide.css";
import "../legal.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Politique de confidentialité · STUDIO OS",
  description:
    "Quelles données STUDIO OS collecte, pourquoi, combien de temps, avec qui elles sont partagées et comment exercer vos droits.",
};

const e = legalEntity;
const contact = e.email ? (
  <a href={`mailto:${e.email}`}>{e.email}</a>
) : (
  <a href={e.website} target="_blank" rel="noopener noreferrer">
    le formulaire de contact du site officiel
  </a>
);

const purposes: [string, string, string][] = [
  ["Créer et gérer votre compte, vos accès et votre équipe", "Comptes, rôles, identifiants, journaux de connexion", "Exécution du contrat"],
  ["Fournir les fonctions : site, boutique, ventes, stocks, clients…", "Données saisies dans votre espace", "Exécution du contrat"],
  ["Facturer l’abonnement, les add-ons et les crédits", "Raison sociale, adresse, historique de facturation", "Exécution du contrat, obligation légale"],
  ["Assurer la sécurité, prévenir la fraude, tracer les actions sensibles", "Adresse IP, journaux techniques, traces d’audit", "Intérêt légitime, obligation légale"],
  ["Mesurer les visites et les inscriptions issues du site", "Pages vues, provenance, appareil, zone approximative", "Consentement"],
  ["Mesurer l’efficacité de nos campagnes et partenariats", "Paramètres de campagne, lien de provenance", "Consentement"],
  ["Gérer le programme de parrainage", "Code parrain, statut des filleuls", "Exécution du contrat"],
  ["Vous informer des évolutions et offres de STUDIO OS", "E-mail professionnel", "Intérêt légitime (clients), avec opposition à tout moment"],
  ["Répondre à vos demandes et vous accompagner", "Échanges, demandes d’assistance", "Intérêt légitime"],
];

const processors: [string, string, string][] = [
  [e.host.name ?? "Hébergeur", "Hébergement du site, de la plateforme et des données", `${e.host.location} (société établie aux États-Unis)`],
  ["Stripe", "Paiements, abonnements, encaissement en ligne des commerçants", "UE / États-Unis"],
  ["Resend", "Envoi des e-mails transactionnels (connexion, factures, notifications)", "États-Unis"],
  ["Twilio", "Envoi de SMS (confirmations, notifications)", "États-Unis"],
  ["Anthropic", "Modèles d’intelligence artificielle de l’assistant STUDIO VOICE", "États-Unis"],
];

const retention: [string, string][] = [
  ["Données du compte et de l’espace", "Durée de l’abonnement, puis suppression ou anonymisation dans un délai de 3 mois, sauf demande d’export"],
  ["Comptes d’essai non activés", "6 mois après la fin de l’essai"],
  ["Factures et pièces comptables", "10 ans (article L. 123-22 du Code de commerce)"],
  ["Prospects et contacts commerciaux", "3 ans à compter du dernier contact"],
  ["Journaux de connexion et de sécurité", "1 an"],
  ["Statistiques de visites", "25 mois maximum, sous forme agrégée"],
  ["Choix relatif aux cookies", "6 mois, puis le choix vous est redemandé"],
];

const sections: LegalSection[] = [
  {
    id: "responsable",
    title: "Qui est responsable de vos données",
    body: (
      <p>
        Le responsable de traitement est la société {e.name} (nom commercial {e.tradeName}), {e.form} au capital de {e.capital}, {e.rcs}, dont le
        siège est situé {e.address}, éditrice de {e.product}. Pour toute question relative à vos données, vous pouvez
        nous écrire par {contact} ou par courrier à l’adresse du siège.
      </p>
    ),
  },
  {
    id: "roles",
    title: "Nos deux rôles",
    body: (
      <>
        <p>{e.product} intervient de deux manières différentes, ce qui détermine qui répond de vos données :</p>
        <div className="legal-grid">
          <article>
            <h3>Responsable de traitement</h3>
            <p>
              Pour les visiteurs de ce site, les prospects, les commerçants clients et les membres de leurs équipes :
              nous décidons de l’usage de ces données, décrit dans cette politique.
            </p>
          </article>
          <article>
            <h3>Sous-traitant</h3>
            <p>
              Pour les clients des commerçants (acheteurs de la boutique, comptes clients, réservations, fidélité,
              statistiques du site) : chaque commerçant est responsable de traitement, nous traitons ces données
              pour son compte et selon ses instructions (article 28 du RGPD, voir les{" "}
              <Link href="/cgu#donnees">conditions générales</Link>).
            </p>
          </article>
        </div>
      </>
    ),
  },
  {
    id: "donnees",
    title: "Les données que nous collectons",
    body: (
      <ul className="legal-list">
        <li>
          <strong>Identification et contact</strong> : nom, prénom, e-mail et téléphone professionnels, raison
          sociale, SIRET, adresse de l’établissement.
        </li>
        <li>
          <strong>Facturation</strong> : historique des abonnements, add-ons et crédits. Les numéros de carte
          bancaire sont saisis directement auprès de notre prestataire de paiement : nous n’y avons jamais accès.
        </li>
        <li>
          <strong>Utilisation</strong> : données saisies dans votre espace (produits, ventes, stocks, équipe,
          contenus du site), réglages, actions réalisées et traces d’audit.
        </li>
        <li>
          <strong>Techniques</strong> : adresse IP, type d’appareil et de navigateur, journaux de connexion.
        </li>
        <li>
          <strong>Navigation</strong>, avec votre accord : pages consultées, provenance de la visite, zone
          géographique approximative, inscriptions et abonnements issus de la visite.
        </li>
        <li>
          <strong>Assistant</strong> : questions posées à STUDIO VOICE et transcriptions vocales, utilisées pour
          produire la réponse.
        </li>
      </ul>
    ),
  },
  {
    id: "finalites",
    title: "Pourquoi et sur quelle base",
    body: (
      <div className="legal-table-wrap">
        <table className="legal-table">
          <thead>
            <tr>
              <th scope="col">Finalité</th>
              <th scope="col">Données</th>
              <th scope="col">Base légale</th>
            </tr>
          </thead>
          <tbody>
            {purposes.map(([purpose, data, basis]) => (
              <tr key={purpose}>
                <td>{purpose}</td>
                <td>{data}</td>
                <td>{basis}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
  },
  {
    id: "mesure",
    title: "Mesure des visites et des ventes",
    body: (
      <>
        <p>
          Comme toute plateforme de commerce en ligne complète, {e.product} repose sur la mesure : savoir combien de
          personnes visitent un site, d’où elles viennent, quelles pages les intéressent et combien deviennent
          clientes. Cette mesure s’exerce à deux niveaux.
        </p>
        <h3 className="legal-sub">Sur le site {e.product}</h3>
        <p>
          Avec votre accord, nous suivons les visites de nos pages, leur provenance (moteur de recherche, réseau
          social, partenaire, campagne, lien de parrainage) et les essais et abonnements qui en découlent. Ces
          statistiques sont agrégées, réservées à {e.product}, ne sont jamais revendues et ne servent pas à de la
          publicité ciblée par des tiers.
        </p>
        <h3 className="legal-sub">Sur les sites et boutiques des commerçants</h3>
        <p>
          La Plateforme fournit aux commerçants les outils d’un site marchand complet : panier, commandes,
          paiement, comptes clients, fidélité, suivi du chiffre d’affaires, des produits les plus vendus, de la
          fréquence d’achat et de la valeur client, ainsi qu’une mesure d’audience (pages vues, zone géographique
          approximative). Cette mesure d’audience fonctionne sans cookie et sans profil individuel ; l’adresse IP
          n’est pas conservée. Chaque commerçant choisit de la soumettre au consentement de ses visiteurs ou de
          l’activer dans le cadre de l’exemption prévue par la CNIL, et reste responsable de ce choix.
        </p>
      </>
    ),
  },
  {
    id: "destinataires",
    title: "Destinataires et sous-traitants",
    body: (
      <>
        <p>
          Vos données sont accessibles aux seules personnes habilitées de l’équipe {e.tradeName}, dans la
          limite de leurs missions. Un accès du support à un espace client n’est possible qu’avec une autorisation
          temporaire, révocable et tracée. Nous faisons appel aux prestataires suivants :
        </p>
        <div className="legal-table-wrap">
          <table className="legal-table">
            <thead>
              <tr>
                <th scope="col">Prestataire</th>
                <th scope="col">Rôle</th>
                <th scope="col">Localisation</th>
              </tr>
            </thead>
            <tbody>
              {processors.map(([name, role, place]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{role}</td>
                  <td>{place}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Lorsque des données sont transférées hors de l’Union européenne, ce transfert est encadré par le cadre de
          protection des données UE–États-Unis (Data Privacy Framework) et/ou par les clauses contractuelles types
          de la Commission européenne. Nous ne vendons ni ne louons vos données. Elles peuvent être communiquées aux
          autorités sur réquisition légale.
        </p>
      </>
    ),
  },
  {
    id: "conservation",
    title: "Durées de conservation",
    body: (
      <div className="legal-table-wrap">
        <table className="legal-table">
          <thead>
            <tr>
              <th scope="col">Données</th>
              <th scope="col">Durée</th>
            </tr>
          </thead>
          <tbody>
            {retention.map(([data, duration]) => (
              <tr key={data}>
                <td>{data}</td>
                <td>{duration}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
  },
  {
    id: "securite",
    title: "Sécurité",
    body: (
      <ul className="legal-list">
        <li>Connexions chiffrées (HTTPS/TLS) et authentification sécurisée.</li>
        <li>Cloisonnement des données de chaque établissement directement au niveau de la base de données.</li>
        <li>Accès par rôles : chaque membre de l’équipe ne voit que ce dont il a besoin.</li>
        <li>Chiffrement des secrets d’intégration et des identifiants de services tiers.</li>
        <li>Journalisation des actions sensibles et traçabilité des modifications.</li>
        <li>Sauvegardes régulières et procédure de gestion des incidents.</li>
      </ul>
    ),
  },
  {
    id: "droits",
    title: "Vos droits",
    body: (
      <>
        <p>
          Vous disposez d’un droit d’accès, de rectification, d’effacement, de limitation, de portabilité et
          d’opposition, du droit de retirer votre consentement à tout moment et de définir des directives sur le
          sort de vos données après votre décès. Pour les exercer, écrivez-nous par {contact}, en précisant
          l’objet de votre demande. Nous répondons dans un délai d’un mois.
        </p>
        <p>
          Si vous êtes client d’un commerçant utilisant {e.product}, adressez-vous en priorité à ce commerçant,
          responsable de vos données ; nous l’aiderons à vous répondre.
        </p>
        <p>
          Vous pouvez introduire une réclamation auprès de la CNIL (3 place de Fontenoy, TSA 80715, 75334 Paris
          Cedex 07,{" "}
          <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">
            cnil.fr
          </a>
          ).
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies",
    body: (
      <p>
        Le détail des cookies et traceurs utilisés, de leur durée et de la manière de modifier vos choix figure dans
        notre <Link href="/cookies">Politique cookies</Link>.
      </p>
    ),
  },
  {
    id: "evolution",
    title: "Évolution de cette politique",
    body: (
      <p>
        Cette politique peut évoluer avec la Plateforme et la réglementation. La date de mise à jour figure en tête
        de page ; les clients sont informés de toute modification importante.
      </p>
    ),
  },
];

export default function Page() {
  return (
    <LegalPage
      current="/confidentialite"
      eyebrow="Politique de confidentialité"
      title={
        <>
          Vos données travaillent <em>pour vous.</em>
        </>
      }
      lead="Ce que nous collectons, pourquoi, pour combien de temps, avec qui c’est partagé, et comment garder la main à tout moment."
      sections={sections}
    />
  );
}
