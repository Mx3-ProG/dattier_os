import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { addonBillingReady, addonStripe } from "@/features/addons/billing-config";
import { saasAutomaticTax, saasLive } from "@/features/billing/stripe-saas";
import { authenticated } from "@/features/platform/http";
import { scope } from "@/lib/auth/session";
import { one, rows } from "@/lib/database/db";

export const studioCreditPacks = [500, 1000, 2500] as const;
export const studioCreditsReady = () => addonBillingReady() && !!process.env.STUDIO_BILLING_STRIPE_SECRET_KEY && !!process.env.STUDIO_BILLING_DATABASE_URL;
type CreditOrder = {id:string;pack_cents:number;status:string;stripe_session:string|null;stripe_payment_intent:string|null};

export async function studioCreditState(restaurant:string) {
  return authenticated(restaurant,async(db,user)=>{
    await scope(db,user,restaurant);
    const {admin}=await one<{admin:boolean}>(db,"SELECT app.org_admin((SELECT organization_id FROM restaurants WHERE id=$1)) AS admin",[restaurant]);
    if(!admin) return {admin:false,balance:null,orders:[],ready:false,packs:studioCreditPacks};
    const balance=(await one<{balance:number}>(db,"SELECT app.studio_credit_balance($1) AS balance",[restaurant])).balance;
    const orders=await rows(db,"SELECT id,pack_cents,status,credited_cents,refunded_cents,created_at FROM studio_credit_orders WHERE restaurant_id=$1 ORDER BY created_at DESC LIMIT 50",[restaurant]);
    return {admin:true,balance,orders,ready:studioCreditsReady(),packs:studioCreditPacks};
  });
}

async function billingClient<T>(fn:(client:import("pg").PoolClient)=>Promise<T>):Promise<T>{
  const connection=process.env.STUDIO_BILLING_DATABASE_URL;
  if(!connection) throw new Error("Connexion de facturation indisponible.");
  const pool=new Pool({connectionString:connection,max:1,connectionTimeoutMillis:5000});
  const client=await pool.connect();
  try {await client.query("BEGIN");const result=await fn(client);await client.query("COMMIT");return result;}
  catch(error){await client.query("ROLLBACK");throw error;}
  finally {client.release();await pool.end();}
}

export async function reconcileStudioCredit(orderId:string){
  return billingClient(async(client)=>{
    const {rows}=await client.query<CreditOrder>("SELECT * FROM app.studio_credit_lock($1)",[orderId]);
    const order=rows[0];
    if(!order?.stripe_session) return;
    const stripe=addonStripe();
    const session=await stripe.checkout.sessions.retrieve(order.stripe_session,{expand:["payment_intent.latest_charge"]});
    if(session.livemode!==saasLive() || session.metadata?.studio_credit_order!==order.id || session.mode!=="payment" || session.amount_subtotal!==order.pack_cents || session.currency!=="eur")
      throw new Error("Recharge Stripe incompatible.");
    if(session.status!=="expired" && (session.status!=="complete" || session.payment_status!=="paid")) return;
    const intent=session.payment_intent;
    const intentId=typeof intent==="string"?intent:intent?.id??null;
    const charge=intent && typeof intent!=="string" && intent.latest_charge && typeof intent.latest_charge!=="string" ? intent.latest_charge:null;
    const refunded=charge?.amount_refunded??0;
    const disputes=intentId?await stripe.disputes.list({payment_intent:intentId,limit:20}):{data:[]};
    const disputed=disputes.data.some((item)=>!["won","warning_closed","prevented"].includes(item.status));
    await client.query("SELECT app.studio_credit_apply($1,$2,$3,$4,$5,$6)",[
      order.id,session.id,intentId,session.status==="complete",refunded,disputed,
    ]);
  });
}

export async function reconcileStudioCreditByIntent(intentId:string){
  const orderId=await billingClient(async(client)=>{
    const {rows}=await client.query<{id:string}>("SELECT id FROM studio_credit_orders WHERE stripe_payment_intent=$1",[intentId]);
    return rows[0]?.id??null;
  });
  if(orderId) await reconcileStudioCredit(orderId);
}

export async function studioCreditCheckout(restaurant:string,pack:number){
  if(!studioCreditsReady()) throw new Error("Recharge en ligne non configurée.");
  if(!studioCreditPacks.some((allowed)=>allowed===pack)) throw new Error("Pack de crédits invalide.");
  const stripe=addonStripe();
  const order=await authenticated(restaurant,async(db,user)=>{
    await scope(db,user,restaurant);
    const id=(await one<{id:string}>(db,"SELECT app.studio_credit_open($1,$2,$3) AS id",[restaurant,randomUUID(),pack])).id;
    return one<CreditOrder>(db,"SELECT id,pack_cents,status,stripe_session,stripe_payment_intent FROM studio_credit_orders WHERE id=$1",[id]);
  });
  if(order.stripe_session){
    const existing=await stripe.checkout.sessions.retrieve(order.stripe_session);
    if(existing.status==="open" && existing.url) return {url:existing.url};
    await reconcileStudioCredit(order.id);
    throw new Error("Cette recharge a déjà été traitée. Actualisez votre solde.");
  }
  const origin=new URL(process.env.APP_URL||"http://127.0.0.1:3000").origin;
  const returnUrl=`${origin}/dashboard?restaurant=${encodeURIComponent(restaurant)}&module=addons`;
  const session=await stripe.checkout.sessions.create({
    mode:"payment",line_items:[{quantity:1,price_data:{currency:"eur",unit_amount:pack,tax_behavior:"inclusive",product_data:{name:`${pack} crédits Studio · test`}}}],
    ...(saasAutomaticTax()?{automatic_tax:{enabled:true}}:{}),locale:"fr",success_url:returnUrl,cancel_url:returnUrl,
    metadata:{studio_credit_order:order.id},payment_intent_data:{metadata:{studio_credit_order:order.id}},
    expires_at:Math.floor(Date.now()/1000)+1800,
  },{idempotencyKey:`studio-credit:${order.id}`});
  await authenticated(restaurant,async(db)=>db.query("SELECT app.studio_credit_attach($1,$2)",[order.id,session.id]));
  if(!session.url) throw new Error("Page de paiement indisponible.");
  return {url:session.url};
}
