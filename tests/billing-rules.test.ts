import test from "node:test";
import assert from "node:assert/strict";
import {subscriptionTrial,validateCapacity} from "../src/features/platform/billing-rules";
test("seven full days at first card registration, never another trial after cancellation",()=>{
  const first={stripe_subscription:null,status:"pending",paid_plan:0,trial_ends_at:"2020-01-01"};
  assert.equal(subscriptionTrial(first).trial_period_days,7);
  assert.equal(subscriptionTrial(first).trial_settings?.end_behavior.missing_payment_method,"cancel");
  for(const patch of [{stripe_subscription:"sub_old"},{status:"canceled"},{paid_plan:39},{trial_ends_at:null}])
    assert.deepEqual(subscriptionTrial({...first,...patch}),{});
});
test("extra establishments cannot reduce capacity or accept unbounded quantities",()=>{
  for(const n of [0,1,2,2.5,101,NaN])assert.throws(()=>validateCapacity(2,n));
  assert.equal(validateCapacity(2,3),3);
});
