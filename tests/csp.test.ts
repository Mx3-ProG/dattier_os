import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contentSecurityPolicy,
  createNonce,
  cspHeaderName,
  cspMode,
  isSitePath,
  parseCspReport,
} from "../src/lib/security/csp";

const directive = (policy: string, name: string) =>
  policy
    .split("; ")
    .find((d) => d.startsWith(`${name} `))
    ?.slice(name.length + 1);

test("les scripts exigent le nonce, sans inline ni eval en production", () => {
  const script = directive(
    contentSecurityPolicy({ nonce: "abc", kind: "platform" }),
    "script-src",
  );
  assert.ok(script?.includes("'nonce-abc'"));
  assert.ok(script?.includes("'strict-dynamic'"));
  assert.ok(!script?.includes("unsafe-inline"));
  assert.ok(!script?.includes("unsafe-eval"));
});

test("eval et le websocket de rechargement restent réservés au développement", () => {
  const policy = contentSecurityPolicy({
    nonce: "abc",
    kind: "platform",
    dev: true,
  });
  assert.ok(directive(policy, "script-src")?.includes("'unsafe-eval'"));
  assert.ok(directive(policy, "connect-src")?.includes("ws:"));
});

test("style-src ne contient pas de nonce, qui bloquerait les attributs style", () => {
  const style = directive(
    contentSecurityPolicy({ nonce: "abc", kind: "site" }),
    "style-src",
  );
  assert.ok(style?.includes("'unsafe-inline'"));
  assert.ok(!style?.includes("nonce"));
});

test("seuls les sites publics intègrent des cartes et des vidéos tierces", () => {
  const platform = directive(
    contentSecurityPolicy({ nonce: "a", kind: "platform" }),
    "frame-src",
  );
  const site = directive(
    contentSecurityPolicy({ nonce: "a", kind: "site" }),
    "frame-src",
  );
  assert.equal(platform, "'self'");
  assert.ok(site?.includes("https://www.youtube-nocookie.com"));
});

test("les chemins de site public sont reconnus sans faux positif", () => {
  assert.ok(isSitePath("/r/bernay"));
  assert.ok(isSitePath("/r/bernay/carte"));
  assert.ok(isSitePath("/site-demo"));
  assert.ok(!isSitePath("/restaurant/bernay"));
  assert.ok(!isSitePath("/dashboard"));
});

test("le nonce change à chaque appel", () => {
  const nonces = new Set(Array.from({ length: 50 }, createNonce));
  assert.equal(nonces.size, 50);
  for (const nonce of nonces) assert.match(nonce, /^[A-Za-z0-9+/]+={0,2}$/);
});

test("le mode par défaut observe sans bloquer", () => {
  assert.equal(cspMode(undefined), "report-only");
  assert.equal(cspMode("n'importe quoi"), "report-only");
  assert.equal(cspMode("enforce"), "enforce");
  assert.equal(
    cspHeaderName("report-only"),
    "Content-Security-Policy-Report-Only",
  );
  assert.equal(cspHeaderName("enforce"), "Content-Security-Policy");
});

test("un rapport ne conserve ni requête ni fragment", () => {
  const report = parseCspReport({
    "csp-report": {
      "effective-directive": "script-src-elem",
      "blocked-uri": "https://evil.example/x.js?token=secret",
      "document-uri": "https://app.example/r/bernay/suivi?token=secret#abc",
      disposition: "report",
    },
  });
  assert.deepEqual(report, {
    directive: "script-src-elem",
    blocked: "https://evil.example",
    document: "https://app.example/r/bernay/suivi",
    disposition: "report",
  });
});

test("un rapport malformé est ignoré ou neutralisé", () => {
  assert.equal(parseCspReport(null), null);
  assert.equal(parseCspReport({ autre: 1 }), null);
  const report = parseCspReport({
    "csp-report": {
      "effective-directive": 'x"\n[faux journal]',
      "blocked-uri": "pas une url avec des espaces\n",
      "document-uri": 12,
    },
  });
  assert.deepEqual(report, {
    directive: "",
    blocked: "",
    document: "",
    disposition: "report",
  });
});

test("le mot-clé inline d'un rapport reste lisible", () => {
  assert.equal(
    parseCspReport({ "csp-report": { "blocked-uri": "inline" } })?.blocked,
    "inline",
  );
});
