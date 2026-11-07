"use client";
import { useEffect, useState } from "react";
import { QrCode } from "lucide-react";
import { QrImage } from "../../qr/qr";
import { useTenantSite } from "../context";
import { Sheet } from "./shared";

type Kind = "customer" | "referral" | "reservation" | "promo" | "order";

/** Traced QR of a customer-side object (member card, booking, gift, order). */
export function useCustomerQr(kind: Kind, ref = "", orderToken = "") {
  const { request } = useTenantSite();
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    if (kind === "order" && !orderToken) return;
    let alive = true;
    void (async () => {
      try {
        const response = await request(
          `/api/shop/qr?kind=${kind}&ref=${encodeURIComponent(ref)}`,
          orderToken ? { headers: { "x-order-token": orderToken } } : undefined,
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (alive) setUrl(`${window.location.origin}/q/${data.token}`);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [kind, ref, orderToken, request]);
  return { url, error };
}

export function CustomerQrSheet({
  kind,
  refId,
  title,
  description,
  close,
}: {
  kind: Kind;
  refId?: string;
  title: string;
  description: string;
  close: () => void;
}) {
  const { url, error } = useCustomerQr(kind, refId);
  return (
    <Sheet title={title} description={description} close={close}>
      <div className="ca-qr-sheet">
        {url ? (
          <QrImage value={url} size={240} label={title} className="ca-qr-big" />
        ) : (
          <div className="ca-qr-placeholder">{error || "Génération…"}</div>
        )}
        <p className="ca-muted">Augmentez la luminosité de l’écran pour un scan rapide.</p>
      </div>
    </Sheet>
  );
}

/** Small round button that opens a QR sheet. */
export function QrPill({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="ca-qr-pill" onClick={onClick} aria-label={label} title={label}>
      <QrCode size={16} />
    </button>
  );
}

/** Pickup QR on the order tracking page: the team opens the order in one scan. */
export function OrderQrCard({ storageKey }: { storageKey: string }) {
  const [token] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      return location.hash.slice(1) || sessionStorage.getItem(storageKey) || "";
    } catch {
      return location.hash.slice(1);
    }
  });
  const { url } = useCustomerQr("order", "", token);
  if (!token || !url) return null;
  return (
    <div className="donut-order-qr">
      <QrImage value={url} size={132} label="QR de retrait de la commande" />
      <span>
        <b>Votre QR de retrait</b>
        <small>
          Présentez-le au comptoir : l’équipe retrouve votre commande en un
          scan. Gardez cette page ou faites une capture d’écran.
        </small>
      </span>
    </div>
  );
}
