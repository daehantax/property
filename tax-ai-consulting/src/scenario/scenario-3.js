/**
 * 시나리오 3: 2주택자 — 자녀에게만 증여할까? 여러 명에게 증여할까?
 *
 * Case1: 자녀에게만 일반증여 (100%)
 * Case2: 자녀(지분) + 자녀의배우자(지분) + 손자녀최대3명 분산증여
 *        - 자녀, 자녀의배우자: SKIP_F
 *        - 손자녀: SKIP_T (세대생략 할증)
 * 비교:  증여 전후 보유세(재산세+종부세) 변화
 */

import {
  CHILD, EXT_REL, SKIP_T, SKIP_F,
} from '../core/constants.js';
import { calcGiveTax }         from '../core/gift-tax.js';
import { calcTakingTax, calcGiveTakingEtcTax } from '../core/acquisition-tax.js';
import { calcPropertyTax }     from '../core/property-tax.js';
import { calcAggrTax }         from '../core/comprehensive-tax.js';

/**
 * 수증자 정보 구조
 * @typedef {{ price: number, age: number }} Recipient
 */

/**
 * @param {object} inputs
 * @param {number}    inputs.marketPrice       시가 [원]
 * @param {number}    inputs.officialPrice     기준시가 [원]
 * @param {number}    inputs.holdPeriod        보유기간 [년]
 * @param {number}    inputs.stayPeriod        거주기간 [년]
 * @param {number}    inputs.space             전용면적 코드 (85/86)
 * @param {number}    inputs.heavy             조정지역 여부 (0/1)
 * @param {number}    inputs.holdOfficialPrice 계속보유주택 기준시가 [원]
 * @param {number}    inputs.holdPeriod2       계속보유주택 보유기간 [년]
 * @param {number}    inputs.ownerAge          소유자 연령 [만 세]
 * @param {Recipient} inputs.child             자녀 { price, age }
 * @param {Recipient} inputs.childSpouse       자녀의배우자 { price, age } (price=0이면 미포함)
 * @param {Recipient} inputs.grand1            손자녀1 { price, age }
 * @param {Recipient} inputs.grand2            손자녀2 { price, age }
 * @param {Recipient} inputs.grand3            손자녀3 { price, age }
 */
export function runScenario3(inputs) {
  const {
    marketPrice, officialPrice,
    holdPeriod, stayPeriod, space, heavy,
    holdOfficialPrice, holdPeriod2, ownerAge,
    child, childSpouse, grand1, grand2, grand3,
  } = inputs;

  const heavyStr = heavy === 1 ? '조정지역' : '비조정지역';

  // ── Case 1: 자녀에게만 증여 ───────────────────────────
  const childGiftResult = calcGiveTax(CHILD, SKIP_F, marketPrice, child.age);
  const childAcqResult  = calcTakingTax('give', marketPrice, 0, 0, space, heavy);

  const case1 = {
    label: '자녀에게만 증여',
    giftTax: childGiftResult.tax,
    acqTax:  childAcqResult.total,
    total:   childGiftResult.tax + childAcqResult.total,
    recipients: [{ label: '자녀', giftTax: childGiftResult.tax, acqTax: childAcqResult.total }],
  };

  // ── Case 2: 여러 명에게 분산증여 ─────────────────────
  const recipients = [
    { label: '자녀',       rel: CHILD,   skip: SKIP_F, r: child },
    { label: '자녀의배우자', rel: EXT_REL, skip: SKIP_F, r: childSpouse },
    { label: '손자녀1',     rel: CHILD,   skip: SKIP_T, r: grand1 },
    { label: '손자녀2',     rel: CHILD,   skip: SKIP_T, r: grand2 },
    { label: '손자녀3',     rel: CHILD,   skip: SKIP_T, r: grand3 },
  ].filter(rec => rec.r && rec.r.price > 0);

  let case2TotalGift = 0, case2TotalAcq = 0;
  const case2Recipients = recipients.map(({ label, rel, skip, r }) => {
    let giftResult, acqResult;
    // 자녀의 배우자(EXT_REL)는 calcGiveTakingEtcTax 사용
    if (rel === EXT_REL) {
      giftResult = calcGiveTax(EXT_REL, SKIP_F, r.price, r.age);
      acqResult  = calcGiveTakingEtcTax(r.price, space, heavy);
    } else {
      giftResult = calcGiveTax(rel, skip, r.price, r.age);
      acqResult  = calcTakingTax('give', r.price, 0, 0, space, heavy);
    }
    case2TotalGift += giftResult.tax;
    case2TotalAcq  += acqResult.total;
    return { label, price: r.price, giftTax: giftResult.tax, acqTax: acqResult.total };
  });

  const case2 = {
    label: '여러 명에게 분산증여',
    giftTax: case2TotalGift,
    acqTax:  case2TotalAcq,
    total:   case2TotalGift + case2TotalAcq,
    recipients: case2Recipients,
  };

  // ── 보유세 변화 ────────────────────────────────────────
  const sPropertyTax = calcPropertyTax('다주택', officialPrice);
  const hPropertyTax = calcPropertyTax('다주택', holdOfficialPrice);
  const beforeOwnerPropertyTotal = sPropertyTax.total + hPropertyTax.total;
  const beforeAggrTax = calcAggrTax(
    '다주택', heavyStr,
    officialPrice + holdOfficialPrice,
    holdPeriod, ownerAge,
    sPropertyTax.propertyTax + hPropertyTax.propertyTax
  );
  const beforeTotal = beforeOwnerPropertyTotal + beforeAggrTax.total;

  // 증여 후 소유자: 계속보유주택만
  const afterOwnerPropTax = calcPropertyTax('다주택', holdOfficialPrice);
  const afterOwnerAggrTax = calcAggrTax(
    '다주택', heavyStr,
    holdOfficialPrice, holdPeriod2, ownerAge,
    afterOwnerPropTax.propertyTax
  );
  const afterOwnerTotal = afterOwnerPropTax.total + afterOwnerAggrTax.total;

  // Case1 후 수증자(자녀) 보유세
  const c1RecipientPropTax = calcPropertyTax('다주택', officialPrice);
  const c1RecipientAggrTax = calcAggrTax(
    '다주택', heavyStr,
    officialPrice, 0, child.age,
    c1RecipientPropTax.propertyTax
  );
  const afterCase1RecipientTotal = c1RecipientPropTax.total + c1RecipientAggrTax.total;

  // Case2 후 수증자들 보유세 (지분율 비례)
  let afterCase2RecipientTotal = 0;
  case2Recipients.forEach(rec => {
    const rate = rec.price / marketPrice;
    const partOfficialPrice = Math.floor(officialPrice * rate);
    const partPropertyTax = calcPropertyTax('다주택', partOfficialPrice);
    const partAggrTax = calcAggrTax(
      '다주택', heavyStr,
      partOfficialPrice, 0, 0,   // 수증자 개인 보유기간·나이 미적용 (다주택 간주)
      partPropertyTax.propertyTax
    );
    afterCase2RecipientTotal += partPropertyTax.total + partAggrTax.total;
  });

  const holdingTax = {
    before: { ownerTotal: beforeTotal, recipientTotal: 0, grandTotal: beforeTotal },
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
    scenarioId: 3,
    title: '2주택자 — 자녀에게만 증여할까? 여러 명에게 분산증여할까?',
    inputs,
    case1,
    case2,
    holdingTax,
    computations: [
      { caseNo: 1, caseLabel: '케이스1 — 자녀에게만 증여', kind: 'gift', label: '증여세', result: childGiftResult },
      { caseNo: 1, caseLabel: '케이스1 — 자녀에게만 증여', kind: 'acq', label: '취득세', result: childAcqResult },
    ],
    summary: {
      case1Total: case1.total,
      case2Total: case2.total,
      saving: case1.total - case2.total,
    },
    lawRef: [...new Set([
      ...childGiftResult.lawRef,
      ...childAcqResult.lawRef,
    ])],
  };
}
