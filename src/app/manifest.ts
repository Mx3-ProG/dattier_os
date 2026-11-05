import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "atacuisine",
    short_name: "atacuisine",
    description: "Gestion des restaurants et poste de service hors ligne",
    start_url: "/platform",
    display: "standalone",
    background_color: "#f7f5ef",
    theme_color: "#153d32",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
