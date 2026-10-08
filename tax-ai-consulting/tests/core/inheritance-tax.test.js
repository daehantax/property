import { describe, it, expect } from 'vitest';
import {
  calcInheritanceTax, inheritRawTax, presumedAsset, funeralDeduct, financialDeduct,
  legalShares, reportDeadline, aggregateEstateItems,
} from '../../src/core/inheritance-tax.js';

describe('상속세 — 구성 요소', () => {
  it('누진세율 10~50%', () => {
    expect(inheritRawTax(100_000_000).tax).toBe(10_000_000);
    expect(inheritRawTax(500_000_000).tax).toBe(90_000_000);
    expect(inheritRawTax(1_000_000_000).tax).toBe(240_000_000);
    expect(inheritRawTax(3_000_000_000).tax).toBe(1_040_000_000);
    expect(inheritRawTax(4_000_000_000).tax).toBe(1_540_000_000);
  });

  it('장례비: 최소 500만, 한도 1,000만 + 봉안 500만', () => {
    expect(funeralDeduct(0, 0)).toBe(5_000_000);
    expect(funeralDeduct(30_000_000, 0)).toBe(10_000_000);
    expect(funeralDeduct(30_000_000, 8_000_000)).toBe(15_000_000);
  });

  it('금융재산공제: 2천만 이하 전액 / 1억 이하 2천만 / 초과 20%·한도 2억', () => {
    expect(financialDeduct(15_000_000)).toBe(15_000_000);
    expect(financialDeduct(80_000_000)).toBe(20_000_000);
    expect(financialDeduct(500_000_000)).toBe(100_000_000);
    expect(financialDeduct(2_000_000_000)).toBe(200_000_000);
  });

  it('추정상속재산: 1년 2억 이상 인출 중 용도불분명액 − min(20%, 2억)', () => {
    expect(presumedAsset({ withdrawn: 300_000_000, unexplained: 100_000_000 }, 200_000_000).amount).toBe(40_000_000);
    expect(presumedAsset({ withdrawn: 150_000_000, unexplained: 150_000_000 }, 200_000_000).applies).toBe(false);
  });

  it('법정상속분: 배우자 1.5 : 자녀 각 1', () => {
    const s = legalShares([{ relation: 'spouse' }, { relation: 'child' }, { relation: 'child' }]);
    expect(s.get(0)).toBeCloseTo(1.5 / 3.5);
    expect(s.get(1)).toBeCloseTo(1 / 3.5);
  });

  it('신고기한: 사망한 달 말일부터 6개월 (국외 9개월)', () => {
    expect(reportDeadline('2026-03-15')).toBe('2026-09-30');
    expect(reportDeadline('2026-08-31')).toBe('2027-02-28');
    expect(reportDeadline('2026-03-15', true)).toBe('2026-12-31');
  });
});

describe('calcInheritanceTax — 계산 사례', () => {
  it('배우자+자녀 2, 20억(부동산 15억·금융 5억): 일괄 5억 + 배우자 법정지분 + 금융 1억', () => {
    const r = calcInheritanceTax({
      assets: { realEstate: 1_500_000_000, financial: 500_000_000 },
      liabilities: { funeral: 10_000_000 },
      heirs: [{ relation: 'spouse', age: 68 }, { relation: 'child', age: 40 }, { relation: 'child', age: 38 }],
    });
    const b = r.breakdown;
    expect(b.taxableValue).toBe(1_990_000_000);
    // 본래 상속재산은 항목별 + 소계로 표시
    expect(r.steps.map((s) => s.label.trim())).toEqual(expect.arrayContaining(['부동산', '금융재산 (예금·주식·채권 등)', '본래 상속재산 소계']));
    expect(r.steps.find((s) => s.label === '본래 상속재산 소계').amount).toBe(2_000_000_000);
    expect(b.basicDeduct).toBe(500_000_000);
    expect(b.spouseDeduct).toBe(857_142_857);
    expect(b.finDeduct).toBe(100_000_000);
    expect(b.taxBase).toBe(532_857_143);
    expect(b.computedTax).toBe(99_857_142);
    expect(b.reportCredit).toBe(2_995_714);
    expect(r.tax).toBe(96_861_428);
    // 상속인별 안분 합계 ≈ 납부세액
    const sum = r.heirs.reduce((s, h) => s + h.tax, 0);
    expect(Math.abs(sum - r.tax)).toBeLessThanOrEqual(3);
  });

  it('배우자 실제 상속액이 5억 미만이면 최소 5억 공제', () => {
    const r = calcInheritanceTax({
      assets: { realEstate: 2_000_000_000 },
      heirs: [{ relation: 'spouse', amount: 300_000_000 }, { relation: 'child', age: 40, amount: 1_700_000_000 }],
    });
    expect(r.breakdown.spouseDeduct).toBe(500_000_000);
  });

  it('배우자 단독상속 10억: 일괄공제 불가(기초 2억) + 배우자공제 → 세액 0', () => {
    const r = calcInheritanceTax({
      assets: { realEstate: 1_000_000_000 },
      heirs: [{ relation: 'spouse', age: 70 }],
    });
    expect(r.breakdown.basicDeduct).toBe(200_000_000);
    expect(r.breakdown.lumpChoice).toContain('배우자 단독상속');
    expect(r.breakdown.taxBase).toBe(0);
    expect(r.tax).toBe(0);
  });

  it('자녀 2(미성년 1): 기초+인적 3.9억 < 5억 → 일괄공제', () => {
    const r = calcInheritanceTax({
      assets: { realEstate: 700_000_000 },
      liabilities: { funeral: 10_000_000 },
      heirs: [{ relation: 'child', age: 30 }, { relation: 'child', age: 10 }],
    });
    expect(r.breakdown.personalSum).toBe(190_000_000);
    expect(r.breakdown.basicDeduct).toBe(500_000_000);
    expect(r.breakdown.taxBase).toBe(190_000_000);
    expect(r.tax).toBe(27_160_000);
  });

  it('손자녀 세대생략 할증 30% — 손자녀 몫 비율만큼', () => {
    const r = calcInheritanceTax({
      assets: { realEstate: 1_500_000_000 },
      liabilities: { funeral: 10_000_000 },
      heirs: [
        { relation: 'child', age: 45, amount: 1_000_000_000 },
        { relation: 'grandchild', age: 20, amount: 500_000_000 },
      ],
    });
    expect(r.breakdown.computedTax).toBe(237_000_000);
    expect(r.breakdown.skipSurcharge).toBe(23_700_000);
    expect(r.tax).toBe(252_879_000);
    const gc = r.heirs.find((h) => h.relation === 'grandchild');
    const ch = r.heirs.find((h) => h.relation === 'child');
    expect(gc.tax).toBeGreaterThan(ch.tax / 2);   // 할증분이 손자녀에게 귀속
  });

  it('사전증여가 크면 공제적용 한도(§24)로 공제가 줄고, 증여세액공제로 이중과세 조정', () => {
    const r = calcInheritanceTax({
      assets: { realEstate: 300_000_000 },
      priorGifts: { toHeirs: 1_000_000_000, heirGiftTaxBase: 950_000_000, giftTaxPaid: 225_000_000 },
      heirs: [{ relation: 'child', age: 40, priorGift: 1_000_000_000 }],
    });
    const b = r.breakdown;
    expect(b.taxableValue).toBe(1_295_000_000);
    expect(b.deductLimit).toBe(345_000_000);
    expect(b.deductApplied).toBe(345_000_000);
    expect(b.taxBase).toBe(950_000_000);
    expect(b.computedTax).toBe(225_000_000);
    expect(b.giftCredit).toBe(225_000_000);
    expect(r.tax).toBe(0);
  });

  it('간주·추정상속재산 가산, 동거주택공제 6억 한도, 무신고면 신고세액공제 없음', () => {
    const r = calcInheritanceTax({
      assets: { realEstate: 1_000_000_000, insurance: 200_000_000 },
      presumed: { y1: { withdrawn: 300_000_000, unexplained: 100_000_000 } },
      liabilities: { funeral: 10_000_000 },
      heirs: [{ relation: 'child', age: 50 }],
      options: { cohabitHouse: 900_000_000, reportOnTime: false },
    });
    const b = r.breakdown;
    expect(b.grossEstate).toBe(1_240_000_000);
    expect(b.cohabit).toBe(600_000_000);
    // 간주 보험금 2억도 금융재산공제 대상 → 20% = 4천만
    expect(b.netFinancial).toBe(200_000_000);
    expect(b.finDeduct).toBe(40_000_000);
    expect(b.reportCredit).toBe(0);
    expect(b.taxBase).toBe(1_230_000_000 - 1_140_000_000);
  });
});

describe('aggregateEstateItems — 재산·부채 명세 한 번 입력 → 계산 입력', () => {
  const heirs = [{ relation: 'spouse', name: '배우자' }, { relation: 'child', name: '자녀1' }, { relation: 'child', name: '자녀2' }];

  it('구분별 합산 + 지정 상속인 순취득 + 미지정분은 법정상속분 배분', () => {
    const agg = aggregateEstateItems([
      { type: 'realEstate', amount: 1_200_000_000, heir: 0 },
      { type: 'realEstate', amount: 300_000_000, heir: '' },
      { type: 'financial', amount: 500_000_000, heir: '' },
      { type: 'insurance', amount: 100_000_000, heir: 1 },
      { type: 'financialDebt', amount: 200_000_000, heir: 0 },
      { type: 'giftHeir', amount: 50_000_000, heir: 2 },
      { type: 'giftOther', amount: 30_000_000, heir: '' },
    ], heirs);
    expect(agg.assets.realEstate).toBe(1_500_000_000);
    expect(agg.assets.insurance).toBe(100_000_000);
    expect(agg.liabilities.financialDebts).toBe(200_000_000);
    expect(agg.priorGifts).toEqual({ toHeirs: 50_000_000, toOthers: 30_000_000 });
    // 미지정 순재산 8억 → 배우자 1.5/3.5, 자녀 각 1/3.5
    expect(agg.allocation[0].net).toBe(1_200_000_000 - 200_000_000 + Math.floor(800_000_000 * 1.5 / 3.5));
    expect(agg.allocation[1].net).toBe(100_000_000 + Math.floor(800_000_000 / 3.5));
    expect(agg.heirs[2].priorGift).toBe(50_000_000);
    expect(agg.anyAssigned).toBe(true);
  });

  it('지정이 하나도 없으면 amount 0 → 엔진이 법정상속분으로 배분', () => {
    const agg = aggregateEstateItems([{ type: 'realEstate', amount: 1_000_000_000, heir: '' }], heirs);
    expect(agg.anyAssigned).toBe(false);
    expect(agg.heirs.every((h) => h.amount === 0)).toBe(true);
  });

  it('명세로 배우자 몫이 0원이면 배우자공제는 최소 5억 (법정지분 가정 아님)', () => {
    const agg = aggregateEstateItems([{ type: 'realEstate', amount: 2_000_000_000, heir: 1 }], heirs);
    const r = calcInheritanceTax({ assets: agg.assets, heirs: agg.heirs, options: { spouseActual: agg.heirs[0].amount } });
    expect(r.breakdown.spouseDeduct).toBe(500_000_000);
  });
});
