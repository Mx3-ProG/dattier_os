/* Outils de langue française du moteur réflexe : normalisation, nombres en
   lettres, rapprochement approximatif des mots (pluriels, fautes de frappe). */

export function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’'`]/g, " ")
    .replace(/œ/g, "oe")
    .replace(/€/g, " euros ")
    .replace(/%/g, " pourcent ")
    .replace(/[^a-z0-9+,\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const numberWords: Record<string, number> = {
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  onze: 11,
  douze: 12,
  quinze: 15,
  vingt: 20,
};

export const stopwords = new Set([
  "a",
  "au",
  "aux",
  "de",
  "d",
  "du",
  "des",
  "la",
  "le",
  "les",
  "l",
  "et",
  "en",
  "pour",
  "sur",
  "avec",
  "s",
  "il",
  "te",
  "me",
  "moi",
  "nous",
  "vous",
  "plait",
  "stp",
  "svp",
  "merci",
  "peux",
  "tu",
  "veux",
  "voudrais",
  "faire",
  "fais",
  "fait",
  "cree",
  "creer",
  "commande",
  "commander",
  "nouvelle",
  "ajoute",
  "ajouter",
  "rajoute",
  "mets",
  "mettre",
  "note",
  "noter",
  "prends",
  "prendre",
  "envoie",
  "envoyer",
  "lance",
  "lancer",
  "table",
  "numero",
  "no",
  "n",
  "x",
  "fois",
  "portion",
  "portions",
  "assiette",
  "assiettes",
  "un",
  "une",
  "ce",
  "cette",
  "qui",
  "que",
  "quoi",
  "est",
  "c",
  "y",
]);

export const singular = (word: string) =>
  word.length > 3 ? word.replace(/(aux|x|s)$/, (m) => (m === "aux" ? "al" : "")) : word;

function distance(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previous = current;
    }
  }
  return row[b.length];
}

/** Deux mots désignent-ils la même chose (pluriel, faute légère, préfixe) ? */
export function sameWord(a: string, b: string) {
  if (a === b) return true;
  const x = singular(a),
    y = singular(b);
  if (x === y) return true;
  const shortest = Math.min(x.length, y.length);
  if (shortest >= 5 && distance(x, y) <= 1) return true;
  if (shortest >= 4 && (x.startsWith(y) || y.startsWith(x)))
    return Math.abs(x.length - y.length) <= 2;
  return false;
}

export const words = (value: string) =>
  normalize(value)
    .split(" ")
    .filter((w) => w && !stopwords.has(w) && !/^\d+$/.test(w));

/** Score de 0 à 1 : à quel point `query` désigne `label`. */
export function similarity(query: string[], label: string) {
  const target = words(label);
  if (!target.length || !query.length) return 0;
  const matchedTarget = target.filter((t) => query.some((q) => sameWord(q, t)));
  const matchedQuery = query.filter((q) => target.some((t) => sameWord(q, t)));
  if (!matchedTarget.length) return 0;
  return (
    0.6 * (matchedTarget.length / target.length) +
    0.4 * (matchedQuery.length / query.length)
  );
}

export const euros = (cents: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );

export const hour = (iso: string) =>
  new Date(iso).toLocaleTimeString("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  });

export const parisDay = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
