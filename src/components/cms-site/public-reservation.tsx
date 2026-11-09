"use client";
import { Booking } from "../public/booking";
import { useTenantSite } from "./context";
export function PublicReservation() {
  const { restaurant, demo } = useTenantSite();
  return (
    <Booking
      restaurant={restaurant}
      apiBase={`/api/store/${encodeURIComponent(restaurant)}`}
      demo={demo}
    />
  );
}
