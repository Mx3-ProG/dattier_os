import { test, expect, type Page } from "@playwright/test";

const origin = process.env.E2E_URL || "http://127.0.0.1:3000";

async function loginSuperAdmin(page: Page) {
  expect(
    (
      await page.request.post("/api/v1/login", {
        headers: { origin },
        data: { id: "mat75_superadmin" },
      })
    ).ok(),
  ).toBeTruthy();
  await page.addInitScript(() =>
    localStorage.setItem(
      "atacuisine-tour:v1:mat75_superadmin",
      JSON.stringify({ seen: true, done: [] }),
    ),
  );
}

async function loginRegular(page: Page) {
  expect(
    (
      await page.request.post("/api/v1/login", {
        headers: { origin },
        data: { id: "nadia" },
      })
    ).ok(),
  ).toBeTruthy();
}

test("super admin can open the supervision dashboard", async ({ page }) => {
  await loginSuperAdmin(page);
  await page.goto("/platform/admin");
  await expect(page.getByRole("heading", { name: "Supervision & Maintenance Globale" })).toBeVisible();
  await expect(page.getByText("Super Admin · Privilèges Monolithe")).toBeVisible();
});

test("non-super-admin is redirected away from the dashboard", async ({ page }) => {
  await loginRegular(page);
  await page.goto("/platform/admin");
  await expect(page).not.toHaveURL(/\/platform\/admin/);
});

test("pagination controls are present on users tab", async ({ page }) => {
  await loginSuperAdmin(page);
  await page.goto("/platform/admin");
  await page.getByRole("button", { name: /Utilisateurs/ }).click();
  await expect(page.getByText(/Page \d+ \/ \d+/)).toBeVisible();
});