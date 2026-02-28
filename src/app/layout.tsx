import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpheliaHub",
  description: "Personal & Family Finance Management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
