/**
 * 시나리오 9: 2주택자 — 배우자에게만 증여할까? 배우자+자녀에게 분산증여할까?
 *
 * Case1: 배우자에게만 증여 (전체)
 * Case2: 배우자(지분) + 자녀1~4(각 지분) 분산증여
 *
 * 분산증여 보유세 규칙 (result9.php 원본 로직):
 *   - 배우자: 같은 세대 → 항상 "다주택" 종부세
 *   - 자녀 나이 < 30: 아직 부모 세대원 → "다주택" 종부세
 *   - 자녀 나이 ≥ 30: 별도 세대 가정 → 재산세 "1세대1주택", 종부세 "공동명의1주택"
 */

import { SPOUSE, CHILD, SKIP_F } from '../core/constants.js';
import { calcGiveTax }       from '../core/gift-tax.js';
import { calcTakingTax }     from '../core/acquisition-tax.js';
import { calcPropertyTax }   from '../core/property-tax.js';
import { calcAggrTax }       from '../core/comprehensive-tax.js';
import { INDEPENDENT_HH_AGE } from '../core/constants.js';

/**
 * @param {object} inputs
 * @param {number} inputs.marketPrice       시가 [원]
 * @param {number} inputs.officialPrice     기준시가 [원]
 * @param {number} inputs.holdPeriod        보유기간 [년]
 * @param {number} inputs.space             전용면적 코드 (85/86)
 * @param {number} inputs.heavy             조정지역 여부 (0/1)
 * @param {number} inputs.holdOfficialPrice 계속보유주택 기준시가 [원]
 * @param {number} inputs.holdPeriod2       계속보유주택 보유기간 [년]
 * @param {number} inputs.ownerAge          소유자 연령 [만 세]
 * @param {{ price:number, age:number }} inputs.spouse  배우자 { price, age }
 * @param {{ price:number, age:number }} inputs.child1  자녀1 (price=0이면 미포함)
 * @param {{ price:number, age:number }} inputs.child2  자녀2
 * @param {{ price:number, age:number }} inputs.child3  자녀3
 * @param {{ price:number, age:number }} inputs.child4  자녀4
 */
export function runScenario9(inputs) {
  const {
    marketPrice, officialPrice,
    holdPeriod, space, heavy,
    holdOfficialPrice, holdPeriod2, ownerAge,
    spouse, child1, child2, child3, child4,
  } = inputs;

  const heavyStr = heavy === 1 ? '조정지역' : '비조정지역';

  // ── Case 1: 배우자에게만 전체 증여 ───────────────────
  const c1GiftResult = calcGiveTax(SPOUSE, SKIP_F, marketPrice, spouse.age);
  const c1AcqResult  = calcTakingTax('give', marketPrice, 0, 0, space, heavy);

  const case1 = {
    label: '배우자에게만 증여',
    giftTax: c1GiftResult.tax,
    acqTax:  c1AcqResult.total,
    total:   c1GiftResult.tax + c1AcqResult.total,
  };

  // ── Case 2: 분산증여 ──────────────────────────────────
  const allRecipients = [
    { label: '배우자',  rel: SPOUSE, r: spouse },
    { label: '자녀1',  rel: CHILD,  r: child1 },
    { label: '자녀2',  rel: CHILD,  r: child2 },
    { label: '자녀3',  rel: CHILD,  r: child3 },
    { label: '자녀4',  rel: CHILD,  r: child4 },
  ].filter(rec => rec.r && rec.r.price > 0);

  let c2TotalGift = 0, c2TotalAcq = 0;
  const c2Recipients = allRecipients.map(({ label, rel, r }) => {
    const giftResult = calcGiveTax(rel, SKIP_F, r.price, r.age);
    // 증여취득 12% 중과 판정은 지분액이 아닌 주택 전체 시가(marketPrice) 기준
    const acqResult  = calcTakingTax('give', r.price, 0, 0, space, heavy, marketPrice);
    c2TotalGift += giftResult.tax;
    c2TotalAcq  += acqResult.total;
    return { label, price: r.price, age: r.age, giftTax: giftResult.tax, acqTax: acqResult.total };
  });

  const case2 = {
    label: '배우자+자녀 분산증여',
    giftTax: c2TotalGift,
    acqTax:  c2TotalAcq,
    total:   c2TotalGift + c2TotalAcq,
    recipients: c2Recipients,
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

  // 증여 후 소유자
  const afterOwnerPropTax = calcPropertyTax('다주택', holdOfficialPrice);
  const afterOwnerAggrTax = calcAggrTax(
    '다주택', heavyStr, holdOfficialPrice, holdPeriod2, ownerAge,
    afterOwnerPropTax.propertyTax
  );
  const afterOwnerTotal = afterOwnerPropTax.total + afterOwnerAggrTax.total;

  // Case1: 배우자 보유세 (전체)
  const c1SpousePropTax = calcPropertyTax('다주택', officialPrice);
  const c1SpouseAggrTax = calcAggrTax(
    '다주택', heavyStr, officialPrice, 0, spouse.age,
    c1SpousePropTax.propertyTax
  );
  const afterCase1RecipientTotal = c1SpousePropTax.total + c1SpouseAggrTax.total;

  // Case2: 각 수증자 보유세 (지분 비례, 나이 30세 기준 분기)
  // 1세대1주택 재산세 계산용
  const r1PropTax = calcPropertyTax('1세대1주택', officialPrice);

  let afterCase2RecipientTotal = 0;
  c2Recipients.forEach(rec => {
    const rate = rec.price / marketPrice;
    const partOfficialPrice = Math.floor(officialPrice * rate);

    if (rec.rel === SPOUSE || rec.age < INDEPENDENT_HH_AGE) {
      // 배우자 또는 30세 미만 자녀: 다주택 종부세
      const partPropTax = calcPropertyTax('다주택', partOfficialPrice);
      const partAggrTax = calcAggrTax(
        '다주택', heavyStr, partOfficialPrice, 0, rec.age,
        sPropertyTax.propertyTax * rate
      );
      afterCase2RecipientTotal += partPropTax.total + partAggrTax.total;
    } else {
      // 30세 이상 자녀: 별도 세대 → 재산세 1세대1주택 비율 적용, 종부세 공동명의1주택
      const partPropTaxAmt = (r1PropTax.propertyTax + r1PropTax.pEduTax + r1PropTax.dosiTax) * rate;
      const partAggrTax = calcAggrTax(
        '공동명의1주택', heavyStr, partOfficialPrice, 0, rec.age,
        sPropertyTax.propertyTax * rate
      );
      afterCase2RecipientTotal += partPropTaxAmt + partAggrTax.total;
    }
  });

  const holdingTax = {
    before:    { ownerTotal: beforeOwnerTotal, recipientTotal: 0, grandTotal: beforeOwnerTotal },
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
    scenarioId: 9,
    title: '2주택자 — 배우자에게만 증여할까? 배우자+자녀에게 분산증여할까?',
    inputs,
    case1,
    case2,
    holdingTax,
    computations: [
      { caseNo: 1, caseLabel: '케이스1 — 배우자에게만 증여', kind: 'gift', label: '증여세', result: c1GiftResult },
      { caseNo: 1, caseLabel: '케이스1 — 배우자에게만 증여', kind: 'acq', label: '취득세', result: c1AcqResult },
    ],
    holdingComputations: [
      { caseNo: 'b', caseLabel: '증여 전 — 소유자 2주택', kind: 'property', label: '재산세 ① 대상주택', result: sPropertyTax },
      { caseNo: 'b', caseLabel: '증여 전 — 소유자 2주택', kind: 'property', label: '재산세 ② 계속보유주택', result: hPropertyTax },
      { caseNo: 'b', caseLabel: '증여 전 — 소유자 2주택', kind: 'aggr', label: '종합부동산세 (2주택 합산)', result: beforeAggrTax },
      { caseNo: 'o', caseLabel: '증여 후 — 소유자(계속보유주택 1주택)', kind: 'property', label: '재산세', result: afterOwnerPropTax },
      { caseNo: 'o', caseLabel: '증여 후 — 소유자(계속보유주택 1주택)', kind: 'aggr', label: '종합부동산세', result: afterOwnerAggrTax },
      { caseNo: 's', caseLabel: '케이스1 증여 후 — 배우자(전체 수증)', kind: 'property', label: '재산세', result: c1SpousePropTax },
      { caseNo: 's', caseLabel: '케이스1 증여 후 — 배우자(전체 수증)', kind: 'aggr', label: '종합부동산세', result: c1SpouseAggrTax },
    ],
    summary: {
      case1Total: case1.total,
      case2Total: case2.total,
      saving: case1.total - case2.total,
    },
    lawRef: [...new Set([
      ...c1GiftResult.lawRef,
      ...c1AcqResult.lawRef,
    ])],
  };
}
