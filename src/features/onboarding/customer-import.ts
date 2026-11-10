import { randomUUID } from "node:crypto";
import type { DB } from "@/lib/database/types";
import { rows } from "@/lib/database/db";

export type ParsedCsv = { headers: string[]; rows: string[][] };
export function parseCustomerCsv(raw: string): ParsedCsv {
  if (Buffer.byteLength(raw,"utf8") > 5_000_000) throw new Error("Fichier limité à 5 Mo.");
  const input = raw.replace(/^\uFEFF/,"");
  const first = input.split(/\r?\n/,1)[0] ?? "";
  const separator = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const result: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let i=0;i<input.length;i++) {
    const char=input[i];
    if (quoted) {
      if (char === '"' && input[i+1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted=false;
      else field+=char;
    } else if (char === '"') { if (field) throw new Error("Guillemets CSV mal placés."); quoted=true; }
    else if (char === separator) { row.push(field.trim()); field=""; }
    else if (char === "\n") { row.push(field.trim()); if (row.some(Boolean)) result.push(row); row=[]; field=""; }
    else if (char !== "\r") field+=char;
  }
  if (quoted) throw new Error("Guillemets CSV non fermés.");
  row.push(field.trim()); if (row.some(Boolean)) result.push(row);
  if (result.length < 2) throw new Error("Le fichier doit contenir un en-tête et au moins un client.");
  if (result.length > 5001) throw new Error("Fichier limité à 5 000 clients.");
  const headers=result.shift()!;
  if (headers.length > 50 || headers.some((item) => !item)) throw new Error("En-têtes CSV invalides.");
  if (result.some((item) => item.length !== headers.length)) throw new Error("Certaines lignes n’ont pas le même nombre de colonnes.");
  return { headers, rows: result };
}
export const normalizedContact = (value: string) =>
  value.includes("@") ? value.trim().toLowerCase() : value.replace(/[^\d+]/g,"");
export async function customerImport(db: DB, restaurant: string, input: {
  csv: string; nameColumn: number; contactColumn: number; commit: boolean;
}) {
  const parsed=parseCustomerCsv(input.csv);
  const { nameColumn,contactColumn }=input;
  if (!Number.isInteger(nameColumn) || !Number.isInteger(contactColumn) || nameColumn === contactColumn ||
    nameColumn<0 || contactColumn<0 || nameColumn>=parsed.headers.length || contactColumn>=parsed.headers.length)
    throw new Error("Choisissez les colonnes du nom et du contact.");
  if (input.commit) await db.query("SELECT id FROM restaurants WHERE id=$1 FOR UPDATE",[restaurant]);
  const existing=await rows<{contact:string}>(db,"SELECT contact FROM customers WHERE restaurant_id=$1",[restaurant]);
  const seen=new Set(existing.map((item)=>normalizedContact(item.contact)).filter(Boolean));
  const valid: { name:string; contact:string }[]=[];
  const issues: { line:number; reason:string }[]=[];
  for (const [index,row] of parsed.rows.entries()) {
    const name=row[nameColumn]?.trim() ?? ""; const contact=row[contactColumn]?.trim() ?? "";
    const key=normalizedContact(contact);
    if (!name || name.length>150 || !contact || contact.length>150 || key.length<5) {
      issues.push({line:index+2,reason:"Nom ou contact manquant ou invalide."}); continue;
    }
    if (seen.has(key)) { issues.push({line:index+2,reason:"Contact déjà présent ou répété dans le fichier."}); continue; }
    seen.add(key); valid.push({name,contact});
  }
  if (input.commit) for (const customer of valid)
    await db.query("INSERT INTO customers(id,restaurant_id,name,contact,consent,points) VALUES($1,$2,$3,$4,false,0)",
      [randomUUID(),restaurant,customer.name,customer.contact]);
  return { headers:parsed.headers, sample:parsed.rows.slice(0,5), total:parsed.rows.length,
    ready:valid.length, skipped:issues.length, issues:issues.slice(0,100),
    created:input.commit ? valid.length : 0 };
}
