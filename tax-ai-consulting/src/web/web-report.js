/**
 * 웹 보고서 빌더 — 계산 엔진 결과만으로 만드는 고객용 보고서 (마크다운)
 *
 * AI 없이 즉시 생성된다. 모든 숫자는 엔진 산출값 그대로이며,
 * 세부 계산 내역(calc-steps)과 보유세 내역을 포함한다.
 * 시나리오마다 결과 구조(case1/case2·holdingTax·summary 키)가 조금씩 달라
 * 알려진 키를 한국어 라벨로 매핑하고, 모르는 키는 그대로 노출한다.
 */

import { renderCalcSteps } from '../report/calc-steps.js';
import { defaultCompare } from '../analysis/sensitivity.js';
import { getForm } from './form-specs.js';

const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;

const KEY_LABELS = {
  recipientGiftTax: '증여세 (수증자)',
  recipientAcqTax: '취득세 (수증자)',
  recipientTotal: '수증자 부담 소계',
  sellerTransferTax: '양도소득세 (소유자)',
  sellerLocalTax: '지방소득세 (소유자)',
  sellerTotal: '소유자 부담 소계',
  giftTax: '증여세',
  acqTax: '취득세',
  total: '합계',
  grandTotal: '총 세부담',
  ownerPropertyTax: '소유자 재산세',
  ownerAggrTax: '소유자 종부세',
  recipientPropertyTax: '수증자 재산세',
  recipientAggrTax: '수증자 종부세',
  ownerTotal: '소유자 보유세',
  spouseTotal: '배우자 보유세',
  before: '처분 전',
  after: '처분 후',
  afterCase1: '케이스1 이후',
  afterCase2: '케이스2 이후',
  change: '연간 변화',
  changeCase1: '케이스1 연간 변화',
  changeCase2: '케이스2 연간 변화',
  case1Total: '케이스1 총 세부담',
  case2Total: '케이스2 총 세부담',
  case1GrandTotal: '케이스1 총 세부담',
  case2GrandTotal: '케이스2 총 세부담',
  saving: '케이스1 − 케이스2 차이',
  difference: '케이스1 − 케이스2 차이',
  holdingChange: '보유세 연간 변화',
  holdingChangeCase1: '케이스1 보유세 연간 변화',
  holdingChangeCase2: '케이스2 보유세 연간 변화',
};
const label = (k) => KEY_LABELS[k] ?? k;

/** 부호 있는 금액 (변화량 표기) */
const signedWon = (n) => (n > 0 ? `+${won(n)}` : n < 0 ? `△${won(-n)}` : won(0));

/** 입력값 표 — 폼 스펙 라벨 사용 */
function inputsSection(calculation) {
  const form = getForm(calculation.scenarioId);
  if (!form) return [];
  const rows = [];
  for (const f of form.fields) {
    const v = calculation.inputs?.[f.name];
    if (v == null) continue;
    if (f.type === 'person') {
      if (!v.price) continue; // 미포함 수증자 생략
      rows.push(`| ${f.label} | 가액 ${won(v.price)} · 나이 만 ${v.age}세 |`);
    } else if (f.type === 'money') {
      rows.push(`| ${f.label} | ${won(v)} |`);
    } else if (f.type === 'rate') {
      rows.push(`| ${f.label} | ${Math.round(v * 100)}% |`);
    } else if (f.type === 'select') {
      const opt = f.options?.find((o) => o.value === v);
      rows.push(`| ${f.label} | ${opt?.label ?? v} |`);
    } else {
      rows.push(`| ${f.label} | ${v} |`);
    }
  }
  return ['## 1. 상담 개요 (입력값)', '', '| 항목 | 내용 |', '|---|---|', ...rows];
}

/** case1/case2 세부담 비교 표 */
function comparisonSection(calculation) {
  const { case1, case2 } = calculation;
  if (!case1 || !case2) return [];
  const keys = [...new Set([...Object.keys(case1), ...Object.keys(case2)])]
    .filter((k) => typeof case1[k] === 'number' || typeof case2[k] === 'number');
  const rows = keys.map((k) => {
    const v1 = typeof case1[k] === 'number' ? won(case1[k]) : '—';
    const v2 = typeof case2[k] === 'number' ? won(case2[k]) : '—';
    const strong = /total|Total/.test(k);
    const l = strong ? `**${label(k)}**` : label(k);
    return `| ${l} | ${strong ? `**${v1}**` : v1} | ${strong ? `**${v2}**` : v2} |`;
  });
  return [
    '## 2. 케이스별 세부담 비교',
    '',
    `| 구분 | ${case1.label ?? '케이스1'} | ${case2.label ?? '케이스2'} |`,
    '|---|---:|---:|',
    ...rows,
  ];
}

/** 보유세 변화 표 (시나리오별 구조 차이를 일반화) */
function holdingSection(calculation) {
  const h = calculation.holdingTax;
  if (!h || typeof h !== 'object') return [];

  const cols = Object.keys(h).filter((k) => h[k] && typeof h[k] === 'object');
  const changes = Object.keys(h).filter((k) => typeof h[k] === 'number');
  if (cols.length === 0) return [];

  const rowKeys = [...new Set(cols.flatMap((c) => Object.keys(h[c])))]
    .filter((rk) => cols.some((c) => typeof h[c][rk] === 'number'));

  const out = [
    '## 3. 보유세(재산세+종합부동산세) 변화 — 연간',
    '',
    `| 구분 | ${cols.map(label).join(' | ')} |`,
    `|---|${cols.map(() => '---:').join('|')}|`,
  ];
  for (const rk of rowKeys) {
    const isTotal = /total|Total/.test(rk);
    const cells = cols.map((c) => {
      const v = h[c][rk];
      return typeof v === 'number' ? (isTotal ? `**${won(v)}**` : won(v)) : '—';
    });
    out.push(`| ${isTotal ? `**${label(rk)}**` : label(rk)} | ${cells.join(' | ')} |`);
  }
  for (const ck of changes) {
    out.push('', `- ${label(ck)}: **${signedWon(h[ck])}**`);
  }
  return out;
}

/** 결론 — 어느 케이스가 유리한지 */
function conclusionSection(calculation) {
  const { a, b } = defaultCompare(calculation);
  if (!Number.isFinite(a.total) || !Number.isFinite(b.total) || (a.total === 0 && b.total === 0)) return [];
  const diff = a.total - b.total;
  const out = ['## 4. 결론', ''];
  if (diff === 0) {
    out.push(`두 선택지의 세부담이 **동일**합니다 (각 ${won(a.total)}).`);
  } else {
    const winner = diff > 0 ? b : a;
    const loser = diff > 0 ? a : b;
    out.push(
      `처분·이전 시점의 세부담 기준으로 **「${winner.label}」이(가) 「${loser.label}」보다 약 ${won(Math.abs(diff))} 유리**합니다` +
      ` (${won(winner.total)} vs ${won(loser.total)}).`,
    );
  }
  out.push('', '보유세 변화(3번)와 이월과세·자금출처 등 사후 리스크까지 고려한 종합 판단은 세무 전문가와 상담하시기 바랍니다.');
  return out;
}

/**
 * 계산 결과로 고객용 보고서 마크다운을 만든다.
 * @param {object} calculation runScenarioN() 반환값
 * @param {object} [opts] { generatedAt } — 작성일 표기 (기본: 오늘)
 */
export function buildWebReport(calculation, { generatedAt } = {}) {
  const date = generatedAt ?? new Date().toISOString().slice(0, 10);
  const parts = [
    '# 부동산 세금 상담 보고서',
    '',
    `**${calculation.title}**`,
    '',
    `작성일: ${date} · 세법 기준: 2026.5.10 시행분 · 계산: 결정적 엔진 (동일 입력 = 동일 결과)`,
    '',
    '---',
    '',
    ...inputsSection(calculation),
    '',
    ...comparisonSection(calculation),
  ];

  const calcSteps = renderCalcSteps(calculation.computations);
  if (calcSteps) parts.push('', calcSteps);

  const holding = holdingSection(calculation);
  if (holding.length) parts.push('', ...holding);

  const holdingSteps = renderCalcSteps(calculation.holdingComputations, { heading: '### 보유세 계산 내역' });
  if (holdingSteps) parts.push('', holdingSteps);

  parts.push('', ...conclusionSection(calculation));

  if (Array.isArray(calculation.lawRef) && calculation.lawRef.length) {
    parts.push('', '## 근거 법령', '', ...calculation.lawRef.map((r) => `- ${r}`));
  }

  parts.push('', '---', '', '*본 보고서는 참고용이며, 실제 신고 전 세무 전문가 확인이 필요합니다.*');
  return parts.join('\n');
}
