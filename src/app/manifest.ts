import type { MetadataRoute } from "next";

/** Makes the back office installable as an app on phones, tablets and Windows/macOS desktops. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Aeropath Back Office",
    short_name: "Aeropath",
    description: "Staff back office for Aeropath Travel: bookings, payments, suppliers and reports.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f6f9",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
