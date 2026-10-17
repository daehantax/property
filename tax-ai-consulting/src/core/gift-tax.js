/**
 * 증여세 계산 모듈
 * 기준: 상속세 및 증여세법 (2026.5.10 시행, 변경 없음)
 */

import {
  CHILD, SPOUSE, PARENTS, EXT_REL,
  SKIP_T,
  GIVE_DEDUCT, ADULT_AGE,
} from './constants.js';

const LAW_REF = [
  '상속세및증여세법 §53(증여재산 공제)',
  '상속세및증여세법 §56(증여세율)',
  '상속세및증여세법 §57(세대생략 할증과세)',
  '상속세및증여세법 §69(신고세액공제 3%)',
];

/**
 * 증여세 계산
 * @param {number} giveRel  수증자 관계 (CHILD=1, SPOUSE=2, PARENTS=3, EXT_REL=4, ETC=5)
 * @param {number} isSkip   세대생략 여부 (SKIP_T=1, SKIP_F=2)
 * @param {number} giftPrice 증여가액(시가) [원]
 * @param {number} recipientAge 수증자 나이 [만 세]
 * @returns {{ tax: number, breakdown: object, lawRef: string[] }}
 */
export function calcGiveTax(giveRel, isSkip, giftPrice, recipientAge) {
  // 미성년자 판정: 민법 §4 — 만 19세에 성년이 되므로 만 19세 미만만 미성년
  const isMinor = recipientAge < ADULT_AGE;

  // 증여재산 공제
  let deduct = 0;
  if (giveRel === CHILD) {
    deduct = isMinor ? GIVE_DEDUCT.CHILD_MINOR : GIVE_DEDUCT.CHILD_ADULT;
  } else if (giveRel === SPOUSE) {
    deduct = GIVE_DEDUCT.SPOUSE;
  } else if (giveRel === PARENTS) {
    deduct = GIVE_DEDUCT.PARENTS;
  } else if (giveRel === EXT_REL) {
    deduct = GIVE_DEDUCT.EXT_REL;
  }
  // ETC(타인): 공제 없음

  const taxBase = Math.max(giftPrice - deduct, 0);

  // 누진세율 적용
  let taxRate, accDeduct;
  if (taxBase <= 100_000_000)       { taxRate = 0.10; accDeduct = 0; }
  else if (taxBase <= 500_000_000)  { taxRate = 0.20; accDeduct = 10_000_000; }
  else if (taxBase <= 1_000_000_000){ taxRate = 0.30; accDeduct = 60_000_000; }
  else if (taxBase <= 3_000_000_000){ taxRate = 0.40; accDeduct = 160_000_000; }
  else                              { taxRate = 0.50; accDeduct = 460_000_000; }

  const rawTax = Math.max(taxBase * taxRate - accDeduct, 0);

  // 세대생략 할증 (상증세법 §57①): 30%,
  // 수증자가 미성년자이면서 증여재산가액 20억 초과 시 40% (성년 수증자는 가액 무관 30%)
  const skipRate = isSkip === SKIP_T
    ? (isMinor && giftPrice > 2_000_000_000 ? 0.4 : 0.3)
    : 0;

  // 신고세액공제 3%
  const finalTax = Math.floor(rawTax * (1 + skipRate) * (1 - 0.03));

  return {
    tax: finalTax,
    breakdown: {
      giftPrice,
      deduct,
      taxBase,
      taxRate,
      accDeduct,
      rawTax,
      skipRate,
      isMinor,
      faithfulReportDiscount: 0.03,
    },
    lawRef: LAW_REF,
  };
}
