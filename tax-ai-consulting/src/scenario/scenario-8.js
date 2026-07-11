/**
 * 시나리오 8: 2주택자 — 배우자에게 증여할까? 타인에게 양도할까?
 *
 * 시나리오 1과 동일 구조, 수증자가 자녀 대신 배우자
 *
 * Case1: 배우자에게 일반증여
 *   - 배우자: 증여세(시가, 배우자 공제 6억) + 취득세(시가)
 *
 * Case2: 타인에게 양도
 *   - 소유자: 양도세 + 지방소득세 (다주택)
 *
 * ※ 원본(result8.php) 버그 수정:
 *   - line 92: calc_aggr_tax("다세대",...) → "다주택"
 */

import { SPOUSE, SKIP_F } from '../core/constants.js';
import { calcGiveTax }       from '../core/gift-tax.js';
import { calcTakingTax }     from '../core/acquisition-tax.js';
import { calcPropertyTax }   from '../core/property-tax.js';
import { calcAggrTax }       from '../core/comprehensive-tax.js';
import { calcSaleIncomeTax } from '../core/transfer-tax.js';

/**
 * @param {object} inputs
 * @param {number} inputs.marketPrice       시가 [원]
 * @param {number} inputs.officialPrice     기준시가 [원]
 * @param {number} inputs.basePrice         취득가액 [원]
 * @param {number} inputs.holdPeriod        보유기간 [년]
 * @param {number} inputs.stayPeriod        거주기간 [년]
 * @param {number} inputs.space             전용면적 코드 (85/86)
 * @param {number} inputs.heavy             조정지역 여부 (0/1)
 * @param {number} inputs.holdOfficialPrice 계속보유주택 기준시가 [원]
 * @param {number} inputs.holdPeriod2       계속보유주택 보유기간 [년]
 * @param {number} inputs.ownerAge          소유자(양도자) 연령 [만 세]
 * @param {number} inputs.spouseAge         배우자(수증자) 연령 [만 세]
 * @param {number} [inputs.ownCount=2]      보유 주택수
 * @param {number} [inputs.isAdj=0]         조정대상지역 여부
 */
export function runScenario8(inputs) {
  const {
    marketPrice, officialPrice, basePrice,
    holdPeriod, stayPeriod, space, heavy,
    holdOfficialPrice, holdPeriod2, ownerAge, spouseAge,
    ownCount = 2, isAdj = 0,
  } = inputs;

  const heavyStr = heavy === 1 ? '조정지역' : '비조정지역';

  // ── Case 1: 배우자에게 일반증여 ───────────────────────
  const giftResult = calcGiveTax(SPOUSE, SKIP_F, marketPrice, spouseAge);
  const acqResult  = calcTakingTax('give', marketPrice, 0, 0, space, heavy);

  const case1 = {
    label: '배우자에게 증여하는 경우',
    sellerTransferTax: 0,
    sellerLocalTax:    0,
    sellerTotal:       0,
    recipientGiftTax:  giftResult.tax,
    recipientAcqTax:   acqResult.total,
    recipientTotal:    giftResult.tax + acqResult.total,
  };

  // ── Case 2: 타인에게 양도 ──────────────────────────────
  const transferResult = calcSaleIncomeTax(
    marketPrice, basePrice, holdPeriod, stayPeriod,
    '다주택', '주택',
    ownCount, isAdj
  );

  const case2 = {
    label: '타인에게 양도하는 경우',
    sellerTransferTax: transferResult.transferTax,
    sellerLocalTax:    transferResult.localTax,
    sellerTotal:       transferResult.total,
    recipientGiftTax:  0,
    recipientAcqTax:   0,
    recipientTotal:    0,
  };

  // ── 보유세 변화 ────────────────────────────────────────
  const sPropertyTax = calcPropertyTax('다주택', officialPrice);
  const hPropertyTax = calcPropertyTax('다주택', holdOfficialPrice);
  const beforeAggrTax = calcAggrTax(
    '다주택', heavyStr,   // ※ 버그 수정: 원본의 "다세대" → "다주택"
    officialPrice + holdOfficialPrice, holdPeriod, ownerAge,
    sPropertyTax.propertyTax + hPropertyTax.propertyTax
  );
  const beforeOwnerTotal = sPropertyTax.total + hPropertyTax.total + beforeAggrTax.total;

  // 처분 후: 소유자 계속보유주택만
  const afterOwnerPropTax = calcPropertyTax('다주택', holdOfficialPrice);
  const afterOwnerAggrTax = calcAggrTax(
    '다주택', heavyStr,
    holdOfficialPrice, holdPeriod2, ownerAge,
    afterOwnerPropTax.propertyTax
  );
  const afterOwnerTotal = afterOwnerPropTax.total + afterOwnerAggrTax.total;

  // 증여 후 배우자(수증자) 보유세
  const spousePropTax = calcPropertyTax('다주택', officialPrice);
  const spouseAggrTax = calcAggrTax(
    '다주택', heavyStr,
    officialPrice, holdPeriod, spouseAge,
    spousePropTax.propertyTax
  );
  const spouseTotal = spousePropTax.total + spouseAggrTax.total;

  const holdingTax = {
    before: { ownerTotal: beforeOwnerTotal, spouseTotal: 0, grandTotal: beforeOwnerTotal },
    afterCase1: {  // 증여 후
      ownerTotal:  afterOwnerTotal,
      spouseTotal: spouseTotal,
      grandTotal:  afterOwnerTotal + spouseTotal,
    },
    afterCase2: {  // 양도 후
      ownerTotal:  afterOwnerTotal,
      spouseTotal: 0,
      grandTotal:  afterOwnerTotal,
    },
    changeCase1: (afterOwnerTotal + spouseTotal) - beforeOwnerTotal,
    changeCase2: afterOwnerTotal - beforeOwnerTotal,
  };

  return {
    scenarioId: 8,
    title: '2주택자 — 배우자에게 증여할까? 타인에게 양도할까?',
    inputs,
    case1,
    case2,
    holdingTax,
    summary: {
      case1Total: case1.recipientTotal,
      case2Total: case2.sellerTotal,
      holdingChangeCase1: holdingTax.changeCase1,
      holdingChangeCase2: holdingTax.changeCase2,
    },
    lawRef: [...new Set([
      ...giftResult.lawRef,
      ...acqResult.lawRef,
      ...transferResult.lawRef,
    ])],
  };
}
