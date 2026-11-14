import test from "node:test";
import assert from "node:assert/strict";
import { defaultConfig } from "../src/features/cms/defaults";
import {
  applySiteTemplate,
  siteTemplates,
} from "../src/features/cms/templates";
import { checkInvariants, contrastChecks } from "../src/features/cms/rules";
import { siteConfigSchema } from "../src/features/cms/schema";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { TenantSiteProvider } from "../src/components/cms-site/context";
import { PresentationFields } from "../src/components/site-editor/presentation-fields";
import {
  effectIsPremium,
  effectsAreValid,
} from "../src/features/cms/effects";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

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

test("templates ship unique content, media on disk and distinct compositions", () => {
  const compositions = new Set<string>();
  const heroes = new Set<string>();
  for (const template of siteTemplates) {
    const result = siteConfigSchema.parse(
      applySiteTemplate(defaultConfig(), template, true),
    );
    const home = result.pages.home;
    const hero = home.sections.find((s) => s.type === "hero");
    assert.ok(hero?.type === "hero", template.id);
    // Unique voice: no two templates share the same hero title or lead.
    assert.ok(!heroes.has(hero.props.title), `${template.id}: hero title duplicated`);
    heroes.add(hero.props.title);
    assert.ok(hero.props.lead.length > 40, `${template.id}: hero lead too short`);
    // Composition differs from every other template.
    const signature = home.sections.map((s) => s.type).join("|");
    assert.ok(!compositions.has(signature), `${template.id}: composition duplicated`);
    compositions.add(signature);
    // Media referenced by the template exists in the repository.
    for (const section of home.sections) {
      const props = section.props as Record<string, unknown>;
      const sources: string[] = [];
      if (typeof props.image === "object" && props.image) {
        const src = (props.image as { src?: string }).src;
        if (src) sources.push(src);
      }
      if (typeof props.source === "object" && props.source) {
        const src = (props.source as { src?: string }).src;
        if (src) sources.push(src);
      }
      for (const src of sources) {
        if (!src.startsWith("/cms/")) continue;
        assert.ok(
          existsSync(resolve("public", src.replace(/^\//, ""))),
          `${template.id}: missing ${src}`,
        );
      }
    }
  }
});

test("every template has its own effect signature, no signature twice", () => {
  const signatures = new Set<string>();
  for (const template of siteTemplates) {
    const effects = template.theme.presentation?.effects;
    assert.ok(effects, `${template.id}: no effect signature`);
    assert.ok(
      effectsAreValid(effects),
      `${template.id}: invalid effect signature`,
    );
    const signature = `${effects.title}|${effects.button}|${effects.card}|${effects.badge}`;
    assert.ok(!signatures.has(signature), `${template.id}: effect signature duplicated`);
    signatures.add(signature);
    // Les effets payants en CPU sont réservés aux modèles premium.
    if (effectIsPremium(effects.button) || effectIsPremium(effects.card))
      assert.ok(template.premium, `${template.id}: heavy effect on a free model`);
  }
  assert.equal(signatures.size, siteTemplates.length);
});

test("un modèle gratuit ne peut pas activer un effet premium", () => {
  const free = siteTemplates.find((t) => !t.premium)!;
  const premium = siteTemplates.find((t) => t.premium)!;
  const freeConfig = applySiteTemplate(defaultConfig(), free, true);
  freeConfig.theme.presentation!.effects = {
    ...freeConfig.theme.presentation!.effects!,
    button: "spark",
  };
  assert.throws(() => checkInvariants(freeConfig), /premium/);
  const premiumConfig = applySiteTemplate(defaultConfig(), premium, true);
  premiumConfig.theme.presentation!.effects = {
    ...premiumConfig.theme.presentation!.effects!,
    button: "spark",
  };
  assert.doesNotThrow(() => checkInvariants(premiumConfig));
});

test("une composition sans effet reste acceptée (site ancien, effets coupés)", () => {
  const template = siteTemplates.find((t) => t.id === "bistrot")!;
  const config = applySiteTemplate(defaultConfig(), template, true);
  config.theme.presentation!.effects = undefined;
  assert.doesNotThrow(() => checkInvariants(config));
  const parsed = siteConfigSchema.parse(config);
  assert.equal(parsed.theme.presentation?.effects, undefined);
});

test("l’éditeur propose un choix d’effet par emplacement", () => {
  const template = siteTemplates.find((t) => t.id === "signature")!;
  const html = renderToString(
    createElement(
      TenantSiteProvider,
      { restaurant: "atelier" },
      createElement(PresentationFields, {
        value: template.theme.presentation!,
        change: () => {},
      }),
    ),
  );
  for (const label of [
    "Effets d’interface",
    "Titre de la bannière",
    "Bouton principal",
    "Cartes de la carte",
    "Pastilles d’avantages",
  ])
    assert.ok(html.includes(label), label);
  // Sur un modèle gratuit, l’effet premium est proposé mais verrouillé.
  const free = siteTemplates.find((t) => !t.premium)!;
  const freeHtml = renderToString(
    createElement(
      TenantSiteProvider,
      { restaurant: "atelier" },
      createElement(PresentationFields, {
        value: free.theme.presentation!,
        change: () => {},
      }),
    ),
  );
  assert.match(freeHtml, /<option value="spark" disabled=""/);
});

test("every template ships a playable video and a gallery with photos", () => {
  for (const template of siteTemplates) {
    const result = siteConfigSchema.parse(
      applySiteTemplate(defaultConfig(), template, true),
    );
    const types = result.pages.home.sections.map((s) => s.type);
    assert.ok(types.includes("video"), `${template.id}: no video section`);
    assert.ok(types.includes("featuredProducts"), `${template.id}: no offer section`);
    if (types.includes("gallery")) {
      const gallery = result.pages.home.sections.find((s) => s.type === "gallery");
      assert.ok(
        gallery?.type === "gallery" && gallery.props.images.length > 0,
        `${template.id}: gallery has no photo`,
      );
    }
    const video = result.pages.home.sections.find((s) => s.type === "video");
    assert.ok(
      video?.type === "video" &&
        video.props.source.kind === "file" &&
        video.props.source.src.endsWith(".mp4"),
      `${template.id}: video has no local file`,
    );
  }
});
