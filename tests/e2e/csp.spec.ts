import { test, expect, type Page } from "@playwright/test";
const origin = process.env.E2E_URL || "http://127.0.0.1:3000";

/**
 * Écoute l'événement du navigateur : la console ne montre pas toutes les violations,
 * notamment un `new Function` dont l'exception est absorbée.
 */
async function watchViolations(page: Page) {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __csp: string[] }).__csp = seen;
    document.addEventListener("securitypolicyviolation", (e) =>
      seen.push(`${e.effectiveDirective} ${e.blockedURI}`),
    );
  });
  return () =>
    page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
}
const header = (headers: Record<string, string>) =>
  headers["content-security-policy"] ||
  headers["content-security-policy-report-only"] ||
  "";

test("chaque page reçoit un nonce neuf, repris par ses scripts", async ({
  request,
}) => {
  const first = await request.get("/r/bernay");
  const second = await request.get("/r/bernay");
  const nonce = /'nonce-([^']+)'/.exec(header(first.headers()))?.[1];
  const other = /'nonce-([^']+)'/.exec(header(second.headers()))?.[1];
  expect(nonce).toBeTruthy();
  expect(other).toBeTruthy();
  expect(nonce).not.toBe(other);
  expect(await first.text()).toContain(`nonce="${nonce}"`);
});

test("les pages n'ont qu'une seule CSP et les API restent sans nonce", async ({
  request,
}) => {
  const page = await request.get("/r/bernay");
  const values = page
    .headersArray()
    .filter((h) => /^content-security-policy/i.test(h.name));
  expect(values).toHaveLength(1);
  expect(values[0].value).toContain("'strict-dynamic'");
  const api = await request.get("/api/health");
  expect(header(api.headers())).not.toContain("nonce");
});

test("une injection dans le HTML est bloquée et le site reste fonctionnel", async ({
  page,
}) => {
  // Simule une XSS stockée : le contenu arrive dans la page servie, avec la vraie CSP.
  await page.route("**/r/bernay", async (route) => {
    if (route.request().resourceType() !== "document") return route.continue();
    const response = await route.fetch();
    const body = (await response.text()).replace(
      "</body>",
      `<script>window.__inline=true</script><img src="/x" onerror="window.__handler=true"></body>`,
    );
    await route.fulfill({ response, body });
  });
  const response = await page.goto("/r/bernay");
  test.skip(
    !response?.headers()["content-security-policy"],
    "CSP en observation : l'injection n'est pas bloquée",
  );
  await page.waitForLoadState("load");
  const flags = await page.evaluate(() => {
    const w = window as unknown as { __inline?: boolean; __handler?: boolean };
    return [w.__inline === true, w.__handler === true];
  });
  expect(flags).toEqual([false, false]);
  // React a bien hydraté la page : le bandeau réagit au clic.
  const banner = page.locator(".donut-cookie-banner");
  await banner.locator("button").first().click();
  await expect(banner).toHaveCount(0);
});

for (const path of [
  "/",
  "/guide",
  "/demo",
  "/site-demo",
  "/r/bernay",
  "/r/bernay/carte",
  "/r/bernay/compte",
]) {
  test(`aucune violation sur ${path}`, async ({ page }) => {
    const violations = await watchViolations(page);
    await page.goto(path);
    await page.waitForLoadState("load");
    await page.waitForTimeout(1500);
    expect(await violations()).toEqual([]);
  });
}

test("le bandeau cookies reste masqué pour un visiteur qui a déjà choisi", async ({
  page,
}) => {
  const violations = await watchViolations(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      "atacuisine-cookie-consent:bernay",
      JSON.stringify({ version: 1, externalMedia: false }),
    );
  });
  await page.goto("/r/bernay");
  await page.waitForLoadState("load");
  await expect(page.locator(".donut-cookie-banner")).toHaveCount(0);
  expect(await violations()).toEqual([]);
});

test("le tableau de bord et l'administration ne provoquent aucune violation", async ({
  page,
}) => {
  const violations = await watchViolations(page);
  const response = await page.request.post("/api/v1/login", {
    headers: { origin },
    data: { id: "nadia" },
  });
  expect(response.ok()).toBeTruthy();
  await page.addInitScript(() => {
    localStorage.setItem(
      "atacuisine-tour:v1:nadia",
      JSON.stringify({ seen: true, done: [] }),
    );
  });
  await page.goto("/dashboard?restaurant=bernay");
  await expect(page.locator(".sidebar-profile")).toBeVisible();
  expect(await violations()).toEqual([]);
  await page.goto("/restaurant/bernay");
  await page.waitForLoadState("load");
  await page.waitForTimeout(1500);
  expect(await violations()).toEqual([]);
});

test("un média n'exécute rien, même ouvert directement", async ({ request }) => {
  const logo = await request.get("/r/bernay");
  const media = /\/api\/cms\/[^"'\s]+\/media\/[a-f0-9-]{36}\.\w+/.exec(
    await logo.text(),
  )?.[0];
  test.skip(!media, "aucun média envoyé dans les données de démonstration");
  const response = await request.get(media!);
  expect(response.headers()["content-security-policy"]).toContain("sandbox");
});
