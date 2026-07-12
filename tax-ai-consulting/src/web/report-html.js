/**
 * 보고서 마크다운 → 인쇄용 HTML 문서
 *
 * 화면 표시·브라우저 인쇄·PDF 변환·Word 변환에 공통으로 쓰는
 * A4 최적화 단일 HTML을 만든다 (외부 리소스 없음, 시스템 한글 폰트).
 */

import { marked } from 'marked';

const REPORT_CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Malgun Gothic', '맑은 고딕', 'Apple SD Gothic Neo',
                 'Noto Sans KR', 'NanumGothic', sans-serif;
    color: #1a1a1a; background: #fff;
    max-width: 200mm; margin: 0 auto; padding: 14mm 10mm;
    font-size: 10.5pt; line-height: 1.65;
  }
  h1 { font-size: 18pt; border-bottom: 3px solid #1a5276; padding-bottom: 6px; margin: 0 0 10px; color: #1a5276; }
  h2 { font-size: 13pt; color: #1a5276; border-left: 5px solid #1a5276; padding-left: 8px; margin: 22px 0 8px; }
  h3 { font-size: 11.5pt; color: #21618c; margin: 16px 0 6px; }
  h4 { font-size: 10.5pt; color: #2e4053; margin: 12px 0 4px; }
  p { margin: 6px 0; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0 14px; font-size: 10pt; page-break-inside: avoid; }
  th, td { border: 1px solid #b0bec5; padding: 5px 9px; }
  th { background: #eaf2f8; color: #1a5276; font-weight: 700; }
  td:not(:first-child) { text-align: right; white-space: nowrap; }
  tr:nth-child(even) td { background: #f8fbfd; }
  ul { margin: 4px 0 10px; padding-left: 20px; }
  li { margin: 2px 0; }
  blockquote { margin: 8px 0; padding: 8px 12px; background: #fef9e7; border-left: 4px solid #f39c12; }
  blockquote p { margin: 0; }
  hr { border: none; border-top: 1px solid #cfd8dc; margin: 18px 0; }
  strong { color: #0b3d5c; }
  em { color: #566573; }
  @page { size: A4; margin: 15mm 12mm; }
  @media print {
    body { max-width: none; padding: 0; font-size: 10pt; }
    h2 { page-break-after: avoid; }
    table, blockquote { page-break-inside: avoid; }
  }
`;

/**
 * @param {string} markdown 보고서 마크다운
 * @param {object} [opts] { title } — <title> (기본: 부동산 세금 상담 보고서)
 * @returns {string} 완결된 HTML 문서
 */
export function renderReportHtml(markdown, { title = '부동산 세금 상담 보고서' } = {}) {
  const body = marked.parse(markdown, { async: false });
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${REPORT_CSS}</style>
</head>
<body>
${body}
</body>
</html>`;
}
