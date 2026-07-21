/**
 * 혼인으로 인한 1세대 1주택 비과세 특례 판정기
 * 기준: 소득세법 시행령 §156의2⑨ (혼인 시 주택·조합원입주권·분양권 특례, 2024.11.12 개정)
 *       소득세법 시행령 §155⑤ (혼인 합가 2주택 특례), §154① (보유·거주요건)
 *
 * 구조 (§156의2⑨)
 *  - 제1호 해당자(가: 1주택 / 나: 1조합원입주권·1분양권 / 다: 1주택+1입주권·분양권)끼리 혼인
 *    → 1세대가 1주택+1입주권, 2주택+2입주권 등을 소유하게 된 경우
 *  - 혼인한 날부터 10년 이내에 "먼저 양도하는 주택"(최초양도주택)이
 *    제2호·제3호·제4호 중 하나에 해당하면 1세대1주택으로 보아 §154① 적용
 *    · 제2호: 가목자(1주택만 보유)가 혼인 전부터 소유하던 주택
 *    · 제3호: 다목자(주택+권리)가 혼인 전부터 소유하던 주택. 단,
 *        가. 혼인전 입주권이 최초(원조합원) 입주권 → 그 주택이 사업시행인가일 이후
 *            거주 목적으로 취득된 것 + 취득 후 1년 이상 거주
 *        나. 혼인전 입주권이 승계취득 → 입주권 취득 전부터 소유하던 주택일 것
 *        다. 혼인전 분양권 → 분양권 취득 전부터 소유하던 주택일 것
 *    · 제4호: 나목자(입주권·분양권만 보유)의 권리가 관리처분계획등·사업시행 완료로
 *             혼인한 날 이후 취득되는 주택(신축주택)
 *  - 기한: 2024.11.12 이후 양도분부터 10년 (종전 5년)
 *  - §154① 보유 2년·거주요건(2017.8.3 이후 조정 취득 2년), 고가 12억 초과분 과세는 그대로 적용
 */

import {
  RESIDENCE_REQ_START, HIGH_PRICE_12E_START, HIGH_PRICE_12E, HIGH_PRICE_9E,
} from './single-house-exempt.js';

/** 혼인 특례 기한 10년 적용 개시(양도분 기준). 이전 양도는 5년 */
export const MARRIAGE_10Y_START = '2024-11-12';

const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const eok = (n) => `${(n / 100_000_000).toLocaleString('ko-KR')}억원`;

const d = (s) => new Date(`${String(s)}T00:00:00Z`);
const addYears = (date, n) => { const x = new Date(date); x.setUTCFullYear(x.getUTCFullYear() + n); return x; };
const meetsYears = (startISO, endISO, n) => d(endISO).getTime() >= addYears(d(startISO), n).getTime();
const yearsBetween = (aISO, bISO) => (d(bISO).getTime() - d(aISO).getTime()) / (365.2425 * 86400000);
const onOrAfter = (aISO, bISO) => d(aISO).getTime() >= d(bISO).getTime();

/** 혼인 전 보유 유형 (시행령 §156의2⑨ 제1호 각 목) */
export const HOLDINGS = [
  { key: 'house', label: '1주택 (제1호 가목)', short: '1주택' },
  { key: 'right', label: '1조합원입주권 또는 1분양권 (제1호 나목)', short: '1입주권·분양권' },
  { key: 'house-right', label: '1주택 + 1입주권·분양권 (제1호 다목)', short: '1주택+1권리' },
  { key: 'other', label: '그 외 (2주택 이상 등 — 특례 불가)', short: '그 외' },
];
const HOLDING_LABEL = Object.fromEntries(HOLDINGS.map((h) => [h.key, h.short]));

/** 조정지역 취득분 거주요건(2017.8.3~) 판정 */
function residence(adjust, acquireDate, liveYears) {
  const need = adjust && onOrAfter(acquireDate, RESIDENCE_REQ_START);
  if (!need) return { need: false, ok: true, detail: adjust ? '취득일 2017.8.3 이전 → 거주요건 없음' : '비조정 취득 → 거주요건 없음' };
  return { need: true, ok: liveYears >= 2, detail: `조정지역 취득(2017.8.3 이후) → 2년 거주 필요 (거주 ${liveYears}년)` };
}

const LAW_156 = [
  '소득세법 시행령 §156의2⑨ (혼인 시 주택·조합원입주권 비과세 특례)',
  '소득세법 시행령 §156의3 (분양권 특례)',
  '소득세법 시행령 §154① · 소득세법 §89①3',
  '소득세법 §95② (고가주택 12억 초과분 과세)',
];
const LAW_155 = [
  '소득세법 시행령 §155⑤ (혼인 합가 2주택 비과세 특례)',
  '소득세법 시행령 §154① · 소득세법 §89①3',
  '소득세법 §95② (고가주택 12억 초과분 과세)',
];

/**
 * 혼인 특례 비과세 판정
 * @param {object} input {
 *   spouseA, spouseB ('house'|'right'|'house-right'|'other'),
 *   seller ('A'|'B'), marriageDate, saleDate, salePrice, isFirstSale,
 *   houseAcquireDate, acquiredInAdjust, liveYears,
 *   rightKind ('first'|'acquired'|'presale'),   — 제3호(다목자) 혼인 전 권리 종류
 *   approvalDate,                                — 3호 가목: 사업시행계획 인가일
 *   rightAcquireDate }                           — 3호 나·다목: 권리 취득일
 */
export function judgeMarriageExempt(input) {
  const {
    spouseA = 'house', spouseB = 'right', seller = 'A',
    marriageDate, saleDate, salePrice = 0, isFirstSale = true,
    houseAcquireDate, acquiredInAdjust = false, liveYears = 0,
    rightKind = 'first', approvalDate = null, rightAcquireDate = null,
  } = input;

  const checklist = [];
  const reasons = [];
  const sellerType = seller === 'A' ? spouseA : spouseB;
  const otherType = seller === 'A' ? spouseB : spouseA;
  const regime = spouseA === 'house' && spouseB === 'house' ? '155-5' : '156-2-9';

  // 1) 적용 대상 조합 — 두 배우자 모두 제1호(가·나·다목) 해당
  const comboOk = spouseA !== 'other' && spouseB !== 'other';
  const comboDetail = `A: ${HOLDING_LABEL[spouseA]} · B: ${HOLDING_LABEL[spouseB]}`
    + (comboOk
      ? (regime === '155-5' ? ' → 주택+주택 혼인 합가 (§155⑤로 판정)' : ' → 제1호 해당자 간 혼인 (§156의2⑨)')
      : ' → 제1호 미해당자 포함, 특례 적용 불가');
  checklist.push({ key: 'combo', label: '혼인 특례 적용 대상 조합', ok: comboOk, detail: comboDetail });

  // 2) 최초양도주택 — 혼인 후 먼저 양도하는 주택
  checklist.push({
    key: 'first', label: '혼인 후 세대가 먼저 양도하는 주택(최초양도주택)', ok: !!isFirstSale,
    detail: isFirstSale ? '먼저 양도하는 주택에 해당' : '이미 다른 주택을 먼저 양도 → 특례 대상 아님',
  });

  // 3) 양도 기한 — 2024.11.12 이후 양도분 10년, 이전 5년
  const appliedYears = onOrAfter(saleDate, MARRIAGE_10Y_START) ? 10 : 5;
  const deadlineISO = addYears(d(marriageDate), appliedYears).toISOString().slice(0, 10);
  const deadlineOk = d(saleDate).getTime() <= d(deadlineISO).getTime();
  checklist.push({
    key: 'deadline', label: `혼인한 날부터 ${appliedYears}년 이내 양도`, ok: deadlineOk,
    detail: `혼인 ${marriageDate} → 양도 ${saleDate} (경과 ${yearsBetween(marriageDate, saleDate).toFixed(1)}년 · 기한 ${deadlineISO})`
      + (appliedYears === 5 ? ' · 2024.11.12 이전 양도분은 종전 5년 적용' : ''),
  });

  // 4) 최초양도주택 요건 (제2·3·4호 / §155⑤)
  let targetOk = false;
  let targetLabel = '최초양도주택 요건';
  let targetDetail = '';
  if (!comboOk || sellerType === 'other') {
    targetDetail = '양도주택 보유자가 제1호(가·나·다목)에 해당하지 않아 판정 불가';
  } else if (regime === '155-5') {
    targetOk = true;
    targetLabel = '최초양도주택 요건 (§155⑤)';
    targetDetail = '1주택자 간 혼인으로 2주택 → 먼저 양도하는 주택이면 충족';
  } else if (sellerType === 'house') {
    targetOk = true;
    targetLabel = '최초양도주택 요건 (제2호)';
    targetDetail = '1주택만 보유하던 자(가목)가 혼인 전부터 소유하던 주택 → 제2호 충족';
  } else if (sellerType === 'house-right') {
    if (rightKind === 'first') {
      targetLabel = '최초양도주택 요건 (제3호 가목)';
      const acqOk = !!(approvalDate && houseAcquireDate && onOrAfter(houseAcquireDate, approvalDate));
      const liveOk = liveYears >= 1;
      targetOk = acqOk && liveOk;
      targetDetail = `혼인 전 원조합원(최초) 입주권 보유 → 이 주택이 사업시행인가일(${approvalDate || '미입력'}) 이후 거주 목적 취득 ${acqOk ? '충족' : '미충족'}`
        + ` · 취득 후 1년 이상 거주 ${liveOk ? `충족(${liveYears}년)` : `미충족(${liveYears}년)`}`;
    } else {
      const isPresale = rightKind === 'presale';
      targetLabel = `최초양도주택 요건 (제3호 ${isPresale ? '다' : '나'}목)`;
      const rightName = isPresale ? '분양권' : '승계취득 입주권';
      const ok = !!(rightAcquireDate && houseAcquireDate && d(houseAcquireDate).getTime() < d(rightAcquireDate).getTime());
      targetOk = ok;
      targetDetail = `혼인 전 ${rightName} 보유 → ${rightName} 취득일(${rightAcquireDate || '미입력'}) 전부터 이 주택 소유 ${ok ? '충족' : '미충족'} (주택 취득 ${houseAcquireDate})`;
    }
  } else if (sellerType === 'right') {
    targetLabel = '최초양도주택 요건 (제4호)';
    targetOk = !!(houseAcquireDate && onOrAfter(houseAcquireDate, marriageDate));
    targetDetail = `입주권·분양권만 보유하던 자(나목)의 권리가 완공되어 혼인일(${marriageDate}) 이후 취득한 신축주택`
      + (targetOk ? ' → 제4호 충족' : ' → 혼인 전 취득이면 제4호 미해당(가목·제2호로 검토)') + ` (취득 ${houseAcquireDate})`;
  }
  checklist.push({ key: 'target', label: targetLabel, ok: targetOk, detail: targetDetail });

  // 5) §154① 보유 2년
  const holdOk = !!(houseAcquireDate && meetsYears(houseAcquireDate, saleDate, 2));
  checklist.push({
    key: 'hold', label: '보유 2년 이상 (§154①)', ok: holdOk,
    detail: houseAcquireDate ? `${yearsBetween(houseAcquireDate, saleDate).toFixed(1)}년 (취득 ${houseAcquireDate} → 양도 ${saleDate})` : '취득일 미입력',
  });

  // 6) §154① 거주요건
  const live = residence(acquiredInAdjust, houseAcquireDate, liveYears);
  checklist.push({ key: 'live', label: live.need ? '거주 2년 이상 (조정 취득, §154①)' : '거주요건 (해당 없음)', ok: live.ok, detail: live.detail });

  // 7) 고가주택
  const threshold = onOrAfter(saleDate, HIGH_PRICE_12E_START) ? HIGH_PRICE_12E : HIGH_PRICE_9E;
  const isHigh = salePrice > threshold;
  checklist.push({
    key: 'high', label: `고가 (양도가액 ${eok(threshold)} 기준)`, ok: !isHigh, warn: isHigh,
    detail: isHigh ? `${won(salePrice)} > ${eok(threshold)} → 초과분 과세(부분 비과세)` : `${won(salePrice)} 이하 → 전액 비과세 가능`,
  });

  const baseOk = comboOk && !!isFirstSale && deadlineOk && targetOk && holdOk && live.ok;
  let verdict, headline;
  if (!baseOk) { verdict = 'taxable'; headline = '혼인 특례 비과세 불가 — 요건 미충족'; }
  else if (isHigh) { verdict = 'partial'; headline = `${eok(threshold)} 이하 비과세 · 초과분 과세`; }
  else { verdict = 'exempt'; headline = regime === '155-5' ? '혼인 합가 특례 비과세 (§155⑤)' : '혼인 특례 비과세 (§156의2⑨ 1세대1주택 의제)'; }

  reasons.push(`혼인 특례 기한은 2024.11.12 이후 양도분부터 10년(종전 5년)입니다 — 이 사례는 ${appliedYears}년이 적용되었습니다.`);
  if (sellerType === 'right') {
    reasons.push('신축주택 보유기간 기산: 원조합원은 종전주택 취득일부터 통산, 승계취득 입주권·분양권에 의한 주택은 완공(사용승인·잔금)일부터 기산합니다. 취득일란에 그 기산일을 입력하세요.');
  }
  if (spouseA === 'right' && spouseB === 'right') {
    reasons.push('두 배우자 모두 나목(입주권·분양권만 보유)인 조합은 조문 예시 외 "등"에 따른 해석 여지가 있어 전문가 확인을 권장합니다.');
  }
  reasons.push('세대 판정, 상생임대 등 거주요건 개별 특례, 다른 비과세 특례와의 중복 적용은 반영되지 않았습니다.');

  return {
    mode: 'marriage', regime, verdict, headline, checklist, reasons,
    appliedYears, deadline: deadlineISO, threshold, isHigh,
    lawRef: regime === '155-5' ? LAW_155 : LAW_156,
  };
}

export { won, eok };
