import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/lib/database/migrate";
import { seed } from "../src/lib/database/seed";
import { addonPriceCents, monthlyAddonIds } from "../src/features/addons/catalog";
import { manifestFor } from "../src/core/modules/manifest";
import { defaultBrand, readBrand } from "../src/features/email/branding/brand";
import { renderEmail } from "../src/features/email/branding/render";
import { emailTriggers, interpolate, readContent } from "../src/features/email/branding/templates";
import { renderMessage } from "../src/features/email/branding/compose";
import { createEngine } from "../src/features/email/engine/deliver";
import type { DB } from "../src/lib/database/types";
import type { EmailTransport, OutgoingEmail } from "../src/features/email/engine/port";
import { isPublicAddress } from "../src/features/email/smtp/guard";
import { transportSchema } from "../src/features/email/smtp/config";

test("l'add-on Emails automatiques est un abonnement mensuel à 9 € relié à son module", () => {
  assert.ok(monthlyAddonIds.includes("email-automation"));
  assert.equal(addonPriceCents("email-automation"), 900);
  const manifest = manifestFor("email-automation");
  assert.equal(manifest.offer, "addon-monthly");
  assert.deepEqual(manifest.navigation, ["emails"]);
});

test("le rendu échappe les variables et n'accepte que des liens https", () => {
  const content = { ...emailTriggers[0].defaults, buttonLabel: "Voir", buttonUrl: "javascript:alert(1)" };
  const html = renderEmail(defaultBrand, content, { client: "<script>x</script>", couverts: "2" }, { restaurant: "Le Dattier" }).html;
  assert.ok(!html.includes("<script>x"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("javascript:"));
  assert.equal(interpolate("Bonjour {{client}} {{inconnue}}!", { client: "Ana" }), "Bonjour Ana !");
  const marketing = renderEmail({ ...defaultBrand, primary: "#123456" }, content, {}, { restaurant: "A", unsubscribe: "Désinscription" });
  assert.ok(marketing.html.includes("#123456"));
  assert.ok(marketing.text.includes("Désinscription"));
  // Un document stocké partiellement invalide garde ses champs valides.
  assert.equal(readBrand({ primary: "#ABCDEF", accent: "rouge" }).primary, "#abcdef");
  assert.equal(readBrand({ primary: "#ABCDEF", accent: "rouge" }).accent, defaultBrand.accent);
  // Sans modèle enregistré, le texte par défaut du déclencheur est conservé en entier.
  assert.deepEqual(readContent(undefined, emailTriggers[0].defaults), emailTriggers[0].defaults);
  assert.deepEqual(readContent({ subject: "" }, emailTriggers[0].defaults), emailTriggers[0].defaults);
});

test("un SMTP saisi ne peut viser ni le réseau interne ni une combinaison incohérente", () => {
  for (const ip of ["127.0.0.1", "10.0.0.8", "169.254.169.254", "192.168.1.2", "172.20.0.1", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"])
    assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress("212.27.48.10"), true);
  assert.equal(isPublicAddress("2a01:e0a::1"), true);
  assert.throws(() => transportSchema.parse({ mode: "custom", host: "smtp.exemple.fr", port: 465, security: "starttls", fromEmail: "a@exemple.fr" }));
  assert.throws(() => transportSchema.parse({ mode: "custom", host: "localhost", port: 587, security: "starttls", fromEmail: "a@exemple.fr" }));
  assert.throws(() => transportSchema.parse({ mode: "custom", host: "smtp.exemple.fr", port: 8080, security: "starttls", fromEmail: "a@exemple.fr" }));
});

test("emails : add-on requis, automatisation choisie, données et secret isolés par établissement", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
    await migrate(db);
    await db.transaction(seed);
    const as = async <T>(restaurant: string, fn: (tx: DB) => Promise<T>, publicChannel = false) => db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE atacuisine_app");
      await tx.query(
        "SELECT set_config('app.user_id',$1,true),set_config('app.restaurant_id',$2,true),set_config('app.public',$3,true)",
        [publicChannel ? "" : "nadia", restaurant, publicChannel ? "true" : "false"],
      );
      return fn(tx as unknown as DB);
    });
    const app = (restaurant: string, sql: string, params: unknown[] = [], publicChannel = false) =>
      as(restaurant, (tx) => tx.query<Record<string, unknown>>(sql, params), publicChannel);
    const trigger = (restaurant: string, to: string, ref: string, publicChannel = false) =>
      app(restaurant, "SELECT app.email_trigger($1,'reservation.requested',$2,NULL,$3::jsonb) AS id",
        [restaurant, to, JSON.stringify({ ref, client: "Ana", couverts: "2" })], publicChannel)
        .then((result) => result.rows[0].id as string | null);

    // Sans abonnement : ni lecture, ni écriture, ni déclenchement.
    await assert.rejects(app("bernay", "INSERT INTO email_brands(restaurant_id,settings) VALUES('bernay','{}')"));
    assert.equal(await trigger("bernay", "ana@exemple.fr", "r1"), null);

    for (const restaurant of ["bernay", "atelier"]) {
      await db.query("INSERT INTO addon_subscriptions(id,restaurant_id,addon,stripe_session) VALUES($1,$2,'email-automation',$3)", [`sub-${restaurant}`, restaurant, `cs_${restaurant}`]);
      await db.query("SELECT app.addon_reconcile($1,$2,$3,'active',now()+interval '1 month')", [`sub-${restaurant}`, `cs_${restaurant}`, `sub_${restaurant}`]);
    }
    assert.equal((await app("bernay", "SELECT app.module_available('bernay','email-automation') AS ok")).rows[0].ok, true);

    // Automatisation inactive par défaut : aucun envoi.
    assert.equal(await trigger("bernay", "ana@exemple.fr", "r1"), null);
    await app("bernay", "INSERT INTO email_templates(restaurant_id,key,name,category,content,enabled) VALUES('bernay','reservation.requested','Demande','transactional',$1::jsonb,true)",
      [JSON.stringify({ ...emailTriggers[0].defaults, subject: "Merci {{client}} !" })]);
    await app("bernay", "INSERT INTO email_brands(restaurant_id,settings) VALUES('bernay',$1::jsonb)", [JSON.stringify({ ...defaultBrand, primary: "#aa0000" })]);

    // Canal public (demande de réservation sur le site) : déclenchement possible, lecture impossible.
    const id = await trigger("bernay", "Ana@Exemple.fr", "r1", true);
    assert.ok(id);
    assert.equal(await trigger("bernay", "ana@exemple.fr", "r1", true), null, "doublon dans l'heure");
    assert.equal(await trigger("bernay", "pas-une-adresse", "r2"), null);
    assert.equal((await app("bernay", "SELECT id FROM email_messages", [], true)).rows.length, 0);
    assert.equal((await db.query("SELECT 1 FROM outbox_jobs WHERE kind='email_send' AND dedupe_key=$1", [id])).rows.length, 1, "job durable pour le worker");

    // Isolation : l'autre établissement ne voit ni le message, ni l'identité, ni le modèle.
    assert.equal((await app("atelier", "SELECT id FROM email_messages")).rows.length, 0);
    assert.equal((await app("atelier", "SELECT 1 FROM email_brands WHERE restaurant_id='bernay'")).rows.length, 0);
    assert.equal(await trigger("atelier", "ana@exemple.fr", "r1"), null, "automatisation non activée chez l'autre");
    await assert.rejects(app("atelier", "SELECT * FROM app.email_claim('bernay')"));
    await assert.rejects(app("atelier", "INSERT INTO email_templates(restaurant_id,key,name,category,content) VALUES('bernay','custom-x','X','marketing','{}')"));

    // Le secret SMTP n'est pas lisible par l'application ; les statuts ne s'écrivent que par fonction.
    await app("bernay", "INSERT INTO email_transports(restaurant_id,mode,host,port,security,secret,from_email) VALUES('bernay','custom','smtp.exemple.fr',587,'starttls','v1.chiffre','a@exemple.fr')");
    await assert.rejects(app("bernay", "SELECT secret FROM email_transports"));
    assert.equal((await app("bernay", "SELECT host FROM email_transports")).rows[0].host, "smtp.exemple.fr");
    await assert.rejects(app("bernay", "UPDATE email_messages SET status='sent'"));
    await app("bernay", "UPDATE email_transports SET mode='platform'");

    // Moteur : réservation atomique, rendu à l'identité de l'établissement, solde.
    const sent: OutgoingEmail[] = [];
    const transport: EmailTransport = { kind: "platform", live: true, send: async (email) => { sent.push(email); return { providerId: "prov-1" }; } };
    const engine = createEngine({ render: renderMessage, transport: async () => transport });
    const run = <T>(fn: (tx: DB) => Promise<T>) => as("bernay", fn, true);
    const results = await engine.deliver(run, "bernay");
    assert.deepEqual(results.map((result) => result.status), ["sent"]);
    assert.equal(sent[0].to, "ana@exemple.fr");
    assert.equal(sent[0].subject, "Merci Ana !");
    assert.ok(sent[0].html.includes("#aa0000"));
    assert.equal((await engine.deliver(run, "bernay")).length, 0, "aucun double envoi");
    const row = (await app("bernay", "SELECT status,provider_id,subject FROM email_messages WHERE id=$1", [id])).rows[0];
    assert.deepEqual(row, { status: "sent", provider_id: "prov-1", subject: "Merci Ana !" });

    // Erreur passagère : remise en file ; désinstallation : la file est ignorée.
    await trigger("bernay", "bob@exemple.fr", "r3");
    const failing = createEngine({ render: renderMessage, transport: async () => ({ ...transport, send: async () => { throw new Error("Connexion refusée"); } }) });
    assert.deepEqual((await failing.deliver(run, "bernay")).map((result) => result.status), ["error"]);
    assert.equal((await app("bernay", "SELECT status FROM email_messages WHERE recipient='bob@exemple.fr'")).rows[0].status, "queued");
    await app("bernay", "SELECT app.addon_installation_set('bernay','email-automation',false)");
    assert.equal((await engine.deliver(run, "bernay")).length, 0);
    assert.equal(await trigger("bernay", "carl@exemple.fr", "r4"), null);
  } finally {
    await db.close();
  }
});
