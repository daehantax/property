/**
 * 재건축·재개발 관련 1세대 1주택 양도소득세 비과세 판정기
 * 기준: 소득세법 §89①4(조합원입주권 양도 비과세), 시행령 §156의2(대체주택 등)
 *
 * 다루는 두 가지 상황
 *  A. 조합원입주권 양도 비과세 (§89①4)
 *     - 관리처분계획인가일 현재 종전주택이 1세대1주택 비과세 요건(2년 보유·거주) 충족
 *     - 양도일 현재 ① 다른 주택·분양권 없음(가목) 또는
 *                    ② 1주택 보유하나 그 주택 취득 후 3년 이내 입주권 양도(나목, 일시적)
 *     - 실지거래가액 12억 초과분은 과세(고가)
 *  B. 대체주택 비과세 특례 (§156의2⑤)
 *     - 사업시행계획인가일 현재 1주택자가 사업시행인가일 이후 대체주택 취득·1년 이상 거주
 *     - 신축주택 완공 후 3년 이내 세대전원 이사·1년 이상 계속 거주
 *     - 신축주택 완공 후 3년 이내 대체주택 양도
 *     → 대체주택 양도 비과세(보유·거주기간 무관, 12억 초과분은 과세)
 */

import {
  RESIDENCE_REQ_START, HIGH_PRICE_12E_START, HIGH_PRICE_12E, HIGH_PRICE_9E,
} from './single-house-exempt.js';

const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const eok = (n) => `${(n / 100_000_000).toLocaleString('ko-KR')}억원`;

const d = (s) => new Date(`${String(s)}T00:00:00Z`);
const addYears = (date, n) => { const x = new Date(date); x.setUTCFullYear(x.getUTCFullYear() + n); return x; };
const meetsYears = (startISO, endISO, n) => d(endISO).getTime() >= addYears(d(startISO), n).getTime();
const yearsBetween = (aISO, bISO) => (d(bISO).getTime() - d(aISO).getTime()) / (365.2425 * 86400000);
const onOrAfter = (aISO, bISO) => d(aISO).getTime() >= d(bISO).getTime();
const withinYears = (startISO, endISO, n) => d(endISO).getTime() <= addYears(d(startISO), n).getTime();

/** 조정지역 취득분 거주요건(2017.8.3~) 판정 */
function residence(adjust, acquireDate, liveYears) {
  const need = adjust && onOrAfter(acquireDate, RESIDENCE_REQ_START);
  if (!need) return { need: false, ok: true, detail: adjust ? '취득일 2017.8.3 이전 → 거주요건 없음' : '비조정 취득 → 거주요건 없음' };
  return { need: true, ok: liveYears >= 2, detail: `조정지역 취득(2017.8.3 이후) → 2년 거주 필요 (거주 ${liveYears}년)` };
}

function highPrice(saleDate, salePrice) {
  const threshold = onOrAfter(saleDate, HIGH_PRICE_12E_START) ? HIGH_PRICE_12E : HIGH_PRICE_9E;
  return { threshold, isHigh: salePrice > threshold };
}

const INWAY_LAW = [
  '소득세법 §89①4(조합원입주권 양도 비과세)',
  '소득세법 시행령 §156의2(조합원입주권 비과세 특례)',
  '소득세법 §95②(고가주택 12억 초과분 과세)',
];

/**
 * A. 조합원입주권 양도 비과세 판정
 * @param {object} input {
 *   prevAcquireDate, prevAcquiredInAdjust, prevLiveYears,
 *   approvalDate, inwaySaleDate, otherHouse('none'|'one-temp'|'multi'),
 *   newHouseAcquireDate, salePrice }
 */
export function judgeInwayExempt(input) {
  const {
    prevAcquireDate, prevAcquiredInAdjust = false, prevLiveYears = 0,
    approvalDate, inwaySaleDate, otherHouse = 'none',
    newHouseAcquireDate = null, salePrice = 0,
  } = input;

  const checklist = [];
  const reasons = [];

  // 1) 관리처분인가일 현재 종전주택 보유 2년
  const holdOk = meetsYears(prevAcquireDate, approvalDate, 2);
  checklist.push({ key: 'hold', label: '관리처분인가일 현재 종전주택 보유 2년 이상', ok: holdOk, detail: `${yearsBetween(prevAcquireDate, approvalDate).toFixed(1)}년 (취득 ${prevAcquireDate} → 인가 ${approvalDate})` });

  // 2) 인가일 현재 거주요건
  const live = residence(prevAcquiredInAdjust, prevAcquireDate, prevLiveYears);
  checklist.push({ key: 'live', label: live.need ? '관리처분인가일 현재 거주 2년 이상(조정 취득)' : '거주요건(해당 없음)', ok: live.ok, detail: live.detail });

  // 3) 양도일 현재 다른 주택 요건
  let saleOk, saleDetail;
  if (otherHouse === 'none') {
    saleOk = true; saleDetail = '양도일 현재 다른 주택·분양권 없음 (§89①4 가목)';
  } else if (otherHouse === 'one-temp') {
    saleOk = newHouseAcquireDate ? withinYears(newHouseAcquireDate, inwaySaleDate, 3) : false;
    saleDetail = `1주택 보유 + 그 주택 취득(${newHouseAcquireDate}) 후 3년 이내 입주권 양도(${inwaySaleDate}) → ${saleOk ? '충족' : '3년 초과'} (§89①4 나목)`;
  } else {
    saleOk = false; saleDetail = '2주택 이상 보유 → 조합원입주권 양도 비과세 대상 아님';
  }
  checklist.push({ key: 'sale', label: '양도 시점 주택 보유 요건', ok: saleOk, detail: saleDetail });

  // 4) 고가주택
  const { threshold, isHigh } = highPrice(inwaySaleDate, salePrice);
  checklist.push({ key: 'high', label: `고가(양도가액 ${eok(threshold)} 기준)`, ok: !isHigh, warn: isHigh, detail: isHigh ? `${won(salePrice)} > ${eok(threshold)} → 초과분 과세(부분 비과세)` : `${won(salePrice)} 이하 → 전액 비과세 가능` });

  const baseOk = holdOk && live.ok && saleOk;
  let verdict, headline;
  if (!baseOk) { verdict = 'taxable'; headline = '조합원입주권 양도 비과세 불가 — 요건 미충족'; }
  else if (isHigh) { verdict = 'partial'; headline = `${eok(threshold)} 이하 비과세 · 초과분 과세`; }
  else { verdict = 'exempt'; headline = '조합원입주권 양도 비과세'; }

  reasons.push('원조합원(관리처분인가로 입주권 전환)을 전제로 판정합니다. 승계취득 입주권은 이 특례가 적용되지 않습니다.');
  return { mode: 'inway', verdict, headline, checklist, reasons, threshold, isHigh, lawRef: INWAY_LAW };
}

const REPLACE_LAW = [
  '소득세법 시행령 §156의2⑤(재건축·재개발 대체주택 비과세 특례)',
  '소득세법 §95②(고가주택 12억 초과분 과세)',
];

/**
 * B. 대체주택 비과세 특례 판정
 * @param {object} input {
 *   oneHouseAtApproval, replacementAfterApproval, replacementLiveYears,
 *   movedWithin3y, newHouseLiveYears, soldWithin3y, salePrice, saleDate }
 */
export function judgeReplacementHouse(input) {
  const {
    oneHouseAtApproval = true, replacementAfterApproval = true, replacementLiveYears = 0,
    movedWithin3y = true, newHouseLiveYears = 0, soldWithin3y = true,
    salePrice = 0, saleDate = '2024-01-01',
  } = input;

  const checklist = [
    { key: 'one', label: '사업시행계획인가일 현재 1주택 세대', ok: oneHouseAtApproval, detail: oneHouseAtApproval ? '1주택' : '다주택 → 특례 대상 아님' },
    { key: 'after', label: '사업시행인가일 이후 대체주택 취득', ok: replacementAfterApproval, detail: replacementAfterApproval ? '인가 후 취득' : '인가 전 취득 → 특례 대상 아님' },
    { key: 'replive', label: '대체주택에서 1년 이상 거주', ok: replacementLiveYears >= 1, detail: `대체주택 거주 ${replacementLiveYears}년` },
    { key: 'move', label: '신축주택 완공 후 3년 이내 세대전원 이사', ok: movedWithin3y, detail: movedWithin3y ? '3년 이내 이사' : '3년 초과 → 요건 미충족' },
    { key: 'newlive', label: '신축주택에서 1년 이상 계속 거주', ok: newHouseLiveYears >= 1, detail: `신축주택 거주 ${newHouseLiveYears}년` },
    { key: 'sold', label: '신축주택 완공 후 3년 이내 대체주택 양도', ok: soldWithin3y, detail: soldWithin3y ? '3년 이내 양도' : '3년 초과 → 요건 미충족' },
  ];
  const { threshold, isHigh } = highPrice(saleDate, salePrice);
  checklist.push({ key: 'high', label: `고가(양도가액 ${eok(threshold)} 기준)`, ok: !isHigh, warn: isHigh, detail: isHigh ? `초과분 과세(부분 비과세)` : '전액 비과세 가능' });

  const baseOk = checklist.filter((c) => c.key !== 'high').every((c) => c.ok);
  let verdict, headline;
  if (!baseOk) { verdict = 'taxable'; headline = '대체주택 비과세 특례 불가 — 요건 미충족'; }
  else if (isHigh) { verdict = 'partial'; headline = `대체주택 ${eok(threshold)} 이하 비과세 · 초과분 과세`; }
  else { verdict = 'exempt'; headline = '대체주택 양도 비과세 (보유·거주기간 무관 특례)'; }

  const reasons = ['대체주택 특례는 보유·거주기간 요건 없이 위 요건 충족만으로 비과세됩니다. 사업시행인가·완공(준공)·이사·양도 시점의 실제 사실관계 확인이 중요합니다.'];
  return { mode: 'replace', verdict, headline, checklist, reasons, threshold, isHigh, lawRef: REPLACE_LAW };
}

export { won, eok };
