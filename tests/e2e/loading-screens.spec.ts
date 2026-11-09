import { test, expect, type Page, type Browser } from "@playwright/test";
const origin = process.env.E2E_URL || "http://127.0.0.1:3000";
async function login(page: Page, id: string) {
  expect((await page.request.post("/api/v1/login", { headers: { origin }, data: { id } })).ok()).toBeTruthy();
  await page.addInitScript((user) => {
    localStorage.setItem(`atacuisine-tour:v1:${user}`, JSON.stringify({ seen: true, done: [] }));
  }, id);
}
async function openShop(page: Page, restaurant = "bernay") {
  await page.goto(`/dashboard?restaurant=${restaurant}&module=addons`);
  await page.getByRole("button", { name: /^Boutique d’add-ons/ }).click();
  await expect(page.getByRole("region", { name: "Écrans de chargement" })).toBeVisible();
}
const card = (page: Page, name: string) => page.getByRole("article", { name, exact: true });
/** Retarde le premier écran pour observer le loader sans jamais retarder en production. */
async function holdState(page: Page, ms = 1500) {
  await page.route("**/api/v1/state*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await route.continue().catch(() => undefined);
  });
}
async function asEmployee(browser: Browser, id: string) {
  const context = await browser.newContext({ baseURL: origin });
  const page = await context.newPage();
  await login(page, id);
  return page;
}

test("catalogue : dix écrans animés, filtres, statuts et aucun achat possible sans Stripe", async ({ page }) => {
  await login(page, "nadia");
  await openShop(page);
  const section = page.getByRole("region", { name: "Écrans de chargement" });
  await expect(section.getByRole("article")).toHaveCount(10);
  await expect(card(page, "Liquid Flow")).toContainText("5 € HT");
  await expect(card(page, "Golden Luxury")).toContainText("9 € HT");
  await expect(card(page, "Golden Luxury")).toContainText("Vitesse, logo, message");
  for (const name of ["Magic Loader", "Kitchen Loader", "Studio S", "Liquid Flow", "Neon Pulse", "Coffee Break", "Orbit Galaxy", "Infinity Loop", "Crystal Morph", "Golden Luxury"]) {
    const article = card(page, name);
    await article.scrollIntoViewIfNeeded();
    await expect
      .poll(
        () =>
          article
            .locator("[data-loading-screen]")
            .evaluate((node) => node.getAnimations({ subtree: true }).filter((a) => a.playState === "running").length),
        { message: `${name} doit réellement bouger` },
      )
      .toBeGreaterThan(0);
  }
  await page.getByLabel("Prix").selectOption("free");
  await expect(section.getByRole("article")).toHaveCount(3);
  await page.getByLabel("Prix").selectOption("all");
  await page.getByRole("button", { name: "Fonctionnalités" }).click();
  await expect(section).toHaveCount(0);
  await page.getByRole("button", { name: "Écrans de chargement" }).click();
  await expect(page.getByRole("region", { name: "Boutique d’add-ons", exact: true })).toHaveCount(0);
});

test("l’aperçu est téléchargé à la demande et mis en pause hors de la vue", async ({ page }) => {
  await login(page, "nadia");
  await openShop(page);
  await page.setViewportSize({ width: 1280, height: 500 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(card(page, "Magic Loader").locator("[data-loading-screen]")).toBeAttached();
  await expect(card(page, "Golden Luxury").locator("[data-loading-screen]")).toHaveCount(0);
  await card(page, "Golden Luxury").scrollIntoViewIfNeeded();
  await expect(card(page, "Golden Luxury").locator("[data-loading-screen]")).toBeAttached();
  await expect(card(page, "Magic Loader").locator(".is-paused")).toBeAttached();
});

test("installation, activation, héritage par l’équipe, désactivation et isolation entre établissements", async ({ page, browser }) => {
  await login(page, "nadia");
  await openShop(page);
  const magic = card(page, "Magic Loader");
  // La base de démo persiste entre deux exécutions : chaque étape reste rejouable.
  await expect(magic.getByRole("button")).toBeVisible();
  const installable = magic.getByRole("button", { name: "Installer" });
  if (await installable.isVisible()) await installable.click();
  await expect(magic.getByText("Possédé")).toBeVisible();
  const activable = magic.getByRole("button", { name: "Activer" });
  if (await activable.isVisible()) await activable.click();
  await expect(magic.getByRole("button", { name: "Écran actif" })).toBeDisabled();

  // Personnalisation depuis la bibliothèque.
  await page.getByRole("button", { name: /^Mes add-ons/ }).click();
  const panel = page.getByRole("region", { name: "Personnaliser l’écran de chargement" });
  await panel.getByLabel("Activer cet écran pour l’établissement").check();
  await panel.getByLabel("Message personnalisé").fill("Bienvenue chez Studio Restau");
  await panel.getByLabel("Couleur principale").fill("#ff0066");
  await panel.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Écran de chargement enregistré pour toute l’équipe.")).toBeVisible();

  // Le gérant voit son écran dès le chargement suivant, puis l’animation s’arrête.
  await holdState(page);
  await page.goto("/dashboard?restaurant=bernay");
  const screen = page.locator('[data-loading-screen="magic"].is-fullscreen');
  await expect(screen).toBeVisible();
  await expect(screen).toContainText("Bienvenue chez Studio Restau");
  await expect(screen).toHaveAttribute("role", "status");
  await expect(page.locator(".dashboard, .workspace").first()).toBeVisible();
  await expect(screen).toHaveCount(0);
  expect(await page.evaluate(() => document.querySelectorAll("[data-loading-screen]").length)).toBe(0);

  // Une serveuse hérite de l’écran sans aucun réglage.
  const waiter = await asEmployee(browser, "sarah");
  await waiter.goto("/dashboard?restaurant=bernay");
  await expect(waiter.locator(".workspace")).toBeVisible();
  await expect
    .poll(() => waiter.evaluate(() => localStorage.getItem("studio-loading-screen:v1:bernay")))
    .toContain('"renderer":"magic"');
  await holdState(waiter);
  await waiter.reload();
  await expect(waiter.locator('[data-loading-screen="magic"]')).toContainText("Bienvenue chez Studio Restau");
  // Elle ne peut ni personnaliser ni installer.
  const refused = await waiter.request.put("/api/restaurants/bernay/loading-screen", {
    headers: { origin },
    data: { productId: null, enabled: false, primaryColor: null, secondaryColor: null, speed: 1, showLogo: false, message: null, revision: 2 },
  });
  expect(refused.status()).toBe(403);
  expect((await waiter.request.post("/api/restaurants/bernay/addons/store", { headers: { origin }, data: { action: "install", product: "studio-s" } })).status()).toBe(403);
  expect((await waiter.request.get("/api/restaurants/atelier/loading-screen")).ok()).toBeFalsy();
  await waiter.context().close();

  // Même personne, autre établissement sélectionné : pas d’écran hérité de Bernay.
  await page.unroute("**/api/v1/state*");
  await page.goto("/dashboard?restaurant=atelier");
  await expect(page.locator(".workspace")).toBeVisible();
  await holdState(page);
  await page.reload();
  await expect(page.locator(".dattier-loader.is-fullscreen")).toBeVisible();
  await expect(page.locator("[data-loading-screen]")).toHaveCount(0);
  await page.unroute("**/api/v1/state*");
  const atelier = await page.request.get("/api/restaurants/atelier/loading-screen");
  expect((await atelier.json()).config).toBeNull();

  // Désactivation : retour immédiat à l’écran natif, écran conservé dans la bibliothèque.
  await page.goto("/dashboard?restaurant=bernay&module=addons");
  const library = page.getByRole("region", { name: "Personnaliser l’écran de chargement" });
  await library.getByLabel("Activer cet écran pour l’établissement").uncheck();
  await library.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Écran de chargement enregistré pour toute l’équipe.")).toBeVisible();
  await holdState(page);
  await page.reload();
  await expect(page.locator(".dattier-loader.is-fullscreen")).toBeVisible();
  await expect(page.locator("[data-loading-screen]")).toHaveCount(0);
  await page.unroute("**/api/v1/state*");
  await expect(card(page, "Magic Loader").getByText("Possédé")).toBeVisible();
});

test("mouvement réduit : composition fixe, sans aucune animation", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin, reducedMotion: "reduce" });
  const page = await context.newPage();
  await login(page, "nadia");
  await openShop(page);
  for (const name of ["Neon Pulse", "Golden Luxury", "Studio S"]) {
    const article = card(page, name);
    await article.scrollIntoViewIfNeeded();
    const preview = article.locator("[data-loading-screen]");
    await expect(preview.locator(".ls-stage > *").first()).toBeVisible();
    const running = await preview.evaluate((node) => node.getAnimations({ subtree: true }).length);
    expect(running).toBe(0);
  }
  await context.close();
});

test("mobile : boutique sans débordement horizontal", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "nadia");
  await openShop(page);
  await expect(card(page, "Magic Loader")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.getByRole("button", { name: /^Mes add-ons/ }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test("achat : le navigateur part uniquement vers Stripe, sans droit au retour", async ({ page }) => {
  await login(page, "nadia");
  let store: Record<string, unknown> | undefined;
  await page.route("**/api/restaurants/bernay/addons/store", async (route) => {
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON()).toEqual({ action: "purchase", product: "neon-pulse" });
      return route.fulfill({ json: { url: "https://evil.example.test/pay" } });
    }
    const response = await route.fetch();
    store = { ...(await response.json()), checkoutReady: true };
    return route.fulfill({ json: store });
  });
  await openShop(page);
  await card(page, "Neon Pulse").getByRole("button", { name: /^Acheter/ }).click();
  await expect(page.getByText("Destination de paiement invalide")).toBeVisible();
  expect(page.url()).toContain("127.0.0.1");
});

test("un achat sans Stripe configuré est refusé côté serveur", async ({ page }) => {
  await login(page, "nadia");
  const response = await page.request.post("/api/restaurants/bernay/addons/store", {
    headers: { origin },
    data: { action: "purchase", product: "neon-pulse" },
  });
  expect(response.ok()).toBeFalsy();
  const state = await (await page.request.get("/api/restaurants/bernay/addons/store")).json();
  expect(state.licenses.some((entry: { product_id: string }) => entry.product_id === "neon-pulse")).toBeFalsy();
});

test("administration : refusée au propriétaire d’un établissement", async ({ page }) => {
  await login(page, "nadia");
  expect((await page.request.get("/api/platform/addons")).status()).toBe(403);
  await page.goto("/platform/boutique");
  await expect(page.locator("main p[role=alert]")).toContainText("refusée");
});
