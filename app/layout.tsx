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

/** next.config 의 basePath 와 같은 값. 서브패스로 서비스할 때 og:image 주소에도 붙어야 한다. */
const BASE_PATH = (process.env.BASE_PATH || "").trim().replace(/\/+$/, "");

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);
  const title = "ELA Chatbot — 문서 기반 AI 고객상담";
  const description = "회사의 문서를 지식으로 바꾸고, 근거와 출처가 분명한 고객상담 AI를 운영하세요.";
  // basePath 를 빠뜨리면 /leehk 로 서비스할 때 og:image 가 도메인 뿌리를 가리켜 404 가 된다.
  const ogImage = new URL(`${BASE_PATH}/og.png`, base).toString();
  return {
    title: { default: title, template: "%s | ELA Chatbot" },
    description,
    metadataBase: base,
    openGraph: {
      title,
      description,
      type: "website",
      locale: "ko_KR",
      images: [{ url: ogImage, width: 1792, height: 1024, alt: "ELA Chatbot — 문서 하나로, 24시간 상담사가 생깁니다" }],
    },
    twitter: { card: "summary_large_image", title, description, images: [ogImage] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // 브라우저 번들은 서버 환경변수를 못 읽으므로 여기서 실어 보낸다.
  const runtimeConfig: RuntimeConfig = {
    backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL || "",
    backendPort: process.env.NEXT_PUBLIC_BACKEND_PORT || DEFAULT_BACKEND_PORT,
    // next.config 의 basePath 와 같은 값. <Link> 는 자동으로 붙지만
    // window.location 으로 직접 이동할 때는 코드가 붙여 줘야 한다.
    basePath: (process.env.BASE_PATH || "").trim().replace(/\/+$/, ""),
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
