import { test, expect, type Page } from "@playwright/test";
const origin = process.env.E2E_URL || "http://127.0.0.1:3000";
async function profile(page: Page, name: string) {
  await page.goto("/demo");
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.locator(".sidebar-profile")).toContainText(name);
}
test("notifications rangées par rubrique, préférences et historique par métier", async ({
  page,
}) => {
  await profile(page, "Nadia");
  const reset = await page.request.post("/api/v1/reset", {
    headers: { origin },
    data: { confirm: "RESET DEMO" },
  });
  expect(reset.ok()).toBeTruthy();
  // La cuisine : la cloche ouvre la page, rangée par rubrique.
  await profile(page, "Karim");
  await page.locator(".notification-button").click();
  await expect(page.locator(".breadcrumb")).toContainText("Notifications");
  const kitchen = page.getByRole("region", { name: "Cuisine", exact: true });
  await expect(kitchen).toContainText("Nouvelle commande · Table");
  await expect(
    page.getByRole("region", { name: "Bar", exact: true }),
  ).toHaveCount(0);
  await kitchen
    .getByRole("button", { name: /Nouvelle commande/ })
    .first()
    .click();
  await expect(page.locator(".breadcrumb")).toContainText("Cuisine");
  // Préférences : sourdine d’un type, alerte critique verrouillée.
  await page.locator(".notification-button").click();
  await page.getByRole("button", { name: "Préférences" }).click();
  const prefs = page.getByRole("region", {
    name: "Préférences de notification",
  });
  await expect(
    prefs.getByRole("checkbox", { name: /Rupture de stock/ }),
  ).toBeDisabled();
  await prefs.getByRole("checkbox", { name: /Nouvelle commande/ }).uncheck();
  await expect(kitchen).toHaveCount(0);
  await prefs.getByRole("checkbox", { name: /Nouvelle commande/ }).check();
  await expect(kitchen).toBeVisible();
  const forged = await page.request.post("/api/v1/action", {
    headers: { origin },
    data: {
      action: "notificationPreference",
      type: "stock.out",
      muted: true,
      restaurant: "bernay",
    },
  });
  expect(forged.status()).toBe(400);
  // Historique : le stock ne voit pas la salle ; le serveur ne voit pas les stocks.
  await profile(page, "Amine");
  const waste = await page.request.post("/api/v1/action", {
    headers: { origin },
    data: {
      action: "stock",
      id: "bernay-menthe-lot",
      quantity: 10,
      reason: "Menthe fanée",
      kind: "waste",
      restaurant: "bernay",
    },
  });
  expect(waste.ok()).toBeTruthy();
  await page.getByRole("button", { name: "Historique", exact: true }).click();
  await expect(page.locator(".history-list").first()).toContainText(
    "Perte déclarée : 10 g de Menthe fraîche · Menthe fanée",
  );
  await expect(page.locator(".history-list").first()).toContainText("Amine");
  await expect(
    page.getByRole("combobox", { name: "Rubrique" }).locator("option"),
  ).not.toContainText(["Cuisine"]);
  await profile(page, "Sarah");
  await page.getByRole("button", { name: "Historique", exact: true }).click();
  await expect(page.locator(".history-category").first()).toBeVisible();
  await expect(
    page.locator(".history-category", { hasText: "Stocks" }),
  ).toHaveCount(0);
  const forbidden = await page.request.get(
    "/api/v1/history?restaurant=atelier",
  );
  expect(forbidden.status()).toBe(403);
});
