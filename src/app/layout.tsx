import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { HostTitle, OnThisMachine } from "@/components/hallvi/host-name";
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
            <strong>
              Hallvi is in alpha
              <OnThisMachine />.
            </strong>
            <p>
              Expect frequent changes as we figure out the best user experience.
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
