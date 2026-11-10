import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, name: string) {
  await page.addInitScript(() => {
    for (const id of ["nadia", "leila"])
      localStorage.setItem(
        `atacuisine-tour:v1:${id}`,
        JSON.stringify({ seen: true, done: [] }),
      );
  });
  await page.goto("/demo");
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page).toHaveURL(/dashboard/);
  const later = page.getByRole("button", { name: "Plus tard", exact: true });
  if (await later.isVisible()) await later.click();
  await page.getByText("Personnaliser mon pilotage", { exact: true }).click();
}
test("pilotage choices persist, synchronize, reset and stay personal", async ({
  page,
  context,
}, testInfo) => {
  await login(page, "Nadia");
  await page.getByRole("button", { name: "Tout réafficher" }).click();
  const initialSave = page.getByRole("button", {
    name: "Enregistrer dans mon compte",
  });
  if (await initialSave.isEnabled()) {
    await initialSave.click();
    await expect(page.locator("details").getByRole("status")).toHaveText(
      "Préférences enregistrées dans votre compte.",
    );
  }
  const sales = page.getByRole("checkbox", {
    name: "Le rythme des ventes",
    exact: true,
  });
  await expect(page.getByRole("checkbox")).toHaveCount(10);
  await sales.uncheck();
  await page
    .getByRole("button", { name: "Enregistrer dans mon compte" })
    .click();
  await expect(page.locator("details").getByRole("status")).toHaveText(
    "Préférences enregistrées dans votre compte.",
  );
  await expect(
    page.getByRole("heading", { name: "Le rythme des ventes", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await page.getByText("Personnaliser mon pilotage", { exact: true }).click();
  await expect(sales).not.toBeChecked();
  const second = await context.newPage();
  await second.goto("/dashboard");
  await second.getByText("Personnaliser mon pilotage", { exact: true }).click();
  await expect(
    second.getByRole("button", { name: "Tout réafficher" }),
  ).toBeEnabled();
  await expect(
    second.getByRole("heading", { name: "Le rythme des ventes", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Tout réafficher" }).click();
  await page
    .getByRole("button", { name: "Enregistrer dans mon compte" })
    .click();
  await expect(page.locator("details").getByRole("status")).toHaveText(
    "Préférences enregistrées dans votre compte.",
  );
  await expect(
    second.getByRole("heading", { name: "Le rythme des ventes", exact: true }),
  ).toBeVisible();
  await second.close();
  await sales.uncheck();
  await page
    .getByRole("button", { name: "Enregistrer dans mon compte" })
    .click();
  await expect(page.locator("details").getByRole("status")).toHaveText(
    "Préférences enregistrées dans votre compte.",
  );
  const profiles = await (await page.request.get("/api/v1/profiles")).json();
  const accountant = profiles.find(
    (p: { role: string }) => p.role === "ACCOUNTANT",
  );
  expect(accountant).toBeTruthy();
  await login(page, accountant.name);
  await expect(sales).toBeChecked();
  await login(page, "Nadia");
  await expect(sales).not.toBeChecked();
  await page.getByRole("button", { name: "Tout réafficher" }).click();
  for (const checkbox of await page.getByRole("checkbox").all())
    await checkbox.uncheck();
  await expect(
    page.getByText("Tous les blocs sont masqués.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tout réafficher" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: testInfo.outputPath("pilotage-mobile.png"),
    fullPage: true,
  });
});

test("account preferences cross devices, reject conflicts and survive failed saves", async ({
  page,
  browser,
}) => {
  await login(page, "Nadia");
  await page.getByRole("button", { name: "Tout réafficher" }).click();
  const save = page.getByRole("button", {
    name: "Enregistrer dans mon compte",
  });
  if (await save.isEnabled()) {
    await save.click();
    await expect(page.locator("details").getByRole("status")).toHaveText(
      "Préférences enregistrées dans votre compte.",
    );
  }
  await page
    .getByRole("checkbox", { name: "Le rythme des ventes", exact: true })
    .uncheck();
  await save.click();
  await expect(page.locator("details").getByRole("status")).toHaveText(
    "Préférences enregistrées dans votre compte.",
  );
  const device = await browser.newContext();
  try {
    const other = await device.newPage();
    await login(other, "Nadia");
    await expect(
      other.getByRole("checkbox", {
        name: "Le rythme des ventes",
        exact: true,
      }),
    ).not.toBeChecked();
    await other
      .getByRole("checkbox", { name: "QR codes", exact: true })
      .uncheck();
    await other
      .getByRole("button", { name: "Enregistrer dans mon compte" })
      .click();
    await expect(other.locator("details").getByRole("status")).toHaveText(
      "Préférences enregistrées dans votre compte.",
    );
    await page
      .getByRole("checkbox", { name: "Objectif du jour", exact: true })
      .uncheck();
    await save.click();
    await expect(page.locator("details").getByRole("alert")).toContainText(
      "modifiées ailleurs",
    );
    await page
      .getByRole("button", { name: "Recharger mes préférences" })
      .click();
    await expect(
      page.getByRole("checkbox", { name: "QR codes", exact: true }),
    ).not.toBeChecked();
    await expect(
      page.getByRole("checkbox", { name: "Objectif du jour", exact: true }),
    ).toBeChecked();
    await page.route("**/pilotage", (route) =>
      route.request().method() === "PUT" ? route.abort() : route.continue(),
    );
    await page.getByRole("button", { name: "Tout réafficher" }).click();
    await save.click();
    await expect(page.locator("details").getByRole("alert")).toBeVisible();
    await expect(save).toBeEnabled();
    await page.unroute("**/pilotage");
    await save.click();
    await expect(page.locator("details").getByRole("status")).toHaveText(
      "Préférences enregistrées dans votre compte.",
    );
    const endpoint = "/api/restaurants/bernay/pilotage";
    const current = await (await page.request.get(endpoint)).json();
    const origin = process.env.E2E_URL || "http://127.0.0.1:3000";
    const mismatch = await page.request.put(endpoint, {
      headers: { origin, "x-pilotage-account": "leila" },
      data: { hidden: [], revision: current.revision },
    });
    expect(mismatch.status()).toBe(409);
    const csrf = await page.request.put(endpoint, {
      headers: {
        origin: "https://invalid.example",
        "x-pilotage-account": "nadia",
      },
      data: { hidden: [], revision: current.revision },
    });
    expect(csrf.status()).toBe(403);
  } finally {
    await device.close();
  }
});
