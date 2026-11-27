import React from "react";
import { Montserrat, Poppins } from "next/font/google";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-montserrat",
  display: "swap",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

export default function TeamPortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const fontScopeStyle = {
    "--font-plus-jakarta": "var(--font-montserrat)",
    "--font-dm-sans": "var(--font-poppins)",
    "--font-display":
      "var(--font-montserrat), ui-sans-serif, system-ui, sans-serif",
    "--font-sans":
      "var(--font-poppins), ui-sans-serif, system-ui, sans-serif",
    fontFamily: "var(--font-poppins), ui-sans-serif, system-ui, sans-serif",
  } as React.CSSProperties;

  return (
    <div
      className={`${montserrat.variable} ${poppins.variable} min-h-screen bg-[#F8F7F6] text-slate-900 antialiased`}
      style={fontScopeStyle}
    >
      {children}
    </div>
  );
}
