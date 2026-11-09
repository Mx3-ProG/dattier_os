import { test, expect } from "@playwright/test";
const origin = process.env.E2E_URL || "http://127.0.0.1:3000";

test("estimation is installed, configured and shown publicly without internal costs", async ({ page }) => {
  expect((await page.request.post("/api/v1/login", { headers: { origin }, data: { id: "nadia" } })).ok()).toBeTruthy();
  const shopUrl = "/api/restaurants/atelier/addons/store";
  const configUrl = "/api/restaurants/atelier/estimation";
  const headers = { origin, "content-type": "application/json" };
  const shopResponse = await page.request.get(shopUrl);
  expect(shopResponse.ok(), await shopResponse.text()).toBeTruthy();
  const beforeShop = await shopResponse.json();
  expect(beforeShop).toHaveProperty("installations");
  const previouslyInstalled = beforeShop.installations.find((entry: { addon_id: string }) => entry.addon_id === "estimation-studio")?.installed !== false;
  const alreadyOwned = beforeShop.licenses.some((entry: { product_id: string; status: string }) => entry.product_id === "estimation-studio" && entry.status === "active");
  if (!alreadyOwned) {
    const installed = await page.request.post(shopUrl, { headers, data: { action: "install", product: "estimation-studio" } });
    expect(installed.ok()).toBeTruthy();
  } else if (!previouslyInstalled) {
    const installed = await page.request.post(shopUrl, { headers, data: { action: "set-installation", product: "estimation-studio", installed: true } });
    expect(installed.ok()).toBeTruthy();
  }
  const original = await (await page.request.get(configUrl)).json();
  const originalConfig = original.config;
  let currentRevision = originalConfig.revision;
  try {
    const saved = await page.request.put(configUrl, { headers, data: {
      title: "Estimez votre projet", introduction: "Choisissez votre prestation.",
      items: [{ id: "557fae5e-fdef-4c7b-af02-1641a2740cce", kind: "service", name: "Prestation test", unit: "heure", priceCents: 12000, costCents: 4000, defaultQuantity: 2, maxQuantity: 10, featured: true }],
      fixedCostsCents: 5000, published: true, revision: currentRevision,
    } });
    expect(saved.ok()).toBeTruthy();
    currentRevision = (await saved.json()).config.revision;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/r/atelier/estimation");
    await expect(page.getByRole("heading", { name: "Estimez votre projet" })).toBeVisible();
    await expect(page.getByText(/240,00/)).toBeVisible();
    await expect(page.getByText("Marge estimée")).toHaveCount(0);
    await page.getByRole("spinbutton", { name: "Quantité pour Prestation test" }).fill("3");
    await expect(page.getByText(/360,00/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: "/tmp/estimation-public-mobile.png", fullPage: true });
    await page.goto("/r/atelier");
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await expect(page.getByRole("link", { name: "Estimation" })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/dashboard?restaurant=atelier&module=estimation");
    await expect(page.getByRole("heading", { name: "Estimation", exact: true })).toBeVisible();
    await expect(page.getByText("Marge estimée")).toBeVisible();
    await page.screenshot({ path: "/tmp/estimation-admin-desktop.png", fullPage: true });
  } finally {
    await page.request.put(configUrl, { headers, data: {
      title: originalConfig.title, introduction: originalConfig.introduction,
      items: originalConfig.items, fixedCostsCents: originalConfig.fixed_costs_cents,
      published: originalConfig.published, revision: currentRevision,
    } });
    if (!previouslyInstalled || !alreadyOwned)
      await page.request.post(shopUrl, { headers, data: { action: "set-installation", product: "estimation-studio", installed: false } });
  }
});
