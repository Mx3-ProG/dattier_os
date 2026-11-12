import Link from "next/link";
import { notFound } from "next/navigation";
import { Gift, Store } from "lucide-react";
import { cookies } from "next/headers";
import { plans, referralCookie } from "@/features/platform/pricing";
import { activePromotion, trialDays } from "@/features/platform/promotion";
import { actor } from "@/lib/auth/session";
import { demoEnabled, getDb } from "@/lib/database/db";
import { SubscriptionForm } from "@/components/platform/subscription-form";
import { planBillingReady } from "@/features/platform/plan-billing";
import "@/components/platform/access.css";

/** Name of the referrer behind the visitor's referral link, if still valid. */
async function referrerName() {
  const code = (await cookies()).get(referralCookie)?.value;
  if (!code || !/^[A-F0-9]{10}$/.test(code)) return null;
  try {
    const db = await getDb();
    return await db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE atacuisine_app");
      const { rows } = await tx.query<{ name: string | null }>(
        "SELECT app.referral_invitation($1) AS name",
        [code],
      );
      return rows[0]?.name ?? null;
    });
  } catch {
    return null;
  }
}

export default async function Page({ params }: { params: Promise<{ plan: string }> }) {
  const { plan } = await params;
  const offer = plans.find(({ price }) => String(price) === plan);
  if (!offer) notFound();
  const [user, referrer] = await Promise.all([
    actor().catch(() => null),
    referrerName(),
  ]);
  const promo = activePromotion();
  const days = trialDays();
  // Pendant l'offre, le paiement Stripe s'ouvre dès la création de l'espace.
  const payNow = Boolean(promo && planBillingReady());
  const login = `/connexion?returnTo=${encodeURIComponent(`/checkout/${offer.price}`)}`;
  return (
    <main className="access-shell">
      <nav className="access-nav" aria-label="Souscription">
        <Link href="/" className="access-brand"><Store size={22} /> STUDIO OS</Link>
        <Link href="/#offres">Changer d’offre</Link>
        {user && <form action="/auth/logout" method="post"><button>Se déconnecter</button></form>}
      </nav>
      <div className="access-split">
        <aside className="access-hero">
          <span className="access-label">Votre abonnement</span>
          <h1>{offer.title}</h1>
          {promo ? (
            <>
              <p className="access-price">
                <s>{offer.price} €</s> <strong>{promo.price} €</strong> TTC / mois pendant {promo.months} mois
              </p>
              <p className="access-referral" role="status">
                <Gift size={18} aria-hidden />
                <span>
                  Black Friday : code <strong>{promo.code}</strong> déjà appliqué au paiement. Offre valable
                  jusqu’au {promo.lastDay} minuit, puis {offer.price} € TTC / mois. Sans engagement, résiliable à tout moment.
                </span>
              </p>
            </>
          ) : (
            <>
              <p className="access-price"><strong>{offer.price} €</strong> TTC / mois</p>
              <p>{days} jours d’essai gratuits dès la création de votre espace. Aucun paiement initial. Sans engagement.</p>
            </>
          )}
          <p>{offer.description}</p>
          <p>Premier établissement inclus.</p>
          {referrer && (
            <p className="access-referral" role="status">
              <Gift size={18} aria-hidden />
              <span>Invité par <strong>{referrer}</strong> : votre premier mois est offert.</span>
            </p>
          )}
        </aside>
        <section className="access-panel">
          {user ? (
            <>
              <span className="access-label">Connecté en tant que {user.name}</span>
              <h2>Créer votre espace professionnel</h2>
              {payNow && promo ? (
                <p>Créez votre espace en quelques questions, puis réglez <strong>{promo.price} €</strong> sur la page de paiement sécurisée Stripe : le code {promo.code} y est déjà appliqué. Vous bloquez ainsi le tarif de {promo.price} € TTC / mois pendant {promo.months} mois, sans engagement.</p>
              ) : (
                <p>Votre essai démarre à la création de l’espace et dure {days} jours, sans carte bancaire. Vous pourrez ensuite vous abonner en ligne depuis votre espace (39 € TTC par mois, paiement sécurisé par Stripe, sans engagement). Aucun prélèvement sans votre accord.</p>
              )}
              <SubscriptionForm plan={offer.price} userName={user.name} userEmail={user.email} payNow={payNow ? promo : null} />
            </>
          ) : (
            <>
              <span className="access-label">Votre compte</span>
              <h2>{promo ? `Profiter de ${promo.price} € / mois` : `Commencer vos ${days} jours gratuits`}</h2>
              <p>Votre offre sera conservée pendant la connexion.</p>
              <Link className="access-primary" href={demoEnabled() ? login : `${login}&mode=register`}>
                {demoEnabled() ? "Choisir un profil de démonstration" : "Créer un compte"}
              </Link>
              {!demoEnabled() && <p>Déjà client ? <Link href={login}>Se connecter</Link></p>}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
