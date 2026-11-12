"use client";
/* Bandeau et centre de préférences cookies du site STUDIO S (home, guide,
   pages légales). Les sites des commerçants ont leur propre bandeau
   (components/cms-site/cookie-consent.tsx).

   Règles CNIL appliquées : refuser est aussi simple qu’accepter, rien
   d’optionnel n’est actif avant un choix, le choix est daté et redemandé
   après 6 mois, et il reste modifiable à tout moment (« Gérer mes cookies »). */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BarChart3, Cookie, Megaphone, ShieldCheck, X } from "lucide-react";
import {
  consentMaxAgeMs,
  platformConsentEvent,
  platformConsentKey,
  readPlatformConsent,
  type PlatformConsent,
} from "@/features/legal/consent";

const openEvent = "studio:cookie-settings";

export function openPlatformCookieSettings() {
  window.dispatchEvent(new Event(openEvent));
}

export function PlatformCookieConsent() {
  const [ready, setReady] = useState(false);
  const [consent, setConsent] = useState<PlatformConsent | null>(null);
  const [settings, setSettings] = useState(false);
  const [audience, setAudience] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const saved = readPlatformConsent(Date.now());
    setConsent(saved);
    setAudience(saved?.audience ?? false);
    setMarketing(saved?.marketing ?? false);
    setReady(true);
    const open = () => {
      const current = readPlatformConsent(Date.now());
      setAudience(current?.audience ?? false);
      setMarketing(current?.marketing ?? false);
      setSettings(true);
    };
    window.addEventListener(openEvent, open);
    return () => window.removeEventListener(openEvent, open);
  }, []);

  useEffect(() => {
    if (!settings) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setSettings(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [settings]);

  const save = useCallback((next: { audience: boolean; marketing: boolean }) => {
    const value: PlatformConsent = { version: 1, ...next, updatedAt: new Date().toISOString() };
    try {
      localStorage.setItem(platformConsentKey, JSON.stringify(value));
    } catch {
      /* Le choix s’applique quand même à la page en cours. */
    }
    setConsent(value);
    setAudience(next.audience);
    setMarketing(next.marketing);
    setSettings(false);
    window.dispatchEvent(new CustomEvent(platformConsentEvent, { detail: value }));
  }, []);

  // Le bandeau fait partie du HTML serveur (pas d’apparition tardive) ; un choix
  // déjà enregistré et encore valide le masque avant l’affichage.
  const hideIfChosen = `try{var v=JSON.parse(localStorage.getItem(${JSON.stringify(platformConsentKey)})||"null");if(v&&v.version===1&&Date.now()-Date.parse(v.updatedAt)<${consentMaxAgeMs})document.currentScript.previousElementSibling.hidden=true}catch(e){}`;

  return (
    <>
      {(!ready || (!consent && !settings)) && (
        <aside className="studio-cookie-banner" role="region" aria-labelledby="studio-cookie-title" suppressHydrationWarning>
          <div className="studio-cookie-text">
            <Cookie aria-hidden size={22} />
            <span>
              <strong id="studio-cookie-title">Des cookies utiles, et seulement avec votre accord.</strong>
              <small>
                Les cookies essentiels font fonctionner le site, votre connexion et
                le parrainage. Avec votre accord, nous mesurons aussi les visites,
                leur provenance et les inscriptions qu’elles génèrent, pour
                améliorer STUDIO S. Aucune revente de données.{" "}
                <Link href="/cookies">En savoir plus</Link>
              </small>
            </span>
          </div>
          <div className="studio-cookie-actions">
            <button type="button" className="landing-btn outline small" onClick={() => save({ audience: false, marketing: false })}>
              Tout refuser
            </button>
            <button type="button" className="landing-btn outline small" onClick={() => setSettings(true)}>
              Personnaliser
            </button>
            <button type="button" className="landing-btn primary small" onClick={() => save({ audience: true, marketing: true })}>
              Tout accepter
            </button>
          </div>
        </aside>
      )}
      {!ready && <script dangerouslySetInnerHTML={{ __html: hideIfChosen }} />}

      {settings && (
        <div className="studio-cookie-overlay" role="presentation" onClick={(e) => e.target === e.currentTarget && setSettings(false)}>
          <section className="studio-cookie-dialog" role="dialog" aria-modal="true" aria-labelledby="studio-cookie-settings-title">
            <button type="button" className="studio-cookie-close" aria-label="Fermer les préférences" onClick={() => setSettings(false)}>
              <X size={18} />
            </button>
            <span className="landing-eyebrow">Centre de préférences</span>
            <h2 id="studio-cookie-settings-title">Choisissez ce que nous mesurons.</h2>
            <div className="studio-cookie-choice">
              <ShieldCheck aria-hidden size={20} />
              <span>
                <strong>Essentiels</strong>
                <small>Session de connexion sécurisée, protection des formulaires, attribution du parrainage, thème d’affichage et mémorisation de ce choix.</small>
              </span>
              <b>Toujours actifs</b>
            </div>
            <label className="studio-cookie-choice">
              <BarChart3 aria-hidden size={20} />
              <span>
                <strong>Mesure d’audience et des ventes</strong>
                <small>Pages vues, parcours de visite, zone géographique approximative, appareil, et suivi des essais et abonnements issus de ces visites. Statistiques agrégées, utilisées uniquement par STUDIO S.</small>
              </span>
              <input type="checkbox" checked={audience} onChange={(e) => setAudience(e.target.checked)} />
            </label>
            <label className="studio-cookie-choice">
              <Megaphone aria-hidden size={20} />
              <span>
                <strong>Provenance et campagnes</strong>
                <small>Identifie la campagne, le partenaire ou le lien qui vous a amené (paramètres de suivi), pour mesurer l’efficacité de nos communications. Aucun cookie publicitaire tiers.</small>
              </span>
              <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
            </label>
            <div className="studio-cookie-actions">
              <button type="button" className="landing-btn outline small" onClick={() => save({ audience: false, marketing: false })}>
                Tout refuser
              </button>
              <button type="button" className="landing-btn primary small" onClick={() => save({ audience, marketing })}>
                Enregistrer mes choix
              </button>
            </div>
            <p className="studio-cookie-note">
              Votre choix est conservé 6 mois. <Link href="/cookies">Politique cookies</Link> ·{" "}
              <Link href="/confidentialite">Confidentialité</Link>
            </p>
          </section>
        </div>
      )}
    </>
  );
}

/** Lien « Gérer mes cookies » des pieds de page et de la politique cookies. */
export function CookieSettingsButton({ className, children = "Gérer mes cookies" }: { className?: string; children?: React.ReactNode }) {
  return (
    <button type="button" className={className ?? "studio-link-button"} onClick={openPlatformCookieSettings}>
      {children}
    </button>
  );
}
