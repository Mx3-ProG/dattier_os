/* Lecture des quantités, prix, dates et horaires dans une phrase normalisée
   (voir text.ts › normalize). Tout est pensé pour la parole : « trois kilos »,
   « demain », « de 18 h à 23 h 30 », « 19 euros 50 ». */
import { numberWords } from "@/domain/assistant/text";

export type BaseUnit = "g" | "ml" | "unit";

const unitWords: [RegExp, BaseUnit, number][] = [
  [/^(kg|kgs|kilo|kilos|kilogramme|kilogrammes)$/, "g", 1000],
  [/^(g|gr|grs|gramme|grammes)$/, "g", 1],
  [/^(l|litre|litres)$/, "ml", 1000],
  [/^(cl|centilitre|centilitres)$/, "ml", 10],
  [/^(ml|millilitre|millilitres)$/, "ml", 1],
  [
    /^(piece|pieces|unite|unites|caisse|caisses|cagette|cagettes|barquette|barquettes|botte|bottes|boite|boites|sachet|sachets|bouteille|bouteilles|carton|cartons|pot|pots|paquet|paquets|douzaine|douzaines)$/,
    "unit",
    1,
  ],
];

const numberToken = (token: string) => {
  if (/^\d+(?:[.,]\d+)?$/.test(token)) return Number(token.replace(",", "."));
  return numberWords[token] ?? null;
};

/** Première quantité de la phrase : { quantité en unité de base, unité, texte restant }. */
export function parseAmount(text: string) {
  const tokens = text.split(" ");
  for (let i = 0; i < tokens.length; i++) {
    let value = numberToken(tokens[i]);
    if (value === null) continue;
    let end = i + 1;
    // « 1 kilo 500 », « deux kilos et demi »
    let unit: BaseUnit | null = null;
    let factor = 1;
    const fused = tokens[i].match(/^(\d+(?:[.,]\d+)?)(kg|g|l|cl|ml)$/);
    if (fused) value = Number(fused[1].replace(",", "."));
    const word = fused ? fused[2] : tokens[end];
    const known = word ? unitWords.find(([re]) => re.test(word)) : undefined;
    if (known) {
      [, unit, factor] = known;
      if (!fused) end++;
      if (/^douzaines?$/.test(word!)) factor = 12;
      if (tokens[end] === "et" && tokens[end + 1] === "demi") {
        value += 0.5;
        end += 2;
      }
    }
    const rest = [...tokens.slice(0, i), ...tokens.slice(end)].join(" ");
    return { quantity: value * factor, unit, rest, raw: tokens.slice(i, end).join(" ") };
  }
  return null;
}

/** Prix en centimes : « 19 euros », « 19,50 € », « 19 euros 50 », « 19e50 ». */
export function parseEuros(text: string) {
  const m =
    text.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:euros?|eur|e)\s*(\d{1,2})?\b/) ??
    text.match(/\ba\s+(\d+(?:[.,]\d{1,2})?)\b/);
  if (!m) return null;
  const whole = Number(m[1].replace(",", "."));
  const cents = m[2] ? Number(m[2].padEnd(2, "0")) : 0;
  return Math.round(whole * 100) + cents;
}

const weekdays = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/** Jour calendaire (AAAA-MM-JJ, heure de Paris) cité dans la phrase, ou null. */
export function parseDay(text: string, now: string) {
  const today = parisParts(now);
  const base = new Date(Date.UTC(today.year, today.month - 1, today.day));
  const shift = (days: number) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  if (/\bapres demain\b/.test(text)) return shift(2);
  if (/\bdemain\b/.test(text)) return shift(1);
  if (/\b(aujourd hui|ce soir|ce midi|maintenant|tout de suite)\b/.test(text)) return shift(0);
  const weekday = weekdays.findIndex((d) => new RegExp(`\\b${d}\\b`).test(text));
  if (weekday >= 0) {
    const delta = (weekday - base.getUTCDay() + 7) % 7 || 7;
    return shift(delta);
  }
  const numeric = text.match(/\b(\d{1,2})[/ ](\d{1,2})(?:[/ ](\d{2,4}))?\b/);
  if (numeric && Number(numeric[2]) <= 12) {
    const year = numeric[3] ? Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]) : today.year;
    return new Date(Date.UTC(year, Number(numeric[2]) - 1, Number(numeric[1]))).toISOString().slice(0, 10);
  }
  const dayOnly = text.match(/\b(?:le|du|au|dlc|jusqu au)\s+(\d{1,2})\b(?!\s*h)/);
  if (dayOnly) {
    const day = Number(dayOnly[1]);
    if (day >= 1 && day <= 31) {
      const month = day >= today.day ? today.month - 1 : today.month;
      return new Date(Date.UTC(today.year, month, day)).toISOString().slice(0, 10);
    }
  }
  return null;
}

export const addDays = (day: string, days: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Plage horaire : « de 18h à 23h30 », « 9 h - 15 h ». */
export function parseTimeRange(text: string) {
  const m = text.match(/(\d{1,2})\s*h\s*(\d{2})?\s*(?:a|-|jusqu a)\s*(\d{1,2})\s*h?\s*(\d{2})?/);
  if (!m) return null;
  return {
    start: [Number(m[1]), Number(m[2] ?? 0)] as const,
    end: [Number(m[3]), Number(m[4] ?? 0)] as const,
  };
}

/** Heure seule : « jusqu’à 22h », « à 14 h 30 ». */
export function parseHour(text: string) {
  const m = text.match(/(\d{1,2})\s*h\s*(\d{2})?/);
  return m ? ([Number(m[1]), Number(m[2] ?? 0)] as const) : null;
}

export function parisParts(iso: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

/** Instant ISO (UTC) correspondant à un jour et une heure de Paris. */
export function parisDateTime(day: string, hour: number, minute = 0) {
  const guess = Date.parse(
    `${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`,
  );
  const seen = parisParts(new Date(guess).toISOString());
  const offset =
    Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute) - guess;
  return new Date(guess - offset).toISOString();
}

export const frenchDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
