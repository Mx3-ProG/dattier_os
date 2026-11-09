"use client";
import { useEffect, useState } from "react";
import { Check, Copy, Download, ExternalLink, Printer } from "lucide-react";
import "./qr.css";

/** Absolute traced link of a QR token. */
export function qrUrl(token: string) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/q/${token}`;
}

async function lib() {
  return (await import("qrcode")).default;
}

/** QR code drawn as inline SVG (crisp at any size, prints well). */
export function QrImage({
  value,
  size = 160,
  className = "",
  label,
}: {
  value: string;
  size?: number;
  className?: string;
  label?: string;
}) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let alive = true;
    void lib().then((QRCode) =>
      QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
        .then((s) => alive && setSvg(s))
        .catch(() => alive && setSvg("")),
    );
    return () => {
      alive = false;
    };
  }, [value]);
  return (
    <div
      className={`qr-image ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ? `QR code : ${label}` : "QR code"}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

const fileName = (label: string) =>
  label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 60) || "qr-code";

export async function downloadQr(value: string, label: string, format: "png" | "svg") {
  const QRCode = await lib();
  const a = document.createElement("a");
  if (format === "png") {
    a.href = await QRCode.toDataURL(value, { width: 1200, margin: 2, errorCorrectionLevel: "M" });
  } else {
    const svg = await QRCode.toString(value, { type: "svg", margin: 2 });
    a.href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  }
  a.download = `${fileName(label)}.${format}`;
  a.click();
  if (format === "svg") setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Printable A4 sheet (stickers / table tents) of several codes. */
export async function printQrSheet(
  title: string,
  items: { value: string; label: string; caption?: string }[],
) {
  const QRCode = await lib();
  const cells = await Promise.all(
    items.map(async (i) => {
      const svg = await QRCode.toString(i.value, { type: "svg", margin: 1 });
      return `<figure>${svg}<figcaption><b>${escapeHtml(i.label)}</b>${i.caption ? `<small>${escapeHtml(i.caption)}</small>` : ""}</figcaption></figure>`;
    }),
  );
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
@page{size:A4;margin:12mm}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;color:#1d1d1f;margin:0}
h1{font-size:16px;margin:0 0 10mm}
main{display:grid;grid-template-columns:repeat(3,1fr);gap:8mm}
figure{margin:0;padding:5mm;border:1px dashed #c7c7cc;border-radius:4mm;text-align:center;break-inside:avoid}
figure svg{width:100%;height:auto;display:block}
figcaption{display:grid;gap:1mm;margin-top:3mm;font-size:12px}
small{color:#6e6e73;font-size:10px}
</style></head><body><h1>${escapeHtml(title)}</h1><main>${cells.join("")}</main></body></html>`);
  w.document.close();
  // Depuis cette page : la fenêtre hérite de la CSP, qui bloquerait un script écrit dedans.
  w.focus();
  w.print();
}

/** QR with its actions: download, copy, open. */
export function QrActions({
  value,
  label,
  compact = false,
}: {
  value: string;
  label: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={`qr-actions ${compact ? "compact" : ""}`}>
      <button type="button" onClick={() => void downloadQr(value, label, "png")} title="Télécharger en PNG">
        <Download size={15} /> PNG
      </button>
      <button type="button" onClick={() => void downloadQr(value, label, "svg")} title="Télécharger en SVG (impression)">
        <Download size={15} /> SVG
      </button>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {
            /* Link stays visible. */
          }
        }}
        title="Copier le lien"
      >
        {copied ? <Check size={15} /> : <Copy size={15} />} Lien
      </button>
      <a href={value} target="_blank" rel="noreferrer" title="Ouvrir le lien">
        <ExternalLink size={15} />
      </a>
      {!compact && (
        <button type="button" onClick={() => void printQrSheet(label, [{ value, label }])} title="Imprimer">
          <Printer size={15} />
        </button>
      )}
    </div>
  );
}
