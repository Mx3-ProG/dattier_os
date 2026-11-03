"use client";
/* eslint-disable @next/next/no-img-element */
import { useTenantSite } from "../cms-site/context";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Film,
  ImageIcon,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "../ui/button";
import { Modal } from "../forms";
import type { FieldDef } from "@/features/cms/registry";
import { isSafeHref } from "@/features/cms/text";

/** Images shipped with the template, usable without uploading anything. */
export const builtInImages = ["/cms/restaurant.svg"];

type Media = {
  id: string;
  kind: "image" | "video";
  url: string;
  original_name: string;
  size: number;
  width: number | null;
  height: number | null;
};
type Limits = { imageBytes: number; videoBytes: number };

/** Media library: upload (validated server-side) and selection. */
export function MediaPicker({
  kind,
  close,
  pick,
}: {
  kind: "image" | "video";
  close: () => void;
  pick: (url: string) => void;
}) {
  const { request: fetch } = useTenantSite();
  const [items, setItems] = useState<Media[]>([]),
    [limits, setLimits] = useState<Limits | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    const r = await fetch("/api/v1/site?view=media");
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setItems(d.items);
    setLimits(d.limits);
  }, [fetch]);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);
  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      if (
        limits &&
        file.size > (kind === "image" ? limits.imageBytes : limits.videoBytes)
      )
        throw new Error(
          `Fichier trop lourd (${Math.round(file.size / 1048576)} Mo).`,
        );
      const form = new FormData();
      form.append("file", file);
      const r = await fetch("/api/v1/site-media", {
        method: "POST",
        body: form,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await load();
      pick(d.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const list = items.filter((m) => m.kind === kind);
  return (
    <Modal
      title={kind === "image" ? "Choisir une image" : "Choisir une vidéo"}
      description={
        kind === "image"
          ? `JPG, PNG ou WebP${limits ? `, ${Math.round(limits.imageBytes / 1048576)} Mo maximum` : ""}. Les images sont redimensionnées et converties automatiquement.`
          : `MP4 ou WebM${limits ? `, ${Math.round(limits.videoBytes / 1048576)} Mo maximum` : ""}. Pour une vidéo longue, préférez YouTube ou Vimeo.`
      }
      close={close}
    >
      <label className="site-upload">
        <Upload size={18} />
        {busy ? "Import en cours…" : "Importer depuis mon ordinateur"}
        <input
          type="file"
          accept={
            kind === "image"
              ? "image/jpeg,image/png,image/webp"
              : "video/mp4,video/webm"
          }
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
      </label>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="site-media-grid">
        {(kind === "image"
          ? [...list.map((m) => m.url), ...builtInImages]
          : list.map((m) => m.url)
        ).map((url) => (
          <button type="button" key={url} onClick={() => pick(url)} title={url}>
            {kind === "image" ? (
              <img src={url} alt="" loading="lazy" />
            ) : (
              <span className="site-media-video">
                <Film size={22} />
                {items.find((m) => m.url === url)?.original_name}
              </span>
            )}
          </button>
        ))}
        {kind === "video" && !list.length && (
          <p className="muted">Aucune vidéo importée.</p>
        )}
      </div>
    </Modal>
  );
}

type FieldProps = {
  def: FieldDef;
  value: unknown;
  disabled: boolean;
  onChange: (v: unknown) => void;
};
const Hint = ({ id, text }: { id: string; text?: string }) =>
  text ? (
    <small id={id} className="site-field-help">
      {text}
    </small>
  ) : null;

export function Field({ def, value, disabled, onChange }: FieldProps) {
  const id = `field-${def.key}`;
  switch (def.kind) {
    case "text":
      return (
        <div className="site-field">
          <label htmlFor={id}>{def.label}</label>
          <input
            id={id}
            aria-describedby={def.help ? `${id}-help` : undefined}
            value={String(value ?? "")}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          />
          <Hint id={`${id}-help`} text={def.help} />
        </div>
      );
    case "textarea":
      return (
        <div className="site-field">
          <label htmlFor={id}>{def.label}</label>
          <textarea
            id={id}
            rows={3}
            aria-describedby={def.help ? `${id}-help` : undefined}
            value={String(value ?? "")}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          />
          <Hint id={`${id}-help`} text={def.help} />
        </div>
      );
    case "number":
      return (
        <label className="site-field" htmlFor={id}>
          {def.label}
          <input
            id={id}
            type="number"
            min={def.min}
            max={def.max}
            value={Number(value ?? 0)}
            disabled={disabled}
            onChange={(e) =>
              onChange(
                Math.max(
                  def.min ?? 0,
                  Math.min(
                    def.max ?? 1e6,
                    Math.round(Number(e.target.value) || 0),
                  ),
                ),
              )
            }
          />
        </label>
      );
    case "boolean":
      return (
        <label className="site-check">
          <input
            type="checkbox"
            checked={!!value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
          />
          {def.label}
        </label>
      );
    case "select":
      return (
        <label className="site-field" htmlFor={id}>
          {def.label}
          <select
            id={id}
            value={String(value)}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          >
            {def.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      );
    case "link":
      return (
        <LinkField
          label={def.label}
          value={value as { label: string; href: string }}
          disabled={disabled}
          onChange={onChange}
        />
      );
    case "image":
      return (
        <ImageField
          label={def.label}
          value={value as { src: string; alt: string }}
          disabled={disabled}
          onChange={onChange}
        />
      );
    case "images":
      return (
        <ImagesField
          def={def}
          value={value as { src: string; alt: string }[]}
          disabled={disabled}
          onChange={onChange}
        />
      );
    case "list":
      return (
        <ListField
          def={def}
          value={value as string[]}
          disabled={disabled}
          onChange={onChange}
        />
      );
    case "faq":
      return (
        <FaqField
          value={value as { question: string; answer: string }[]}
          disabled={disabled}
          onChange={onChange}
        />
      );
    case "badges":
      return (
        <BadgesField
          value={value as { icon: string; label: string }[]}
          disabled={disabled}
          onChange={onChange}
        />
      );
    case "video":
      return (
        <VideoField
          value={value as VideoSource}
          disabled={disabled}
          onChange={onChange}
        />
      );
  }
}

export function LinkField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: { label: string; href: string };
  disabled: boolean;
  onChange: (v: unknown) => void;
}) {
  const invalid = value.href !== "" && !isSafeHref(value.href);
  return (
    <fieldset className="site-group" disabled={disabled}>
      <legend>{label}</legend>
      <label className="site-field">
        Texte du bouton
        <input
          value={value.label}
          onChange={(e) => onChange({ ...value, label: e.target.value })}
          placeholder="Vide = bouton masqué"
        />
      </label>
      <label className="site-field">
        Destination
        <input
          value={value.href}
          aria-invalid={invalid}
          onChange={(e) => onChange({ ...value, href: e.target.value.trim() })}
          placeholder="/commander, https://…, tel:…"
          list="site-internal-links"
        />
        {invalid && (
          <small className="site-field-error">
            Lien non autorisé : page du site (/…), https://, tel: ou mailto:.
          </small>
        )}
      </label>
    </fieldset>
  );
}

export function ImageField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: { src: string; alt: string };
  disabled: boolean;
  onChange: (v: unknown) => void;
}) {
  const [picking, setPicking] = useState(false);
  return (
    <fieldset className="site-group" disabled={disabled}>
      <legend>{label}</legend>
      <div className="site-image-field">
        {value.src ? (
          <img src={value.src} alt="" />
        ) : (
          <span className="site-image-empty">
            <ImageIcon size={20} />
          </span>
        )}
        <Button
          type="button"
          variant="secondary"
          onClick={() => setPicking(true)}
        >
          {value.src ? "Remplacer" : "Choisir"}
        </Button>
      </div>
      <label className="site-field">
        Texte alternatif (lu par les lecteurs d’écran)
        <input
          value={value.alt}
          required
          onChange={(e) => onChange({ ...value, alt: e.target.value })}
          placeholder="Décrivez l’image en quelques mots"
        />
        {!value.alt.trim() && (
          <small className="site-field-error">
            Recommandé pour l’accessibilité et le référencement.
          </small>
        )}
      </label>
      {picking && (
        <MediaPicker
          kind="image"
          close={() => setPicking(false)}
          pick={(src) => {
            onChange({ ...value, src });
            setPicking(false);
          }}
        />
      )}
    </fieldset>
  );
}

function ImagesField({
  def,
  value,
  disabled,
  onChange,
}: {
  def: FieldDef;
  value: { src: string; alt: string }[];
  disabled: boolean;
  onChange: (v: unknown) => void;
}) {
  const [picking, setPicking] = useState(false);
  const set = (i: number, v: { src: string; alt: string }) =>
    onChange(value.map((x, j) => (j === i ? v : x)));
  return (
    <fieldset className="site-group" disabled={disabled}>
      <legend>{def.label}</legend>
      {value.map((img, i) => (
        <div className="site-list-row" key={`${img.src}-${i}`}>
          <img src={img.src} alt="" className="site-thumb" />
          <input
            aria-label={`Texte alternatif ${i + 1}`}
            value={img.alt}
            placeholder="Texte alternatif"
            onChange={(e) => set(i, { ...img, alt: e.target.value })}
          />
          <RowActions
            i={i}
            length={value.length}
            move={(from, to) => onChange(moveItem(value, from, to))}
            remove={() => onChange(value.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      {value.length < (def.max ?? 24) && (
        <Button
          type="button"
          variant="secondary"
          onClick={() => setPicking(true)}
        >
          <Plus size={16} /> Ajouter une photo
        </Button>
      )}
      {picking && (
        <MediaPicker
          kind="image"
          close={() => setPicking(false)}
          pick={(src) => {
            onChange([...value, { src, alt: "" }]);
            setPicking(false);
          }}
        />
      )}
    </fieldset>
  );
}

export const moveItem = <T,>(list: T[], from: number, to: number) => {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};
function RowActions({
  i,
  length,
  move,
  remove,
}: {
  i: number;
  length: number;
  move: (from: number, to: number) => void;
  remove: () => void;
}) {
  return (
    <span className="site-row-actions">
      <button
        type="button"
        aria-label="Monter"
        disabled={i === 0}
        onClick={() => move(i, i - 1)}
      >
        <ArrowUp size={15} />
      </button>
      <button
        type="button"
        aria-label="Descendre"
        disabled={i === length - 1}
        onClick={() => move(i, i + 1)}
      >
        <ArrowDown size={15} />
      </button>
      <button type="button" aria-label="Supprimer" onClick={remove}>
        <Trash2 size={15} />
      </button>
    </span>
  );
}

function ListField({
  def,
  value,
  disabled,
  onChange,
}: {
  def: FieldDef;
  value: string[];
  disabled: boolean;
  onChange: (v: unknown) => void;
}) {
  return (
    <fieldset className="site-group" disabled={disabled}>
      <legend>{def.label}</legend>
      {value.map((item, i) => (
        <div className="site-list-row" key={i}>
          <textarea
            rows={2}
            aria-label={`${def.label} ${i + 1}`}
            value={item}
            onChange={(e) =>
              onChange(value.map((x, j) => (j === i ? e.target.value : x)))
            }
          />
          <RowActions
            i={i}
            length={value.length}
            move={(from, to) => onChange(moveItem(value, from, to))}
            remove={() => onChange(value.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      {value.length < (def.max ?? 10) && (
        <Button
          type="button"
          variant="secondary"
          onClick={() => onChange([...value, ""])}
        >
          <Plus size={16} /> Ajouter
        </Button>
      )}
    </fieldset>
  );
}

function FaqField({
  value,
  disabled,
  onChange,
}: {
  value: { question: string; answer: string }[];
  disabled: boolean;
  onChange: (v: unknown) => void;
}) {
  const set = (i: number, v: { question: string; answer: string }) =>
    onChange(value.map((x, j) => (j === i ? v : x)));
  return (
    <fieldset className="site-group" disabled={disabled}>
      <legend>Questions</legend>
      {value.map((item, i) => (
        <div className="site-faq-row" key={i}>
          <input
            aria-label={`Question ${i + 1}`}
            value={item.question}
            placeholder="Question"
            onChange={(e) => set(i, { ...item, question: e.target.value })}
          />
          <textarea
            aria-label={`Réponse ${i + 1}`}
            rows={3}
            value={item.answer}
            placeholder="Réponse"
            onChange={(e) => set(i, { ...item, answer: e.target.value })}
          />
          <RowActions
            i={i}
            length={value.length}
            move={(from, to) => onChange(moveItem(value, from, to))}
            remove={() => onChange(value.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      {value.length < 20 && (
        <Button
          type="button"
          variant="secondary"
          onClick={() => onChange([...value, { question: "", answer: "" }])}
        >
          <Plus size={16} /> Ajouter une question
        </Button>
      )}
    </fieldset>
  );
}

const badgeIcons = [
  ["bag", "Sac"],
  ["clock", "Horloge"],
  ["card", "Carte bancaire"],
  ["wallet", "Portefeuille"],
  ["star", "Étoile"],
  ["pin", "Repère"],
  ["sparkles", "Étincelles"],
] as const;
function BadgesField({
  value,
  disabled,
  onChange,
}: {
  value: { icon: string; label: string }[];
  disabled: boolean;
  onChange: (v: unknown) => void;
}) {
  return (
    <fieldset className="site-group" disabled={disabled}>
      <legend>Avantages affichés</legend>
      {value.map((b, i) => (
        <div className="site-list-row" key={i}>
          <select
            aria-label={`Icône ${i + 1}`}
            value={b.icon}
            onChange={(e) =>
              onChange(
                value.map((x, j) =>
                  j === i ? { ...x, icon: e.target.value } : x,
                ),
              )
            }
          >
            {badgeIcons.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <input
            aria-label={`Avantage ${i + 1}`}
            value={b.label}
            onChange={(e) =>
              onChange(
                value.map((x, j) =>
                  j === i ? { ...x, label: e.target.value } : x,
                ),
              )
            }
          />
          <RowActions
            i={i}
            length={value.length}
            move={(from, to) => onChange(moveItem(value, from, to))}
            remove={() => onChange(value.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      {value.length < 6 && (
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            onChange([...value, { icon: "sparkles", label: "Nouvel avantage" }])
          }
        >
          <Plus size={16} /> Ajouter
        </Button>
      )}
    </fieldset>
  );
}

type VideoSource =
  | { kind: "file"; src: string; poster: string }
  | { kind: "youtube" | "vimeo"; id: string; poster: string };
/** Extracts a YouTube / Vimeo id from a pasted link (only the id is stored). */
export function parseVideoUrl(input: string): VideoSource | null {
  const yt =
    /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/.exec(
      input,
    );
  if (yt) return { kind: "youtube", id: yt[1], poster: "" };
  const vimeo = /vimeo\.com\/(?:video\/)?(\d{6,12})/.exec(input);
  if (vimeo) return { kind: "vimeo", id: vimeo[1], poster: "" };
  return null;
}
function VideoField({
  value,
  disabled,
  onChange,
}: {
  value: VideoSource;
  disabled: boolean;
  onChange: (v: unknown) => void;
}) {
  const [picking, setPicking] = useState<"video" | "image" | null>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"file" | "embed">(
    value.kind === "file" ? "file" : "embed",
  );
  return (
    <fieldset className="site-group" disabled={disabled}>
      <legend>Vidéo</legend>
      <div className="tabs site-mini-tabs">
        <button
          type="button"
          className={mode === "file" ? "active" : ""}
          onClick={() => setMode("file")}
        >
          Fichier importé
        </button>
        <button
          type="button"
          className={mode === "embed" ? "active" : ""}
          onClick={() => setMode("embed")}
        >
          YouTube / Vimeo
        </button>
      </div>
      {mode === "file" ? (
        <>
          <p className="muted">
            {value.kind === "file" && value.src
              ? `Vidéo : ${value.src.split("/").at(-1)}`
              : "Aucune vidéo importée sélectionnée."}
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setPicking("video")}
          >
            <Film size={16} /> Choisir une vidéo
          </Button>
        </>
      ) : (
        <label className="site-field">
          Lien de la vidéo
          {value.kind !== "file" &&
            ` (actuelle : ${value.kind === "youtube" ? "YouTube" : "Vimeo"} ${value.id})`}
          <input
            value={url}
            placeholder="https://www.youtube.com/watch?v=…"
            onChange={(e) => {
              setUrl(e.target.value);
              const parsed = parseVideoUrl(e.target.value);
              setError(
                parsed || !e.target.value
                  ? ""
                  : "Lien YouTube ou Vimeo non reconnu.",
              );
              if (parsed) onChange({ ...parsed, poster: value.poster });
            }}
          />
          {error && <small className="site-field-error">{error}</small>}
          <small className="site-field-help">
            La vidéo reste bloquée tant que le visiteur n’accepte pas les
            contenus externes.
          </small>
        </label>
      )}
      <div className="site-image-field">
        {value.poster ? (
          <img src={value.poster} alt="" />
        ) : (
          <span className="site-image-empty">
            <ImageIcon size={20} />
          </span>
        )}
        <Button
          type="button"
          variant="secondary"
          onClick={() => setPicking("image")}
        >
          Miniature
        </Button>
        {value.poster && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => onChange({ ...value, poster: "" })}
          >
            Retirer
          </Button>
        )}
      </div>
      {picking && (
        <MediaPicker
          kind={picking}
          close={() => setPicking(null)}
          pick={(src) => {
            onChange(
              picking === "video"
                ? { kind: "file", src, poster: value.poster }
                : { ...value, poster: src },
            );
            setPicking(null);
          }}
        />
      )}
    </fieldset>
  );
}
