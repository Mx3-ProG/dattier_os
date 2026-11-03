"use client";

import { TenantLink as Link } from "./context";
import { createContext, useContext, type ReactNode } from "react";
import { openCookieSettings } from "./cookie-consent";

/** Legal identity entered in the CMS (Mon site web → Pages légales). */
export type LegalIdentity = {
  operator: string;
  legalForm: string;
  siret: string;
  rcs: string;
  vat: string;
  email: string;
  publicationDirector: string;
  host: string;
  mediator: string;
};
const identityLabels: [keyof LegalIdentity, string][] = [
  ["operator", "Raison sociale de l’exploitant"],
  ["legalForm", "Forme juridique et capital social"],
  ["siret", "SIREN / SIRET"],
  ["rcs", "RCS"],
  ["vat", "Numéro de TVA intracommunautaire"],
  ["email", "E-mail professionnel"],
  ["publicationDirector", "Directeur de la publication"],
  ["host", "Hébergeur (nom, adresse, téléphone)"],
  ["mediator", "Médiateur de la consommation"],
];
const LegalContext = createContext<{
  identity?: LegalIdentity;
  extra: string[];
}>({ extra: [] });

/** Shows the entered identity; any missing mandatory item keeps the warning visible. */
const MissingLegalIdentity = () => {
  const { identity } = useContext(LegalContext);
  const filled = identityLabels.filter(([key]) => identity?.[key]?.trim());
  const missing = identityLabels.filter(([key]) => !identity?.[key]?.trim());
  return (
    <>
      {filled.length > 0 && (
        <dl className="donut-legal-identity">
          {filled.map(([key, label]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>{identity![key]}</dd>
            </div>
          ))}
        </dl>
      )}
      {missing.length > 0 && (
        <div className="donut-legal-warning" role="note">
          <strong>
            Informations officielles encore requises avant publication
          </strong>
          {filled.length === 0 ? (
            <p>
              Forme juridique et raison sociale de l’exploitant, SIREN/SIRET,
              RCS, capital social le cas échéant, numéro de TVA, e-mail
              professionnel, directeur de publication, identité et coordonnées
              de l’hébergeur, ainsi que le médiateur de la consommation choisi
              par l’entreprise.
            </p>
          ) : (
            <p>À compléter : {missing.map(([, label]) => label).join(", ")}.</p>
          )}
        </div>
      )}
    </>
  );
};
export function LegalPage({
  route,
  legal,
  extra = [],
}: {
  route: string;
  legal?: LegalIdentity;
  extra?: string[];
}) {
  return (
    <LegalContext.Provider value={{ identity: legal, extra }}>
      <LegalBody route={route} />
    </LegalContext.Provider>
  );
}
function LegalBody({ route }: { route: string }) {
  if (route === "mentions-legales")
    return (
      <LegalLayout title="Mentions légales" eyebrow="TRANSPARENCE">
        <MissingLegalIdentity />
        <h2>Établissement</h2>
        <p>
          Les coordonnées de cet établissement sont présentées sur sa page
          Contact. Ces coordonnées proviennent du contenu de démonstration et
          doivent être confirmées par l’exploitant avant mise en ligne.
        </p>
        <h2>Édition et hébergement</h2>
        <p>
          L’identité complète de l’éditeur, le directeur de publication et les
          coordonnées de l’hébergeur ne sont pas encore renseignés. Cette page
          ne doit pas être considérée comme prête pour une exploitation
          commerciale tant que ces mentions obligatoires restent absentes.
        </p>
        <h2>Propriété intellectuelle</h2>
        <p>
          Le logo et les éléments de marque appartiennent à leurs titulaires.
          Les visuels, produits, prix, horaires et stocks affichés dans cette
          version sont des contenus de démonstration et ne constituent pas une
          offre commerciale réelle.
        </p>
      </LegalLayout>
    );

  if (route === "confidentialite")
    return (
      <LegalLayout title="Politique de confidentialité" eyebrow="VOS DONNÉES">
        <MissingLegalIdentity />
        <h2>Données traitées</h2>
        <p>
          Pour une commande : prénom, e-mail, contenu, montant, créneau, statut
          de paiement et de préparation. Si vous adhérez au programme de
          fidélité, le consentement, le solde de points et les opérations de
          fidélité sont également conservés.
        </p>
        <h2>Pourquoi et sur quelle base ?</h2>
        <ul>
          <li>
            Exécuter et suivre la commande : mesures précontractuelles et
            exécution du contrat.
          </li>
          <li>
            Tenir l’historique commercial et les justificatifs : obligations
            légales applicables à l’exploitant.
          </li>
          <li>
            Gérer la fidélité : consentement, retirable pour l’avenir sans
            affecter la licéité des traitements antérieurs.
          </li>
          <li>
            Sécuriser l’accès au compte : intérêt légitime à protéger les
            données et prévenir les accès non autorisés.
          </li>
        </ul>
        <h2>Stockage sur votre appareil</h2>
        <p>
          Le panier, la préférence cookies et une clé privée de compte sont
          enregistrés localement dans le navigateur. La clé affichée au serveur
          n’est conservée qu’en version hachée. Effacer les données du
          navigateur peut supprimer l’accès automatique au compte de cette
          démonstration.
        </p>
        <h2>Durées, destinataires et droits</h2>
        <p>
          Les durées définitives de conservation, les sous-traitants et
          l’adresse permettant d’exercer les droits d’accès, rectification,
          effacement, limitation, opposition et portabilité doivent être fixés
          par l’exploitant avant publication. Une réclamation peut être adressée
          à la CNIL.
        </p>
      </LegalLayout>
    );

  if (route === "cookies")
    return (
      <LegalLayout title="Cookies et stockage local" eyebrow="VOS CHOIX">
        <h2>Ce que le site utilise</h2>
        <p>
          Cette version n’installe aucun traceur publicitaire ni outil de mesure
          d’audience. Elle utilise le stockage local du navigateur pour garder
          le panier, votre choix de consentement et la clé privée permettant de
          retrouver le compte sur cet appareil. Ces éléments sont nécessaires
          aux fonctions demandées.
        </p>
        <h2>Contenu externe facultatif</h2>
        <p>
          La carte Google Maps intégrée est bloquée tant que vous ne l’avez pas
          autorisée. Vous pouvez toujours ouvrir l’itinéraire dans un nouvel
          onglet sans activer la carte intégrée, puis modifier votre choix à
          tout moment.
        </p>
        <button className="donut-button" onClick={openCookieSettings}>
          Gérer mes préférences
        </button>
      </LegalLayout>
    );

  return (
    <LegalLayout
      title="Conditions générales de vente"
      eyebrow="COMMANDES EN LIGNE"
    >
      <MissingLegalIdentity />
      <p className="donut-legal-date">Version du 18 octobre 2026</p>
      <h2>1. Objet et formation de la commande</h2>
      <p>
        Les présentes conditions encadrent les commandes de restauration à
        emporter ou à consommer sur place, passées sur le site. Le client
        vérifie les produits, options, allergènes signalés, prix, créneau et
        mode de paiement avant de cliquer sur le bouton indiquant l’obligation
        de paiement. La commande est formée après validation par le site et
        attribution d’un numéro de commande.
      </p>
      <h2>2. Transmission en cuisine, annulation et remboursement</h2>
      <div className="donut-legal-highlight">
        <strong>
          La validation transmet immédiatement la commande en cuisine.
        </strong>
        <p>
          En raison de la préparation immédiate, de la personnalisation possible
          et du caractère périssable des produits, la commande ne peut plus être
          modifiée, annulée ou remboursée à l’initiative du client une fois
          validée. Le droit de rétractation est exclu dans les cas prévus par
          l’article L. 221-28 du Code de la consommation, notamment pour les
          biens rapidement périssables ou personnalisés et les prestations de
          restauration fournies à une date ou période déterminée.
        </p>
      </div>
      <p>
        Cette règle ne prive pas le client de ses droits impératifs, notamment
        en cas de commande non fournie, de produit non conforme, d’erreur
        imputable à l’établissement ou d’annulation décidée par celui-ci. Toute
        difficulté doit être signalée rapidement avec le numéro de commande.
      </p>
      <h2>3. Prix, paiement et retrait</h2>
      <p>
        Les prix affichés au récapitulatif sont ceux applicables à la commande.
        Le paiement peut être demandé en ligne ou au comptoir selon l’option
        disponible. Le client se présente au créneau choisi. Une commande « sur
        place » ne réserve pas de table. Les modalités réelles de retard, de
        non-retrait et de paiement doivent être validées par l’exploitant avant
        ouverture commerciale.
      </p>
      <h2>4. Allergènes et informations produits</h2>
      <p>
        Le client consulte les informations disponibles et signale toute
        allergie avant validation. Les fiches allergènes de cette démonstration
        ne sont pas officielles : l’exploitant doit les remplacer par les
        informations exactes de ses recettes avant mise en ligne.
      </p>
      <h2>5. Programme de fidélité</h2>
      <p>
        L’adhésion est facultative et liée à l’e-mail du client. Les points sont
        personnels, non cessibles, non remboursables et sans valeur monétaire :
        ils ne peuvent être ni échangés contre des espèces ni utilisés comme un
        moyen de paiement hors des avantages proposés sur le site. Le compte
        affiche le solde et les récompenses accessibles ; chaque récompense peut
        avoir un coût en points, une durée ou des conditions particulières
        visibles avant utilisation.
      </p>
      <p>
        L’établissement peut faire évoluer ou suspendre le programme pour un
        motif légitime, sous réserve d’une information claire et d’un délai
        raisonnable lorsque cela affecte les points acquis. Les points obtenus
        par fraude, erreur manifeste, commande annulée ou impayée peuvent être
        corrigés. Les modalités d’acquisition, d’expiration et de conversion
        doivent être publiées par l’exploitant avant activation réelle.
      </p>
      <h2>6. Réclamations et médiation</h2>
      <p>
        Le client contacte d’abord l’établissement avec son numéro de commande.
        Les coordonnées du médiateur de la consommation choisi par l’exploitant
        doivent être ajoutées ici avant toute vente réelle. Les présentes CGV
        sont soumises au droit français sans priver le consommateur des règles
        impératives qui le protègent.
      </p>
      <p>
        Référence :{" "}
        <a
          href="https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044563170"
          target="_blank"
          rel="noreferrer"
        >
          article L. 221-28 du Code de la consommation
        </a>
        .
      </p>
    </LegalLayout>
  );
}

function LegalLayout({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
}) {
  const { extra } = useContext(LegalContext);
  return (
    <section className="donut-section donut-legal">
      <p className="donut-kicker">{eyebrow}</p>
      <h1>{title}</h1>
      <nav aria-label="Pages juridiques">
        <Link href="/mentions-legales">Mentions légales</Link>
        <Link href="/conditions-generales-vente">CGV</Link>
        <Link href="/confidentialite">Confidentialité</Link>
        <Link href="/cookies">Cookies</Link>
      </nav>
      <div className="donut-legal-content">
        {children}
        {extra.filter(Boolean).map((text, index) => (
          <p key={index} className="donut-legal-extra">
            {text}
          </p>
        ))}
      </div>
    </section>
  );
}
