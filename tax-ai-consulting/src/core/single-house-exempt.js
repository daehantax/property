/**
 * 1세대 1주택 양도소득세 비과세 판정기
 * 기준: 소득세법 §89①3, 시행령 §154·§155·§155의3
 * ※ 재건축·재개발(조합원입주권·대체주택 특례)은 제외
 *
 * 핵심 규칙
 *  - 보유요건: 2년 이상 보유 (시행령 §154①)
 *  - 거주요건: 취득 당시 조정대상지역 + 2017.8.3 이후 취득 → 2년 이상 거주 (8·2 대책)
 *      · 예외: 상생임대주택(§155의3), 무주택 세대의 조정지역 공고 전 계약+계약금
 *      · 취득 후 조정지역 지정/해제는 무관 — '취득 당시' 기준
 *  - 고가주택: 양도가액 12억 초과분 과세 (2021.12.8 이후 12억, 이전 9억)
 *  - 보유기간 기산: 원칙 취득일. 2021.1.1~2022.5.9 양도분은 다주택→최종1주택 전환 시
 *      최종 1주택이 된 날부터 재기산(2022.5.10 폐지되어 취득일 기산으로 환원)
 *  - 일시적 2주택: 종전주택 취득 1년 후 신규 취득 + 신규취득 3년 내 종전주택 양도 (§155①)
 */

export const RESIDENCE_REQ_START = '2017-08-03';   // 조정지역 거주요건 도입
export const HIGH_PRICE_12E_START = '2021-12-08';   // 고가주택 기준 9억→12억
export const HIGH_PRICE_12E = 1_200_000_000;
export const HIGH_PRICE_9E = 900_000_000;
export const FINAL_ONE_RESET_START = '2021-01-01';
export const FINAL_ONE_RESET_ABOLISH = '2022-05-10'; // 이 날 이후 양도분은 최종1주택 리셋 폐지
export const TEMP_TWO_DISPOSE_YEARS = 3;             // 일시적 2주택 처분기한(2023.1.12~ 지역무관 3년)
export const SAENGSANG_CONTRACT_START = '2021-12-20';
export const SAENGSANG_CONTRACT_END = '2026-12-31';
export const SAENGSANG_PREV_MONTHS = 18;  // 직전 임대차 1년6개월
export const SAENGSANG_SANG_MONTHS = 24;   // 상생 임대차 2년
export const SAENGSANG_MAX_INCREASE = 5;   // 임대료 인상률 %

const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const eok = (n) => `${(n / 100_000_000).toLocaleString('ko-KR')}억원`;

// ── 날짜 헬퍼 (UTC 고정, 만 N년 경계는 날짜연산으로 정확 판정) ──
const d = (s) => new Date(`${String(s)}T00:00:00Z`);
const addYears = (date, n) => { const x = new Date(date); x.setUTCFullYear(x.getUTCFullYear() + n); return x; };
const meetsYears = (startISO, endISO, n) => d(endISO).getTime() >= addYears(d(startISO), n).getTime();
const yearsBetween = (aISO, bISO) => (d(bISO).getTime() - d(aISO).getTime()) / (365.2425 * 86400000);
const onOrAfter = (aISO, bISO) => d(aISO).getTime() >= d(bISO).getTime();
const within = (aISO, s, e) => d(aISO).getTime() >= d(s).getTime() && d(aISO).getTime() <= d(e).getTime();

/**
 * 상생임대주택 요건 판정 (거주요건 면제 특례)
 * @param {object} p { prevMonths, sangMonths, increasePct, contractDate }
 */
export function judgeSaengsang({ prevMonths = 0, sangMonths = 0, increasePct = 0, contractDate = '' }) {
  const checks = [
    { label: '직전 임대차 1년6개월(18개월) 이상 실제 임대', ok: prevMonths >= SAENGSANG_PREV_MONTHS, detail: `${prevMonths}개월` },
    { label: '상생 임대차 2년(24개월) 이상 실제 임대', ok: sangMonths >= SAENGSANG_SANG_MONTHS, detail: `${sangMonths}개월` },
    { label: '직전 계약 대비 임대료 인상률 5% 이하', ok: increasePct <= SAENGSANG_MAX_INCREASE, detail: `${increasePct}%` },
    { label: '상생 임대차계약 2021.12.20~2026.12.31 체결', ok: !!contractDate && within(contractDate, SAENGSANG_CONTRACT_START, SAENGSANG_CONTRACT_END), detail: contractDate || '(미입력)' },
  ];
  return {
    ok: checks.every((c) => c.ok),
    checks,
    lawRef: ['소득세법 시행령 §155의3(상생임대주택 거주요건 특례)'],
  };
}

const SINGLE_LAW = [
  '소득세법 §89①3(1세대1주택 비과세)',
  '소득세법 시행령 §154(비과세 요건 — 보유·거주)',
  '소득세법 §95②·시행령 §160(고가주택 12억 초과분 과세·장특공)',
];

function residenceJudge(acquiredInAdjust, acquireDate, liveYears, saengsangOk, contractBeforeAdjust) {
  const needLive = acquiredInAdjust && onOrAfter(acquireDate, RESIDENCE_REQ_START);
  if (!needLive) {
    return {
      needLive: false, ok: true,
      detail: acquiredInAdjust ? '취득일이 2017.8.3 이전 → 거주요건 없음(보유만)' : '취득 당시 비조정지역 → 거주요건 없음(보유만)',
    };
  }
  if (saengsangOk) return { needLive: true, ok: true, detail: '조정지역 취득이나 상생임대주택 요건 충족 → 2년 거주요건 면제' };
  if (contractBeforeAdjust) return { needLive: true, ok: true, detail: '무주택 세대가 조정지역 공고 전 매매계약+계약금 지급 → 거주요건 배제' };
  return { needLive: true, ok: liveYears >= 2, detail: `조정지역 취득(2017.8.3 이후) → 2년 거주 필요 (실거주 ${liveYears}년)` };
}

function highPrice(saleDate, salePrice) {
  const threshold = onOrAfter(saleDate, HIGH_PRICE_12E_START) ? HIGH_PRICE_12E : HIGH_PRICE_9E;
  return { threshold, isHigh: salePrice > threshold };
}

/**
 * 1세대 1주택 비과세 판정
 * @param {object} input {
 *   acquireDate, saleDate, acquiredInAdjust, liveYears, isOneHousehold, salePrice,
 *   saengsangOk, contractBeforeAdjust, finalOneReset, finalOneDate }
 */
export function judgeSingleHouseExempt(input) {
  const {
    acquireDate, saleDate, acquiredInAdjust = false, liveYears = 0,
    isOneHousehold = true, salePrice = 0,
    saengsangOk = false, contractBeforeAdjust = false,
    finalOneReset = false, finalOneDate = null,
  } = input;

  const reasons = [];
  const checklist = [];

  // 1) 보유요건 (기산일 결정)
  let holdStart = acquireDate;
  if (finalOneReset && within(saleDate, FINAL_ONE_RESET_START, '2022-05-09') && finalOneDate) {
    holdStart = finalOneDate;
    reasons.push(`양도일이 2021.1.1~2022.5.9 사이 + 과거 다주택→1주택 전환 → 보유기간을 최종 1주택이 된 날(${finalOneDate})부터 기산 (2022.5.10 폐지된 규정)`);
  } else if (finalOneReset && onOrAfter(saleDate, FINAL_ONE_RESET_ABOLISH)) {
    reasons.push('과거 다주택이었으나 2022.5.10 이후 양도 → 최종1주택 보유기간 리셋 규정 폐지, 취득일부터 기산');
  }
  const holdOk = meetsYears(holdStart, saleDate, 2);
  checklist.push({ key: 'hold', label: '보유기간 2년 이상', ok: holdOk, detail: `${yearsBetween(holdStart, saleDate).toFixed(1)}년 (기산 ${holdStart} → 양도 ${saleDate})` });

  // 2) 거주요건
  const live = residenceJudge(acquiredInAdjust, acquireDate, liveYears, saengsangOk, contractBeforeAdjust);
  checklist.push({ key: 'live', label: live.needLive ? '거주기간 2년 이상 (조정지역 취득)' : '거주요건 (해당 없음)', ok: live.ok, detail: live.detail });

  // 3) 1세대 1주택
  checklist.push({ key: 'one', label: '양도 시점 1세대 1주택', ok: isOneHousehold, detail: isOneHousehold ? '1주택 보유' : '2주택 이상 → 일시적 2주택 등 별도 판정 필요' });

  // 4) 고가주택
  const { threshold, isHigh } = highPrice(saleDate, salePrice);
  checklist.push({ key: 'high', label: `고가주택(양도가액 ${eok(threshold)} 기준)`, ok: !isHigh, warn: isHigh, detail: isHigh ? `${won(salePrice)} > ${eok(threshold)} → 초과분 과세(부분 비과세)` : `${won(salePrice)} 이하 → 전액 비과세 가능` });

  const baseOk = holdOk && live.ok && isOneHousehold;
  let verdict, headline;
  if (!baseOk) { verdict = 'taxable'; headline = '비과세 불가 — 요건 미충족'; }
  else if (isHigh) {
    verdict = 'partial'; headline = `${eok(threshold)} 이하 비과세 · 초과분 과세 (고가주택)`;
    const ratio = (salePrice - threshold) / salePrice;
    reasons.push(`고가주택: 양도차익 중 (양도가액−${eok(threshold)})/양도가액 ≈ ${(ratio * 100).toFixed(1)}% 상당이 과세. 장기보유특별공제는 1세대1주택 표(보유·거주 각 연 4%, 최대 80%) 적용.`);
  } else { verdict = 'exempt'; headline = '1세대 1주택 비과세'; }

  return { mode: 'single', verdict, headline, checklist, reasons, threshold, isHigh, lawRef: SINGLE_LAW };
}

const TEMP_LAW = [
  '소득세법 시행령 §155①(일시적 2주택 비과세 특례)',
  '소득세법 시행령 §154(종전주택 보유·거주 요건)',
];

/**
 * 일시적 2주택 — 종전주택 양도 비과세 판정
 * @param {object} input {
 *   prevAcquireDate, newAcquireDate, prevSaleDate,
 *   prevAcquiredInAdjust, prevLiveYears, salePrice, saengsangOk }
 */
export function judgeTempTwoExempt(input) {
  const {
    prevAcquireDate, newAcquireDate, prevSaleDate,
    prevAcquiredInAdjust = false, prevLiveYears = 0, salePrice = 0, saengsangOk = false,
  } = input;

  const reasons = [];
  const checklist = [];

  // 1) 종전주택 취득 후 1년 이상 지나 신규 취득
  const gapOk = meetsYears(prevAcquireDate, newAcquireDate, 1);
  checklist.push({ key: 'gap', label: '종전주택 취득 1년 후 신규주택 취득', ok: gapOk, detail: `${yearsBetween(prevAcquireDate, newAcquireDate).toFixed(1)}년 경과` });

  // 2) 신규취득일부터 3년 이내 종전주택 양도
  const disposeOk = d(prevSaleDate).getTime() <= addYears(d(newAcquireDate), TEMP_TWO_DISPOSE_YEARS).getTime();
  checklist.push({ key: 'dispose', label: '신규주택 취득 3년 이내 종전주택 양도', ok: disposeOk, detail: `신규취득 ${newAcquireDate} → 양도 ${prevSaleDate} (${yearsBetween(newAcquireDate, prevSaleDate).toFixed(1)}년)` });
  if (!onOrAfter(prevSaleDate, '2023-01-12')) {
    reasons.push('2023.1.12 이전 양도는 종전·신규 모두 조정지역이면 처분기한이 1~2년으로 단축됐을 수 있어 별도 확인 필요');
  }

  // 3) 종전주택 비과세 요건 (보유 2년 + 거주)
  const holdOk = meetsYears(prevAcquireDate, prevSaleDate, 2);
  checklist.push({ key: 'hold', label: '종전주택 보유 2년 이상', ok: holdOk, detail: `${yearsBetween(prevAcquireDate, prevSaleDate).toFixed(1)}년` });
  const live = residenceJudge(prevAcquiredInAdjust, prevAcquireDate, prevLiveYears, saengsangOk, false);
  checklist.push({ key: 'live', label: live.needLive ? '종전주택 거주 2년 이상 (조정 취득)' : '거주요건 (해당 없음)', ok: live.ok, detail: live.detail });

  // 4) 고가주택
  const { threshold, isHigh } = highPrice(prevSaleDate, salePrice);
  checklist.push({ key: 'high', label: `고가주택(양도가액 ${eok(threshold)} 기준)`, ok: !isHigh, warn: isHigh, detail: isHigh ? `초과분 과세(부분 비과세)` : '전액 비과세 가능' });

  const baseOk = gapOk && disposeOk && holdOk && live.ok;
  let verdict, headline;
  if (!baseOk) { verdict = 'taxable'; headline = '일시적 2주택 비과세 불가 — 요건 미충족'; }
  else if (isHigh) { verdict = 'partial'; headline = `종전주택 ${eok(threshold)} 이하 비과세 · 초과분 과세`; }
  else { verdict = 'exempt'; headline = '일시적 2주택 — 종전주택 양도 비과세'; }

  return { mode: 'temp', verdict, headline, checklist, reasons, threshold, isHigh, lawRef: TEMP_LAW };
}

export { won, eok };
