/**
 * 양도소득세 계산 모듈
 * 기준: 소득세법 (2026.5.10 — 다주택 중과 부활 반영)
 *      + 2026 세제개편안 (2026.8.3 발표 정부안) 선택 반영 (reformYear)
 *
 * [핵심 변경사항]
 * 1. 1세대1주택 비과세 고가주택 기준: 12억 (2022.1.1 이후, 소득세법 §89②)
 *    ※ 원본 코드의 9억 기준은 오류 — 12억으로 수정
 * 2. 2026.5.10부터 조정지역 다주택 중과 부활
 *    - 2주택: 기본세율 +20%p
 *    - 3주택 이상: 기본세율 +30%p
 * 3. 토지거래허가 신청분(5/9까지) 중과 배제 보완책
 *
 * [2026 세제개편안 — reformYear 지정 시 반영, 국회 통과 전 정부안]
 * 1. 조정지역 다주택 중과 한시 완화: 2027년 +5%p/+10%p, 2028년 +10%p/+15%p,
 *    2029년부터 +20%p/+30%p 복귀
 * 2. 장기보유특별공제 → 장기거주소득공제 (2028.1.1 이후 양도분):
 *    - 1주택 2028: 보유 연2%(max20%) + 거주 연6%(max60%) / 2029~: 거주만 연8%(max80%)
 *    - 다주택: 보유공제 폐지, 2년 이상 거주 시 거주기간 연2%(max30%)
 *    - 공제금액 한도 신설: 2028년 20억 / 2029년~ 10억
 * 3. 1세대1주택 기본공제 확대: 10년 이상 거주 + 양도가액 30억 이하 → 250만 → 2,500만
 *    (시행연도 2029 가정 — 조문 확정 시 재검토)
 * 4. 1세대1주택 비과세 12억 기준·단기양도세율(70%/60%)은 변경 없음
 */

import {
  SINGLE_HH_NONTAX_THRESHOLD,
  LANDTRADE_DEADLINE_OLD_ADJ,
  LANDTRADE_DEADLINE_NEW_ADJ,
  REFORM2026,
  NONBIZ_LAND_SURCHARGE,
  UNREGISTERED_RATE,
} from './constants.js';

const LAW_REF = [
  '소득세법 §89(양도소득 비과세 — 1세대1주택 12억)',
  '소득세법 §95(장기보유특별공제 — 중과 대상 배제)',
  '소득세법 §104(양도소득세율·조정대상지역 다주택 중과 2026.5.10 부활)',
  '소득세법시행령 §154(1세대1주택 요건)',
];

/** 주택 외 자산(토지·건물·비사업용 토지)·필요경비·미등기 관련 근거 */
const LAW_REF_ASSET = {
  expense: '소득세법 §97·시행령 §163(필요경비 — 취득가액·취득부대비용·자본적 지출·양도비)',
  ltd: '소득세법 §95②(장기보유특별공제 표1 — 3년 이상 보유 토지·건물 연 2%, 최대 30%)',
  shortTerm: '소득세법 §104①2·3(토지·건물 단기양도 — 1년 미만 50%, 2년 미만 40%)',
  nonBiz: '소득세법 §104①8·§104의3, 시행령 §168의6~§168의14(비사업용 토지 — 기본세율 +10%p)',
  unreg: '소득세법 §104①10·§91·§95②·§103(미등기 양도 — 70%, 비과세·장기보유특별공제·기본공제 배제)',
  hold: '소득세법 §95④·§104②(보유기간 — 취득일부터 양도일까지)',
};

const LAW_REF_REFORM = [
  '2026 세제개편안(2026.8.3 정부안) — 다주택 중과 한시 완화(2027~2028)',
  '2026 세제개편안(2026.8.3 정부안) — 장기거주소득공제 전환·공제한도(2028.1.1 이후 양도분)',
  '2026 세제개편안(2026.8.3 정부안) — 1세대1주택 기본공제 확대(10년 거주·30억 이하)',
  '※ 국회 통과 전 정부안 기준 — 조문 확정 시 재검토 필요',
];

/** 종합소득 과세표준 구간별 기본세율·누진공제 */
function baseBracket(income) {
  if      (income <= 14_000_000)   return { baseR: 0.06, baseDc: 0 };
  else if (income <= 50_000_000)   return { baseR: 0.15, baseDc: 1_260_000 };
  else if (income <= 88_000_000)   return { baseR: 0.24, baseDc: 5_760_000 };
  else if (income <= 150_000_000)  return { baseR: 0.35, baseDc: 15_440_000 };
  else if (income <= 300_000_000)  return { baseR: 0.38, baseDc: 19_940_000 };
  else if (income <= 500_000_000)  return { baseR: 0.40, baseDc: 25_940_000 };
  else if (income <= 1_000_000_000) return { baseR: 0.42, baseDc: 35_940_000 };
  else                              return { baseR: 0.45, baseDc: 65_940_000 };
}

/**
 * 현행 장특공 — 1세대1주택 표2 (보유 연4% max40% + 거주 연4% max40%)
 * 소득세법 §95② 표2는 「보유 3년 이상 + 거주 2년 이상」인 1세대1주택에 적용되고,
 * 거주 2년 미만이면 표1(보유 연2%, 최대 30%)로 돌아간다 — 공제 0이 아님.
 */
function currentSingleDeduct(holdPeriod, stayPeriod) {
  if (stayPeriod < 2) return currentOtherDeduct(holdPeriod);
  let holdDeductRate = 0, stayDeductRate = 0;
  if (stayPeriod >= 2) {
    if      (holdPeriod >= 10) holdDeductRate = 40;
    else if (holdPeriod >= 9)  holdDeductRate = 36;
    else if (holdPeriod >= 8)  holdDeductRate = 32;
    else if (holdPeriod >= 7)  holdDeductRate = 28;
    else if (holdPeriod >= 6)  holdDeductRate = 24;
    else if (holdPeriod >= 5)  holdDeductRate = 20;
    else if (holdPeriod >= 4)  holdDeductRate = 16;
    else if (holdPeriod >= 3)  holdDeductRate = 12;

    if (holdPeriod >= 3) {
      if      (stayPeriod >= 10) stayDeductRate = 40;
      else if (stayPeriod >= 9)  stayDeductRate = 36;
      else if (stayPeriod >= 8)  stayDeductRate = 32;
      else if (stayPeriod >= 7)  stayDeductRate = 28;
      else if (stayPeriod >= 6)  stayDeductRate = 24;
      else if (stayPeriod >= 5)  stayDeductRate = 20;
      else if (stayPeriod >= 4)  stayDeductRate = 16;
      else if (stayPeriod >= 3)  stayDeductRate = 12;
      else                       stayDeductRate = 8;
    }
  }
  return { holdDeductRate, stayDeductRate };
}

/** 현행 장특공 — 다주택·기타 (보유 연2%, 최대 30%) */
function currentOtherDeduct(holdPeriod) {
  let holdDeductRate = 0;
  if      (holdPeriod >= 15) holdDeductRate = 30;
  else if (holdPeriod >= 3)  holdDeductRate = Math.floor(holdPeriod) * 2;
  return { holdDeductRate, stayDeductRate: 0 };
}

/**
 * 장기보유특별공제(현행) / 장기거주소득공제(개편안) 공제율·한도 산정
 * @returns {{ holdDeductRate:number, stayDeductRate:number, deductCap:number }} 공제율(%)·공제금액 한도(0=무제한)
 */
function deductRates(isWvr, holdPeriod, stayPeriod, reformYear, type = '주택') {
  // 주택 외 자산(토지·건물): 장기거주소득공제 전환 대상이 아니므로 표1(보유 연2%, 최대 30%) 유지.
  // 단, 개편안은 비사업용 토지의 장기보유특별공제를 2028.1.1 이후 양도분부터 배제한다.
  if (type !== '주택') {
    if (type === '비사업토지' && reformYear >= REFORM2026.NONBIZ_LAND_FROM) {
      return { holdDeductRate: 0, stayDeductRate: 0, deductCap: 0 };
    }
    return { ...currentOtherDeduct(holdPeriod), deductCap: 0 };
  }
  // 현행 또는 개편안 유예기간(~2027 양도분): 기존 장특공 그대로
  if (!reformYear || reformYear < 2028) {
    const r = isWvr === '1세대1주택'
      ? currentSingleDeduct(holdPeriod, stayPeriod)
      : currentOtherDeduct(holdPeriod);
    return { ...r, deductCap: 0 };
  }

  // 개편안 2028.1.1 이후 양도분 — 장기거주소득공제 (보유 3년 이상 요건 유지 가정)
  const deductCap = REFORM2026.DEDUCT_CAP[reformYear] ?? REFORM2026.DEDUCT_CAP_FINAL;
  if (holdPeriod < 3) return { holdDeductRate: 0, stayDeductRate: 0, deductCap };

  if (isWvr === '1세대1주택') {
    if (stayPeriod < 2) return { holdDeductRate: 0, stayDeductRate: 0, deductCap };
    if (reformYear === 2028) {
      // 중간단계: 보유 연2%(max20%) + 거주 연6%(max60%)
      return {
        holdDeductRate: Math.min(Math.floor(holdPeriod) * 2, 20),
        stayDeductRate: Math.min(Math.floor(stayPeriod) * 6, 60),
        deductCap,
      };
    }
    // 2029~: 보유공제 폐지, 거주 연8% max80%
    return {
      holdDeductRate: 0,
      stayDeductRate: Math.min(Math.floor(stayPeriod) * 8, 80),
      deductCap,
    };
  }

  // 다주택·기타: 보유공제 폐지, 2년 이상 거주 시 거주기간 연2% max30%
  if (stayPeriod < 2) return { holdDeductRate: 0, stayDeductRate: 0, deductCap };
  return {
    holdDeductRate: 0,
    stayDeductRate: Math.min(Math.floor(stayPeriod) * 2, 30),
    deductCap,
  };
}

/** 양도소득 기본공제 (개편안: 10년 이상 거주 + 30억 이하 1세대1주택 2,500만 — 2029 시행 가정) */
function basicDeductAmt(isWvr, marketPrice, stayPeriod, reformYear) {
  if (
    reformYear >= 2029 &&
    isWvr === '1세대1주택' &&
    stayPeriod >= REFORM2026.BASIC_DEDUCT_STAY_MIN &&
    marketPrice <= REFORM2026.BASIC_DEDUCT_PRICE_LIMIT
  ) {
    return REFORM2026.BASIC_DEDUCT_EXPANDED;
  }
  return 2_500_000;
}

/** 조정지역 다주택 중과 가산폭 (개편안: 2027~2028 한시 완화) */
function heavySurcharge(ownCount, reformYear) {
  const s = (reformYear && REFORM2026.HEAVY_SURCHARGE[reformYear])
    ? REFORM2026.HEAVY_SURCHARGE[reformYear]
    : REFORM2026.HEAVY_SURCHARGE_DEFAULT;
  return ownCount === 2 ? s.two : s.threePlus;
}

/**
 * 양도소득세 및 지방소득세 계산
 *
 * @param {number} marketPrice   양도가액(시가) [원]
 * @param {number} basePrice     취득가액(필요경비) [원]
 * @param {number} holdPeriod    보유기간 [년]
 * @param {number} stayPeriod    거주기간 [년]
 * @param {string} isWvr         비과세 여부 ("1세대1주택" | "다주택" | "기타")
 * @param {string} type          자산 유형 ("주택" | "토지" | "건물" | "비사업토지")
 * @param {number} [ownCount=0]  보유 주택수 (중과 판정용, 2 또는 3+)
 * @param {number} [isAdj=0]     조정대상지역 여부 (0/1)
 * @param {number} [isLandtradeApply=0] 토지거래허가 신청분 여부 (0/1)
 * @param {string} [saleDate=""] 양도일 ISO 문자열 "YYYY-MM-DD" (마감일 체크용)
 * @param {number} [isNewAdj=0]  2025.10.16 신규 조정지역 여부 (0/1)
 * @param {number} [reformYear=0] 2026 세제개편안 반영 시 양도(예정)연도 (0=현행법, 2027~)
 * @param {number} [exemptBasePrice=0] 1세대1주택 고가주택(12억) 판정·안분 기준 가액 [원].
 *   지분 양도·부담부증여(채무 인수분 양도)처럼 양도가액(marketPrice)이 주택 일부에 해당하면
 *   고가주택 여부와 12억 초과 비율은 주택 전체 가액으로 판정한다(소득세법 시행령 §156③·§160).
 *   0이면 marketPrice와 동일(주택 전체 양도).
 * @param {{ unregistered?: boolean }} [opts] 추가 옵션. unregistered=true 이면 미등기 양도
 *   (세율 70%, 비과세·장기보유특별공제·기본공제 배제 — 소득세법 §104①10·§91·§95②·§103)
 * @returns {{ transferTax: number, localTax: number, total: number, breakdown: object, lawRef: string[] }}
 */
export function calcSaleIncomeTax(
  marketPrice, basePrice, holdPeriod, stayPeriod,
  isWvr, type,
  ownCount = 0, isAdj = 0, isLandtradeApply = 0, saleDate = '', isNewAdj = 0,
  reformYear = 0, exemptBasePrice = 0, opts = {}
) {
  const unregistered = !!opts.unregistered;
  if (unregistered) isWvr = '기타';   // 미등기 양도는 1세대1주택 비과세 배제 (§91)

  // 양도차익
  const transferIncome = marketPrice - basePrice;

  // 고가주택 판정 기준 가액 (지분·부담부증여는 주택 전체 가액)
  const exemptBase = exemptBasePrice > 0 ? exemptBasePrice : marketPrice;

  // 과세 양도차익 (1세대1주택 비과세 제외 — 12억 기준은 개편안에서도 유지)
  let taxableIncome;
  if (isWvr === '1세대1주택') {
    if (exemptBase >= SINGLE_HH_NONTAX_THRESHOLD) {
      // 12억 초과분만 과세 (소득세법 §89②, 시행령 §160①)
      taxableIncome = transferIncome * (exemptBase - SINGLE_HH_NONTAX_THRESHOLD) / exemptBase;
    } else {
      taxableIncome = 0;
    }
  } else {
    taxableIncome = transferIncome;
  }

  // 장기보유특별공제(현행) / 장기거주소득공제(개편안)
  const { holdDeductRate, stayDeductRate, deductCap } =
    unregistered
      ? { holdDeductRate: 0, stayDeductRate: 0, deductCap: 0 }
      : deductRates(isWvr, holdPeriod, stayPeriod, reformYear, type);
  const totalDeductRate = holdDeductRate + stayDeductRate;

  // 공제금액 (개편안: 2028년 20억 / 2029년~ 10억 한도) — 양도차손이면 공제 없음
  let deductAmt = Math.max(taxableIncome, 0) * totalDeductRate * 0.01;
  if (deductCap > 0 && deductAmt > deductCap) deductAmt = deductCap;

  // 기본공제 (개편안: 10년 이상 거주 + 30억 이하 1세대1주택 2,500만) — 미등기는 배제
  const basicDeduct = unregistered ? 0 : basicDeductAmt(isWvr, marketPrice, stayPeriod, reformYear);

  const incomeFinal = Math.max(taxableIncome - deductAmt - basicDeduct, 0);

  // 기본세율 (장특공 적용 과세표준 기준)
  const { baseR, baseDc } = baseBracket(incomeFinal);

  let finalRate = baseR;
  let finalDc   = baseDc;
  let heavyIncome = 0;

  // 경합1: 보유기간 2년 미만 단일중과세율 (개편안 변경 없음)
  let r1 = 0;
  if (type === '주택') {
    if      (holdPeriod < 1) r1 = 0.70;
    else if (holdPeriod < 2) r1 = 0.60;
  } else {
    if      (holdPeriod < 1) r1 = 0.50;
    else if (holdPeriod < 2) r1 = 0.40;
  }
  const totalTax1 = incomeFinal * r1;

  // 경합2: 조정지역 다주택 중과 (2026.5.10 부활 / 개편안 2027~2028 한시 완화) / 비사업토지 중과
  let r2 = 0, totalTax2 = 0, dc2 = baseDc; // dc2: 경합2 세액에 실제 사용된 누진공제
  if (type === '비사업토지') {
    // 비사업용 토지: 기본세율 +10%p (개편안: 2028.1.1 이후 양도분 +20%p)
    r2 = baseR + (reformYear >= REFORM2026.NONBIZ_LAND_FROM
      ? REFORM2026.NONBIZ_LAND_SURCHARGE : NONBIZ_LAND_SURCHARGE);
    dc2 = baseDc;
    totalTax2 = Math.max(incomeFinal * r2 - dc2, 0);
  } else if (type === '주택' && isAdj === 1 && ownCount >= 2) {
    let landtradeExempt = false;
    if (isLandtradeApply === 1 && saleDate !== '') {
      const deadline = isNewAdj === 1 ? LANDTRADE_DEADLINE_NEW_ADJ : LANDTRADE_DEADLINE_OLD_ADJ;
      if (saleDate <= deadline) landtradeExempt = true;
    }
    if (!landtradeExempt) {
      // 중과 대상은 장기보유특별공제 배제 (소득세법 §95②) → 공제 없는 과세표준으로 재계산
      heavyIncome = Math.max(taxableIncome - basicDeduct, 0);
      const heavyBracket = baseBracket(heavyIncome);
      r2 = heavyBracket.baseR + heavySurcharge(ownCount, reformYear);
      dc2 = heavyBracket.baseDc; // 중과 과세표준(heavyIncome) 기준 누진공제
      totalTax2 = Math.max(heavyIncome * r2 - dc2, 0);
    }
  }

  // 경합 처리: 단기·중과 세액이 있으면 그중 큰 세액, 없으면 기본세율 세액
  const baseTax = Math.max(incomeFinal * baseR - baseDc, 0);
  let chosenTax = baseTax;
  if (totalTax1 !== 0 || totalTax2 !== 0) {
    if (totalTax1 > totalTax2) { chosenTax = totalTax1; finalRate = r1; finalDc = 0; }
    else                        { chosenTax = totalTax2; finalRate = r2; finalDc = dc2; }
  }

  // 미등기 양도: 다른 세율과 경합 없이 70% 단일세율
  if (unregistered) { chosenTax = incomeFinal * UNREGISTERED_RATE; finalRate = UNREGISTERED_RATE; finalDc = 0; }

  const transferTax  = Math.floor(chosenTax);
  const localTax     = Math.floor(transferTax * 0.1);

  // 실제 과세에 사용된 과세표준을 명확히 표기한다.
  //  - 중과 적용 시: heavyIncome(장특공 배제) 사용
  //  - 단기(2년 미만) 단일세율: incomeFinal에 r1 적용 (누진공제 없음)
  //  - 그 외 기본세율: incomeFinal 사용
  // incomeFinal(장특공 반영)과 heavyIncome(장특공 배제)이 함께 담기므로,
  // 최종 세액의 근거가 되는 과세표준은 appliedIncome 하나로 확인한다.
  // 주택 다주택 중과가 실제로 적용된 경우에만 장특공 배제 과세표준(heavyIncome)을 쓴다.
  // (비사업토지 중과는 장특공을 배제하지 않으므로 incomeFinal 유지)
  const heavyApplied = type === '주택' && r2 > 0 && finalRate === r2;
  const appliedIncome = heavyApplied ? heavyIncome : incomeFinal;

  return {
    transferTax,
    localTax,
    total: transferTax + localTax,
    breakdown: {
      marketPrice, basePrice, transferIncome,
      taxableIncome, incomeFinal,
      holdDeductRate, stayDeductRate, totalDeductRate,
      deductAmt, deductCap, basicDeduct,
      baseR, baseDc, finalRate, finalDc, heavyIncome,
      r1, r2, appliedR: finalRate,
      heavyApplied, appliedIncome,
      nonTaxThreshold: SINGLE_HH_NONTAX_THRESHOLD,
      exemptBase,
      isAdj, ownCount, isLandtradeApply,
      reformYear,
      type, isWvr, unregistered,
      nonBizApplied: type === '비사업토지' && !unregistered && finalRate === r2,
      shortTermApplied: !unregistered && r1 > 0 && finalRate === r1 && chosenTax === totalTax1,
    },
    lawRef: reformYear ? [...LAW_REF, ...LAW_REF_REFORM] : LAW_REF,
  };
}

// ── 날짜 유틸 ('YYYY-MM-DD', UTC) ─────────────────────────────────────
const isISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
function addMonthsISO(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  // 해당일이 없는 달(예: 2.29 취득 → 평년 2월)은 그 달 말일의 다음 날을 응당일로 본다
  if (d > last) t.setUTCMonth(t.getUTCMonth() + 1); else t.setUTCDate(d);
  return t.toISOString().slice(0, 10);
}
const addDaysISO = (s, n) => new Date(Date.parse(`${s}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * 보유기간 계산 — 취득일부터 양도일까지, 취득일(초일)을 산입한다.
 * 예) 2024-03-15 취득 → 2026-03-14 양도 = 만 2년 (2년 미만 단기세율 아님)
 *     2024-03-15 취득 → 2026-03-13 양도 = 1년 11개월 (2년 미만)
 * @returns {{ valid:boolean, years:number, months:number, totalMonths:number, text:string }}
 */
export function holdingPeriod(acquireDate, saleDate) {
  if (!isISO(acquireDate) || !isISO(saleDate) || saleDate < acquireDate) {
    return { valid: false, years: 0, months: 0, totalMonths: 0, text: '' };
  }
  const end = addDaysISO(saleDate, 1);   // 초일산입 → 양도일 다음 날까지의 경과기간
  let total = (Number(end.slice(0, 4)) - Number(acquireDate.slice(0, 4))) * 12
    + (Number(end.slice(5, 7)) - Number(acquireDate.slice(5, 7)));
  while (total > 0 && addMonthsISO(acquireDate, total) > end) total -= 1;
  const years = Math.floor(total / 12), months = total % 12;
  const text = `${years ? `${years}년 ` : ''}${months || !years ? `${months}개월` : ''}`.trim();
  return { valid: true, years, months, totalMonths: total, text };
}

/** 필요경비 항목 (입력 키 → 표시 이름). 소득세법 §97·시행령 §163 */
export const EXPENSE_ITEMS = [
  { key: 'acqTax', label: '취득세 (농어촌특별세·지방교육세 포함)', group: '취득부대비용' },
  { key: 'acqLegalFee', label: '법무사 수수료·등기비용 (인지대·채권매각차손 포함)', group: '취득부대비용' },
  { key: 'acqBrokerFee', label: '취득 시 중개수수료', group: '취득부대비용' },
  { key: 'capitalExpense', label: '자본적 지출 (확장·샤시·보일러 교체 등)', group: '자본적 지출' },
  { key: 'saleBrokerFee', label: '양도 시 중개수수료', group: '양도비' },
  { key: 'otherExpense', label: '기타 (양도세 신고서 작성비용·명도비용·소송비용 등)', group: '양도비 등' },
];

const ASSET_TYPES = {
  주택: { type: '주택', label: '주택' },
  토지: { type: '토지', label: '토지 (사업용)' },
  건물: { type: '건물', label: '건물 (상가·사무실 등 주택 외)' },
  비사업토지: { type: '비사업토지', label: '비사업용 토지' },
};

/**
 * 양도소득세 상세 계산 — 자산 유형·취득일/양도일·필요경비 항목을 받아 계산한다.
 *
 * 보유기간은 취득일~양도일(초일산입)로 자동 계산하고, 필요경비는 항목별 금액을 합산해
 * 취득가액에 더한다. 세액 계산은 calcSaleIncomeTax 를 그대로 쓴다.
 *
 * @param {object} p
 * @param {'주택'|'토지'|'건물'|'비사업토지'} p.assetType 자산 유형
 * @param {string} p.acquireDate 취득일 'YYYY-MM-DD'
 * @param {string} p.saleDate    양도일 'YYYY-MM-DD'
 * @param {number} p.salePrice   양도가액 [원]
 * @param {number} p.acquirePrice 취득가액(실지거래가액) [원]
 * @param {object} [p.expenses]  필요경비 항목별 금액 — 키는 EXPENSE_ITEMS 참조
 * @param {number} [p.stayYears=0] 거주기간 [년] (주택만)
 * @param {string} [p.isWvr='기타'] '1세대1주택' | '다주택' | '기타' (주택만)
 * @param {number} [p.ownCount=0] 보유 주택수 (주택 중과 판정)
 * @param {number} [p.isAdj=0]   양도 당시 조정대상지역 여부 (주택 중과 판정)
 * @param {boolean} [p.unregistered=false] 미등기 양도 여부
 * @param {number} [p.reformYear=0] 2026 세제개편안 반영 시 양도연도 (0=현행법)
 */
export function calcSaleIncomeTaxDetailed(p) {
  const asset = ASSET_TYPES[p.assetType] ?? ASSET_TYPES['주택'];
  const isHouse = asset.type === '주택';
  const hp = holdingPeriod(p.acquireDate, p.saleDate);
  if (!hp.valid) throw new Error('취득일과 양도일을 확인하세요 (양도일이 취득일보다 빠를 수 없습니다).');

  const expenseItems = EXPENSE_ITEMS
    .map((it) => ({ ...it, amount: Math.max(Number(p.expenses?.[it.key]) || 0, 0) }))
    .filter((it) => it.amount > 0);
  const expenseTotal = expenseItems.reduce((a, it) => a + it.amount, 0);
  const acquirePrice = Number(p.acquirePrice) || 0;

  // 엔진은 보유연수를 「만 연수」로만 쓴다 (1년·2년 미만 단기세율, 3년 이상 장특공, 연 단위 공제율)
  const r = calcSaleIncomeTax(
    Number(p.salePrice) || 0, acquirePrice + expenseTotal, hp.years, isHouse ? (Number(p.stayYears) || 0) : 0,
    isHouse ? (p.isWvr || '기타') : '기타', asset.type,
    isHouse ? (Number(p.ownCount) || 0) : 0, isHouse ? (Number(p.isAdj) || 0) : 0,
    0, p.saleDate, 0, Number(p.reformYear) || 0, 0, { unregistered: !!p.unregistered },
  );

  const lawRef = [...r.lawRef, LAW_REF_ASSET.expense, LAW_REF_ASSET.hold];
  if (!isHouse) lawRef.push(LAW_REF_ASSET.ltd, LAW_REF_ASSET.shortTerm);
  if (asset.type === '비사업토지') lawRef.push(LAW_REF_ASSET.nonBiz);
  if (p.unregistered) lawRef.push(LAW_REF_ASSET.unreg);
  if (asset.type === '비사업토지' && r.breakdown.reformYear) {
    lawRef.push('2026 세제개편안(2026.8.3 정부안) — 비사업용 토지 가산세율 +10%p → +20%p·장기보유특별공제 배제(2028.1.1 이후 양도분)');
  }

  return {
    ...r,
    breakdown: {
      ...r.breakdown,
      assetType: asset.type, assetLabel: asset.label,
      acquireDate: p.acquireDate, saleDate: p.saleDate,
      holdYears: hp.years, holdMonths: hp.months, holdText: hp.text,
      acquirePrice, expenseItems, expenseTotal,
    },
    // 주택이 아니면 주택 전용 근거(§89 비과세·§154)는 빼고 보여 준다
    lawRef: isHouse ? lawRef : lawRef.filter((l) => !/§89|§154|조정대상지역 다주택|다주택 중과|장기거주소득공제|1세대1주택 기본공제/.test(l)),
  };
}

/**
 * 2026 세제개편안 반영 전/후 비교 계산
 *
 * 동일 조건으로 현행법(반영 전)과 개편안(반영 후, 양도연도별 레짐)을 각각 계산해
 * 세액 차이를 반환한다.
 *
 * @param {number} reformYear 양도(예정)연도 (2027~2029; 2026 이하는 개편 전과 동일)
 * @param {...*} args calcSaleIncomeTax와 동일 (marketPrice ~ isNewAdj)
 * @returns {{ current: object, reform: object, diff: { transferTax:number, localTax:number, total:number } }}
 */
export function compareSaleIncomeTaxReform2026(reformYear, ...args) {
  const current = calcSaleIncomeTax(...args);
  const reform  = calcSaleIncomeTax(...args.concat(
    Array(Math.max(11 - args.length, 0)).fill(undefined)
  ).slice(0, 11), reformYear);
  return {
    current,
    reform,
    diff: {
      transferTax: reform.transferTax - current.transferTax,
      localTax:    reform.localTax    - current.localTax,
      total:       reform.total       - current.total,
    },
  };
}
