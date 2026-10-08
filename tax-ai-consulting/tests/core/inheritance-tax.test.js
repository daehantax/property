import { describe, it, expect } from 'vitest';
import {
  calcInheritanceTax, inheritRawTax, presumedAsset, funeralDeduct, financialDeduct,
  legalShares, reportDeadline,
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
    expect(b.reportCredit).toBe(0);
    expect(b.taxBase).toBe(1_230_000_000 - 1_100_000_000);
  });
});
