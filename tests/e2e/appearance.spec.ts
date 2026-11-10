import { test, expect, type Page } from "@playwright/test";
const origin = process.env.E2E_URL || "http://127.0.0.1:3000";
async function login(page: Page, id = "nadia") {
  const response = await page.request.post("/api/v1/login", {
    headers: { origin },
    data: { id },
  });
  expect(response.ok()).toBeTruthy();
  await page.addInitScript(() => {
    for (const id of ["nadia", "karim"])
      localStorage.setItem(
        `atacuisine-tour:v1:${id}`,
        JSON.stringify({ seen: true, done: [] }),
      );
  });
  await page.goto("/dashboard?restaurant=bernay");
  await expect(
    page.getByRole("button", { name: "Personnaliser mon espace" }),
  ).toBeEnabled();
}
const theme = (page: Page) =>
  page
    .locator(".workspace")
    .evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--appearance-accent").trim(),
    );
async function open(page: Page) {
  await page.getByRole("button", { name: "Personnaliser mon espace" }).click();
}

test("préférences personnelles : aperçu, sauvegarde, navigation, réseau et isolation", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  await open(page);
  await page
    .getByRole("button", { name: "Rétablir l’apparence d’origine" })
    .click();
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await open(page);
  await page.getByRole("button", { name: "Rose", exact: true }).click();
  expect(await theme(page)).toBe("#b73578");
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  expect(await theme(page)).toBe("#344d3e");
  await open(page);
  await page.getByRole("button", { name: "Rose", exact: true }).click();
  await page.getByLabel("Typographie").selectOption("nunito");
  await expect(page.locator(".appearance-save")).toHaveCSS(
    "background-color",
    "rgb(183, 53, 120)",
  );
  await page.screenshot({ path: "/tmp/appearance-desktop.png" });
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect.poll(() => theme(page)).toBe("#b73578");
  await expect(page.locator(".workspace")).toHaveCSS("font-family", /Nunito/);
  await page.goto("/restaurant/bernay");
  await expect.poll(() => theme(page)).toBe("#b73578");
  await page.goto("/platform");
  await expect.poll(() => theme(page)).toBe("#b73578");
  await page.goto("/dashboard?restaurant=atelier");
  await expect.poll(() => theme(page)).toBe("#b73578");

  // A fresh device loads the saved server preference, without local storage.
  const other = await browser.newContext();
  const second = await other.newPage();
  await login(second);
  await expect.poll(() => theme(second)).toBe("#b73578");
  await other.close();

  await page.goto("/dashboard?restaurant=bernay");
  await expect.poll(() => theme(page)).toBe("#b73578");
  await open(page);
  await page.getByRole("button", { name: "Bleu", exact: true }).click();
  await page.route("**/api/me/appearance", (route) =>
    route.request().method() === "PUT" ? route.abort() : route.continue(),
  );
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Bleu", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.unroute("**/api/me/appearance");
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  expect(await theme(page)).toBe("#b73578");
  await login(page, "karim");
  await open(page);
  await page
    .getByRole("button", { name: "Rétablir l’apparence d’origine" })
    .click();
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await theme(page)).toBe("#344d3e");
  await open(page);
  await page.getByRole("button", { name: "Bleu", exact: true }).click();
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await login(page);
  expect(await theme(page)).toBe("#b73578");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".mobile-toggle").click();
  await open(page);
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page
      .getByRole("dialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBeTruthy();
  await page.screenshot({ path: "/tmp/appearance-mobile.png" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/r/bernay");
  expect(
    await page
      .locator("body")
      .evaluate((el) =>
        getComputedStyle(el).getPropertyValue("--appearance-accent"),
      ),
  ).toBe("");
  expect(errors).toEqual([]);
});

test("API : session, origine, validation et changement de compte", async ({
  page,
  request,
}) => {
  expect((await request.get("/api/me/appearance")).status()).toBe(401);
  await login(page);
  const put = (data: unknown, headers: Record<string, string> = {}) =>
    page.request.put("/api/me/appearance", {
      headers: { origin, "X-Appearance-Account": "nadia", ...headers },
      data,
    });
  expect((await put({ color: "#ffffff", font: "invented" })).status()).toBe(
    400,
  );
  expect(
    (await put({ color: "#ffffff", font: "inter", userId: "karim" })).status(),
  ).toBe(400);
  expect(
    (
      await put(
        { color: "#ffffff", font: "inter" },
        { origin: "https://example.com" },
      )
    ).status(),
  ).toBe(403);
  expect(
    (
      await put(
        { color: "#ffffff", font: "inter" },
        { "X-Appearance-Account": "karim" },
      )
    ).status(),
  ).toBe(409);
});

test("cache par compte, fenêtres métier et impression", async ({ page }) => {
  await login(page);
  await open(page);
  await page.getByRole("button", { name: "Rose", exact: true }).click();
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.route("**/api/me/appearance", (route) => route.abort());
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Personnaliser mon espace" }),
  ).toBeEnabled();
  expect(await theme(page)).toBe("#b73578");
  await page.unroute("**/api/me/appearance");
  await page.emulateMedia({ media: "print" });
  expect(await theme(page)).toBe("#344d3e");
  await page.emulateMedia({ media: "screen" });
  await page.goto("/dashboard?restaurant=bernay&module=customers");
  await page
    .getByRole("button", { name: "Ajouter un client", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveClass(/appearance-scope/);
  expect(
    await page
      .getByRole("dialog")
      .evaluate((el) =>
        getComputedStyle(el).getPropertyValue("--appearance-accent").trim(),
      ),
  ).toBe("#b73578");
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
});

test("violet jour/nuit : chargement, boutons, toutes les routes et persistance", async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  await login(page);
  const saved = await page.request.put("/api/me/appearance", {
    headers: { origin, "X-Appearance-Account": "nadia" },
    data: { color: "#7950b5", font: "inter", mode: "dark" },
  });
  expect(saved.ok()).toBeTruthy();
  // Initial HTML already has the account theme, before client JS or data loads.
  const html = await (
    await page.request.get("/dashboard?restaurant=bernay")
  ).text();
  expect(html).toContain("--appearance-bg:#111318");
  await page.route("**/api/v1/state?**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await route.continue();
  });
  await page.goto("/dashboard?restaurant=bernay");
  await expect(page.locator(".dattier-loader")).toBeVisible();
  await expect(page.locator(".dattier-loader")).toHaveCSS(
    "background-color",
    "rgb(17, 19, 24)",
  );
  await page.screenshot({ path: "/tmp/appearance-night-loading.png" });
  await expect(page.locator(".workspace")).toBeVisible();
  await page.unroute("**/api/v1/state?**");
  await expect(page.locator(".primary").first()).toHaveCSS(
    "background-color",
    "rgb(121, 80, 181)",
  );
  await page.screenshot({
    path: "/tmp/appearance-night-dashboard.png",
    fullPage: true,
  });
  await open(page);
  await expect(
    page.getByRole("button", { name: "Nuit", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Jour", exact: true }).click();
  await expect(page.locator(".appearance-application")).toHaveAttribute(
    "data-appearance-mode",
    "light",
  );
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(page.locator(".appearance-application")).toHaveAttribute(
    "data-appearance-mode",
    "dark",
  );
  for (const url of [
    "/dashboard?restaurant=bernay&module=orders",
    "/dashboard?restaurant=bernay&module=customers",
    "/restaurant/bernay",
    "/restaurant/bernay/site",
    "/platform",
    "/platform/parrainage",
    "/offline?restaurant=bernay",
    "/guide",
    "/pointage",
  ]) {
    await page.goto(url);
    await expect(page.locator(".appearance-application")).toHaveAttribute(
      "data-appearance-mode",
      "dark",
    );
    await expect(page.locator(".appearance-application")).toHaveCSS(
      "background-color",
      "rgb(17, 19, 24)",
    );
  }
  await page.goto("/dashboard?restaurant=bernay");
  await page.getByRole("button", { name: "Passer en mode jour" }).click();
  await expect(page.locator(".appearance-application")).toHaveAttribute(
    "data-appearance-mode",
    "light",
  );
  await expect(page.locator(".primary").first()).toHaveCSS(
    "background-color",
    "rgb(121, 80, 181)",
  );
  await page.reload();
  await expect(page.locator(".appearance-application")).toHaveAttribute(
    "data-appearance-mode",
    "light",
  );
  await page.getByRole("button", { name: "Passer en mode nuit" }).click();
  await expect(page.locator(".appearance-application")).toHaveAttribute(
    "data-appearance-mode",
    "dark",
  );
  const fresh = await browser.newContext();
  const second = await fresh.newPage();
  await login(second);
  await expect(second.locator(".appearance-application")).toHaveAttribute(
    "data-appearance-mode",
    "dark",
  );
  await fresh.close();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".mobile-toggle").click();
  await open(page);
  await page.screenshot({ path: "/tmp/appearance-night-mobile.png" });
  await expect(page.locator(".appearance-save")).toBeInViewport();
  await page.keyboard.press("Escape");
  await page.goto("/r/bernay");
  await expect(page.locator(".appearance-application")).toHaveCount(0);
});
