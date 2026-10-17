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

/** 분산증여 수증자별 세부담 표 (case.recipients 배열이 있는 시나리오 3·4·9·10) */
function recipientsSection(calculation) {
  const out = [];
  for (const [no, c] of [[1, calculation.case1], [2, calculation.case2]]) {
    const list = c?.recipients;
    if (!Array.isArray(list) || list.length < 2) continue;
    const hasLoan = list.some((r) => typeof r.partLoan === 'number');
    const hasPrice = list.some((r) => typeof r.price === 'number');
    const head = ['수증자', ...(hasPrice ? ['지분 가액'] : []), ...(hasLoan ? ['승계 채무'] : []), '증여세', '취득세', '합계'];
    out.push('', `### 수증자별 세부담 — 케이스${no} (${c.label ?? ''})`, '',
      `| ${head.join(' | ')} |`, `|---|${head.slice(1).map(() => '---:').join('|')}|`);
    const sum = { price: 0, partLoan: 0, giftTax: 0, acqTax: 0 };
    for (const r of list) {
      const cells = [r.label];
      if (hasPrice) { cells.push(won(r.price ?? 0)); sum.price += r.price ?? 0; }
      if (hasLoan) { cells.push(won(r.partLoan ?? 0)); sum.partLoan += r.partLoan ?? 0; }
      cells.push(won(r.giftTax), won(r.acqTax), `**${won(r.giftTax + r.acqTax)}**`);
      sum.giftTax += r.giftTax; sum.acqTax += r.acqTax;
      out.push(`| ${cells.join(' | ')} |`);
    }
    const tot = ['**합계**'];
    if (hasPrice) tot.push(`**${won(sum.price)}**`);
    if (hasLoan) tot.push(`**${won(sum.partLoan)}**`);
    tot.push(`**${won(sum.giftTax)}**`, `**${won(sum.acqTax)}**`, `**${won(sum.giftTax + sum.acqTax)}**`);
    out.push(`| ${tot.join(' | ')} |`);
  }
  return out;
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

/** 유의사항 — 계산에 반영되지 않은 사후 과세·요건 (시나리오 구성에 따라 선택) */
function cautionSection(calculation) {
  const id = Number(calculation.scenarioId);
  const burdened = [2, 4, 5, 6, 7, 10].includes(id);
  const spouseShare = [6, 7].includes(id);
  const toSpouse = [5, 6, 7, 8, 9, 10].includes(id);
  const items = [
    '**이월과세(소득세법 §97의2)**: 배우자·직계존비속이 증여받은 주택을 증여일부터 **10년 이내 양도**하면 '
      + '취득가액은 증여 당시 평가액이 아니라 **증여자의 당초 취득가액**으로 계산하고, 납부한 증여세는 필요경비로 공제합니다. '
      + '본 보고서의 증여 케이스는 증여 시점의 세부담만 비교하며, 수증자의 향후 양도세는 포함하지 않습니다.',
    '**증여재산공제 10년 합산(상증세법 §47②·§53)**: 공제액(배우자 6억·성년 자녀 5천만·미성년 2천만·기타친족 1천만)은 '
      + '동일인에게서 10년간 받은 증여를 합산해 한 번만 적용됩니다. 10년 내 사전증여가 있으면 증여세가 위 계산보다 늘어납니다.',
  ];
  if (burdened) {
    items.push(
      '**부담부증여 채무 요건(상증세법 §47③)**: 배우자·직계존비속 간에는 수증자가 실제로 인수·상환하는 것이 객관적으로 '
        + '입증되는 채무만 차감됩니다. 이후 증여자가 대신 상환하면 그 금액은 다시 증여로 과세됩니다. '
        + '채무 인수분 취득세는 수증자의 보유 주택수에 따른 유상취득세율(1~3%, 중과 시 8·12%)이 적용되며 본 계산은 수증자 무주택을 전제합니다.',
    );
  }
  if (spouseShare) {
    items.push(
      '**1세대1주택 보유·거주기간**: 같은 세대인 배우자로부터 증여받은 지분은 양도세 비과세 판정 시 '
        + '증여자의 보유·거주기간을 통산합니다(소득세법 시행령 §154⑤). 다만 10년 내 양도 시 이월과세는 별도로 적용됩니다.',
    );
  }
  if (toSpouse) {
    items.push(
      '**배우자 증여 후 보유세**: 배우자는 같은 세대이므로 증여 후에도 세대 기준 주택수는 그대로입니다. '
        + '종부세는 인별 과세로 각자 공제를 적용해 계산했으며, 재산세는 주택 전체 세액을 지분비율로 안분했습니다.',
    );
  }
  return ['## 5. 유의사항 (계산에 반영되지 않은 사후 과세·요건)', '', ...items.map((t) => `> ${t}`).flatMap((l, i, a) => (i < a.length - 1 ? [l, '>'] : [l]))];
}

/**
 * 계산 결과로 고객용 보고서 마크다운을 만든다.
 * @param {object} calculation runScenarioN() 반환값
 * @param {object} [opts] { generatedAt } — 작성일 표기 (기본: 오늘)
 */
export function buildWebReport(calculation, { generatedAt } = {}) {
  const date = generatedAt ?? new Date().toISOString().slice(0, 10);
  const parts = [
    '# 상황별 증여세 비교 보고서',
    '',
    `**${calculation.title}**`,
    '',
    `작성일: ${date} · 세법 기준: 2026.5.10 시행분 (2026.10 세법 감사 반영) · 계산: 결정적 엔진 (동일 입력 = 동일 결과)`,
    '',
    '---',
    '',
    ...inputsSection(calculation),
    '',
    ...comparisonSection(calculation),
    ...recipientsSection(calculation),
  ];

  const calcSteps = renderCalcSteps(calculation.computations);
  if (calcSteps) parts.push('', calcSteps);

  const holding = holdingSection(calculation);
  if (holding.length) parts.push('', ...holding);

  const holdingSteps = renderCalcSteps(calculation.holdingComputations, { heading: '### 보유세 계산 내역' });
  if (holdingSteps) parts.push('', holdingSteps);

  parts.push('', ...conclusionSection(calculation));
  parts.push('', ...cautionSection(calculation));

  if (Array.isArray(calculation.lawRef) && calculation.lawRef.length) {
    parts.push('', '## 근거 법령', '', ...calculation.lawRef.map((r) => `- ${r}`));
  }

  parts.push('', '---', '', '*본 보고서는 참고용이며, 실제 신고 전 세무 전문가 확인이 필요합니다.*');
  return parts.join('\n');
}
