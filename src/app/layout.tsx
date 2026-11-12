import type { Metadata, Viewport } from "next";
import { fontMono, fontSans } from "@/lib/fonts";
import { Providers } from "@/components/layout/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Aeropath Back Office", template: "%s · Aeropath" },
  description: "Staff back office for Aeropath Travel: bookings, payments, suppliers and reports.",
  robots: { index: false, follow: false },
  appleWebApp: { title: "Aeropath", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1521" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-TZ" className={`${fontSans.variable} ${fontMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Chrome/Edge offer install once, often before the app's JS runs; keep it for install-app.tsx. */}
        <script dangerouslySetInnerHTML={{ __html: `addEventListener("beforeinstallprompt",function(e){window.__installPrompt=e})` }} />
      </head>
      <body className="min-h-dvh bg-background font-sans text-base text-foreground antialiased" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
