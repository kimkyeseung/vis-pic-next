import type { Metadata } from "next";
import "./globals.css";
import FullscreenToggle from "@/components/FullscreenToggle";
import HomeShortcut from "@/components/HomeShortcut";
import MediapipeLoader from "@/components/MediapipeLoader";

export const metadata: Metadata = {
  title: "AR-pic",
  description: "AI 포토부스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#2a2a2a" />
      </head>
      <body>
        <FullscreenToggle />
        <HomeShortcut />
        <MediapipeLoader>
          {children}
        </MediapipeLoader>
        <script
          dangerouslySetInnerHTML={{
            __html: `if("serviceWorker"in navigator){var h=location.hostname;if(h==="localhost"||h==="127.0.0.1"||h==="[::1]"||h==="::1"){navigator.serviceWorker.getRegistrations().then(function(r){r.forEach(function(s){s.unregister()})})}else{navigator.serviceWorker.register("/sw.js")}}`,
          }}
        />
      </body>
    </html>
  );
}
