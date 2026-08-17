import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import "./styles.css";

export const metadata: Metadata = {
  title: "Mind vs. Machine — Wordle against AI",
  description: "Play the same Wordle as leading AI models, then compare every board.",
};

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html data-scroll-behavior="smooth" lang="en" className={`dark ${geist.variable} ${geistMono.variable}`}>
      <body className="min-h-svh">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
