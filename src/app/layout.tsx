import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { HostTitle } from "@/components/hallvi/host-name";
import { StandInNotice } from "@/components/hallvi/stand-in-notice";

import "./globals.css";
import "./hallvi.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hallvi",
  description: "Deploy and operate applications on infrastructure you own.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`hv-app-frame ${geistSans.variable} ${geistMono.variable}`}
      >
        <aside className="hv-alpha-notice" aria-label="Hallvi alpha release">
          <span className="hv-alpha-label">Alpha</span>
          <div>
            <strong>Hallvi is just getting started.</strong>
            <p>
              Expect frequent changes, especially to the views and how we
              surface information. This is only the beginning.
            </p>
          </div>
        </aside>
        <div className="hv-app-content">{children}</div>
        <StandInNotice />
        <HostTitle />
      </body>
    </html>
  );
}
