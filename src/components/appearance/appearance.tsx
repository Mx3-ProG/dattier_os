"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Palette, X, Check, Moon, Sun } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  appearanceCacheKey,
  appearanceSchema,
  defaultAppearance,
  palettes,
  themeVariables,
  type Appearance,
} from "@/features/appearance/theme";
import "./appearance.css";
import {
  activityCategories,
  type ActivityCategory,
} from "@/features/appearance/categories";
import { usePathname } from "next/navigation";

const Context = createContext<{
  open: () => void;
  ready?: boolean;
  mode?: "light" | "dark";
  toggleMode?: () => void;
  style?: CSSProperties;
}>({
  open: () => {},
});
export const useAppearanceStyle = () => useContext(Context).style;
export function AppearanceButton() {
  const { open, ready, mode, toggleMode } = useContext(Context);
  return (
    <div className="appearance-controls">
      <button
        type="button"
        className="appearance-trigger"
        disabled={!ready}
        onClick={open}
      >
        <Palette size={16} />
        Personnaliser mon espace
      </button>
      <button
        type="button"
        className="appearance-mode-toggle"
        disabled={!ready}
        onClick={toggleMode}
        aria-label={
          mode === "dark" ? "Passer en mode jour" : "Passer en mode nuit"
        }
      >
        {mode === "dark" ? <Sun size={17} /> : <Moon size={17} />}
      </button>
    </div>
  );
}
/** Shells share the application provider, including during loading/navigation. */
export function AppearanceScope({
  className,
  children,
}: {
  userId?: string;
  className: string;
  children: ReactNode;
}) {
  return <div className={className}>{children}</div>;
}
export function AppearanceApplication({
  initial,
  children,
  publicSite = false,
}: {
  initial?: { userId: string; appearance: Appearance };
  children: ReactNode;
  publicSite?: boolean;
}) {
  const pathname = usePathname();
  const internalRoute =
    /^\/(dashboard|platform|restaurant|guide|offline|pointage|checkout|connexion|demo)(\/|$)/.test(
      pathname,
    );
  const enabled =
    (!publicSite || internalRoute) && !/^\/(r|site-demo)(\/|$)/.test(pathname);
  return (
    <AppearanceSession
      key={initial?.userId || "anonymous"}
      initial={initial}
      enabled={enabled}
      pathname={pathname}
    >
      {children}
    </AppearanceSession>
  );
}
function cache(id: string, value: Appearance) {
  try {
    localStorage.setItem(appearanceCacheKey(id), JSON.stringify(value));
  } catch {
    /* Storage can be disabled. Server remains authoritative. */
  }
}
function AppearanceSession({
  initial,
  enabled,
  pathname,
  children,
}: {
  initial?: { userId: string; appearance: Appearance };
  enabled: boolean;
  pathname: string;
  children: ReactNode;
}) {
  const [saved, setSaved] = useState(initial?.appearance || defaultAppearance);
  const [draft, setDraft] = useState(defaultAppearance);
  const [identity, setIdentity] = useState(initial?.userId);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(!!initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const verifiedIdentity = useRef(initial?.userId);
  const loadController = useRef<AbortController | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    loadController.current = controller;
    if (!enabled) return;
    void fetch("/api/me/appearance", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            setSaved(defaultAppearance);
            setIdentity(undefined);
            verifiedIdentity.current = undefined;
          }
          if (response.status === 401 || response.status === 403) return;
          throw new Error(
            "Chargement de votre apparence impossible. Réessayez en rechargeant la page.",
          );
        }
        const data = await response.json();

        const value = appearanceSchema.parse(data.appearance);
        if (controller.signal.aborted) return;
        setIdentity(data.userId);
        verifiedIdentity.current = data.userId;
        setError("");
        setSaved(value);
        cache(data.userId, value);
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        if (verifiedIdentity.current) {
          try {
            const cached = appearanceSchema.safeParse(
              JSON.parse(
                localStorage.getItem(
                  appearanceCacheKey(verifiedIdentity.current),
                ) || "null",
              ),
            );
            if (cached.success) setSaved(cached.data);
          } catch {
            /* Storage is optional. */
          }
        }
        if (!controller.signal.aborted)
          setError(
            e instanceof TypeError
              ? "Connexion indisponible. Votre dernière apparence connue reste disponible."
              : e instanceof Error
                ? e.message
                : "Chargement impossible.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setReady(true);
      });
    return () => controller.abort();
  }, [enabled, pathname, initial?.userId]);
  const value = open ? draft : saved;
  const style =
    enabled && identity ? (themeVariables(value) as CSSProperties) : undefined;
  async function save(nextValue = draft, fromPanel = true) {
    if (!identity || busy) return;
    loadController.current?.abort();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/me/appearance", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Appearance-Account": identity,
        },
        body: JSON.stringify(nextValue),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error?.message || "Enregistrement impossible.");
      if (data.userId !== identity)
        throw new Error("Votre compte a changé. Rechargez la page.");
      const next = appearanceSchema.parse(data.appearance);
      cache(identity, next);
      setSaved(next);
      if (fromPanel) setOpen(false);
      setNotice("Votre apparence est enregistrée.");
    } catch (e) {
      setError(
        e instanceof TypeError
          ? "Enregistrement impossible. Vérifiez votre connexion puis réessayez."
          : e instanceof Error
            ? e.message
            : "Enregistrement impossible. Vérifiez votre connexion puis réessayez.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Context.Provider
      value={{
        style,
        ready: ready && !!identity && !busy,
        mode: saved.mode,
        toggleMode: () =>
          void save(
            { ...saved, mode: saved.mode === "dark" ? "light" : "dark" },
            false,
          ),
        open: () => {
          setDraft(saved);
          setOpen(true);
          setNotice("");
        },
      }}
    >
      <div
        className={
          style ? "appearance-application appearance-scope" : undefined
        }
        style={style}
        data-appearance-mode={style ? value.mode : undefined}
      >
        {style &&
          !/^\/(dashboard|restaurant)(\/|$)/.test(pathname) &&
          pathname !== "/platform" && (
            <div className="appearance-page-controls">
              <AppearanceButton />
            </div>
          )}
        {children}
        {!open && error && identity && (
          <div className="appearance-feedback" role="alert">
            {error}
          </div>
        )}
        <span className="appearance-sr" role="status">
          {notice}
        </span>
        <Dialog.Root
          open={open && enabled}
          onOpenChange={(next) => {
            if (!busy) setOpen(next);
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="appearance-overlay" />
            <Dialog.Content
              className="appearance-panel appearance-scope"
              style={style}
              data-appearance-mode={value.mode}
              // La visite guidée se superpose au panneau : ses clics ne le ferment pas.
              onInteractOutside={(event) => {
                if (
                  event.target instanceof Element &&
                  event.target.closest("[data-tour-layer]")
                )
                  event.preventDefault();
              }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                document
                  .querySelector<HTMLButtonElement>(".appearance-trigger")
                  ?.focus();
              }}
            >
              <header>
                <Dialog.Title>Personnaliser mon espace</Dialog.Title>
                <Dialog.Close
                  disabled={busy}
                  aria-label="Fermer la personnalisation"
                >
                  <X size={20} />
                </Dialog.Close>
              </header>
              <Dialog.Description>
                Ces réglages personnalisent uniquement votre espace.
              </Dialog.Description>
              <div className="appearance-panel-body">
                {!ready && <p role="status">Chargement de vos préférences…</p>}
                <fieldset disabled={!ready || busy}>
                  <legend>Votre ambiance</legend>
                  <div
                    className="appearance-modes"
                    role="group"
                    aria-label="Mode d’affichage"
                  >
                    <button
                      type="button"
                      aria-pressed={draft.mode === "light"}
                      onClick={() => setDraft({ ...draft, mode: "light" })}
                    >
                      <Sun size={18} />
                      Jour
                    </button>
                    <button
                      type="button"
                      aria-pressed={draft.mode === "dark"}
                      onClick={() => setDraft({ ...draft, mode: "dark" })}
                    >
                      <Moon size={18} />
                      Nuit
                    </button>
                  </div>
                  <div className="appearance-palettes">
                    {palettes.map(([label, color]) => (
                      <button
                        type="button"
                        key={color}
                        aria-pressed={draft.color === color}
                        onClick={() => setDraft({ ...draft, color })}
                      >
                        <span style={{ background: color }}>
                          {draft.color === color && (
                            <Check size={16} color="white" />
                          )}
                        </span>
                        {label}
                      </button>
                    ))}
                  </div>
                  <label className="appearance-color">
                    Couleur personnelle
                    <input
                      aria-label="Couleur personnelle"
                      type="color"
                      value={draft.color}
                      onChange={(e) =>
                        setDraft({ ...draft, color: e.target.value })
                      }
                    />
                  </label>
                  <label className="appearance-font">
                    Typographie
                    <select
                      value={draft.font}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          font: e.target.value as Appearance["font"],
                        })
                      }
                    >
                      <option value="default">Actuelle</option>
                      <option value="inter">Inter</option>
                      <option value="nunito">Nunito</option>
                      <option value="poppins">Poppins</option>
                    </select>
                  </label>
                  <label className="appearance-font">
                    Taille des textes
                    <select
                      value={draft.textSize}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          textSize: e.target.value as Appearance["textSize"],
                        })
                      }
                    >
                      <option value="standard">Confort — 100 %</option>
                      <option value="large">Grand — 115 %</option>
                      <option value="extraLarge">Très grand — 130 %</option>
                    </select>
                  </label>
                  <section
                    className="appearance-category-settings"
                    aria-labelledby="activity-colors-title"
                  >
                    <h3 id="activity-colors-title">Couleurs des activités</h3>
                    <p>
                      Les mêmes repères dans le journal, la navigation et les
                      modules. Les statuts et alertes gardent leur
                      signification.
                    </p>
                    {(
                      Object.keys(activityCategories) as ActivityCategory[]
                    ).map((key) => (
                      <label className="appearance-color" key={key}>
                        {activityCategories[key].label}
                        <input
                          type="color"
                          aria-label={`Couleur — ${activityCategories[key].label}`}
                          value={draft.categoryColors[key]}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              categoryColors: {
                                ...draft.categoryColors,
                                [key]: e.target.value,
                              },
                            })
                          }
                        />
                      </label>
                    ))}
                  </section>
                  <div className="appearance-sample">
                    <strong>Votre restaurant, à votre image</strong>
                    <p>Un espace agréable pour votre quotidien.</p>
                    <span>Aperçu de votre ambiance</span>
                  </div>
                  <button
                    type="button"
                    className="appearance-reset"
                    onClick={() => setDraft(defaultAppearance)}
                  >
                    Rétablir l’apparence d’origine
                  </button>
                </fieldset>
                {error && (
                  <p className="appearance-error" role="alert">
                    {error}
                  </p>
                )}
              </div>
              <footer>
                <Dialog.Close disabled={busy}>Annuler</Dialog.Close>
                <button
                  className="appearance-save"
                  disabled={!ready || !identity || busy}
                  onClick={() => void save()}
                >
                  {busy ? "Enregistrement…" : "Enregistrer"}
                </button>
              </footer>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </Context.Provider>
  );
}
