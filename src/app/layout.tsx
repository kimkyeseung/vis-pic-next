import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="ko" className="h-full">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css"
        />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#2a2a2a" />
      </head>
      <body>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `if("serviceWorker"in navigator){if(location.hostname==="localhost"){navigator.serviceWorker.getRegistrations().then(function(r){r.forEach(function(s){s.unregister()})})}else{navigator.serviceWorker.register("/sw.js")}}`,
          }}
        />
      </body>
    </html>
  );
}
