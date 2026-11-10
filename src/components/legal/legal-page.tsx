/* Gabarit commun des pages légales de STUDIO OS. S’appuie sur landing.css
   (en-tête, boutons) et guide.css (sommaire collant). */
import Link from "next/link";
import { Store } from "lucide-react";
import { GuideToc } from "@/components/guide-toc";
import { legalEntity, legalUpdatedAt } from "@/features/legal/entity";
import { CookieSettingsButton, PlatformCookieConsent } from "./platform-cookie-consent";

export const legalDocuments = [
  { href: "/cgu", label: "Conditions générales" },
  { href: "/confidentialite", label: "Confidentialité" },
  { href: "/cookies", label: "Cookies" },
  { href: "/mentions-legales", label: "Mentions légales" },
] as const;

export type LegalSection = { id: string; title: string; body: React.ReactNode };

export function LegalPage({
  current,
  eyebrow,
  title,
  lead,
  sections,
}: {
  current: (typeof legalDocuments)[number]["href"];
  eyebrow: string;
  title: React.ReactNode;
  lead: React.ReactNode;
  sections: LegalSection[];
}) {
  return (
    <div className="landing guide legal">
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>
      <header className="landing-header">
        <Link href="/" className="landing-brand">
          <Store size={20} aria-hidden /> STUDIO OS
        </Link>
        <nav aria-label="Documents légaux">
          {legalDocuments.map((d) => (
            <Link key={d.href} href={d.href} aria-current={d.href === current ? "page" : undefined}>
              {d.label}
            </Link>
          ))}
        </nav>
        <Link className="landing-btn primary small" href="/checkout/39">
          Essai gratuit
        </Link>
      </header>

      <main id="contenu" tabIndex={-1}>
        <section className="guide-hero legal-hero">
          <span className="landing-eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p className="landing-lead">{lead}</p>
          <p className="legal-meta">
            Version en vigueur au {legalUpdatedAt} · Éditeur : {legalEntity.name} SAS, {legalEntity.rcs}
          </p>
        </section>

        <div className="guide-layout">
          <GuideToc items={sections.map(({ id, title }) => ({ id, label: title }))} label="Sommaire du document" />
          <div className="guide-body legal-body">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="legal-section">
                <h2>
                  <span>{String(i + 1).padStart(2, "0")}</span> {s.title}
                </h2>
                {s.body}
              </section>
            ))}
          </div>
        </div>
      </main>

      <LegalFooter />
      <PlatformCookieConsent />
    </div>
  );
}

/** Liens légaux à placer dans tous les pieds de page publics de STUDIO OS. */
export function LegalLinks() {
  return (
    <>
      {legalDocuments.map((d) => (
        <Link key={d.href} href={d.href}>
          {d.label}
        </Link>
      ))}
      <CookieSettingsButton />
    </>
  );
}

function LegalFooter() {
  return (
    <footer className="landing-footer">
      <span className="landing-brand">
        <Store size={18} aria-hidden /> STUDIO OS
      </span>
      <nav aria-label="Liens utiles">
        <Link href="/">Accueil</Link>
        <Link href="/guide">Guide</Link>
        <LegalLinks />
      </nav>
      <small>
        © {new Date().getFullYear()} {legalEntity.name} SAS · STUDIO OS, logiciel libre sous licence AGPL-3.0
      </small>
    </footer>
  );
}
