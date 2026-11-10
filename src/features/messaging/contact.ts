// Fonctions pures, partagées entre le serveur et l’écran Clients.

export type Channel = "email" | "sms";
export type Purpose = "relance" | "offre" | "information";

const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;

/** Adresse email exploitable, ou null. */
export function asEmail(value?: string | null): string | null {
  const v = value?.trim().toLowerCase();
  return v && v.length <= 254 && emailPattern.test(v) ? v : null;
}

/** Numéro de mobile au format international (+33…), ou null. Les numéros français à 10 chiffres sont convertis. */
export function asPhone(value?: string | null): string | null {
  if (!value || value.includes("@")) return null;
  let v = value.replace(/[\s.\-()]/g, "");
  if (v.startsWith("00")) v = `+${v.slice(2)}`;
  if (/^0[1-9]\d{8}$/.test(v)) v = `+33${v.slice(1)}`;
  return /^\+[1-9]\d{7,14}$/.test(v) ? v : null;
}

/** Les messages de relance et d’offre sont de la prospection : ils exigent l’accord du client. */
export const commercial = (p: Purpose) => p !== "information";

export const purposes: { id: Purpose; label: string; hint: string }[] = [
  { id: "relance", label: "Relancer", hint: "Faire revenir un client" },
  { id: "offre", label: "Offre", hint: "Partager un avantage" },
  { id: "information", label: "Information", hint: "Message de service" },
];

/** Mention d’opposition ajoutée aux messages commerciaux. */
export function optOut(channel: Channel) {
  return channel === "sms"
    ? "STOP : répondez STOP pour ne plus recevoir nos offres."
    : "Vous ne souhaitez plus recevoir nos offres ? Répondez simplement à ce message.";
}

export function draft(
  purpose: Purpose,
  channel: Channel,
  v: {
    firstName: string;
    restaurant: string;
    points: number;
    code?: string;
    discount?: string;
    link?: string;
  },
): { subject: string; body: string } {
  const hello = `Bonjour ${v.firstName},`;
  if (purpose === "relance")
    return {
      subject: `${v.restaurant} pense à vous`,
      body:
        channel === "sms"
          ? `${hello} ça fait un moment ! Toute l’équipe de ${v.restaurant} serait ravie de vous revoir.${v.points ? ` ${v.points} points fidélité vous attendent.` : ""}`
          : `${hello}\n\nCela fait un moment que nous ne vous avons pas vu, et toute l’équipe de ${v.restaurant} serait ravie de vous accueillir à nouveau.${v.points ? `\n\nVous avez ${v.points} points de fidélité qui vous attendent.` : ""}\n\nÀ très bientôt,\n${v.restaurant}`,
    };
  if (purpose === "offre") {
    const gift = v.code
      ? `votre code ${v.code}${v.discount ? ` (${v.discount} de remise)` : ""}`
      : "une attention de la maison";
    return {
      subject: `Une offre rien que pour vous chez ${v.restaurant}`,
      body:
        channel === "sms"
          ? `${hello} ${v.restaurant} vous offre ${gift}.${v.link ? ` ${v.link}` : ""}`
          : `${hello}\n\nPour vous remercier de votre fidélité, ${v.restaurant} vous offre ${gift}.${v.link ? `\n\nRetrouvez-le ici : ${v.link}` : ""}\n\nAu plaisir de vous recevoir,\n${v.restaurant}`,
    };
  }
  return {
    subject: `Information de ${v.restaurant}`,
    body: channel === "sms" ? `${hello} ` : `${hello}\n\n\n\n${v.restaurant}`,
  };
}
