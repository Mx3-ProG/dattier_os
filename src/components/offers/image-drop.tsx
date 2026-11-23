"use client";
import { useRef, useState } from "react";
import { ImagePlus, Star, Trash2, ArrowLeft, ArrowRight } from "lucide-react";

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Glisser-déposer d'images (8 au plus). La première est l'image principale. */
export function ImageDrop({
  restaurant,
  images,
  onChange,
  disabled,
}: {
  restaurant: string;
  images: string[];
  onChange: (images: string[]) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState("");
  const full = images.length >= 8;

  async function upload(files: FileList | File[]) {
    setError("");
    const list = Array.from(files).slice(0, 8 - images.length);
    if (!list.length) return;
    const added: string[] = [];
    setUploading(list.length);
    for (const file of list) {
      try {
        if (!TYPES.includes(file.type)) throw new Error(`${file.name} : image PNG, JPEG ou WebP requise.`);
        if (file.size > MAX_BYTES) throw new Error(`${file.name} : 8 Mo maximum.`);
        const response = await fetch(`/api/restaurants/${encodeURIComponent(restaurant)}/media`, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || "Envoi impossible.");
        added.push(result.url as string);
      } catch (cause) {
        setError((cause as Error).message);
      } finally {
        setUploading((count) => count - 1);
      }
    }
    if (added.length) onChange([...images, ...added]);
  }
  const move = (index: number, offset: number) => {
    const next = [...images];
    const [item] = next.splice(index, 1);
    next.splice(index + offset, 0, item);
    onChange(next);
  };

  return (
    <div className="offer-images">
      {images.length > 0 && (
        <ul className="offer-image-list">
          {images.map((url, index) => (
            <li key={url} className={index === 0 ? "is-main" : ""}>
              <img src={url} alt={index === 0 ? "Image principale" : `Image ${index + 1}`} />
              {index === 0 && <span className="offer-image-badge">Principale</span>}
              <div className="offer-image-tools">
                {index > 0 && (
                  <button type="button" onClick={() => move(index, -index)} aria-label="Définir comme image principale" title="Image principale">
                    <Star size={15} />
                  </button>
                )}
                {index > 0 && (
                  <button type="button" onClick={() => move(index, -1)} aria-label="Déplacer à gauche"><ArrowLeft size={15} /></button>
                )}
                {index < images.length - 1 && (
                  <button type="button" onClick={() => move(index, 1)} aria-label="Déplacer à droite"><ArrowRight size={15} /></button>
                )}
                <button type="button" onClick={() => onChange(images.filter((entry) => entry !== url))} aria-label="Retirer l’image">
                  <Trash2 size={15} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!full && (
        <div
          className={`offer-dropzone ${over ? "is-over" : ""}`}
          role="button"
          tabIndex={0}
          aria-disabled={disabled || uploading > 0}
          onClick={() => !disabled && input.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") { event.preventDefault(); input.current?.click(); }
          }}
          onDragOver={(event) => { event.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setOver(false);
            if (!disabled) void upload(event.dataTransfer.files);
          }}
        >
          <ImagePlus size={26} aria-hidden />
          <strong>{uploading > 0 ? `Envoi en cours (${uploading})…` : "Glissez vos images ici"}</strong>
          <span>ou cliquez pour choisir · PNG, JPEG ou WebP · 8 Mo max · {8 - images.length} restante{8 - images.length > 1 ? "s" : ""}</span>
          <input
            ref={input}
            type="file"
            accept={TYPES.join(",")}
            multiple
            hidden
            onChange={(event) => {
              if (event.target.files) void upload(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
      )}
      {error && <p role="alert" className="offer-error">{error}</p>}
    </div>
  );
}
