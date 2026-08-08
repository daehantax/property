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
} from './constants.js';

const LAW_REF = [
  '소득세법 §89(양도소득 비과세 — 1세대1주택 12억)',
  '소득세법 §95(장기보유특별공제 — 중과 대상 배제)',
  '소득세법 §104(양도소득세율·조정대상지역 다주택 중과 2026.5.10 부활)',
  '소득세법시행령 §154(1세대1주택 요건)',
];

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

/** 현행 장특공 — 1세대1주택 (보유 연4% max40% + 거주 연4% max40%, 거주 2년 미만 공제 없음) */
function currentSingleDeduct(holdPeriod, stayPeriod) {
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
function deductRates(isWvr, holdPeriod, stayPeriod, reformYear) {
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
 * @returns {{ transferTax: number, localTax: number, total: number, breakdown: object, lawRef: string[] }}
 */
export function calcSaleIncomeTax(
  marketPrice, basePrice, holdPeriod, stayPeriod,
  isWvr, type,
  ownCount = 0, isAdj = 0, isLandtradeApply = 0, saleDate = '', isNewAdj = 0,
  reformYear = 0
) {
  // 양도차익
  const transferIncome = marketPrice - basePrice;

  // 과세 양도차익 (1세대1주택 비과세 제외 — 12억 기준은 개편안에서도 유지)
  let taxableIncome;
  if (isWvr === '1세대1주택') {
    if (marketPrice >= SINGLE_HH_NONTAX_THRESHOLD) {
      // 12억 초과분만 과세 (소득세법 §89②)
      taxableIncome = transferIncome * (marketPrice - SINGLE_HH_NONTAX_THRESHOLD) / marketPrice;
    } else {
      taxableIncome = 0;
    }
  } else {
    taxableIncome = transferIncome;
  }

  // 장기보유특별공제(현행) / 장기거주소득공제(개편안)
  const { holdDeductRate, stayDeductRate, deductCap } =
    deductRates(isWvr, holdPeriod, stayPeriod, reformYear);
  const totalDeductRate = holdDeductRate + stayDeductRate;

  // 공제금액 (개편안: 2028년 20억 / 2029년~ 10억 한도)
  let deductAmt = taxableIncome * totalDeductRate * 0.01;
  if (deductCap > 0 && deductAmt > deductCap) deductAmt = deductCap;

  // 기본공제 (개편안: 10년 이상 거주 + 30억 이하 1세대1주택 2,500만)
  const basicDeduct = basicDeductAmt(isWvr, marketPrice, stayPeriod, reformYear);

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
    r2 = baseR + 0.1;
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
      isAdj, ownCount, isLandtradeApply,
      reformYear,
    },
    lawRef: reformYear ? [...LAW_REF, ...LAW_REF_REFORM] : LAW_REF,
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
