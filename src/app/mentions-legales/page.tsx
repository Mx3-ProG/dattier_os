import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection } from "@/components/legal/legal-page";
import { legalEntity } from "@/features/legal/entity";
import "../landing.css";
import "../guide/guide.css";
import "../legal.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Mentions légales · STUDIO OS",
  description: "Éditeur, directeur de la publication, hébergeur et informations légales du site STUDIO OS.",
};

const e = legalEntity;

function Identity({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="legal-identity">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const sections: LegalSection[] = [
  {
    id: "editeur",
    title: "Éditeur du site et de la plateforme",
    body: (
      <Identity
        rows={[
          ["Dénomination", e.name],
          ["Nom commercial", e.tradeName],
          ["Forme juridique", e.form],
          ["Capital social", e.capital],
          ["Siège social", e.address],
          ["SIREN", e.siren],
          ["SIRET (siège)", e.siret],
          ["Immatriculation", e.rcs],
          ["TVA intracommunautaire", e.vat],
          ["Code NAF / APE", e.naf],
          ["Président", e.president],
          ["Directeur général", e.generalManager],
          [
            "Contact",
            e.email ? (
              <a href={`mailto:${e.email}`}>{e.email}</a>
            ) : (
              <a href={e.website} target="_blank" rel="noopener noreferrer">
                {e.website.replace("https://", "")}
              </a>
            ),
          ],
        ]}
      />
    ),
  },
  {
    id: "publication",
    title: "Directeur de la publication",
    body: <p>{e.publicationDirector}.</p>,
  },
  {
    id: "hebergement",
    title: "Hébergement",
    body: e.host.name ? (
      <Identity
        rows={[
          ["Hébergeur", e.host.name],
          ...(e.host.address ? ([["Adresse", e.host.address]] as [string, string][]) : []),
          ...(e.host.contact ? ([["Contact", e.host.contact]] as [string, string][]) : []),
          ["Localisation des données", e.host.location],
        ]}
      />
    ) : (
      <p>
        Le site et la plateforme sont hébergés pour le compte de {e.name} sur des serveurs administrés par
        l’Éditeur. Les coordonnées de l’hébergeur sont communiquées sur simple demande adressée au siège social.
      </p>
    ),
  },
  {
    id: "conception",
    title: "Conception et maintenance",
    body: (
      <p>
        {e.product} est conçu, développé et maintenu par {e.name}, sous son nom commercial {e.tradeName} (
        <a href={e.website} target="_blank" rel="noopener noreferrer">
          {e.website.replace("https://", "")}
        </a>
        ).
      </p>
    ),
  },
  {
    id: "propriete",
    title: "Propriété intellectuelle",
    body: (
      <p>
        Le code source de {e.product} est distribué sous licence libre AGPL-3.0 (voir{" "}
        <Link href="/source">Code source et licence</Link>). Les marques, noms, logos, textes, visuels et la
        présentation du site restent la propriété de {e.name} ou de leurs titulaires ; toute reproduction non
        autorisée est interdite. Les contenus publiés par les commerçants sur leurs propres sites relèvent de leur
        seule responsabilité.
      </p>
    ),
  },
  {
    id: "signalement",
    title: "Signaler un contenu",
    body: (
      <p>
        Conformément à la loi pour la confiance dans l’économie numérique, toute personne peut signaler un contenu
        manifestement illicite publié au moyen de la Plateforme, en précisant son identité, l’adresse de la page
        concernée, la description du contenu et les motifs du signalement, par courrier au siège social ou via le{" "}
        <a href={e.website} target="_blank" rel="noopener noreferrer">
          site officiel
        </a>
        .
      </p>
    ),
  },
  {
    id: "documents",
    title: "Autres documents",
    body: (
      <ul className="legal-list">
        <li>
          <Link href="/cgu">Conditions générales d’utilisation et de vente</Link>
        </li>
        <li>
          <Link href="/confidentialite">Politique de confidentialité</Link>
        </li>
        <li>
          <Link href="/cookies">Politique cookies</Link>
        </li>
      </ul>
    ),
  },
];

export default function Page() {
  return (
    <LegalPage
      current="/mentions-legales"
      eyebrow="Mentions légales"
      title={
        <>
          Qui se tient <em>derrière STUDIO OS.</em>
        </>
      }
      lead={`${e.product} est une plateforme éditée par ${e.name}, société française immatriculée à Toulouse.`}
      sections={sections}
    />
  );
}
