/**
 * 시나리오 7: 공동명의 1주택자 — 배우자 단독명의로 전환
 *
 * 현재: 소유자·배우자 공동명의 1주택
 * 증여 후: 배우자 단독명의 (소유자 지분 → 배우자에게 증여)
 *
 * 비교:
 *   - 증여세: 소유자 지분 가액 기준
 *   - 취득세: "give1s1h" (1세대1주택 증여)
 *   - 보유세 전후 변화: 공동명의 → 단독명의 종부세 변화
 *
 * 단, 부담부증여 시:
 *   - 소유자 지분에 해당하는 대출분에 대해 양도세 발생 (1세대1주택)
 */

import { SPOUSE, SKIP_F } from '../core/constants.js';
import { calcGiveTax }       from '../core/gift-tax.js';
import { calcTakingTax, calcBurdenedGiveTakingTax }     from '../core/acquisition-tax.js';
import { calcPropertyTax }   from '../core/property-tax.js';
import { calcAggrTax }       from '../core/comprehensive-tax.js';
import { calcSaleIncomeTax } from '../core/transfer-tax.js';

/**
 * @param {object} inputs
 * @param {number} inputs.marketPrice       주택 전체 시가 [원]
 * @param {number} inputs.officialPrice     주택 전체 기준시가 [원]
 * @param {number} inputs.basePrice         주택 전체 취득가액 [원]
 * @param {number} inputs.loanPrice         전체 전세·담보대출 [원]
 * @param {number} inputs.ownerRate         소유자 지분 비율 (예: 0.5)
 * @param {number} inputs.holdPeriod        보유기간 [년]
 * @param {number} inputs.stayPeriod        거주기간 [년]
 * @param {number} inputs.space             전용면적 코드 (85/86)
 * @param {number} inputs.heavy             조정지역 여부 (0/1)
 * @param {number} inputs.ownerAge          소유자 연령 [만 세]
 * @param {number} inputs.spouseAge         배우자 연령 [만 세]
 * @param {number} inputs.spouseRate        배우자 현재 지분 비율
 * @param {number} inputs.spouseHoldPeriod  배우자 보유기간 [년]
 */
export function runScenario7(inputs) {
  const {
    marketPrice, officialPrice, basePrice, loanPrice,
    ownerRate, holdPeriod, stayPeriod, space, heavy,
    ownerAge, spouseAge, spouseRate, spouseHoldPeriod,
  } = inputs;

  const heavyStr = heavy === 1 ? '조정지역' : '비조정지역';

  // 소유자 지분 가액
  const ownerMarketPrice   = marketPrice * ownerRate;
  const ownerOfficialPrice = Math.floor(officialPrice * ownerRate);
  const ownerBasePrice     = Math.floor(basePrice * ownerRate);
  const ownerLoanPrice     = Math.floor(loanPrice * ownerRate);

  // 배우자 현재 지분
  const spouseOfficialPrice = Math.floor(officialPrice * spouseRate);

  // ── Case 1: 일반증여 (소유자 지분 → 배우자) ──────────
  const c1GiftResult = calcGiveTax(SPOUSE, SKIP_F, ownerMarketPrice, spouseAge);
  const c1AcqResult  = calcTakingTax('give1s1h', ownerMarketPrice, 0, 0, space, heavy);

  const case1 = {
    label: '일반증여 (소유자 지분 → 배우자)',
    sellerTransferTax: 0,
    sellerLocalTax:    0,
    sellerTotal:       0,
    recipientGiftTax:  c1GiftResult.tax,
    recipientAcqTax:   c1AcqResult.total,
    recipientTotal:    c1GiftResult.tax + c1AcqResult.total,
    grandTotal:        c1GiftResult.tax + c1AcqResult.total,
  };

  // ── Case 2: 부담부증여 ────────────────────────────────
  const c2GiftResult = calcGiveTax(SPOUSE, SKIP_F, ownerMarketPrice - ownerLoanPrice, spouseAge);
  // 취득세: 유상분(승계채무, 매매세율) + 무상분(증여 1세대1주택 세율) 구분 과세
  const c2AcqResult  = calcBurdenedGiveTakingTax(ownerMarketPrice, ownerLoanPrice, space, heavy, 'give1s1h');

  const loanBase = Math.floor(ownerBasePrice * ownerLoanPrice / ownerMarketPrice);
  const transferResult = calcSaleIncomeTax(
    ownerLoanPrice, loanBase, holdPeriod, stayPeriod,
    '1세대1주택', '주택'
  );

  const case2 = {
    label: '부담부증여 (소유자 지분 → 배우자)',
    sellerTransferTax: transferResult.transferTax,
    sellerLocalTax:    transferResult.localTax,
    sellerTotal:       transferResult.total,
    recipientGiftTax:  c2GiftResult.tax,
    recipientAcqTax:   c2AcqResult.total,
    recipientTotal:    c2GiftResult.tax + c2AcqResult.total,
    grandTotal:        transferResult.total + c2GiftResult.tax + c2AcqResult.total,
  };

  // ── 보유세 변화 ────────────────────────────────────────
  // 증여 전: 공동명의 1주택
  // 재산세는 주택 전체 가액 기준 누진세율로 산출한 뒤 지분 비율로 배분한다
  // (지분별 개별 누진 계산은 세부담 과소 산출 — AI 검증 지적 반영)
  const wholePropTax = calcPropertyTax('1세대1주택', officialPrice);
  const beforeOwnerPropTotal  = wholePropTax.total * ownerRate;
  const beforeSpousePropTotal = wholePropTax.total * spouseRate;
  const beforeOwnerAggrTax = calcAggrTax(
    '공동명의1주택', heavyStr, ownerOfficialPrice, holdPeriod, ownerAge,
    wholePropTax.propertyTax * ownerRate
  );
  const beforeSpouseAggrTax = calcAggrTax(
    '공동명의1주택', heavyStr, spouseOfficialPrice, spouseHoldPeriod, spouseAge,
    wholePropTax.propertyTax * spouseRate
  );
  const beforeTotal = beforeOwnerPropTotal + beforeOwnerAggrTax.total +
    beforeSpousePropTotal + beforeSpouseAggrTax.total;

  // 증여 후: 배우자 단독 1주택
  const afterSpousePropTax = calcPropertyTax('1세대1주택', officialPrice);
  const afterSpouseAggrTax = calcAggrTax(
    '1세대1주택', heavyStr, officialPrice, spouseHoldPeriod, spouseAge,
    afterSpousePropTax.propertyTax
  );
  const afterTotal = afterSpousePropTax.total + afterSpouseAggrTax.total;

  const holdingTax = {
    before: {
      ownerTotal:  beforeOwnerPropTotal + beforeOwnerAggrTax.total,
      spouseTotal: beforeSpousePropTotal + beforeSpouseAggrTax.total,
      grandTotal:  beforeTotal,
    },
    after: {
      ownerTotal:  0,
      spouseTotal: afterTotal,
      grandTotal:  afterTotal,
    },
    change: afterTotal - beforeTotal,
  };

  return {
    scenarioId: 7,
    title: '공동명의 1주택 — 배우자 단독명의로 전환',
    inputs,
    case1,
    case2,
    holdingTax,
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
