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
