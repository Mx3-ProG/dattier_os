"use client";
/**
 * Écran d'accueil de l'espace client, avant connexion.
 *
 * Le texte dépend du modèle de site : fidélité pour un commerce, lectures
 * pour un blog, formations pour une école, prestations pour les services.
 * Composant séparé pour rester lisible et testable sans le reste du compte.
 */
import { Gift, Sparkles } from "lucide-react";
import {
  accountSpaceGuestCopy,
  type AccountSpaceId,
} from "@/features/cms/account-space";

export function AccountGuestHero({ space }: { space: AccountSpaceId }) {
  const copy = accountSpaceGuestCopy[space];
  return (
    <div className="ca-guest-hero">
      <p className="ca-kicker">{copy.kicker}</p>
      <h1>{copy.title}</h1>
      <p className="ca-muted">{copy.text}</p>
      <ul className="ca-perks">
        {copy.perks.map(([title, detail]) => (
          <li key={title}>
            <Sparkles />{" "}
            <span>
              <b>{title}</b> {detail}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Bandeau d'invitation : un parrain offre un cadeau. */
export function AccountInvitation({
  referrer,
  welcome,
}: {
  referrer: string;
  welcome: string;
}) {
  return (
    <div className="ca-invite" role="status">
      <Gift />
      <span>
        <b>{referrer} vous invite !</b>
        {welcome
          ? ` Créez votre compte : ${welcome} sur votre première commande.`
          : " Créez votre compte pour rejoindre la maison."}
      </span>
    </div>
  );
}
