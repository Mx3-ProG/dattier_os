"use client";

import { useState } from "react";
import { ArrowUpRight, MapPin } from "lucide-react";

export function LocationMap({ address }: { address: string }) {
  const [showMap, setShowMap] = useState(false);
  const query = encodeURIComponent(address);
  return (
    <div className="location-map">
      {showMap ? (
        <iframe
          title="Carte du restaurant à Bernay"
          src={`https://maps.google.com/maps?q=${query}&output=embed`}
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="location-preview">
          <MapPin size={30} aria-hidden />
          <b>Studio Restau</b>
          <p>{address}</p>
          <button
            className="btn light"
            type="button"
            onClick={() => setShowMap(true)}
          >
            Afficher la carte Google Maps
          </button>
        </div>
      )}
      <a
        className="btn outline"
        href={`https://www.google.com/maps/dir/?api=1&destination=${query}`}
        target="_blank"
        rel="noreferrer"
      >
        Calculer mon itinéraire <ArrowUpRight size={16} aria-hidden />
      </a>
    </div>
  );
}
