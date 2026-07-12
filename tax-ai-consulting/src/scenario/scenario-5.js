/**
 * 시나리오 5: 2주택자 — 배우자에게 일반증여할까? 부담부증여할까?
 *
 * ※ 배우자는 같은 세대 → 증여 후에도 소유자와 합산 2주택 상태
 *
 * Case1: 배우자에게 일반증여
 *   - 배우자: 증여세(시가) + 취득세(시가)
 *   - 소유자: 없음
 *
 * Case2: 배우자에게 부담부증여
 *   - 배우자: 증여세(시가-대출) + 취득세(시가)
 *   - 소유자: 대출분에 대한 양도세 (2주택 다주택 세율)
 */

import { SPOUSE, SKIP_F } from '../core/constants.js';
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
 * @param {number} inputs.loanPrice         전세·담보대출 [원]
 * @param {number} inputs.holdPeriod        보유기간 [년]
 * @param {number} inputs.stayPeriod        거주기간 [년]
 * @param {number} inputs.space             전용면적 코드 (85/86)
 * @param {number} inputs.heavy             조정지역 여부 (0/1)
 * @param {number} inputs.holdOfficialPrice 계속보유주택 기준시가 [원]
 * @param {number} inputs.holdPeriod2       계속보유주택 보유기간 [년]
 * @param {number} inputs.ownerAge          소유자 연령 [만 세]
 * @param {number} inputs.spouseAge         배우자 연령 [만 세]
 */
export function runScenario5(inputs) {
  const {
    marketPrice, officialPrice, basePrice, loanPrice,
    holdPeriod, stayPeriod, space, heavy,
    holdOfficialPrice, holdPeriod2, ownerAge, spouseAge,
  } = inputs;

  const heavyStr = heavy === 1 ? '조정지역' : '비조정지역';

  // ── Case 1: 일반증여 ──────────────────────────────────
  const c1GiftResult = calcGiveTax(SPOUSE, SKIP_F, marketPrice, spouseAge);
  const c1AcqResult  = calcTakingTax('give', marketPrice, 0, 0, space, heavy);

  const case1 = {
    label: '배우자에게 일반증여',
    sellerTransferTax: 0,
    sellerLocalTax:    0,
    sellerTotal:       0,
    recipientGiftTax:  c1GiftResult.tax,
    recipientAcqTax:   c1AcqResult.total,
    recipientTotal:    c1GiftResult.tax + c1AcqResult.total,
    grandTotal:        c1GiftResult.tax + c1AcqResult.total,
  };

  // ── Case 2: 부담부증여 ────────────────────────────────
  const c2GiftResult = calcGiveTax(SPOUSE, SKIP_F, marketPrice - loanPrice, spouseAge);
  // 취득세: 유상분(승계채무, 매매세율) + 무상분(시가-채무, 증여세율) 구분 과세
  const c2AcqResult  = calcBurdenedGiveTakingTax(marketPrice, loanPrice, space, heavy);

  // 배우자 증여 후에도 같은 세대 → 여전히 2주택자 기준으로 양도세
  const loanBasePrice = Math.floor(basePrice * loanPrice / marketPrice);
  const transferResult = calcSaleIncomeTax(
    loanPrice, loanBasePrice, holdPeriod, stayPeriod,
    '다주택', '주택'
  );

  const case2 = {
    label: '배우자에게 부담부증여',
    sellerTransferTax: transferResult.transferTax,
    sellerLocalTax:    transferResult.localTax,
    sellerTotal:       transferResult.total,
    recipientGiftTax:  c2GiftResult.tax,
    recipientAcqTax:   c2AcqResult.total,
    recipientTotal:    c2GiftResult.tax + c2AcqResult.total,
    grandTotal:        transferResult.total + c2GiftResult.tax + c2AcqResult.total,
  };

  // ── 보유세 변화 ────────────────────────────────────────
  // 증여 전: 소유자 2주택
  const sPropertyTax = calcPropertyTax('다주택', officialPrice);
  const hPropertyTax = calcPropertyTax('다주택', holdOfficialPrice);
  const beforeAggrTax = calcAggrTax(
    '다주택', heavyStr,
    officialPrice + holdOfficialPrice, holdPeriod, ownerAge,
    sPropertyTax.propertyTax + hPropertyTax.propertyTax
  );
  const beforeOwnerTotal = sPropertyTax.total + hPropertyTax.total + beforeAggrTax.total;

  // 증여 후: 소유자는 계속보유주택만 (1주택), 배우자는 증여받은 주택
  // ※ 배우자는 동일 세대이므로 종부세는 세대 합산 계산이 원칙이나,
  //   시나리오에서는 각각 개인 공제 적용 (참고용)
  const afterOwnerPropTax = calcPropertyTax('다주택', holdOfficialPrice);
  const afterOwnerAggrTax = calcAggrTax(
    '다주택', heavyStr, holdOfficialPrice, holdPeriod2, ownerAge,
    afterOwnerPropTax.propertyTax
  );

  const spousePropTax = calcPropertyTax('다주택', officialPrice);
  const spouseAggrTax = calcAggrTax(
    '다주택', heavyStr, officialPrice, holdPeriod, spouseAge,
    spousePropTax.propertyTax
  );

  const holdingTax = {
    before: {
      ownerTotal: beforeOwnerTotal,
      spouseTotal: 0,
      grandTotal: beforeOwnerTotal,
    },
    after: {
      ownerTotal:  afterOwnerPropTax.total + afterOwnerAggrTax.total,
      spouseTotal: spousePropTax.total + spouseAggrTax.total,
      grandTotal:  afterOwnerPropTax.total + afterOwnerAggrTax.total + spousePropTax.total + spouseAggrTax.total,
    },
    change: (afterOwnerPropTax.total + afterOwnerAggrTax.total + spousePropTax.total + spouseAggrTax.total) - beforeOwnerTotal,
  };

  return {
    scenarioId: 5,
    title: '2주택자 — 배우자에게 일반증여할까? 부담부증여할까?',
    inputs,
    case1,
    case2,
    holdingTax,
    computations: [
      { caseNo: 1, caseLabel: '케이스1 — 배우자에게 일반증여', kind: 'gift', label: '증여세', result: c1GiftResult },
      { caseNo: 1, caseLabel: '케이스1 — 배우자에게 일반증여', kind: 'acq', label: '취득세', result: c1AcqResult },
      { caseNo: 2, caseLabel: '케이스2 — 배우자에게 부담부증여', kind: 'gift', label: '증여세(시가−대출)', result: c2GiftResult },
      { caseNo: 2, caseLabel: '케이스2 — 배우자에게 부담부증여', kind: 'burdenAcq', label: '취득세', result: c2AcqResult },
      { caseNo: 2, caseLabel: '케이스2 — 배우자에게 부담부증여', kind: 'transfer', label: '양도소득세(대출 승계분)', result: transferResult },
    ],
    summary: {
      case1GrandTotal: case1.grandTotal,
      case2GrandTotal: case2.grandTotal,
      saving: case1.grandTotal - case2.grandTotal,
      holdingChange: holdingTax.change,
    },
    lawRef: [...new Set([
      ...c1GiftResult.lawRef,
      ...c1AcqResult.lawRef,
      ...c2AcqResult.lawRef,
      ...transferResult.lawRef,
    ])],
  };
}
