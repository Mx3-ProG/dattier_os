"use client";
/**
 * Suivre (ou arrêter de suivre) un contenu : un article, une formation, une
 * prestation. L'action est portée par l'API boutique ; un visiteur non connecté
 * reçoit l'invitation à se connecter plutôt qu'une erreur.
 */
import { useState } from "react";
import { Bookmark, BookmarkCheck, LoaderCircle } from "lucide-react";
import { useTenantSite, TenantLink as Link } from "../context";

export type FollowKind = "article" | "course" | "service";

export function FollowButton({
  kind,
  refId,
  label,
  progress,
  className = "",
  children,
}: {
  kind: FollowKind;
  refId: string;
  label: string;
  progress?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  const { shopPost } = useTenantSite();
  const [busy, setBusy] = useState(false);
  const [following, setFollowing] = useState<boolean | null>(null);
  const [error, setError] = useState("");

  const toggle = async () => {
    setBusy(true);
    setError("");
    try {
      if (following) {
        await shopPost("unfollow", { kind, ref_id: refId });
        setFollowing(false);
      } else {
        await shopPost("follow", { kind, ref_id: refId, label, progress });
        setFollowing(true);
      }
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (error)
    return (
      <span className="ca-follow ca-follow-error">
        {error} <Link href="/compte">Se connecter</Link>
      </span>
    );

  return (
    <button
      type="button"
      className={`ca-follow ${following ? "is-following" : ""} ${className}`}
      onClick={() => void toggle()}
      disabled={busy}
      aria-pressed={following === true}
    >
      {busy ? (
        <LoaderCircle size={15} className="ca-follow-spin" />
      ) : following ? (
        <BookmarkCheck size={15} />
      ) : (
        <Bookmark size={15} />
      )}
      {children ??
        (following ? "Suivi" : kind === "article" ? "Suivre" : "Commencer")}
    </button>
  );
}
