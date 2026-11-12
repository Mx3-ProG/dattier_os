"use client";
import { useEffect, useState } from "react";
import { Check, Copy, Gift, Lock, PiggyBank, Ticket } from "lucide-react";
import { money } from "@/domain/shared/units";
import { levels } from "@/features/commerce/engagement-rules";
import { useTenantSite } from "../context";
import { CustomerQrSheet, QrPill } from "./qr-sheet";
import {
  badgeIcons,
  SectionTitle,
  Sheet,
  shortDate,
  type Account,
} from "./shared";

function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="ca-code"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        } catch {
          /* The code stays visible and selectable. */
        }
      }}
      aria-label={`Copier le code ${code}`}
    >
      <span>{code}</span>
      {copied ? <Check size={16} /> : <Copy size={16} />}
    </button>
  );
}

/** Wallet-style rewards: exchange points, or keep them for a bigger gift. */
export function RewardsWallet({
  account,
  onChanged,
}: {
  account: Account;
  onChanged: () => void;
}) {
  const { shopPost } = useTenantSite();
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [claimed, setClaimed] = useState<{ name: string; code: string } | null>(
      null,
    ),
    [confirm, setConfirm] = useState<Account["rewards"][number] | null>(null),
    [qrCode, setQrCode] = useState("");
  const { points, loyaltyConsent } = account.customer;
  const sorted = [...account.rewards].sort(
    (a, b) => a.points_cost - b.points_cost,
  );
  const reachable = sorted.filter((r) => r.points_cost <= points);
  const nextBig = sorted.find((r) => r.points_cost > points);
  async function claim(reward: Account["rewards"][number]) {
    setBusy(reward.id);
    setError("");
    try {
      const result = await shopPost("reward", {
        reward: reward.id,
        key: crypto.randomUUID(),
      });
      setClaimed({ name: reward.name, code: result.code });
      setConfirm(null);
      onChanged();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="ca-card" id="recompenses">
      <SectionTitle kicker="Mes cadeaux" title="Échanger mes points" />
      {reachable.length > 0 && nextBig && (
        <p className="ca-nudge">
          <PiggyBank size={18} />
          <span>
            Dépensez maintenant, ou gardez vos points : encore{" "}
            <b>{nextBig.points_cost - points} pts</b> et vous débloquez «{" "}
            {nextBig.name} ».
          </span>
        </p>
      )}
      {sorted.length ? (
        <div className="ca-wallet">
          {sorted.map((reward) => {
            const ok = loyaltyConsent && points >= reward.points_cost;
            const auto = reward.kind === "fixed" && reward.value > 0;
            return (
              <article
                key={reward.id}
                className={`ca-pass ${ok ? "is-ready" : ""}`}
              >
                <div className="ca-pass-top">
                  <Gift size={20} />
                  <span>{reward.points_cost} pts</span>
                </div>
                <h3>{reward.name}</h3>
                {auto && <small>{money(reward.value)} de remise</small>}
                <progress
                  max={reward.points_cost}
                  value={Math.min(points, reward.points_cost)}
                />
                {ok ? (
                  auto ? (
                    <button
                      className="ca-button ca-button-small"
                      disabled={!!busy}
                      onClick={() => setConfirm(reward)}
                    >
                      Échanger
                    </button>
                  ) : (
                    <small className="ca-muted">
                      Disponible : demandez-le au comptoir.
                    </small>
                  )
                ) : (
                  <small className="ca-muted">
                    <Lock size={13} />{" "}
                    {loyaltyConsent
                      ? `Encore ${reward.points_cost - points} pts`
                      : "Activez la fidélité"}
                  </small>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="ca-muted">
          Les récompenses apparaîtront ici dès leur publication par
          l’établissement.
        </p>
      )}
      {error && (
        <p className="ca-error" role="alert">
          {error}
        </p>
      )}
      {account.engagement.gifts.length > 0 && (
        <div className="ca-gifts">
          <h3>
            <Ticket size={18} /> Mes codes à utiliser
          </h3>
          <ul>
            {account.engagement.gifts.map((g) => (
              <li key={g.code}>
                <span>
                  <b>
                    {g.kind === "percent" ? `${g.value} %` : money(g.value)}{" "}
                    offerts
                  </b>
                  <small>Valable jusqu’au {shortDate(g.expires_on)}</small>
                </span>
                <span className="ca-gift-tools">
                  <CopyCode code={g.code} />
                  <QrPill label={`QR du code ${g.code}`} onClick={() => setQrCode(g.code)} />
                </span>
              </li>
            ))}
          </ul>
          <p className="ca-muted">
            Saisissez le code dans votre panier au moment de commander.
          </p>
        </div>
      )}
      {qrCode && (
        <CustomerQrSheet
          kind="promo"
          refId={qrCode}
          title={qrCode}
          description="Montrez ce QR code au comptoir, ou saisissez le code dans votre panier."
          close={() => setQrCode("")}
        />
      )}
      {confirm && (
        <Sheet
          title={`Échanger ${confirm.points_cost} points ?`}
          description={`Vous recevez un code « ${confirm.name} » valable 30 jours. Il vous restera ${points - confirm.points_cost} points.`}
          close={() => setConfirm(null)}
        >
          <div className="ca-modal-actions">
            <button
              className="ca-button"
              disabled={!!busy}
              onClick={() => void claim(confirm)}
            >
              {busy ? "Échange…" : "Oui, je me fais plaisir"}
            </button>
            <button
              className="ca-button ca-button-soft"
              onClick={() => setConfirm(null)}
            >
              Je garde mes points
            </button>
          </div>
        </Sheet>
      )}
      {claimed && (
        <Sheet
          title="Votre cadeau est prêt 🎉"
          description={`${claimed.name} : utilisez ce code dans votre panier.`}
          close={() => setClaimed(null)}
        >
          <div className="ca-claimed">
            <CopyCode code={claimed.code} />
            <p className="ca-muted">Valable 30 jours, une seule utilisation.</p>
          </div>
        </Sheet>
      )}
    </section>
  );
}

const seenKey = "ca-badges-seen";

export function BadgesGrid({ account }: { account: Account }) {
  const badges = account.engagement.badges;
  const [fresh, setFresh] = useState<string[]>([]);
  useEffect(() => {
    const earned = badges.filter((b) => b.earned_at).map((b) => b.key);
    try {
      const seen: string[] = JSON.parse(localStorage.getItem(seenKey) || "[]");
      setFresh(earned.filter((key) => !seen.includes(key)));
      localStorage.setItem(seenKey, JSON.stringify(earned));
    } catch {
      /* Storage may be unavailable: no celebration then. */
    }
  }, [badges]);
  const earned = badges.filter((b) => b.earned_at).length;
  return (
    <section className="ca-card">
      <SectionTitle
        kicker="Succès"
        title="Mes badges"
        action={
          <span className="ca-chip">
            {earned}/{badges.length}
          </span>
        }
      />
      <ul className="ca-badges">
        {badges.map((b) => {
          const Icon = badgeIcons[b.icon] ?? Gift;
          return (
            <li
              key={b.key}
              className={`${b.earned_at ? "is-earned" : ""} ${fresh.includes(b.key) ? "is-new" : ""}`}
              title={b.hint}
            >
              <span className="ca-badge-icon">
                <Icon size={22} />
              </span>
              <b>{b.name}</b>
              <small>
                {b.earned_at ? `Obtenu le ${shortDate(b.earned_at)}` : b.hint}
              </small>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function LevelsLadder({ account }: { account: Account }) {
  const level = account.engagement.level;
  return (
    <section className="ca-card">
      <SectionTitle kicker="Statut" title="Mes niveaux" />
      <ol className="ca-ladder">
        {levels.map((l, n) => (
          <li
            key={l.key}
            className={n < level.rank ? "is-done" : n === level.rank ? "is-current" : ""}
          >
            <span className={`ca-level ca-level-${l.key}`}>{l.name}</span>
            <small>{l.min} pts cumulés</small>
          </li>
        ))}
      </ol>
      <p className="ca-muted">
        Le niveau dépend des points gagnés depuis votre inscription : échanger
        des cadeaux ne vous fait jamais redescendre.
      </p>
    </section>
  );
}

export function PointsHistory({ account }: { account: Account }) {
  const history = account.engagement.pointsHistory;
  return (
    <section className="ca-card">
      <SectionTitle kicker="Mouvements" title="Historique de mes points" />
      {history.length ? (
        <ul className="ca-list">
          {history.map((h, n) => (
            <li key={n}>
              <span>
                <b>{h.reason}</b>
                <small>{shortDate(h.created_at)}</small>
              </span>
              <b className={h.points > 0 ? "ca-plus" : "ca-minus"}>
                {h.points > 0 ? "+" : ""}
                {h.points}
              </b>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ca-muted">
          Vos points gagnés et échangés s’afficheront ici.
        </p>
      )}
    </section>
  );
}
