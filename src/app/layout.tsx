import type { Metadata, Viewport } from "next";
import { fontDisplay, fontMono, fontSans } from "@/lib/fonts";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Aeropath · Travel Tanzania", template: "%s · Aeropath" },
  description: "Book lodges, safaris, flights and transfers across Tanzania and East Africa. All-in pricing, mobile money, instant vouchers.",
};

export const viewport: Viewport = { themeColor: "#488FF5", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fontDisplay.variable} ${fontSans.variable} ${fontMono.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
