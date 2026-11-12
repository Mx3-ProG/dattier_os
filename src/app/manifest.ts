import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "STUDIO S",
    short_name: "STUDIO S",
    description: "Gestion des commerces : clients, ventes, stocks et équipe",
    start_url: "/platform",
    display: "standalone",
    background_color: "#f7f5ef",
    theme_color: "#344d3e",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
