import { emailFonts, type EmailBrand } from "./brand";
import { interpolate, type TemplateContent } from "./templates";

/**
 * Rendu d'un email : identité visuelle + modèle + variables → objet, HTML et texte.
 * Pur et sans dépendance Node : l'écran l'utilise pour l'aperçu en direct, le moteur
 * d'envoi pour le message réel. Le HTML est construit en tableaux et styles en ligne,
 * le seul format lu correctement par les principaux clients mail.
 */
export type RenderedEmail = { subject: string; html: string; text: string };

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Gras `**texte**` et liens https nus ; tout le reste est échappé. */
function inline(value: string, link: string) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(https:\/\/[^\s<]+)/g, `<a href="$1" style="color:${link};text-decoration:underline">$1</a>`);
}

function paragraphs(body: string, brand: EmailBrand) {
  return body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      if (lines.every((line) => /^\s*[-•]\s+/.test(line)))
        return `<ul style="margin:0 0 16px;padding-left:20px">${lines
          .map((line) => `<li style="margin:0 0 6px">${inline(line.replace(/^\s*[-•]\s+/, ""), brand.primary)}</li>`)
          .join("")}</ul>`;
      return `<p style="margin:0 0 16px">${lines.map((line) => inline(line, brand.primary)).join("<br>")}</p>`;
    })
    .join("");
}

function button(label: string, url: string, brand: EmailBrand) {
  if (!label || !/^https:\/\//.test(url)) return "";
  const radius = brand.buttonStyle === "pill" ? 999 : Math.min(brand.radius, 12);
  const filled = brand.buttonStyle !== "outline";
  const style = [
    "display:inline-block",
    "padding:13px 26px",
    `border-radius:${radius}px`,
    `border:2px solid ${brand.primary}`,
    `background:${filled ? brand.primary : "transparent"}`,
    `color:${filled ? brand.buttonText : brand.primary}`,
    "font-weight:700",
    "text-decoration:none",
  ].join(";");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px ${brand.align === "center" ? "auto" : "0"} 20px"><tr><td><a href="${escapeHtml(url)}" style="${style}">${escapeHtml(label)}</a></td></tr></table>`;
}

function header(brand: EmailBrand, name: string) {
  const align = brand.align;
  const logo = brand.logoUrl
    ? `<img src="${escapeHtml(brand.logoUrl)}" width="${brand.logoWidth}" alt="${escapeHtml(name)}" style="display:${align === "center" ? "block;margin:0 auto" : "block"};max-width:100%;height:auto;border:0">`
    : "";
  const title = `<span style="font-family:${emailFonts[brand.headingFont].stack};font-size:22px;font-weight:700;letter-spacing:.2px">${escapeHtml(name)}</span>`;
  if (brand.header === "band")
    return `<tr><td style="background:${brand.primary};color:${brand.buttonText};padding:22px 32px;text-align:${align};border-radius:${brand.radius}px ${brand.radius}px 0 0">${logo || title}</td></tr>`;
  if (brand.header === "logo" && logo)
    return `<tr><td style="padding:28px 32px 4px;text-align:${align}">${logo}</td></tr>`;
  return `<tr><td style="padding:28px 32px 4px;text-align:${align};color:${brand.primary}">${title}</td></tr>`;
}

export function renderEmail(
  brand: EmailBrand,
  content: TemplateContent,
  vars: Record<string, string>,
  options: { restaurant: string; unsubscribe?: string } = { restaurant: "" },
): RenderedEmail {
  const name = brand.senderName || options.restaurant;
  const all = { etablissement: name, ...vars };
  const fill = (value: string) => interpolate(value, all).trim();
  const subject = fill(content.subject).replace(/[\r\n]+/g, " ").slice(0, 150) || name;
  const preheader = fill(content.preheader);
  const heading = fill(content.heading);
  const body = fill(content.body);
  const buttonLabel = fill(content.buttonLabel);
  const buttonUrl = fill(content.buttonUrl);
  const footer = fill(brand.footer);
  const signature = fill(brand.signature);
  const font = emailFonts[brand.font].stack;
  const align = brand.align;
  const bandRadius = brand.header === "band" ? `0 0 ${brand.radius}px ${brand.radius}px` : `${brand.radius}px`;

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${brand.background};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${brand.background}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;font-family:${font};font-size:16px;line-height:1.6;color:${brand.text}">
${header(brand, name)}
<tr><td style="background:${brand.surface};padding:32px;border-radius:${bandRadius};text-align:${align}">
${heading ? `<h1 style="margin:0 0 18px;font-family:${emailFonts[brand.headingFont].stack};font-size:26px;line-height:1.25;color:${brand.primary}">${escapeHtml(heading)}</h1>` : ""}
${paragraphs(body, brand)}
${button(buttonLabel, buttonUrl, brand)}
${signature ? `<p style="margin:20px 0 0;padding-top:16px;border-top:1px solid ${brand.accent};color:${brand.muted};font-size:14px">${inline(signature, brand.primary).replace(/\n/g, "<br>")}</p>` : ""}
</td></tr>
<tr><td style="padding:20px 32px;text-align:${align};color:${brand.muted};font-size:12px;line-height:1.5">
${footer ? `<p style="margin:0 0 8px">${inline(footer, brand.muted).replace(/\n/g, "<br>")}</p>` : ""}
${brand.websiteUrl ? `<p style="margin:0 0 8px"><a href="${escapeHtml(brand.websiteUrl)}" style="color:${brand.primary}">${escapeHtml(brand.websiteUrl.replace(/^https:\/\//, ""))}</a></p>` : ""}
${options.unsubscribe ? `<p style="margin:0">${escapeHtml(options.unsubscribe)}</p>` : ""}
</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    heading,
    body,
    buttonLabel && /^https:\/\//.test(buttonUrl) ? `${buttonLabel} : ${buttonUrl}` : "",
    signature,
    "—",
    footer,
    brand.websiteUrl,
    options.unsubscribe ?? "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .replace(/\*\*([^*]+)\*\*/g, "$1");
  return { subject, html, text };
}
