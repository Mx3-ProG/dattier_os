"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Copy, Crown, Gift, Medal, Trophy } from "lucide-react";
import {
  referralLevel,
  referralPricing,
  type PaidPlan,
} from "@/features/platform/referrals";

/** Absolute referral link, computed after mount so server and client markup match. */
export function useReferralLink(code: string) {
  const [link, setLink] = useState(`/parrainage/${code}`);
  useEffect(() => setLink(`${location.origin}/parrainage/${code}`), [code]);
  return link;
}

export function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
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
    <div className="referral-link">
      <input readOnly value={link} aria-label="Votre lien de parrainage" onFocus={(e) => e.currentTarget.select()} />
      <button type="button" onClick={copy}>
        {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
        {copied ? "Copié" : "Copier"}
      </button>
    </div>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

/** Sentence and gauge towards the next referral milestone. */
export function goalOf(plan: PaidPlan, seats: number, paying: number) {
  const pricing = referralPricing(plan, seats, paying);
  const goal = pricing.nextGoal;
  if (!goal)
    return { pricing, goal, label: "Tout est débloqué : votre abonnement et vos établissements sont offerts." };
  const left = goal.target - paying;
  const label =
    goal.kind === "free"
      ? `Encore ${left} ${left > 1 ? "filleuls abonnés" : "filleul abonné"} et votre abonnement de ${goal.plan} € devient gratuit.`
      : `Abonnement offert. Encore ${plural(left, "filleul")} et un établissement supplémentaire est offert.`;
  return { pricing, goal, label };
}

export function GoalGauge({ target, value, label }: { target: number; value: number; label: string }) {
  return (
    <div className="referral-progress" role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(value, target)} aria-label={label}>
      {Array.from({ length: target }, (_, i) => (
        <span key={i} data-filled={i < value || undefined} />
      ))}
      <strong>{Math.min(value, target)}/{target}</strong>
    </div>
  );
}

const levelIcons = { Bronze: Medal, Argent: Medal, Or: Trophy, Platine: Trophy, Légende: Crown } as const;

export function LevelBadge({ activated }: { activated: number }) {
  const { current } = referralLevel(activated);
  const Icon = current ? levelIcons[current.name] : Gift;
  return (
    <span className="referral-badge" data-level={current?.name ?? "none"}>
      <Icon size={14} aria-hidden /> {current ? current.name : "Nouveau parrain"}
    </span>
  );
}

export function ReferralPanel({
  organization,
  code,
  plan,
  seats,
  paying,
  activated,
  credits,
}: {
  organization: string;
  code: string;
  plan: PaidPlan;
  seats: number;
  paying: number;
  activated: number;
  credits: number;
}) {
  const link = useReferralLink(code);
  const { goal, label } = goalOf(plan, seats, paying);
  return (
    <section className="referral-panel" aria-labelledby={`parrainage-${code}`}>
      <header>
        <Gift size={18} aria-hidden />
        <div>
          <h2 id={`parrainage-${code}`}>
            Parrainage <LevelBadge activated={activated} />
          </h2>
          <p>{label}</p>
        </div>
        {credits > 0 && (
          <span className="referral-credits">{plural(credits, "mois offert")}</span>
        )}
      </header>
      {goal && <GoalGauge target={goal.target} value={paying} label={label} />}
      <CopyLink link={link} />
      <Link className="referral-more" href={`/platform/parrainage?organisation=${encodeURIComponent(organization)}`}>
        Voir mon programme : défis, classement, QR code <ArrowUpRight size={14} aria-hidden />
      </Link>
    </section>
  );
}
