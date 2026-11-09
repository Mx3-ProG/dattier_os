import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { z, ZodError } from "zod";
import { migrate } from "../src/lib/database/migrate";
import { seed } from "../src/lib/database/seed";
import { withDatabaseContext } from "../src/lib/database/context";
import { classifyFailure } from "../src/features/ops-security/classify";
import { runWithContext } from "../src/features/ops-security/context";
import { recordFailure } from "../src/features/ops-security/http";
import { rules } from "../src/features/ops-security/engine";
import {
  failure,
  failureStatus,
  v1FailureStatus,
} from "../src/features/platform/http";

/**
 * Le statut transmis au journal doit être celui renvoyé au client : la règle
 * `access_denied_burst` révoque les sessions d'un profil sur la foi des
 * événements `access.denied`, qui viennent de ce statut.
 */
let db: PGlite;
const runtime = globalThis as unknown as { atacuisineDb?: Promise<PGlite> };
const previousDemo = process.env.ATACUISINE_DEMO;
before(async () => {
  db = new PGlite();
  await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
  await migrate(db);
  await db.transaction(seed);
  process.env.ATACUISINE_DEMO = "true";
  runtime.atacuisineDb = Promise.resolve(db);
});
after(async () => {
  runtime.atacuisineDb = undefined;
  if (previousDemo === undefined) delete process.env.ATACUISINE_DEMO;
  else process.env.ATACUISINE_DEMO = previousDemo;
  await db.close();
});

const validation = () => {
  try {
    z.object({ quantity: z.number() }).parse({ quantity: "deux" });
  } catch (error) {
    return error as ZodError;
  }
  throw new Error("La validation aurait dû échouer.");
};
/** Erreurs ordinaires d'un membre légitime, sur le chemin `authenticated`. */
const memberMistakes = () => [
  validation(),
  new Error("Clôturez d’abord le service de cette table."),
  new Error("Commande déjà réglée."),
  new Error("Votre compte a été modifié. Rechargez la page."),
];
const deniedBurst = async (actor: string) =>
  (await rules.find((r) => r.id === "access_denied_burst")!.detect(db)).filter(
    (d) => d.context.actor === actor,
  );
/** Un membre de « bernay » qui échoue `times` fois, comme dans une requête. */
async function fail(
  actor: string,
  times: number,
  errors: () => unknown[],
  ctx: (error: unknown) => { endpoint: string; status: number },
) {
  await runWithContext(
    { correlationId: randomUUID(), route: "/api/test", actorId: actor },
    () =>
      withDatabaseContext(
        { userId: "nadia", restaurantId: "bernay" },
        async () => {
          for (let i = 0; i < times; i++)
            for (const error of errors())
              await recordFailure(error, {
                ...ctx(error),
                restaurant: "bernay",
              });
        },
      ),
  );
}

test("authenticated : le statut transmis est celui que `failure` renvoie", async () => {
  for (const error of [
    ...memberMistakes(),
    new Error("Compte suspendu ou non autorisé."),
    new Error("Connexion requise."),
    new Error("Limite de requêtes atteinte."),
  ])
    assert.equal(failureStatus(error), failure(error).status);
  const [zod, business, done, changed] = memberMistakes();
  assert.deepEqual(
    [zod, business, done, changed].map(failureStatus),
    [400, 400, 409, 409],
  );
  // Avant : un statut 403 fixe classait toute erreur en refus d'accès.
  for (const error of memberMistakes())
    assert.equal(
      classifyFailure(error, { endpoint: "authenticated", status: 403 })
        .event_type,
      "access.denied",
    );
  // Après : validation et règles métier gardent leur classement.
  assert.deepEqual(
    memberMistakes().map(
      (error) =>
        classifyFailure(error, {
          endpoint: "authenticated",
          status: failureStatus(error),
        }).event_type,
    ),
    [
      "request.invalid",
      "operation.refused",
      "operation.refused",
      "operation.refused",
    ],
  );
  const suspended = new Error("Compte suspendu ou non autorisé.");
  assert.equal(
    classifyFailure(suspended, {
      endpoint: "authenticated",
      status: failureStatus(suspended),
    }).event_type,
    "access.denied",
  );
});

test("/api/v1 : le statut transmis est celui de la réponse", () => {
  assert.equal(v1FailureStatus(new Error("Connexion requise.")), 401);
  assert.equal(v1FailureStatus(new Error("Accès refusé pour ce profil.")), 403);
  assert.equal(v1FailureStatus(new Error("Établissement non autorisé.")), 403);
  assert.equal(v1FailureStatus(new Error("Commande déjà réglée.")), 400);
  assert.equal(v1FailureStatus(validation()), 400);
  const denied = new Error("Accès refusé pour ce profil.");
  // Avant : 400 fixe, un vrai refus n'était jamais un refus d'accès.
  assert.equal(
    classifyFailure(denied, { endpoint: "/api/v1", status: 400 }).event_type,
    "operation.refused",
  );
  assert.equal(
    classifyFailure(denied, {
      endpoint: "/api/v1",
      status: v1FailureStatus(denied),
    }).event_type,
    "access.denied",
  );
  assert.equal(
    classifyFailure(new Error("Connexion requise."), {
      endpoint: "/api/v1",
      status: v1FailureStatus(new Error("Connexion requise.")),
    }).event_type,
    "auth.required",
  );
});

test("access_denied_burst ignore les erreurs métier d'un membre (avant / après)", async () => {
  // Avant : 12 × 4 erreurs ordinaires, toutes notées 403.
  await fail("member-before", 12, memberMistakes, () => ({
    endpoint: "authenticated",
    status: 403,
  }));
  const before = await deniedBurst("member-before");
  assert.equal(before.length, 1, "l'ancien statut signalait le membre");
  assert.equal(
    rules.find((r) => r.id === "access_denied_burst")!.remediation,
    "revoke_actor_sessions",
  );
  // Après : le même volume ne produit aucun refus d'accès.
  await fail("member-after", 12, memberMistakes, (error) => ({
    endpoint: "authenticated",
    status: failureStatus(error),
  }));
  assert.deepEqual(await deniedBurst("member-after"), []);
  const { rows } = await db.query<{ event_type: string; n: number }>(
    "SELECT event_type,count(*)::int AS n FROM ops_security_events WHERE actor_id='member-after' GROUP BY 1 ORDER BY 1",
  );
  assert.deepEqual(rows, [
    { event_type: "operation.refused", n: 36 },
    { event_type: "request.invalid", n: 12 },
  ]);
  // Les vrais refus de ce chemin restent détectés.
  await fail(
    "member-suspended",
    10,
    () => [new Error("Compte suspendu ou non autorisé.")],
    (error) => ({ endpoint: "authenticated", status: failureStatus(error) }),
  );
  assert.equal((await deniedBurst("member-suspended")).length, 1);
});

test("access_denied_burst voit les vrais refus de /api/v1 (avant / après)", async () => {
  const denied = () => [new Error("Accès refusé pour ce profil.")];
  await fail("v1-before", 10, denied, () => ({
    endpoint: "/api/v1",
    status: 400,
  }));
  assert.deepEqual(await deniedBurst("v1-before"), []);
  await fail("v1-after", 10, denied, (error) => ({
    endpoint: "/api/v1",
    status: v1FailureStatus(error),
  }));
  const after = await deniedBurst("v1-after");
  assert.equal(after.length, 1);
  assert.equal(after[0].context.denied, 10);
  // Une erreur métier sur /api/v1 reste hors de la règle.
  await fail(
    "v1-business",
    10,
    () => [new Error("Commande déjà réglée.")],
    (error) => ({ endpoint: "/api/v1", status: v1FailureStatus(error) }),
  );
  assert.deepEqual(await deniedBurst("v1-business"), []);
});
