import test from "node:test";
import assert from "node:assert/strict";
import { sendEmail } from "../src/features/messaging/service";

test("l'envoi d'une proposition joint le PDF encodé et une clé contre les doublons", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.RESEND_API_KEY;
  let body: Record<string, unknown> | null = null;
  let idempotency: string | null = null;
  process.env.RESEND_API_KEY = "test-key";
  globalThis.fetch = async (_input, init) => {
    body = JSON.parse(String(init?.body));
    idempotency = new Headers(init?.headers).get("Idempotency-Key");
    return new Response(JSON.stringify({ id: "email-test" }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const result = await sendEmail("client@example.test", "Proposition", "Bonjour", "Commerce <contact@example.test>", {
      attachment: { filename: "proposition.pdf", content: Buffer.from("%PDF-test") },
      idempotencyKey: "crm-proposal-test",
    });
    assert.equal(result, "email-test");
    assert.equal(idempotency, "crm-proposal-test");
    assert.deepEqual((body as Record<string, unknown> | null)?.["attachments"], [{ filename: "proposition.pdf", content: Buffer.from("%PDF-test").toString("base64") }]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
  }
});

test("les e-mails partent dans la mise en page de la plateforme, liens cliquables et texte échappé", async () => {
  const { emailLayout, senderName } = await import("../src/features/messaging/email-layout");
  assert.equal(senderName("Chez Paul <contact@example.test>"), "Chez Paul");
  assert.equal(senderName('"Le Dattier" <contact@example.test>'), "Le Dattier");
  const html = emailLayout({ sender: "Le Dattier", text: "Bonjour <b>Marie</b>,\n\nRéservez sur https://example.test/menu." });
  assert.match(html, /<html lang="fr">/);
  assert.match(html, /Le Dattier/);
  assert.match(html, /&#60;b&#62;Marie/);
  assert.match(html, /<a href="https:\/\/example\.test\/menu"/);
  assert.doesNotMatch(html, /menu\.<\/a>/);
});
