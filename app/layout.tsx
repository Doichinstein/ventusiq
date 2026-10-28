import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "VentusIQ — Open Weather",
  description: "Free, open-source weather intelligence.",
  icons: {
    icon: "/assets/ventusiq-icon.png",
    shortcut: "/assets/ventusiq-icon.png",
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
