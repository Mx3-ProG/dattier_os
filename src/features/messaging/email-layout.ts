/**
 * Shared HTML layout for every e-mail sent through Resend (customer messages,
 * CRM campaigns, proposals). Table-based with inline styles so it renders the
 * same in Gmail, Outlook and Apple Mail. Colours follow the platform palette
 * (see src/components/platform/access.css).
 */

const palette = {
  ink: "#18372d",
  paper: "#f5f2e9",
  surface: "#fffdf8",
  line: "#dedfd3",
  gold: "#dfc397",
  muted: "#5d6f64",
};

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Display name of an RFC 5322 "Name <address>" sender, or the address itself. */
export function senderName(from: string) {
  const match = /^\s*"?([^"<]*?)"?\s*<[^>]+>\s*$/.exec(from);
  return (match?.[1] || from).trim() || "STUDIO S";
}

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)]/g;

/** Escapes the text, turns bare links into anchors and blank lines into paragraphs. */
export function textToHtml(text: string) {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((block) => {
      const html = escapeHtml(block)
        .replace(URL_PATTERN, (url) => `<a href="${url}" style="color:${palette.ink};font-weight:700;text-decoration:underline">${url}</a>`)
        .replace(/\n/g, "<br>");
      return `<p style="margin:0 0 16px">${html}</p>`;
    })
    .join("");
}

export function emailLayout({ sender, text, preheader }: { sender: string; text: string; preheader?: string }) {
  const name = escapeHtml(sender);
  const hidden = escapeHtml((preheader ?? text).replace(/\s+/g, " ").slice(0, 120));
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${name}</title>
</head>
<body style="margin:0;padding:0;background:${palette.paper}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${hidden}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${palette.paper}">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="background:${palette.ink};border-radius:20px 20px 0 0;padding:26px 32px">
<p style="margin:0;font:500 24px/1.2 Georgia,'Times New Roman',serif;color:#fffdf5;letter-spacing:-0.02em">${name}</p>
</td></tr>
<tr><td style="background:${palette.surface};border:1px solid ${palette.line};border-top:0;border-radius:0 0 20px 20px;padding:32px;font:16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${palette.ink}">
${textToHtml(text)}
</td></tr>
<tr><td style="padding:20px 32px 0;font:12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${palette.muted};text-align:center">
Message envoyé par ${name} depuis <span style="color:${palette.ink};font-weight:700">STUDIO S</span>.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
