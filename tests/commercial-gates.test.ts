import test from "node:test";
import assert from "node:assert/strict";
import { capabilities, type Capability } from "../src/core/modules/entitlements";
import { requireCommercialCapability, requirePlan } from "../src/features/platform/entitlements";
import type { DB } from "../src/infrastructure/database/db";

test("named gates follow the single subscription and query the requested establishment", async () => {
  const thresholds = { operations:39,website:39,loyalty:39,finance:39,"online-orders":39 } as const;
  for (const plan of [null,0,39]) for (const capability of capabilities) {
    const calls: unknown[][] = [];
    const db = { query: async (sql:string, params:unknown[]) => { calls.push(params); return { rows:sql.includes("addon_installed") ? [{installed:true}] : [{plan}] }; } } as unknown as DB;
    const old = await requirePlan(db,"site-a",thresholds[capability]).then(value=>({value}),error=>({error:error.message}));
    const next = await requireCommercialCapability(db,"site-a",capability).then(value=>({value}),error=>({error:error.message}));
    if (capability === "loyalty") {
      assert.deepEqual(next,{value:plan ?? 0});
      assert.deepEqual(calls,[["site-a"],["site-a"],["site-a","loyalty"]]);
    } else {
      assert.deepEqual(next,old);
      assert.deepEqual(calls,[["site-a"],["site-a"],...(plan !== null && plan >= thresholds[capability] && ["website","online-orders"].includes(capability) ? [["site-a",capability]] : [])]);
    }
  }
});
test("unknown capabilities are refused before any query", async () => {
  const db = { query: () => { throw new Error("must not query"); } } as unknown as DB;
  for (const key of ["unknown","toString","__proto__"])
    await assert.rejects(requireCommercialCapability(db,"site-a",key as Capability),/Unknown commercial capability/);
});
