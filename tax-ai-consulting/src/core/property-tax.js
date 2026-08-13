/**
 * 재산세 계산 모듈
 * 기준: 지방세법 §111·§111의2 (2026.5.10 변경 없음)
 *
 * 반환: [재산세, 도시지역분, 지방교육세]
 * ※ 도시지역분: 과세표준 × 1.4/1000
 * ※ 지방교육세: 재산세 × 20%
 * ※ 재산세는 물건별 과세 — 부부 공동명의라도 주택 전체 기준으로 계산하고
 *   각자 지분비율만큼 나눠 납부한다(세액 총액은 단독명의와 동일).
 *   따라서 "공동명의1주택"도 1세대1주택과 같은 특례(공정시장가액비율 43~45%,
 *   공시 9억 이하 특례세율)를 적용한다.
 */

const LAW_REF = [
  '지방세법 §110(과세표준)',
  '지방세법 §111(재산세 세율)',
  '지방세법 §111의2(1세대1주택 특례세율 — 공시 9억 이하)',
  '지방세법 §112(도시지역분)',
  '지방세법 §151(지방교육세)',
];

/**
 * 재산세 계산
 * @param {string} oneOOne 주택 유형
 *   "1세대1주택"   — 공정시장가액비율 43/44/45% + 공시 9억 이하 특례세율
 *   "공동명의1주택" — 1세대1주택과 동일 (물건별 과세 — 주택 전체 기준)
 *   "다주택"       — 공정시장가액비율 60%, 표준세율
 * @param {number} gongsi 공시가격 [원]
 * @returns {{ propertyTax: number, dosiTax: number, pEduTax: number, total: number, breakdown: object, lawRef: string[] }}
 */
export function calcPropertyTax(oneOOne, gongsi) {
  const isSingleHome = oneOOne === '1세대1주택' || oneOOne === '공동명의1주택';

  // 과세표준 = 공시가격 × 공정시장가액비율
  let ratio;
  if (isSingleHome) {
    if (gongsi <= 300_000_000)      ratio = 0.43;
    else if (gongsi <= 600_000_000) ratio = 0.44;
    else                            ratio = 0.45;
  } else {
    ratio = 0.6;
  }
  const taxBase = gongsi * ratio;

  // 세율: 1세대1주택 & 공시 9억 이하 → 특례세율(§111의2), 그 외 표준세율(§111)
  let propertyTax;
  if (isSingleHome && gongsi <= 900_000_000) {
    if      (taxBase <= 60_000_000)  propertyTax = taxBase * 0.0005;
    else if (taxBase <= 150_000_000) propertyTax = 30_000 + (taxBase - 60_000_000) * 0.001;
    else if (taxBase <= 300_000_000) propertyTax = 120_000 + (taxBase - 150_000_000) * 0.002;
    else                             propertyTax = 420_000 + (taxBase - 300_000_000) * 0.0035;
  } else {
    if      (taxBase <= 60_000_000)  propertyTax = taxBase * 0.001;
    else if (taxBase <= 150_000_000) propertyTax = 60_000 + (taxBase - 60_000_000) * 0.0015;
    else if (taxBase <= 300_000_000) propertyTax = 195_000 + (taxBase - 150_000_000) * 0.0025;
    else                             propertyTax = 570_000 + (taxBase - 300_000_000) * 0.004;
  }

  const dosiTax  = taxBase * 14 / 10000;   // 도시지역분 0.14%
  const pEduTax  = propertyTax * 0.2;      // 지방교육세 20%

  return {
    propertyTax,
    dosiTax,
    pEduTax,
    total: propertyTax + dosiTax + pEduTax,
    breakdown: {
      oneOOne, gongsi, taxBase,
      fairMarketRatio: ratio,
      specialRate: isSingleHome && gongsi <= 900_000_000,
    },
    lawRef: LAW_REF,
  };
}
