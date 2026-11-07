"use client";
import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { useTenantSite } from "../cms-site/context";
export type UploadedMedia = {
  url: string;
  kind: "image" | "video";
  size: number;
  originalSize: number;
  savedBytes: number;
};
export const mediaAccept =
  "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm";
export const mediaSize = (bytes: number) =>
  bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1)} Mo`
    : `${Math.ceil(bytes / 1024)} Ko`;
export async function uploadMedia(
  request: (url: string, init?: RequestInit) => Promise<Response>,
  file: File,
): Promise<UploadedMedia> {
  const image = file.type.startsWith("image/");
  if (!mediaAccept.split(",").includes(file.type))
    throw new Error("Formats acceptés : JPG, PNG, WebP, MP4, MOV et WebM.");
  if (file.size > (image ? 32 : 100) * 1048576)
    throw new Error(
      image
        ? "Image limitée à 32 Mo."
        : "Vidéo limitée à 100 Mo (2 minutes maximum).",
    );
  const form = new FormData();
  form.append("file", file);
  const response = await request("/api/v1/site-media", {
    method: "POST",
    body: form,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Import impossible.");
  return result;
}
export function MediaDropzone({
  kind,
  disabled = false,
  onUploaded,
}: {
  kind?: "image" | "video";
  disabled?: boolean;
  onUploaded: (media: UploadedMedia) => void;
}) {
  const { request } = useTenantSite();
  const locked = useRef(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function accept(files: FileList | File[]) {
    if (disabled || locked.current || !files.length) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      if (files.length !== 1)
        throw new Error(
          "Déposez un fichier à la fois dans ce champ. Pour un lot, utilisez l’aperçu de la page.",
        );
      const file = files[0];
      if (kind && !file.type.startsWith(`${kind}/`))
        throw new Error(
          kind === "image"
            ? "Déposez une image dans ce champ."
            : "Déposez une vidéo dans ce champ.",
        );
      setStatus(`Envoi et optimisation de ${file.name}…`);
      const media = await uploadMedia(request, file);
      setStatus(
        `${mediaSize(media.originalSize)} → ${mediaSize(media.size)} · ${mediaSize(media.savedBytes)} économisés`,
      );
      onUploaded(media);
    } catch (e) {
      setError((e as Error).message);
      setStatus("");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <div
      className="media-dropzone"
      aria-busy={busy}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = disabled || busy ? "none" : "copy";
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void accept(e.dataTransfer.files);
      }}
    >
      <label>
        <Upload size={19} />
        <span>
          {busy
            ? "Optimisation en cours…"
            : "Glissez un fichier ici ou choisissez-le"}
        </span>
        <input
          type="file"
          aria-label="Importer et optimiser un média"
          accept={
            kind === "image"
              ? "image/jpeg,image/png,image/webp"
              : kind === "video"
                ? "video/mp4,video/quicktime,video/webm"
                : mediaAccept
          }
          disabled={disabled || busy}
          onChange={(e) => {
            if (e.target.files) void accept(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      <small>
        Compression automatique · photos 32 Mo · vidéos 100 Mo / 2 min
      </small>
      {status && <p role="status">{status}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
