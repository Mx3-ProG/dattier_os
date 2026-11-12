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
} from "lucide-react";
import { MediaDropzone } from "./media-upload";
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
  status?: "processing" | "ready" | "failed";
  processing_error?: string | null;
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
  const list = items.filter((m) => m.kind === kind);
  return (
    <Modal
      title={kind === "image" ? "Choisir une image" : "Choisir une vidéo"}
      description={
        kind === "image"
          ? `JPG, PNG ou WebP${limits ? `, ${Math.round(limits.imageBytes / 1048576)} Mo maximum` : ""}. Les images sont redimensionnées et converties automatiquement.`
          : `MP4, MOV ou WebM${limits ? `, ${Math.round(limits.videoBytes / 1048576)} Mo maximum` : ""}. Compression MP4 automatique, 2 minutes maximum. Pour une vidéo longue, préférez YouTube ou Vimeo.`
      }
      close={close}
    >
      <MediaDropzone
        kind={kind}
        onUploaded={(media) => {
          void load().catch((e) => setError(e.message));
          pick(media.url);
        }}
      />
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="site-media-grid">
        {(kind === "image"
          ? [...list.map((m) => m.url), ...builtInImages]
          : list.map((m) => m.url)
        ).map((url) => {
          const media = items.find((m) => m.url === url);
          const pending = media?.status === "processing";
          const failed = media?.status === "failed";
          return (
            <button
              type="button"
              key={url}
              disabled={pending || failed}
              onClick={() => pick(url)}
              title={failed ? media?.processing_error || url : url}
            >
              {kind === "image" ? (
                <img src={url} alt="" loading="lazy" />
              ) : (
                <span className="site-media-video">
                  <Film size={22} />
                  {media?.original_name}
                  {pending && <small>Optimisation en cours…</small>}
                  {failed && <small>Échec de l’optimisation</small>}
                </span>
              )}
            </button>
          );
        })}
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
    case "team":
      return (
        <TeamField
          value={
            value as { name: string; role: string; bio: string; image: { src: string; alt: string } }[]
          }
          disabled={disabled}
          onChange={onChange}
        />
      );
    case "pricing":
      return (
        <PricingField
          value={
            value as { name: string; price: string; period: string; features: string[]; cta: { label: string; href: string }; highlight: boolean }[]
          }
          disabled={disabled}
          onChange={onChange}
        />
      );
    case "blogList":
      return (
        <BlogListField
          value={value as { title: string; excerpt: string; image: { src: string; alt: string }; date: string; href: string }[]}
          disabled={disabled}
          onChange={onChange}
        />
      );
    case "comparison":
      return (
        <ComparisonField
          value={value as { label: string; values: string[] }[]}
          disabled={disabled}
          onChange={onChange}
        />
      );
    case "faqAdvanced":
      return (
        <FaqAdvancedField
          value={value as { name: string; items: { question: string; answer: string }[] }[]}
          disabled={disabled}
          onChange={onChange}
        />
      );
    case "wheel":
      return (
        <WheelField
          value={value as { label: string; color: string }[]}
          disabled={disabled}
          onChange={onChange}
        />
      );
    case "partners":
      return (
        <PartnersField
          value={value as { name: string; image: { src: string; alt: string }; link: { label: string; href: string } }[]}
          disabled={disabled}
          onChange={onChange}
        />
      );
    case "timeline":
      return (
        <TimelineField
          value={value as { title: string; text: string; image: { src: string; alt: string } }[]}
          disabled={disabled}
          onChange={onChange}
        />
      );
    case "testimonials":
      return (
        <TestimonialsField
          value={value as { quote: string; author: string; role: string; image: { src: string; alt: string }; rating: number }[]}
          disabled={disabled}
          onChange={onChange}
        />
      );
    case "stats":
      return (
        <StatsField
          value={value as { value: string; label: string }[]}
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
      <MediaDropzone
        kind="image"
        disabled={disabled}
        onUploaded={(media) => onChange({ ...value, src: media.url })}
      />
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
      <MediaDropzone
        kind="image"
        disabled={disabled || value.length >= (def.max ?? 24)}
        onUploaded={(media) =>
          onChange([...value, { src: media.url, alt: "" }])
        }
      />
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
      <MediaDropzone
        kind="video"
        disabled={disabled}
        onUploaded={(media) => {
          onChange({ kind: "file", src: media.url, poster: value.poster });
          setMode("file");
        }}
      />
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


function TeamField({
  value,
  disabled,
  onChange,
}: {
  value: { name: string; role: string; bio: string; image: { src: string; alt: string } }[];
  disabled: boolean;
  onChange: (v: unknown) => void;
}) {
  const set = (i: number, v: (typeof value)[number]) =>
    onChange(value.map((x, j) => (j === i ? v : x)));
  return (
    <fieldset className="site-group" disabled={disabled}>
      <legend>Membres</legend>
      {value.map((m, i) => (
        <div className="site-faq-row" key={i}>
          <input
            aria-label={`Nom ${i + 1}`}
            value={m.name}
            placeholder="Nom"
            onChange={(e) => set(i, { ...m, name: e.target.value })}
          />
          <input
            aria-label={`Rôle ${i + 1}`}
            value={m.role}
            placeholder="Rôle"
            onChange={(e) => set(i, { ...m, role: e.target.value })}
          />
          <textarea
            aria-label={`Bio ${i + 1}`}
            rows={2}
            value={m.bio}
            placeholder="Bio"
            onChange={(e) => set(i, { ...m, bio: e.target.value })}
          />
          <input
            aria-label={`Image ${i + 1}`}
            value={m.image.src}
            placeholder="/cms/restaurant.svg"
            onChange={(e) =>
              set(i, { ...m, image: { ...m.image, src: e.target.value } })
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
      {value.length < 12 && (
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            onChange([
              ...value,
              {
                name: "",
                role: "",
                bio: "",
                image: { src: "/cms/restaurant.svg", alt: "Photo" },
              },
            ])
          }
        >
          <Plus size={16} /> Ajouter un membre
        </Button>
      )}
    </fieldset>
  );
}

function StatsField({
  value,
  disabled,
  onChange,
}: {
  value: { value: string; label: string }[];
  disabled: boolean;
  onChange: (v: unknown) => void;
}) {
  const set = (i: number, v: (typeof value)[number]) =>
    onChange(value.map((x, j) => (j === i ? v : x)));
  return (
    <fieldset className="site-group" disabled={disabled}>
      <legend>Chiffres</legend>
      {value.map((it, i) => (
        <div className="site-list-row" key={i}>
          <input
            aria-label={`Valeur ${i + 1}`}
            value={it.value}
            placeholder="10+"
            onChange={(e) => set(i, { ...it, value: e.target.value })}
          />
          <input
            aria-label={`Libellé ${i + 1}`}
            value={it.label}
            placeholder="Années d’expérience"
            onChange={(e) => set(i, { ...it, label: e.target.value })}
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
          onClick={() => onChange([...value, { value: "", label: "" }])}
        >
          <Plus size={16} /> Ajouter un chiffre
        </Button>
      )}
    </fieldset>
  );
}


function PartnersField({
  value,
  disabled,
  onChange,
}: {
  value: { name: string; image: { src: string; alt: string }; link: { label: string; href: string } }[];
  disabled: boolean;
  onChange: (v: unknown) => void;
}) {
  const set = (i: number, v: (typeof value)[number]) =>
    onChange(value.map((x, j) => (j === i ? v : x)));
  return (
    <fieldset className="site-group" disabled={disabled}>
      <legend>Logos</legend>
      {value.map((l, i) => (
        <div className="site-faq-row" key={i}>
          <input
            aria-label={`Nom ${i + 1}`}
            value={l.name}
            placeholder="Nom du partenaire"
            onChange={(e) => set(i, { ...l, name: e.target.value })}
          />
          <input
            aria-label={`Logo ${i + 1}`}
            value={l.image.src}
            placeholder="/cms/restaurant.svg"
            onChange={(e) =>
              set(i, { ...l, image: { ...l.image, src: e.target.value } })
            }
          />
          <input
            aria-label={`Lien ${i + 1}`}
            value={l.link.href}
            placeholder="https://…"
            onChange={(e) => set(i, { ...l, link: { ...l.link, href: e.target.value } })}
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
          onClick={() =>
            onChange([
              ...value,
              { name: "", image: { src: "/cms/restaurant.svg", alt: "" }, link: { label: "", href: "" } },
            ])
          }
        >
          <Plus size={16} /> Ajouter un logo
        </Button>
      )}
    </fieldset>
  );
}

function TimelineField({
  value,
  disabled,
  onChange,
}: {
  value: { title: string; text: string; image: { src: string; alt: string } }[];
  disabled: boolean;
  onChange: (v: unknown) => void;
}) {
  const set = (i: number, v: (typeof value)[number]) =>
    onChange(value.map((x, j) => (j === i ? v : x)));
  return (
    <fieldset className="site-group" disabled={disabled}>
      <legend>Étapes</legend>
      {value.map((st, i) => (
        <div className="site-faq-row" key={i}>
          <input
            aria-label={`Titre ${i + 1}`}
            value={st.title}
            placeholder="Titre de l’étape"
            onChange={(e) => set(i, { ...st, title: e.target.value })}
          />
          <textarea
            aria-label={`Texte ${i + 1}`}
            rows={2}
            value={st.text}
            placeholder="Description"
            onChange={(e) => set(i, { ...st, text: e.target.value })}
          />
          <input
            aria-label={`Image ${i + 1}`}
            value={st.image.src}
            placeholder="/cms/restaurant.svg (optionnel)"
            onChange={(e) => set(i, { ...st, image: { ...st.image, src: e.target.value } })}
          />
          <RowActions
            i={i}
            length={value.length}
            move={(from, to) => onChange(moveItem(value, from, to))}
            remove={() => onChange(value.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      {value.length < 8 && (
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            onChange([...value, { title: "", text: "", image: { src: "", alt: "" } }])
          }
        >
          <Plus size={16} /> Ajouter une étape
        </Button>
      )}
    </fieldset>
  );
}

function TestimonialsField({
  value,
  disabled,
  onChange,
}: {
  value: { quote: string; author: string; role: string; image: { src: string; alt: string }; rating: number }[];
  disabled: boolean;
  onChange: (v: unknown) => void;
}) {
  const set = (i: number, v: (typeof value)[number]) =>
    onChange(value.map((x, j) => (j === i ? v : x)));
  return (
    <fieldset className="site-group" disabled={disabled}>
      <legend>Témoignages</legend>
      {value.map((it, i) => (
        <div className="site-faq-row" key={i}>
          <textarea
            aria-label={`Citation ${i + 1}`}
            rows={2}
            value={it.quote}
            placeholder="Citation"
            onChange={(e) => set(i, { ...it, quote: e.target.value })}
          />
          <input
            aria-label={`Auteur ${i + 1}`}
            value={it.author}
            placeholder="Auteur"
            onChange={(e) => set(i, { ...it, author: e.target.value })}
          />
          <input
            aria-label={`Rôle ${i + 1}`}
            value={it.role}
            placeholder="Rôle"
            onChange={(e) => set(i, { ...it, role: e.target.value })}
          />
          <input
            type="number"
            min={1}
            max={5}
            aria-label={`Note ${i + 1}`}
            value={it.rating}
            onChange={(e) => set(i, { ...it, rating: Number(e.target.value) || 5 })}
          />
          <input
            aria-label={`Photo ${i + 1}`}
            value={it.image.src}
            placeholder="/cms/restaurant.svg (optionnel)"
            onChange={(e) => set(i, { ...it, image: { ...it.image, src: e.target.value } })}
          />
          <RowActions
            i={i}
            length={value.length}
            move={(from, to) => onChange(moveItem(value, from, to))}
            remove={() => onChange(value.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      {value.length < 12 && (
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            onChange([
              ...value,
              { quote: "", author: "", role: "", image: { src: "", alt: "" }, rating: 5 },
            ])
          }
        >
          <Plus size={16} /> Ajouter un témoignage
        </Button>
      )}
    </fieldset>
  );
}


function PricingField({
  value,
  disabled,
  onChange,
}: {
  value: { name: string; price: string; period: string; features: string[]; cta: { label: string; href: string }; highlight: boolean }[];
  disabled: boolean;
  onChange: (v: unknown) => void;
}) {
  const set = (i: number, v: (typeof value)[number]) =>
    onChange(value.map((x, j) => (j === i ? v : x)));
  return (
    <fieldset className="site-group" disabled={disabled}>
      <legend>Offres</legend>
      {value.map((pl, i) => (
        <div className="site-faq-row" key={i}>
          <input
            aria-label={`Nom ${i + 1}`}
            value={pl.name}
            placeholder="Nom de l’offre"
            onChange={(e) => set(i, { ...pl, name: e.target.value })}
          />
          <input
            aria-label={`Prix ${i + 1}`}
            value={pl.price}
            placeholder="9 €"
            onChange={(e) => set(i, { ...pl, price: e.target.value })}
          />
          <input
            aria-label={`Période ${i + 1}`}
            value={pl.period}
            placeholder="/mois"
            onChange={(e) => set(i, { ...pl, period: e.target.value })}
          />
          <label>
            <input
              type="checkbox"
              checked={pl.highlight}
              onChange={(e) => set(i, { ...pl, highlight: e.target.checked })}
            />{" "}
            Mettre en avant
          </label>
          <textarea
            aria-label={`Avantages ${i + 1}`}
            rows={3}
            value={pl.features.join("\n")}
            placeholder="Un avantage par ligne"
            onChange={(e) =>
              set(i, { ...pl, features: e.target.value.split("\n").filter(Boolean) })
            }
          />
          <input
            aria-label={`Bouton ${i + 1}`}
            value={pl.cta.label}
            placeholder="Libellé du bouton"
            onChange={(e) => set(i, { ...pl, cta: { ...pl.cta, label: e.target.value } })}
          />
          <input
            aria-label={`Lien ${i + 1}`}
            value={pl.cta.href}
            placeholder="/commander"
            onChange={(e) => set(i, { ...pl, cta: { ...pl.cta, href: e.target.value } })}
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
            onChange([
              ...value,
              {
                name: "",
                price: "",
                period: "",
                features: [],
                cta: { label: "Choisir", href: "/commander" },
                highlight: false,
              },
            ])
          }
        >
          <Plus size={16} /> Ajouter une offre
        </Button>
      )}
    </fieldset>
  );
}


function BlogListField({
  value,
  disabled,
  onChange,
}: {
  value: { title: string; excerpt: string; image: { src: string; alt: string }; date: string; href: string }[];
  disabled: boolean;
  onChange: (v: unknown) => void;
}) {
  const set = (i: number, v: (typeof value)[number]) =>
    onChange(value.map((x, j) => (j === i ? v : x)));
  return (
    <fieldset className="site-group" disabled={disabled}>
      <legend>Articles</legend>
      {value.map((a, i) => (
        <div className="site-faq-row" key={i}>
          <input
            aria-label={`Titre ${i + 1}`}
            value={a.title}
            placeholder="Titre"
            onChange={(e) => set(i, { ...a, title: e.target.value })}
          />
          <textarea
            aria-label={`Extrait ${i + 1}`}
            rows={2}
            value={a.excerpt}
            placeholder="Extrait"
            onChange={(e) => set(i, { ...a, excerpt: e.target.value })}
          />
          <input
            aria-label={`Image ${i + 1}`}
            value={a.image.src}
            placeholder="/cms/restaurant.svg (optionnel)"
            onChange={(e) => set(i, { ...a, image: { ...a.image, src: e.target.value } })}
          />
          <input
            aria-label={`Date ${i + 1}`}
            value={a.date}
            placeholder="2026-01-01"
            onChange={(e) => set(i, { ...a, date: e.target.value })}
          />
          <input
            aria-label={`Lien ${i + 1}`}
            value={a.href}
            placeholder="/mon-article"
            onChange={(e) => set(i, { ...a, href: e.target.value })}
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
          onClick={() =>
            onChange([
              ...value,
              { title: "", excerpt: "", image: { src: "", alt: "" }, date: "", href: "" },
            ])
          }
        >
          <Plus size={16} /> Ajouter un article
        </Button>
      )}
    </fieldset>
  );
}


function ComparisonField({
  value,
  disabled,
  onChange,
}: {
  value: { label: string; values: string[] }[];
  disabled: boolean;
  onChange: (v: unknown) => void;
}) {
  const set = (i: number, v: (typeof value)[number]) =>
    onChange(value.map((x, j) => (j === i ? v : x)));
  return (
    <fieldset className="site-group" disabled={disabled}>
      <legend>Lignes</legend>
      {value.map((r, i) => (
        <div className="site-faq-row" key={i}>
          <input
            aria-label={`Libellé ${i + 1}`}
            value={r.label}
            placeholder="Libellé"
            onChange={(e) => set(i, { ...r, label: e.target.value })}
          />
          <input
            aria-label={`Valeurs ${i + 1}`}
            value={r.values.join(" | ")}
            placeholder="val1 | val2"
            onChange={(e) =>
              set(i, { ...r, values: e.target.value.split("|").map((x) => x.trim()).filter(Boolean) })
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
      {value.length < 20 && (
        <Button
          type="button"
          variant="secondary"
          onClick={() => onChange([...value, { label: "", values: [] }])}
        >
          <Plus size={16} /> Ajouter une ligne
        </Button>
      )}
    </fieldset>
  );
}

function FaqAdvancedField({
  value,
  disabled,
  onChange,
}: {
  value: { name: string; items: { question: string; answer: string }[] }[];
  disabled: boolean;
  onChange: (v: unknown) => void;
}) {
  const set = (i: number, v: (typeof value)[number]) =>
    onChange(value.map((x, j) => (j === i ? v : x)));
  return (
    <fieldset className="site-group" disabled={disabled}>
      <legend>Catégories</legend>
      {value.map((cat, i) => (
        <div className="site-faq-row" key={i}>
          <input
            aria-label={`Catégorie ${i + 1}`}
            value={cat.name}
            placeholder="Nom de la catégorie"
            onChange={(e) => set(i, { ...cat, name: e.target.value })}
          />
          <textarea
            aria-label={`Questions ${i + 1}`}
            rows={4}
            value={cat.items.map((it) => `${it.question}||${it.answer}`).join("\n")}
            placeholder="question||réponse (une par ligne)"
            onChange={(e) => {
              const items = e.target.value
                .split("\n")
                .map((line) => {
                  const [q, a] = line.split("||");
                  return { question: (q ?? "").trim(), answer: (a ?? "").trim() };
                })
                .filter((it) => it.question);
              set(i, { ...cat, items });
            }}
          />
          <RowActions
            i={i}
            length={value.length}
            move={(from, to) => onChange(moveItem(value, from, to))}
            remove={() => onChange(value.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      {value.length < 8 && (
        <Button
          type="button"
          variant="secondary"
          onClick={() => onChange([...value, { name: "", items: [] }])}
        >
          <Plus size={16} /> Ajouter une catégorie
        </Button>
      )}
    </fieldset>
  );
}


function WheelField({
  value,
  disabled,
  onChange,
}: {
  value: { label: string; color: string }[];
  disabled: boolean;
  onChange: (v: unknown) => void;
}) {
  const set = (i: number, v: (typeof value)[number]) =>
    onChange(value.map((x, j) => (j === i ? v : x)));
  return (
    <fieldset className="site-group" disabled={disabled}>
      <legend>Lots</legend>
      {value.map((pr, i) => (
        <div className="site-list-row" key={i}>
          <input
            aria-label={`Libellé ${i + 1}`}
            value={pr.label}
            placeholder="Lot"
            onChange={(e) => set(i, { ...pr, label: e.target.value })}
          />
          <input
            type="color"
            aria-label={`Couleur ${i + 1}`}
            value={pr.color}
            onChange={(e) => set(i, { ...pr, color: e.target.value })}
          />
          <RowActions
            i={i}
            length={value.length}
            move={(from, to) => onChange(moveItem(value, from, to))}
            remove={() => onChange(value.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      {value.length < 12 && (
        <Button
          type="button"
          variant="secondary"
          onClick={() => onChange([...value, { label: "", color: "#9ca3af" }])}
        >
          <Plus size={16} /> Ajouter un lot
        </Button>
      )}
    </fieldset>
  );
}
