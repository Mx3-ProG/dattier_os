/* Lecture des relevés bancaires : CSV de banque française, OFX et CAMT.053.
   Ce qui est ambigu est refusé plutôt que deviné : un montant ou une date mal lus
   fausseraient la trésorerie sans que personne ne le voie. */
import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { normalize } from "@/domain/shared/text";

export type Movement = {
  bookedOn: string;
  amount: number;
  label: string;
  /** Identifiant fourni par la banque, s’il existe. */
  externalId: string | null;
};
export type Statement = {
  format: "csv" | "ofx" | "camt053";
  movements: Movement[];
  balance: number | null;
  balanceDate: string | null;
  ibanEnd: string | null;
};
export const maxMovements = 5000;

/** « 1 234,56 », « -12.50 », « 1,234.56 » : le dernier séparateur est la décimale. */
export function parseAmount(raw: string): number | null {
  const clean = raw.replace(/[\s  €]|EUR/gi, "").replace(/^\+/, "");
  if (!clean) return null;
  const negative = /^-|-$|^\(.*\)$/.test(clean);
  const digits = clean.replace(/[-()]/g, "");
  if (!/^\d[\d.,']*$/.test(digits)) return null;
  const last = Math.max(digits.lastIndexOf(","), digits.lastIndexOf("."));
  const decimals = last >= 0 && digits.length - last - 1 <= 2;
  const whole = (decimals ? digits.slice(0, last) : digits).replace(
    /[.,']/g,
    "",
  );
  const fraction = decimals ? digits.slice(last + 1).padEnd(2, "0") : "00";
  const cents = Number(whole || "0") * 100 + Number(fraction);
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}
const validIso = (y: string, m: string, d: string) => {
  const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === iso
    ? iso
    : null;
};
/** Formats français et ISO. Le format américain n’est pas supposé : le mois vient en second. */
export function parseDate(raw: string): string | null {
  const v = raw.trim();
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return validIso(m[1], m[2], m[3]);
  m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return validIso(m[3], m[2], m[1]);
  m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2})$/);
  if (m) return validIso(`20${m[3]}`, m[2], m[1]);
  m = v.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return validIso(m[1], m[2], m[3]);
  return null;
}
const decode = (data: Buffer) => {
  try {
    return new TextDecoder("utf-8", { fatal: true })
      .decode(data)
      .replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(data);
  }
};

function splitCsvLine(line: string, separator: string) {
  const cells: string[] = [];
  let current = "",
    quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === separator && !quoted) {
      cells.push(current.trim());
      current = "";
    } else current += c;
  }
  cells.push(current.trim());
  return cells;
}
const aliases = {
  date: /^(date( (d )?(operation|comptabilisation|compta|valeur))?|date op\w*|booking date)$/,
  label:
    /^(libelle( (simplifie|operation))?|designation|description|intitule|nature( de l operation)?|motif|operation)$/,
  amount: /^(montant( (eur|euro|euros|en euros))?|amount|valeur)$/,
  debit: /^(debit( (eur|euro|euros))?|montant debit)$/,
  credit: /^(credit( (eur|euro|euros))?|montant credit)$/,
};
const find = (headers: string[], re: RegExp) =>
  headers.findIndex((h) => re.test(h));

function parseCsv(text: string): Statement {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  // Les banques ajoutent souvent quelques lignes avant l’en-tête.
  for (let start = 0; start < Math.min(lines.length, 25); start++) {
    const separator = [";", "\t", ","].find((s) => {
      const headers = splitCsvLine(lines[start], s).map(normalize);
      return (
        find(headers, aliases.date) >= 0 &&
        (find(headers, aliases.amount) >= 0 ||
          (find(headers, aliases.debit) >= 0 &&
            find(headers, aliases.credit) >= 0))
      );
    });
    if (!separator) continue;
    const headers = splitCsvLine(lines[start], separator).map(normalize);
    const col = {
      date: find(headers, aliases.date),
      label: find(headers, aliases.label),
      amount: find(headers, aliases.amount),
      debit: find(headers, aliases.debit),
      credit: find(headers, aliases.credit),
    };
    const movements: Movement[] = [];
    lines.slice(start + 1).forEach((line, n) => {
      const cells = splitCsvLine(line, separator);
      if (cells.every((c) => !c)) return;
      const bookedOn = parseDate(cells[col.date] ?? "");
      // Les lignes de total n’ont pas de date : elles ne sont pas des mouvements.
      if (!cells[col.date] || (!bookedOn && !/\d/.test(cells[col.date])))
        return;
      if (!bookedOn)
        throw new Error(
          `Ligne ${start + n + 2} : date illisible « ${cells[col.date]} ».`,
        );
      let amount: number | null;
      if (col.amount >= 0) amount = parseAmount(cells[col.amount] ?? "");
      else {
        const debit = parseAmount(cells[col.debit] ?? ""),
          credit = parseAmount(cells[col.credit] ?? "");
        amount =
          debit !== null && debit !== 0
            ? -Math.abs(debit)
            : credit !== null
              ? Math.abs(credit)
              : null;
      }
      if (amount === null)
        throw new Error(`Ligne ${start + n + 2} : montant illisible.`);
      if (amount === 0) return;
      movements.push({
        bookedOn,
        amount,
        label: (col.label >= 0 ? cells[col.label] : "") || "Sans libellé",
        externalId: null,
      });
    });
    return {
      format: "csv",
      movements,
      balance: null,
      balanceDate: null,
      ibanEnd: null,
    };
  }
  throw new Error(
    "Colonnes non reconnues : le fichier doit contenir une date et un montant (ou débit et crédit).",
  );
}

const ofxTag = (block: string, tag: string) =>
  block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"))?.[1]?.trim() ?? null;
function parseOfx(text: string): Statement {
  const movements: Movement[] = [];
  for (const block of text.match(
    /<STMTTRN>[\s\S]*?(?:<\/STMTTRN>|(?=<STMTTRN>)|(?=<\/BANKTRANLIST>))/gi,
  ) ?? []) {
    const bookedOn = parseDate(ofxTag(block, "DTPOSTED") ?? "");
    const amount = parseAmount(ofxTag(block, "TRNAMT") ?? "");
    if (!bookedOn || amount === null)
      throw new Error(
        "Relevé OFX : un mouvement n’a pas de date ou de montant lisible.",
      );
    if (amount === 0) continue;
    movements.push({
      bookedOn,
      amount,
      label:
        [ofxTag(block, "NAME"), ofxTag(block, "MEMO")]
          .filter(Boolean)
          .join(" ") || "Sans libellé",
      externalId: ofxTag(block, "FITID"),
    });
  }
  const currency = ofxTag(text, "CURDEF");
  if (currency && currency.toUpperCase() !== "EUR")
    throw new Error("Seuls les relevés en euros sont acceptés.");
  const ledger = text.match(
    /<LEDGERBAL>[\s\S]*?(?:<\/LEDGERBAL>|(?=<AVAILBAL>)|$)/i,
  )?.[0];
  const account = ofxTag(text, "ACCTID");
  return {
    format: "ofx",
    movements,
    balance: ledger ? parseAmount(ofxTag(ledger, "BALAMT") ?? "") : null,
    balanceDate: ledger ? parseDate(ofxTag(ledger, "DTASOF") ?? "") : null,
    ibanEnd: account
      ? account.replace(/\s/g, "").slice(-4).toUpperCase()
      : null,
  };
}

const camtParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
  processEntities: false,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => ["Stmt", "Ntry", "Bal", "TxDtls", "Ustrd"].includes(name),
});
type Node = Record<string, unknown>;
const get = (node: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>((value, key) => {
    const current = Array.isArray(value) ? value[0] : value;
    return current && typeof current === "object"
      ? (current as Node)[key]
      : undefined;
  }, node);
const str = (value: unknown): string | null => {
  const first = Array.isArray(value) ? value[0] : value;
  if (first === undefined || first === null) return null;
  const raw = typeof first === "object" ? (first as Node)["#text"] : first;
  return raw === undefined || raw === null || raw === ""
    ? null
    : String(raw).trim();
};
function signed(node: unknown) {
  const amount = parseAmount(str(get(node, "Amt")) ?? "");
  const currency = (get(node, "Amt") as Node | undefined)?.["@Ccy"];
  if (currency && currency !== "EUR")
    throw new Error("Seuls les relevés en euros sont acceptés.");
  if (amount === null) return null;
  return str(get(node, "CdtDbtInd")) === "DBIT"
    ? -Math.abs(amount)
    : Math.abs(amount);
}
function parseCamt(text: string): Statement {
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    throw new Error("Relevé XML refusé : il déclare des entités.");
  const root = camtParser.parse(text) as Node;
  const statements = (get(root, "Document", "BkToCstmrStmt", "Stmt") ??
    []) as Node[];
  const movements: Movement[] = [];
  let balance: number | null = null,
    balanceDate: string | null = null,
    ibanEnd: string | null = null;
  for (const statement of Array.isArray(statements)
    ? statements
    : [statements]) {
    const iban = str(get(statement, "Acct", "Id", "IBAN"));
    if (iban) ibanEnd = iban.replace(/\s/g, "").slice(-4).toUpperCase();
    for (const bal of (statement.Bal ?? []) as Node[]) {
      const code = str(get(bal, "Tp", "CdOrPrtry", "Cd"));
      const when = parseDate(
        str(get(bal, "Dt", "Dt")) ?? str(get(bal, "Dt", "DtTm")) ?? "",
      );
      if (code === "CLBD" && when && (!balanceDate || when >= balanceDate)) {
        balance = signed(bal);
        balanceDate = when;
      }
    }
    for (const entry of (statement.Ntry ?? []) as Node[]) {
      const status = str(get(entry, "Sts")) ?? str(get(entry, "Sts", "Cd"));
      // Une écriture en attente n’est pas encore un mouvement du compte.
      if (status && status !== "BOOK") continue;
      const bookedOn = parseDate(
        str(get(entry, "BookgDt", "Dt")) ??
          str(get(entry, "BookgDt", "DtTm")) ??
          "",
      );
      const amount = signed(entry);
      if (!bookedOn || amount === null)
        throw new Error(
          "Relevé CAMT : un mouvement n’a pas de date ou de montant lisible.",
        );
      if (amount === 0) continue;
      const detail = get(entry, "NtryDtls", "TxDtls");
      const remittance = get(detail, "RmtInf", "Ustrd");
      movements.push({
        bookedOn,
        amount,
        label:
          [str(get(entry, "AddtlNtryInf")), str(remittance)]
            .filter(Boolean)
            .join(" ") || "Sans libellé",
        externalId:
          str(get(entry, "AcctSvcrRef")) ?? str(get(entry, "NtryRef")),
      });
    }
  }
  return { format: "camt053", movements, balance, balanceDate, ibanEnd };
}

export function parseStatement(data: Buffer): Statement {
  const text = decode(data);
  const head = text.slice(0, 2000);
  const statement = /BkToCstmrStmt/.test(text)
    ? parseCamt(text)
    : /OFXHEADER|<OFX>/i.test(head)
      ? parseOfx(text)
      : parseCsv(text);
  if (!statement.movements.length)
    throw new Error("Aucun mouvement trouvé dans ce relevé.");
  if (statement.movements.length > maxMovements)
    throw new Error(
      `Relevé trop long : ${maxMovements} mouvements au maximum.`,
    );
  return statement;
}

/**
 * Clé de doublon. Sans identifiant de banque, le rang distingue deux opérations identiques
 * le même jour dans un relevé, et un relevé qui chevauche le précédent retombe sur les mêmes clés.
 */
export function withKeys(movements: Movement[]) {
  const seen = new Map<string, number>();
  return movements.map((m) => {
    const base = `${m.bookedOn}|${m.amount}|${normalize(m.label).replace(/[^a-z0-9]/g, "")}`;
    const rank = (seen.get(base) ?? 0) + 1;
    seen.set(base, rank);
    return {
      ...m,
      key: createHash("sha256")
        .update(m.externalId ? `id|${m.externalId}` : `${base}|${rank}`)
        .digest("hex"),
    };
  });
}
