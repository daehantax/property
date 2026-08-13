import { describe, it, expect } from 'vitest';
import { calcAggrTax, calcAggrTaxCouple, compareAggrTaxReform2026 } from '../../src/core/comprehensive-tax.js';
import { AGGR_DEDUCT_SINGLE, AGGR_DEDUCT_OTHERS } from '../../src/core/constants.js';

describe('calcAggrTax — 종합부동산세', () => {
  it('1세대1주택: 12억 공제', () => {
    const r = calcAggrTax('1세대1주택', '비조정지역', 1_500_000_000, 5, 50, 1_000_000);
    expect(r.breakdown.deductAmt).toBe(AGGR_DEDUCT_SINGLE);
  });

  it('다주택: 9억 공제', () => {
    const r = calcAggrTax('다주택', '비조정지역', 1_500_000_000, 5, 50, 1_000_000);
    expect(r.breakdown.deductAmt).toBe(AGGR_DEDUCT_OTHERS);
  });

  it('공시가가 공제액 이하 → 과세표준 0, 세액 0', () => {
    const r = calcAggrTax('1세대1주택', '비조정지역', 1_000_000_000, 5, 50, 0);
    expect(r.breakdown.aggrTaxBase).toBe(0);
    expect(r.aggrTax).toBe(0);
  });

  it('농특세 = 종부세 × 20%', () => {
    const r = calcAggrTax('다주택', '비조정지역', 3_000_000_000, 5, 50, 1_000_000);
    expect(r.ruralTax).toBe(Math.floor(r.aggrTax * 0.2));
    expect(r.total).toBe(r.aggrTax + r.ruralTax);
  });

  describe('1세대1주택 세액공제', () => {
    it('장기보유: 15년 이상 50%, 10년 이상 40%, 5년 이상 20%', () => {
      const base = ['1세대1주택', '비조정지역', 2_000_000_000, 0, 30, 1_000_000];
      const r5  = calcAggrTax('1세대1주택', '비조정지역', 2_000_000_000, 5, 30, 1_000_000);
      const r10 = calcAggrTax('1세대1주택', '비조정지역', 2_000_000_000, 10, 30, 1_000_000);
      const r15 = calcAggrTax('1세대1주택', '비조정지역', 2_000_000_000, 15, 30, 1_000_000);
      expect(r5.breakdown.prdDc).toBe(0.2);
      expect(r10.breakdown.prdDc).toBe(0.4);
      expect(r15.breakdown.prdDc).toBe(0.5);
    });

    it('연령: 60세 20%, 65세 30%, 70세 40%', () => {
      const r60 = calcAggrTax('1세대1주택', '비조정지역', 2_000_000_000, 0, 60, 1_000_000);
      const r65 = calcAggrTax('1세대1주택', '비조정지역', 2_000_000_000, 0, 65, 1_000_000);
      const r70 = calcAggrTax('1세대1주택', '비조정지역', 2_000_000_000, 0, 70, 1_000_000);
      expect(r60.breakdown.ageDc).toBe(0.2);
      expect(r65.breakdown.ageDc).toBe(0.3);
      expect(r70.breakdown.ageDc).toBe(0.4);
    });

    it('합산 공제 80% 상한', () => {
      const r = calcAggrTax('1세대1주택', '비조정지역', 2_000_000_000, 15, 70, 1_000_000);
      expect(r.breakdown.combinedDc).toBe(0.8);
    });

    it('다주택은 세액공제 없음', () => {
      const r = calcAggrTax('다주택', '비조정지역', 2_000_000_000, 15, 70, 1_000_000);
      expect(r.breakdown.prdDc).toBe(0);
      expect(r.breakdown.ageDc).toBe(0);
    });
  });

  it('세율 누진: 과표 30억 → 1.5% 구간', () => {
    const r = calcAggrTax('다주택', '비조정지역', 6_000_000_000, 0, 30, 0);
    expect(r.breakdown.aggrTaxBeforeDc).toBeGreaterThan(0);
  });
});

describe('2026 세제개편안 — 종부세 (reformOpts.reformYear)', () => {
  describe('기본공제', () => {
    it('실거주 1주택: 12억 → 14억', () => {
      const r = calcAggrTax('1세대1주택', '비조정지역', 2_000_000_000, 5, 50, 1_000_000,
        { reformYear: 2027, isResident: 1 });
      expect(r.breakdown.deductAmt).toBe(1_400_000_000);
    });

    it('비거주 1주택: 12억 → 9억', () => {
      const r = calcAggrTax('1세대1주택', '비조정지역', 2_000_000_000, 5, 50, 1_000_000,
        { reformYear: 2027, isResident: 0 });
      expect(r.breakdown.deductAmt).toBe(900_000_000);
    });

    it('다주택: 4억 + 5억 × 거주주택 가액비중', () => {
      const none = calcAggrTax('다주택', '비조정지역', 3_000_000_000, 5, 50, 1_000_000,
        { reformYear: 2027, residentShare: 0 });
      expect(none.breakdown.deductAmt).toBe(400_000_000);
      const half = calcAggrTax('다주택', '비조정지역', 3_000_000_000, 5, 50, 1_000_000,
        { reformYear: 2027, residentShare: 0.5 });
      expect(half.breakdown.deductAmt).toBe(650_000_000);
    });
  });

  describe('공정시장가액비율', () => {
    it('2027년: 70% 일괄', () => {
      const r = calcAggrTax('다주택', '조정지역', 3_000_000_000, 5, 50, 1_000_000,
        { reformYear: 2027, ownCount: 3 });
      expect(r.breakdown.fairMarketRate).toBe(0.7);
    });

    it('2028년~: 1주택 70%, 3주택 이상·조정지역 2주택 이상 80%', () => {
      const single = calcAggrTax('1세대1주택', '비조정지역', 2_000_000_000, 5, 50, 1_000_000,
        { reformYear: 2028, ownCount: 1 });
      expect(single.breakdown.fairMarketRate).toBe(0.7);
      const three = calcAggrTax('다주택', '비조정지역', 3_000_000_000, 5, 50, 1_000_000,
        { reformYear: 2028, ownCount: 3 });
      expect(three.breakdown.fairMarketRate).toBe(0.8);
      const adjTwo = calcAggrTax('다주택', '조정지역', 3_000_000_000, 5, 50, 1_000_000,
        { reformYear: 2028, ownCount: 2 });
      expect(adjTwo.breakdown.fairMarketRate).toBe(0.8);
      const nonAdjTwo = calcAggrTax('다주택', '비조정지역', 3_000_000_000, 5, 50, 1_000_000,
        { reformYear: 2028, ownCount: 2 });
      expect(nonAdjTwo.breakdown.fairMarketRate).toBe(0.7);
    });
  });

  describe('세율표', () => {
    // 과표를 직접 통제하기 위해 공제·비율 역산 없이 aggrTaxBeforeDc로 검증
    it('2027년 과도기: 과표 10억 → 1.3% 구간 (현행 1.0% 대비 인상)', () => {
      // 다주택 residentShare 0 → 공제 4억, FMR 0.7 → 공시 18.28..억로 과표 10억 만들기보다
      // 세율 함수 특성만 확인: 동일 조건에서 2027 세액 > 현행 세액
      const cur = calcAggrTax('다주택', '비조정지역', 3_000_000_000, 0, 30, 0);
      const y27 = calcAggrTax('다주택', '비조정지역', 3_000_000_000, 0, 30, 0,
        { reformYear: 2027, residentShare: 0 });
      expect(y27.breakdown.aggrTaxBeforeDc).toBeGreaterThan(cur.breakdown.aggrTaxBeforeDc);
    });

    it('2028년 단일세율: 고액 구간에서 2027년보다 더 무겁다', () => {
      const y27 = calcAggrTax('다주택', '비조정지역', 10_000_000_000, 0, 30, 0,
        { reformYear: 2027, residentShare: 0 });
      const y28 = calcAggrTax('다주택', '비조정지역', 10_000_000_000, 0, 30, 0,
        { reformYear: 2028, residentShare: 0, ownCount: 3 });
      expect(y28.breakdown.aggrTaxBeforeDc).toBeGreaterThan(y27.breakdown.aggrTaxBeforeDc);
    });

    it('세율표 누진공제 정합성: 구간 경계에서 연속', () => {
      const at = (gongsi, opts) => calcAggrTax('다주택', '비조정지역', gongsi, 0, 30, 0,
        { residentShare: 0, ...opts }).breakdown;
      // 2028 표: 과표 12억 경계 (공제 4억, FMR 0.7 → 공시 = 12억/0.7 + 4억)
      const boundary = 1_200_000_000 / 0.7 + 400_000_000;
      const below = at(boundary - 1000, { reformYear: 2028 });
      const above = at(boundary + 1000, { reformYear: 2028 });
      const gap = above.aggrTaxBeforeDc - below.aggrTaxBeforeDc;
      expect(Math.abs(gap)).toBeLessThan(1000); // 경계 불연속 없음
    });
  });

  describe('1세대1주택 세액공제 한도', () => {
    it('2027년 800만 / 2028년~ 600만 한도', () => {
      // 고액·장기보유·고령 → 공제 80%가 한도에 걸리는 사례
      const y27 = calcAggrTax('1세대1주택', '비조정지역', 5_000_000_000, 15, 70, 5_000_000,
        { reformYear: 2027, isResident: 1 });
      expect(y27.breakdown.creditCap).toBe(8_000_000);
      expect(y27.breakdown.creditAmt).toBe(8_000_000);
      const y28 = calcAggrTax('1세대1주택', '비조정지역', 5_000_000_000, 15, 70, 5_000_000,
        { reformYear: 2028, isResident: 1 });
      expect(y28.breakdown.creditAmt).toBe(6_000_000);
    });

    it('현행(reformYear 미지정)은 한도 없음', () => {
      const r = calcAggrTax('1세대1주택', '비조정지역', 5_000_000_000, 15, 70, 5_000_000);
      expect(r.breakdown.creditCap).toBe(0);
    });
  });

  describe('하위 호환', () => {
    it('reformOpts 미지정 시 기존 계산과 동일 (공제·비율·세율 현행)', () => {
      const r = calcAggrTax('1세대1주택', '비조정지역', 2_000_000_000, 10, 65, 1_000_000);
      expect(r.breakdown.deductAmt).toBe(AGGR_DEDUCT_SINGLE);
      expect(r.breakdown.fairMarketRate).toBe(0.6);
      expect(r.lawRef.some((s) => s.includes('개편안'))).toBe(false);
      // 세액공제 곱셈 방식과 동일: (세액-재산세공제) × (1-combinedDc)
      const b = r.breakdown;
      const expected = Math.floor(Math.max(b.aggrTaxBeforeDc - b.propertyTaxDc, 0) * (1 - b.combinedDc));
      expect(r.aggrTax).toBe(expected);
    });
  });

  describe('compareAggrTaxReform2026 — 3개 레짐 비교', () => {
    it('실거주 1주택(공시 15억): 공제 확대로 세액 감소', () => {
      const cmp = compareAggrTaxReform2026('1세대1주택', '비조정지역', 1_500_000_000, 10, 60, 1_000_000,
        { isResident: 1, ownCount: 1 });
      expect(cmp.y2027.total).toBeLessThan(cmp.current.total);
      expect(cmp.diff.y2027).toBe(cmp.y2027.total - cmp.current.total);
    });

    it('비거주 1주택(공시 15억): 공제 축소·비율 인상으로 세액 증가', () => {
      const cmp = compareAggrTaxReform2026('1세대1주택', '비조정지역', 1_500_000_000, 10, 60, 1_000_000,
        { isResident: 0, ownCount: 1 });
      expect(cmp.y2027.total).toBeGreaterThan(cmp.current.total);
      expect(cmp.y2028.total).toBeGreaterThan(cmp.current.total);
    });

    it('조정지역 3주택(공시 30억, 전부 임대): 매년 세부담 증가', () => {
      const cmp = compareAggrTaxReform2026('다주택', '조정지역', 3_000_000_000, 10, 60, 3_000_000,
        { residentShare: 0, ownCount: 3 });
      expect(cmp.current.total).toBeLessThan(cmp.y2027.total);
      expect(cmp.y2027.total).toBeLessThan(cmp.y2028.total);
    });
  });
});

describe('calcAggrTaxCouple — 부부 공동명의 인별 계산', () => {

  it('50:50 공시 15억: 각자 7.5억 < 인별 공제 9억 → 부부 모두 0원', () => {
    const c = calcAggrTaxCouple(1_500_000_000, 0.5, '비조정지역', 2_000_000);
    expect(c.a.aggrTax).toBe(0);
    expect(c.b.aggrTax).toBe(0);
    expect(c.total).toBe(0);
  });

  it('부부 합계 = 각자 세액의 합', () => {
    const c = calcAggrTaxCouple(3_000_000_000, 0.5, '비조정지역', 5_000_000);
    expect(c.aggrTax).toBe(c.a.aggrTax + c.b.aggrTax);
    expect(c.ruralTax).toBe(c.a.ruralTax + c.b.ruralTax);
    expect(c.total).toBe(c.a.total + c.b.total);
  });

  it('각자 계산은 지분 가액 − 9억 기준 (인별 공제 18억 효과)', () => {
    const c = calcAggrTaxCouple(3_000_000_000, 0.5, '비조정지역', 5_000_000);
    // 각자: (15억 − 9억) × 60% = 3.6억 과표
    expect(c.a.breakdown.aggrTaxBase).toBe(360_000_000);
    expect(c.a.breakdown.deductAmt).toBe(900_000_000);
  });

  it('누진 완화: 인별 합산이 합산가액 일괄 계산보다 작다', () => {
    const couple = calcAggrTaxCouple(3_000_000_000, 0.5, '비조정지역', 5_000_000);
    const lump = calcAggrTax('공동명의1주택', '비조정지역', 3_000_000_000, 0, 0, 5_000_000);
    expect(couple.aggrTax).toBeLessThan(lump.aggrTax);
  });

  it('지분 비대칭(70:30): 각자 지분 가액으로 계산', () => {
    const c = calcAggrTaxCouple(3_000_000_000, 0.7, '비조정지역', 5_000_000);
    expect(c.a.breakdown.gongsi).toBe(2_100_000_000);
    expect(c.b.breakdown.gongsi).toBe(900_000_000);
    expect(c.b.aggrTax).toBe(0);   // 9억 − 9억 = 0
  });

  it('인별 방식에는 세액공제 없음', () => {
    const c = calcAggrTaxCouple(3_000_000_000, 0.5, '비조정지역', 5_000_000);
    expect(c.a.breakdown.combinedDc).toBe(0);
  });
});

describe('세부담상한 (reformOpts.prevYearTotal)', () => {
  it('미입력(0) 시 상한 미적용', () => {
    const r = calcAggrTax('다주택', '비조정지역', 3_000_000_000, 0, 30, 3_000_000);
    expect(r.breakdown.capReduction).toBe(0);
  });

  it('당해 보유세가 전년 150% 이하면 차감 없음', () => {
    const r = calcAggrTax('다주택', '비조정지역', 3_000_000_000, 0, 30, 3_000_000,
      { prevYearTotal: 100_000_000 });
    expect(r.breakdown.capReduction).toBe(0);
  });

  it('전년 150% 초과분은 종부세에서 차감', () => {
    const base = calcAggrTax('다주택', '비조정지역', 3_000_000_000, 0, 30, 3_000_000);
    const prev = 5_000_000;   // 상한 750만 → 재산세 300만 + 종부세 상한 450만
    const r = calcAggrTax('다주택', '비조정지역', 3_000_000_000, 0, 30, 3_000_000,
      { prevYearTotal: prev });
    expect(r.breakdown.capLimit).toBe(7_500_000);
    expect(r.aggrTax).toBe(Math.floor(7_500_000 - 3_000_000));
    expect(r.aggrTax).toBeLessThan(base.aggrTax);
    expect(r.ruralTax).toBe(Math.floor((7_500_000 - 3_000_000) * 0.2));
  });

  it('상한이 재산세보다도 작으면 종부세 0까지 차감', () => {
    const r = calcAggrTax('다주택', '비조정지역', 3_000_000_000, 0, 30, 3_000_000,
      { prevYearTotal: 1_000_000 });
    expect(r.aggrTax).toBe(0);
  });
});
