import { NextRequest } from "next/server";
import { addonWebhook } from "@/features/addons/billing-config";
import { reconcilePurchase, reconcilePurchaseByIntent } from "@/features/addons/purchases";
import { reconcileAddon } from "@/features/addons/service";
import { reconcileStudioCredit,reconcileStudioCreditByIntent } from "@/features/credits/studio";
import { json } from "@/features/platform/http";
export const runtime="nodejs";
const subscriptionEvents=['customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed'];
const sessionEvents=['checkout.session.completed','checkout.session.expired','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed'];
const chargeEvents=['charge.refunded','charge.dispute.created','charge.dispute.updated','charge.dispute.closed'];
export async function POST(req:NextRequest){
 try{
  const raw=await req.text();if(raw.length>1_000_000)return json({error:"Notification trop volumineuse"},413);
  const event=addonWebhook(raw,req.headers.get('stripe-signature')||'');
  if(![...subscriptionEvents,...sessionEvents,...chargeEvents].includes(event.type))return json({received:true});
  const object=event.data.object as unknown as {metadata?:Record<string,string>;payment_intent?:string|{id:string}|null;parent?:{subscription_details?:{metadata?:Record<string,string>}}};
  if(chargeEvents.includes(event.type)){
   const intent=typeof object.payment_intent==='string'?object.payment_intent:object.payment_intent?.id;
   if(intent){await reconcilePurchaseByIntent(intent);await reconcileStudioCreditByIntent(intent);}
   return json({received:true});
  }
  if(object.metadata?.studio_credit_order){await reconcileStudioCredit(object.metadata.studio_credit_order);return json({received:true});}
  if(object.metadata?.addon_purchase){await reconcilePurchase(object.metadata.addon_purchase);return json({received:true});}
  const id=object.metadata?.addon_order ?? object.parent?.subscription_details?.metadata?.addon_order;
  if(id)await reconcileAddon(id);
  return json({received:true});
 }catch{return json({error:"Notification non traitée ; réessayer."},400);}
}
