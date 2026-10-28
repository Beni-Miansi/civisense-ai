import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { EnTete, EnTeteSquelette } from "@/components/navigation/EnTete";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "CiviSense AI", template: "%s · CiviSense AI" },
  description: "Signalez les problèmes urbains et suivez leur traitement par la mairie.",
};

export const viewport: Viewport = {
  themeColor: "#0f6b4f",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <Suspense fallback={<EnTeteSquelette />}>
          <EnTete />
        </Suspense>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-5 pb-28 md:pb-10">{children}</main>
      </body>
    </html>
  );
}
