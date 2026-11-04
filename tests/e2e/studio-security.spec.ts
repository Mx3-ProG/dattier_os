import { test, expect } from "@playwright/test";
test("Studio : édition publiée, aperçus responsive et centre de sécurité", async ({
  page,
}) => {
  const errors: string[] = [];
  const accountRequests: string[] = [];
  page.on("request", (request) => {
    if (
      /\/api\/store\/bernay\/(account|customer-session)(?:\?|$)/.test(
        request.url(),
      )
    )
      accountRequests.push(request.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/demo");
  await page.getByRole("button", { name: /Nadia/ }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/restaurant/bernay");
  await page.getByRole("button", { name: "Domaines", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Domaine personnalisé" }),
  ).toBeVisible();
  await page.goto("/restaurant/bernay/site");
  await page
    .getByRole("combobox", { name: "Page à modifier" })
    .selectOption("compte");
  await expect(
    page
      .frameLocator("iframe")
      .getByText(
        "Aperçu : connexion, fidélité et historique sont désactivés dans l’éditeur.",
      ),
  ).toBeVisible();
  expect(accountRequests).toEqual([]);
  await page
    .getByRole("combobox", { name: "Page à modifier" })
    .selectOption("home");
  await page.getByRole("tab", { name: "Référencement", exact: true }).click();
  const title = `Restaurant vérifié ${Date.now()}`;
  await page.getByLabel("Titre de la page (vide = automatique)").fill(title);
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(
    page.getByText(
      "Brouillon enregistré. Il n’est pas encore visible sur le site.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Publier", exact: true }).click();
  await page.getByRole("button", { name: "Confirmer la publication" }).click();
  await expect(
    page.getByText(/Version \d+ publiée : le site public est à jour/),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Référencement", exact: true }).click();
  await expect(
    page.getByLabel("Titre de la page (vide = automatique)"),
  ).toHaveValue(title);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    // Tablet: side-drawer toggle; phone: the bottom toolbar opens the sheet.
    const drawer = page.getByRole("button", {
      name: "Panneau d’édition",
      exact: true,
    });
    const dock = page
      .getByRole("navigation", { name: "Outils du site" })
      .getByRole("button", { name: "Sections", exact: true });
    const toggle = (await dock.isVisible()) ? dock : drawer;
    if (await toggle.isVisible()) await toggle.click();
    await expect(
      page.getByRole("tab", { name: "Pages", exact: true }),
    ).toBeVisible();
    if (await toggle.isVisible()) await toggle.click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
  }
  await page.screenshot({
    path: "test-results/studio-desktop.png",
    fullPage: false,
  });
  await page.goto("/r/bernay");
  await expect(page).toHaveTitle(title);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
  }
  await page.goto("/restaurant/bernay/security");
  await page.getByRole("tab", { name: "Journal d’activité" }).click();
  await expect(
    page.getByRole("heading", { name: "Sécurité opérationnelle" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Incidents", exact: true }).click();
  await page.getByRole("tab", { name: "Corrections", exact: true }).click();
  await page.getByRole("tab", { name: "Archives", exact: true }).click();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
  }
  await page.screenshot({
    path: "test-results/security-desktop.png",
    fullPage: false,
  });
  expect(errors).toEqual([]);
});

test("PWA : redémarrage hors ligne et file durable sans double commande", async ({
  page,
  context,
}) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: /Nadia/ }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/offline?restaurant=bernay");
  await page.getByRole("button", { name: "Enregistrer cet appareil" }).click();
  await page.getByRole("button", { name: "Charger la carte" }).click();
  await page
    .getByRole("combobox", { name: "Produit", exact: true })
    .selectOption({ label: "Couscous royal" });
  await page.getByLabel("Portions à réserver").fill("2");
  await page
    .getByRole("button", { name: "Réserver le stock pour cet appareil" })
    .click();
  await expect(page.getByLabel("Quantité Couscous royal")).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByLabel("Quantité Couscous royal")).toBeVisible();
  await page.getByLabel("Quantité Couscous royal").fill("1");
  await page
    .getByRole("button", { name: "Enregistrer sur cet appareil" })
    .click();
  await expect(page.getByText(/1 opérations à synchroniser/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/1 opérations à synchroniser/)).toBeVisible();
  await context.setOffline(false);
  await page.getByRole("button", { name: "Synchroniser", exact: true }).click();
  await expect(page.getByText(/0 opérations à synchroniser/)).toBeVisible();
  await page.getByRole("button", { name: "Synchroniser", exact: true }).click();
  await expect(page.getByText(/0 opérations à synchroniser/)).toBeVisible();
});
