import test from "node:test";
import assert from "node:assert/strict";
import {
  bookingFirst,
  defaultConfig,
  reservationVisitCta,
} from "../src/features/cms/defaults";
import { siteConfigSchema, type Section } from "../src/features/cms/schema";

test("new sites open the reservations page on the booking flow", () => {
  const config = defaultConfig();
  siteConfigSchema.parse(config);
  const sections = config.pages.reservations.sections;
  assert.deepEqual(
    sections.map((s) => s.id),
    ["reservations-form", "reservations-visit"],
  );
  const visit = sections[1];
  assert.ok(visit.type === "visit");
  assert.deepEqual(visit.props.cta, reservationVisitCta);
  assert.deepEqual(bookingFirst("reservations", sections), sections);
});

test("older sites get the booking flow first, without touching edited blocks", () => {
  const config = defaultConfig();
  const [form, visit] = config.pages.reservations.sections;
  assert.ok(visit.type === "visit");
  const legacyVisit: Section = {
    ...visit,
    props: {
      ...visit.props,
      cta: { label: "Choisir mon créneau", href: "/commander" },
    },
  };
  const legacy = [legacyVisit, form];
  const snapshot = structuredClone(legacy);
  const fixed = bookingFirst("reservations", legacy);
  assert.deepEqual(legacy, snapshot, "input is not mutated");
  assert.deepEqual(
    fixed.map((s) => s.id),
    ["reservations-form", "reservations-visit"],
  );
  const fixedVisit = fixed[1];
  assert.ok(fixedVisit.type === "visit");
  assert.deepEqual(fixedVisit.props.cta, reservationVisitCta);

  // A button the restaurant rewrote is kept as is.
  const edited: Section = {
    ...legacyVisit,
    props: {
      ...visit.props,
      cta: { label: "Nous appeler", href: "tel:+33232461211" },
    },
  };
  const kept = bookingFirst("reservations", [edited, form])[1];
  assert.ok(kept.type === "visit");
  assert.equal(kept.props.cta.label, "Nous appeler");

  // Other pages are never reordered.
  assert.equal(bookingFirst("contact", legacy), legacy);
});
