import { test, expect, type Locator } from "@playwright/test";
import {
  defaultAppearance,
  themeVariables,
} from "../../src/features/appearance/theme";
import { chapters } from "../../src/features/guide/content";
const origin = process.env.E2E_URL || "http://127.0.0.1:3000";
const rgb = (hex: string) =>
  `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;

for (const mode of ["dark", "light"] as const) {
  test(`tutoriel ${mode} : accueil, centre, étapes et fin suivent la palette`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.request.post("/api/v1/login", {
      headers: { origin },
      data: { id: "nadia" },
    });
    const value = {
      ...defaultAppearance,
      mode,
      color: mode === "dark" ? "#7950b5" : "#2563b8",
      textSize: "large" as const,
    };
    const vars = themeVariables(value);
    expect(
      (
        await page.request.put("/api/me/appearance", {
          headers: { origin, "X-Appearance-Account": "nadia" },
          data: value,
        })
      ).ok(),
    ).toBeTruthy();
    await page.goto("/dashboard?restaurant=bernay");
    async function surface(el: Locator) {
      await expect(el).toBeVisible();
      await expect(el).toHaveCSS(
        "background-color",
        rgb(vars["--appearance-surface"]),
      );
      await expect(el).toHaveCSS("color", rgb(vars["--appearance-ink"]));
      await expect(el.locator(".tour-primary").first()).toHaveCSS(
        "background-color",
        rgb(vars["--appearance-accent"]),
      );
    }
    await surface(page.locator(".tour-welcome"));
    await page.getByRole("button", { name: "Choisir un parcours" }).click();
    const center = page.locator(".tour-center");
    await surface(center);
    const suggestion = center.locator(".tour-ia-examples button").first();
    await expect(suggestion).toHaveCSS("color", rgb(vars["--appearance-ink"]));
    await expect(suggestion).toHaveCSS(
      "background-color",
      rgb(vars["--appearance-surface"]),
    );
    await page.screenshot({ path: `/tmp/tutorial-center-${mode}.png` });
    await center
      .getByRole("button", { name: /Premiers pas dans le poste de travail/ })
      .click();
    const steps = chapters.find((c) => c.id === "start")!.steps;
    for (let i = 0; i < steps.length; i++) {
      const bubble = page.locator(".tour-bubble");
      await expect(bubble.locator("h2")).toHaveText(steps[i].title);
      await surface(bubble);
      await expect(bubble.locator(".tour-chapter")).toHaveCSS(
        "color",
        rgb(vars["--appearance-link"]),
      );
      if (i === 1) {
        await expect(page.locator(".tour-hole")).toHaveCSS(
          "box-shadow",
          `${rgb(vars["--appearance-link"])} 0px 0px 0px 3px`,
        );
        await page.screenshot({ path: `/tmp/tutorial-step-${mode}.png` });
      }
      await bubble.locator(".tour-primary").click();
    }
    await expect(page.locator("#tour-finished-title")).toBeVisible();
    await surface(page.locator(".tour-welcome"));
    await page.getByRole("button", { name: "Retour au service" }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-tour="guide-button"]').click();
    await surface(center);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await center
      .getByRole("button", { name: /Premiers pas dans le poste de travail/ })
      .click();
    await surface(page.locator(".tour-bubble"));
    await expect(page.locator(".tour-primary")).toBeInViewport();
    await page.keyboard.press("Escape");
    await expect(page.locator(".tour-bubble")).toHaveCount(0);
    await page.goto("/guide");
    await expect(page.locator(".appearance-application")).toHaveAttribute(
      "data-appearance-mode",
      mode,
    );
  });
}
