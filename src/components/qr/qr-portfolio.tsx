"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Printer, QrCode, RefreshCw, ScanLine, Search, Trash2 } from "lucide-react";
import type { PortfolioCode, QrGroup } from "@/features/qr/service";
import { Button } from "../ui/button";
import { Form, Modal } from "../forms";
import { printQrSheet, QrActions, QrImage, qrUrl } from "./qr";

type Portfolio = {
  restaurant: string;
  groups: { id: QrGroup; label: string }[];
  codes: PortfolioCode[];
};

const relative = (iso: string | null) => {
  if (!iso) return "Jamais scanné";
  const minutes = Math.round((Date.parse(iso) - Date.now()) / 60000);
  const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  if (Math.abs(minutes) < 60) return `Scanné ${rtf.format(minutes, "minute")}`;
  if (Math.abs(minutes) < 1440) return `Scanné ${rtf.format(Math.round(minutes / 60), "hour")}`;
  return `Scanné ${rtf.format(Math.round(minutes / 1440), "day")}`;
};

const suggestions = [
  { label: "Page d’accueil", target: "/" },
  { label: "La carte", target: "/carte" },
  { label: "Commander", target: "/commander" },
  { label: "Réservations", target: "/reservations" },
  { label: "Avis clients", target: "/avis" },
  { label: "Nous trouver", target: "/contact" },
];

/**
 * Every QR code of the establishment: generated automatically from its data
 * (tables, dishes, promos, suppliers…), traced on each scan.
 */
export function QrPortfolio({
  restaurant,
  only,
  compact = false,
}: {
  restaurant: string;
  only?: QrGroup[];
  compact?: boolean;
}) {
  const [data, setData] = useState<Portfolio | null>(null),
    [error, setError] = useState(""),
    [group, setGroup] = useState<QrGroup | "all">("all"),
    [query, setQuery] = useState(""),
    [creating, setCreating] = useState(false),
    [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/restaurants/${encodeURIComponent(restaurant)}/qr`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setData(d);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [restaurant]);
  useEffect(() => {
    void load();
  }, [load]);
  async function post(body: unknown) {
    const r = await fetch(`/api/restaurants/${encodeURIComponent(restaurant)}/qr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    await load();
    return d;
  }
  const scoped = useMemo(
    () =>
      (data?.codes ?? [])
        .filter((c) => !only || only.includes(c.group))
        // Natural order: Table 2 before Table 10.
        .sort(
          (a, b) =>
            a.group.localeCompare(b.group) ||
            a.kind.localeCompare(b.kind) ||
            a.label.localeCompare(b.label, "fr", { numeric: true }),
        ),
    [data, only],
  );
  const visible = scoped.filter(
    (c) =>
      (group === "all" || c.group === group) &&
      `${c.label} ${c.kind_name}`.toLowerCase().includes(query.toLowerCase()),
  );
  const groups = (data?.groups ?? []).filter((g) => scoped.some((c) => c.group === g.id) || (!only && g.id === "perso"));
  const scans7 = scoped.reduce((n, c) => n + c.scans_7d, 0);
  const top = [...scoped].sort((a, b) => b.scans_7d - a.scans_7d)[0];
  const printVisible = () =>
    void printQrSheet(
      `${data?.restaurant ?? ""} · ${group === "all" ? "QR codes" : groups.find((g) => g.id === group)?.label}`,
      visible.map((c) => ({ value: qrUrl(c.token), label: c.label, caption: c.kind_name })),
    );

  if (loading && !data) return <p className="muted">Génération des QR codes…</p>;
  return (
    <div className={`qr-portfolio ${compact ? "compact" : ""}`}>
      {!compact && (
        <div className="qr-stats">
          <article className="card">
            <span className="eyebrow">QR codes actifs</span>
            <strong>{scoped.length}</strong>
            <small>Générés automatiquement, toujours à jour</small>
          </article>
          <article className="card">
            <span className="eyebrow">Scans sur 7 jours</span>
            <strong>{scans7}</strong>
            <small>Chaque scan est tracé (client ou équipe)</small>
          </article>
          <article className="card">
            <span className="eyebrow">Le plus scanné</span>
            <strong className="qr-top">{top && top.scans_7d ? top.label : "—"}</strong>
            <small>{top && top.scans_7d ? `${top.scans_7d} scans cette semaine` : "Aucun scan cette semaine"}</small>
          </article>
        </div>
      )}
      <div className="qr-toolbar">
        <label className="qr-search">
          <Search size={16} />
          <input
            placeholder="Table, plat, fournisseur…"
            aria-label="Rechercher un QR code"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="actions">
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={16} /> Actualiser
          </Button>
          <Button variant="secondary" onClick={printVisible} disabled={!visible.length}>
            <Printer size={16} /> Imprimer ({visible.length})
          </Button>
          {!compact && (
            <Button onClick={() => setCreating(true)}>
              <Plus size={16} /> Générer un QR code
            </Button>
          )}
        </div>
      </div>
      {groups.length > 1 && (
        <div className="tabs qr-groups" role="tablist">
          <button role="tab" aria-selected={group === "all"} className={group === "all" ? "active" : ""} onClick={() => setGroup("all")}>
            Tous ({scoped.length})
          </button>
          {groups.map((g) => (
            <button
              key={g.id}
              role="tab"
              aria-selected={group === g.id}
              className={group === g.id ? "active" : ""}
              onClick={() => setGroup(g.id)}
            >
              {g.label} ({scoped.filter((c) => c.group === g.id).length})
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {visible.length ? (
        <div className="qr-grid">
          {visible.map((c) => {
            const url = qrUrl(c.token);
            return (
              <article className="card qr-card" key={c.id}>
                <QrImage value={url} size={compact ? 120 : 140} label={c.label} />
                <div className="qr-card-body">
                  <span className="eyebrow">
                    {c.kind_name}
                    {c.staff_only && <em className="badge">Équipe</em>}
                  </span>
                  <h3>{c.label}</h3>
                  <small className="muted">
                    <ScanLine size={13} /> {c.scans} scan{c.scans > 1 ? "s" : ""} · {relative(c.last_scan)}
                  </small>
                  <QrActions value={url} label={c.label} compact={compact} />
                  {c.kind === "custom" && (
                    <button
                      className="qr-archive"
                      onClick={() => {
                        if (confirm(`Supprimer le QR code « ${c.label} » ? Les impressions existantes ne fonctionneront plus.`))
                          void post({ action: "archive", id: c.id }).catch((e) => setError(e.message));
                      }}
                    >
                      <Trash2 size={14} /> Supprimer
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="empty">
          <QrCode size={18} /> Aucun QR code ici pour le moment.
        </p>
      )}
      {creating && (
        <Modal
          title="Générer un QR code"
          description="Un QR code tracé vers n’importe quelle page de votre site ou une adresse externe (Instagram, Google…)."
          close={() => setCreating(false)}
        >
          <p className="muted">
            Pages rapides : {suggestions.map((s) => `${s.label} (${s.target})`).join(" · ")}
          </p>
          <Form
            label="Générer"
            fields={[
              { name: "label", label: "Nom du QR code (ex. Flyer menu du midi)" },
              { name: "target", label: "Destination : page du site (/carte) ou https://…", value: "/carte" },
            ]}
            onSubmit={async (v) => {
              await post({ action: "custom", label: v.label, target: v.target });
              setCreating(false);
              setGroup("perso");
            }}
          />
        </Modal>
      )}
    </div>
  );
}

/**
 * On-demand QR for one order, booking or customer card: created the first
 * time it is opened, then always the same.
 */
export function QrButton({
  restaurant,
  kind,
  refId,
  label,
  className = "",
}: {
  restaurant: string;
  kind: "order" | "reservation" | "customer" | "referral";
  refId: string;
  label: string;
  className?: string;
}) {
  const [code, setCode] = useState<{ token: string; label: string } | null>(null),
    [error, setError] = useState("");
  async function open() {
    try {
      const r = await fetch(`/api/restaurants/${encodeURIComponent(restaurant)}/qr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ensure", kind, ref: refId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setCode({ token: d.token, label: d.label });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <button type="button" className={`qr-button ${className}`} onClick={() => void open()} title={`QR code · ${label}`} aria-label={`QR code · ${label}`}>
        <QrCode size={16} />
      </button>
      {error && <span className="error">{error}</span>}
      {code && (
        <Modal title={code.label} description="Scanné par l’équipe, il ouvre directement la fiche ; par le client, sa page." close={() => setCode(null)}>
          <div className="qr-dialog">
            <QrImage value={qrUrl(code.token)} size={240} label={code.label} />
            <QrActions value={qrUrl(code.token)} label={code.label} />
          </div>
        </Modal>
      )}
    </>
  );
}

/** Overview card: the key codes at a glance and a door to the portfolio. */
export function QrOverviewCard({
  restaurant,
  onOpen,
}: {
  restaurant: string;
  onOpen: () => void;
}) {
  const [data, setData] = useState<Portfolio | null>(null);
  useEffect(() => {
    let alive = true;
    void fetch(`/api/restaurants/${encodeURIComponent(restaurant)}/qr`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setData(d))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [restaurant]);
  const key = ["site", "order-online", "clock"]
    .map((k) => data?.codes.find((c) => c.kind === k))
    .filter((c): c is PortfolioCode => Boolean(c));
  const scans = data?.codes.reduce((n, c) => n + c.scans_7d, 0) ?? 0;
  return (
    <section className="card qr-overview">
      <div className="section-heading">
        <div>
          <h2>Portfolio QR</h2>
          <p className="muted">
            {data
              ? `${data.codes.length} QR codes actifs · ${scans} scans sur 7 jours`
              : "Préparation des QR codes…"}
          </p>
        </div>
        <button className="text-button" onClick={onOpen}>
          Tout voir →
        </button>
      </div>
      <div className="qr-overview-row">
        {key.map((c) => (
          <figure key={c.id}>
            <QrImage value={qrUrl(c.token)} size={92} label={c.label} />
            <figcaption>{c.kind_name}</figcaption>
          </figure>
        ))}
      </div>
      {data && (
        <div className="qr-overview-chips">
          {data.groups
            .map((g) => [g, data.codes.filter((c) => c.group === g.id).length] as const)
            .filter(([, n]) => n > 0)
            .map(([g, n]) => (
              <span className="pill" key={g.id}>
                {g.label} · {n}
              </span>
            ))}
        </div>
      )}
    </section>
  );
}
