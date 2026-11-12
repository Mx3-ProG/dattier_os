import test from "node:test";
import assert from "node:assert/strict";
import { defaultConfig } from "../src/features/cms/defaults";
import {
  applySiteTemplate,
  siteTemplates,
} from "../src/features/cms/templates";
import { contrastChecks } from "../src/features/cms/rules";
import { siteConfigSchema } from "../src/features/cms/schema";

test("all templates preserve identity, legal and protected pages", () => {
  // Free + premium partition the whole catalogue (no hardcoded count).
  assert.equal(
    siteTemplates.filter((t) => !t.premium).length +
      siteTemplates.filter((t) => t.premium).length,
    siteTemplates.length,
  );
  for (const template of siteTemplates) {
    const original = defaultConfig();
    const snapshot = structuredClone(original);
    const result = applySiteTemplate(original, template, true);
    siteConfigSchema.parse(result);
    assert.deepEqual(original, snapshot);
    assert.deepEqual(result.branding, original.branding);
    assert.deepEqual(result.legal, original.legal);
    for (const [key, page] of Object.entries(original.pages)) {
      if (key !== "home") assert.deepEqual(result.pages[key], page);
    }
    assert.ok(
      contrastChecks(result.theme).every((c) => c.ratio >= c.min),
      template.id,
    );
    assert.deepEqual(
      applySiteTemplate(original, template).pages,
      original.pages,
    );
  }
});

test("templates have distinct compositions and premium-only defaults", () => {
  assert.equal(
    new Set(siteTemplates.map((t) => t.theme.presentation?.layout)).size,
    siteTemplates.length,
  );
  assert.equal(
    new Set(siteTemplates.map((t) => t.image)).size,
    siteTemplates.length,
  );
  for (const template of siteTemplates) {
    const result = siteConfigSchema.parse(
      applySiteTemplate(defaultConfig(), template, true),
    );
    const p = result.theme.presentation!;
    assert.equal(p.stickyHeader, template.premium);
    assert.equal(p.motion, template.premium);
    assert.equal(p.surprise, template.premium);
    assert.equal(p.stickyAction !== "none", template.premium);
    assert.equal(p.layout, template.id);
    const hero = result.pages.home.sections.find((s) => s.type === "hero");
    assert.ok(
      hero?.type === "hero" &&
        (hero.props.image.src === template.image ||
          hero.props.image.src.startsWith("/cms/")),
      template.id,
    );
  }
});

test("legacy sites keep their theme and premium effects can be disabled and saved", () => {
  assert.equal(
    siteConfigSchema.parse(defaultConfig()).theme.presentation,
    undefined,
  );
  const result = applySiteTemplate(
    defaultConfig(),
    siteTemplates.find((t) => t.id === "signature")!,
    true,
  );
  result.theme.presentation = {
    layout: "signature",
    stickyHeader: false,
    stickyAction: "none",
    motion: false,
    surprise: false,
  };
  assert.deepEqual(
    siteConfigSchema.parse(JSON.parse(JSON.stringify(result))).theme
      .presentation,
    result.theme.presentation,
  );
  const free = applySiteTemplate(result, siteTemplates[0]);
  assert.equal(free.theme.presentation?.stickyAction, "none");
  assert.equal(free.theme.presentation?.stickyHeader, false);
});
