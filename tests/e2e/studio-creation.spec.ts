import { test, expect } from "@playwright/test";

test("Créer une page sur téléphone, composer son contenu et la publier", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo");
  await page.getByRole("button", { name: /Nadia/ }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/restaurant/bernay/site");

  await page.getByRole("button", { name: "Guide de création" }).click();
  await expect(
    page.getByRole("heading", { name: "Choisir ou créer une page" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ouvrir Pages" }).click();

  const title = `Événements ${Date.now()}`;
  await page
    .getByRole("button", { name: "Créer une page", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Titre", { exact: true }).fill(title);
  const slug = await dialog.getByLabel("Adresse de la page").inputValue();
  await dialog
    .getByRole("button", { name: "Créer la page", exact: true })
    .click();
  const select = page.getByRole("combobox", { name: "Page à modifier" });
  await expect(select).toHaveValue(slug);
  await expect(
    page.getByText("Modifications non enregistrées", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(select).toHaveValue("home");
  await page.getByRole("button", { name: "Rétablir", exact: true }).click();
  await expect(select).toHaveValue(slug);

  await page
    .getByRole("button", { name: "Ajouter une section", exact: true })
    .click();
  await page
    .getByRole("searchbox", { name: "Rechercher un bloc" })
    .fill("categories");
  await page.getByRole("button", { name: /Catégories de produits/ }).click();
  await expect(
    page.getByRole("heading", { name: "Catégories de produits" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Ouvrir les réglages/ }),
  ).toHaveAttribute("href", "/restaurant/bernay?module=shop#reglages-commande");
  await page.getByRole("button", { name: "Fermer les propriétés" }).click();
  await page
    .getByRole("button", { name: /Monter Catégories de produits/ })
    .click();

  await page
    .getByRole("button", { name: "Ajouter une section", exact: true })
    .click();
  await page
    .getByRole("searchbox", { name: "Rechercher un bloc" })
    .fill("promotionnelle");
  await page.getByRole("button", { name: /Bannière promotionnelle/ }).click();
  await page
    .getByLabel("Message", { exact: true })
    .fill("Bienvenue à nos événements");
  await page.getByRole("button", { name: "Fermer les propriétés" }).click();

  await page.getByRole("button", { name: "Gérer les pages" }).click();
  await page
    .getByLabel("Titre de la page sélectionnée")
    .fill(`${title} du restaurant`);
  await page
    .getByRole("button", { name: `Rendre visible ${title} du restaurant` })
    .click();
  await page
    .getByRole("button", { name: "Panneau d’édition", exact: true })
    .click();
  await expect(
    page
      .frameLocator("iframe")
      .getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: "test-results/studio-creation-mobile.png" });

  await page.getByRole("button", { name: "Publier", exact: true }).click();
  await page.getByRole("button", { name: "Confirmer la publication" }).click();
  await expect(page.getByText(/Version \d+ publiée/)).toBeVisible();
  await page.goto("/r/bernay");
  await page
    .getByRole("navigation", { name: "Autres pages du restaurant" })
    .getByRole("link", { name: `${title} du restaurant` })
    .click();
  await expect(page).toHaveURL(new RegExp(`/${slug}$`));
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Bienvenue à nos événements", { exact: true }),
  ).toBeVisible();
  const category = page.locator(".site-categories a").first();
  const categoryName = await category.innerText();
  await category.click();
  await expect(page).toHaveURL(/\/carte\?categorie=/);
  await expect(
    page.getByRole("button", { name: categoryName, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
