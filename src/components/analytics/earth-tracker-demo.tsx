"use client";
import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { geoBreakdown } from "@/features/analytics/aggregate";
import { zonesToPoints } from "@/features/analytics/cluster";
import { demoZones } from "@/features/analytics/demo-data";
import { Button } from "@/components/ui/button";
import { GlobeView, type PulseEvent } from "./globe/globe-view";
import "./earth-tracker.css";

/** Démonstration de la boutique. Ces données fictives ne sont jamais mêlées aux statistiques réelles. */
export function EarthTrackerDemo({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"3d" | "2d">("3d");
  const [country, setCountry] = useState<string | null>(null);
  const [pulses, setPulses] = useState<PulseEvent[]>([]);
  const points = useMemo(() => zonesToPoints(demoZones), []);
  const { countries } = useMemo(() => geoBreakdown(demoZones), []);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    let index = 0;
    const timer = setInterval(() => {
      const point = points[index++ % points.length];
      setPulses((current) => [...current.slice(-11), { id: `demo-${index}`, lat: point.lat, lng: point.lng }]);
    }, 1400);
    return () => clearInterval(timer);
  }, [points]);
  const selected = countries.find((entry) => entry.key === country);
  return (
    <dialog ref={dialog} className="et-demo" aria-label="Démonstration d’Earth Tracker 3D" onClose={onClose}>
      <header>
        <div>
          <h2>Earth Tracker 3D</h2>
          <p><strong>Démonstration : toutes les données affichées sont fictives.</strong></p>
        </div>
        <Button variant="ghost" aria-label="Fermer la démonstration" onClick={() => dialog.current?.close()}>
          <X size={18} />
        </Button>
      </header>
      <GlobeView
        points={points}
        pulses={pulses}
        mode={mode}
        focus={null}
        selectedCountry={country}
        onSelectCountry={setCountry}
        onFallback={() => setMode("2d")}
        badge="Données fictives"
      />
      <p className="et-demo-note" role="status">
        {selected
          ? `${selected.label} (fictif) : ${selected.pageviews} pages vues, ${Math.round(selected.share * 100)} % du trafic de démonstration.`
          : "Cliquez sur un pays ou un point lumineux. Une fois installé, le globe n’affiche que les visites réelles de votre site."}
      </p>
    </dialog>
  );
}
