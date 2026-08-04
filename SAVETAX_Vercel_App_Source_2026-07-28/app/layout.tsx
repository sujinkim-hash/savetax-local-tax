import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "지방소득세 담당자 조회",
  description: "전국 시·군·구의 종합소득세 관련 지방소득세 담당 연락처 조회 서비스",
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
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
