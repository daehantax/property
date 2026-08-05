import { describe, it, expect } from 'vitest';
import { calcSaleIncomeTax, compareSaleIncomeTaxReform2026 } from '../../src/core/transfer-tax.js';

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

describe('2026 세제개편안 (reformYear 지정)', () => {
  describe('다주택 중과 한시 완화', () => {
    const heavy = (year) => calcSaleIncomeTax(
      1_000_000_000, 500_000_000, 5, 0, '다주택', '주택',
      2, 1, 0, `${year}-06-01`, 0, year
    );
    const heavy3 = (year) => calcSaleIncomeTax(
      1_000_000_000, 500_000_000, 5, 0, '다주택', '주택',
      3, 1, 0, `${year}-06-01`, 0, year
    );

    it('2027년: 2주택 +5%p, 3주택 +10%p', () => {
      const b2 = heavy(2027).breakdown;
      const b3 = heavy3(2027).breakdown;
      expect(b2.r2 - baseRateOf(b2.heavyIncome)).toBeCloseTo(0.05, 5);
      expect(b3.r2 - baseRateOf(b3.heavyIncome)).toBeCloseTo(0.10, 5);
    });

    it('2028년: 2주택 +10%p, 3주택 +15%p', () => {
      const b2 = heavy(2028).breakdown;
      const b3 = heavy3(2028).breakdown;
      expect(b2.r2 - baseRateOf(b2.heavyIncome)).toBeCloseTo(0.10, 5);
      expect(b3.r2 - baseRateOf(b3.heavyIncome)).toBeCloseTo(0.15, 5);
    });

    it('2029년: +20%p/+30%p 복귀 (현행과 동일 세액)', () => {
      const reform = heavy(2029);
      const current = calcSaleIncomeTax(
        1_000_000_000, 500_000_000, 5, 0, '다주택', '주택',
        2, 1, 0, '2029-06-01', 0
      );
      expect(reform.transferTax).toBe(current.transferTax);
    });

    it('완화 적용 시 현행보다 세액이 줄어든다', () => {
      const current = calcSaleIncomeTax(
        1_000_000_000, 500_000_000, 5, 0, '다주택', '주택',
        2, 1, 0, '2027-06-01', 0
      );
      expect(heavy(2027).transferTax).toBeLessThan(current.transferTax);
    });
  });

  describe('장기거주소득공제 전환 (2028.1.1 이후 양도분)', () => {
    it('2027년 양도분: 현행 장특공 유지 (보유10+거주10 = 80%)', () => {
      const r = calcSaleIncomeTax(2_000_000_000, 1_000_000_000, 10, 10, '1세대1주택', '주택',
        0, 0, 0, '', 0, 2027);
      expect(r.breakdown.holdDeductRate).toBe(40);
      expect(r.breakdown.stayDeductRate).toBe(40);
    });

    it('2028년: 보유 연2%(max20) + 거주 연6%(max60)', () => {
      const r = calcSaleIncomeTax(2_000_000_000, 1_000_000_000, 10, 10, '1세대1주택', '주택',
        0, 0, 0, '', 0, 2028);
      expect(r.breakdown.holdDeductRate).toBe(20);
      expect(r.breakdown.stayDeductRate).toBe(60);
    });

    it('2029년: 보유공제 폐지, 거주 연8% max80%', () => {
      const r = calcSaleIncomeTax(2_000_000_000, 1_000_000_000, 10, 10, '1세대1주택', '주택',
        0, 0, 0, '', 0, 2029);
      expect(r.breakdown.holdDeductRate).toBe(0);
      expect(r.breakdown.stayDeductRate).toBe(80);
    });

    it('2029년: 오래 보유해도 거주 2년 미만이면 공제 없음', () => {
      const r = calcSaleIncomeTax(2_000_000_000, 1_000_000_000, 15, 1, '1세대1주택', '주택',
        0, 0, 0, '', 0, 2029);
      expect(r.breakdown.totalDeductRate).toBe(0);
    });

    it('다주택(2028~): 보유공제 폐지, 2년 이상 거주 시 거주 연2% max30%', () => {
      const noStay = calcSaleIncomeTax(1_000_000_000, 500_000_000, 15, 0, '다주택', '주택',
        0, 0, 0, '', 0, 2028);
      expect(noStay.breakdown.totalDeductRate).toBe(0);
      const stay5 = calcSaleIncomeTax(1_000_000_000, 500_000_000, 15, 5, '다주택', '주택',
        0, 0, 0, '', 0, 2028);
      expect(stay5.breakdown.holdDeductRate).toBe(0);
      expect(stay5.breakdown.stayDeductRate).toBe(10);
      const stay20 = calcSaleIncomeTax(1_000_000_000, 500_000_000, 20, 20, '다주택', '주택',
        0, 0, 0, '', 0, 2028);
      expect(stay20.breakdown.stayDeductRate).toBe(30);
    });

    it('공제금액 한도: 2028년 20억 / 2029년 이후 10억', () => {
      // 양도차익 100억(비과세 아님), 거주 10년 → 공제율 80%면 80억이지만 한도로 제한
      const r28 = calcSaleIncomeTax(15_000_000_000, 5_000_000_000, 10, 10, '기타', '주택',
        0, 0, 0, '', 0, 2028);
      expect(r28.breakdown.deductCap).toBe(2_000_000_000);
      const r29 = calcSaleIncomeTax(15_000_000_000, 5_000_000_000, 10, 10, '1세대1주택', '주택',
        0, 0, 0, '', 0, 2029);
      expect(r29.breakdown.deductCap).toBe(1_000_000_000);
      expect(r29.breakdown.deductAmt).toBe(1_000_000_000);
    });
  });

  describe('1세대1주택 기본공제 확대 (2029 시행 가정)', () => {
    it('10년 이상 거주 + 30억 이하: 기본공제 2,500만', () => {
      const r = calcSaleIncomeTax(2_000_000_000, 1_000_000_000, 10, 10, '1세대1주택', '주택',
        0, 0, 0, '', 0, 2029);
      expect(r.breakdown.basicDeduct).toBe(25_000_000);
    });

    it('거주 10년 미만 또는 30억 초과: 250만 유지', () => {
      const shortStay = calcSaleIncomeTax(2_000_000_000, 1_000_000_000, 10, 5, '1세대1주택', '주택',
        0, 0, 0, '', 0, 2029);
      expect(shortStay.breakdown.basicDeduct).toBe(2_500_000);
      const overPrice = calcSaleIncomeTax(4_000_000_000, 2_000_000_000, 10, 10, '1세대1주택', '주택',
        0, 0, 0, '', 0, 2029);
      expect(overPrice.breakdown.basicDeduct).toBe(2_500_000);
    });

    it('2028년 이전 양도분·다주택은 250만 유지', () => {
      const r = calcSaleIncomeTax(2_000_000_000, 1_000_000_000, 10, 10, '1세대1주택', '주택',
        0, 0, 0, '', 0, 2028);
      expect(r.breakdown.basicDeduct).toBe(2_500_000);
    });
  });

  describe('변경 없는 항목', () => {
    it('1세대1주택 비과세 12억 기준 유지', () => {
      const r = calcSaleIncomeTax(1_000_000_000, 500_000_000, 5, 3, '1세대1주택', '주택',
        0, 0, 0, '', 0, 2029);
      expect(r.transferTax).toBe(0);
    });

    it('단기양도세율 70%/60% 유지', () => {
      const r = calcSaleIncomeTax(1_000_000_000, 500_000_000, 0.5, 0, '다주택', '주택',
        0, 0, 0, '', 0, 2027);
      expect(r.breakdown.r1).toBe(0.70);
    });
  });

  describe('하위 호환', () => {
    it('reformYear 미지정(현행)은 기존 계산과 동일', () => {
      const before = calcSaleIncomeTax(2_000_000_000, 1_000_000_000, 10, 10, '1세대1주택', '주택');
      expect(before.breakdown.holdDeductRate).toBe(40);
      expect(before.breakdown.basicDeduct).toBe(2_500_000);
      expect(before.breakdown.deductCap).toBe(0);
      expect(before.lawRef.some((s) => s.includes('개편안'))).toBe(false);
    });
  });

  describe('compareSaleIncomeTaxReform2026 — 반영 전/후 비교', () => {
    it('중과 완화(2027): diff가 음수(세액 감소)', () => {
      const cmp = compareSaleIncomeTaxReform2026(
        2027,
        1_000_000_000, 500_000_000, 5, 0, '다주택', '주택', 2, 1,
      );
      expect(cmp.reform.total).toBeLessThan(cmp.current.total);
      expect(cmp.diff.total).toBe(cmp.reform.total - cmp.current.total);
      expect(cmp.diff.total).toBeLessThan(0);
    });

    it('실거주 없는 다주택 비조정(2028): 장특공 소멸로 세액 증가', () => {
      const cmp = compareSaleIncomeTaxReform2026(
        2028,
        1_000_000_000, 500_000_000, 15, 0, '다주택', '주택', 1, 0,
      );
      expect(cmp.current.breakdown.totalDeductRate).toBe(30);
      expect(cmp.reform.breakdown.totalDeductRate).toBe(0);
      expect(cmp.diff.total).toBeGreaterThan(0);
    });
  });
});

/** 과세표준 구간별 기본세율 (테스트 검증용 — 엔진과 동일 구간) */
function baseRateOf(income) {
  if      (income <= 14_000_000)    return 0.06;
  else if (income <= 50_000_000)    return 0.15;
  else if (income <= 88_000_000)    return 0.24;
  else if (income <= 150_000_000)   return 0.35;
  else if (income <= 300_000_000)   return 0.38;
  else if (income <= 500_000_000)   return 0.40;
  else if (income <= 1_000_000_000) return 0.42;
  else                              return 0.45;
}
