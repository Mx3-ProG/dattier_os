/**
 * Vocabulaire affiché selon la famille d'activité du commerce.
 *
 * Les textes du produit (guide, tutoriel, tableau de bord) ont été écrits pour la
 * restauration. `adaptText` les réécrit pour les autres métiers au moment de
 * l'affichage, en accordant les articles : « la table » devient « le poste »,
 * « du restaurant » devient « de l’établissement ». Pour un restaurant, le texte
 * est rendu tel quel.
 */
import type { Industry } from "./business";

type Gender = "m" | "f";
type Noun = {
  /** Singulier et pluriel d'origine (minuscules). */
  from: [string, string];
  /** Singulier et pluriel affichés. */
  to: [string, string];
  gender: Gender;
  /** Seuls ces déterminants déclenchent le remplacement (mots à double sens). */
  only?: readonly string[];
};

/** Nom du commerce pour chaque famille (tous masculins : les articles restent simples). */
const establishment: Record<Industry, [string, string]> = {
  restaurant: ["restaurant", "restaurants"],
  beauty: ["salon", "salons"],
  retail: ["commerce", "commerces"],
  construction: ["établissement", "établissements"],
  services: ["établissement", "établissements"],
  other: ["commerce", "commerces"],
};

export type BusinessTerms = {
  /** « restaurant », « salon », « commerce »… */
  establishment: string;
  /** Libellés de navigation des écrans opérationnels. */
  navigation: Partial<Record<string, string>>;
  /** Phrase d'accroche du tableau de bord. */
  welcome: { eyebrow: string; title: string; lead: string; caption: string };
};

export function businessTerms(industry: Industry | undefined): BusinessTerms {
  const kind = industry ?? "restaurant";
  if (kind === "restaurant")
    return {
      establishment: "restaurant",
      navigation: {},
      welcome: {
        eyebrow: "LE GOÛT DU TRAVAIL BIEN FAIT",
        title: "votre restaurant prend vie.",
        lead: "Un regard sur l’essentiel, du premier couvert au dernier thé.",
        caption: "L’ESPRIT STUDIO OS",
      },
    };
  const [name] = establishment[kind];
  return {
    establishment: name,
    navigation: {
      dining: "Plan de l’espace",
      kitchen: "Préparation",
      bar: "Comptoir",
      menu: "Catalogue",
      recipes: "Compositions",
    },
    welcome: {
      eyebrow: "LE GOÛT DU TRAVAIL BIEN FAIT",
      title: `votre ${name} prend vie.`,
      lead: "Un regard sur l’essentiel, du premier client au dernier rendez-vous.",
      caption: "L’ESPRIT STUDIO OS",
    },
  };
}

const nouns = (industry: Industry): Noun[] => [
  { from: ["restaurant", "restaurants"], to: establishment[industry], gender: "m" },
  { from: ["restauration", "restaurations"], to: ["activité", "activités"], gender: "f" },
  { from: ["table", "tables"], to: ["station", "stations"], gender: "f" },
  { from: ["salle", "salles"], to: ["espace", "espaces"], gender: "m" },
  // « carte » désigne aussi un bloc d'interface : seulement « la / votre / sa carte ».
  { from: ["carte", "cartes"], to: ["catalogue", "catalogues"], gender: "m", only: ["la", "de la", "à la", "votre", "sa", "notre", "leur", "cette"] },
  { from: ["cuisine", "cuisines"], to: ["préparation", "préparations"], gender: "f" },
  { from: ["bar", "bars"], to: ["comptoir", "comptoirs"], gender: "m" },
  { from: ["plat", "plats"], to: ["article", "articles"], gender: "m" },
  { from: ["couvert", "couverts"], to: ["client", "clients"], gender: "m" },
  { from: ["addition", "additions"], to: ["note", "notes"], gender: "f" },
  { from: ["recette", "recettes"], to: ["composition", "compositions"], gender: "f" },
];

/** Expressions à ne jamais réécrire (idiomes, noms propres, autres sens du mot). */
const protectedPhrases = [
  /à la carte/giu,
  /cartes? (?:bancaires?|de fidélité|cadeaux?|de crédit|grises?|vitales?)/giu,
  /carte (?:d’identité|d'identité)/giu,
  /Cuisine IA/gu,
  /hors service/giu,
  /tables? des matières/giu,
  /recettes? (?:du jour|de la journée|encaissées?|totales?)/giu,
];

/** Remplacements de phrases entières, prioritaires sur la règle générale. */
const phrases: [RegExp, string][] = [
  [/plans? de salle/giu, "plan de l’espace"],
  [/(?:établissements|commerces) de (?:la )?restauration/giu, "établissements"],
  [/en salle/giu, "sur place"],
  [/salle principale/giu, "espace principal"],
  [/carte active/giu, "catalogue actif"],
  [/toute la carte/giu, "tout le catalogue"],
  [/équipes? de salle/giu, "équipe d’accueil"],
  [/en cuisine/giu, "en préparation"],
  [/du premier couvert au dernier thé/giu, "du premier client au dernier rendez-vous"],
];

const vowel = (word: string) => /^[aeiouyhàâäéèêëîïôöùûü]/iu.test(word);
const L = "\\p{L}";

/** Déterminants reconnus devant un nom, avec leur nombre. */
const determiners =
  "l['’]|les|le|la|du|de la|de l['’]|des|de|d['’]|au|aux|à la|à l['’]|une|un|cette|cet|ce|ces|mon|ma|mes|votre|vos|notre|nos|son|sa|ses|leur|leurs|quelles|quels|quelle|quel|chaque|même";
const adjectives =
  "seule|seul|même|autre|nouvelle|nouvel|nouveau|première|premier|dernière|dernier|prochaine|prochain|bonne|bon";

function determiner(raw: string, gender: Gender, nextWord: string): string {
  const d = raw.toLowerCase().replace("'", "’");
  const v = vowel(nextWord);
  switch (d) {
    case "le": case "la": case "l’":
      return v ? "l’" : gender === "m" ? "le " : "la ";
    case "du": case "de la": case "de l’":
      return v ? "de l’" : gender === "m" ? "du " : "de la ";
    case "au": case "à la": case "à l’":
      return v ? "à l’" : gender === "m" ? "au " : "à la ";
    case "de": case "d’":
      return v ? "d’" : "de ";
    case "un": case "une":
      return gender === "m" ? "un " : "une ";
    case "ce": case "cet": case "cette":
      return gender === "f" ? "cette " : v ? "cet " : "ce ";
    case "mon": case "ma":
      return gender === "f" && !v ? "ma " : "mon ";
    case "son": case "sa":
      return gender === "f" && !v ? "sa " : "son ";
    case "quel": case "quelle":
      return gender === "m" ? "quel " : "quelle ";
    case "quels": case "quelles":
      return gender === "m" ? "quels " : "quelles ";
    default:
      return `${d} `;
  }
}

function adjective(raw: string, gender: Gender, nextWord: string): string {
  const a = raw.toLowerCase();
  const pairs: Record<string, [string, string]> = {
    seul: ["seul", "seule"], seule: ["seul", "seule"],
    nouveau: ["nouveau", "nouvelle"], nouvel: ["nouveau", "nouvelle"], nouvelle: ["nouveau", "nouvelle"],
    premier: ["premier", "première"], première: ["premier", "première"],
    dernier: ["dernier", "dernière"], dernière: ["dernier", "dernière"],
    prochain: ["prochain", "prochaine"], prochaine: ["prochain", "prochaine"],
    bon: ["bon", "bonne"], bonne: ["bon", "bonne"],
  };
  const pair = pairs[a];
  if (!pair) return a;
  const word = gender === "m" ? pair[0] : pair[1];
  return word === "nouveau" && vowel(nextWord) ? "nouvel" : word;
}

const capitalize = (source: string, target: string) =>
  source[0] && source[0] === source[0].toUpperCase() && source[0] !== source[0].toLowerCase()
    ? target[0].toUpperCase() + target.slice(1)
    : target;

const cache = new Map<string, string>();

/** Réécrit un texte rédigé pour la restauration avec le vocabulaire du métier. */
export function adaptText(text: string, industry: Industry | undefined): string {
  if (!text || !industry || industry === "restaurant") return text;
  const key = industry + "\u0000" + text;
  const known = cache.get(key);
  if (known !== undefined) return known;
  const kept: string[] = [];
  let out = text;
  for (const pattern of protectedPhrases)
    out = out.replace(pattern, (match) => `\u0001${kept.push(match) - 1}\u0002`);
  for (const [pattern, replacement] of phrases)
    out = out.replace(pattern, (match) => capitalize(match, replacement));
  for (const noun of nouns(industry)) {
    const words = `${noun.from[1]}|${noun.from[0]}`;
    const pattern = new RegExp(
      `(?<![${L}])(?:(${determiners})(\\s+|(?<=['’]))(?:(${adjectives})\\s+)?)?(${words})(?![${L}\\-])`,
      "giu",
    );
    out = out.replace(pattern, (match, det: string | undefined, _space, adj: string | undefined, word: string) => {
      if (noun.only && !(det && noun.only.includes(det.toLowerCase()))) return match;
      const plural = word.toLowerCase() === noun.from[1];
      const target = noun.to[plural ? 1 : 0];
      const adjText = adj ? adjective(adj, noun.gender, target) : "";
      const head = adjText || target;
      const detText = !det ? ""
        : !plural || /^quel/iu.test(det) ? determiner(det, noun.gender, head)
        : `${det.toLowerCase().replace("'", "’")} `;
      const rebuilt = `${detText}${adjText ? adjText + " " : ""}${target}`;
      return capitalize(match, rebuilt);
    });
  }
  out = out.replace(/\u0001(\d+)\u0002/g, (_m, i: string) => kept[Number(i)]);
  if (cache.size > 5000) cache.clear();
  cache.set(key, out);
  return out;
}

/** Applique `adaptText` à toutes les chaînes d'un objet, sauf aux champs techniques. */
export function adaptTexts<T>(value: T, industry: Industry | undefined, skip: ReadonlySet<string> = technicalFields): T {
  if (!industry || industry === "restaurant") return value;
  const walk = (v: unknown, field?: string): unknown => {
    if (typeof v === "string") return field && skip.has(field) ? v : adaptText(v, industry);
    if (Array.isArray(v)) return v.map((item) => walk(item, field));
    if (v && typeof v === "object")
      return Object.fromEntries(Object.entries(v).map(([k, item]) => [k, walk(item, k)]));
    return v;
  };
  return walk(value) as T;
}

/** Identifiants, sélecteurs et liens : jamais traduits. */
const technicalFields = new Set(["id", "icon", "module", "target", "page", "href", "permission"]);
