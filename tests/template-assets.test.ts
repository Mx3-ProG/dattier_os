import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { siteTemplates } from "../src/features/cms/templates";

test("all catalogue visuals are local, lightweight and self-contained", () => {
  for (const t of siteTemplates) {
    const svg = readFileSync(`public${t.image}`, 'utf8');
    assert.match(svg, /<svg/);
    assert.ok(Buffer.byteLength(svg) < 12000, t.name);
    assert.doesNotMatch(svg, /<script|<foreignObject|(?:href|src)=["']https?:/i);
  }
});
