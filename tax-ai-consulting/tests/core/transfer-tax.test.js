import { describe, it, expect } from 'vitest';
import { calcSaleIncomeTax } from '../../src/core/transfer-tax.js';

describe('calcSaleIncomeTax — 양도소득세', () => {
  describe('1세대1주택 비과세', () => {
    it('12억 이하: 전액 비과세 (세액 0)', () => {
      const r = calcSaleIncomeTax(1_000_000_000, 500_000_000, 5, 3, '1세대1주택', '주택');
      expect(r.breakdown.taxableIncome).toBe(0);
      expect(r.transferTax).toBe(0);
    });

    it('12억 초과: 초과분 비율만 과세', () => {
      const r = calcSaleIncomeTax(2_000_000_000, 1_000_000_000, 10, 10, '1세대1주택', '주택');
      // 양도차익 10억 × (20억-12억)/20억 = 4억
      expect(r.breakdown.taxableIncome).toBeCloseTo(400_000_000, 0);
    });
  });

  describe('장기보유특별공제 (1세대1주택)', () => {
    it('거주 2년 미만: 공제 없음', () => {
      const r = calcSaleIncomeTax(2_000_000_000, 1_000_000_000, 10, 1, '1세대1주택', '주택');
      expect(r.breakdown.holdDeductRate).toBe(0);
      expect(r.breakdown.stayDeductRate).toBe(0);
    });

    it('보유 10년 + 거주 10년: 80% (40+40)', () => {
      const r = calcSaleIncomeTax(2_000_000_000, 1_000_000_000, 10, 10, '1세대1주택', '주택');
      expect(r.breakdown.holdDeductRate).toBe(40);
      expect(r.breakdown.stayDeductRate).toBe(40);
    });
  });

  describe('장기보유특별공제 (다주택)', () => {
    it('보유 15년 이상: 30%, 거주공제 없음', () => {
      const r = calcSaleIncomeTax(1_000_000_000, 500_000_000, 15, 0, '다주택', '주택');
      expect(r.breakdown.holdDeductRate).toBe(30);
      expect(r.breakdown.stayDeductRate).toBe(0);
    });

    it('보유 3년 미만: 공제 없음', () => {
      const r = calcSaleIncomeTax(1_000_000_000, 500_000_000, 2, 0, '다주택', '주택');
      expect(r.breakdown.holdDeductRate).toBe(0);
    });
  });

  describe('단기보유 중과 (경합1)', () => {
    it('주택 1년 미만: 70%', () => {
      const r = calcSaleIncomeTax(1_000_000_000, 500_000_000, 0.5, 0, '다주택', '주택');
      expect(r.breakdown.r1).toBe(0.70);
    });

    it('주택 1~2년: 60%', () => {
      const r = calcSaleIncomeTax(1_000_000_000, 500_000_000, 1.5, 0, '다주택', '주택');
      expect(r.breakdown.r1).toBe(0.60);
    });

    it('비주택(토지) 1년 미만: 50%', () => {
      const r = calcSaleIncomeTax(1_000_000_000, 500_000_000, 0.5, 0, '기타', '토지');
      expect(r.breakdown.r1).toBe(0.50);
    });
  });

  describe('조정지역 다주택 중과 (경합2 — 2026.5.10 부활)', () => {
    it('2주택: 기본세율 +20%p', () => {
      const r = calcSaleIncomeTax(
        1_000_000_000, 500_000_000, 5, 0, '다주택', '주택',
        2, 1, 0, '2026-06-01', 0
      );
      expect(r.breakdown.r2).toBeCloseTo(r.breakdown.baseR + 0.2, 5);
    });

    it('3주택 이상: 기본세율 +30%p', () => {
      const r = calcSaleIncomeTax(
        1_000_000_000, 500_000_000, 5, 0, '다주택', '주택',
        3, 1, 0, '2026-06-01', 0
      );
      expect(r.breakdown.r2).toBeCloseTo(r.breakdown.baseR + 0.3, 5);
    });

    it('중과 적용 시 appliedIncome=heavyIncome(장특공 배제), 세액 근거가 명확하다', () => {
      const r = calcSaleIncomeTax(
        1_000_000_000, 500_000_000, 10, 0, '다주택', '주택',
        2, 1, 0, '2026-06-01', 0
      );
      // 보유 10년이라 incomeFinal에는 장특공 20%가 반영되지만, 중과 대상이라 배제됨
      expect(r.breakdown.heavyApplied).toBe(true);
      expect(r.breakdown.appliedIncome).toBe(r.breakdown.heavyIncome);
      expect(r.breakdown.appliedIncome).toBeGreaterThan(r.breakdown.incomeFinal);
      // 실제 세액이 appliedIncome × 중과세율 − 누진공제와 일치
      const b = r.breakdown;
      const expected = Math.floor(b.appliedIncome * b.appliedR - b.finalDc);
      expect(r.transferTax).toBe(expected);
    });

    it('중과 미적용(비조정)이면 appliedIncome=incomeFinal', () => {
      const r = calcSaleIncomeTax(
        1_000_000_000, 500_000_000, 10, 0, '다주택', '주택',
        2, 0, 0, '2026-06-01', 0
      );
      expect(r.breakdown.heavyApplied).toBe(false);
      expect(r.breakdown.appliedIncome).toBe(r.breakdown.incomeFinal);
    });

    it('비조정지역(isAdj=0): 중과 없음', () => {
      const r = calcSaleIncomeTax(
        1_000_000_000, 500_000_000, 5, 0, '다주택', '주택',
        3, 0, 0, '2026-06-01', 0
      );
      expect(r.breakdown.r2).toBe(0);
    });

    it('토지거래허가 신청분 + 기존 조정지역 마감일 이전: 중과 배제', () => {
      const r = calcSaleIncomeTax(
        1_000_000_000, 500_000_000, 5, 0, '다주택', '주택',
        3, 1, 1, '2026-09-01', 0  // OLD_ADJ 마감일(2026-09-09) 이전
      );
      expect(r.breakdown.r2).toBe(0);
    });

    it('토지거래허가 신청분 + 신규 조정지역 마감일 이후: 중과 적용', () => {
      const r = calcSaleIncomeTax(
        1_000_000_000, 500_000_000, 5, 0, '다주택', '주택',
        3, 1, 1, '2026-12-01', 1  // NEW_ADJ 마감일(2026-11-09) 이후
      );
      expect(r.breakdown.r2).toBeGreaterThan(0);
    });
  });

  it('비사업토지: 기본세율 +10%p 중과', () => {
    const r = calcSaleIncomeTax(1_000_000_000, 500_000_000, 5, 0, '기타', '비사업토지');
    expect(r.breakdown.r2).toBeCloseTo(r.breakdown.baseR + 0.1, 5);
  });

  it('지방소득세 = 양도소득세 × 10%', () => {
    const r = calcSaleIncomeTax(1_000_000_000, 500_000_000, 5, 0, '다주택', '주택');
    expect(r.localTax).toBe(Math.floor(r.transferTax * 0.1));
    expect(r.total).toBe(r.transferTax + r.localTax);
  });
});
