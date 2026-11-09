import { test, expect, type Page } from "@playwright/test";
const origin = process.env.E2E_URL || "http://127.0.0.1:3000";
async function login(page: Page, id: string, module = "") {
  const response = await page.request.post("/api/v1/login", {
    headers: { origin },
    data: { id },
  });
  expect(response.ok()).toBeTruthy();
  await page.addInitScript(() => {
    for (const id of ["nadia", "karim", "youssef", "lina", "leila"])
      localStorage.setItem(
        `atacuisine-tour:v1:${id}`,
        JSON.stringify({ seen: true, done: [] }),
      );
  });
  await page.goto(
    `/dashboard?restaurant=bernay${module ? `&module=${module}` : ""}`,
  );
  await expect(page.locator(".sidebar-profile")).toBeVisible();
}
test("restaurant navigation keeps module pages, role defaults and inaccessible deep-link fallback", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "nadia");
  await expect(page.locator('[data-tour="nav-overview"]')).toHaveClass(
    "active",
  );
  for (const [id, title] of [
    ["dining", "Plan de salle"],
    ["reservations", "Réservations"],
    ["addons", "Add-ons"],
  ]) {
    await page.locator(`[data-tour="nav-${id}"]`).click();
    await expect(page.locator(`[data-tour="nav-${id}"]`)).toHaveClass("active");
    await expect(page.locator(".page-heading h1")).toHaveText(title);
  }
  await login(page, "karim");
  await expect(page.locator('[data-tour="nav-kitchen"]')).toHaveClass("active");
  await expect(page.locator('[data-tour="nav-finance"]')).toHaveCount(0);
  await login(page, "youssef");
  await expect(page.locator('[data-tour="nav-bar"]')).toHaveClass("active");
  await login(page, "lina", "invoices");
  await expect(page.locator('[data-tour="nav-invoices"]')).toHaveCount(0);
  await expect(page.locator('[data-tour="nav-activity"]')).toHaveClass(
    "active",
  );
  await login(page, "leila", "invoices");
  await expect(page.locator('[data-tour="nav-invoices"]')).toHaveClass(
    "active",
  );
  await expect(page.locator(".page-heading h1")).toHaveText(
    "Factures fournisseurs",
  );
  expect(errors).toEqual([]);
});

test("mobile navigation uses the same allowed contributions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "nadia");
  const dock = page.getByRole("navigation", { name: "Navigation rapide" });
  await dock.getByRole("button", { name: "Opérations", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Opérations", exact: true });
  await expect(page.locator(".demo-purchase-link")).toBeHidden();
  await expect(menu.getByRole("button")).toHaveText([
    "Plan de salle",
    "Commandes",
    "Cuisine",
    "Bar",
    "Réservations",
  ]);
  await menu.getByRole("button", { name: "Réservations", exact: true }).click();
  await expect(menu).toHaveCount(0);
  await expect(page.locator(".demo-purchase-link")).toBeVisible();
  await expect(page.locator(".page-heading h1")).toHaveText("Réservations");
  await login(page, "leila");
  await expect(
    dock.getByRole("button", { name: "Opérations", exact: true }),
  ).toHaveCount(0);
  await dock.getByRole("button", { name: "Pilotage", exact: true }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Pilotage", exact: true })
      .getByRole("button", { name: "Factures fournisseurs", exact: true }),
  ).toBeVisible();
});
