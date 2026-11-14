import type { Metadata } from "next";
import "./globals.css";
import "./dimensional.css";

export const metadata: Metadata = {
  title: "TimetableGenie · Academic planning, in sync",
  description:
    "Multidisciplinary timetable planning with independently audited constraints.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
