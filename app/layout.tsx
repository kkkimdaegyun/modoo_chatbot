import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { DEFAULT_BACKEND_PORT, RuntimeConfig } from "../lib/api";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);
  const title = "ELA Chatbot — 문서 기반 AI 고객상담";
  const description = "회사의 문서를 지식으로 바꾸고, 근거와 출처가 분명한 고객상담 AI를 운영하세요.";
  return {
    title: { default: title, template: "%s | ELA Chatbot" },
    description,
    metadataBase: base,
    openGraph: {
      title,
      description,
      type: "website",
      locale: "ko_KR",
      images: [{ url: new URL("/og.png", base).toString(), width: 1792, height: 1024, alt: "ELA Chatbot — 문서 하나로, 24시간 상담사가 생깁니다" }],
    },
    twitter: { card: "summary_large_image", title, description, images: [new URL("/og.png", base).toString()] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // 브라우저 번들은 서버 환경변수를 못 읽으므로 여기서 실어 보낸다.
  const runtimeConfig: RuntimeConfig = {
    backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL || "",
    backendPort: process.env.NEXT_PUBLIC_BACKEND_PORT || DEFAULT_BACKEND_PORT,
  };
  return (
    <html lang="ko">
      <body className={`${geistSans.variable} antialiased`}>
        <script
          id="ela-runtime-config"
          dangerouslySetInnerHTML={{ __html: `window.__ELA__=${JSON.stringify(runtimeConfig)}` }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
