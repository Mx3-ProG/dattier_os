/**
 * Content Security Policy des pages HTML.
 *
 * Le proxy génère un nonce par requête et pose la politique ; Next.js lit le
 * nonce dans l'en-tête de la requête et l'applique à ses propres scripts.
 * Voir docs/platform/SITE_ORIGIN_PLAN.md.
 */
export type CspKind = "platform" | "site";
export type CspMode = "report-only" | "enforce";

export const NONCE_HEADER = "x-nonce";
export const CSP_REPORT_PATH = "/api/csp-report";

/**
 * Fichiers envoyés par les restaurants : jamais de script ni de contexte
 * d'origine, même si l'un d'eux passait le contrôle de type à l'envoi.
 */
export const MEDIA_CSP =
  "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox";

/** Tiers intégrés par les sites publics, uniquement après accord du visiteur. */
const SITE_FRAMES = [
  "https://www.google.com",
  "https://maps.google.com",
  "https://www.youtube-nocookie.com",
  "https://player.vimeo.com",
];

export function createNonce() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString(
    "base64",
  );
}

export function cspMode(value: string | undefined): CspMode {
  return value === "enforce" ? "enforce" : "report-only";
}

export function cspHeaderName(mode: CspMode) {
  return mode === "enforce"
    ? "Content-Security-Policy"
    : "Content-Security-Policy-Report-Only";
}

export function contentSecurityPolicy(input: {
  nonce: string;
  kind: CspKind;
  dev?: boolean;
}) {
  const dev = input.dev ?? false;
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${input.nonce}'`,
      "'strict-dynamic'",
      // React s'en sert en développement pour reconstruire les piles d'appels.
      ...(dev ? ["'unsafe-eval'"] : []),
    ],
    // Pas de nonce ici : il désactiverait 'unsafe-inline', dont dépendent les attributs style.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(dev ? ["ws:"] : [])],
    "media-src": ["'self'", "blob:"],
    "frame-src": [
      "'self'",
      ...(input.kind === "site" ? SITE_FRAMES : []),
    ],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'self'"],
    // L'aperçu de l'éditeur est encore une iframe de même origine.
    "frame-ancestors": ["'self'"],
    "report-uri": [CSP_REPORT_PATH],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

/** Pages qui affichent le contenu d'un site public sur l'hôte de la plateforme. */
export function isSitePath(pathname: string) {
  return /^\/(r|site-demo)(\/|$)/.test(pathname);
}

const location = (value: unknown, keepPath: boolean) => {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return (keepPath ? url.origin + url.pathname : url.origin).slice(0, 200);
  } catch {
    // Mots-clés du navigateur : inline, eval, data…
    return /^[a-z-]{1,20}$/.test(value) ? value : "";
  }
};

/**
 * Réduit un rapport à ce qui sert au diagnostic. Les requêtes et fragments sont
 * retirés, car ils peuvent contenir des jetons de commande ou de parrainage.
 */
export function parseCspReport(body: unknown) {
  const report = (body as { "csp-report"?: Record<string, unknown> } | null)?.[
    "csp-report"
  ];
  if (!report || typeof report !== "object") return null;
  const directive = report["effective-directive"] ?? report["violated-directive"];
  return {
    directive:
      typeof directive === "string" && /^[a-z-]{1,40}$/.test(directive)
        ? directive
        : "",
    blocked: location(report["blocked-uri"], false),
    document: location(report["document-uri"], true),
    disposition: report.disposition === "enforce" ? "enforce" : "report",
  };
}
