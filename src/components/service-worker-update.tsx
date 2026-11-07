"use client";

import { useEffect } from "react";

/** Refresh an already installed offline shell, including on administration pages. */
export function ServiceWorkerUpdate() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const workers = navigator.serviceWorker;
    const wasControlled = Boolean(workers.controller);
    let interacted = false;
    let reloaded = false;
    const markInteraction = () => {
      interacted = true;
    };
    const onControllerChange = () => {
      // Never reload over a form or an editor the user has started using.
      if (wasControlled && !interacted && !reloaded) {
        reloaded = true;
        window.location.reload();
      }
    };
    window.addEventListener("pointerdown", markInteraction, { once: true });
    window.addEventListener("keydown", markInteraction, { once: true });
    workers.addEventListener("controllerchange", onControllerChange);
    void workers
      .getRegistration("/")
      .then((registration) => {
        if (
          registration?.active &&
          new URL(registration.active.scriptURL).pathname === "/sw.js"
        ) {
          return registration.update();
        }
      })
      .catch(() => {
        // Offline visitors retain their installed shell.
      });
    return () => {
      window.removeEventListener("pointerdown", markInteraction);
      window.removeEventListener("keydown", markInteraction);
      workers.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);
  return null;
}
