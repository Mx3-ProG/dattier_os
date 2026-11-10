"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  encodePilotagePreferences,
  hiddenPilotageWidgets,
  pilotagePreferenceKey,
  type PilotageWidgetId,
} from "./catalog";
import type { PilotagePreferences } from "./service";
const eventName = "studio-os:pilotage-change";
const memory = new Map<string, string>();
function subscribe(listener: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key) memory.delete(event.key);
    else memory.clear();
    listener();
  };
  window.addEventListener("storage", storage);
  window.addEventListener(eventName, listener);
  return () => {
    window.removeEventListener("storage", storage);
    window.removeEventListener(eventName, listener);
  };
}
function cache(key: string, hidden: PilotageWidgetId[]) {
  const raw = encodePilotagePreferences(hidden);
  memory.set(key, raw);
  try {
    window.localStorage.setItem(key, raw);
  } catch {
    /* Account storage still works without browser storage. */
  }
  window.dispatchEvent(new Event(eventName));
}
const serverSnapshot = () => null;
export function usePilotagePreferences(restaurant: string, user: string) {
  const key = pilotagePreferenceKey(restaurant, user);
  const [remote, setRemote] = useState<{
    key: string;
    data: PilotagePreferences;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState({ key: "", version: 0 });
  const generation = useRef(0);
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      if (memory.has(key)) return memory.get(key)!;
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    serverSnapshot,
  );
  const endpoint = `/api/restaurants/${encodeURIComponent(restaurant)}/pilotage`;
  useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(endpoint, { signal: controller.signal });
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error?.message || "Préférences indisponibles.");
        if (body.userId !== user || body.restaurant !== restaurant)
          throw new Error("Votre compte a été modifié. Rechargez la page.");
        if (current !== generation.current) return;
        // Preserve the previous local choices until their first explicit account save.
        if (body.revision > 0 || refresh.key === key) cache(key, body.hidden);
        setRemote({ key, data: body });
        setError("");
        setBusy(false);
      } catch (e) {
        if (controller.signal.aborted || current !== generation.current) return;
        setError(e instanceof Error ? e.message : "Préférences indisponibles.");
        setBusy(false);
      }
    }
    void load();
    return () => {
      controller.abort();
      // This is a request generation counter, not a DOM ref; invalidate pending saves on cleanup.
      generation.current = current + 1;
    };
  }, [endpoint, key, user, restaurant, refresh]);
  const hidden = hiddenPilotageWidgets(raw);
  const ready = remote?.key === key;
  const dirty =
    ready &&
    (remote.data.revision === 0 ||
      JSON.stringify([...hidden].sort()) !==
        JSON.stringify([...remote.data.hidden].sort()));
  async function save() {
    if (!ready || busy) return;
    const current = generation.current;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-pilotage-account": user,
        },
        body: JSON.stringify({ hidden, revision: remote.data.revision }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.message || "Enregistrement impossible.");
      if (body.userId !== user || body.restaurant !== restaurant)
        throw new Error("Votre compte a été modifié. Rechargez la page.");
      if (current !== generation.current) return;
      cache(key, body.hidden);
      setRemote({ key, data: body });
    } catch (e) {
      if (current === generation.current)
        setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  return {
    visible: (id: PilotageWidgetId) => !hidden.includes(id),
    toggle: (id: PilotageWidgetId) => {
      if (ready && !busy)
        cache(
          key,
          hidden.includes(id)
            ? hidden.filter((item) => item !== id)
            : [...hidden, id],
        );
    },
    reset: () => {
      if (ready && !busy) cache(key, []);
    },
    reload: () => {
      setRemote(null);
      setRefresh((value) => ({ key, version: value.version + 1 }));
    },
    save,
    ready,
    busy,
    dirty,
    error,
  };
}
