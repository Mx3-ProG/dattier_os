import { test, expect, type Page } from "@playwright/test";
const origin = process.env.E2E_URL || "http://127.0.0.1:3000";
async function profile(page: Page, name: string) {
  await page.goto("/demo");
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.locator(".sidebar-profile")).toContainText(name);
}
test("centre de notifications : filtrage par rôle, ouverture du module, préférences", async ({
  page,
}) => {
  await profile(page, "Nadia");
  const reset = await page.request.post("/api/v1/reset", {
    headers: { origin },
    data: { confirm: "RESET DEMO" },
  });
  expect(reset.ok()).toBeTruthy();
  await profile(page, "Leïla");
  await page.getByRole("button", { name: /^Notifications/ }).click();
  const panel = page.getByRole("region", { name: "Centre de notifications" });
  await expect(panel).toBeVisible();
  await expect(panel).not.toContainText("Nouvelle commande");
  await profile(page, "Sarah");
  await page
    .getByRole("button", { name: /^Notifications \(\d+ non lues\)/ })
    .click();
  await panel
    .getByRole("button", { name: /Nouvelle commande/ })
    .first()
    .click();
  await expect(page.locator(".breadcrumb")).toContainText("Commandes");
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await panel.getByRole("tab", { name: "Préférences" }).click();
  await panel.getByRole("checkbox", { name: /Nouvelle commande/ }).uncheck();
  await panel.getByRole("tab", { name: "Toutes" }).click();
  await expect(panel).not.toContainText("Nouvelle commande");
  await panel.getByRole("tab", { name: "Préférences" }).click();
  await panel.getByRole("checkbox", { name: /Nouvelle commande/ }).check();
  await panel.getByRole("tab", { name: "Toutes" }).click();
  await expect(panel).toContainText("Nouvelle commande");
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
});
