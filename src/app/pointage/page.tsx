import type { Metadata } from "next";
import { ClockIn } from "@/components/qr/clock-in";

export const metadata: Metadata = {
  title: "Pointage",
  robots: { index: false },
};

/** Opened by scanning the establishment's clock-in QR code. */
export default function Page() {
  return <ClockIn />;
}
