"use client";
import { useState } from "react";
import type { Presentation } from "@/features/cms/schema";
import { TenantLink as Link } from "./context";

export function TemplateExtras({
  presentation: p,
  shopEnabled,
  cartVisible,
}: {
  presentation?: Presentation;
  shopEnabled: boolean;
  cartVisible: boolean;
}) {
  const [surprise, setSurprise] = useState(false);
  if (!p) return null;
  return (
    <>
      {p.surprise && (
        <div className="template-surprise">
          <button
            type="button"
            aria-expanded={surprise}
            aria-controls="template-secret"
            onClick={() => setSurprise(!surprise)}
          >
            {surprise
              ? "Refermer le clin d’œil ✦"
              : "Le petit secret de la maison ✦"}
          </button>
          {surprise && (
            <p id="template-secret" role="status">
              {
                {
                  signature:
                    "L’ingrédient secret ? Le plaisir de vous recevoir.",
                  riviera: "Prévision du jour : grand soleil dans l’assiette.",
                  atelier: "Derrière chaque détail, une bonne dose de passion.",
                  escale:
                    "Votre prochaine destination se trouve dans la carte.",
                  bistrot: "Bienvenue à notre table.",
                  jardin: "La gourmandise prend racine ici.",
                  comptoir: "Les bonnes choses se partagent.",
                  pause: "Il est toujours l’heure d’une pause.",
                }[p.layout]
              }
            </p>
          )}
        </div>
      )}
      {p.stickyAction !== "none" && !cartVisible && (
        <nav className="template-action-bar" aria-label="Accès rapide">
          <Link href="/carte">Voir la carte</Link>
          <Link
            className="donut-button compact"
            href={
              p.stickyAction === "reserve"
                ? "/reservations"
                : shopEnabled
                  ? "/commander"
                  : "/contact"
            }
          >
            {p.stickyAction === "reserve"
              ? "Réserver une table"
              : shopEnabled
                ? "Commander"
                : "Nous contacter"}{" "}
            ↗
          </Link>
        </nav>
      )}
    </>
  );
}
