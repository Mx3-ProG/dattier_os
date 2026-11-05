"use client";
import { Booking } from "../public/booking";
import { useTenantSite } from "./context";
export function PublicReservation() {
  const { restaurant } = useTenantSite();
  return (
    <Booking
      restaurant={restaurant}
      apiBase={`/api/store/${encodeURIComponent(restaurant)}`}
    />
  );
}
