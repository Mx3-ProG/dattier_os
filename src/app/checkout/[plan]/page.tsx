import Link from "next/link";
import { notFound } from "next/navigation";
import { Gift, UtensilsCrossed } from "lucide-react";
import { cookies } from "next/headers";
import { plans, referralCookie } from "@/features/platform/pricing";
import { actor } from "@/lib/auth/session";
import { demoEnabled, getDb } from "@/lib/database/db";
import { SubscriptionForm } from "@/components/platform/subscription-form";
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
  const login = `/connexion?returnTo=${encodeURIComponent(`/checkout/${offer.price}`)}`;
  return (
    <main className="access-shell">
      <nav className="access-nav" aria-label="Souscription">
        <Link href="/" className="access-brand"><UtensilsCrossed size={22} /> atacuisine</Link>
        <Link href="/#offres">Changer d’offre</Link>
        {user && <form action="/auth/logout" method="post"><button>Se déconnecter</button></form>}
      </nav>
      <div className="access-split">
        <aside className="access-hero">
          <span className="access-label">Votre abonnement</span>
          <h1>{offer.title}</h1>
          <p className="access-price"><strong>{offer.price} €</strong> HT / mois</p>
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
              <h2>Préparer votre établissement</h2>
              <p>Après l’envoi de votre demande, la facturation et l’activation sont traitées manuellement.</p>
              <SubscriptionForm plan={offer.price} />
            </>
          ) : (
            <>
              <span className="access-label">Votre compte</span>
              <h2>Continuer la souscription</h2>
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
