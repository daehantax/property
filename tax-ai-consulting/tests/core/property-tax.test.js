import { describe, it, expect } from 'vitest';
import { calcPropertyTax } from '../../src/core/property-tax.js';

describe('calcPropertyTax — 재산세', () => {
  describe('공정시장가액비율 (1세대1주택 특례)', () => {
    it('공시 3억 이하: 43%', () => {
      const r = calcPropertyTax('1세대1주택', 300_000_000);
      expect(r.breakdown.fairMarketRatio).toBe(0.43);
    });
    it('공시 3~6억: 44%', () => {
      const r = calcPropertyTax('1세대1주택', 500_000_000);
      expect(r.breakdown.fairMarketRatio).toBe(0.44);
    });
    it('공시 6억 초과: 45%', () => {
      const r = calcPropertyTax('1세대1주택', 800_000_000);
      expect(r.breakdown.fairMarketRatio).toBe(0.45);
    });
    it('다주택: 60% 일률 적용', () => {
      const r = calcPropertyTax('다주택', 500_000_000);
      expect(r.breakdown.fairMarketRatio).toBe(0.6);
    });
  });

  describe('과세표준 계산', () => {
    it('1세대1주택 5억: 5억 × 44% = 2.2억', () => {
      const r = calcPropertyTax('1세대1주택', 500_000_000);
      expect(r.breakdown.taxBase).toBe(220_000_000);
    });
    it('다주택 5억: 5억 × 60% = 3억', () => {
      const r = calcPropertyTax('다주택', 500_000_000);
      expect(r.breakdown.taxBase).toBe(300_000_000);
    });
  });

  it('도시지역분 = 과세표준 × 0.14%', () => {
    const r = calcPropertyTax('다주택', 500_000_000);
    expect(r.dosiTax).toBeCloseTo(r.breakdown.taxBase * 0.0014, 2);
  });

  it('지방교육세 = 재산세 × 20%', () => {
    const r = calcPropertyTax('다주택', 500_000_000);
    expect(r.pEduTax).toBeCloseTo(r.propertyTax * 0.2, 2);
  });

  it('total = propertyTax + dosiTax + pEduTax', () => {
    const r = calcPropertyTax('다주택', 500_000_000);
    expect(r.total).toBeCloseTo(r.propertyTax + r.dosiTax + r.pEduTax, 2);
  });

  it('공시 9억 초과 시 별도 세율 적용 → 9억 이하보다 큼', () => {
    const low  = calcPropertyTax('다주택', 800_000_000);
    const high = calcPropertyTax('다주택', 1_500_000_000);
    expect(high.propertyTax / 1_500_000_000)
      .toBeGreaterThan(low.propertyTax / 800_000_000);
  });
});

describe('공동명의 1주택 — 1세대1주택과 동일 취급 (물건별 과세)', () => {
  it('공정시장가액비율 43~45% 특례 적용', () => {
    expect(calcPropertyTax('공동명의1주택', 500_000_000).breakdown.fairMarketRatio).toBe(0.44);
    expect(calcPropertyTax('공동명의1주택', 1_500_000_000).breakdown.fairMarketRatio).toBe(0.45);
  });

  it('세액이 단독명의 1세대1주택과 동일', () => {
    const single = calcPropertyTax('1세대1주택', 800_000_000);
    const couple = calcPropertyTax('공동명의1주택', 800_000_000);
    expect(couple.total).toBeCloseTo(single.total, 6);
  });
});

describe('특례세율 판정 (지방세법 §111의2)', () => {
  it('1세대1주택 & 공시 9억 이하 → 특례세율', () => {
    expect(calcPropertyTax('1세대1주택', 800_000_000).breakdown.specialRate).toBe(true);
  });

  it('1세대1주택이라도 공시 9억 초과 → 표준세율', () => {
    expect(calcPropertyTax('1세대1주택', 1_500_000_000).breakdown.specialRate).toBe(false);
  });

  it('다주택은 공시 9억 이하라도 표준세율', () => {
    const r = calcPropertyTax('다주택', 500_000_000);
    expect(r.breakdown.specialRate).toBe(false);
    // 과표 3억: 표준세율 19.5만 + 1.5억 × 0.25% = 57만
    expect(r.propertyTax).toBeCloseTo(195_000 + 150_000_000 * 0.0025, 2);
  });
});
