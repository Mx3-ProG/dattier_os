import { test, expect, type Page } from "@playwright/test";
import { defaultAppearance } from "../../src/features/appearance/theme";
const origin = process.env.E2E_URL || "http://127.0.0.1:3000";
async function login(page: Page, id = "nadia") {
  await page.request.post("/api/v1/login", {
    headers: { origin },
    data: { id },
  });
  await page.addInitScript(() => {
    for (const id of ["nadia", "karim"])
      localStorage.setItem(
        `atacuisine-tour:v1:${id}`,
        JSON.stringify({ seen: true, done: [] }),
      );
  });
}
test("taille lisible, repères personnalisés, journal compréhensible et mobile", async ({
  page,
}) => {
  test.setTimeout(120000);
  await login(page);
  const data = {
    ...defaultAppearance,
    mode: "dark",
    textSize: "extraLarge",
    categoryColors: {
      ...defaultAppearance.categoryColors,
      operations: "#ffccff",
      team: "#009900",
    },
  };
  expect(
    (
      await page.request.put("/api/me/appearance", {
        headers: { origin, "X-Appearance-Account": "nadia" },
        data,
      })
    ).ok(),
  ).toBeTruthy();
  await page.route("**/api/v1/state?**", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.audit = [
      "Action : clock",
      "Action : purchase",
      "Action : read",
      "Demande de réservation publique",
      "Site : média importé",
      "SEO : audit terminé",
    ].map((action, i) => ({
      id: `appearance-test-${i}`,
      action,
      name: "Compte fictif",
      created_at: new Date().toISOString(),
      object_id: null,
    }));
    await route.fulfill({ response, json: body });
  });
  await page.goto("/dashboard?restaurant=bernay&module=activity");
  await expect(
    page.getByText("Pointage de l’équipe", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Achat enregistré", { exact: true }),
  ).toBeVisible();
  const row = page.locator('.timeline > [data-activity-category="team"]');
  await expect(row).toContainText("Équipe");
  expect(
    await row
      .locator("b")
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(18);
  await page
    .getByRole("group", { name: "Filtrer les activités" })
    .getByRole("button", { name: "Équipe", exact: true })
    .click();
  await expect(page.locator(".timeline > div")).toHaveCount(1);
  await page.getByRole("button", { name: "Personnaliser mon espace" }).click();
  await expect(page.getByLabel("Taille des textes")).toHaveValue("extraLarge");
  await expect(page.getByLabel("Couleur — Équipe")).toHaveValue("#009900");
  await page.getByLabel("Couleur — Équipe").fill("#ff0000");
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  expect(
    (await (await page.request.get("/api/me/appearance")).json()).appearance
      .categoryColors.team,
  ).toBe("#009900");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.locator(".mobile-toggle").click();
  await page.getByRole("button", { name: "Personnaliser mon espace" }).click();
  await expect(
    page.getByRole("button", { name: "Enregistrer", exact: true }),
  ).toBeInViewport();
  await page.screenshot({ path: "/tmp/accessible-appearance-mobile.png" });
  await page.getByLabel("Taille des textes").selectOption("large");
  await page.getByLabel("Couleur — Équipe").fill("#aa00aa");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  const pref = (await (await page.request.get("/api/me/appearance")).json())
    .appearance;
  expect(pref.textSize).toBe("large");
  expect(pref.categoryColors.team).toBe("#aa00aa");
  await login(page, "karim");
  const colleague = (
    await (await page.request.get("/api/me/appearance")).json()
  ).appearance;
  expect(colleague.categoryColors.team).not.toBe("#aa00aa");
});

test("les sites publics proposent jour/nuit, mémorisent le choix et gardent leurs formulaires lisibles", async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/r/bernay");
  await page.getByRole("button", { name: "Mode nuit du site" }).click();
  await expect(page.locator(".donut-site")).toHaveAttribute(
    "data-public-mode",
    "dark",
  );
  await expect(page.locator(".donut-site")).toHaveCSS(
    "background-color",
    "rgb(17, 19, 24)",
  );
  await page.screenshot({ path: "/tmp/public-site-night.png", fullPage: true });
  for (const url of [
    "/r/bernay/carte",
    "/r/bernay/contact",
    "/r/bernay/compte",
    "/r/bernay/checkout",
  ]) {
    await page.goto(url);
    await expect(page.locator(".donut-site")).toHaveAttribute(
      "data-public-mode",
      "dark",
    );
  }
  await page.goto("/r/bernay/carte");
  await expect(page.locator(".donut-categories .selected").first()).not.toHaveCSS(
    "background-color", "rgb(241, 244, 243)",
  );
  await page.goto("/r/bernay/reservations");
  await expect(page.locator("input").first()).toHaveCSS(
    "background-color",
    "rgb(27, 30, 38)",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Mode jour du site" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Mode jour du site" }).click();
  await page.reload();
  await expect(page.locator(".donut-site")).toHaveAttribute(
    "data-public-mode",
    "light",
  );
  await expect(page.locator(".step-index").first()).toHaveCSS(
    "background-color", "rgb(52, 77, 62)",
  );
  const cookie = (await context.cookies()).find(
    (c) => c.name === "atacuisine_public_mode",
  );
  expect(cookie?.value).toBe("light");
  await context.clearCookies();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.locator(".donut-site")).toHaveAttribute(
    "data-public-mode",
    "system",
  );
  await expect(page.locator(".donut-site")).toHaveCSS(
    "background-color",
    "rgb(17, 19, 24)",
  );
  expect(await page.locator(".appearance-application").count()).toBe(0);
});
