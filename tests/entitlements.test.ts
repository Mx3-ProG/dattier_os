import test from "node:test";
import assert from "node:assert/strict";
import { commercialRights, compareLegacyThreshold, type EntitlementContext } from "../src/core/modules/entitlements";
const context: EntitlementContext = { organization: "a", establishment: "one", active: true, offer: "basic", now: 100, grants: [] };
test("all current thresholds retain their decisions, including inactive plans", () => {
  for (const plan of [0,39,69,99]) for (const minimum of [39,69,99]) {
    const result = compareLegacyThreshold(plan,minimum);
    assert.ok(result.comparable && result.matches);
  }
  assert.deepEqual(compareLegacyThreshold(99,0),{comparable:false});
  assert.deepEqual(compareLegacyThreshold(100,99),{comparable:true,legacy:true,proposed:false,matches:false});
});
test("grants are isolated, bounded in time, deduplicated and cannot reactivate a suspended organization", () => {
  const grants = [
    { organization:"other", capabilities:["finance" as const], startsAt:0, endsAt:200 },
    { organization:"a", establishment:"two", capabilities:["website" as const], startsAt:0, endsAt:200 },
    { organization:"a", capabilities:["online-orders" as const], startsAt:0, endsAt:100 },
    { organization:"a", capabilities:["finance" as const], startsAt:101, endsAt:200 },
    { organization:"a", capabilities:["loyalty" as const,"operations" as const], startsAt:100, endsAt:200 },
  ];
  assert.deepEqual(commercialRights({...context,grants}),["operations","loyalty"]);
  assert.deepEqual(commercialRights({...context,grants,active:false}),[]);
  assert.deepEqual(commercialRights({...context,grants,organization:""}),[]);
  assert.deepEqual(commercialRights({...context,grants,now:NaN}),[]);
});
