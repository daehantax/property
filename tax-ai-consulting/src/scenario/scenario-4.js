/**
 * 시나리오 4: 2주택자 — 자녀에게만 부담부증여할까? 여러 명에게 부담부증여할까?
 *
 * 부담부증여: 전세·담보대출을 수증자가 승계
 *   - 증여세 과세대상 = 시가 − 대출 (지분별)
 *   - 취득세 과세대상 = 시가 (지분별)
 *   - 소유자(증여자) 양도세 = 대출분 전체에 대해 부과 (1회만)
 *
 * Case1: 자녀에게만 부담부증여
 * Case2: 자녀(지분) + 자녀의배우자 + 손자녀 분산 부담부증여
 *        (대출도 지분 비례로 배분)
 */

import {
  CHILD, EXT_REL, SKIP_T, SKIP_F,
} from '../core/constants.js';
import { calcGiveTax }         from '../core/gift-tax.js';
import { calcBurdenedGiveTakingTax } from '../core/acquisition-tax.js';
import { calcPropertyTax }     from '../core/property-tax.js';
import { calcAggrTax }         from '../core/comprehensive-tax.js';
import { calcSaleIncomeTax }   from '../core/transfer-tax.js';

/**
 * @param {object} inputs
 * @param {number}    inputs.marketPrice       시가 [원]
 * @param {number}    inputs.officialPrice     기준시가 [원]
 * @param {number}    inputs.basePrice         취득가액 [원]
 * @param {number}    inputs.loanPrice         전세·담보대출 전체액 [원]
 * @param {number}    inputs.holdPeriod        보유기간 [년]
 * @param {number}    inputs.stayPeriod        거주기간 [년]
 * @param {number}    inputs.space             전용면적 코드 (85/86)
 * @param {number}    inputs.heavy             조정지역 여부 (0/1)
 * @param {number}    inputs.holdOfficialPrice 계속보유주택 기준시가 [원]
 * @param {number}    inputs.holdPeriod2       계속보유주택 보유기간 [년]
 * @param {number}    inputs.ownerAge          소유자 연령 [만 세]
 * @param {{ price:number, age:number }} inputs.child        자녀 지분·나이
 * @param {{ price:number, age:number }} inputs.childSpouse  자녀의배우자
 * @param {{ price:number, age:number }} inputs.grand1       손자녀1
 * @param {{ price:number, age:number }} inputs.grand2       손자녀2
 * @param {{ price:number, age:number }} inputs.grand3       손자녀3
 */
export function runScenario4(inputs) {
  const {
    marketPrice, officialPrice, basePrice, loanPrice,
    holdPeriod, stayPeriod, space, heavy,
    holdOfficialPrice, holdPeriod2, ownerAge,
    child, childSpouse, grand1, grand2, grand3,
  } = inputs;

  const heavyStr = heavy === 1 ? '조정지역' : '비조정지역';

  // 소유자 양도세: 대출분에 대해 1회 부과 (대출 비율로 취득가액 배분)
  const loanBasePrice = Math.floor(basePrice * loanPrice / marketPrice);
  const transferResult = calcSaleIncomeTax(
    loanPrice, loanBasePrice, holdPeriod, stayPeriod,
    '다주택', '주택',
    2, heavy   // 2주택자 + 조정지역(heavy=1)이면 부담부증여 채무 양도분에 다주택 중과 적용
  );

  // ── Case 1: 자녀에게만 부담부증여 ────────────────────
  const c1NetPrice = marketPrice - loanPrice;  // 증여세 과세기준
  const c1GiftResult = calcGiveTax(CHILD, SKIP_F, c1NetPrice, child.age);
  const c1AcqResult  = calcBurdenedGiveTakingTax(marketPrice, loanPrice, space, heavy);

  const case1 = {
    label: '자녀에게만 부담부증여',
    sellerTransferTax: transferResult.transferTax,
    sellerLocalTax:    transferResult.localTax,
    sellerTotal:       transferResult.total,
    recipientGiftTax:  c1GiftResult.tax,
    recipientAcqTax:   c1AcqResult.total,
    recipientTotal:    c1GiftResult.tax + c1AcqResult.total,
    grandTotal:        transferResult.total + c1GiftResult.tax + c1AcqResult.total,
    recipients: [{ label: '자녀', giftTax: c1GiftResult.tax, acqTax: c1AcqResult.total }],
  };

  // ── Case 2: 여러 명에게 분산 부담부증여 ──────────────
  const allRecipients = [
    { label: '자녀',       rel: CHILD,   skip: SKIP_F, r: child },
    { label: '자녀의배우자', rel: EXT_REL, skip: SKIP_F, r: childSpouse },
    { label: '손자녀1',     rel: CHILD,   skip: SKIP_T, r: grand1 },
    { label: '손자녀2',     rel: CHILD,   skip: SKIP_T, r: grand2 },
    { label: '손자녀3',     rel: CHILD,   skip: SKIP_T, r: grand3 },
  ].filter(rec => rec.r && rec.r.price > 0);

  let c2TotalGift = 0, c2TotalAcq = 0;
  const c2Recipients = allRecipients.map(({ label, rel, skip, r }) => {
    const rate     = r.price / marketPrice;
    const partLoan = Math.floor(loanPrice * rate);
    const netPrice = r.price - partLoan;  // 지분별 증여세 과세액

    // 취득세: 지분 시가 중 승계채무(유상)·나머지(무상) 구분 과세
    const acqResult = calcBurdenedGiveTakingTax(r.price, partLoan, space, heavy);
    const giftResult = rel === EXT_REL
      ? calcGiveTax(EXT_REL, SKIP_F, netPrice, r.age)
      : calcGiveTax(rel, skip, netPrice, r.age);
    c2TotalGift += giftResult.tax;
    c2TotalAcq  += acqResult.total;
    return { label, price: r.price, partLoan, giftTax: giftResult.tax, acqTax: acqResult.total };
  });

  const case2 = {
    label: '여러 명에게 분산 부담부증여',
    sellerTransferTax: transferResult.transferTax,
    sellerLocalTax:    transferResult.localTax,
    sellerTotal:       transferResult.total,
    recipientGiftTax:  c2TotalGift,
    recipientAcqTax:   c2TotalAcq,
    recipientTotal:    c2TotalGift + c2TotalAcq,
    grandTotal:        transferResult.total + c2TotalGift + c2TotalAcq,
    recipients:        c2Recipients,
  };

  // ── 보유세 변화 ────────────────────────────────────────
  const sPropertyTax = calcPropertyTax('다주택', officialPrice);
  const hPropertyTax = calcPropertyTax('다주택', holdOfficialPrice);
  const beforeAggrTax = calcAggrTax(
    '다주택', heavyStr,
    officialPrice + holdOfficialPrice, holdPeriod, ownerAge,
    sPropertyTax.propertyTax + hPropertyTax.propertyTax
  );
  const beforeTotal = sPropertyTax.total + hPropertyTax.total + beforeAggrTax.total;

  const afterOwnerPropTax = calcPropertyTax('다주택', holdOfficialPrice);
  const afterOwnerAggrTax = calcAggrTax(
    '다주택', heavyStr,
    holdOfficialPrice, holdPeriod2, ownerAge,
    afterOwnerPropTax.propertyTax
  );
  const afterOwnerTotal = afterOwnerPropTax.total + afterOwnerAggrTax.total;

  // Case1 수증자 보유세 (자녀 단독)
  const c1RecipientPropTax = calcPropertyTax('다주택', officialPrice);
  const c1RecipientAggrTax = calcAggrTax(
    '다주택', heavyStr, officialPrice, 0, child.age,
    c1RecipientPropTax.propertyTax
  );
  const afterCase1RecipientTotal = c1RecipientPropTax.total + c1RecipientAggrTax.total;

  // Case2 수증자 보유세 (각 지분 비례)
  let afterCase2RecipientTotal = 0;
  c2Recipients.forEach(rec => {
    const rate = rec.price / marketPrice;
    const partOfficialPrice = Math.floor(officialPrice * rate);
    const partPropTax = calcPropertyTax('다주택', partOfficialPrice);
    const partAggrTax = calcAggrTax('다주택', heavyStr, partOfficialPrice, 0, 0, partPropTax.propertyTax);
    afterCase2RecipientTotal += partPropTax.total + partAggrTax.total;
  });

  const holdingTax = {
    before:     { ownerTotal: beforeTotal, recipientTotal: 0, grandTotal: beforeTotal },
    afterCase1: {
      ownerTotal: afterOwnerTotal,
      recipientTotal: afterCase1RecipientTotal,
      grandTotal: afterOwnerTotal + afterCase1RecipientTotal,
    },
    afterCase2: {
      ownerTotal: afterOwnerTotal,
      recipientTotal: afterCase2RecipientTotal,
      grandTotal: afterOwnerTotal + afterCase2RecipientTotal,
    },
  };

  return {
    scenarioId: 4,
    title: '2주택자 — 자녀에게만 부담부증여할까? 여러 명에게 분산 부담부증여할까?',
    inputs,
    case1,
    case2,
    holdingTax,
    computations: [
      { caseNo: 1, caseLabel: '케이스1 — 자녀에게만 부담부증여', kind: 'gift', label: '증여세(시가−대출)', result: c1GiftResult },
      { caseNo: 1, caseLabel: '케이스1 — 자녀에게만 부담부증여', kind: 'burdenAcq', label: '취득세', result: c1AcqResult },
      { caseNo: 1, caseLabel: '케이스1 — 자녀에게만 부담부증여', kind: 'transfer', label: '양도소득세(대출 승계분)', result: transferResult },
    ],
    summary: {
      case1GrandTotal: case1.grandTotal,
      case2GrandTotal: case2.grandTotal,
      saving: case1.grandTotal - case2.grandTotal,
    },
    lawRef: [...new Set([
      ...c1GiftResult.lawRef,
      ...c1AcqResult.lawRef,
      ...transferResult.lawRef,
    ])],
  };
}
