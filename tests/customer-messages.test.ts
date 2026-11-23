import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/infrastructure/database/migrate";
import { seed } from "../src/infrastructure/database/seed";
import { rows } from "../src/infrastructure/database/db";
import { perform, actionSchema } from "../src/application/actions";
import { scope, type Actor } from "../src/infrastructure/auth/session";
import { asEmail, asPhone, draft } from "../src/features/messaging/contact";

let db: PGlite;
const nadia: Actor = { id: "nadia", name: "Nadia", role: "OWNER" },
  sarah: Actor = { id: "sarah", name: "Sarah", role: "WAITER" };
const act = (user: Actor, input: unknown, r = "bernay") =>
  db.transaction(async (tx) =>
    perform(tx, r, await scope(tx, user, r), actionSchema.parse(input)),
  );
const message = (id: string, over: object = {}) => ({
  action: "messageCustomer",
  id,
  channel: "email",
  purpose: "relance",
  subject: "On pense à vous",
  body: "Bonjour, revenez nous voir !",
  ...over,
});

before(async () => {
  delete process.env.RESEND_API_KEY;
  delete process.env.TWILIO_ACCOUNT_SID;
  db = new PGlite();
  await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
  await migrate(db);
  await db.transaction(seed);
  for (const [id, contact, consent] of [
    ["msg-mail", "camille@example.test", true],
    ["msg-phone", "06 12 34 56 78", true],
    ["msg-noconsent", "lea@example.test", false],
  ] as const)
    await db.query(
      "INSERT INTO customers(id,restaurant_id,name,contact,consent,points) VALUES($1,'bernay',$2,$3,$4,10)",
      [id, `Client ${id}`, contact, consent],
    );
});
after(async () => {
  await db.close();
});

test("contacts : email et mobile reconnus, numéros français normalisés", () => {
  assert.equal(asEmail(" Camille@Example.test "), "camille@example.test");
  assert.equal(asEmail("06 12 34 56 78"), null);
  assert.equal(asPhone("06 12 34 56 78"), "+33612345678");
  assert.equal(asPhone("0033 6 12 34 56 78"), "+33612345678");
  assert.equal(asPhone("camille@example.test"), null);
  assert.equal(asPhone("12"), null);
  const d = draft("relance", "sms", {
    firstName: "Camille",
    restaurant: "Le Dattier",
    points: 40,
  });
  assert.match(d.body, /Camille/);
  assert.match(d.body, /40 points/);
});

test("email en un clic : tracé en démo, mention de désinscription ajoutée", async () => {
  const r = (await act(nadia, message("msg-mail"))) as { status: string };
  assert.equal(r.status, "demo");
  const [m] = await rows<{ recipient: string; body: string; actor: string }>(
    db,
    "SELECT recipient,body,actor FROM customer_messages WHERE customer_id='msg-mail'",
  );
  assert.equal(m.recipient, "camille@example.test");
  assert.equal(m.actor, "nadia");
  assert.match(m.body, /plus recevoir nos offres/);
  await assert.rejects(act(nadia, message("msg-mail")), /deux minutes/);
});

test("SMS : numéro requis, accord requis pour une offre, information libre", async () => {
  await assert.rejects(
    act(nadia, message("msg-mail", { channel: "sms" })),
    /numéro de mobile/,
  );
  const r = (await act(
    nadia,
    message("msg-phone", {
      channel: "sms",
      purpose: "offre",
      subject: undefined,
    }),
  )) as { recipient: string };
  assert.equal(r.recipient, "+33612345678");
  await assert.rejects(
    act(nadia, message("msg-noconsent", { purpose: "offre" })),
    /accord/,
  );
  const info = (await act(
    nadia,
    message("msg-noconsent", { purpose: "information" }),
  )) as { status: string };
  assert.equal(info.status, "demo");
  const [m] = await rows<{ body: string }>(
    db,
    "SELECT body FROM customer_messages WHERE customer_id='msg-noconsent'",
  );
  assert.doesNotMatch(m.body, /plus recevoir nos offres/);
});

test("seuls les rôles autorisés aux clients peuvent écrire", async () => {
  await assert.rejects(act(sarah, message("msg-phone", { channel: "email" })));
  assert.throws(() => actionSchema.parse(message("msg-mail", { subject: "" })));
});
