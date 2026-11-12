import { authenticated } from "./http";
import { billingContext, planBillingReady, planStripe, planPriceId } from "./plan-billing";
import { one, rows, type DB } from "@/infrastructure/database/db";
import { appOrigin } from "@/infrastructure/auth/oidc";
import { assertSameMode, saasLive } from "@/features/billing/stripe-saas";
import { validateCapacity } from "./billing-rules";
import { addonCatalog } from "@/features/addons/catalog";

export async function ownerBillingContext(db: DB, organization: string) {
  const context = await billingContext(db, organization);
  if (!context.owner) throw new Error("Facturation réservée au propriétaire : accès non autorisé.");
  return context;
}

/** All lookups are authorized against the organization before querying Stripe. */
export async function billingAccount(organization: string, page = 0) {
  const state = await authenticated(undefined, async db => {
    const context = await ownerBillingContext(db, organization);
    const capacity = await one<{ seats: number; occupied: number }>(db,
      "SELECT seats,occupied FROM app.organization_plan($1)", [organization]);
    const addons = await rows<{id:string;addon:string;status:string;restaurant:string;restaurant_id:string;valid_until:string|null;renewal_cancelled:boolean}>(db,
      "SELECT s.id,s.addon,s.status,r.name AS restaurant,r.id AS restaurant_id,s.valid_until,s.renewal_cancelled FROM addon_subscriptions s JOIN restaurants r ON r.id=s.restaurant_id WHERE r.organization_id=$1 ORDER BY s.created_at DESC", [organization]);
    const purchases = await rows<{id:string;label:string;restaurant:string;amount:number;refunded:number;currency:string;status:string;created_at:string}>(db, `
      SELECT * FROM (
        SELECT 'addon:'||a.id AS id,p.name AS label,r.name AS restaurant,a.amount_cents AS amount,
          a.refunded_cents AS refunded,a.currency,a.status,a.created_at
        FROM addon_purchases a JOIN restaurants r ON r.id=a.restaurant_id JOIN addon_products p ON p.id=a.product_id
        WHERE r.organization_id=$1
        UNION ALL
        SELECT 'credit:'||c.id,'Crédits Studio',r.name,c.pack_cents,c.refunded_cents,'eur',c.status,c.created_at
        FROM studio_credit_orders c JOIN restaurants r ON r.id=c.restaurant_id WHERE r.organization_id=$1
      ) orders ORDER BY created_at DESC,id DESC LIMIT 21 OFFSET $2`, [organization,page*20]);
    return { context, capacity, addons, purchases:purchases.slice(0,20), morePurchases:purchases.length>20 };
  });
  let subscription: null | {status:string;quantity:number;unitAmount:number;currency:string;periodEnd:number|null;trialEnd:number|null;cancelling:boolean;pendingUpdate:boolean} = null;
  let upcoming: null | {amount:number;currency:string;date:number|null} = null;
  let warning = "";
  if (planBillingReady() && state.context.stripe_subscription) {
    try {
      const stripe = planStripe();
      const sub = await stripe.subscriptions.retrieve(state.context.stripe_subscription);
      assertSameMode(sub);
      if(sub.metadata.studio_plan_org!==organization) throw new Error("Abonnement incompatible.");
      const item=sub.items.data[0];
      subscription = {status:sub.status,quantity:item?.quantity??1,unitAmount:item?.price.unit_amount??0,
        currency:sub.currency,periodEnd:item?.current_period_end??null,trialEnd:sub.trial_end,
        cancelling:Boolean(sub.cancel_at_period_end||sub.cancel_at),pendingUpdate:!!sub.pending_update};
      if (!subscription.cancelling && ["active","trialing"].includes(sub.status)) {
        try {
          const invoice=await stripe.invoices.createPreview({subscription:sub.id});
          upcoming={amount:invoice.amount_due,currency:invoice.currency,date:sub.status==="trialing"?sub.trial_end:item?.current_period_end??null};
        } catch { warning="Le montant de la prochaine facture n’est pas disponible pour le moment."; }
      }
    } catch { warning="Stripe est momentanément indisponible. Les achats enregistrés restent consultables."; }
  }
  return {...state, context: {status:state.context.status,trialEnd:state.context.trial_ends_at,hasCustomer:!!state.context.stripe_customer},
    addons:state.addons.map(a=>({...a,label:addonCatalog.find(p=>p.id===a.addon)?.name??a.addon})),
    ready:planBillingReady(),live:saasLive(),subscription,upcoming,warning};
}

/** Paginated invoices for the plan or one authorized add-on subscription. */
export async function billingInvoices(organization:string, source:string, cursor?:string) {
  const filter = await authenticated(undefined,async db=>{
    const context=await ownerBillingContext(db,organization);
    if(source==='plan') return context.stripe_customer ? {customer:context.stripe_customer} : null;
    const addon=await one<{stripe_subscription:string|null}>(db,
      "SELECT s.stripe_subscription FROM addon_subscriptions s JOIN restaurants r ON r.id=s.restaurant_id WHERE s.id=$1 AND r.organization_id=$2",[source,organization]);
    return addon.stripe_subscription ? {subscription:addon.stripe_subscription} : null;
  });
  if(!filter || !planBillingReady()) return {invoices:[],next:null};
  const invoices=await planStripe().invoices.list({...filter,limit:20,...(cursor?{starting_after:cursor}:{})});
  return {invoices:invoices.data.map(i=>({id:i.id,number:i.number,date:i.created,status:i.status,
    amount:i.total,paid:i.amount_paid,currency:i.currency,url:i.hosted_invoice_url,pdf:i.invoice_pdf})),
    next:invoices.has_more?invoices.data.at(-1)?.id??null:null};
}

/** Stripe displays the exact prorated charge and requests confirmation. */
export async function capacityCheckout(organization:string,quantity:number) {
  const context=await authenticated(undefined,db=>ownerBillingContext(db,organization));
  if(!context.stripe_subscription || !context.stripe_customer) throw new Error("Activez d’abord votre abonnement.");
  const stripe=planStripe();
  const sub=await stripe.subscriptions.retrieve(context.stripe_subscription);
  assertSameMode(sub);
  const item=sub.items.data[0];
  if(sub.metadata.studio_plan_org!==organization || sub.items.data.length!==1 || item.price.id!==await planPriceId())
    throw new Error("Abonnement incompatible.");
  if(sub.status!=="active" || sub.cancel_at_period_end || sub.cancel_at || sub.pending_update)
    throw new Error("L’ajout de places nécessite un abonnement actif, hors essai, sans résiliation ni paiement en attente.");
  validateCapacity(item.quantity??1,quantity);
  // A narrowly scoped portal: quantity only, never switch to another product or remove occupied seats.
  const product=typeof item.price.product==='string'?item.price.product:item.price.product.id;
  const configuration=await stripe.billingPortal.configurations.create({
    business_profile:{headline:"Studio — ajouter des établissements"},
    features:{subscription_update:{enabled:true,default_allowed_updates:["quantity"],proration_behavior:"always_invoice",
      products:[{product,prices:[item.price.id],adjustable_quantity:{enabled:true,minimum:item.quantity??1,maximum:100}}]}},
    metadata:{studio_capacity:"true"},
  },{idempotencyKey:`studio-capacity-config:${sub.id}:${item.quantity??1}`});
  const session=await stripe.billingPortal.sessions.create({customer:context.stripe_customer,configuration:configuration.id,
    return_url:`${appOrigin()}/platform#abonnements`,locale:"fr",
    flow_data:{type:"subscription_update_confirm",subscription_update_confirm:{subscription:sub.id,items:[{id:item.id,quantity}]},
      after_completion:{type:"redirect",redirect:{return_url:`${appOrigin()}/platform#abonnements`}}}});
  return {url:session.url};
}
