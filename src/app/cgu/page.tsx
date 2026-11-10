import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection } from "@/components/legal/legal-page";
import { legalEntity, legalOffer } from "@/features/legal/entity";
import "../landing.css";
import "../guide/guide.css";
import "../legal.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Conditions générales d’utilisation et de vente · STUDIO OS",
  description:
    "Conditions générales de STUDIO OS : abonnement Studio à 39 € TTC par mois sans engagement, résiliable à tout moment, add-ons à la carte, essai gratuit de 3 jours.",
};

const e = legalEntity;
const o = legalOffer;

const sections: LegalSection[] = [
  {
    id: "objet",
    title: "Objet et acceptation",
    body: (
      <>
        <p>
          Les présentes conditions générales d’utilisation et de vente (les « Conditions ») régissent l’accès et
          l’utilisation de la plateforme {e.product} (la « Plateforme »), éditée par la société {e.name}, {e.form} au
          capital de {e.capital}, immatriculée au {e.rcs}, dont le siège social est situé {e.address}, agissant sous
          le nom commercial {e.tradeName} (l’« Éditeur »). Contact : <a href={`mailto:${e.email}`}>{e.email}</a>.
        </p>
        <p>
          La Plateforme est exclusivement destinée aux <strong>professionnels</strong> (commerçants, restaurateurs,
          artisans, indépendants, sociétés, associations) agissant dans le cadre de leur activité. En créant un
          compte, le Client déclare agir à des fins professionnelles et disposer du pouvoir d’engager la structure
          qu’il représente.
        </p>
        <p>
          La création d’un compte vaut acceptation pleine et entière des Conditions, de la{" "}
          <Link href="/confidentialite">Politique de confidentialité</Link> et de la{" "}
          <Link href="/cookies">Politique cookies</Link>. Les Conditions prévalent sur tout autre document, sauf accord
          écrit et signé des deux parties.
        </p>
      </>
    ),
  },
  {
    id: "definitions",
    title: "Définitions",
    body: (
      <dl className="legal-definitions">
        <dt>Client</dt>
        <dd>Le professionnel titulaire du compte et de l’abonnement.</dd>
        <dt>Utilisateur</dt>
        <dd>Toute personne (gérant, salarié, prestataire) à qui le Client donne un accès, avec un rôle défini.</dd>
        <dt>Établissement</dt>
        <dd>Un point de vente, commerce ou activité géré dans la Plateforme, disposant de ses propres données.</dd>
        <dt>Abonnement Studio</dt>
        <dd>L’abonnement mensuel donnant accès au socle de la Plateforme pour un Établissement.</dd>
        <dt>Add-on</dt>
        <dd>Un module optionnel, activable et désactivable à tout moment, facturé en supplément.</dd>
        <dt>Crédits</dt>
        <dd>Unités prépayées consommées par l’assistant STUDIO VOICE et certaines fonctions à l’usage.</dd>
        <dt>Site Client</dt>
        <dd>Le site internet et la boutique en ligne publiés par le Client au moyen de la Plateforme.</dd>
        <dt>Clients finaux</dt>
        <dd>Les visiteurs, acheteurs et clients du Client, notamment ceux du Site Client.</dd>
      </dl>
    ),
  },
  {
    id: "service",
    title: "Description du service",
    body: (
      <>
        <p>
          {e.product} est une solution en ligne tout-en-un (logiciel en tant que service) qui réunit, dans un même
          espace, les outils nécessaires pour créer, gérer et développer un commerce, en boutique comme sur
          internet. Elle offre un périmètre comparable à celui des principales plateformes de création de sites et
          de commerce en ligne du marché, complété par des outils de gestion quotidienne :
        </p>
        <ul className="legal-list">
          <li>
            <strong>Site internet et contenus</strong> : création et personnalisation de pages, éditeur visuel,
            médias, thèmes, publication sur une adresse {e.product} ou sur un nom de domaine personnalisé (Add-on).
          </li>
          <li>
            <strong>Boutique en ligne et ventes</strong> : catalogue de produits, panier, commandes, créneaux de
            retrait ou de livraison, paiement en ligne sécurisé par un prestataire de paiement agréé.
          </li>
          <li>
            <strong>Clients et fidélisation</strong> : fichier clients, comptes clients, programme de fidélité,
            suivi de l’engagement et de la valeur client.
          </li>
          <li>
            <strong>Pilotage</strong> : statistiques de visites et de ventes, chiffre d’affaires, rapports,
            finances, préparation pré-comptable, référencement naturel (SEO).
          </li>
          <li>
            <strong>Opérations</strong> : stocks, réservations, plan de salle, équipe, rôles et accès, présences,
            factures, QR codes, fonctionnement hors ligne.
          </li>
          <li>
            <strong>Assistant STUDIO VOICE</strong> : assistant vocal et écrit qui prépare des actions soumises à la
            validation de l’Utilisateur.
          </li>
        </ul>
        <p>
          Le périmètre exact des fonctions incluses peut varier selon le métier déclaré. Le détail à jour est
          présenté sur la page d’accueil, dans le <Link href="/guide">guide</Link> et dans l’espace du Client.
          L’Éditeur fait évoluer la Plateforme en continu ; il peut ajouter, modifier ou retirer des fonctions,
          sans réduire substantiellement le socle inclus dans l’Abonnement Studio en cours.
        </p>
      </>
    ),
  },
  {
    id: "compte",
    title: "Création du compte et accès",
    body: (
      <>
        <p>
          Le Client fournit des informations exactes, complètes et à jour (identité, raison sociale, coordonnées,
          informations de facturation) et s’engage à les maintenir à jour. Les identifiants sont personnels et
          confidentiels : toute action réalisée avec eux est réputée faite par le Client ou ses Utilisateurs.
        </p>
        <p>
          Le Client attribue lui-même les rôles et accès de ses Utilisateurs, et répond de leur usage de la
          Plateforme comme du sien. Il informe sans délai l’Éditeur de toute utilisation non autorisée de son
          compte.
        </p>
      </>
    ),
  },
  {
    id: "essai",
    title: "Essai gratuit",
    body: (
      <>
        <p>
          Chaque nouveau Client bénéficie d’un essai gratuit de <strong>{o.trialDays} jours</strong>, qui démarre à
          la création de l’espace. L’essai ne requiert aucun paiement initial et{" "}
          <strong>ne déclenche aucun prélèvement automatique</strong> à son terme : l’Abonnement Studio n’est activé
          que sur action volontaire du Client.
        </p>
        <p>
          À la fin de l’essai sans activation, l’accès aux fonctions est suspendu. Les données saisies sont
          conservées pendant une durée raisonnable pour permettre une activation ultérieure, puis supprimées dans
          les conditions de la <Link href="/confidentialite">Politique de confidentialité</Link>. L’essai est
          limité à un par Client.
        </p>
      </>
    ),
  },
  {
    id: "abonnement",
    title: "Abonnement Studio et prix",
    body: (
      <>
        <div className="legal-callout">
          <strong>{o.base} TTC par mois</strong>
          <span>Un Établissement inclus · sans engagement · résiliable à tout moment</span>
        </div>
        <p>
          L’Abonnement Studio donne accès au socle de la Plateforme pour un Établissement, dont notamment :{" "}
          {o.included.map((a) => a.name).join(", ")}, l’équipe et les rôles, le pilotage, les rapports, le mode hors
          ligne, la sécurité, la traçabilité et les tutoriels. Chaque Établissement supplémentaire est facturé{" "}
          {o.extraEstablishment} TTC par mois et bénéficie du même socle.
        </p>
        <p>
          Les prix sont exprimés en euros toutes taxes comprises, TVA française au taux en vigueur incluse. Le prix
          applicable est celui affiché au moment de l’activation. L’Éditeur peut faire évoluer ses prix ; toute
          hausse est notifiée au Client au moins <strong>30 jours</strong> avant sa prise d’effet, le Client restant
          libre de résilier avant cette date sans frais.
        </p>
      </>
    ),
  },
  {
    id: "addons",
    title: "Add-ons, crédits et paiements en ligne",
    body: (
      <>
        <p>
          Le Client peut enrichir son espace avec des Add-ons, activés et désactivés librement depuis son espace,
          sans engagement. Sauf indication contraire affichée avant activation, chaque Add-on est facturé{" "}
          <strong>{o.addon} TTC par mois</strong> et par Établissement. Les modules de pilotage avancé sont proposés
          aux tarifs suivants : {o.pilotageAddons.map((a) => `${a.name} (${a.price} TTC par mois)`).join(", ")}.
        </p>
        <p className="legal-small">Add-ons disponibles à la date des présentes : {o.addons.map((a) => a.name).join(", ")}.</p>
        <p>
          La désactivation d’un Add-on prend effet à la fin de la période de facturation en cours ; la période
          entamée reste due et n’est pas remboursée au prorata.
        </p>
        <p>
          Les <strong>Crédits</strong> STUDIO VOICE sont achetés par packs prépayés ; un solde de bienvenue peut être
          offert. Le nombre de Crédits consommés par une demande dépend de sa complexité et est indiqué dans
          l’espace. Les Crédits ne sont ni remboursables ni convertibles en espèces, et deviennent caducs à la
          clôture définitive du compte.
        </p>
        <p>
          Les <strong>paiements en ligne</strong> des Clients finaux sur le Site Client sont traités par le
          prestataire de paiement Stripe. Pour en bénéficier, le Client ouvre un compte auprès de ce prestataire et
          accepte ses conditions propres ; les fonds sont versés directement par le prestataire. Les frais du
          prestataire et, le cas échéant, la commission de la Plateforme sont présentés dans l’espace avant
          activation de l’encaissement en ligne.
        </p>
      </>
    ),
  },
  {
    id: "facturation",
    title: "Facturation et paiement",
    body: (
      <>
        <p>
          L’Abonnement Studio, les Établissements supplémentaires et les Add-ons sont facturés mensuellement, terme
          à échoir, par prélèvement sur le moyen de paiement enregistré par le Client auprès du prestataire de
          paiement. Les factures sont mises à disposition dans l’espace du Client.
        </p>
        <p>
          En cas d’échec de paiement, l’Éditeur relance le Client. À défaut de régularisation dans un délai de 15
          jours après la relance, l’accès aux fonctions payantes peut être suspendu, puis l’abonnement résilié. Les
          données restent conservées pendant la suspension.
        </p>
        <p className="legal-small">
          Conformément à l’article L. 441-10 du Code de commerce, tout retard de paiement entraîne de plein droit
          des pénalités au taux d’intérêt appliqué par la Banque centrale européenne à son opération de
          refinancement la plus récente, majoré de 10 points, ainsi qu’une indemnité forfaitaire pour frais de
          recouvrement de 40 €. Aucun escompte n’est accordé pour paiement anticipé.
        </p>
      </>
    ),
  },
  {
    id: "resiliation",
    title: "Durée, sans engagement et résiliation",
    body: (
      <>
        <p>
          L’Abonnement Studio est conclu <strong>sans engagement de durée</strong>, pour des périodes d’un mois
          renouvelées automatiquement. Le Client peut le <strong>résilier à tout moment</strong>, en quelques clics
          depuis son espace, sans frais ni justification. La résiliation prend effet à la fin de la période
          mensuelle en cours, jusqu’à laquelle le Client conserve l’accès ; la période entamée n’est pas
          remboursée.
        </p>
        <p>
          L’Éditeur peut résilier l’abonnement en cas de manquement du Client aux Conditions, après une mise en
          demeure restée sans effet pendant 15 jours, ou sans délai en cas de manquement grave (activité illicite,
          fraude, atteinte à la sécurité de la Plateforme ou aux droits de tiers).
        </p>
        <p>
          Avant la clôture, le Client peut exporter ses données depuis son espace ou en demander l’export à
          l’Éditeur. Après la clôture, les données sont supprimées ou anonymisées dans les délais prévus par la{" "}
          <Link href="/confidentialite">Politique de confidentialité</Link>, sous réserve des obligations légales de
          conservation (notamment comptables).
        </p>
      </>
    ),
  },
  {
    id: "parrainage",
    title: "Programme de parrainage",
    body: (
      <p>
        Le Client peut recommander la Plateforme au moyen de son lien de parrainage. Dès {o.referralFree} filleuls
        disposant d’un abonnement payant actif, l’Abonnement Studio du parrain est offert, hors Crédits et
        Établissements supplémentaires. Les règles détaillées, paliers et défis sont présentés sur la page{" "}
        <Link href="/platform/parrainage">Parrainage</Link>. Les avantages ne sont ni cessibles ni convertibles en
        espèces ; toute fraude (auto-parrainage, comptes fictifs) entraîne leur annulation.
      </p>
    ),
  },
  {
    id: "obligations",
    title: "Obligations du Client",
    body: (
      <>
        <p>Le Client s’engage à utiliser la Plateforme de façon loyale et conforme à la loi. Il est seul responsable :</p>
        <ul className="legal-list">
          <li>
            de son activité, de ses produits, de ses prix, de leur conformité (hygiène, étiquetage, allergènes,
            réglementation sectorielle) et de la relation avec ses Clients finaux ;
          </li>
          <li>
            des mentions légales, conditions générales de vente, informations précontractuelles et politique de
            confidentialité de son Site Client, que la Plateforme l’aide à établir ;
          </li>
          <li>
            du paramétrage du consentement aux cookies et à la mesure d’audience de son Site Client, au moyen des
            outils fournis ;
          </li>
          <li>des contenus qu’il publie, dont il garantit détenir les droits ;</li>
          <li>de ses obligations fiscales, sociales et comptables, notamment en matière de facturation et de paie.</li>
        </ul>
        <p>
          Il s’interdit notamment de publier des contenus illicites, trompeurs, haineux ou contrefaisants, de
          vendre des produits prohibés, d’envoyer des messages non sollicités, de tenter de contourner les mesures
          de sécurité ou le cloisonnement des données, ou de surcharger volontairement la Plateforme.
        </p>
      </>
    ),
  },
  {
    id: "propriete",
    title: "Propriété intellectuelle et contenus",
    body: (
      <>
        <p>
          Le Client reste propriétaire de ses contenus et de ses données. Il concède à l’Éditeur, pour la seule
          durée de l’abonnement et pour les seuls besoins du service, le droit de les héberger, reproduire et
          afficher, notamment sur le Site Client.
        </p>
        <p>
          Le code source de {e.product} est un logiciel libre distribué sous licence AGPL-3.0, consultable sur la
          page <Link href="/source">Code source et licence</Link>. Cette licence ne confère aucun droit sur les
          marques, logos, noms, contenus éditoriaux et éléments graphiques de l’Éditeur, qui demeurent protégés.
          Le service hébergé (infrastructure, données, support, maintenance) est fourni au titre des présentes
          Conditions.
        </p>
      </>
    ),
  },
  {
    id: "donnees",
    title: "Données personnelles et sous-traitance",
    body: (
      <>
        <p>
          L’Éditeur traite les données de ses Clients et Utilisateurs en qualité de responsable de traitement, dans
          les conditions décrites par la <Link href="/confidentialite">Politique de confidentialité</Link>.
        </p>
        <p>
          Pour les données des Clients finaux traitées au moyen de la Plateforme (commandes, comptes clients,
          fidélité, réservations, statistiques), le Client est <strong>responsable de traitement</strong> et
          l’Éditeur agit en qualité de <strong>sous-traitant</strong> au sens de l’article 28 du RGPD. À ce titre,
          l’Éditeur s’engage à :
        </p>
        <ul className="legal-list">
          <li>ne traiter ces données que sur instruction documentée du Client et pour les seuls besoins du service ;</li>
          <li>garantir la confidentialité des données et l’engagement de confidentialité des personnes autorisées ;</li>
          <li>mettre en œuvre des mesures de sécurité appropriées, dont le cloisonnement des données par Établissement ;</li>
          <li>
            ne recourir qu’aux sous-traitants ultérieurs listés dans la Politique de confidentialité, et informer le
            Client de tout changement, celui-ci pouvant s’y opposer en résiliant ;
          </li>
          <li>aider le Client à répondre aux demandes d’exercice des droits et à remplir ses obligations ;</li>
          <li>notifier au Client toute violation de données dans les meilleurs délais après en avoir pris connaissance ;</li>
          <li>supprimer ou restituer les données au terme du service, au choix du Client ;</li>
          <li>mettre à disposition les informations nécessaires pour démontrer le respect de ces obligations.</li>
        </ul>
      </>
    ),
  },
  {
    id: "ia",
    title: "Assistant et intelligence artificielle",
    body: (
      <p>
        STUDIO VOICE propose des réponses, suggestions et actions générées automatiquement, en partie à l’aide de
        modèles d’intelligence artificielle fournis par un prestataire spécialisé. Ces résultats peuvent être
        incomplets ou inexacts : aucune action n’est exécutée sans la confirmation de l’Utilisateur, qui reste seul
        juge de leur pertinence. Les outils financiers, de facturation et de paie constituent une aide à la
        préparation et ne remplacent pas l’intervention d’un expert-comptable ou d’un conseil.
      </p>
    ),
  },
  {
    id: "disponibilite",
    title: "Disponibilité, maintenance et support",
    body: (
      <>
        <p>
          L’Éditeur met en œuvre les moyens raisonnables pour assurer l’accès à la Plateforme 24 h/24 et 7 j/7,
          dans le cadre d’une obligation de moyens. Des interruptions peuvent survenir pour maintenance, mise à
          jour ou cause extérieure ; l’Éditeur s’efforce de les planifier en dehors des heures de forte activité.
          Le mode hors ligne permet de poursuivre certaines opérations en cas de coupure réseau.
        </p>
        <p>
          Le développement, la maintenance et le support de la Plateforme sont assurés par l’Éditeur, sous son nom
          commercial {e.tradeName}. Le Client dispose du guide, des tutoriels intégrés et d’un contact à l’adresse{" "}
          <a href={`mailto:${e.email}`}>{e.email}</a>.
        </p>
      </>
    ),
  },
  {
    id: "responsabilite",
    title: "Responsabilité",
    body: (
      <>
        <p>
          L’Éditeur est tenu d’une obligation de moyens. Il ne saurait être tenu responsable des dommages
          indirects (perte de chiffre d’affaires, de clientèle, de données imputable au Client, atteinte à
          l’image), ni des conséquences d’une utilisation non conforme, d’une défaillance des réseaux, d’un
          prestataire tiers choisi par le Client ou d’un cas de force majeure.
        </p>
        <p>
          Sauf faute lourde ou dolosive, la responsabilité totale de l’Éditeur, toutes causes confondues, est
          limitée aux sommes effectivement versées par le Client au titre des douze (12) mois précédant le fait
          générateur.
        </p>
      </>
    ),
  },
  {
    id: "force-majeure",
    title: "Force majeure",
    body: (
      <p>
        Aucune partie ne pourra être tenue responsable d’un manquement résultant d’un cas de force majeure au sens
        de l’article 1218 du Code civil. Si l’empêchement dure plus de 30 jours, chaque partie peut résilier sans
        indemnité.
      </p>
    ),
  },
  {
    id: "modification",
    title: "Modification des Conditions",
    body: (
      <p>
        L’Éditeur peut modifier les Conditions pour tenir compte de l’évolution de la Plateforme, de la
        réglementation ou de son offre. Toute modification substantielle est notifiée au Client au moins 30 jours
        avant son entrée en vigueur. Le Client qui la refuse peut résilier sans frais avant cette date ; à défaut,
        les nouvelles Conditions s’appliquent.
      </p>
    ),
  },
  {
    id: "droit",
    title: "Droit applicable et litiges",
    body: (
      <p>
        Les Conditions sont soumises au droit français. Les parties s’efforcent de résoudre à l’amiable tout
        différend. À défaut d’accord dans un délai de 30 jours, tout litige relatif à leur formation, leur
        exécution ou leur interprétation relève de la compétence exclusive des tribunaux du ressort de la Cour
        d’appel de Toulouse, y compris en cas de pluralité de défendeurs ou d’appel en garantie.
      </p>
    ),
  },
];

export default function Page() {
  return (
    <LegalPage
      current="/cgu"
      eyebrow="Conditions générales"
      title={
        <>
          Des règles claires, <em>sans engagement.</em>
        </>
      }
      lead={`Ce que vous obtenez avec ${e.product}, ce que cela coûte et comment vous restez libre : un abonnement Studio à ${o.base} TTC par mois, résiliable à tout moment, et des add-ons à activer seulement si vous en avez besoin.`}
      sections={sections}
    />
  );
}
