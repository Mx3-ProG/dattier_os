import { test, expect, type Page } from "@playwright/test";
async function profile(page: Page, name: string) {
  await page.goto("/demo");
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.locator(".sidebar-profile")).toContainText(name);
}
test("parcours complet, réservations publiques, responsive et accès serveur", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await profile(page, "Nadia");
  const reset = await page.request.post("/api/v1/reset", {
    headers: { origin: process.env.E2E_URL || "http://127.0.0.1:3000" },
    data: { confirm: "RESET DEMO" },
  });
  expect(reset.ok()).toBeTruthy();
  await profile(page, "Sarah");
  await page.getByRole("button", { name: /^08/ }).click();
  await page
    .getByRole("button", { name: "Ajouter Couscous royal", exact: true })
    .click({ clickCount: 2 });
  await page.getByRole("button", { name: "Boissons", exact: true }).click();
  await page
    .getByRole("button", { name: "Ajouter Thé à la menthe", exact: true })
    .click({ clickCount: 2 });
  await page.getByRole("button", { name: /Envoyer en préparation/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.locator(".order-card").filter({
      has: page.getByRole("heading", { name: "Table 8", exact: true }),
    }),
  ).toContainText("2 × Couscous royal");
  await page.reload();
  await expect(
    page.locator(".order-card").filter({ hasText: "Table 8" }),
  ).toContainText("2 × Thé à la menthe");
  const forbidden = await page.request.post("/api/v1/action", {
    headers: { origin: process.env.E2E_URL || "http://127.0.0.1:3000" },
    data: {
      action: "expense",
      restaurant: "bernay",
      label: "Forbidden",
      amount: 100,
    },
  });
  expect(forbidden.status()).toBe(403);
  await profile(page, "Karim");
  let ticket = page.locator(".kds-card").filter({ hasText: "Table 8" });
  await expect(ticket).toContainText("2 × Couscous royal");
  await ticket.getByRole("button", { name: "Commencer" }).click();
  await ticket.getByRole("button", { name: "Marquer prêt" }).click();
  await expect(ticket).toContainText("Prêt");
  await profile(page, "Youssef");
  ticket = page.locator(".kds-card").filter({ hasText: "Table 8" });
  await ticket.getByRole("button", { name: "Commencer" }).click();
  await ticket.getByRole("button", { name: "Marquer prêt" }).click();
  await profile(page, "Sarah");
  const order = page.locator(".order-card").filter({
    has: page.getByRole("heading", { name: "Table 8", exact: true }),
  });
  await order
    .getByRole("button", { name: "Servir", exact: true })
    .first()
    .click();
  await expect(
    order.getByRole("button", { name: "Servir", exact: true }),
  ).toHaveCount(1);
  await order.getByRole("button", { name: "Servir", exact: true }).click();
  await order.getByRole("button", { name: /Clôturer/ }).click();
  await page
    .getByRole("button", { name: "Confirmer le règlement déclaré" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(order).toHaveCount(0);
  await profile(page, "Amine");
  await expect(
    page.getByRole("heading", { name: "Stocks & inventaire", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "consumption", exact: true }).first(),
  ).toBeVisible();
  await profile(page, "Nadia");
  await expect(page.getByText("CA déclaré aujourd’hui")).toBeVisible();
  await page.screenshot({
    path: "docs/dashboard-desktop.png",
    animations: "disabled",
    fullPage: true,
  });
  const other = await context.newPage();
  await other.goto("/reservations");
  await other.locator(".slot:not([disabled])").first().click();
  await other.locator(".map-table.free").first().click();
  await expect(other.locator(".map-table.selected")).toHaveCount(1);
  await other.getByLabel("Votre nom").fill("E2E Réservation fictive");
  await other.getByLabel("Téléphone ou e-mail").fill("e2e@example.test");
  await other.getByRole("button", { name: /^Réserver · .* · table/ }).click();
  await expect(other.getByRole("status")).toContainText("enregistrée");
  await page.getByRole("button", { name: "Réservations", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: /E2E Réservation fictive/ }),
  ).toBeVisible();
  await other.close();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Ouvrir la navigation" }).click();
  await page
    .getByRole("button", { name: "Plan de salle", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /^08/ })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "docs/salle-mobile.png",
    animations: "disabled",
    fullPage: true,
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Le goût du partage",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "docs/site-mobile.png",
    animations: "disabled",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("deux profils simultanés : synchronisation sans rechargement et isolement", async ({
  browser,
}) => {
  const waiterContext = await browser.newContext(),
    chefContext = await browser.newContext();
  const waiter = await waiterContext.newPage(),
    chef = await chefContext.newPage();
  await profile(waiter, "Sarah");
  await profile(chef, "Karim");
  await waiter.getByRole("button", { name: /^07/ }).click();
  await waiter
    .getByRole("button", { name: "Ajouter Couscous royal", exact: true })
    .click();
  await waiter.getByRole("button", { name: /Envoyer en préparation/ }).click();
  await expect(
    chef.locator(".kds-card").filter({ hasText: "Table 7" }),
  ).toContainText("1 × Couscous royal");
  const denied = await waiter.request.get("/api/v1/state?restaurant=atelier");
  expect(denied.status()).toBe(403);
  await chefContext.close();
  await waiterContext.close();
});
