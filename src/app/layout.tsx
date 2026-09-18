import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

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
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
        <StandInNotice />
      </body>
    </html>
  );
}
