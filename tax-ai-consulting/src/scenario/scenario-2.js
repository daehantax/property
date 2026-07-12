/**
 * 시나리오 2: 2주택자 — 자녀에게 일반증여할까? 부담부증여할까?
 *
 * Case1: 일반증여 → 자녀가 증여세(시가 전체) + 취득세(시가 전체) 부담
 * Case2: 부담부증여 → 자녀가 증여세(시가-대출) + 취득세(시가 전체) 부담
 *                   + 소유자(증여자)가 대출분에 대한 양도세 부담
 * 비교:  증여 전후 보유세(재산세+종부세) 변화
 */

import { CHILD, SKIP_F } from '../core/constants.js';
import { calcGiveTax }       from '../core/gift-tax.js';
import { calcTakingTax, calcBurdenedGiveTakingTax } from '../core/acquisition-tax.js';
import { calcPropertyTax }   from '../core/property-tax.js';
import { calcAggrTax }       from '../core/comprehensive-tax.js';
import { calcSaleIncomeTax } from '../core/transfer-tax.js';

/**
 * @param {object} inputs
 * @param {number} inputs.marketPrice       시가 [원]
 * @param {number} inputs.officialPrice     기준시가 [원]
 * @param {number} inputs.basePrice         취득가액 [원]
 * @param {number} inputs.loanPrice         승계하는 전세보증금·담보대출 [원]
 * @param {number} inputs.holdPeriod        보유기간 [년]
 * @param {number} inputs.stayPeriod        거주기간 [년]
 * @param {number} inputs.space             전용면적 코드 (85=국민주택규모, 86=초과)
 * @param {number} inputs.heavy             조정지역 여부 (0=비조정, 1=조정)
 * @param {number} inputs.holdOfficialPrice 계속보유주택 기준시가 [원]
 * @param {number} inputs.holdPeriod2       계속보유주택 보유기간 [년]
 * @param {number} inputs.ownerAge          소유자(증여자) 연령 [만 세]
 * @param {number} inputs.childAge          수증자(자녀) 연령 [만 세]
 */
export function runScenario2(inputs) {
  const {
    marketPrice, officialPrice, basePrice, loanPrice,
    holdPeriod, stayPeriod, space, heavy,
    holdOfficialPrice, holdPeriod2, ownerAge, childAge,
  } = inputs;

  const heavyStr = heavy === 1 ? '조정지역' : '비조정지역';

  // ── Case 1: 일반증여 ──────────────────────────────────
  const gift1Result = calcGiveTax(CHILD, SKIP_F, marketPrice, childAge);
  const acq1Result  = calcTakingTax('give', marketPrice, 0, 0, space, heavy);

  const case1 = {
    label: '일반증여',
    sellerTransferTax: 0,
    sellerLocalTax:    0,
    sellerTotal:       0,
    recipientGiftTax:  gift1Result.tax,
    recipientAcqTax:   acq1Result.total,
    recipientTotal:    gift1Result.tax + acq1Result.total,
    grandTotal:        gift1Result.tax + acq1Result.total,
  };

  // ── Case 2: 부담부증여 ────────────────────────────────
  // 자녀 증여세: 시가 − 승계대출
  const gift2Result = calcGiveTax(CHILD, SKIP_F, marketPrice - loanPrice, childAge);
  // 자녀 취득세: 유상분(승계채무, 매매세율) + 무상분(시가-채무, 증여세율) 구분 과세
  const acq2Result  = calcBurdenedGiveTakingTax(marketPrice, loanPrice, space, heavy);

  // 소유자 양도세: 대출분에 대해 양도한 것으로 간주
  // 대출분 취득원가 = 취득가액 × (대출/시가)
  const loanBasePrice = basePrice * loanPrice / marketPrice;
  const transfer2Result = calcSaleIncomeTax(
    loanPrice, loanBasePrice, holdPeriod, stayPeriod,
    '다주택', '주택'
  );

  const case2 = {
    label: '부담부증여',
    sellerTransferTax: transfer2Result.transferTax,
    sellerLocalTax:    transfer2Result.localTax,
    sellerTotal:       transfer2Result.total,
    recipientGiftTax:  gift2Result.tax,
    recipientAcqTax:   acq2Result.total,
    recipientTotal:    gift2Result.tax + acq2Result.total,
    grandTotal:        transfer2Result.total + gift2Result.tax + acq2Result.total,
  };

  // ── 보유세 변화 ────────────────────────────────────────
  // 증여 전: 2주택 보유
  const sPropertyTax = calcPropertyTax('다주택', officialPrice);
  const hPropertyTax = calcPropertyTax('다주택', holdOfficialPrice);
  const beforePropertyTax = sPropertyTax.total + hPropertyTax.total;
  const beforeAggrTax = calcAggrTax(
    '다주택', heavyStr,
    officialPrice + holdOfficialPrice,
    holdPeriod, ownerAge,
    sPropertyTax.propertyTax + hPropertyTax.propertyTax
  );
  const beforeTotal = beforePropertyTax + beforeAggrTax.total;

  // 증여 후: 소유자 1주택만 보유
  const afterOwnerPropTax = calcPropertyTax('다주택', holdOfficialPrice);
  const afterOwnerAggrTax = calcAggrTax(
    '다주택', heavyStr,
    holdOfficialPrice, holdPeriod2, ownerAge,
    afterOwnerPropTax.propertyTax
  );
  const afterOwnerTotal = afterOwnerPropTax.total + afterOwnerAggrTax.total;

  // 자녀 보유세 (증여 받은 주택)
  const recipientPropTax = calcPropertyTax('다주택', officialPrice);
  const recipientAggrTax = calcAggrTax(
    '다주택', heavyStr,
    officialPrice, 0, childAge,
    recipientPropTax.propertyTax
  );
  const recipientTotal = recipientPropTax.total + recipientAggrTax.total;

  const holdingTax = {
    before: { ownerTotal: beforeTotal, recipientTotal: 0, grandTotal: beforeTotal },
    after:  {
      ownerTotal:     afterOwnerTotal,
      recipientTotal: recipientTotal,
      grandTotal:     afterOwnerTotal + recipientTotal,
    },
    change: (afterOwnerTotal + recipientTotal) - beforeTotal,
  };

  return {
    scenarioId: 2,
    title: '2주택자 — 자녀에게 일반증여할까? 부담부증여할까?',
    inputs,
    case1,
    case2,
    holdingTax,
    computations: [
      { caseNo: 1, caseLabel: '케이스1 — 자녀에게 일반증여', kind: 'gift', label: '증여세', result: gift1Result },
      { caseNo: 1, caseLabel: '케이스1 — 자녀에게 일반증여', kind: 'acq', label: '취득세', result: acq1Result },
      { caseNo: 2, caseLabel: '케이스2 — 자녀에게 부담부증여', kind: 'gift', label: '증여세(시가−대출)', result: gift2Result },
      { caseNo: 2, caseLabel: '케이스2 — 자녀에게 부담부증여', kind: 'burdenAcq', label: '취득세', result: acq2Result },
      { caseNo: 2, caseLabel: '케이스2 — 자녀에게 부담부증여', kind: 'transfer', label: '양도소득세(대출 승계분)', result: transfer2Result },
    ],
    holdingComputations: [
      { caseNo: 'b', caseLabel: '증여 전 — 소유자 2주택', kind: 'property', label: '재산세 ① 대상주택', result: sPropertyTax },
      { caseNo: 'b', caseLabel: '증여 전 — 소유자 2주택', kind: 'property', label: '재산세 ② 계속보유주택', result: hPropertyTax },
      { caseNo: 'b', caseLabel: '증여 전 — 소유자 2주택', kind: 'aggr', label: '종합부동산세 (2주택 합산)', result: beforeAggrTax },
      { caseNo: 'r', caseLabel: '증여 후 — 자녀(수증자) 1주택', kind: 'property', label: '재산세', result: recipientPropTax },
      { caseNo: 'r', caseLabel: '증여 후 — 자녀(수증자) 1주택', kind: 'aggr', label: '종합부동산세', result: recipientAggrTax },
    ],
    summary: {
      case1GrandTotal: case1.grandTotal,
      case2GrandTotal: case2.grandTotal,
      difference: case1.grandTotal - case2.grandTotal,
      holdingChange: holdingTax.change,
    },
    lawRef: [
      ...new Set([
        ...gift1Result.lawRef,
        ...acq1Result.lawRef,
        ...transfer2Result.lawRef,
      ]),
    ],
  };
}
