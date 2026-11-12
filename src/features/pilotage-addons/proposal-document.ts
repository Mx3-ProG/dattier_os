import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type Proposal = Awaited<ReturnType<typeof import("./service").crmProposalDetails>>;
const safe = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, " ").slice(0, 300);

export async function proposalPdf(proposal: Proposal) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Proposition ${proposal.id}`);
  const page = pdf.addPage([595, 842]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const line = (value: string, y: number, size = 11, strong = false) => page.drawText(safe(value), { x: 48, y, size, font: strong ? bold : regular, color: rgb(0.13, 0.17, 0.22), maxWidth: 500 });
  line("PROPOSITION COMMERCIALE", 780, 20, true);
  line(`Reference : ${proposal.id}`, 750, 9);
  line(`Date : ${new Date(proposal.created_at).toLocaleDateString("fr-FR")}`, 730, 10);
  line("Emetteur", 685, 12, true);
  line(proposal.seller_name, 665);
  line(proposal.seller_address, 647);
  if (proposal.seller_phone) line(proposal.seller_phone, 629);
  line("Destinataire", 585, 12, true);
  line(proposal.company_name, 565);
  if (proposal.customer_name) line(proposal.customer_name, 547);
  if (proposal.company_address) line(proposal.company_address, 529);
  if (proposal.company_city) line(proposal.company_city, 511);
  line("Objet", 460, 12, true);
  line(proposal.title, 438);
  if (proposal.proposal_description) {
    const description = safe(proposal.proposal_description).match(/.{1,75}(?:\s|$)/g)?.slice(0, 5) ?? [];
    description.forEach((part, index) => line(part.trim(), 416 - index * 17, 10));
  }
  line(`Montant estime TTC : ${(proposal.amount_cents / 100).toFixed(2)} EUR`, 310, 14, true);
  if (proposal.expected_on) line(`Date cible : ${new Date(proposal.expected_on).toLocaleDateString("fr-FR")}`, 285);
  if (proposal.valid_until) line(`Valable jusqu'au : ${new Date(proposal.valid_until).toLocaleDateString("fr-FR")}`, 265);
  line("Document indicatif. Les conditions et taxes applicables doivent etre confirmees", 130, 9);
  line("avant emission d'un devis contractuel ou d'une facture.", 115, 9);
  return Buffer.from(await pdf.save());
}
