import { test, expect, type Page } from "@playwright/test";
const origin = process.env.E2E_URL || "http://127.0.0.1:3000";
async function open(page: Page) {
  expect(
    (
      await page.request.post("/api/v1/login", {
        headers: { origin },
        data: { id: "nadia" },
      })
    ).ok(),
  ).toBeTruthy();
  await page.addInitScript(() =>
    localStorage.setItem(
      "atacuisine-tour:v1:nadia",
      JSON.stringify({ seen: true, done: [] }),
    ),
  );
  await page.goto("/dashboard?restaurant=bernay&module=addons");
  await expect(
    page.getByRole("button", { name: /^Mes add-ons \(/ }),
  ).toBeVisible();
}
test("addons belongs to the single bottom Configuration group and separates owned from shop", async ({
  page,
}) => {
  await open(page);
  const nav = page.locator(".sidebar nav");
  await expect(
    nav.locator(".nav-group").filter({ hasText: "CONFIGURATION" }),
  ).toHaveCount(1);
  await expect(nav.locator("button").last()).toHaveAttribute(
    "data-tour",
    "nav-addons",
  );
  await expect(nav.locator(".nav-group").last()).toHaveText("CONFIGURATION");
  const owned = page.getByRole("region", { name: "Mes add-ons", exact: true });
  await expect(owned.getByRole("article")).toHaveCount(6);
  await expect(
    owned.getByRole("heading", { name: "Salle", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Boutique d’add-ons/ }).click();
  await expect(
    page.getByText("Vous possédez déjà tous les add-ons de ce catalogue.", {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Crédits Studio", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Un budget pour les usages à la consommation",
    }),
  ).toBeVisible();
});
test("the shop presents installable trade tools by industry on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.getByRole("button", { name: /^Boutique d’add-ons/ }).click();
  for (const industry of ["Restauration", "BTP", "Coiffure", "Commerce", "Tous métiers"]) {
    const region = page.getByRole("region", { name: industry, exact: true });
    await expect(region.getByRole("heading", { name: industry, exact: true })).toBeVisible();
    await expect(region.getByRole("article").first()).toBeVisible();
  }
  await expect(page.getByRole("region", { name: "Add-ons à venir" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
test("basic plan and subscription states show distinct collections on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let status = "active";
  await page.route("**/api/restaurants/bernay/addons", (route) =>
    route.fulfill({
      json: {
        plan: 39,
        admin: true,
        ready: false,
        subscriptions: [
          { addon: "invoices", status, valid_until: "2099-01-01T00:00:00Z" },
        ],
      },
    }),
  );
  await open(page);
  const owned = page.getByRole("region", { name: "Mes add-ons", exact: true });
  await expect(owned.getByRole("article")).toHaveCount(3);
  await expect(
    owned.getByRole("heading", { name: "Factures fournisseurs" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Boutique d’add-ons/ }).click();
  const shop = page.getByRole("region", {
    name: "Boutique d’add-ons",
    exact: true,
  });
  await expect(shop.getByRole("article")).toHaveCount(3);
  await expect(
    shop.getByRole("heading", { name: "Factures fournisseurs" }),
  ).toHaveCount(0);
  await expect(shop.getByText("Bientôt disponible à l’achat.")).toHaveCount(3);
  status = "pending";
  await page.reload();
  await expect(owned.getByRole("article")).toHaveCount(2);
  await page.getByRole("button", { name: /^Boutique d’add-ons/ }).click();
  await expect(shop.getByRole("article")).toHaveCount(4);
  await expect(shop.getByText("Paiement de test en attente")).toBeVisible();
  await expect(
    shop.getByRole("button", { name: "Reprendre le paiement · test" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("owned addon opens its existing module and discovery never starts a checkout", async ({
  page,
}) => {
  let checkoutCalls = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/addons") && request.method() === "POST")
      checkoutCalls++;
  });
  await open(page);
  const floor = page.getByRole("article", { name: "Salle", exact: true });
  await floor.getByText("Découvrir Salle", { exact: true }).click();
  await expect(
    floor.getByText(
      "Préparer la disposition de la terrasse avant le début du service.",
      { exact: true },
    ),
  ).toBeVisible();
  await floor.getByRole("button", { name: "Ouvrir le plan de salle" }).click();
  await expect(page.locator('[data-tour="nav-dining"]')).toHaveClass("active");
  await expect(page.locator(".page-heading h1")).toHaveText("Plan de salle");
  expect(checkoutCalls).toBe(0);
  await page.locator('[data-tour="nav-addons"]').click();
  const invoices = page.getByRole("article", {
    name: "Factures fournisseurs",
    exact: true,
  });
  await invoices
    .getByRole("button", { name: "Ouvrir les factures fournisseurs" })
    .click();
  await expect(page.locator('[data-tour="nav-invoices"]')).toHaveClass(
    "active",
  );
});

test("scheduled cancellation keeps the addon usable and shows the paid period", async ({
  page,
}) => {
  let stopped = false;
  let requests = 0;
  let plan = 39;
  const state = () => ({
    plan,
    admin: true,
    ready: true,
    subscriptions: [
      {
        addon: "invoices",
        status: "active",
        valid_until: "2099-01-01T00:00:00Z",
        renewal_cancelled: stopped,
      },
    ],
  });
  await page.route("**/api/restaurants/bernay/addons", async (route) => {
    if (route.request().method() === "DELETE") {
      requests++;
      stopped = true;
      await route.fulfill({
        json: {
          message:
            "Renouvellement arrêté. L’accès est conservé jusqu’à la fin de la période payée.",
          state: state(),
        },
      });
    } else await route.fulfill({ json: state() });
  });
  await open(page);
  const card = page.getByRole("article", {
    name: "Factures fournisseurs",
    exact: true,
  });
  await expect(
    card.getByText("Renouvellement automatique", { exact: true }),
  ).toBeVisible();
  await expect(
    card.getByText("Période payée jusqu’au", { exact: false }),
  ).toContainText("1 janvier 2099");
  page.once("dialog", (dialog) => dialog.dismiss());
  await card.getByRole("button", { name: "Arrêter le renouvellement" }).click();
  expect(requests).toBe(0);
  page.once("dialog", (dialog) => dialog.accept());
  await card.getByRole("button", { name: "Arrêter le renouvellement" }).click();
  await expect(
    card.getByText("Renouvellement arrêté", { exact: true }),
  ).toBeVisible();
  await expect(
    card.getByRole("button", { name: "Arrêter le renouvellement" }),
  ).toHaveCount(0);
  await expect(
    card.getByRole("button", { name: "Ouvrir les factures fournisseurs" }),
  ).toBeEnabled();
  expect(requests).toBe(1);
  await page.reload();
  await expect(
    card.getByText("Renouvellement arrêté", { exact: true }),
  ).toBeVisible();
  plan = 69;
  await page.reload();
  await expect(
    card.getByText("La fonctionnalité reste incluse dans votre forfait.", {
      exact: false,
    }),
  ).toBeVisible();
});
