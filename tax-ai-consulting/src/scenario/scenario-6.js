/**
 * 시나리오 6: 1주택자 — 일부 지분을 배우자에게 일반증여할까? 부담부증여할까?
 *
 * 1주택자가 주택의 일부 지분을 배우자에게 증여
 *   - 취득세: "give1s1h" (1세대1주택 증여, 중과 없음)
 *   - 양도세 비과세 IS_WVR: "1세대1주택" (1주택자이므로)
 *
 * Case1: 지분 일반증여
 *   - 배우자: 증여세(지분시가) + 취득세(지분시가, give1s1h)
 *
 * Case2: 지분 부담부증여
 *   - 배우자: 증여세(지분시가 - 지분대출) + 취득세(지분시가, give1s1h)
 *   - 소유자: 대출분에 대한 양도세 (1세대1주택 비과세 적용)
 */

import { SPOUSE, SKIP_F } from '../core/constants.js';
import { calcGiveTax }       from '../core/gift-tax.js';
import { calcTakingTax, calcBurdenedGiveTakingTax }     from '../core/acquisition-tax.js';
import { calcPropertyTax }   from '../core/property-tax.js';
import { calcAggrTax }       from '../core/comprehensive-tax.js';
import { calcSaleIncomeTax } from '../core/transfer-tax.js';

/**
 * @param {object} inputs
 * @param {number} inputs.marketPrice     주택 전체 시가 [원]
 * @param {number} inputs.officialPrice   주택 전체 기준시가 [원]
 * @param {number} inputs.basePrice       주택 전체 취득가액 [원]
 * @param {number} inputs.loanPrice       전체 전세·담보대출 [원]
 * @param {number} inputs.partRate        증여할 지분 비율 (예: 0.5 = 50%)
 * @param {number} inputs.holdPeriod      보유기간 [년]
 * @param {number} inputs.stayPeriod      거주기간 [년]
 * @param {number} inputs.space           전용면적 코드 (85/86)
 * @param {number} inputs.heavy           조정지역 여부 (0/1)
 * @param {number} inputs.ownerAge        소유자 연령 [만 세]
 * @param {number} inputs.spouseAge       배우자 연령 [만 세]
 */
export function runScenario6(inputs) {
  const {
    marketPrice, officialPrice, basePrice, loanPrice,
    partRate, holdPeriod, stayPeriod, space, heavy,
    ownerAge, spouseAge,
  } = inputs;

  const heavyStr = heavy === 1 ? '조정지역' : '비조정지역';

  // 지분 가액
  const partMarketPrice    = marketPrice * partRate;
  const partOfficialPrice  = Math.floor(officialPrice * partRate);
  const partBasePrice      = Math.floor(basePrice * partRate);
  const partLoanPrice      = Math.floor(loanPrice * partRate);

  // 소유자 잔여 지분
  const ownerRate          = 1 - partRate;
  const ownerOfficialPrice = Math.floor(officialPrice * ownerRate);

  // ── Case 1: 지분 일반증여 ──────────────────────────────
  const c1GiftResult = calcGiveTax(SPOUSE, SKIP_F, partMarketPrice, spouseAge);
  const c1AcqResult  = calcTakingTax('give1s1h', partMarketPrice, 0, 0, space, heavy);

  const case1 = {
    label: '지분 일반증여',
    sellerTransferTax: 0,
    sellerLocalTax:    0,
    sellerTotal:       0,
    recipientGiftTax:  c1GiftResult.tax,
    recipientAcqTax:   c1AcqResult.total,
    recipientTotal:    c1GiftResult.tax + c1AcqResult.total,
    grandTotal:        c1GiftResult.tax + c1AcqResult.total,
  };

  // ── Case 2: 지분 부담부증여 ────────────────────────────
  const c2GiftResult = calcGiveTax(SPOUSE, SKIP_F, partMarketPrice - partLoanPrice, spouseAge);
  // 취득세: 유상분(승계채무, 매매세율) + 무상분(증여 1세대1주택 세율) 구분 과세
  const c2AcqResult  = calcBurdenedGiveTakingTax(partMarketPrice, partLoanPrice, space, heavy, 'give1s1h');

  // 소유자 양도세: 1주택자 → IS_WVR = "1세대1주택", 12억 비과세 적용
  const loanBasePart = Math.floor(partBasePrice * partLoanPrice / partMarketPrice);
  const transferResult = calcSaleIncomeTax(
    partLoanPrice, loanBasePart, holdPeriod, stayPeriod,
    '1세대1주택', '주택'
  );

  const case2 = {
    label: '지분 부담부증여',
    sellerTransferTax: transferResult.transferTax,
    sellerLocalTax:    transferResult.localTax,
    sellerTotal:       transferResult.total,
    recipientGiftTax:  c2GiftResult.tax,
    recipientAcqTax:   c2AcqResult.total,
    recipientTotal:    c2GiftResult.tax + c2AcqResult.total,
    grandTotal:        transferResult.total + c2GiftResult.tax + c2AcqResult.total,
  };

  // ── 보유세 변화 (공동명의 전환) ──────────────────────
  // 증여 전: 소유자 단독 1주택
  const beforeOwnerPropTax = calcPropertyTax('1세대1주택', officialPrice);
  const beforeOwnerAggrTax = calcAggrTax(
    '1세대1주택', heavyStr, officialPrice, holdPeriod, ownerAge,
    beforeOwnerPropTax.propertyTax
  );
  const beforeTotal = beforeOwnerPropTax.total + beforeOwnerAggrTax.total;

  // 증여 후: 공동명의 1주택 (소유자 잔여지분, 배우자 지분)
  const afterOwnerPropTax = calcPropertyTax('1세대1주택', ownerOfficialPrice);
  const afterOwnerAggrTax = calcAggrTax(
    '공동명의1주택', heavyStr, ownerOfficialPrice, holdPeriod, ownerAge,
    afterOwnerPropTax.propertyTax
  );

  const spousePropTax = calcPropertyTax('1세대1주택', partOfficialPrice);
  const spouseAggrTax = calcAggrTax(
    '공동명의1주택', heavyStr, partOfficialPrice, 0, spouseAge,
    spousePropTax.propertyTax
  );

  const afterTotal = afterOwnerPropTax.total + afterOwnerAggrTax.total + spousePropTax.total + spouseAggrTax.total;

  const holdingTax = {
    before: { ownerTotal: beforeTotal, spouseTotal: 0, grandTotal: beforeTotal },
    after:  {
      ownerTotal:  afterOwnerPropTax.total + afterOwnerAggrTax.total,
      spouseTotal: spousePropTax.total + spouseAggrTax.total,
      grandTotal:  afterTotal,
    },
    change: afterTotal - beforeTotal,
  };

  return {
    scenarioId: 6,
    title: '1주택자 — 일부 지분을 배우자에게 일반증여할까? 부담부증여할까?',
    inputs,
    case1,
    case2,
    holdingTax,
    computations: [
      { caseNo: 1, caseLabel: '케이스1 — 일부 지분 일반증여', kind: 'gift', label: '증여세', result: c1GiftResult },
      { caseNo: 1, caseLabel: '케이스1 — 일부 지분 일반증여', kind: 'acq', label: '취득세', result: c1AcqResult },
      { caseNo: 2, caseLabel: '케이스2 — 일부 지분 부담부증여', kind: 'gift', label: '증여세(시가−대출)', result: c2GiftResult },
      { caseNo: 2, caseLabel: '케이스2 — 일부 지분 부담부증여', kind: 'burdenAcq', label: '취득세', result: c2AcqResult },
      { caseNo: 2, caseLabel: '케이스2 — 일부 지분 부담부증여', kind: 'transfer', label: '양도소득세(대출 승계분)', result: transferResult },
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
