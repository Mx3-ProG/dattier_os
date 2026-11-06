"use client";
import { useEffect, useState } from "react";
import { Check, Copy, Gift } from "lucide-react";
import { referralGoal } from "@/features/platform/pricing";

export type Referral = {
  name: string;
  created_at: string;
  activated_at: string | null;
  paying: boolean;
};

const date = (value: string) =>
  new Date(value).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

export function ReferralPanel({ code, referrals }: { code: string; referrals: Referral[] }) {
  const [link, setLink] = useState(`/parrainage/${code}`);
  const [copied, setCopied] = useState(false);
  useEffect(() => setLink(`${location.origin}/parrainage/${code}`), [code]);
  const paying = referrals.filter((f) => f.paying).length;
  const free = paying >= referralGoal;
  const remaining = Math.max(referralGoal - paying, 0);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="referral-panel" aria-labelledby={`parrainage-${code}`}>
      <header>
        <Gift size={18} aria-hidden />
        <div>
          <h2 id={`parrainage-${code}`}>Parrainage</h2>
          <p>
            {free
              ? "Votre forfait est offert tant que vos filleuls restent abonnés."
              : `Encore ${remaining} filleul${remaining > 1 ? "s" : ""} abonné${remaining > 1 ? "s" : ""} et votre forfait devient gratuit.`}
          </p>
        </div>
      </header>
      <div className="referral-progress" role="progressbar" aria-valuemin={0} aria-valuemax={referralGoal} aria-valuenow={Math.min(paying, referralGoal)} aria-label="Filleuls abonnés">
        {Array.from({ length: referralGoal }, (_, i) => (
          <span key={i} data-filled={i < paying || undefined} />
        ))}
        <strong>{Math.min(paying, referralGoal)}/{referralGoal}</strong>
      </div>
      <div className="referral-link">
        <input readOnly value={link} aria-label="Votre lien de parrainage" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" onClick={copy}>
          {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
          {copied ? "Copié" : "Copier"}
        </button>
      </div>
      {referrals.length > 0 ? (
        <ul className="referral-list">
          {referrals.map((f) => (
            <li key={`${f.name}-${f.created_at}`}>
              <span>{f.name}</span>
              <span data-paying={f.paying || undefined}>
                {f.paying
                  ? `Abonné depuis le ${date(f.activated_at ?? f.created_at)}`
                  : f.activated_at
                    ? "Abonnement interrompu"
                    : "En attente d’abonnement"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="referral-empty">Partagez votre lien : chaque restaurateur qui s’abonne grâce à lui apparaîtra ici.</p>
      )}
    </section>
  );
}
