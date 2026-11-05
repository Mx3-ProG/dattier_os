import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { FORK_PATH, KNIFE_PATH } from "@/components/brand/paths";

export const alt =
  "Dattier OS — commandes, salle, réservations, stocks, équipe et site web dans un seul outil";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const font = (file: string) =>
  readFile(join(process.cwd(), "public/fonts", file));

function Utensils({ size, color }: { size: number; color: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={3.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path transform="rotate(-45 24 24)" d={FORK_PATH} />
      <path transform="rotate(45 24 24)" d={KNIFE_PATH} />
    </svg>
  );
}

export default async function Image() {
  const [serif, sans, sansBold] = await Promise.all([
    font("dmserifdisplay.ttf"),
    font("poppins.ttf"),
    font("poppins-bold.ttf"),
  ]);
  const modules = ["Commandes", "Salle", "Réservations", "Stocks", "Équipe"];
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: "#f8f5ed",
        fontFamily: "Poppins",
        color: "#2f4034",
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 48px 60px 72px",
          width: 740,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "#344d3e",
            }}
          >
            <Utensils size={40} color="#f1ddbb" />
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: 3,
              color: "#344d3e",
            }}
          >
            DATTIER<span style={{ color: "#9a6646", marginLeft: 10 }}>OS</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              fontFamily: "DM Serif",
              fontSize: 62,
              lineHeight: 1.08,
              letterSpacing: -1.5,
              color: "#2f4034",
            }}
          >
            Tout votre restaurant dans un seul OS
          </div>
          <div style={{ fontSize: 23, lineHeight: 1.45, color: "#5b6556" }}>
            Le logiciel de gestion ouvert des restaurateurs, avec des données
            cloisonnées par structure.
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {modules.map((m) => (
            <div
              key={m}
              style={{
                display: "flex",
                padding: "7px 16px",
                borderRadius: 999,
                border: "1.5px solid #e3dece",
                background: "#fdfbf6",
                fontSize: 18,
                color: "#344d3e",
              }}
            >
              {m}
            </div>
          ))}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flex: 1,
          margin: "40px 40px 40px 0",
          width: 380,
          borderRadius: 36,
          background: "#344d3e",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 360,
            height: 360,
            borderRadius: 999,
            border: "2px solid rgba(241, 221, 187, 0.18)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 280,
            height: 280,
            borderRadius: 999,
            background: "rgba(241, 221, 187, 0.08)",
            display: "flex",
          }}
        />
        <Utensils size={230} color="#f1ddbb" />
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "DM Serif", data: serif, weight: 400, style: "normal" },
        { name: "Poppins", data: sans, weight: 400, style: "normal" },
        { name: "Poppins", data: sansBold, weight: 700, style: "normal" },
      ],
    },
  );
}
