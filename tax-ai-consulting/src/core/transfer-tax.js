/**
 * 양도소득세 계산 모듈
 * 기준: 소득세법 (2026.5.10 — 다주택 중과 부활 반영)
 *
 * [핵심 변경사항]
 * 1. 1세대1주택 비과세 고가주택 기준: 12억 (2022.1.1 이후, 소득세법 §89②)
 *    ※ 원본 코드의 9억 기준은 오류 — 12억으로 수정
 * 2. 2026.5.10부터 조정지역 다주택 중과 부활
 *    - 2주택: 기본세율 +20%p
 *    - 3주택 이상: 기본세율 +30%p
 * 3. 토지거래허가 신청분(5/9까지) 중과 배제 보완책
 */

import {
  SINGLE_HH_NONTAX_THRESHOLD,
  LANDTRADE_DEADLINE_OLD_ADJ,
  LANDTRADE_DEADLINE_NEW_ADJ,
} from './constants.js';

const LAW_REF = [
  '소득세법 §89(양도소득 비과세 — 1세대1주택 12억)',
  '소득세법 §95(장기보유특별공제 — 중과 대상 배제)',
  '소득세법 §104(양도소득세율·조정대상지역 다주택 중과 2026.5.10 부활)',
  '소득세법시행령 §154(1세대1주택 요건)',
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
 * @returns {{ transferTax: number, localTax: number, total: number, breakdown: object, lawRef: string[] }}
 */
export function calcSaleIncomeTax(
  marketPrice, basePrice, holdPeriod, stayPeriod,
  isWvr, type,
  ownCount = 0, isAdj = 0, isLandtradeApply = 0, saleDate = '', isNewAdj = 0
) {
  // 양도차익
  const transferIncome = marketPrice - basePrice;

  // 과세 양도차익 (1세대1주택 비과세 제외)
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

  // 장기보유특별공제
  let holdDeductRate = 0, stayDeductRate = 0;

  if (isWvr === '1세대1주택') {
    // 1세대1주택: 보유+거주 각각 최대 40%, 거주 2년 미만 시 공제 없음
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
  } else {
    // 다주택·기타: 보유기간만 (연 2%, 최대 30%)
    if      (holdPeriod >= 15) holdDeductRate = 30;
    else if (holdPeriod >= 14) holdDeductRate = 28;
    else if (holdPeriod >= 13) holdDeductRate = 26;
    else if (holdPeriod >= 12) holdDeductRate = 24;
    else if (holdPeriod >= 11) holdDeductRate = 22;
    else if (holdPeriod >= 10) holdDeductRate = 20;
    else if (holdPeriod >= 9)  holdDeductRate = 18;
    else if (holdPeriod >= 8)  holdDeductRate = 16;
    else if (holdPeriod >= 7)  holdDeductRate = 14;
    else if (holdPeriod >= 6)  holdDeductRate = 12;
    else if (holdPeriod >= 5)  holdDeductRate = 10;
    else if (holdPeriod >= 4)  holdDeductRate = 8;
    else if (holdPeriod >= 3)  holdDeductRate = 6;
  }

  const totalDeductRate = holdDeductRate + stayDeductRate;

  // 기본공제 250만
  const incomeFinal = Math.max(
    taxableIncome - taxableIncome * totalDeductRate * 0.01 - 2_500_000,
    0
  );

  // 기본세율 (장특공 적용 과세표준 기준)
  const { baseR, baseDc } = baseBracket(incomeFinal);

  let finalRate = baseR;
  let finalDc   = baseDc;
  let heavyIncome = 0;

  // 경합1: 보유기간 2년 미만 단일중과세율
  let r1 = 0;
  if (type === '주택') {
    if      (holdPeriod < 1) r1 = 0.70;
    else if (holdPeriod < 2) r1 = 0.60;
  } else {
    if      (holdPeriod < 1) r1 = 0.50;
    else if (holdPeriod < 2) r1 = 0.40;
  }
  const totalTax1 = incomeFinal * r1;

  // 경합2: 조정지역 다주택 중과 (2026.5.10 부활) / 비사업토지 중과
  let r2 = 0, totalTax2 = 0;
  if (type === '비사업토지') {
    r2 = baseR + 0.1;
    totalTax2 = Math.max(incomeFinal * r2 - baseDc, 0);
  } else if (type === '주택' && isAdj === 1 && ownCount >= 2) {
    let landtradeExempt = false;
    if (isLandtradeApply === 1 && saleDate !== '') {
      const deadline = isNewAdj === 1 ? LANDTRADE_DEADLINE_NEW_ADJ : LANDTRADE_DEADLINE_OLD_ADJ;
      if (saleDate <= deadline) landtradeExempt = true;
    }
    if (!landtradeExempt) {
      // 중과 대상은 장기보유특별공제 배제 (소득세법 §95②) → 공제 없는 과세표준으로 재계산
      heavyIncome = Math.max(taxableIncome - 2_500_000, 0);
      const heavyBracket = baseBracket(heavyIncome);
      r2 = ownCount === 2 ? heavyBracket.baseR + 0.2 : heavyBracket.baseR + 0.3;
      totalTax2 = Math.max(heavyIncome * r2 - heavyBracket.baseDc, 0);
    }
  }

  // 경합 처리: 단기·중과 세액이 있으면 그중 큰 세액, 없으면 기본세율 세액
  const baseTax = Math.max(incomeFinal * baseR - baseDc, 0);
  let chosenTax = baseTax;
  if (totalTax1 !== 0 || totalTax2 !== 0) {
    if (totalTax1 > totalTax2) { chosenTax = totalTax1; finalRate = r1; finalDc = 0; }
    else                        { chosenTax = totalTax2; finalRate = r2; }
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
      baseR, baseDc, finalRate, finalDc, heavyIncome,
      r1, r2, appliedR: finalRate,
      heavyApplied, appliedIncome,
      nonTaxThreshold: SINGLE_HH_NONTAX_THRESHOLD,
      isAdj, ownCount, isLandtradeApply,
    },
    lawRef: LAW_REF,
  };
}
