/* Lecture des factures électroniques : XML Factur-X intégré au PDF, CII ou UBL seuls.
   Données certaines, sans IA ni coût. Le XML est lu sans résolution d’entités externes. */
import { XMLParser } from "fast-xml-parser";
import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFStream,
  PDFString,
} from "pdf-lib";
import { emptyDraft, type InvoiceDraft } from "./checks";

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  processEntities: false,
  parseTagValue: false,
  trimValues: true,
});
type Node = Record<string, unknown>;
const at = (node: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>((value, key) => {
    const current = Array.isArray(value) ? value[0] : value;
    return current && typeof current === "object"
      ? (current as Node)[key]
      : undefined;
  }, node);
const text = (value: unknown): string | null => {
  const first = Array.isArray(value) ? value[0] : value;
  if (first === undefined || first === null) return null;
  const raw =
    typeof first === "object" ? (first as Node)["#text"] : (first as unknown);
  return raw === undefined || raw === null || raw === ""
    ? null
    : String(raw).trim();
};
const cents = (value: unknown) => {
  const raw = text(value);
  if (raw === null || !/^-?\d+(\.\d+)?$/.test(raw)) return null;
  return Math.round(Number(raw) * 100);
};
const compactDate = (value: string | null) =>
  value && /^\d{8}$/.test(value)
    ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
    : null;

function fromCii(root: Node): InvoiceDraft {
  const tx = at(root, "SupplyChainTradeTransaction");
  const seller = at(tx, "ApplicableHeaderTradeAgreement", "SellerTradeParty");
  const settlement = at(tx, "ApplicableHeaderTradeSettlement");
  const sum = at(settlement, "SpecifiedTradeSettlementHeaderMonetarySummation");
  const registrations = at(seller, "SpecifiedTaxRegistration");
  return {
    ...emptyDraft(),
    supplierName: text(at(seller, "Name")),
    supplierVat: text(at(registrations, "ID")),
    number: text(at(root, "ExchangedDocument", "ID")),
    invoiceDate: compactDate(
      text(at(root, "ExchangedDocument", "IssueDateTime", "DateTimeString")),
    ),
    dueDate: compactDate(
      text(
        at(
          settlement,
          "SpecifiedTradePaymentTerms",
          "DueDateDateTime",
          "DateTimeString",
        ),
      ),
    ),
    net: cents(at(sum, "TaxBasisTotalAmount")),
    vat: cents(at(sum, "TaxTotalAmount")),
    gross: cents(at(sum, "GrandTotalAmount")),
  };
}
function fromUbl(root: Node): InvoiceDraft {
  const party = at(root, "AccountingSupplierParty", "Party");
  const total = at(root, "LegalMonetaryTotal");
  return {
    ...emptyDraft(),
    supplierName:
      text(at(party, "PartyLegalEntity", "RegistrationName")) ??
      text(at(party, "PartyName", "Name")),
    supplierVat: text(at(party, "PartyTaxScheme", "CompanyID")),
    number: text(at(root, "ID")),
    invoiceDate: text(at(root, "IssueDate")),
    dueDate: text(at(root, "DueDate")),
    net: cents(at(total, "TaxExclusiveAmount")),
    vat: cents(at(root, "TaxTotal", "TaxAmount")),
    gross: cents(at(total, "TaxInclusiveAmount")),
  };
}
/** Lit une facture CII ou UBL. Tout autre XML est ignoré. */
export function parseInvoiceXml(xml: string): InvoiceDraft | null {
  // Un document qui déclare des entités n’est pas une facture attendue.
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return null;
  let parsed: Node;
  try {
    parsed = parser.parse(xml) as Node;
  } catch {
    return null;
  }
  if (parsed.CrossIndustryInvoice)
    return fromCii(parsed.CrossIndustryInvoice as Node);
  if (parsed.Invoice) return fromUbl(parsed.Invoice as Node);
  return null;
}

const nameOf = (value: unknown) =>
  value instanceof PDFString || value instanceof PDFHexString
    ? value.decodeText()
    : "";
/** Parcourt les pièces jointes du PDF pour trouver le XML de la facture électronique. */
export async function factureXFromPdf(data: Uint8Array) {
  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(data, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
  } catch {
    return null;
  }
  const names = pdf.catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
  const tree = names?.lookupMaybe(PDFName.of("EmbeddedFiles"), PDFDict);
  if (!tree) return null;
  const nodes: PDFDict[] = [tree];
  while (nodes.length) {
    const node = nodes.pop()!;
    const kids = node.lookupMaybe(PDFName.of("Kids"), PDFArray);
    if (kids)
      for (let i = 0; i < kids.size(); i++) nodes.push(kids.lookup(i, PDFDict));
    const entries = node.lookupMaybe(PDFName.of("Names"), PDFArray);
    if (!entries) continue;
    for (let i = 0; i + 1 < entries.size(); i += 2) {
      const label = nameOf(entries.lookup(i)).toLowerCase();
      if (!/\.xml$/.test(label)) continue;
      const spec = entries.lookup(i + 1, PDFDict);
      const files = spec.lookupMaybe(PDFName.of("EF"), PDFDict);
      const stream = files?.lookup(PDFName.of("F"));
      if (!(stream instanceof PDFStream)) continue;
      const bytes =
        stream instanceof PDFRawStream
          ? decodePDFRawStream(stream).decode()
          : stream.getContents();
      const draft = parseInvoiceXml(Buffer.from(bytes).toString("utf8"));
      if (draft) return draft;
    }
  }
  return null;
}
