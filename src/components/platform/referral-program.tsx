"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import {
  ArrowLeft,
  Download,
  Flame,
  Gift,
  Mail,
  MessageCircle,
  MessageSquare,
  Share2,
  Trophy,
} from "lucide-react";
import {
  levels,
  monthlyChallenge,
  referralLevel,
  type PaidPlan,
} from "@/features/platform/referrals";
import { CopyLink, GoalGauge, LevelBadge, goalOf, useReferralLink } from "./referral-panel";
import "./platform.css";
import "./access.css";

type Referral = { name: string; created_at: string; activated_at: string | null; paying: boolean };
type Reward = {
  kind: "referral" | "welcome" | "challenge";
  months: number;
  granted_at: string;
  consumed_at: string | null;
  source: string | null;
};
type Program = {
  organization: { id: string; name: string; plan: PaidPlan; paid_plan: PaidPlan; seats: number };
  referral_code: string | null;
  leaderboard_public: boolean;
  referrals: Referral[];
  paying_referrals: number;
  activated_total: number;
  activated_month: number;
  credits: number;
  rewards: Reward[];
  leaderboard: { rank: number; name: string | null; referrals: number; is_me: boolean }[];
};

const date = (value: string) =>
  new Date(value).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const month = () => new Date().toLocaleDateString("fr-FR", { month: "long" });
const rewardLabel = (reward: Reward) =>
  reward.kind === "welcome"
    ? `Bienvenue : 1er mois offert${reward.source ? ` (invité par ${reward.source})` : ""}`
    : reward.kind === "challenge"
      ? "Défi du mois réussi"
      : `${reward.source ?? "Un filleul"} s’est abonné`;

export function ReferralProgram({ organization }: { organization?: string }) {
  const router = useRouter();
  const [data, setData] = useState<Program>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    let id = organization;
    if (!id) {
      const overview = await fetch("/api/platform");
      if (overview.status === 401) {
        router.push(`/connexion?returnTo=${encodeURIComponent(location.pathname)}`);
        return;
      }
      const body = await overview.json();
      id = body.organizations?.find((o: { referral_code: string | null }) => o.referral_code)?.id;
      if (!id) throw new Error("Le parrainage s’ouvre dès l’activation de votre forfait.");
    }
    const response = await fetch(`/api/platform/referrals?organization=${encodeURIComponent(id)}`);
    if (response.status === 401) {
      router.push(`/connexion?returnTo=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message || "Chargement impossible.");
    setData(body);
  }, [organization, router]);

  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);

  async function setVisibility(visible: boolean) {
    if (!data) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "referralVisibility", organization: data.organization.id, visible }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Opération impossible.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="platform access-home">
      <nav className="access-nav" aria-label="Compte">
        <Link href="/" className="access-brand">STUDIO OS</Link>
        <Link className="referral-back" href="/platform"><ArrowLeft size={14} aria-hidden /> Mon espace</Link>
      </nav>
      <div className="platform-home-content referral-program">
        {error && <p role="alert" className="error">{error}</p>}
        {!data && !error && <p className="platform-loading" role="status">Chargement de votre programme…</p>}
        {data?.referral_code && <ProgramBody data={data} busy={busy} onVisibility={setVisibility} />}
      </div>
    </main>
  );
}

function ProgramBody({
  data,
  busy,
  onVisibility,
}: {
  data: Program;
  busy: boolean;
  onVisibility: (visible: boolean) => void;
}) {
  const link = useReferralLink(data.referral_code!);
  const { organization: org } = data;
  const { goal, label, pricing } = goalOf(org.paid_plan, org.seats, data.paying_referrals);
  const level = referralLevel(data.activated_total);
  const challengeDone = data.activated_month >= monthlyChallenge.target;

  return (
    <>
      <header className="access-hero referral-hero">
        <span className="access-label">Programme parrain · {org.name}</span>
        <h1>
          <LevelBadge activated={data.activated_total} />
          {data.credits > 0 ? `${data.credits} mois offert${data.credits > 1 ? "s" : ""} à utiliser` : "Parrainez, gagnez des mois"}
        </h1>
        <p>{label}</p>
        <p className="referral-hero-price">
          Votre abonnement : <strong>{pricing.total} € HT / mois</strong>
          {pricing.total < pricing.gross && <s>{pricing.gross} €</s>}
        </p>
      </header>

      <div className="referral-grid">
        <section className="referral-card">
          <h2><Gift size={16} aria-hidden /> Prochain palier</h2>
          {goal ? <GoalGauge target={goal.target} value={data.paying_referrals} label={label} /> : <p>Vous avez atteint tous les paliers.</p>}
          <ul className="referral-rules">
            <li><strong>Chaque filleul abonné</strong> : 1 mois offert pour vous.</li>
            <li><strong>Votre filleul</strong> : son 1er mois est offert.</li>
            <li><strong>Abonnement gratuit</strong> : dès 3 filleuls abonnés.</li>
            <li><strong>Au-delà</strong> : 1 établissement offert tous les 3 filleuls.</li>
          </ul>
        </section>

        <section className="referral-card">
          <h2><Flame size={16} aria-hidden /> Défi de {month()}</h2>
          <GoalGauge target={monthlyChallenge.target} value={data.activated_month} label="Défi du mois" />
          <p>
            {challengeDone
              ? "Défi réussi : 1 mois supplémentaire vous est offert. Continuez pour grimper au classement !"
              : `${monthlyChallenge.target} filleuls abonnés ce mois-ci = ${monthlyChallenge.months} mois offert en plus.`}
          </p>
        </section>

        <section className="referral-card">
          <h2><Trophy size={16} aria-hidden /> Niveaux</h2>
          <ol className="referral-levels">
            {levels.map((l) => (
              <li key={l.name} data-reached={data.activated_total >= l.min || undefined}>
                <span>{l.name}</span>
                <span>{l.min} filleul{l.min > 1 ? "s" : ""}</span>
              </li>
            ))}
          </ol>
          {level.next && (
            <p>Encore {level.next.min - data.activated_total} pour le niveau {level.next.name}. Les niveaux sont acquis à vie.</p>
          )}
        </section>

        <section className="referral-card">
          <h2><Trophy size={16} aria-hidden /> Classement de {month()}</h2>
          {data.leaderboard.length ? (
            <ol className="referral-leaderboard">
              {data.leaderboard.map((row, i) => (
                <li key={i} data-me={row.is_me || undefined}>
                  <span>{row.rank}</span>
                  <span>{row.name ?? "Restaurateur anonyme"}{row.is_me ? " (vous)" : ""}</span>
                  <span>{row.referrals}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p>Personne n’a encore de filleul abonné ce mois-ci : la première place est à prendre.</p>
          )}
          <label className="referral-toggle">
            <input
              type="checkbox"
              checked={data.leaderboard_public}
              disabled={busy}
              onChange={(e) => onVisibility(e.currentTarget.checked)}
            />
            Afficher le nom de mon organisation dans le classement
          </label>
        </section>

        <ShareKit link={link} name={org.name} />

        <section className="referral-card">
          <h2>Mes filleuls</h2>
          {data.referrals.length ? (
            <ul className="referral-list">
              {data.referrals.map((f) => (
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
            <p className="referral-empty">Vos filleuls apparaîtront ici dès leur inscription.</p>
          )}
        </section>

        <section className="referral-card">
          <h2>Mes gains</h2>
          {data.rewards.length ? (
            <ul className="referral-list">
              {data.rewards.map((r, i) => (
                <li key={i}>
                  <span>{rewardLabel(r)}</span>
                  <span data-paying={!r.consumed_at || undefined}>
                    {r.months} mois · {r.consumed_at ? `utilisé le ${date(r.consumed_at)}` : `gagné le ${date(r.granted_at)}`}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="referral-empty">Chaque filleul abonné vous rapporte un mois offert.</p>
          )}
        </section>
      </div>
    </>
  );
}

function ShareKit({ link, name }: { link: string; name: string }) {
  const [svg, setSvg] = useState("");
  const message = `Je gère ${name} avec STUDIO OS : salle, commandes, stocks et site au même endroit. Avec mon lien, ton premier mois est offert : ${link}`;
  useEffect(() => {
    if (!link.startsWith("http")) return;
    QRCode.toString(link, { type: "svg", margin: 1, color: { dark: "#18372d", light: "#fffdf8" } })
      .then(setSvg)
      .catch(() => setSvg(""));
  }, [link]);
  const encoded = encodeURIComponent(message);
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <section className="referral-card referral-share">
      <h2><Share2 size={16} aria-hidden /> Kit de partage</h2>
      <CopyLink link={link} />
      <div className="referral-share-row">
        {svg && (
          <figure className="referral-qr">
            <div dangerouslySetInnerHTML={{ __html: svg }} role="img" aria-label="QR code de votre lien de parrainage" />
            <a download="atacuisine-parrainage.svg" href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}>
              <Download size={14} aria-hidden /> Télécharger
            </a>
          </figure>
        )}
        <div className="referral-share-buttons">
          <a href={`https://wa.me/?text=${encoded}`} target="_blank" rel="noopener noreferrer">
            <MessageCircle size={15} aria-hidden /> WhatsApp
          </a>
          <a href={`mailto:?subject=${encodeURIComponent("Ton premier mois STUDIO OS offert")}&body=${encoded}`}>
            <Mail size={15} aria-hidden /> E-mail
          </a>
          <a href={`sms:?&body=${encoded}`}>
            <MessageSquare size={15} aria-hidden /> SMS
          </a>
          {canShare && (
            <button type="button" onClick={() => navigator.share({ title: "STUDIO OS", text: message, url: link }).catch(() => undefined)}>
              <Share2 size={15} aria-hidden /> Partager
            </button>
          )}
        </div>
      </div>
      <p className="referral-message">{message}</p>
    </section>
  );
}
