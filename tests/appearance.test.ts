import {
  activityPresentation,
  moduleCategory,
} from "../src/features/appearance/categories";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { migrate } from "../src/infrastructure/database/migrate";
import { seed } from "../src/infrastructure/database/seed";
import {
  readAppearance,
  saveAppearance,
} from "../src/features/appearance/service";
import {
  appearanceSchema,
  contrast,
  defaultAppearance,
  palettes,
  themeVariables,
} from "../src/features/appearance/theme";

let db: PGlite;
before(async () => {
  db = new PGlite();
  await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
  await migrate(db);
  await db.transaction(seed);
});
after(async () => {
  await db.close();
});
test("couleurs extrêmes : textes et boutons restent lisibles", () => {
  for (const color of [
    ...palettes.map((p) => p[1]),
    "#ffffff",
    "#000000",
    "#ffff00",
    "#00ff00",
    "#ff00ff",
  ]) {
    const v = themeVariables({ color, font: "inter" });
    assert.ok(contrast(v["--appearance-accent"], "#ffffff") >= 4.5, color);
    for (const bg of ["bg", "surface", "soft"]) {
      for (const fg of ["ink", "muted"])
        assert.ok(
          contrast(v[`--appearance-${fg}`], v[`--appearance-${bg}`]) >= 4.5,
          `${color} ${fg}/${bg}`,
        );
    }
  }
});
test("validation : aucune police libre, injection CSS ou identité fournie", () => {
  for (const raw of [
    { color: "red", font: "inter" },
    { color: "#ffffff;background:red", font: "default" },
    { color: "#ffffff", font: "url(x)" },
    { ...defaultAppearance, userId: "nadia" },
  ])
    assert.equal(appearanceSchema.safeParse(raw).success, false);
});
test("migration réentrante et préférences propres à chaque compte", async () => {
  await migrate(db);
  assert.deepEqual(
    (await readAppearance(db, "nadia")).appearance,
    defaultAppearance,
  );
  await saveAppearance(db, "nadia", { color: "#B73578", font: "inter" });
  await saveAppearance(db, "karim", { color: "#2563b8", font: "nunito" });
  assert.deepEqual((await readAppearance(db, "nadia")).appearance, {
    ...defaultAppearance,
    color: "#b73578",
    font: "inter",
    mode: "light",
  });
  assert.equal((await readAppearance(db, "karim")).appearance.color, "#2563b8");
  await saveAppearance(db, "nadia", defaultAppearance);
  assert.deepEqual(
    (await readAppearance(db, "nadia")).appearance,
    defaultAppearance,
  );
});
test("RLS : même un compte connecté ne lit ni ne modifie les préférences d’un collègue", async () => {
  await db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE atacuisine_app");
    await tx.query("SELECT set_config('app.user_id','nadia',true)");
    const rows = await tx.query("SELECT profile_id FROM profile_appearance");
    assert.deepEqual(rows.rows, [{ profile_id: "nadia" }]);
    await tx.query(
      "UPDATE profile_appearance SET color='#ffffff' WHERE profile_id='karim'",
    );
  });
  assert.equal((await readAppearance(db, "karim")).appearance.color, "#2563b8");
  await assert.rejects(
    db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE atacuisine_app");
      await tx.query("SELECT set_config('app.user_id','nadia',true)");
      await saveAppearance(tx, "karim", defaultAppearance);
    }),
    /row-level security/,
  );
});

test("deux collègues du même rôle restent indépendants", async () => {
  await db.query(
    "INSERT INTO profiles(id,name,role) VALUES('appearance-chef','Autre chef','CHEF')",
  );
  await saveAppearance(db, "appearance-chef", {
    color: "#b73578",
    font: "poppins",
  });
  assert.equal((await readAppearance(db, "karim")).appearance.color, "#2563b8");
  assert.equal(
    (await readAppearance(db, "appearance-chef")).appearance.color,
    "#b73578",
  );
});

test("jour et nuit : contrastes lisibles pour toutes les palettes et couleurs extrêmes", () => {
  for (const mode of ["light", "dark"] as const)
    for (const color of [
      ...palettes.map((p) => p[1]),
      "#ffffff",
      "#000000",
      "#ffff00",
      "#00ff00",
    ]) {
      const v = themeVariables({ color, font: "default", mode });
      assert.ok(
        contrast(v["--appearance-accent"], v["--appearance-on-accent"]) >= 4.5,
      );
      for (const bg of ["bg", "surface", "soft"])
        for (const fg of ["ink", "muted", "link"])
          assert.ok(
            contrast(v[`--appearance-${fg}`], v[`--appearance-${bg}`]) >= 4.5,
            `${mode} ${color} ${fg}/${bg}`,
          );
    }
});
test("mode enregistré par profil et anciens réglages compatibles", async () => {
  await saveAppearance(db, "nadia", {
    color: "#7950b5",
    font: "inter",
    mode: "dark",
  });
  assert.equal((await readAppearance(db, "nadia")).appearance.mode, "dark");
  assert.equal((await readAppearance(db, "karim")).appearance.mode, "light");
  assert.equal(
    appearanceSchema.parse({ color: "#7950b5", font: "inter" }).mode,
    "light",
  );
  assert.equal(
    appearanceSchema.safeParse({
      color: "#7950b5",
      font: "inter",
      mode: "invalid",
    }).success,
    false,
  );
});

test("les statuts gardent leurs couleurs et un contraste lisible dans les deux modes", () => {
  for (const mode of ["light", "dark"] as const) {
    const v = themeVariables({ color: "#7950b5", font: "inter", mode });
    for (const status of ["success", "warning", "danger", "info"]) {
      assert.ok(
        contrast(
          v[`--appearance-${status}-bg`],
          v[`--appearance-${status}-ink`],
        ) >= 4.5,
        `${mode}/${status}`,
      );
    }
  }
});

test("tailles et couleurs de catégories sont privées, persistantes et validées", async () => {
  const colors = { ...defaultAppearance.categoryColors, operations: "#ffccff" };
  await saveAppearance(db, "nadia", {
    ...defaultAppearance,
    textSize: "extraLarge",
    categoryColors: colors,
  });
  assert.deepEqual(
    (await readAppearance(db, "nadia")).appearance.categoryColors,
    colors,
  );
  assert.equal(
    (await readAppearance(db, "nadia")).appearance.textSize,
    "extraLarge",
  );
  assert.equal(
    (await readAppearance(db, "karim")).appearance.textSize,
    "standard",
  );
  assert.equal(
    appearanceSchema.safeParse({ ...defaultAppearance, textSize: "999" })
      .success,
    false,
  );
  assert.equal(
    appearanceSchema.safeParse({
      ...defaultAppearance,
      categoryColors: { ...colors, operations: "url(x)" },
    }).success,
    false,
  );
  for (const mode of ["dark", "light"] as const)
    for (const color of ["#ffffff", "#000000", "#ffff00", "#ffccff"]) {
      const v = themeVariables({
        ...defaultAppearance,
        mode,
        categoryColors: { ...colors, operations: color },
      });
      assert.ok(
        contrast(
          v["--category-operations-ink"],
          v["--category-operations-bg"],
        ) >= 4.5,
      );
    }
});

test("le journal classe et traduit les actions sans changer les données stockées", () => {
  for (const [action, category] of [
    ["Site : média importé", "configuration"],
    ["Action : clock", "team"],
    ["Action : purchase", "management"],
    ["Action : read", "pilotage"],
    ["Demande de réservation publique", "operations"],
    ["Ingrédient créé", "management"],
    ["SEO : audit terminé", "configuration"],
    ["Action : recipe", "management"],
  ])
    assert.equal(activityPresentation(action).category, category, action);
  assert.equal(
    activityPresentation("Action : purchase").label,
    "Achat enregistré",
  );
  assert.equal(moduleCategory("kitchen"), moduleCategory("orders"));
  assert.equal(activityPresentation("Événement inconnu").category, "pilotage");
});
