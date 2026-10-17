/**
 * 보고서 마크다운 → 인쇄용 HTML 문서 (대한세무법인 버건디 디자인)
 *
 * 화면 표시·브라우저 인쇄·PDF 변환·Word 변환에 공통으로 쓰는
 * A4 세로 최적화 단일 HTML을 만든다 (외부 리소스 없음, 시스템 한글 폰트).
 *
 * 색상 토큰 (Word .doc 변환 호환을 위해 CSS 변수 대신 값을 직접 쓴다):
 *   main #9F244D · dark #7a1a3a · soft #f8eded · tint #fdf6f8
 *   ink #2b2a2a · muted #6f6668 · line #e6d9dd · table border #cdb6bd
 */

import { marked } from 'marked';

export const REPORT_BRAND = '대한세무법인';
export const REPORT_SERIES = '상황별 증여세 비교 보고서';
export const REPORT_LAW_BASIS = '법 시행 기준 2026.5.10';

const REPORT_CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
    color: #2b2a2a; background: #fff;
    max-width: 190mm; margin: 0 auto; padding: 12mm 10mm 16mm;
    font-size: 10.5pt; line-height: 1.6;
    word-break: keep-all; overflow-wrap: anywhere;
  }

  /* ── 머리글·바닥글 ── */
  .rpt-head {
    display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
    font-size: 8.5pt; color: #6f6668; letter-spacing: 0.01em;
    border-bottom: 1px solid #e6d9dd; padding-bottom: 5px; margin-bottom: 10px;
  }
  .rpt-head .brand { color: #9F244D; font-weight: 800; font-size: 9.5pt; }
  .rpt-head .brand::before {
    content: ''; display: inline-block; width: 8px; height: 8px; border-radius: 2px;
    background: #9F244D; margin-right: 6px; vertical-align: 0;
  }
  .rpt-foot {
    margin-top: 10px; padding-top: 6px; border-top: 1px solid #e6d9dd;
    break-before: avoid; page-break-before: avoid;
    font-size: 8.5pt; color: #6f6668; line-height: 1.5;
  }
  .rpt-foot b { color: #7a1a3a; }

  /* ── 제목 ── */
  h1 {
    font-size: 19pt; line-height: 1.3; letter-spacing: -0.01em;
    color: #7a1a3a; margin: 0 0 6px; padding-bottom: 8px;
    border-bottom: 3px solid #9F244D;
  }
  h1 + p { margin: 8px 0 2px; font-size: 12pt; color: #2b2a2a; }
  h1 + p + p { margin: 0 0 6px; font-size: 9pt; color: #6f6668; }
  h2 {
    font-size: 12.5pt; color: #9F244D; margin: 18px 0 7px; padding: 2px 0 2px 10px;
    border-left: 5px solid #9F244D; line-height: 1.3;
    break-after: avoid; page-break-after: avoid;
  }
  h3 {
    font-size: 11pt; color: #7a1a3a; margin: 14px 0 5px;
    break-after: avoid; page-break-after: avoid;
  }
  h4 {
    font-size: 10.5pt; color: #2b2a2a; margin: 12px 0 3px; padding-bottom: 2px;
    border-bottom: 1px dashed #e6d9dd;
    break-after: avoid; page-break-after: avoid;
  }
  p { margin: 5px 0; }
  strong { color: #7a1a3a; }
  em { color: #6f6668; }
  hr { border: none; border-top: 1px solid #e6d9dd; margin: 14px 0; }

  /* ── 표 ── */
  table {
    border-collapse: collapse; width: 100%; margin: 6px 0 12px;
    font-size: 9.5pt; line-height: 1.45;
  }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th, td { border: 1px solid #cdb6bd; padding: 4px 8px; vertical-align: top; }
  th { background: #f8eded; color: #7a1a3a; font-weight: 700; text-align: left; }
  td:not(:first-child), th:not(:first-child) {
    text-align: right; white-space: nowrap;
    font-variant-numeric: tabular-nums; font-feature-settings: 'tnum' 1;
  }
  td:first-child { color: #2b2a2a; }
  tbody tr:nth-child(even) td { background: #fdf6f8; }
  td strong, th strong { color: #7a1a3a; }

  /* ── 목록·계산 내역 ── */
  ul { margin: 3px 0 8px; padding-left: 18px; }
  li { margin: 1px 0; }
  .calc { break-inside: avoid; page-break-inside: avoid; margin: 4px 0 6px; }
  .calc > p { margin: 4px 0 1px; }
  .calc > p > strong { color: #9F244D; }
  .calc ul { margin: 0 0 4px; }
  h2 + ul { columns: 2; column-gap: 20px; font-size: 9pt; margin-bottom: 4px; }
  h2 + ul li { break-inside: avoid; }

  /* ── 주의(인용) ── */
  blockquote {
    margin: 8px 0; padding: 7px 11px; background: #fffaf0; border: 1px solid #f0d9a0;
    border-left: 4px solid #f0d9a0; border-radius: 2px; font-size: 9.5pt;
    break-inside: avoid; page-break-inside: avoid;
  }
  blockquote p { margin: 0; }
  blockquote p + p { margin-top: 6px; }

  /* ── 결론 강조 박스 ── */
  .conclusion {
    background: #fdf6f8; border-left: 5px solid #9F244D; border-radius: 0 4px 4px 0;
    padding: 10px 14px 10px 16px; margin: 16px 0 12px;
    break-inside: avoid; page-break-inside: avoid;
  }
  .conclusion h2 { margin: 0 0 6px; padding-left: 0; border-left: none; }
  .conclusion p { margin: 4px 0; }
  .conclusion p:first-of-type { font-size: 11pt; }
  .conclusion p:last-child { color: #6f6668; font-size: 9.5pt; }

  /* ── 인쇄 ── */
  @page { size: A4 portrait; margin: 14mm 12mm; }
  @media print {
    body { max-width: none; padding: 0; margin: 0; font-size: 10pt; }
    table { font-size: 9pt; }
    h2, h3, h4 { break-after: avoid; page-break-after: avoid; }
    blockquote, .conclusion { break-inside: avoid; page-break-inside: avoid; }
    a { color: inherit; text-decoration: none; }
  }
`;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** 계산 내역 블록(「**라벨**」 문단 + 목록)을 한 덩어리로 묶어 페이지 사이에서 쪼개지지 않게 한다 */
function wrapCalcBlocks(html) {
  return html.replace(
    /<p><strong>([^<]*)<\/strong><\/p>\s*<ul>([\s\S]*?)<\/ul>/g,
    (m, label, items) => `<div class="calc"><p><strong>${label}</strong></p><ul>${items}</ul></div>`,
  );
}

/** 마크다운 끝의 참고용 안내(「---」 + 기울임 문단)는 바닥글이 대신하므로 제거 */
function stripTrailingNote(html) {
  return html.replace(/<hr>\s*<p><em>[^<]*<\/em><\/p>\s*$/, '');
}

/** "## 4. 결론" 섹션(다음 h2 전까지)을 강조 박스로 감싼다 */
function wrapConclusion(html) {
  return html.replace(
    /(<h2[^>]*>\s*(?:\d+\.\s*)?결론[^<]*<\/h2>)([\s\S]*?)(?=<h2[\s>]|$)/,
    (m, h2, body) => `<section class="conclusion">${h2}${body}</section>`,
  );
}

/**
 * @param {string} markdown 보고서 마크다운
 * @param {object} [opts]
 *   @param {string} [opts.title] <title> (기본: "상황별 증여세 비교 보고서")
 *   @param {string} [opts.generatedAt] 기준일 YYYY-MM-DD (기본: 오늘)
 *   @param {string} [opts.series] 머리글 보고서 종류 (기본: 상황별 증여세 비교 보고서)
 * @returns {string} 완결된 HTML 문서
 */
export function renderReportHtml(markdown, { title = REPORT_SERIES, generatedAt, series = REPORT_SERIES } = {}) {
  const date = generatedAt ?? new Date().toISOString().slice(0, 10);
  const body = wrapConclusion(wrapCalcBlocks(stripTrailingNote(marked.parse(markdown, { async: false }))));
  const head = `<header class="rpt-head">`
    + `<span class="brand">${esc(REPORT_BRAND)}</span>`
    + `<span>${esc(series)} · 기준일 ${esc(date)} (${esc(REPORT_LAW_BASIS)})</span>`
    + `</header>`;
  const foot = `<footer class="rpt-foot">`
    + `<b>${esc(REPORT_BRAND)}</b> · 계산 결과는 참고용이며, 공시가격·법령 개정과 개별 사실관계(세대 구성, 사전증여, 채무 인수 입증 등)에 따라 실제 세액은 달라질 수 있습니다. `
    + `신고·의사결정 전 담당 세무사의 확인을 받으시기 바랍니다.`
    + `</footer>`;
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${REPORT_CSS}</style>
</head>
<body>
${head}
${body}
${foot}
</body>
</html>`;
}
