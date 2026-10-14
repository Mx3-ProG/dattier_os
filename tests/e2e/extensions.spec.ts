import { test, expect, type Page } from "@playwright/test";
async function profile(page: Page, name: string) {
  await page.goto("/demo");
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page.locator(".sidebar-profile")).toContainText(name);
}
test("manager : cycle produit, code client et règlement ; cuisine et bar : renfort salle", async ({
  page,
}) => {
  const suffix = Date.now().toString().slice(-7),
    product = `Plat test ${suffix}`,
    client = `Client test ${suffix}`,
    code = `FIDE-${suffix}`;
  await profile(page, "Nadia");
  const reset=await page.request.post("/api/v1/reset",{headers:{origin:process.env.E2E_URL||"http://127.0.0.1:3000"},data:{confirm:"RESET DEMO"}});
  expect(reset.ok()).toBeTruthy();
  await profile(page, "Lina");
  await page.getByRole("button", { name: "La carte", exact: true }).click();
  async function create(name: string) {
    await page
      .getByRole("button", { name: "Ajouter un produit", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nom du produit").fill(name);
    await dialog.getByLabel("Catégorie", { exact: true }).selectOption("Plats");
    await dialog.getByLabel("Prix de vente (€)").fill("10");
    await dialog
      .getByLabel("Ingrédient 1", { exact: true })
      .selectOption("bernay-semoule");
    await dialog.getByLabel("Quantité 1", { exact: true }).fill("100");
    await dialog
      .getByRole("button", { name: "Créer le produit", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
  }
  await create(product);
  let card = page
    .locator(".recipe-card")
    .filter({ has: page.getByRole("heading", { name: product, exact: true }) });
  await expect(card).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "Archiver", exact: true }).click();
  await expect(card).toHaveCount(0);
  await page.getByRole("button", { name: /^Archives/ }).click();
  card = page.locator(".recipe-card").filter({ hasText: product });
  await card.getByRole("button", { name: "Restaurer" }).click();
  await expect(card).toHaveCount(0);
  await page.getByRole("button", { name: "Produits actifs" }).click();
  await create(`${product} supprimer`);
  const removable = page
    .locator(".recipe-card")
    .filter({
      has: page.getByRole("heading", {
        name: `${product} supprimer`,
        exact: true,
      }),
    });
  page.once("dialog", (d) => d.accept());
  await removable
    .getByRole("button", { name: "Supprimer", exact: true })
    .click();
  await expect(removable).toHaveCount(0);
  await page
    .getByRole("button", { name: "Clients & fidélité", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Ajouter un client", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nom", { exact: true }).fill(client);
  await dialog
    .getByLabel("Contact", { exact: true })
    .fill("client@example.test");
  await dialog
    .getByLabel("Consentement fidélité recueilli")
    .selectOption("true");
  await dialog
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const row = page.getByRole("row").filter({ hasText: client });
  await row.getByRole("button", { name: "Ajuster les points" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Points à ajouter ou retirer").fill("30");
  await dialog.getByLabel("Motif").fill("Test fidélité");
  await dialog
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await row.getByRole("button", { name: "Offrir un code" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Code unique").fill(code);
  await dialog.getByLabel("Valeur (% ou € selon le type)").fill("10");
  await dialog.getByLabel("Points à échanger").fill("20");
  await dialog.getByLabel("Valable jusqu’au").fill("2099-12-31");
  await dialog
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    row.getByRole("cell", { name: "10", exact: true }),
  ).toBeVisible();
  const coupon = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: code, exact: true }) });
  const popupPromise = page.waitForEvent("popup");
  await coupon.getByRole("link", { name: /Voir la fiche client/ }).click();
  const popup = await popupPromise;
  await expect(popup.getByText(code, { exact: true })).toBeVisible();
  await expect(popup.getByText("Disponible", { exact: true })).toBeVisible();
  await popup.close();
  await profile(page, "Karim");
  await expect(
    page.getByRole("heading", { name: "Cuisine", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Nouvelle commande", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Table 11", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: `Ajouter ${product}`, exact: true })
    .click();
  await dialog.getByRole("button", { name: /Envoyer en préparation/ }).click();
  await expect(dialog).toHaveCount(0);
  const ticket = page.locator(".kds-card").filter({ hasText: "Table 11" });
  await ticket.getByRole("button", { name: "Commencer", exact: true }).click();
  await ticket
    .getByRole("button", { name: "Marquer prêt", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Plan de salle", exact: true })
    .click();
  const order = page.locator(".order-card").filter({ hasText: "Table 11" });
  await order.getByRole("button", { name: "Servir", exact: true }).click();
  await expect(order.getByRole("button", { name: "Servir", exact:true })).toHaveCount(0);
  await expect(order.getByRole("button", { name: /Clôturer/ })).toHaveCount(0);
  await profile(page, "Lina");
  await page
    .getByRole("button", { name: "Plan de salle", exact: true })
    .click();
  await page
    .locator(".order-card")
    .filter({ hasText: "Table 11" })
    .getByRole("button", { name: /Clôturer/ })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Client titulaire").selectOption({ label: client });
  await dialog.getByLabel("Code promo personnel").fill(code);
  await dialog
    .getByRole("button", { name: "Confirmer le règlement déclaré" })
    .click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: /^Commandes/ }).click();
  await page.getByLabel("Filtrer les commandes").selectOption("paid");
  await expect(
    page.locator(".order-card").filter({ hasText: "Table 11" }),
  ).toContainText("9,00");
  await page
    .getByRole("button", { name: "Clients & fidélité", exact: true })
    .click();
  await expect(page.locator("article").filter({ hasText: code })).toContainText(
    "Utilisé",
  );
  await profile(page, "Youssef");
  await expect(
    page.getByRole("heading", { name: "Bar", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Plan de salle", exact: true })
    .click();
  await page.getByRole("button", { name: /^10/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Boissons", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Ajouter Thé à la menthe", exact: true })
    .click();
  await page.getByRole("button", { name: /Envoyer en préparation/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.locator(".order-card").filter({ hasText: "Table 10" }),
  ).toContainText("Thé à la menthe");
});
