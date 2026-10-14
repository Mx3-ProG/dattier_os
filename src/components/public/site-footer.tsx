import Link from "next/link";
import { MapPin, Phone } from "lucide-react";
import type { Restaurant } from "@/lib/types";
import { Brand } from "./site-header";
import { fullNav, legalNav, secondaryNav } from "./navigation";

export function SiteFooter({ restaurant }: { restaurant?: Restaurant }) {
  return (
    <footer className="public-footer">
      <div className="public-footer-grid">
        <div className="public-footer-brand">
          <Brand tagline="LA GÉNÉROSITÉ EN HÉRITAGE · TEXTE DÉMO" />
          {restaurant && (
            <address>
              <span className="with-icon">
                <MapPin size={16} aria-hidden /> {restaurant.address}
              </span>
              <a
                className="with-icon"
                href={`tel:${restaurant.phone.replaceAll(" ", "")}`}
              >
                <Phone size={16} aria-hidden /> {restaurant.phone}
              </a>
              <span>Horaires à confirmer auprès de l’établissement.</span>
            </address>
          )}
        </div>
        <nav aria-label="Plan du site">
          <h2 className="eyebrow">Le restaurant</h2>
          {fullNav.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
        </nav>
        <nav aria-label="Informations">
          <h2 className="eyebrow">Informations</h2>
          {[...secondaryNav, ...legalNav].map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
      <small>© Dattier OS · Démonstration non publiée</small>
    </footer>
  );
}
