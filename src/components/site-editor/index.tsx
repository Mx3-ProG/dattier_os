"use client";
import { PresentationFields } from "./presentation-fields";
import { UtensilsLoader } from "@/components/brand/utensils";
import { useTenantSite } from "../cms-site/context";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Upload,
  ArrowDown,
  BookOpen,
  ArrowUp,
  ExternalLink,
  Eye,
  EyeOff,
  GripVertical,
  History,
  Layers,
  Lock,
  Monitor,
  PanelLeft,
  Plus,
  Redo2,
  Search,
  Settings2,
  SlidersHorizontal,
  Smartphone,
  Tablet,
  Trash2,
  Undo2,
  FileText,
  Palette,
  Wand2,
} from "lucide-react";
import { Button } from "../ui/button";
import { Modal } from "../forms";
import { Field, ImageField } from "./fields";
import { SeoIdentityFields } from "./seo-identity";
import { SiteAddonIdentity } from "./site-addons-panel";
import { addonSectionAddons, addonNames, emptySiteAddons, isAddonSection, type SiteAddonData } from "@/features/cms/site-addons";
import {
  registry,
  addableTypes,
  pageKindLabels,
  pageRoute,
  sectionLabel,
  systemBlockLabels,
} from "@/features/cms/registry";
import {
  contrastChecks,
  slugError,
  stable,
  type CmsSettings,
} from "@/features/cms/rules";
import { fonts } from "@/features/cms/theme";
import {
  fontIds,
  type Section,
  type SectionType,
  type SiteConfig,
} from "@/features/cms/schema";
import {
  placeholderKeys,
  plain,
  type PlaceholderContext,
} from "@/features/cms/text";
import { SiteHome, TemplatesPanel } from "./templates";
import { applySiteTemplate } from "@/features/cms/templates";
import { uploadMedia, mediaSize, mediaAccept } from "./media-upload";
import { insertDroppedMedia } from "@/features/cms/media-drop";
import { StudioGuide } from "./guide";
import { FLUX_APPLIED_EVENT } from "../assistant/flux";
import { openFlux } from "../assistant/cuisine-ia";
import type { PreviewMessage } from "../cms-site/store";

type EditorState = {
  role: "OWNER" | "SUPER_ADMIN";
  config: SiteConfig;
  revision: number;
  draftSavedAt: string | null;
  draftSavedBy: string | null;
  published: { id: string; number: number; at: string; by: string } | null;
  unpublished: boolean;
  settings: CmsSettings;
  defaults: SiteConfig;
  context: PlaceholderContext;
  siteAddons?: SiteAddonData;
};
type Version = {
  id: string;
  number: number;
  summary: string;
  restored_from: number | null;
  published_at: string;
  published_by: string | null;
  current: boolean;
};
type Tab =
  | "pages"
  | "sections"
  | "library"
  | "brand"
  | "theme"
  | "seo"
  | "history"
  | "admin";
type Device = "desktop" | "tablet" | "mobile";
const devices: Record<
  Device,
  { width: number; label: string; icon: typeof Monitor }
> = {
  desktop: { width: 1280, label: "Ordinateur", icon: Monitor },
  tablet: { width: 820, label: "Tablette", icon: Tablet },
  mobile: { width: 390, label: "Mobile", icon: Smartphone },
};
const SPECIAL = {
  "site-header": "brand",
  "site-footer": "brand",
  "site-announcement": "brand",
} as const;

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("fr-FR", {
        timeZone: "Europe/Paris",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
const newId = (page: string, type: string) =>
  `${page.slice(0, 22)}-${type.toLowerCase()}-${Math.random().toString(36).slice(2, 7)}`
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 48);

export function SiteEditor({
  liveDataHref,
}: {
  liveDataHref: (module: string) => string;
}) {
  const { request: fetch, base, restaurant, demo } = useTenantSite();
  const UNSAVED_KEY = `atacuisine-cms-unsaved:${restaurant}`;
  const [view, setView] = useState<"home" | "shop" | "editor">("home");
  const [meta, setMeta] = useState<EditorState | null>(null),
    [config, setConfigState] = useState<SiteConfig | null>(null),
    [saved, setSaved] = useState<SiteConfig | null>(null),
    [requestedPage, setPageKey] = useState("home"),
    [selected, setSelected] = useState<string | null>(null),
    [tab, setTab] = useState<Tab>("sections"),
    [device, setDevice] = useState<Device>(() =>
      typeof window !== "undefined" && window.innerWidth < 700
        ? "mobile"
        : "desktop",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [publishing, setPublishing] = useState(false),
    [creating, setCreating] = useState(false),
    [guideOpen, setGuideOpen] = useState(false),
    [libraryQuery, setLibraryQuery] = useState(""),
    [panels, setPanels] = useState<"none" | "left" | "right">("none"),
    [depth, setDepth] = useState({ undo: 0, redo: 0 });
  const configRef = useRef<SiteConfig | null>(null),
    past = useRef<SiteConfig[]>([]),
    future = useRef<SiteConfig[]>([]),
    lastEdit = useRef<{ key: string; at: number } | null>(null);

  const pageKey =
    config && Object.hasOwn(config.pages, requestedPage)
      ? requestedPage
      : "home";
  const activeWrite = useRef(false);

  /* ── Loading, undo/redo ─────────────────────────────── */
  const loadMeta = useCallback(async () => {
    const r = await fetch("/api/v1/site?view=state");
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setMeta(d);
    return d as EditorState;
  }, [fetch]);
  const loadEditor = useCallback(() => {
    loadMeta()
      .then((d) => {
        let start = d.config;
        try {
          const kept = JSON.parse(
            sessionStorage.getItem(UNSAVED_KEY) || "null",
          );
          if (
            kept?.revision === d.revision &&
            kept.config &&
            stable(kept.config) !== stable(d.config)
          ) {
            start = kept.config;
            setNotice("Vos modifications non enregistrées ont été récupérées.");
          }
        } catch {}
        configRef.current = start;
        setConfigState(start);
        setSaved(d.config);
      })
      .catch((e) => setError(e.message));
  }, [loadMeta, UNSAVED_KEY]);
  useEffect(loadEditor, [loadEditor]);
  // FLUX vient d’enregistrer un nouveau brouillon : on le recharge (l’historique local n’a plus de sens).
  useEffect(() => {
    const reload = () => {
      past.current = [];
      future.current = [];
      setDepth({ undo: 0, redo: 0 });
      setNotice("FLUX a construit votre site : le brouillon a été rechargé.");
      loadEditor();
    };
    window.addEventListener(FLUX_APPLIED_EVENT, reload);
    return () => window.removeEventListener(FLUX_APPLIED_EVENT, reload);
  }, [loadEditor]);
  const commit = useCallback((next: SiteConfig, key?: string) => {
    const prev = configRef.current;
    if (!prev) return;
    const coalesce =
      key &&
      lastEdit.current?.key === key &&
      Date.now() - lastEdit.current.at < 900;
    if (!coalesce) {
      past.current.push(prev);
      if (past.current.length > 100) past.current.shift();
    }
    future.current = [];
    lastEdit.current = key ? { key, at: Date.now() } : null;
    configRef.current = next;
    setConfigState(next);
    setDepth({ undo: past.current.length, redo: 0 });
  }, []);
  const update = useCallback(
    (mutate: (c: SiteConfig) => void, key?: string) => {
      if (!configRef.current) return;
      const next = structuredClone(configRef.current);
      mutate(next);
      commit(next, key);
    },
    [commit],
  );
  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev || !configRef.current) return;
    future.current.push(configRef.current);
    lastEdit.current = null;
    configRef.current = prev;
    setConfigState(prev);
    setDepth({ undo: past.current.length, redo: future.current.length });
  }, []);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next || !configRef.current) return;
    past.current.push(configRef.current);
    configRef.current = next;
    setConfigState(next);
    setDepth({ undo: past.current.length, redo: future.current.length });
  }, []);
  const dirty = !!config && !!saved && stable(config) !== stable(saved);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!meta || !config) return;
    try {
      if (dirty)
        sessionStorage.setItem(
          UNSAVED_KEY,
          JSON.stringify({ revision: meta.revision, config }),
        );
      else sessionStorage.removeItem(UNSAVED_KEY);
    } catch {}
  }, [config, dirty, meta, UNSAVED_KEY]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /* ── Server actions ─────────────────────────────────── */
  const post = useCallback(
    async (body: Record<string, unknown>) => {
      const r = await fetch("/api/v1/site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      return d;
    },
    [fetch],
  );
  const saveDraft = useCallback(async () => {
    if (!configRef.current || !meta) return null;
    const snapshot = configRef.current;
    const { revision } = await post({
      op: "save",
      revision: meta.revision,
      config: snapshot,
    });
    setSaved(snapshot);
    setMeta({
      ...meta,
      revision,
      unpublished: true,
      draftSavedAt: new Date().toISOString(),
    });
    return revision as number;
  }, [meta, post]);
  const save = useCallback(async () => {
    if (activeWrite.current || !dirty) return;
    activeWrite.current = true;
    setBusy(true);
    setError("");
    try {
      await saveDraft();
      setNotice(
        "Brouillon enregistré. Il n’est pas encore visible sur le site.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      activeWrite.current = false;
      setBusy(false);
    }
  }, [dirty, saveDraft]);
  async function publish(summary: string) {
    if (activeWrite.current || !meta) return;
    activeWrite.current = true;
    setBusy(true);
    setError("");
    try {
      const revision = dirty ? await saveDraft() : meta.revision;
      const { number } = await post({
        op: "publish",
        revision,
        summary,
      });
      await loadMeta();
      setPublishing(false);
      setNotice(`Version ${number} publiée : le site public est à jour.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      activeWrite.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const inField = (e.target as Element)?.closest("input,textarea,select");
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      } else if (e.key.toLowerCase() === "z" && !inField) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [save, undo, redo]);

  /* ── Live preview (same-origin iframe running the real site) ── */
  const frame = useRef<HTMLIFrameElement>(null),
    stage = useRef<HTMLDivElement>(null),
    [ready, setReady] = useState(false),
    [stageSize, setStageSize] = useState({ width: 1000, height: 700 });
  const send = useCallback((message: PreviewMessage) => {
    frame.current?.contentWindow?.postMessage(message, location.origin);
  }, []);
  const previewPage =
    config?.pages[pageKey]?.kind === "custom" ? pageKey : undefined;
  const dropHandler = useRef<(files: File[], target: string | null) => void>(
    () => {},
  );
  const mediaLock = useRef(false);
  const [mediaStatus, setMediaStatus] = useState("");
  const [mediaBusy, setMediaBusy] = useState(false);
  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  useEffect(() => {
    const onMessage = (event: MessageEvent<PreviewMessage>) => {
      if (
        event.origin !== location.origin ||
        event.source !== frame.current?.contentWindow
      )
        return;
      if (event.data?.type === "cms:ready") {
        // A (re)loaded preview first receives the current unsaved state.
        if (configRef.current)
          send({
            type: "cms:config",
            config: configRef.current,
            page: previewPage,
          });
        send({ type: "cms:select", id: selectedRef.current });
        setReady(true);
      }
      if (event.data?.type === "cms:drop" && Array.isArray(event.data.files)) {
        dropHandler.current(event.data.files, event.data.id);
      }
      if (event.data?.type === "cms:pick") {
        const id = event.data.id;
        if (Object.hasOwn(SPECIAL, id)) {
          setTab("brand");
          setSelected(null);
          setPanels("left");
        } else {
          setSelected(id);
          setPanels("right");
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [send, previewPage]);
  useEffect(() => {
    if (ready && config)
      send({ type: "cms:config", config, page: previewPage });
  }, [ready, config, send, previewPage]);
  useEffect(() => {
    if (ready) send({ type: "cms:select", id: selected });
  }, [ready, selected, send]);
  const editorLoaded = !!meta;
  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setStageSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, [editorLoaded, view]);

  const page = config?.pages[pageKey];
  const isAdmin = meta?.role === "SUPER_ADMIN";
  const section = page?.sections.find((s) => s.id === selected) ?? null;
  const allowed = meta?.settings.allowedTypes ?? [];
  const width = devices[device].width;
  const scale = Math.min(1, Math.max(1, stageSize.width - 24) / width);
  const previewSrc = `${base}${pageRoute(pageKey)}?cms=draft`;

  const library =
    config && page ? addableTypes(config, page.kind, allowed) : [];
  // Sections d’add-ons non installés : visibles pour faire découvrir l’add-on, pas ajoutables.
  const lockedAddonSections =
    page && ["content", "custom"].includes(page.kind)
      ? (Object.keys(addonSectionAddons) as (keyof typeof addonSectionAddons)[]).filter((t) => !library.includes(t))
      : [];
  const matching = library.filter((type) => {
    const normalize = (value: string) =>
      value
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase();
    return normalize(
      `${registry[type].label} ${registry[type].description}`,
    ).includes(normalize(libraryQuery.trim()));
  });

  const can = useMemo(() => {
    const free = page && ["content", "custom"].includes(page.kind);
    return {
      reorder: !!free,
      add: !!free && page.sections.length < 40,
      remove: (s: Section) =>
        !!free && !s.required && (isAdmin || s.lock === 1),
      hide: (s: Section) =>
        !!page &&
        !["protected", "legal"].includes(page.kind) &&
        !s.required &&
        s.lock < 3,
      edit: (s: Section, field: string) =>
        s.type !== "system" &&
        (isAdmin ||
          s.lock === 1 ||
          (s.lock === 2 && registry[s.type].partialFields.includes(field))),
    };
  }, [page, isAdmin]);

  useEffect(() => {
    dropHandler.current = async (files, target) => {
      if (mediaLock.current || !configRef.current || !meta) return;
      if (!files.length || files.length > 10) {
        setError("Déposez de 1 à 10 fichiers à la fois.");
        return;
      }
      mediaLock.current = true;
      setMediaBusy(true);
      setError("");
      let inserted = 0;
      if (files.length > 1) target = null;
      try {
        for (const file of files) {
          if (!(file instanceof File)) throw new Error("Fichier invalide.");
          const id = newId(pageKey, "media");
          const kind = file.type.startsWith("image/") ? "image" : "video";
          // Check the destination before uploading; never create an unusable upload knowingly.
          insertDroppedMedia(
            structuredClone(configRef.current!),
            pageKey,
            target,
            { kind, url: "" },
            meta.settings.allowedTypes,
            meta.role === "SUPER_ADMIN",
            id,
          );
          setMediaStatus(
            `${inserted + 1}/${files.length} · Envoi et compression de ${file.name}…`,
          );
          const media = await uploadMedia(fetch, file);
          update((c) => {
            const selectedId = insertDroppedMedia(
              c,
              pageKey,
              target,
              media,
              meta.settings.allowedTypes,
              meta.role === "SUPER_ADMIN",
              id,
            );
            setSelected(selectedId);
          });
          inserted++;
          // A batch forms successive blocks, instead of replacing the same image repeatedly.
          if (files.length > 1) target = null;
          setMediaStatus(
            `${inserted}/${files.length} · ${mediaSize(media.originalSize)} → ${mediaSize(media.size)} · ${mediaSize(media.savedBytes)} économisés`,
          );
        }
        setNotice(
          `${inserted} média(s) optimisé(s) ajouté(s) au brouillon. Pensez aux textes alternatifs, puis enregistrez.`,
        );
      } catch (e) {
        setError(
          `${(e as Error).message}${inserted ? ` ${inserted} média(s) déjà ajouté(s) au brouillon.` : ""}`,
        );
      } finally {
        mediaLock.current = false;
        setMediaBusy(false);
      }
    };
  }, [fetch, meta, pageKey, update]);

  if (!meta || !config || !page)
    return error ? (
      <section className="site-editor-gate" role="alert">
        <span>Édition du site</span>
        <h2>
          {error.includes("Accès refusé")
            ? "Votre profil ne permet pas de modifier le site"
            : "L’éditeur n’a pas pu se charger"}
        </h2>
        <p>{error}</p>
        <div className="actions">
          <button
            type="button"
            onClick={() => {
              setError("");
              loadEditor();
            }}
          >
            Réessayer
          </button>
          <Link href={`/restaurant/${restaurant}`}>
            Retour à l’administration
          </Link>
          <Link href={`/dashboard?restaurant=${restaurant}`}>
            Ouvrir le poste de travail
          </Link>
        </div>
      </section>
    ) : (
      <UtensilsLoader label="Chargement de l’éditeur" fullscreen={false} />
    );

  const setSections = (mutate: (list: Section[]) => Section[], key?: string) =>
    update((c) => {
      c.pages[pageKey].sections = mutate(c.pages[pageKey].sections);
    }, key);
  const setProp = (id: string, field: string, value: unknown) =>
    update((c) => {
      const s = c.pages[pageKey].sections.find((x) => x.id === id);
      if (s) (s.props as Record<string, unknown>)[field] = value;
    }, `${id}.${field}`);
  const move = (from: number, to: number) =>
    setSections((list) => {
      const next = [...list];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  const addSection = (type: SectionType) => {
    const create = registry[type].create;
    if (!can.add || !library.includes(type) || !create) return;
    const s = {
      id: newId(pageKey, type),
      type,
      lock: 1,
      visible: true,
      required: false,
      props: create(),
    } as Section;
    const index = page.sections.findIndex((x) => x.id === selected);
    setSections((list) => {
      const next = [...list];
      next.splice(index >= 0 ? index + 1 : next.length, 0, s);
      return next;
    });
    setSelected(s.id);
    setTab("sections");
    setPanels("right");
    setNotice(
      `Section « ${registry[type].label} » ajoutée. Pensez à enregistrer.`,
    );
  };
  const pageGroups = (
    ["content", "custom", "partial", "legal", "protected"] as const
  ).map((kind) => ({
    kind,
    pages: Object.entries(config.pages).filter(([, p]) => p.kind === kind),
  }));
  const status = dirty
    ? { label: "Modifications non enregistrées", tone: "pending" }
    : meta.unpublished
      ? {
          label: `Brouillon enregistré ${when(meta.draftSavedAt)} · non publié`,
          tone: "requested",
        }
      : {
          label: meta.published
            ? `Publié · version ${meta.published.number}`
            : "Site d’origine, aucune publication",
          tone: "confirmed",
        };

  const openTab = (next: Tab) => {
    setTab(next);
    setPanels("left");
  };

  if (view === "home")
    return (
      <SiteHome
        dirty={dirty}
        shop={() => setView("shop")}
        edit={() => {
          setReady(false);
          setView("editor");
        }}
      />
    );

  if (view === "shop")
    return (
      <TemplatesPanel
        demo={demo}
        dirty={dirty}
        back={() => setView("home")}
        apply={(template, composition) => {
          commit(applySiteTemplate(config, template, composition));
          setPageKey("home");
          setSelected(null);
          setReady(false);
          setView("editor");
          setNotice(
            `${template.name} appliqué au brouillon. Personnalisez votre site avant de publier.`,
          );
        }}
      />
    );

  return (
    <div
      className={`site-editor panels-${panels}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = mediaBusy ? "none" : "copy";
        }
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files.length) {
          e.preventDefault();
          dropHandler.current(Array.from(e.dataTransfer.files), selected);
        }
      }}
    >
      <div className="studio-editor-heading">
        <div>
          <span className="shop-eyebrow">VOTRE ATELIER DE CRÉATION</span>
          <h1>Personnaliser mon site</h1>
        </div>
        <div className="studio-editor-heading-actions">
          <Button onClick={() => openFlux()}>
            <Wand2 size={16} />
            Créer avec FLUX
          </Button>
          <Button variant="secondary" onClick={() => setView("shop")}>
            <Layers size={16} />
            Boutique de modèles
          </Button>
        </div>
      </div>
      <details className="studio-media-bar" aria-busy={mediaBusy}>
        <summary>
          <Upload size={17} /> Photos et vidéos{" "}
          <span>Glisser-déposer et compression automatique</span>
        </summary>
        <label>
          <Upload size={17} />
          <span>
            {mediaBusy ? "Compression en cours…" : "Importer des médias"}
          </span>
          <input
            type="file"
            multiple
            accept={mediaAccept}
            disabled={mediaBusy}
            onChange={(e) => {
              if (e.target.files)
                dropHandler.current(Array.from(e.target.files), selected);
              e.target.value = "";
            }}
          />
        </label>
        <small>
          Photos : 32 Mo · Vidéos : 100 Mo / 2 min · Seules les versions
          optimisées sont stockées.
        </small>
        {mediaStatus && <p role="status">{mediaStatus}</p>}
      </details>
      <datalist id="site-internal-links">
        {Object.entries(config.pages)
          .filter(
            ([, p]) =>
              p.kind !== "protected" || ["", "compte"].includes(p.slug),
          )
          .map(([key, p]) => (
            <option key={key} value={pageRoute(key)}>
              {p.title}
            </option>
          ))}
        <option value="/commander">Commander</option>
        <option value="/checkout">Panier</option>
        <option value="#specialites">Produits de la page</option>
      </datalist>

      <div
        className="site-quick-actions"
        role="group"
        aria-label="Créer votre site"
      >
        <Button variant="secondary" onClick={() => openTab("pages")}>
          <FileText size={16} /> Gérer les pages
        </Button>
        <Button variant="secondary" onClick={() => openTab("sections")}>
          <Layers size={16} /> Modifier les sections
        </Button>
        <Button variant="secondary" onClick={() => openTab("library")}>
          <Plus size={16} /> Ajouter une section
        </Button>
        <Button variant="ghost" onClick={() => setGuideOpen(true)}>
          <BookOpen size={16} /> Guide de création
        </Button>
      </div>
      {guideOpen && (
        <StudioGuide close={() => setGuideOpen(false)} openTab={openTab} />
      )}
      {/* ── Top bar ── */}
      <header className="site-topbar card">
        <div className="site-topbar-page">
          <button
            className="icon-button site-panel-toggle"
            aria-label="Panneau d’édition"
            aria-expanded={panels === "left"}
            onClick={() => setPanels(panels === "left" ? "none" : "left")}
          >
            <PanelLeft size={18} />
          </button>
          <label>
            <span className="sr-only">Page</span>
            <select
              aria-label="Page à modifier"
              value={pageKey}
              onChange={(e) => {
                setPageKey(e.target.value);
                setSelected(null);
                setReady(false);
              }}
            >
              {pageGroups.map((g) =>
                g.pages.length ? (
                  <optgroup key={g.kind} label={pageKindLabels[g.kind]}>
                    {g.pages.map(([key, p]) => (
                      <option key={key} value={key}>
                        {p.title}
                      </option>
                    ))}
                  </optgroup>
                ) : null,
              )}
            </select>
          </label>
          <span className={`badge ${status.tone}`} role="status">
            {status.label}
          </span>
        </div>
        <div
          className="site-devices"
          role="group"
          aria-label="Taille de l’aperçu"
        >
          {(Object.keys(devices) as Device[]).map((d) => {
            const Icon = devices[d].icon;
            return (
              <button
                key={d}
                className={device === d ? "active" : ""}
                aria-pressed={device === d}
                onClick={() => setDevice(d)}
                title={devices[d].label}
              >
                <Icon size={17} />
                <span className="sr-only">{devices[d].label}</span>
              </button>
            );
          })}
        </div>
        <div className="site-topbar-actions">
          {panels !== "none" && (
            <button
              type="button"
              className="btn ghost site-show-preview"
              onClick={() => setPanels("none")}
            >
              <Eye size={16} /> Voir l’aperçu
            </button>
          )}
          <button
            className="icon-button"
            aria-label="Annuler"
            title="Annuler (Ctrl+Z)"
            disabled={!depth.undo}
            onClick={undo}
          >
            <Undo2 size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Rétablir"
            title="Rétablir (Ctrl+Maj+Z)"
            disabled={!depth.redo}
            onClick={redo}
          >
            <Redo2 size={18} />
          </button>
          <a
            className="btn ghost"
            href={saved?.pages[pageKey] ? previewSrc : undefined}
            aria-disabled={!saved?.pages[pageKey]}
            target="_blank"
            rel="noreferrer"
            title={
              !saved?.pages[pageKey]
                ? "Enregistrez cette page pour l’ouvrir dans un autre onglet"
                : dirty
                  ? "Aperçu du dernier brouillon enregistré"
                  : "Aperçu du brouillon"
            }
          >
            <ExternalLink size={16} /> Prévisualiser
          </a>
          <Button
            variant="secondary"
            disabled={busy || !dirty}
            onClick={() => void save()}
          >
            Enregistrer
          </Button>
          <Button
            disabled={busy || (!dirty && !meta.unpublished)}
            onClick={() => setPublishing(true)}
          >
            Publier
          </Button>
          <button
            className="icon-button site-panel-toggle"
            aria-label="Propriétés"
            aria-expanded={panels === "right"}
            onClick={() => setPanels(panels === "right" ? "none" : "right")}
          >
            <SlidersHorizontal size={18} />
          </button>
        </div>
      </header>
      {error && (
        <div className="error" role="alert">
          {error}
          <button aria-label="Fermer l’erreur" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      {notice && !error && (
        <div className="success" role="status">
          {notice}
          <button aria-label="Fermer" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}

      <div className="site-workarea">
        {/* ── Left panel ── */}
        <aside className="site-left card" aria-label="Panneau d’édition">
          <div className="site-tabs" role="tablist">
            {(
              [
                ["sections", "Sections", Layers],
                ["library", "Ajouter", Plus],
                ["pages", "Pages", FileText],
                ["brand", "Identité", Palette],
                ["theme", "Couleurs & polices", Palette],
                ["seo", "Référencement", Search],
                ["history", "Historique", History],
                ...(isAdmin ? [["admin", "Réglages", Settings2]] : []),
              ] as [Tab, string, typeof Layers][]
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                className={tab === id ? "active" : ""}
                onClick={() => setTab(id)}
              >
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>
          <div className="site-left-body">
            {tab === "sections" && (
              <>
                <p className="muted">
                  {page.kind === "content" || page.kind === "custom"
                    ? "Cliquez sur une section dans l’aperçu ou ici. Glissez ou utilisez les flèches pour la déplacer."
                    : page.kind === "partial"
                      ? "Page partiellement personnalisable : textes modifiables, structure et données commerciales protégées."
                      : page.kind === "legal"
                        ? "Page légale : vous pouvez compléter les informations, pas supprimer le texte obligatoire."
                        : "Page protégée (commande, paiement ou compte) : seuls les couleurs et polices s’y appliquent."}
                </p>
                <ol className="site-section-list">
                  {page.sections.map((s, i) => (
                    <li
                      key={s.id}
                      className={`${selected === s.id ? "selected" : ""} ${s.visible ? "" : "is-hidden"}`}
                      draggable={can.reorder}
                      onDragStart={(e) =>
                        e.dataTransfer.setData(
                          "application/x-atacuisine-section",
                          s.id,
                        )
                      }
                      onDragOver={(e) => can.reorder && e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const id = e.dataTransfer.getData(
                          "application/x-atacuisine-section",
                        );
                        const from = page.sections.findIndex(
                          (item) => item.id === id,
                        );
                        if (can.reorder && from >= 0 && from !== i)
                          move(from, i);
                      }}
                    >
                      {can.reorder && (
                        <GripVertical
                          size={15}
                          className="site-grip"
                          aria-hidden="true"
                        />
                      )}
                      <button
                        className="site-section-name"
                        onClick={() => {
                          setSelected(s.id);
                          setPanels("right");
                        }}
                      >
                        {sectionLabel(s)}
                        {s.lock > 1 && (
                          <span
                            title={
                              s.lock === 3
                                ? "Protégée"
                                : "Partiellement verrouillée"
                            }
                          >
                            <Lock size={12} />
                          </span>
                        )}
                      </button>
                      <span className="site-row-actions">
                        {can.reorder && (
                          <>
                            <button
                              aria-label={`Monter ${sectionLabel(s)}`}
                              disabled={i === 0}
                              onClick={() => move(i, i - 1)}
                            >
                              <ArrowUp size={15} />
                            </button>
                            <button
                              aria-label={`Descendre ${sectionLabel(s)}`}
                              disabled={i === page.sections.length - 1}
                              onClick={() => move(i, i + 1)}
                            >
                              <ArrowDown size={15} />
                            </button>
                          </>
                        )}
                        {can.hide(s) && (
                          <button
                            aria-label={
                              s.visible
                                ? `Masquer ${sectionLabel(s)}`
                                : `Afficher ${sectionLabel(s)}`
                            }
                            onClick={() =>
                              setSections((list) =>
                                list.map((x) =>
                                  x.id === s.id
                                    ? { ...x, visible: !x.visible }
                                    : x,
                                ),
                              )
                            }
                          >
                            {s.visible ? (
                              <Eye size={15} />
                            ) : (
                              <EyeOff size={15} />
                            )}
                          </button>
                        )}
                        {can.remove(s) && (
                          <button
                            aria-label={`Supprimer ${sectionLabel(s)}`}
                            onClick={() => {
                              if (
                                confirm(
                                  `Supprimer la section « ${sectionLabel(s)} » ? Utilisez Annuler pour la récupérer.`,
                                )
                              ) {
                                setSections((list) =>
                                  list.filter((x) => x.id !== s.id),
                                );
                                setSelected(null);
                              }
                            }}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
                {!page.sections.length && (
                  <p className="empty">
                    Cette page n’a pas de section modifiable.
                  </p>
                )}
              </>
            )}

            {tab === "library" &&
              (can.add ? (
                <div className="site-library">
                  <p className="muted">
                    La section est ajoutée après la section sélectionnée.
                  </p>
                  <label className="site-field">
                    Rechercher un bloc
                    <input
                      type="search"
                      value={libraryQuery}
                      onChange={(e) => setLibraryQuery(e.target.value)}
                      placeholder="Texte, bannière, catégories…"
                    />
                  </label>
                  {!matching.length && (
                    <p className="muted">
                      {library.length
                        ? "Aucun bloc ne correspond à cette recherche."
                        : "Aucun bloc n’est autorisé dans les réglages du site."}
                    </p>
                  )}
                  {matching.map((t) => (
                    <button key={t} onClick={() => addSection(t)}>
                      <b>
                        {registry[t].label}
                        {isAddonSection(t) && <span className="site-addon-badge">Add-on</span>}
                      </b>
                      <small>{registry[t].description}</small>
                      <Plus size={16} />
                    </button>
                  ))}
                  {lockedAddonSections.length > 0 && (
                    <div className="site-library-locked" aria-label="Sections d’add-ons à installer">
                      <p className="muted">Avec un add-on de la boutique :</p>
                      {lockedAddonSections.map((t) => (
                        <Link key={t} href={`/dashboard?restaurant=${encodeURIComponent(restaurant)}&module=addons`} className="site-library-locked-item">
                          <b>{registry[t].label}<span className="site-addon-badge">Add-on</span></b>
                          <small>Installez « {addonNames[addonSectionAddons[t]]} » pour ajouter cette section.</small>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="muted">
                  {can.reorder
                    ? "Cette page contient déjà 40 sections. Supprimez-en une pour ajouter un bloc."
                    : `La structure de cette page est fixe (${pageKindLabels[page.kind].toLowerCase()}).`}
                </p>
              ))}

            {tab === "pages" && (
              <div className="site-pages">
                <Button variant="secondary" onClick={() => setCreating(true)}>
                  <Plus size={16} /> Créer une page
                </Button>
                {page.kind === "custom" && (
                  <label className="site-field">
                    Titre de la page sélectionnée
                    <input
                      maxLength={80}
                      value={page.title}
                      onChange={(e) =>
                        update((c) => {
                          c.pages[pageKey].title = e.target.value;
                        }, `page.${pageKey}.title`)
                      }
                    />
                    <small>
                      Adresse : {pageRoute(pageKey)} ·{" "}
                      {page.visible ? "Visible après publication" : "Masquée"}
                    </small>
                  </label>
                )}
                {pageGroups.map((g) =>
                  g.pages.length ? (
                    <section key={g.kind}>
                      <h4>{pageKindLabels[g.kind]}</h4>
                      {g.pages.map(([key, p]) => (
                        <div
                          key={key}
                          className={`site-page-row ${key === pageKey ? "selected" : ""}`}
                        >
                          <button
                            onClick={() => {
                              setPageKey(key);
                              setSelected(null);
                              if (key !== pageKey) setReady(false);
                              setTab("sections");
                            }}
                          >
                            {p.title}
                            <small>
                              {pageRoute(key)}
                              {p.kind === "custom" && !p.visible
                                ? " · masquée"
                                : ""}
                            </small>
                          </button>
                          {p.kind === "custom" && (
                            <span className="site-row-actions">
                              <button
                                aria-label={
                                  p.visible
                                    ? `Masquer ${p.title}`
                                    : `Rendre visible ${p.title}`
                                }
                                onClick={() =>
                                  update((c) => {
                                    c.pages[key].visible =
                                      !c.pages[key].visible;
                                  })
                                }
                              >
                                {p.visible ? (
                                  <Eye size={15} />
                                ) : (
                                  <EyeOff size={15} />
                                )}
                              </button>
                              <button
                                aria-label={`Supprimer ${p.title}`}
                                onClick={() => {
                                  if (
                                    confirm(
                                      `Supprimer la page « ${p.title} » ? Elle disparaîtra du site à la prochaine publication.`,
                                    )
                                  ) {
                                    update((c) => {
                                      delete c.pages[key];
                                    });
                                    if (pageKey === key) setPageKey("home");
                                  }
                                }}
                              >
                                <Trash2 size={15} />
                              </button>
                            </span>
                          )}
                        </div>
                      ))}
                    </section>
                  ) : null,
                )}
              </div>
            )}

            {tab === "brand" && (
              <BrandPanel
                config={config}
                update={update}
                context={meta.context}
                siteAddons={meta.siteAddons ?? emptySiteAddons}
                storeHref={`/dashboard?restaurant=${encodeURIComponent(restaurant)}&module=addons`}
              />
            )}
            {tab === "theme" && (
              <ThemePanel
                config={config}
                defaults={meta.defaults}
                update={update}
              />
            )}
            {tab === "seo" && (
              <SeoPanel
                config={config}
                pageKey={pageKey}
                update={update}
                context={meta.context}
              />
            )}
            {tab === "history" && (
              <HistoryPanel
                pageKey={pageKey}
                dirty={dirty}
                restore={async (v) => {
                  if (activeWrite.current) return;
                  activeWrite.current = true;
                  setError("");
                  setBusy(true);
                  try {
                    await post({ op: "restore", id: v.id });
                    const fresh = await loadMeta();
                    configRef.current = fresh.config;
                    setConfigState(fresh.config);
                    setSaved(fresh.config);
                    past.current = [];
                    future.current = [];
                    setDepth({ undo: 0, redo: 0 });
                    setSelected(null);
                    setNotice(
                      `Version ${v.number} restaurée et publiée (l’historique est conservé).`,
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    activeWrite.current = false;
                    setBusy(false);
                  }
                }}
                published={meta.published?.number ?? null}
              />
            )}
            {tab === "admin" && isAdmin && (
              <AdminPanel
                settings={meta.settings}
                save={async (s) => {
                  try {
                    await post({ op: "settings", ...s });
                    await loadMeta();
                    setNotice("Réglages du CMS enregistrés.");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              />
            )}
          </div>
        </aside>

        {/* ── Preview ── */}
        <div className="site-stage" ref={stage}>
          <div
            className="site-frame-wrap"
            style={{ width: width * scale, height: stageSize.height - 8 }}
          >
            <iframe
              key={pageKey}
              ref={frame}
              src={previewPage ? `${base}/?cms=draft` : previewSrc}
              title={`Aperçu : ${page.title}`}
              style={{
                width,
                height: (stageSize.height - 8) / scale,
                transform: `scale(${scale})`,
              }}
            />
          </div>
          {dirty && (
            <p className="site-stage-note">
              Aperçu en direct de vos modifications · non enregistrées
            </p>
          )}
        </div>

        {/* ── Properties ── */}
        <aside className="site-right card" aria-label="Propriétés">
          {section ? (
            <SectionProperties
              key={section.id}
              section={section}
              page={pageKey}
              config={config}
              isAdmin={isAdmin}
              canEdit={(f) => can.edit(section, f)}
              setProp={(f, v) => setProp(section.id, f, v)}
              setMeta={(patch) =>
                setSections((list) =>
                  list.map((x) =>
                    x.id === section.id ? ({ ...x, ...patch } as Section) : x,
                  ),
                )
              }
              update={update}
              liveDataHref={liveDataHref}
              close={() => {
                setSelected(null);
                setPanels("left");
              }}
            />
          ) : (
            <div className="site-empty-props">
              <SlidersHorizontal size={22} />
              <p>
                Sélectionnez une section dans l’aperçu ou dans la liste pour la
                modifier.
              </p>
            </div>
          )}
        </aside>
      </div>

      {publishing && (
        <PublishDialog
          busy={busy}
          dirty={dirty}
          error={error}
          close={() => {
            if (!busy) setPublishing(false);
          }}
          publish={(summary) => void publish(summary)}
        />
      )}
      {creating && (
        <CreatePageDialog
          config={config}
          close={() => setCreating(false)}
          create={(title, slug, description) => {
            update((c) => {
              c.pages[slug] = {
                kind: "custom",
                title,
                slug,
                visible: false,
                seo: { title: "", description, ogImage: "" },
                sections: allowed.includes("textBlock")
                  ? [
                      {
                        id: newId(slug, "textBlock"),
                        type: "textBlock",
                        lock: 1,
                        visible: true,
                        required: false,
                        props: {
                          kicker: "",
                          title,
                          body:
                            description ||
                            "Présentez ici le contenu de la page.",
                          align: "left",
                        },
                      },
                    ]
                  : [],
              };
            });
            setCreating(false);
            setPageKey(slug);
            setSelected(null);
            setReady(false);
            openTab("sections");
            setNotice(
              `Page « ${title} » créée. Dans Pages, rendez-la visible avant de publier.`,
            );
          }}
        />
      )}
    </div>
  );
}

/* ───────────────────────── Panels ───────────────────────── */

type Update = (mutate: (c: SiteConfig) => void, key?: string) => void;

function SectionProperties({
  section,
  page,
  config,
  isAdmin,
  canEdit,
  setProp,
  setMeta,
  update,
  liveDataHref,
  close,
}: {
  section: Section;
  page: string;
  config: SiteConfig;
  isAdmin: boolean;
  canEdit: (field: string) => boolean;
  setProp: (field: string, value: unknown) => void;
  setMeta: (patch: Partial<Section>) => void;
  update: Update;
  liveDataHref: (module: string) => string;
  close: () => void;
}) {
  const def = section.type === "system" ? null : registry[section.type];
  return (
    <div className="site-props">
      <div className="site-props-head">
        <div>
          <span className="eyebrow">{config.pages[page].title}</span>
          <h3>{sectionLabel(section)}</h3>
        </div>
        <button
          className="icon-button"
          aria-label="Fermer les propriétés"
          onClick={close}
        >
          ×
        </button>
      </div>
      {section.lock > 1 && (
        <p className="site-lock-note">
          <Lock size={14} />
          {section.lock === 3
            ? "Bloc protégé : son fonctionnement (commande, paiement, compte ou formulaire) ne peut pas être modifié depuis le CMS."
            : "Section partiellement verrouillée : seuls les champs actifs sont modifiables."}
        </p>
      )}
      {section.type === "system" && (
        <p className="muted">
          {systemBlockLabels[section.props.block]} · géré par Donuts OS.
        </p>
      )}
      {def?.liveData && (
        <p className="site-live-note">
          {def.liveData.label} : informations à jour du CRM.{" "}
          <a
            href={liveDataHref(def.liveData.module)}
            target="_blank"
            rel="noreferrer"
          >
            Ouvrir les réglages (nouvel onglet) ↗
          </a>
        </p>
      )}
      {section.type === "legal" && (
        <LegalIdentityFields config={config} update={update} />
      )}
      {def?.fields.map((f) => (
        <Field
          key={f.key}
          def={f}
          value={(section.props as Record<string, unknown>)[f.key]}
          disabled={!canEdit(f.key)}
          onChange={(v) => setProp(f.key, v)}
        />
      ))}
      {isAdmin && section.type !== "system" && (
        <fieldset className="site-group">
          <legend>Super-administrateur</legend>
          <label className="site-field">
            Niveau de verrouillage
            <select
              value={section.lock}
              onChange={(e) =>
                setMeta({ lock: Number(e.target.value) as 1 | 2 | 3 })
              }
            >
              <option value={1}>1 · Libre</option>
              <option value={2}>2 · Partiellement verrouillé</option>
              <option value={3}>3 · Protégé</option>
            </select>
          </label>
          <label className="site-check">
            <input
              type="checkbox"
              checked={section.required}
              onChange={(e) => setMeta({ required: e.target.checked })}
            />
            Section obligatoire (non supprimable)
          </label>
        </fieldset>
      )}
    </div>
  );
}

function LegalIdentityFields({
  config,
  update,
}: {
  config: SiteConfig;
  update: Update;
}) {
  const fields: [keyof SiteConfig["legal"], string][] = [
    ["operator", "Raison sociale de l’exploitant"],
    ["legalForm", "Forme juridique et capital social"],
    ["siret", "SIREN / SIRET"],
    ["rcs", "RCS"],
    ["vat", "Numéro de TVA intracommunautaire"],
    ["email", "E-mail professionnel"],
    ["publicationDirector", "Directeur de la publication"],
    ["host", "Hébergeur (nom, adresse, téléphone)"],
    ["mediator", "Médiateur de la consommation"],
  ];
  return (
    <fieldset className="site-group">
      <legend>Informations légales (communes aux pages légales)</legend>
      <p className="muted">
        Tant qu’une mention est vide, l’avertissement reste affiché. La
        conformité des textes reste à faire valider.
      </p>
      {fields.map(([key, label]) => (
        <label className="site-field" key={key}>
          {label}
          <input
            value={config.legal[key]}
            onChange={(e) =>
              update((c) => {
                c.legal[key] = e.target.value;
              }, `legal.${key}`)
            }
          />
        </label>
      ))}
    </fieldset>
  );
}

function BrandPanel({
  config,
  update,
  context,
  siteAddons,
  storeHref,
}: {
  config: SiteConfig;
  update: Update;
  context: PlaceholderContext;
  siteAddons: SiteAddonData;
  storeHref: string;
}) {
  const b = config.branding;
  const text = (
    label: string,
    value: string,
    set: (c: SiteConfig, v: string) => void,
    key: string,
    multiline = false,
  ) => (
    <label className="site-field">
      {label}
      {multiline ? (
        <textarea
          rows={2}
          value={value}
          onChange={(e) => update((c) => set(c, e.target.value), key)}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => update((c) => set(c, e.target.value), key)}
        />
      )}
    </label>
  );
  return (
    <div className="site-form">
      <SiteAddonIdentity config={config} update={update} addons={siteAddons} storeHref={storeHref} />
      <h4>Établissement</h4>
      {text(
        "Nom public",
        b.publicName,
        (c, v) => (c.branding.publicName = v),
        "b.name",
      )}
      {text(
        "Nom dans l’en-tête (Entrée = retour à la ligne)",
        b.brandLines,
        (c, v) => (c.branding.brandLines = v),
        "b.lines",
        true,
      )}
      <ImageField
        label="Logo"
        value={b.logo}
        disabled={false}
        onChange={(v) =>
          update((c) => {
            c.branding.logo = v as typeof b.logo;
          }, "b.logo")
        }
      />
      {text(
        "Description courte",
        b.description,
        (c, v) => (c.branding.description = v),
        "b.desc",
        true,
      )}
      {text(
        "E-mail de contact public",
        b.email,
        (c, v) => (c.branding.email = v),
        "b.email",
      )}
      <h4>Bandeau du haut</h4>
      {text(
        "Message",
        b.announcement,
        (c, v) => (c.branding.announcement = v),
        "b.ann",
      )}
      {text(
        "Mention mise en avant",
        b.announcementHighlight,
        (c, v) => (c.branding.announcementHighlight = v),
        "b.hl",
      )}
      <h4>Menu</h4>
      {text(
        "Lien « carte »",
        config.header.navMenu,
        (c, v) => (c.header.navMenu = v),
        "h.menu",
      )}
      {text(
        "Lien « univers »",
        config.header.navUniverse,
        (c, v) => (c.header.navUniverse = v),
        "h.uni",
      )}
      {text(
        "Lien « contact »",
        config.header.navContact,
        (c, v) => (c.header.navContact = v),
        "h.contact",
      )}
      {text(
        "Lien « compte »",
        config.header.navAccount,
        (c, v) => (c.header.navAccount = v),
        "h.account",
      )}
      {text(
        "Bouton de commande",
        config.header.orderLabel,
        (c, v) => (c.header.orderLabel = v),
        "h.order",
      )}
      <h4>Pied de page</h4>
      {text(
        "Accroche",
        config.footer.tagline,
        (c, v) => (c.footer.tagline = v),
        "f.tag",
        true,
      )}
      {text(
        "Lien vers la commande",
        config.footer.cta,
        (c, v) => (c.footer.cta = v),
        "f.cta",
      )}
      {text(
        "Mention",
        config.footer.credit,
        (c, v) => (c.footer.credit = v),
        "f.credit",
      )}
      {text(
        "Avertissement",
        config.footer.notice,
        (c, v) => (c.footer.notice = v),
        "f.notice",
        true,
      )}
      <details className="site-placeholders">
        <summary>Informations automatiques utilisables dans les textes</summary>
        <p className="muted">
          Copiez une étiquette dans un texte : elle sera remplacée par la valeur
          à jour.
        </p>
        <dl>
          {placeholderKeys.map((k) => (
            <div key={k}>
              <dt>
                <code>{`{{restaurant.${k}}}`}</code>
              </dt>
              <dd>{context[k] || "—"}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}

const colorLabels: [keyof SiteConfig["theme"]["colors"], string][] = [
  ["primary", "Couleur principale (mots mis en avant)"],
  ["primaryDark", "Couleur principale foncée"],
  ["secondary", "Couleur secondaire"],
  ["accent", "Couleur d’accentuation (bandeau)"],
  ["text", "Texte"],
  ["muted", "Texte secondaire"],
  ["background", "Arrière-plan"],
  ["buttonBg", "Fond des boutons"],
  ["buttonText", "Texte des boutons"],
  ["link", "Liens"],
];
function ThemePanel({
  config,
  defaults,
  update,
}: {
  config: SiteConfig;
  defaults: SiteConfig;
  update: Update;
}) {
  const t = config.theme;
  const checks = contrastChecks(t);
  return (
    <div className="site-form">
      <PresentationFields
        value={t.presentation}
        change={(value) =>
          update((c) => {
            c.theme.presentation = value;
          })
        }
      />
      <h4>Couleurs</h4>
      {colorLabels.map(([key, label]) => (
        <label className="site-color" key={key}>
          <input
            type="color"
            value={t.colors[key]}
            onChange={(e) =>
              update((c) => {
                c.theme.colors[key] = e.target.value;
              }, `color.${key}`)
            }
          />
          <span>{label}</span>
          <input
            aria-label={`${label} (hexadécimal)`}
            value={t.colors[key]}
            maxLength={7}
            onChange={(e) =>
              /^#[0-9a-fA-F]{6}$/.test(e.target.value) &&
              update((c) => {
                c.theme.colors[key] = e.target.value.toLowerCase();
              }, `color.${key}`)
            }
          />
        </label>
      ))}
      <ul className="site-contrast" aria-label="Lisibilité">
        {checks.map((c) => (
          <li
            key={c.id}
            className={c.ratio < 3 ? "bad" : c.ratio < 4.5 ? "warn" : "ok"}
          >
            <b>{c.ratio.toFixed(1)}:1</b> {c.label}
            {c.ratio < 3
              ? " · illisible, publication refusée"
              : c.ratio < 4.5
                ? " · lisibilité limitée"
                : ""}
          </li>
        ))}
      </ul>
      <Button
        variant="ghost"
        onClick={() =>
          update((c) => {
            c.theme.colors = structuredClone(defaults.theme.colors);
          })
        }
      >
        Restaurer les couleurs d’origine
      </Button>
      <h4>Typographies</h4>
      {(["heading", "body", "button"] as const).map((k) => (
        <label className="site-field" key={k}>
          {k === "heading"
            ? "Police des titres"
            : k === "body"
              ? "Police des paragraphes"
              : "Police des boutons"}
          <select
            value={t.fonts[k]}
            onChange={(e) =>
              update((c) => {
                c.theme.fonts[k] = e.target.value as typeof t.fonts.heading;
              })
            }
          >
            {fontIds.map((id) => (
              <option key={id} value={id}>
                {fonts[id].label}
              </option>
            ))}
          </select>
          <span
            className="site-font-sample"
            style={{ fontFamily: fonts[t.fonts[k]].stack }}
          >
            Le bonheur à un très bon goût.
          </span>
        </label>
      ))}
      <label className="site-field">
        Taille des titres ({Math.round(t.headingScale * 100)} %)
        <input
          type="range"
          min={0.7}
          max={1.3}
          step={0.05}
          value={t.headingScale}
          onChange={(e) =>
            update((c) => {
              c.theme.headingScale = Number(e.target.value);
            }, "scale.h1")
          }
        />
      </label>
      <label className="site-field">
        Taille des sous-titres ({Math.round(t.subheadingScale * 100)} %)
        <input
          type="range"
          min={0.7}
          max={1.3}
          step={0.05}
          value={t.subheadingScale}
          onChange={(e) =>
            update((c) => {
              c.theme.subheadingScale = Number(e.target.value);
            }, "scale.h2")
          }
        />
      </label>
      <label className="site-field">
        Épaisseur des titres
        <select
          value={t.headingWeight}
          onChange={(e) =>
            update((c) => {
              c.theme.headingWeight = Number(e.target.value) as 900;
            })
          }
        >
          <option value={600}>Semi-gras</option>
          <option value={700}>Gras</option>
          <option value={800}>Très gras</option>
          <option value={900}>Extra-gras (actuelle)</option>
        </select>
      </label>
      <label className="site-field">
        Espacement des lettres des titres
        <select
          value={t.letterSpacing}
          onChange={(e) =>
            update((c) => {
              c.theme.letterSpacing = e.target.value as "tight";
            })
          }
        >
          <option value="tight">Serré (actuel)</option>
          <option value="normal">Normal</option>
          <option value="wide">Aéré</option>
        </select>
      </label>
      <Button
        variant="ghost"
        onClick={() =>
          update((c) => {
            const colors = c.theme.colors;
            c.theme = { ...structuredClone(defaults.theme), colors, presentation: c.theme.presentation };
          })
        }
      >
        Restaurer les polices d’origine
      </Button>
    </div>
  );
}

function SeoPanel({
  config,
  pageKey,
  update,
  context,
}: {
  config: SiteConfig;
  pageKey: string;
  update: Update;
  context: PlaceholderContext;
}) {
  const page = config.pages[pageKey];
  const title = plain(
    page.seo.title ||
      (pageKey === "home"
        ? config.seo.title
        : `${page.title} · ${config.seo.shareName}`),
    context,
  );
  const description = plain(
    page.seo.description || config.seo.description,
    context,
  );
  const image =
    page.seo.ogImage || config.seo.ogImage || config.branding.logo.src;
  const counter = (value: string, max: number) => (
    <small
      className={value.length > max ? "site-field-error" : "site-field-help"}
    >
      {value.length} / {max} caractères
    </small>
  );
  return (
    <div className="site-form">
      <h4>Aperçu dans un moteur de recherche</h4>
      <div className="site-serp">
        <small>votre-domaine.fr{pageRoute(pageKey)}</small>
        <b>{title}</b>
        <p>{description}</p>
      </div>
      <h4>Aperçu d’un partage</h4>
      <div className="site-share">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" />
        <div>
          <small>{plain(config.seo.shareName, context)}</small>
          <b>{title}</b>
        </div>
      </div>
      <p className="muted">
        Ces réglages aident les moteurs de recherche à présenter le site ; ils
        ne garantissent aucun positionnement. Les aperçus et les pages privées
        restent exclus de l’indexation ; la publication et la configuration
        d’hébergement déterminent l’ouverture publique.
      </p>
      <h4>Page « {page.title} »</h4>
      <label className="site-field">
        Titre de la page (vide = automatique)
        <input
          value={page.seo.title}
          maxLength={70}
          onChange={(e) =>
            update((c) => {
              c.pages[pageKey].seo.title = e.target.value;
            }, `seo.${pageKey}.t`)
          }
        />
        {counter(page.seo.title, 60)}
      </label>
      <label className="site-field">
        Description de la page (vide = description du site)
        <textarea
          rows={3}
          maxLength={170}
          value={page.seo.description}
          onChange={(e) =>
            update((c) => {
              c.pages[pageKey].seo.description = e.target.value;
            }, `seo.${pageKey}.d`)
          }
        />
        {counter(page.seo.description, 160)}
      </label>
      <h4>Tout le site</h4>
      <label className="site-field">
        <span>Indexation du site publié</span>
        <input
          type="checkbox"
          checked={config.seo.noIndex === false}
          onChange={(e) =>
            update((c) => {
              c.seo.noIndex = !e.target.checked;
            }, "seo.index")
          }
        />
        Autoriser les moteurs de recherche à indexer le site publié
      </label>
      <label className="site-field">
        <input
          type="checkbox"
          checked={page.seo.noIndex === true}
          onChange={(e) =>
            update((c) => {
              c.pages[pageKey].seo.noIndex = e.target.checked;
            }, `seo.${pageKey}.index`)
          }
        />
        Exclure cette page de l’indexation
      </label>
      <label className="site-field">
        Titre de l’accueil
        <input
          value={config.seo.title}
          maxLength={70}
          onChange={(e) =>
            update((c) => {
              c.seo.title = e.target.value;
            }, "seo.t")
          }
        />
        {counter(config.seo.title, 60)}
      </label>
      <label className="site-field">
        Description du site
        <textarea
          rows={3}
          maxLength={170}
          value={config.seo.description}
          onChange={(e) =>
            update((c) => {
              c.seo.description = e.target.value;
            }, "seo.d")
          }
        />
        {counter(config.seo.description, 160)}
      </label>
      <label className="site-field">
        Nom affiché lors d’un partage
        <input
          value={config.seo.shareName}
          onChange={(e) =>
            update((c) => {
              c.seo.shareName = e.target.value;
            }, "seo.n")
          }
        />
      </label>
      <ImageField
        label="Image de partage (Open Graph)"
        value={{ src: config.seo.ogImage, alt: "Image de partage" }}
        disabled={false}
        onChange={(v) =>
          update((c) => {
            c.seo.ogImage = (v as { src: string }).src;
          })
        }
      />
      <ImageField
        label="Icône du site (favicon)"
        value={{ src: config.seo.favicon, alt: "Icône du site" }}
        disabled={false}
        onChange={(v) =>
          update((c) => {
            c.seo.favicon = (v as { src: string }).src;
          })
        }
      />
      <SeoIdentityFields config={config} update={update} />
    </div>
  );
}

function HistoryPanel({
  pageKey,
  dirty,
  restore,
  published,
}: {
  pageKey: string;
  dirty: boolean;
  restore: (v: Version) => Promise<void>;
  published: number | null;
}) {
  const { request: fetch, base } = useTenantSite();
  const [list, setList] = useState<Version[] | null>(null),
    [confirming, setConfirming] = useState<Version | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/v1/site?view=versions")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setList(d);
      })
      .catch((e) => setError(e.message));
  }, [published, fetch]);
  if (error) return <p className="error">{error}</p>;
  if (!list) return <p className="muted">Chargement…</p>;
  return (
    <div className="site-history">
      <p className="muted">
        Chaque publication crée une version. Restaurer publie une nouvelle
        version identique à l’ancienne, sans effacer l’historique.
      </p>
      {!list.length && (
        <p className="empty">
          Aucune publication pour l’instant : le site affiche son contenu
          d’origine.
        </p>
      )}
      {list.map((v) => (
        <article key={v.id} className={v.current ? "current" : ""}>
          <div>
            <b>Version {v.number}</b>{" "}
            {v.current && <span className="badge confirmed">En ligne</span>}
            <small>
              {when(v.published_at)} · {v.published_by ?? "—"}
            </small>
            {v.summary && <p>{v.summary}</p>}
          </div>
          <span className="site-row-actions">
            <a
              className="text-button"
              href={`${base}${pageRoute(pageKey)}?cms=version:${v.id}`}
              target="_blank"
              rel="noreferrer"
            >
              Aperçu
            </a>
            {!v.current && (
              <button className="text-button" onClick={() => setConfirming(v)}>
                Restaurer
              </button>
            )}
          </span>
        </article>
      ))}
      {confirming && (
        <Modal
          title={`Restaurer la version ${confirming.number} ?`}
          description="Elle sera publiée immédiatement comme nouvelle version."
          close={() => setConfirming(null)}
        >
          {dirty && (
            <p className="error">
              Vos modifications non enregistrées seront remplacées.
            </p>
          )}
          <div className="actions">
            <Button
              onClick={() => {
                void restore(confirming);
                setConfirming(null);
              }}
            >
              Restaurer et publier
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Annuler
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function AdminPanel({
  settings,
  save,
}: {
  settings: CmsSettings;
  save: (s: CmsSettings) => Promise<void>;
}) {
  const [keep, setKeep] = useState(settings.keepVersions),
    [types, setTypes] = useState<SectionType[]>(settings.allowedTypes);
  const addable = (Object.keys(registry) as SectionType[]).filter(
    (t) => registry[t].addable,
  );
  return (
    <div className="site-form">
      <h4>Composants autorisés</h4>
      <p className="muted">
        Sections que l’administrateur peut ajouter depuis la bibliothèque.
      </p>
      {addable.map((t) => (
        <label className="site-check" key={t}>
          <input
            type="checkbox"
            checked={types.includes(t)}
            onChange={(e) =>
              setTypes(
                e.target.checked ? [...types, t] : types.filter((x) => x !== t),
              )
            }
          />
          {registry[t].label}
        </label>
      ))}
      <label className="site-field">
        Versions publiées conservées
        <input
          type="number"
          min={3}
          max={200}
          value={keep}
          onChange={(e) => setKeep(Number(e.target.value))}
        />
      </label>
      <p className="muted">
        Les niveaux de verrouillage se règlent section par section dans le
        panneau de propriétés.
      </p>
      <Button
        onClick={() => void save({ keepVersions: keep, allowedTypes: types })}
      >
        Enregistrer les réglages
      </Button>
    </div>
  );
}

function PublishDialog({
  busy,
  dirty,
  error,
  close,
  publish,
}: {
  busy: boolean;
  dirty: boolean;
  error: string;
  close: () => void;
  publish: (summary: string) => void;
}) {
  const [summary, setSummary] = useState("");
  return (
    <Modal
      title="Publier sur le site"
      description="Les visiteurs verront ces modifications immédiatement. Une nouvelle version sera ajoutée à l’historique."
      close={close}
    >
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {dirty && (
        <p className="muted">
          Vos dernières modifications seront d’abord enregistrées.
        </p>
      )}
      <label className="site-field">
        Résumé des changements (facultatif)
        <textarea
          rows={3}
          maxLength={300}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Ex. : nouveau titre d’accueil et photo d’été"
        />
      </label>
      <div className="actions">
        <Button disabled={busy} onClick={() => publish(summary)}>
          {busy ? "Publication…" : "Confirmer la publication"}
        </Button>
        <Button variant="ghost" onClick={close}>
          Annuler
        </Button>
      </div>
    </Modal>
  );
}

function CreatePageDialog({
  config,
  close,
  create,
}: {
  config: SiteConfig;
  close: () => void;
  create: (title: string, slug: string, description: string) => void;
}) {
  const [title, setTitle] = useState(""),
    [slug, setSlug] = useState(""),
    [touched, setTouched] = useState(false),
    [description, setDescription] = useState("");
  const effective = touched ? slug : slugify(title);
  const problem = title.trim()
    ? slugError(effective, config)
    : "Donnez un titre à la page.";
  return (
    <Modal
      title="Créer une page"
      description="La page est créée masquée dans le brouillon. Rendez-la visible puis publiez."
      close={close}
    >
      <form
        className="site-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!problem)
            void create(title.trim(), effective, description.trim());
        }}
      >
        <label className="site-field">
          Titre
          <input
            value={title}
            required
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Événements, Notre équipe…"
          />
        </label>
        <label className="site-field">
          Adresse de la page
          <span className="site-slug">
            /
            <input
              value={effective}
              onChange={(e) => {
                setTouched(true);
                setSlug(e.target.value);
              }}
              aria-invalid={!!problem}
            />
          </span>
          {problem && title && (
            <small className="site-field-error">{problem}</small>
          )}
        </label>
        <label className="site-field">
          Description (référencement)
          <textarea
            rows={2}
            maxLength={170}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <div className="actions">
          <Button disabled={!!problem}>Créer la page</Button>
          <Button type="button" variant="ghost" onClick={close}>
            Annuler
          </Button>
        </div>
      </form>
    </Modal>
  );
}
