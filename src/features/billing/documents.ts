/* Rendu d’une facture émise : PDF lisible, XML structuré et écritures au format FEC.
   Le PDF n’est pas une facture électronique. Le XML suit la structure CII sans validation
   officielle : il prépare la transmission par une plateforme agréée, sans la remplacer. */
import { PDFDocument, rgb, StandardFonts, type PDFFont } from "pdf-lib";

export type DocumentCompany = {
  legal_name: string;
  legal_form: string;
  address: string;
  siren: string;
  vat_number: string | null;
  share_capital: string;
  rcs: string;
  late_penalty: string;
};
export type DocumentLine = {
  label: string;
  quantity: number;
  unit_gross: number;
  line_gross: number;
  rate_bp: number;
};
export type DocumentInvoice = {
  kind: "invoice" | "credit_note";
  number: string;
  customer_name: string;
  customer_address: string;
  customer_siren: string | null;
  customer_vat: string | null;
  is_business: boolean;
  service_date: string;
  issue_date: string;
  due_date: string | null;
  net: number;
  vat: number;
  gross: number;
  vat_regime: string;
  note: string;
  company: DocumentCompany;
  lines: DocumentLine[];
  taxes: { rate_bp: number; net: number; vat: number }[];
  credited_number: string | null;
  paid: boolean;
};
export const franchiseMention = "TVA non applicable, art. 293 B du CGI";

const euro = (cents: number) =>
  `${(cents / 100)
    .toFixed(2)
    .replace(".", ",")
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ")} EUR`;
const frDate = (iso: string) => iso.split("-").reverse().join("/");
const percent = (bp: number) => `${(bp / 100).toString().replace(".", ",")} %`;
/** Les polices standard du PDF ne couvrent que WinAnsi : le reste est remplacé, jamais bloquant. */
const safe = (text: string) =>
  text.replace(/[  ]/g, " ").replace(/[^\x20-\x7e¡-ÿ€’‘“”–—…œŒ]/g, "?");

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const paragraph of safe(text).split(/\r?\n/)) {
    let current = "";
    for (const word of paragraph.split(" ")) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && current) {
        lines.push(current);
        current = word;
      } else current = next;
    }
    lines.push(current);
  }
  return lines;
}

/** Prix unitaire hors TVA, arrondi au centime, déduit du prix TTC saisi. */
export const unitNet = (unitGross: number, rateBp: number) =>
  Math.round((unitGross * 10000) / (10000 + rateBp));

export async function invoicePdf(i: DocumentInvoice) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(i.number);
  pdf.setProducer("STUDIO OS");
  pdf.setCreator("STUDIO OS");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 50,
    width = 495;
  let page = pdf.addPage([595, 842]);
  let y = 792;
  const fresh = (needed: number) => {
    if (y - needed < 60) {
      page = pdf.addPage([595, 842]);
      y = 792;
    }
  };
  const text = (
    value: string,
    options: {
      x?: number;
      size?: number;
      font?: PDFFont;
      advance?: number;
      color?: number;
    } = {},
  ) => {
    const size = options.size ?? 9.5;
    page.drawText(safe(value), {
      x: options.x ?? margin,
      y,
      size,
      font: options.font ?? regular,
      color: rgb(
        options.color ?? 0.1,
        options.color ?? 0.1,
        options.color ?? 0.1,
      ),
    });
    if (options.advance !== 0) y -= options.advance ?? size + 4;
  };
  const block = (
    value: string,
    size = 9.5,
    font = regular,
    boxWidth = width,
  ) => {
    for (const line of wrap(value, font, size, boxWidth)) {
      fresh(size + 4);
      text(line, { size, font });
    }
  };
  const right = (value: string, edge: number, font = regular, size = 9.5) =>
    page.drawText(safe(value), {
      x: edge - font.widthOfTextAtSize(safe(value), size),
      y,
      size,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });

  const c = i.company;
  text(c.legal_name + (c.legal_form ? ` ${c.legal_form}` : ""), {
    size: 13,
    font: bold,
    advance: 17,
  });
  block(c.address);
  text(
    `SIREN ${c.siren}${c.rcs ? ` · ${c.rcs}` : ""}${c.share_capital ? ` · Capital ${c.share_capital}` : ""}`,
  );
  if (c.vat_number) text(`TVA intracommunautaire : ${c.vat_number}`);
  y -= 14;
  text(`${i.kind === "invoice" ? "FACTURE" : "AVOIR"} ${i.number}`, {
    size: 15,
    font: bold,
    advance: 20,
  });
  text(`Date d’émission : ${frDate(i.issue_date)}`);
  text(`Date de la vente ou de la prestation : ${frDate(i.service_date)}`);
  if (i.credited_number) text(`Avoir sur la facture ${i.credited_number}`);
  if (i.kind === "invoice" && i.due_date)
    text(`Échéance : ${frDate(i.due_date)}`);
  y -= 10;
  text("Client", { font: bold });
  block(i.customer_name);
  if (i.customer_address) block(i.customer_address);
  if (i.customer_siren) text(`SIREN ${i.customer_siren}`);
  if (i.customer_vat) text(`TVA intracommunautaire : ${i.customer_vat}`);
  y -= 14;

  const columns = { qty: 340, unit: 410, rate: 455, total: 545 };
  const header = () => {
    text("Désignation", { font: bold, advance: 0 });
    right("Qté", columns.qty, bold);
    right("PU HT", columns.unit, bold);
    right("TVA", columns.rate, bold);
    right("Total TTC", columns.total, bold);
    y -= 6;
    page.drawLine({
      start: { x: margin, y },
      end: { x: columns.total, y },
      thickness: 0.6,
      color: rgb(0.6, 0.6, 0.6),
    });
    y -= 13;
  };
  header();
  for (const line of i.lines) {
    const labels = wrap(line.label, regular, 9.5, 240);
    fresh(labels.length * 13 + 8);
    labels.forEach((label, n) => {
      text(label, { advance: 0 });
      if (n === 0) {
        right(String(Number(line.quantity)).replace(".", ","), columns.qty);
        right(euro(unitNet(line.unit_gross, line.rate_bp)), columns.unit);
        right(percent(line.rate_bp), columns.rate);
        right(euro(line.line_gross), columns.total);
      }
      y -= 13;
    });
  }
  y -= 8;
  fresh(40 + i.taxes.length * 14);
  if (i.vat_regime === "franchise") text(franchiseMention);
  else
    for (const t of i.taxes) {
      text(`TVA ${percent(t.rate_bp)} sur ${euro(t.net)} HT`, { advance: 0 });
      right(euro(t.vat), columns.total);
      y -= 14;
    }
  y -= 4;
  text("Total HT", { advance: 0, font: bold });
  right(euro(i.net), columns.total, bold);
  y -= 14;
  text("Total TVA", { advance: 0, font: bold });
  right(euro(i.vat), columns.total, bold);
  y -= 14;
  text("Total TTC", { advance: 0, font: bold, size: 11 });
  right(euro(i.gross), columns.total, bold, 11);
  y -= 22;
  if (i.kind === "invoice" && i.paid) text("Facture acquittée.");
  if (i.note) block(i.note);
  if (i.kind === "invoice" && i.is_business) {
    y -= 4;
    block(c.late_penalty, 8);
  }
  return Buffer.from(await pdf.save());
}

const xml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
const amount = (cents: number) => (cents / 100).toFixed(2);
const compact = (iso: string) => iso.replaceAll("-", "");

/** Structure CII de la facture. Non validée par un outil officiel. */
export function invoiceXml(i: DocumentInvoice) {
  const c = i.company;
  const category = (bp: number) => (bp === 0 ? "E" : "S");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext><ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:factur-x.eu:1p0:basicwl</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument><ram:ID>${xml(i.number)}</ram:ID><ram:TypeCode>${i.kind === "invoice" ? "380" : "381"}</ram:TypeCode><ram:IssueDateTime><udt:DateTimeString format="102">${compact(i.issue_date)}</udt:DateTimeString></ram:IssueDateTime></rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty><ram:Name>${xml(c.legal_name)}</ram:Name><ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${xml(c.siren)}</ram:ID></ram:SpecifiedLegalOrganization><ram:PostalTradeAddress><ram:LineOne>${xml(c.address)}</ram:LineOne><ram:CountryID>FR</ram:CountryID></ram:PostalTradeAddress>${c.vat_number ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${xml(c.vat_number)}</ram:ID></ram:SpecifiedTaxRegistration>` : ""}</ram:SellerTradeParty>
      <ram:BuyerTradeParty><ram:Name>${xml(i.customer_name)}</ram:Name>${i.customer_siren ? `<ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${xml(i.customer_siren)}</ram:ID></ram:SpecifiedLegalOrganization>` : ""}${i.customer_vat ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${xml(i.customer_vat)}</ram:ID></ram:SpecifiedTaxRegistration>` : ""}</ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery><ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime><udt:DateTimeString format="102">${compact(i.service_date)}</udt:DateTimeString></ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent></ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
${i.taxes.map((t) => `      <ram:ApplicableTradeTax><ram:CalculatedAmount>${amount(t.vat)}</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode><ram:BasisAmount>${amount(t.net)}</ram:BasisAmount><ram:CategoryCode>${category(t.rate_bp)}</ram:CategoryCode><ram:RateApplicablePercent>${(t.rate_bp / 100).toFixed(2)}</ram:RateApplicablePercent></ram:ApplicableTradeTax>`).join("\n")}
${i.due_date ? `      <ram:SpecifiedTradePaymentTerms><ram:DueDateDateTime><udt:DateTimeString format="102">${compact(i.due_date)}</udt:DateTimeString></ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms>\n` : ""}      <ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:LineTotalAmount>${amount(i.net)}</ram:LineTotalAmount><ram:TaxBasisTotalAmount>${amount(i.net)}</ram:TaxBasisTotalAmount><ram:TaxTotalAmount currencyID="EUR">${amount(i.vat)}</ram:TaxTotalAmount><ram:GrandTotalAmount>${amount(i.gross)}</ram:GrandTotalAmount><ram:DuePayableAmount>${amount(i.paid ? 0 : i.gross)}</ram:DuePayableAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`;
}

export type FecRow = {
  journal: string;
  number: number;
  entry_date: string;
  account_code: string;
  account_label: string;
  piece: string;
  label: string;
  debit: number;
  credit: number;
};
const journals: Record<string, string> = {
  VE: "Ventes",
  AC: "Achats",
  BQ: "Banque",
};
const fecAmount = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
/** Colonnes du FEC, séparées par une barre. Un fichier officiel reste du ressort du logiciel comptable. */
export function fecFile(rows: FecRow[]) {
  const header = [
    "JournalCode",
    "JournalLib",
    "EcritureNum",
    "EcritureDate",
    "CompteNum",
    "CompteLib",
    "CompAuxNum",
    "CompAuxLib",
    "PieceRef",
    "PieceDate",
    "EcritureLib",
    "Debit",
    "Credit",
    "EcritureLet",
    "DateLet",
    "ValidDate",
    "Montantdevise",
    "Idevise",
  ];
  const clean = (value: string) => value.replace(/[|\r\n\t]/g, " ").trim();
  const lines = rows.map((r) => {
    const day = compact(r.entry_date);
    return [
      r.journal,
      journals[r.journal] ?? r.journal,
      String(r.number),
      day,
      r.account_code,
      clean(r.account_label),
      "",
      "",
      clean(r.piece),
      day,
      clean(r.label),
      fecAmount(r.debit),
      fecAmount(r.credit),
      "",
      "",
      day,
      "",
      "",
    ].join("|");
  });
  return [header.join("|"), ...lines].join("\r\n") + "\r\n";
}
