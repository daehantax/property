/**
 * 종합부동산세(종부세) 계산 모듈
 * 기준: 종합부동산세법 (2026.5.10 변경 없음)
 *      + 2026 세제개편안 확정안 (2026.9.1 국무회의 의결 · 9.3 국회 제출) 선택 반영 (reformYear)
 *
 * [현행]
 * 공정시장가액비율: 60% (2026년 기준, 종부세법시행령 §2의4)
 * 세율: 0.5%~2.7% (주택분 종부세)
 * 공제: 1세대1주택 12억, 기타 9억
 *
 * [2026 세제개편안 확정안 — reformYear 지정 시 반영, 국회 통과 전]
 * 1. 기본공제 (2027년분~): 1주택 실거주 14억 / 비거주 12억(9억 인하안 철회 — 현행 유지),
 *    다주택 4억 + 5억 × (거주주택 공시가격 ÷ 전체 공시가격 합계)
 *    공동명의 1주택 인별: 거주 9억(합 18억) / 비거주 6억(합 12억 — 당초 4억안에서 조정)
 * 2. 공정시장가액비율: 2027년 70% → 2028년~ 1주택 70%,
 *    3주택 이상·조정지역 2주택 이상 80%
 * 3. 세율: 2027년 과도기(1·2주택 0.5~3.5%, 6억 초과 구간 인상)
 *    → 2028년~ 주택 수 무관 가액 기준 단일세율 0.5~5.0%
 * 4. 1세대1주택 세액공제(보유·연령) 한도 신설: 2027년 800만 → 2028년~ 600만
 *    (거주공제 전환의 세부 공제율표는 미공표 — 현행 공제율 구조 유지 가정)
 * 5. 세부담상한: 200% 인상안 철회 → 현행 150% 유지 (§10)
 */

import {
  AGGR_DEDUCT_SINGLE, AGGR_DEDUCT_OTHERS, AGGR_FAIR_MARKET_RATE,
  AGGR_REFORM2026,
} from './constants.js';

const LAW_REF = [
  '종합부동산세법 §8(주택분 과세표준)',
  '종합부동산세법 §9(세율)',
  '종합부동산세법 §9의2(1세대1주택 세액공제 — 장기보유·연령)',
  '종합부동산세법 §10(세부담의 상한 — 직전연도 보유세 상당액의 150%)',
  '종합부동산세법시행령 §2의4(공정시장가액비율 60%)',
  '농어촌특별세법 §5(종부세분 20%)',
];

const LAW_REF_REFORM = [
  '2026 세제개편안 확정안(2026.9.1 국무회의 의결) — 기본공제 실거주 14억/비거주 12억 유지(9억 인하안 철회), 다주택 가액비례 공제',
  '2026 세제개편안 확정안(2026.9.1 국무회의 의결) — 공동명의 1주택 인별 공제 거주 9억/비거주 6억(당초 4억안 조정)',
  '2026 세제개편안 확정안(2026.9.1 국무회의 의결) — 공정시장가액비율 70%(2028년~ 다주택 80%)',
  '2026 세제개편안 확정안(2026.9.1 국무회의 의결) — 세율 가액 기준 일원화(2027 과도기 → 2028 단일세율 0.5~5.0%)',
  '2026 세제개편안 확정안(2026.9.1 국무회의 의결) — 1세대1주택 세액공제 한도(2027년 800만/2028년~ 600만) · 세부담상한 150% 유지',
  '※ 국회 통과 전 확정안(국회 제출안) 기준 — 조문 확정 시 재검토 필요',
];

/** 주택분 종부세 세율표 — 현행 (0.5~2.7%) */
function rateCurrent(base) {
  if      (base <= 300_000_000)   return base * 0.005;
  else if (base <= 600_000_000)   return base * 0.007 - 600_000;
  else if (base <= 1_200_000_000) return base * 0.010 - 2_400_000;
  else if (base <= 2_500_000_000) return base * 0.013 - 6_000_000;
  else if (base <= 5_000_000_000) return base * 0.015 - 11_000_000;
  else if (base <= 9_400_000_000) return base * 0.020 - 36_000_000;
  else                            return base * 0.027 - 101_800_000;
}

/** 개편안 2027년 과도기 세율표 (0.5~3.5%, 6억 초과 구간 인상) */
function rate2027(base) {
  if      (base <= 300_000_000)   return base * 0.005;
  else if (base <= 600_000_000)   return base * 0.007 - 600_000;
  else if (base <= 1_200_000_000) return base * 0.013 - 4_200_000;
  else if (base <= 2_500_000_000) return base * 0.015 - 6_600_000;
  else if (base <= 5_000_000_000) return base * 0.020 - 19_100_000;
  else if (base <= 9_400_000_000) return base * 0.027 - 54_100_000;
  else                            return base * 0.035 - 129_300_000;
}

/** 개편안 2028년~ 단일세율표 (주택 수 무관, 0.5~5.0%) */
function rate2028(base) {
  if      (base <= 300_000_000)   return base * 0.005;
  else if (base <= 600_000_000)   return base * 0.007 - 600_000;
  else if (base <= 1_200_000_000) return base * 0.013 - 4_200_000;
  else if (base <= 2_500_000_000) return base * 0.020 - 12_600_000;
  else if (base <= 5_000_000_000) return base * 0.030 - 37_600_000;
  else if (base <= 9_400_000_000) return base * 0.040 - 87_600_000;
  else                            return base * 0.050 - 181_600_000;
}

/**
 * 종합부동산세 및 농어촌특별세 계산
 *
 * @param {string} oneOOne 주택 유형
 *   "1세대1주택"  — 12억 공제, 세액공제(장기/연령) 적용
 *   "공동명의1주택" — 인별 기본공제 9억(2023년~ 현행; 개편안 2027년분~ 거주 9억/비거주 6억), 세액공제 없음
 *     ※ 종부세는 인별 과세 — 부부 공동명의는 부부 합산 가액을 넣지 말고
 *       calcAggrTaxCouple()로 각자 지분씩 계산해 합산할 것(각자 9억, 부부 합계 18억 공제)
 *   "다주택"       — 9억 공제, 세액공제 없음
 * @param {string} heavy 조정지역 여부 ("조정지역" | "비조정지역")
 *   — 현행법상 세율 동일하나, 개편안 2028년~ 공정시장가액비율(80%) 판정에 사용
 * @param {number} gongsi 공시가격 합계 [원]
 * @param {number} period 보유기간 [년] (1세대1주택 세액공제용)
 * @param {number} age    소유자 나이 [만 세] (1세대1주택 세액공제용)
 * @param {number} propertyTax 재산세액 [원] (공제계산용)
 * @param {object} [reformOpts] 2026 세제개편안 반영 옵션 (미지정 시 현행법)
 *   @param {number} [reformOpts.reformYear=0]  귀속연도 (0=현행법, 2027 | 2028~)
 *   @param {number} [reformOpts.isResident=1]  1주택 실거주 여부 (0/1) — 공제 14억/12억, 공동명의 인별 9억/6억 판정
 *   @param {number} [reformOpts.residentShare=0] 다주택: 거주주택 공시가격 ÷ 합계 (0~1)
 *   @param {number} [reformOpts.ownCount=1]    보유 주택수 — 2028년~ 공정시장가액비율 판정
 *   @param {number} [reformOpts.prevYearTotal=0] 직전연도 보유세 상당액(재산세+종부세) [원]
 *     — 0보다 크면 세부담상한(§10, 150%) 적용: 당해 재산세+종부세가 전년의 150%를
 *       넘지 않도록 초과분을 종부세에서 차감
 * @returns {{ aggrTax: number, ruralTax: number, total: number, breakdown: object, lawRef: string[] }}
 */
export function calcAggrTax(oneOOne, heavy, gongsi, period, age, propertyTax, reformOpts = {}) {
  const {
    reformYear = 0, isResident = 1, residentShare = 0, ownCount = 1, prevYearTotal = 0,
  } = reformOpts;
  const R = AGGR_REFORM2026;

  // 기본공제
  let deductAmt;
  if (!reformYear) {
    deductAmt = oneOOne === '1세대1주택' ? AGGR_DEDUCT_SINGLE : AGGR_DEDUCT_OTHERS;
  } else if (oneOOne === '1세대1주택') {
    deductAmt = isResident ? R.DEDUCT_SINGLE_RESIDENT : R.DEDUCT_SINGLE_NONRESIDENT;
  } else if (oneOOne === '다주택') {
    // 4억 + 5억 × 거주주택 가액 비중
    deductAmt = R.DEDUCT_MULTI_BASE
      + R.DEDUCT_MULTI_RESIDENT_BONUS * Math.min(Math.max(residentShare, 0), 1);
  } else {
    // 공동명의1주택(인별 지분 계산) — 확정안: 거주 9억(합 18억) / 비거주 6억(합 12억)
    deductAmt = isResident ? R.DEDUCT_COUPLE_RESIDENT : R.DEDUCT_COUPLE_NONRESIDENT;
  }

  // 공정시장가액비율
  let fairMarketRate;
  if (!reformYear) {
    fairMarketRate = AGGR_FAIR_MARKET_RATE;
  } else if (reformYear === 2027) {
    fairMarketRate = R.FAIR_MARKET_RATE_2027;
  } else {
    const isHeavyFmr = ownCount >= 3 || (heavy === '조정지역' && ownCount >= 2);
    fairMarketRate = isHeavyFmr ? R.FAIR_MARKET_RATE_HEAVY : R.FAIR_MARKET_RATE_BASE;
  }

  const aggrTaxBase = Math.max((gongsi - deductAmt), 0) * fairMarketRate;

  // 주택분 종부세 세율
  const rateFn = !reformYear ? rateCurrent : (reformYear === 2027 ? rate2027 : rate2028);
  const aggrTax = Math.max(rateFn(aggrTaxBase), 0);

  // 장기보유 세액공제 (1세대1주택만)
  let prdDc = 0;
  if (oneOOne === '1세대1주택') {
    if      (period >= 15) prdDc = 0.5;
    else if (period >= 10) prdDc = 0.4;
    else if (period >= 5)  prdDc = 0.2;
  }

  // 연령 세액공제 (1세대1주택만)
  let ageDc = 0;
  if (oneOOne === '1세대1주택') {
    if      (age >= 70) ageDc = 0.4;
    else if (age >= 65) ageDc = 0.3;
    else if (age >= 60) ageDc = 0.2;
  }

  // 재산세 공제 (이중과세 조정)
  const pRealRate = (oneOOne === '1세대1주택' || oneOOne === '공동명의1주택') ? 0.45 : 0.6;
  const denominator = gongsi * pRealRate * 0.004 - 630_000;
  const propertyTaxDc = denominator > 0
    ? propertyTax * (aggrTaxBase * pRealRate * 0.004) / denominator
    : 0;

  // 최종 세액 (장기/연령 공제 합산 80% 한도 + 개편안: 공제금액 한도 800만/600만)
  const combinedDc = Math.min(prdDc + ageDc, 0.8);
  const taxAfterPtDc = Math.max(aggrTax - propertyTaxDc, 0);
  let creditAmt = taxAfterPtDc * combinedDc;
  let creditCap = 0;
  if (reformYear) {
    creditCap = R.CREDIT_CAP[reformYear] ?? R.CREDIT_CAP_FINAL;
    if (creditAmt > creditCap) creditAmt = creditCap;
  }
  let aggrTaxFinal = taxAfterPtDc - creditAmt;

  // 세부담상한 (§10): 직전연도 보유세 상당액 입력 시에만 적용.
  // (당해 재산세 + 종부세) 가 전년 상당액 × 150% 를 넘으면 초과분을 종부세에서 차감
  let capLimit = 0, capReduction = 0;
  if (prevYearTotal > 0) {
    capLimit = prevYearTotal * 1.5;
    const currentBurden = propertyTax + aggrTaxFinal;
    if (currentBurden > capLimit) {
      capReduction = Math.min(aggrTaxFinal, currentBurden - capLimit);
      aggrTaxFinal -= capReduction;
    }
  }

  const aggrTaxFloor = Math.floor(aggrTaxFinal);
  const ruralTax     = Math.floor(aggrTaxFinal * 0.2);  // 농특세 20%

  return {
    aggrTax: aggrTaxFloor,
    ruralTax,
    total: aggrTaxFloor + ruralTax,
    breakdown: {
      oneOOne, gongsi, deductAmt, aggrTaxBase,
      aggrTaxBeforeDc: aggrTax,
      propertyTaxDc, propertyTax,
      prdDc, ageDc, combinedDc, creditAmt, creditCap,
      prevYearTotal, capLimit, capReduction,
      fairMarketRate,
      reformYear, isResident, residentShare, ownCount,
    },
    lawRef: reformYear ? [...LAW_REF, ...LAW_REF_REFORM] : LAW_REF,
  };
}

/**
 * 부부 공동명의 1주택 종부세 — 인별(각자) 계산 후 합산
 *
 * 종부세는 인별 과세다. 부부 공동명의 1주택은 각자 자기 지분의 공시가격에서
 * 각자 기본공제 9억(부부 합계 18억)을 빼고 각자 누진세율로 계산한 뒤 더한다.
 * 재산세는 물건별 과세라 주택 전체로 계산한 값을 지분비율로 배분해 공제한다.
 * 인별 방식에는 1세대1주택 세액공제(장기보유·연령)가 없다 — 공동명의 1주택자
 * 특례(§10의2: 1세대1주택 단독명의 방식, 12억 공제 + 세액공제) 신청이 유리한지는
 * calcAggrTax('1세대1주택', ...) 결과와 비교해 판단한다.
 *
 * @param {number} gongsi 주택 전체 공시가격 [원]
 * @param {number} shareA 본인 지분율 (0~1, 기본 0.5 — 배우자는 1−shareA)
 * @param {string} heavy 조정지역 여부 ("조정지역" | "비조정지역")
 * @param {number} propertyTax 주택 전체 재산세 본세 [원]
 * @param {object} [opts] calcAggrTax의 reformOpts와 동일.
 *   prevYearTotal은 부부 합산 전년 보유세 상당액을 넣으면 지분비율로 나눠 적용된다.
 * @returns {{ a, b, shares: {a:number,b:number}, aggrTax: number, ruralTax: number, total: number, lawRef: string[] }}
 *   a·b는 각자의 calcAggrTax 결과(인별 내역), aggrTax·ruralTax·total은 부부 합계
 */
export function calcAggrTaxCouple(gongsi, shareA, heavy, propertyTax, opts = {}) {
  const sa = Math.min(Math.max(shareA ?? 0.5, 0), 1);
  const sb = 1 - sa;
  // 지분 배분값은 원 단위로 반올림 (부동소수점 오차 방지)
  const person = (share) => calcAggrTax(
    '공동명의1주택', heavy, Math.round(gongsi * share), 0, 0, Math.round(propertyTax * share),
    { ...opts, prevYearTotal: Math.round((opts.prevYearTotal ?? 0) * share) },
  );
  const a = person(sa);
  const b = person(sb);
  return {
    a, b,
    shares: { a: sa, b: sb },
    aggrTax: a.aggrTax + b.aggrTax,
    ruralTax: a.ruralTax + b.ruralTax,
    total: a.total + b.total,
    lawRef: [...a.lawRef, '종합부동산세법 §7(납세의무자 — 인별 과세)', '종합부동산세법 §10의2(공동명의 1주택자 특례 — 신청 시 1세대1주택 방식 선택 가능)'],
  };
}

/**
 * 2026 세제개편안 반영 전/후 종부세 비교 (현행 → 2027 과도기 → 2028 단일세율)
 *
 * 동일 조건으로 세 레짐을 각각 계산해 연도별 변화를 반환한다.
 *
 * @param {string} oneOOne / @param {string} heavy / @param {number} gongsi
 * @param {number} period / @param {number} age / @param {number} propertyTax
 *   — calcAggrTax와 동일
 * @param {object} [opts] { isResident, residentShare, ownCount } — 개편안 판정 입력
 * @returns {{ current, y2027, y2028, diff: { y2027:number, y2028:number } }}
 */
export function compareAggrTaxReform2026(oneOOne, heavy, gongsi, period, age, propertyTax, opts = {}) {
  const current = calcAggrTax(oneOOne, heavy, gongsi, period, age, propertyTax);
  const y2027   = calcAggrTax(oneOOne, heavy, gongsi, period, age, propertyTax,
    { ...opts, reformYear: 2027 });
  const y2028   = calcAggrTax(oneOOne, heavy, gongsi, period, age, propertyTax,
    { ...opts, reformYear: 2028 });
  return {
    current, y2027, y2028,
    diff: {
      y2027: y2027.total - current.total,
      y2028: y2028.total - current.total,
    },
  };
}
