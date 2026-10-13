/*
 * (D) 설명·FAQ 정적 렌더 (7.2, 7.8).
 *
 * 서버 컴포넌트로 유지한다. 도구가 클라이언트라는 이유로 이 영역까지
 * 클라이언트 렌더링하면 색인이 비게 된다 (7.8).
 * FAQPage / SoftwareApplication JSON-LD를 함께 삽입한다 (7.8).
 */

import type { ConversionContent } from "@/content/conversions/types";

function jsonLd(content: ConversionContent) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        mainEntity: content.faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
      {
        "@type": "SoftwareApplication",
        name: "Molt Image",
        applicationCategory: "MultimediaApplication",
        operatingSystem: "Any (web browser)",
        // 평점·리뷰 수는 없으므로 생략한다 (7.8)
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      },
    ],
  };
}

export default function LandingContent({
  content,
}: {
  content: ConversionContent;
}) {
  return (
    <section>
      {content.body.map((b) => (
        <article key={b.heading}>
          <h2>{b.heading}</h2>
          <p>{b.text}</p>
        </article>
      ))}

      <h2>자주 묻는 질문</h2>
      <dl>
        {content.faq.map((f) => (
          <div key={f.q}>
            <dt>{f.q}</dt>
            <dd>{f.a}</dd>
          </div>
        ))}
      </dl>

      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(content)) }}
      />
    </section>
  );
}
