import type { Metadata } from "next";
import Header from "@/components/common/Header";
import PrivacyIndicator from "@/components/common/PrivacyIndicator";
import Footer from "@/components/common/Footer";
import ModalQueue from "@/components/common/ModalQueue";
import "@/styles/tokens.css";

// TODO(W5): Pretendard 서브셋 자체 호스팅 + font-display: swap (7.7).
// COEP 활성 상태에서는 외부 CDN 폰트가 차단될 수 있으므로 CDN을 쓰지 않는다.

export const metadata: Metadata = {
  metadataBase: new URL("https://moltimage.app"),
  title: {
    default: "Molt Image — 서버 업로드 없는 이미지 변환",
    template: "%s · Molt Image",
  },
  description:
    "이미지 변환·압축·크기변경을 이 기기에서 처리합니다. 파일은 서버로 전송되지 않습니다.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <Header />
        <PrivacyIndicator />
        {children}
        <Footer />
        <ModalQueue />
      </body>
    </html>
  );
}
