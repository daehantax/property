/**
 * 취득세 계산 모듈
 * 기준: 지방세법 (2026.1.1 시행 — 저가주택 기준 1억→2억 반영)
 * 2026.5.10 변경 없음
 */

const LAW_REF = [
  '지방세법 §11(취득세 세율)',
  '지방세법 §13(다주택·법인 중과)',
  '지방세법 §151(농어촌특별세)',
  '지방세법시행령 §28의3(저가주택 기준 2억)',
];

/**
 * 취득세 계산 (농특세 + 지방교육세 포함)
 *
 * @param {string} type 취득 유형
 *   "normal"    — 일반 매매
 *   "inherit"   — 상속
 *   "give"      — 증여 (일반)
 *   "give1s1h"  — 증여 (1세대1주택 → 배우자·직계)
 *   "pre"       — 분양권·입주권 취득
 * @param {number} price 취득가액(시가) [원]
 * @param {number} newHouse 신규분양 세율 코드 (0=기존주택, 1/3/8/12=분양세율%)
 * @param {number} inheritHouse 상속 주택수 코드 (0=1주택, 1=다주택)
 * @param {number} space 전용면적 코드 (85=국민주택규모, 86=초과)
 * @param {number} heavy 조정지역 여부 (0=비조정, 1=조정)
 * @param {number} [heavyBase=price] 증여취득 중과(12%) 판정 기준액 [원].
 *   지방세법 §13의2 판정은 취득 주택(지분)의 시가표준액 기준이므로,
 *   부담부증여 무상분처럼 과세표준(price)이 채무만큼 줄어든 경우 이 값으로 3억 기준을 판정한다.
 *   생략 시 price와 동일(일반 증여취득은 과세표준=취득 주택가액이라 차이 없음).
 * @returns {{ takeTax: number, agTax: number, eduTax: number, total: number, breakdown: object, lawRef: string[] }}
 */
export function calcTakingTax(type, price, newHouse, inheritHouse, space, heavy, heavyBase = price) {
  let takeRate, eduRate;
  let agRate = 0.002;  // 농어촌특별세 기본

  if (type === 'normal') {
    if (newHouse === 0) {
      // 일반 매매: 6억 이하 1%, 6~9억 누진, 9억 초과 3%
      if (price <= 600_000_000) {
        takeRate = 0.01;
      } else if (price <= 900_000_000) {
        takeRate = Math.round(((price * (2 / 300_000_000) - 3) / 100) * 10000) / 10000;
      } else {
        takeRate = 0.03;
      }
      eduRate = takeRate * 0.1;
    } else {
      // 신규 분양
      takeRate = newHouse / 100;
      eduRate = 0.004;
      if (newHouse === 8)  agRate = 0.006;
      else if (newHouse === 12) agRate = 0.01;
    }

  } else if (type === 'inherit') {
    if (inheritHouse === 0) {
      takeRate = 0.008;  // 상속 1주택 0.8%
      agRate = 0;
    } else {
      takeRate = 0.028;  // 상속 다주택 2.8%
    }
    eduRate = 0.0016;

  } else if (type === 'give') {
    // 증여: 조정지역 + 취득 주택 시가표준액 3억 이상 → 12% 중과 (지방세법 §13의2)
    // 판정 기준은 heavyBase(취득 주택가액), 과세표준(price)이 아님 — 부담부증여 무상분 정정
    if (heavy === 1 && heavyBase >= 300_000_000) {
      takeRate = 0.12;
      eduRate = 0.004;
      agRate = 0.01;
    } else {
      takeRate = 0.035;
      eduRate = 0.003;
    }

  } else if (type === 'give1s1h') {
    // 1세대1주택 → 배우자/직계 증여: 중과 없음
    takeRate = 0.035;
    eduRate = 0.003;

  } else if (type === 'pre') {
    // 분양권·입주권
    takeRate = 0.028;
    eduRate = 0.0016;
  }

  const takeTax = price * takeRate;
  const eduTax  = price * eduRate;
  // 농특세: 국민주택규모(85㎡) 이하 면제, 초과(86 코드) 적용
  const agTax = space === 86 ? Math.floor(price * agRate) : 0;

  return {
    takeTax,
    agTax,
    eduTax,
    total: takeTax + agTax + eduTax,
    breakdown: {
      type, price, newHouse, inheritHouse, space, heavy,
      takeRate, eduRate, agRate: space === 86 ? agRate : 0,
    },
    lawRef: LAW_REF,
  };
}

/**
 * 기타(ETC) 관계 수증자 증여 취득세 (family 여부 무관, give와 동일 로직)
 * result3·4에서 자녀의 배우자(6촌 이내 혈족 외) 사용
 */
export function calcGiveTakingEtcTax(price, space, heavy) {
  return calcTakingTax('give', price, 0, 0, space, heavy);
}

/**
 * 부담부증여 취득세 — 지방세법 §7⑪·⑫에 따라 유상·무상 구분 과세
 *   유상분(수증자가 인수하는 채무액): 매매 취득세율
 *   무상분(시가 − 채무액): 증여 취득세율
 *
 * @param {number} marketPrice 시가(전체) [원]
 * @param {number} loanPrice   수증자가 인수하는 채무(전세보증금·담보대출) [원]
 * @param {number} space 전용면적 코드 (85/86)
 * @param {number} heavy 조정지역 여부 (0/1)
 * @param {string} [giveType='give'] 무상분 세율 유형 ('give' | 'give1s1h')
 */
export function calcBurdenedGiveTakingTax(marketPrice, loanPrice, space, heavy, giveType = 'give') {
  const onerous    = calcTakingTax('normal', loanPrice, 0, 0, space, heavy);
  // 무상분 증여취득 중과 판정은 취득 주택(지분) 전체 시가(marketPrice) 기준.
  // 과세표준은 무상분(marketPrice − loanPrice)이지만 3억 중과 판정은 marketPrice로 한다.
  const gratuitous = calcTakingTax(giveType, marketPrice - loanPrice, 0, 0, space, heavy, marketPrice);

  return {
    takeTax: onerous.takeTax + gratuitous.takeTax,
    agTax:   onerous.agTax + gratuitous.agTax,
    eduTax:  onerous.eduTax + gratuitous.eduTax,
    total:   onerous.total + gratuitous.total,
    breakdown: { onerous: onerous.breakdown, gratuitous: gratuitous.breakdown },
    lawRef: [...new Set([
      ...onerous.lawRef,
      ...gratuitous.lawRef,
      '지방세법 §7⑪·⑫(부담부증여 유상·무상 구분)',
    ])],
  };
}
