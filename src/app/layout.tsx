import type { Metadata, Viewport } from "next";
import "./globals.css";

const metaTitle = "Landings – US Landings from your ForeFlight logbook";
const metaDescription =
  "Upload your ForeFlight logbook CSV to visualize US public airport coverage by map, state, and airport list.";

export const metadata: Metadata = {
  metadataBase: new URL("https://landingbadge.com"),
  applicationName: "Landings",
  title: metaTitle,
  description: metaDescription,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Landings",
    statusBarStyle: "default"
  },
  openGraph: {
    title: metaTitle,
    description: metaDescription,
    type: "website",
    images: [
      {
        url: "/og-map.svg",
        width: 1200,
        height: 630,
        alt: "Landings map preview"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: metaTitle,
    description: metaDescription,
    images: ["/og-map.svg"]
  },
  icons: {
    icon: "/favicon.svg",
    apple: "/apple-touch-icon.svg"
  }
};

export const viewport: Viewport = {
  themeColor: "#0f172a"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
