import { randomUUID } from "node:crypto";
import type { Client, Pool } from "pg";
import { sessionCookie } from "./http";
import type { World } from "./seed";

type Check = (section: string, ok: boolean, detail: string) => void;
type Context = {
  userId?: string;
  restaurantId?: string;
  public?: boolean;
};
type Event = {
  event_id: string;
  severity: number;
  action: string;
  actor_id: string | null;
  session_id: string | null;
  correlation_id: string | null;
  message: string;
  technical_details: {
    source?: string;
    occurrences?: number;
    client?: string | null;
  };
};
const TYPE = "access.denied.external";

/** Comme l'application : contexte de transaction posé, puis validation réelle. */
async function asApp<T extends object>(
  pool: Pool,
  context: Context,
  sql: string,
  params: unknown[] = [],
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT set_config('app.user_id',$1,true),set_config('app.restaurant_id',$2,true),set_config('app.public',$3,true),set_config('app.customer_id','',true)",
      [
        context.userId || "",
        context.restaurantId || "",
        context.public ? "true" : "false",
      ],
    );
    const result = await client.query<T>(sql, params as never[]);
    await client.query("COMMIT");
    return { rows: result.rows, count: result.rowCount ?? 0 };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    return {
      rows: [] as T[],
      count: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    client.release();
  }
}

const events = async (migrator: Client, restaurant: string) =>
  (
    await migrator.query<Event>(
      "SELECT * FROM ops_security_events WHERE restaurant_id=$1 AND event_type=$2 ORDER BY occurred_at,event_id",
      [restaurant, TYPE],
    )
  ).rows;

/** Attributs de B qui ne doivent jamais atteindre le journal de A. */
const foreignValues = (world: World) => [
  world.profile.ownerB,
  world.restaurant.b1,
  world.org.b,
  `${world.profile.ownerB}@example.test`,
];
const exposed = (world: World, text: string) =>
  foreignValues(world).find((value) => text.includes(value));

export async function deniedJournalSqlChecks(
  world: World,
  migrator: Client,
  web: Pool,
  check: Check,
) {
  const section = "Journal des refus : SQL";
  const { ownerA, ownerB, employeeA1 } = world.profile;
  const { a1, a2, b1 } = world.restaurant;
  const deny = (
    context: Context,
    target: string,
    route = "/api/test/[restaurant]",
    client = "abc123def4567890",
    correlation: string = randomUUID(),
  ) =>
    asApp<{ outcome: string }>(
      web,
      context,
      "SELECT app.record_denied_access($1,$2,$3,$4) AS outcome",
      [target, route, client, correlation],
    );

  // Droits : la fonction est la seule porte, et le compteur reste inaccessible.
  const catalog = await migrator.query<{
    definer: boolean;
    pinned: boolean;
    web_can: boolean;
    other_can: boolean;
    counters: boolean;
  }>(
    `SELECT p.prosecdef AS definer,
            coalesce(p.proconfig::text LIKE '%search_path=%',false) AS pinned,
            has_function_privilege('atacuisine_web',p.oid,'EXECUTE') AS web_can,
            has_function_privilege('atacuisine_identity',p.oid,'EXECUTE') AS other_can,
            has_any_column_privilege('atacuisine_web','app.denied_access_counters','SELECT,INSERT,UPDATE,REFERENCES')
              OR has_table_privilege('atacuisine_jobs','app.denied_access_counters','SELECT,INSERT,UPDATE,DELETE') AS counters
       FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='app' AND p.proname='record_denied_access'`,
  );
  const f = catalog.rows[0];
  check(section, !!f?.definer && !!f.pinned, "Fonction sans SECURITY DEFINER ou search_path libre");
  check(section, !!f?.web_can, "Le login web ne peut pas journaliser");
  check(section, f?.other_can === false, "La fonction est ouverte à d'autres rôles");
  check(section, f?.counters === false, "Le compteur interne est accessible à l'application");

  // B vers A : l'événement arrive chez A, avec un contenu figé et rien sur B.
  const correlation = randomUUID();
  const first = await deny(
    { userId: ownerB, restaurantId: a1 },
    a1,
    "/api/test/[restaurant]",
    "abc123def4567890",
    correlation,
  );
  check(
    section,
    first.rows[0]?.outcome === "logged",
    `B vers A1 : ${first.error ?? first.rows[0]?.outcome}`,
  );
  const logged = (await events(migrator, a1)).find(
    (e) => e.correlation_id === correlation,
  );
  check(section, !!logged, "Aucun événement chez A après un refus de B");
  check(
    section,
    logged?.actor_id === null && logged?.session_id === null,
    "L'événement expose le compte ou la session de B",
  );
  check(
    section,
    logged?.severity === 4 && logged?.action === "/api/test/[restaurant]",
    `Contenu inattendu : ${JSON.stringify(logged)}`,
  );
  const leak = exposed(world, JSON.stringify(logged ?? null));
  check(section, !leak, `L'événement chez A contient ${leak}`);

  // Le propriétaire de A le lit avec le vrai login web, et personne d'autre.
  const visible = (context: Context, restaurant: string) =>
    asApp<{ event_id: string }>(
      web,
      context,
      "SELECT event_id FROM ops_security_events WHERE restaurant_id=$1 AND event_type=$2",
      [restaurant, TYPE],
    );
  const owner = await visible({ userId: ownerA, restaurantId: a1 }, a1);
  check(
    section,
    owner.rows.some((e) => e.event_id === logged?.event_id),
    `Le propriétaire de A ne voit pas l'événement : ${owner.error ?? owner.count}`,
  );
  for (const [label, context] of [
    ["B dans le contexte de A", { userId: ownerB, restaurantId: a1 }],
    ["B dans son propre contexte", { userId: ownerB, restaurantId: b1 }],
    ["anonyme", { public: true, restaurantId: a1 }],
  ] as const) {
    const seen = await visible(context, a1);
    check(section, !seen.count, `${label} lit le journal de A (${seen.count})`);
  }

  // La fonction n'ouvre rien d'autre à B.
  const asB = { userId: ownerB, restaurantId: a1 };
  const insert = await asApp(
    web,
    asB,
    "INSERT INTO ops_security_events(event_id,severity,event_type,module,action,restaurant_id,message) VALUES($1,6,'forge','security','forge',$2,'forge')",
    [randomUUID(), a1],
  );
  check(section, !!insert.error, "B écrit directement dans le journal de A");
  for (const sql of [
    "UPDATE ops_security_events SET message='forge' WHERE event_id=$1",
    "DELETE FROM ops_security_events WHERE event_id=$1",
  ]) {
    const change = await asApp(web, asB, sql, [logged?.event_id]);
    check(section, !change.count, `B modifie le journal de A : ${sql}`);
  }
  const owned = await asApp(
    web,
    { userId: ownerA, restaurantId: a1 },
    "SELECT * FROM app.denied_access_counters",
  );
  check(section, !!owned.error, "Le compteur interne est lisible par le web");
  const forged = await asApp(
    web,
    asB,
    "DELETE FROM app.denied_access_counters",
  );
  check(section, !!forged.error, "B remet à zéro le compteur de A");
  check(
    section,
    !(await events(migrator, b1)).length,
    "Un refus sur A a écrit dans le journal de B",
  );

  // Un membre, un anonyme et le canal public gardent le journal normal.
  for (const [label, context, target] of [
    ["propriétaire sur son établissement", { userId: ownerA, restaurantId: a1 }, a1],
    ["propriétaire sur son second établissement", { userId: ownerA, restaurantId: a1 }, a2],
    ["employé sur son établissement", { userId: employeeA1, restaurantId: a1 }, a1],
    ["sans compte", { restaurantId: a1 }, a1],
    ["canal public", { public: true, restaurantId: a1 }, a1],
  ] as const) {
    const before = (await events(migrator, target)).length;
    const result = await deny(context, target);
    const after = (await events(migrator, target)).length;
    check(
      section,
      result.rows[0]?.outcome === "not_applicable" && before === after,
      `${label} : ${result.error ?? result.rows[0]?.outcome}, lignes ${before} → ${after}`,
    );
  }

  // Un employé d'une organisation reste extérieur à l'autre établissement.
  const before = (await events(migrator, a2)).length;
  const sibling = await deny({ userId: employeeA1, restaurantId: a2 }, a2);
  check(
    section,
    sibling.rows[0]?.outcome === "logged" &&
      (await events(migrator, a2)).length === before + 1,
    `Employé de A1 sur A2 : ${sibling.error ?? sibling.rows[0]?.outcome}`,
  );

  // Aucune ligne pour un établissement inexistant.
  const ghost = `iso-${world.run}-inconnu`;
  await deny({ userId: ownerB, restaurantId: ghost }, ghost);
  check(
    section,
    !(await events(migrator, ghost)).length,
    "Un identifiant inventé crée des lignes dans le journal",
  );

  // Les valeurs de l'appelant sont validées ou écartées, jamais recopiées.
  const hostile = `/api/x?token=${"s".repeat(40)}&mail=a@b.test`;
  const hostileUser = `iso-${world.run}-hostile`;
  await deny(
    { userId: hostileUser, restaurantId: a2 },
    a2,
    hostile,
    "<script>alert(1)</script>",
    "pas-un-uuid",
  );
  const stored = (await events(migrator, a2)).at(-1);
  check(
    section,
    stored?.action === "Route inconnue" &&
      stored?.correlation_id === null &&
      stored?.technical_details.client === null &&
      !JSON.stringify(stored).includes(hostileUser),
    `Valeurs d'appel recopiées : ${JSON.stringify(stored)}`,
  );

  // Borne par source : 500 tentatives, quelques lignes, le volume réel reste connu.
  const flooder = `iso-${world.run}-flood`;
  const hourOf = async () =>
    (
      await migrator.query<{ h: string }>(
        "SELECT date_trunc('hour',now())::text AS h",
      )
    ).rows[0].h;
  const startHour = await hourOf();
  const countBefore = (await events(migrator, a2)).length;
  for (let i = 0; i < 500; i++)
    await deny({ userId: flooder, restaurantId: a2 }, a2);
  const flood = (await events(migrator, a2)).slice(countBefore);
  check(
    section,
    flood.length <= 10,
    `500 tentatives ont produit ${flood.length} lignes`,
  );
  if ((await hourOf()) === startHour) {
    const seen = flood.map((e) => e.technical_details.occurrences);
    check(
      section,
      JSON.stringify(seen) === "[1,2,3,10,100]",
      `Paliers inattendus : ${JSON.stringify(seen)}`,
    );
    check(
      section,
      /^100 tentatives/.test(flood.at(-1)?.message ?? ""),
      `Volume absent du message : ${flood.at(-1)?.message}`,
    );
  }

  // Borne par établissement : des comptes en série ne créent pas de sources sans fin.
  const rotationBefore = (await events(migrator, a2)).length;
  for (let i = 0; i < 40; i++)
    await deny({ userId: `iso-${world.run}-rot-${i}`, restaurantId: a2 }, a2);
  const counters = await migrator.query<{ n: number; pooled: number }>(
    "SELECT count(*)::int AS n,coalesce(max(attempts) FILTER (WHERE source='*'),0)::int AS pooled FROM app.denied_access_counters WHERE restaurant_id=$1",
    [a2],
  );
  check(
    section,
    counters.rows[0].n <= 21,
    `${counters.rows[0].n} sources suivies pour un seul établissement`,
  );
  check(
    section,
    counters.rows[0].pooled > 0,
    "Les sources au-delà du plafond ne sont plus comptées",
  );
  const rotation = (await events(migrator, a2)).length - rotationBefore;
  check(section, rotation <= 40, `40 comptes ont produit ${rotation} lignes`);

  // Écrire chez A2 ne touche pas A1, ni la possibilité pour A de journaliser.
  const a1Count = await migrator.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM app.denied_access_counters WHERE restaurant_id=$1",
    [a1],
  );
  check(section, a1Count.rows[0].n === 1, "Le plafond de A2 déborde sur A1");
}

/** Le parcours réel : une requête refusée de B, lue par le propriétaire de A. */
export async function deniedJournalHttpChecks(
  world: World,
  migrator: Client,
  appUrl: string,
  logs: () => string,
  check: Check,
) {
  const section = "Journal des refus : HTTP";
  const { ownerA, ownerB, employeeA1 } = world.profile;
  const { a1, b1 } = world.restaurant;
  const get = async (url: string, cookie: string) => {
    const response = await fetch(`${appUrl}${url}`, {
      redirect: "manual",
      headers: { cookie },
    });
    return { status: response.status, text: await response.text() };
  };
  const b = await sessionCookie(ownerB),
    a = await sessionCookie(ownerA),
    employee = await sessionCookie(employeeA1);
  const list = (restaurant: string) =>
    `/api/ops-security/${restaurant}?view=events&type=${TYPE}`;

  const refused = await get(`/api/restaurants/${a1}/finance`, b);
  check(
    section,
    refused.status >= 400 && refused.status < 500,
    `B obtient ${refused.status} sur les finances de A`,
  );
  const direct = await get(`/api/v1/state?restaurant=${a1}`, b);
  check(section, direct.status === 403, `B sur /api/v1/state : ${direct.status}`);

  // Le propriétaire de A voit la trace par la route du centre de sécurité.
  const read = await get(list(a1), a);
  check(section, read.status === 200, `Lecture par A : ${read.status} ${read.text.slice(0, 200)}`);
  const body = read.status === 200 ? (JSON.parse(read.text) as unknown) : [];
  const rows = (
    Array.isArray(body) ? body : ((body as { events?: Event[] }).events ?? [])
  ) as Event[];
  check(section, rows.length > 0, "A ne voit aucune tentative de B");
  check(
    section,
    rows.every((e) => e.actor_id === null),
    "A voit le compte de B",
  );
  check(
    section,
    rows.some((e) => !!e.technical_details?.source),
    "A n'a pas d'empreinte pour regrouper les tentatives",
  );
  check(
    section,
    rows.some((e) => e.action?.startsWith("/api/")),
    "A ne sait pas quelle route a été visée",
  );
  const leak = exposed(world, read.text);
  check(section, !leak, `La réponse à A contient ${leak}`);

  // B ne lit rien chez A, et rien n'arrive dans son propre journal.
  const stolen = await get(list(a1), b);
  check(
    section,
    stolen.status >= 400 && stolen.status < 500 && !stolen.text.includes(TYPE),
    `B lit le journal de A : ${stolen.status}`,
  );
  const own = await get(list(b1), b);
  check(section, own.status === 200, `B ne lit plus son journal : ${own.status}`);
  check(
    section,
    !own.text.includes(TYPE) && !own.text.includes(a1),
    "Le journal de B contient une trace de ses tentatives chez A",
  );

  // Toutes les routes de cette vérification n'ont produit que quelques lignes.
  const volume = await migrator.query<{ source: string; attempts: number; rows: number }>(
    `SELECT c.source,c.attempts,(SELECT count(*)::int FROM ops_security_events e
        WHERE e.restaurant_id=c.restaurant_id AND e.event_type=$2 AND e.technical_details->>'source'=c.source
          AND e.occurred_at>=c.window_start) AS rows
       FROM app.denied_access_counters c WHERE c.restaurant_id=$1`,
    [a1, TYPE],
  );
  for (const v of volume.rows)
    check(
      section,
      v.rows <= 3 + String(v.attempts).length,
      `${v.attempts} tentatives, ${v.rows} lignes`,
    );

  // Le chemin normal fonctionne toujours : un employé refusé chez lui reste identifié.
  const denied = await get(list(a1), employee);
  check(section, denied.status === 403, `Employé sur le journal : ${denied.status}`);
  const inside = await migrator.query(
    "SELECT 1 FROM ops_security_events WHERE restaurant_id=$1 AND event_type='access.denied' AND actor_id=$2",
    [a1, employeeA1],
  );
  check(section, !!inside.rowCount, "Le refus d'un membre n'est plus journalisé");

  // Plus aucun événement perdu dans le tampon du processus web.
  const lost = logs()
    .split("\n")
    .filter((line) => line.includes("security-journal-unavailable"));
  check(
    section,
    !lost.length,
    `${lost.length} événements non écrits, par exemple ${lost[0]?.slice(0, 200)}`,
  );
}
