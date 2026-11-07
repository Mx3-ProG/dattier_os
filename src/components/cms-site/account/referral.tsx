"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Mail,
  MessageCircle,
  QrCode,
  Share2,
  Smartphone,
  Trophy,
  UserPlus,
} from "lucide-react";
import { useTenantSite } from "../context";
import { shortDate, type Account } from "./shared";

export function ReferralCard({
  account,
  onChanged,
}: {
  account: Account;
  onChanged: () => void;
}) {
  const { shopPost, href } = useTenantSite();
  const r = account.engagement.referral;
  const s = account.engagement.settings;
  const [code, setCode] = useState(r.code),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false),
    [qr, setQr] = useState(""),
    [showQr, setShowQr] = useState(false);
  const link = useMemo(() => {
    if (!code || typeof window === "undefined") return "";
    const path = href(`/compte?parrain=${code}`);
    return path.startsWith("http") ? path : window.location.origin + path;
  }, [code, href]);
  useEffect(() => {
    if (!link || !showQr) return;
    let cancelled = false;
    void import("qrcode").then((QRCode) =>
      QRCode.toString(link, { type: "svg", margin: 1 })
        .then((svg) => !cancelled && setQr(svg))
        .catch(() => setQr("")),
    );
    return () => {
      cancelled = true;
    };
  }, [link, showQr]);
  const message = `Je t’offre ${s.welcome || "un cadeau de bienvenue"} pour ta première commande, avec mon lien :`;
  async function create() {
    setBusy(true);
    setError("");
    try {
      if (!account.customer.loyaltyConsent)
        await shopPost("loyalty-join", {});
      const result = await shopPost("referral-code", {});
      setCode(result.code);
      onChanged();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Mon cadeau pour toi", text: message, url: link });
        return;
      } catch {
        /* Cancelled: fall through to copy. */
      }
    }
    await copy();
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Copie indisponible : sélectionnez le lien pour le copier.");
    }
  }
  const milestones = s.milestones;
  const max = milestones.at(-1)?.count ?? 1;
  return (
    <section className="ca-card ca-referral" id="parrainage">
      <div className="ca-referral-hero">
        <span className="ca-referral-icon" aria-hidden="true">
          <UserPlus />
        </span>
        <div>
          <p className="ca-kicker">Parrainage</p>
          <h2>Invitez vos amis, gagnez des cadeaux</h2>
          <p className="ca-muted">
            {s.welcome ? `Votre ami reçoit ${s.welcome} sur sa première commande` : "Votre ami découvre la maison"}
            {s.referrer_points > 0 &&
              `, et vous gagnez ${s.referrer_points} points dès qu’il a commandé.`}
          </p>
        </div>
      </div>
      {code ? (
        <>
          <div className="ca-link-box">
            <input readOnly value={link} aria-label="Mon lien de parrainage" onFocus={(e) => e.currentTarget.select()} />
            <button className="ca-icon-button" onClick={() => void copy()} aria-label="Copier le lien">
              {copied ? <Check size={18} /> : <Copy size={18} />}
            </button>
          </div>
          <div className="ca-share">
            <button className="ca-button" onClick={() => void share()}>
              <Share2 size={18} /> Partager mon lien
            </button>
            <a className="ca-share-pill" href={`https://wa.me/?text=${encodeURIComponent(`${message} ${link}`)}`} target="_blank" rel="noreferrer">
              <MessageCircle size={16} /> WhatsApp
            </a>
            <a className="ca-share-pill" href={`sms:?&body=${encodeURIComponent(`${message} ${link}`)}`}>
              <Smartphone size={16} /> SMS
            </a>
            <a className="ca-share-pill" href={`mailto:?subject=${encodeURIComponent("Un cadeau pour toi")}&body=${encodeURIComponent(`${message}\n${link}`)}`}>
              <Mail size={16} /> E-mail
            </a>
            <button className="ca-share-pill" onClick={() => setShowQr((v) => !v)} aria-expanded={showQr}>
              <QrCode size={16} /> QR code
            </button>
          </div>
          {showQr && qr && (
            <div className="ca-qr" dangerouslySetInnerHTML={{ __html: qr }} aria-label="QR code de mon lien" role="img" />
          )}
        </>
      ) : (
        <button className="ca-button" onClick={() => void create()} disabled={busy}>
          {busy ? "Création…" : account.customer.loyaltyConsent ? "Créer mon lien de parrainage" : "Activer la fidélité et créer mon lien"}
        </button>
      )}
      {error && <p className="ca-error" role="alert">{error}</p>}
      {milestones.length > 0 && (
        <div className="ca-milestones">
          <div className="ca-milestones-head">
            <b><Trophy size={16} /> Paliers</b>
            <span>{r.rewarded} ami{r.rewarded > 1 ? "s" : ""} parrainé{r.rewarded > 1 ? "s" : ""}</span>
          </div>
          <div className="ca-track" style={{ ["--p" as string]: Math.min(1, r.rewarded / max) }}>
            {milestones.map((m) => (
              <div
                key={m.count}
                className={`ca-step ${r.rewarded >= m.count ? "is-done" : ""}`}
                style={{ left: `${(m.count / max) * 100}%` }}
              >
                <span>{m.count}</span>
              </div>
            ))}
          </div>
          <ul className="ca-milestone-list">
            {milestones.map((m) => (
              <li key={m.count} className={r.rewarded >= m.count ? "is-done" : ""}>
                <b>{m.count} amis</b>
                <span>{m.label}</span>
                <small>+{m.points} pts</small>
              </li>
            ))}
          </ul>
          {r.next && (
            <p className="ca-muted">
              Encore {r.next.count - r.rewarded} ami{r.next.count - r.rewarded > 1 ? "s" : ""} pour « {r.next.label} ».
            </p>
          )}
        </div>
      )}
      <div className="ca-friends">
        <h3>Mes filleuls</h3>
        {r.friends.length ? (
          <ul className="ca-list">
            {r.friends.map((f, n) => (
              <li key={n}>
                <span>
                  <b>{f.name}</b>
                  <small>Inscrit le {shortDate(f.joined_at)}</small>
                </span>
                <span className={`ca-status ${f.ordered ? "is-done" : ""}`}>
                  {f.ordered ? "A commandé ✓" : "Inscrit"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ca-muted">Vos amis apparaîtront ici dès leur inscription avec votre lien.</p>
        )}
      </div>
    </section>
  );
}
