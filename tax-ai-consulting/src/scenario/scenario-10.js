/**
 * 시나리오 10: 2주택자 — 배우자에게만 부담부증여할까? 여러 명에게 부담부증여할까?
 *
 * 수증자 구성 (원본 result10.php):
 *   p1(배우자 SPOUSE), p2(자녀의배우자 ETC), p3~p5(자녀2~4 CHILD)
 * 양도세: 대출분 전체에 대해 소유자 1회 부담 (배우자에게만 / 여러명에게 동일)
 *
 * ※ 원본(result10.php) 버그 수정:
 *   - line 183: calc_aggr_tax("다주택", s_heavy, ...) — s_heavy(정수) 대신 s_heavy_print(문자열) 사용
 *   - line 209: 자녀(30세 미만) 모두 "공동명의1주택" 적용 — 원본은 다주택 분기 누락
 */

import {
  SPOUSE, CHILD, EXT_REL, SKIP_F,
  INDEPENDENT_HH_AGE,
} from '../core/constants.js';
import { calcGiveTax }         from '../core/gift-tax.js';
import { calcBurdenedGiveTakingTax } from '../core/acquisition-tax.js';
import { calcPropertyTax }     from '../core/property-tax.js';
import { calcAggrTax }         from '../core/comprehensive-tax.js';
import { calcSaleIncomeTax }   from '../core/transfer-tax.js';

/**
 * @param {object} inputs
 * @param {number} inputs.marketPrice       시가 [원]
 * @param {number} inputs.officialPrice     기준시가 [원]
 * @param {number} inputs.basePrice         취득가액 [원]
 * @param {number} inputs.loanPrice         전세·담보대출 전체 [원]
 * @param {number} inputs.holdPeriod        보유기간 [년]
 * @param {number} inputs.stayPeriod        거주기간 [년]
 * @param {number} inputs.space             전용면적 코드 (85/86)
 * @param {number} inputs.heavy             조정지역 여부 (0/1)
 * @param {number} inputs.holdOfficialPrice 계속보유주택 기준시가 [원]
 * @param {number} inputs.holdPeriod2       계속보유주택 보유기간 [년]
 * @param {number} inputs.ownerAge          소유자 연령 [만 세]
 * @param {{ price:number, age:number }} inputs.spouse      배우자
 * @param {{ price:number, age:number }} inputs.childSpouse 자녀의배우자 (ETC)
 * @param {{ price:number, age:number }} inputs.child2      자녀2
 * @param {{ price:number, age:number }} inputs.child3      자녀3
 * @param {{ price:number, age:number }} inputs.child4      자녀4
 */
export function runScenario10(inputs) {
  const {
    marketPrice, officialPrice, basePrice, loanPrice,
    holdPeriod, stayPeriod, space, heavy,
    holdOfficialPrice, holdPeriod2, ownerAge,
    spouse, childSpouse, child2, child3, child4,
  } = inputs;

  const heavyStr = heavy === 1 ? '조정지역' : '비조정지역';

  // 소유자 양도세: 대출분에 대해 1회 (Case1, Case2 동일)
  const loanBasePrice = Math.floor(basePrice * loanPrice / marketPrice);
  const transferResult = calcSaleIncomeTax(
    loanPrice, loanBasePrice, holdPeriod, stayPeriod,
    '다주택', '주택'
  );

  // ── Case 1: 배우자에게만 부담부증여 ──────────────────
  const c1NetPrice = marketPrice - loanPrice;
  const c1GiftResult = calcGiveTax(SPOUSE, SKIP_F, c1NetPrice, spouse.age);
  const c1AcqResult  = calcBurdenedGiveTakingTax(marketPrice, loanPrice, space, heavy);

  const case1 = {
    label: '배우자에게만 부담부증여',
    sellerTransferTax: transferResult.transferTax,
    sellerLocalTax:    transferResult.localTax,
    sellerTotal:       transferResult.total,
    recipientGiftTax:  c1GiftResult.tax,
    recipientAcqTax:   c1AcqResult.total,
    recipientTotal:    c1GiftResult.tax + c1AcqResult.total,
    grandTotal:        transferResult.total + c1GiftResult.tax + c1AcqResult.total,
  };

  // ── Case 2: 여러 명에게 분산 부담부증여 ──────────────
  const allRecipients = [
    { label: '배우자',       rel: SPOUSE,  r: spouse },
    { label: '자녀의배우자', rel: EXT_REL, r: childSpouse },
    { label: '자녀2',        rel: CHILD,   r: child2 },
    { label: '자녀3',        rel: CHILD,   r: child3 },
    { label: '자녀4',        rel: CHILD,   r: child4 },
  ].filter(rec => rec.r && rec.r.price > 0);

  let c2TotalGift = 0, c2TotalAcq = 0;
  const c2Recipients = allRecipients.map(({ label, rel, r }) => {
    const rate     = r.price / marketPrice;
    const partLoan = Math.floor(loanPrice * rate);
    const netPrice = r.price - partLoan;

    // 취득세: 지분 시가 중 승계채무(유상)·나머지(무상) 구분 과세
    const acqResult = calcBurdenedGiveTakingTax(r.price, partLoan, space, heavy);
    const giftResult = calcGiveTax(rel === EXT_REL ? EXT_REL : rel, SKIP_F, netPrice, r.age);
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
  // ※ 버그 수정: heavyStr 문자열 사용 (원본은 정수 s_heavy 전달 오류)
  const beforeAggrTax = calcAggrTax(
    '다주택', heavyStr,
    officialPrice + holdOfficialPrice, holdPeriod, ownerAge,
    sPropertyTax.propertyTax + hPropertyTax.propertyTax
  );
  const beforeOwnerTotal = sPropertyTax.total + hPropertyTax.total + beforeAggrTax.total;

  const afterOwnerPropTax = calcPropertyTax('다주택', holdOfficialPrice);
  const afterOwnerAggrTax = calcAggrTax(
    '다주택', heavyStr, holdOfficialPrice, holdPeriod2, ownerAge,
    afterOwnerPropTax.propertyTax
  );
  const afterOwnerTotal = afterOwnerPropTax.total + afterOwnerAggrTax.total;

  // Case1: 배우자 단독 보유세
  const c1SpousePropTax = calcPropertyTax('다주택', officialPrice);
  const c1SpouseAggrTax = calcAggrTax(
    '다주택', heavyStr, officialPrice, 0, spouse.age,
    c1SpousePropTax.propertyTax
  );
  const afterCase1RecipientTotal = c1SpousePropTax.total + c1SpouseAggrTax.total;

  // 1세대1주택 재산세 (자녀 ≥30 별도세대 계산용)
  const r1PropTax = calcPropertyTax('1세대1주택', officialPrice);

  // Case2: 각 수증자 보유세
  let afterCase2RecipientTotal = 0;
  c2Recipients.forEach(rec => {
    const rate = rec.price / marketPrice;
    const partOfficialPrice = Math.floor(officialPrice * rate);
    const r = allRecipients.find(a => a.label === rec.label);

    if (!r) return;
    const age = r.r.age;
    const rel = r.rel;

    if (rel === SPOUSE || age < INDEPENDENT_HH_AGE) {
      const partPropTax = calcPropertyTax('다주택', partOfficialPrice);
      const partAggrTax = calcAggrTax(
        '다주택', heavyStr, partOfficialPrice, 0, age,
        sPropertyTax.propertyTax * rate
      );
      afterCase2RecipientTotal += partPropTax.total + partAggrTax.total;
    } else {
      const partPropTaxAmt = (r1PropTax.propertyTax + r1PropTax.pEduTax + r1PropTax.dosiTax) * rate;
      const partAggrTax = calcAggrTax(
        '공동명의1주택', heavyStr, partOfficialPrice, 0, age,
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
    scenarioId: 10,
    title: '2주택자 — 배우자에게만 부담부증여할까? 여러 명에게 분산 부담부증여할까?',
    inputs,
    case1,
    case2,
    holdingTax,
    computations: [
      { caseNo: 1, caseLabel: '케이스1 — 배우자에게만 부담부증여', kind: 'gift', label: '증여세(시가−대출)', result: c1GiftResult },
      { caseNo: 1, caseLabel: '케이스1 — 배우자에게만 부담부증여', kind: 'burdenAcq', label: '취득세', result: c1AcqResult },
      { caseNo: 1, caseLabel: '케이스1 — 배우자에게만 부담부증여', kind: 'transfer', label: '양도소득세(대출 승계분)', result: transferResult },
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
