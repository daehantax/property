/**
 * 시나리오 1: 2주택자 — 자녀에게 증여할까? 타인에게 양도할까?
 *
 * Case1: 자녀에게 일반증여 → 자녀(수증자)가 증여세 + 취득세 부담
 * Case2: 타인에게 양도    → 소유자(양도자)가 양도세 + 지방소득세 부담
 * 비교:  증여·양도 전후 보유세(재산세+종부세) 변화
 */

import {
  CHILD, SKIP_F,
} from '../core/constants.js';
import { calcGiveTax }       from '../core/gift-tax.js';
import { calcTakingTax }     from '../core/acquisition-tax.js';
import { calcPropertyTax }   from '../core/property-tax.js';
import { calcAggrTax }       from '../core/comprehensive-tax.js';
import { calcSaleIncomeTax } from '../core/transfer-tax.js';

/**
 * @param {object} inputs
 * @param {number} inputs.marketPrice      시가 [원]
 * @param {number} inputs.officialPrice    기준시가 [원]
 * @param {number} inputs.basePrice        취득가액 [원]
 * @param {number} inputs.holdPeriod       보유기간 [년]
 * @param {number} inputs.stayPeriod       거주기간 [년]
 * @param {number} inputs.space            전용면적 코드 (85=국민주택규모, 86=초과)
 * @param {number} inputs.heavy            조정지역 여부 (0=비조정, 1=조정)
 * @param {number} inputs.holdOfficialPrice 계속보유주택 기준시가 [원]
 * @param {number} inputs.holdPeriod2      계속보유주택 보유기간 [년]
 * @param {number} inputs.ownerAge         소유자(양도자) 연령 [만 세]
 * @param {number} inputs.childAge         수증자(자녀) 연령 [만 세]
 * @param {number} [inputs.ownCount=2]     보유 주택수 (중과 판정용)
 * @param {number} [inputs.isAdj=0]        조정대상지역 여부 (양도세 중과용)
 */
export function runScenario1(inputs) {
  const {
    marketPrice, officialPrice, basePrice,
    holdPeriod, stayPeriod, space, heavy,
    holdOfficialPrice, holdPeriod2, ownerAge, childAge,
    ownCount = 2, isAdj = 0,
  } = inputs;

  // ── Case 1: 자녀에게 일반증여 ──────────────────────────
  const giftTaxResult = calcGiveTax(CHILD, SKIP_F, marketPrice, childAge);
  const acqTaxResult  = calcTakingTax('give', marketPrice, 0, 0, space, heavy);

  const case1 = {
    label: '자녀에게 증여하는 경우',
    recipientGiftTax: giftTaxResult.tax,
    recipientAcqTax:  acqTaxResult.total,
    recipientTotal:   giftTaxResult.tax + acqTaxResult.total,
    sellerTransferTax: 0,
    sellerLocalTax:    0,
    sellerTotal:       0,
  };

  // ── Case 2: 타인에게 양도 ──────────────────────────────
  const transferResult = calcSaleIncomeTax(
    marketPrice, basePrice, holdPeriod, stayPeriod,
    '다주택', '주택',
    ownCount, isAdj
  );

  const case2 = {
    label: '타인에게 양도하는 경우',
    recipientGiftTax:  0,
    recipientAcqTax:   0,
    recipientTotal:    0,
    sellerTransferTax: transferResult.transferTax,
    sellerLocalTax:    transferResult.localTax,
    sellerTotal:       transferResult.total,
  };

  // ── 보유세 변화 (증여·양도 전/후) ─────────────────────
  // 증여·양도 전: 2주택 보유 상태
  const sPropertyTax = calcPropertyTax('다주택', officialPrice);
  const hPropertyTax = calcPropertyTax('다주택', holdOfficialPrice);
  const beforePropertyTax = sPropertyTax.total + hPropertyTax.total;

  const beforeAggrTax = calcAggrTax(
    '다주택', heavy === 1 ? '조정지역' : '비조정지역',
    officialPrice + holdOfficialPrice,
    holdPeriod, ownerAge,
    sPropertyTax.propertyTax + hPropertyTax.propertyTax
  );
  const beforeHoldingTotal = beforePropertyTax + beforeAggrTax.total;

  // 처분 후: 소유자는 1주택만 보유 → 1세대1주택 혜택
  const afterOwnerPropertyTax = calcPropertyTax('다주택', holdOfficialPrice);
  const afterOwnerAggrTax = calcAggrTax(
    '다주택', heavy === 1 ? '조정지역' : '비조정지역',
    holdOfficialPrice, holdPeriod2, ownerAge,
    afterOwnerPropertyTax.propertyTax
  );
  const afterOwnerHoldingTotal = afterOwnerPropertyTax.total + afterOwnerAggrTax.total;

  // 증여 후 자녀(수증자) 보유세
  const recipientPropertyTax = calcPropertyTax('다주택', officialPrice);
  const recipientAggrTax = calcAggrTax(
    '다주택', heavy === 1 ? '조정지역' : '비조정지역',
    officialPrice, 0, childAge,
    recipientPropertyTax.propertyTax
  );
  const recipientHoldingTotal = recipientPropertyTax.total + recipientAggrTax.total;

  const holdingTax = {
    before: {
      ownerPropertyTax: beforePropertyTax,
      ownerAggrTax: beforeAggrTax.total,
      recipientPropertyTax: 0,
      recipientAggrTax: 0,
      total: beforeHoldingTotal,
    },
    afterCase1: {  // 증여 후
      ownerPropertyTax: afterOwnerPropertyTax.total,
      ownerAggrTax: afterOwnerAggrTax.total,
      recipientPropertyTax: recipientPropertyTax.total,
      recipientAggrTax: recipientAggrTax.total,
      total: afterOwnerHoldingTotal + recipientHoldingTotal,
    },
    afterCase2: {  // 양도 후
      ownerPropertyTax: afterOwnerPropertyTax.total,
      ownerAggrTax: afterOwnerAggrTax.total,
      recipientPropertyTax: 0,
      recipientAggrTax: 0,
      total: afterOwnerHoldingTotal,
    },
    changeCase1: (afterOwnerHoldingTotal + recipientHoldingTotal) - beforeHoldingTotal,
    changeCase2: afterOwnerHoldingTotal - beforeHoldingTotal,
  };

  return {
    scenarioId: 1,
    title: '2주택자 — 자녀에게 증여할까? 타인에게 양도할까?',
    inputs,
    case1,
    case2,
    holdingTax,
    computations: [
      { caseNo: 1, caseLabel: '케이스1 — 자녀에게 증여', kind: 'gift', label: '증여세', result: giftTaxResult },
      { caseNo: 1, caseLabel: '케이스1 — 자녀에게 증여', kind: 'acq', label: '취득세(증여취득)', result: acqTaxResult },
      { caseNo: 2, caseLabel: '케이스2 — 타인에게 양도', kind: 'transfer', label: '양도소득세', result: transferResult },
    ],
    holdingComputations: [
      { caseNo: 'b', caseLabel: '처분 전 — 소유자 2주택', kind: 'property', label: '재산세 ① 대상주택', result: sPropertyTax },
      { caseNo: 'b', caseLabel: '처분 전 — 소유자 2주택', kind: 'property', label: '재산세 ② 계속보유주택', result: hPropertyTax },
      { caseNo: 'b', caseLabel: '처분 전 — 소유자 2주택', kind: 'aggr', label: '종합부동산세 (2주택 합산)', result: beforeAggrTax },
      { caseNo: 'r', caseLabel: '증여 후 — 자녀(수증자) 1주택', kind: 'property', label: '재산세', result: recipientPropertyTax },
      { caseNo: 'r', caseLabel: '증여 후 — 자녀(수증자) 1주택', kind: 'aggr', label: '종합부동산세', result: recipientAggrTax },
    ],
    summary: {
      case1Total: case1.recipientTotal,
      case2Total: case2.sellerTotal,
      holdingChangeCase1: holdingTax.changeCase1,
      holdingChangeCase2: holdingTax.changeCase2,
    },
    lawRef: [
      ...new Set([
        ...giftTaxResult.lawRef,
        ...acqTaxResult.lawRef,
        ...transferResult.lawRef,
      ]),
    ],
  };
}
