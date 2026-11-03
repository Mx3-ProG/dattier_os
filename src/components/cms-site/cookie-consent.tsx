"use client";
import { useTenantSite } from "./context";

import { TenantLink as Link } from "./context";
import { useEffect, useState } from "react";
import { Settings2, ShieldCheck, X } from "lucide-react";

type Consent = { version: 1; externalMedia: boolean; updatedAt: string };

function readConsent(STORAGE_KEY: string): Consent | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return value?.version === 1 && typeof value.externalMedia === "boolean"
      ? value
      : null;
  } catch {
    return null;
  }
}

export function CookieConsent({
  onChange,
}: {
  onChange: (externalMedia: boolean) => void;
}) {
  const { restaurant } = useTenantSite();
  const STORAGE_KEY = `dattier-cookie-consent:${restaurant}`;
  const [consent, setConsent] = useState<Consent | null>(null);
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState(false);
  const [externalMedia, setExternalMedia] = useState(false);

  useEffect(() => {
    const saved = readConsent(STORAGE_KEY);
    setConsent(saved);
    setExternalMedia(saved?.externalMedia ?? false);
    onChange(saved?.externalMedia ?? false);
    setReady(true);
    const open = () => {
      const current = readConsent(STORAGE_KEY);
      setExternalMedia(current?.externalMedia ?? false);
      setSettings(true);
    };
    window.addEventListener("donuts:cookie-settings", open);
    return () => window.removeEventListener("donuts:cookie-settings", open);
  }, [onChange, STORAGE_KEY]);

  function save(value: boolean) {
    const next: Consent = {
      version: 1,
      externalMedia: value,
      updatedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* The choice still applies to the current page. */
    }
    setConsent(next);
    setExternalMedia(value);
    onChange(value);
    setSettings(false);
  }

  if (!ready) return null;
  return (
    <>
      {!consent && !settings && (
        <aside
          className="donut-cookie-banner"
          role="region"
          aria-labelledby="cookie-title"
        >
          <div>
            <ShieldCheck aria-hidden="true" />
            <span>
              <strong id="cookie-title">
                Vos choix, sans miettes cachées.
              </strong>
              <small>
                Le panier, vos préférences et la session privée du compte
                utilisent uniquement le stockage strictement nécessaire. Google
                Maps ne se charge qu’avec votre accord. Aucun cookie
                publicitaire n’est installé.
              </small>
              <Link href="/cookies">En savoir plus</Link>
            </span>
          </div>
          <div className="donut-cookie-actions">
            <button
              className="donut-button outline"
              onClick={() => save(false)}
            >
              Tout refuser
            </button>
            <button
              className="donut-button dark"
              onClick={() => setSettings(true)}
            >
              <Settings2 size={17} /> Personnaliser
            </button>
            <button className="donut-button" onClick={() => save(true)}>
              Tout accepter
            </button>
          </div>
        </aside>
      )}
      {settings && (
        <div className="donut-cookie-overlay" role="presentation">
          <section
            className="donut-cookie-settings"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cookie-settings-title"
          >
            <button
              className="donut-cookie-close"
              aria-label="Fermer les préférences"
              onClick={() => setSettings(false)}
            >
              <X />
            </button>
            <p className="donut-kicker">CENTRE DE PRÉFÉRENCES</p>
            <h2 id="cookie-settings-title">
              Choisissez ce qui peut se charger.
            </h2>
            <div className="donut-cookie-choice">
              <span>
                <strong>Fonctionnement essentiel</strong>
                <small>
                  Panier, choix de consentement et cookie de session sécurisé du
                  compte client.
                </small>
              </span>
              <b>Toujours actif</b>
            </div>
            <label className="donut-cookie-choice">
              <span>
                <strong>Contenu externe Google Maps</strong>
                <small>
                  Autorise le chargement de la carte intégrée, susceptible de
                  transmettre des données techniques à Google.
                </small>
              </span>
              <input
                type="checkbox"
                checked={externalMedia}
                onChange={(event) => setExternalMedia(event.target.checked)}
              />
            </label>
            <button
              className="donut-button"
              onClick={() => save(externalMedia)}
            >
              Enregistrer mes choix
            </button>
          </section>
        </div>
      )}
    </>
  );
}

export function openCookieSettings() {
  window.dispatchEvent(new Event("donuts:cookie-settings"));
}
