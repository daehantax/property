import { describe, it, expect } from 'vitest';
import { calcTakingTax, calcGiveTakingEtcTax } from '../../src/core/acquisition-tax.js';

describe('calcTakingTax — 취득세', () => {
  describe('일반 매매 (normal)', () => {
    it('6억 이하: 1%', () => {
      const r = calcTakingTax('normal', 500_000_000, 0, 0, 85, 0);
      expect(r.breakdown.takeRate).toBe(0.01);
      expect(r.takeTax).toBe(5_000_000);
    });

    it('9억 초과: 3%', () => {
      const r = calcTakingTax('normal', 1_000_000_000, 0, 0, 85, 0);
      expect(r.breakdown.takeRate).toBe(0.03);
      expect(r.takeTax).toBe(30_000_000);
    });

    it('6~9억 누진 구간', () => {
      const r = calcTakingTax('normal', 750_000_000, 0, 0, 85, 0);
      expect(r.breakdown.takeRate).toBeGreaterThan(0.01);
      expect(r.breakdown.takeRate).toBeLessThan(0.03);
    });

    it('국민주택규모(85) 이하: 농특세 면제', () => {
      const r = calcTakingTax('normal', 500_000_000, 0, 0, 85, 0);
      expect(r.agTax).toBe(0);
    });

    it('국민주택규모 초과(86): 농특세 부과', () => {
      const r = calcTakingTax('normal', 500_000_000, 0, 0, 86, 0);
      expect(r.agTax).toBeGreaterThan(0);
    });
  });

  describe('신규 분양', () => {
    it('newHouse=1 → 1%', () => {
      const r = calcTakingTax('normal', 500_000_000, 1, 0, 85, 0);
      expect(r.breakdown.takeRate).toBe(0.01);
    });

    it('newHouse=8 (다주택 중과 8%) — 농특세율 0.6%', () => {
      const r = calcTakingTax('normal', 500_000_000, 8, 0, 86, 0);
      expect(r.breakdown.takeRate).toBe(0.08);
      expect(r.breakdown.agRate).toBe(0.006);
    });

    it('newHouse=12 (법인·다주택 12%) — 농특세율 1%', () => {
      const r = calcTakingTax('normal', 500_000_000, 12, 0, 86, 0);
      expect(r.breakdown.takeRate).toBe(0.12);
      expect(r.breakdown.agRate).toBe(0.01);
    });
  });

  describe('상속 (inherit)', () => {
    it('1주택: 0.8%, 농특세 면제', () => {
      const r = calcTakingTax('inherit', 500_000_000, 0, 0, 86, 0);
      expect(r.breakdown.takeRate).toBe(0.008);
      expect(r.agTax).toBe(0);
    });

    it('다주택 상속: 2.8%', () => {
      const r = calcTakingTax('inherit', 500_000_000, 0, 1, 85, 0);
      expect(r.breakdown.takeRate).toBe(0.028);
    });
  });

  describe('증여 (give)', () => {
    it('비조정지역: 3.5%', () => {
      const r = calcTakingTax('give', 500_000_000, 0, 0, 85, 0);
      expect(r.breakdown.takeRate).toBe(0.035);
    });

    it('조정지역 3억 이상: 12% 중과', () => {
      const r = calcTakingTax('give', 500_000_000, 0, 0, 85, 1);
      expect(r.breakdown.takeRate).toBe(0.12);
    });

    it('조정지역 3억 미만: 일반세율 3.5%', () => {
      const r = calcTakingTax('give', 200_000_000, 0, 0, 85, 1);
      expect(r.breakdown.takeRate).toBe(0.035);
    });
  });

  it('1세대1주택 배우자/직계 증여 (give1s1h): 중과 없음 3.5%', () => {
    const r = calcTakingTax('give1s1h', 500_000_000, 0, 0, 85, 1);
    expect(r.breakdown.takeRate).toBe(0.035);
  });

  it('분양권·입주권(pre): 2.8%', () => {
    const r = calcTakingTax('pre', 500_000_000, 0, 0, 85, 0);
    expect(r.breakdown.takeRate).toBe(0.028);
  });

  it('total = takeTax + agTax + eduTax', () => {
    const r = calcTakingTax('normal', 500_000_000, 0, 0, 86, 0);
    expect(r.total).toBe(r.takeTax + r.agTax + r.eduTax);
  });
});

describe('calcGiveTakingEtcTax', () => {
  it('give 로직과 동일한 결과 반환', () => {
    const r = calcGiveTakingEtcTax(500_000_000, 85, 1);
    expect(r.breakdown.takeRate).toBe(0.12);
  });
});

describe('calcBurdenedGiveTakingTax (부담부증여 유상·무상 구분)', () => {
  it('유상분(채무)은 매매세율, 무상분은 증여세율로 분리 과세한다', async () => {
    const { calcBurdenedGiveTakingTax, calcTakingTax } = await import('../../src/core/acquisition-tax.js');
    // 시가 12억, 채무 4억, 비조정: 유상 4억×1% + 무상 8억×3.5% (+교육세)
    const r = calcBurdenedGiveTakingTax(1_200_000_000, 400_000_000, 85, 0);
    const onerous = calcTakingTax('normal', 400_000_000, 0, 0, 85, 0);
    const gratuitous = calcTakingTax('give', 800_000_000, 0, 0, 85, 0);
    expect(r.total).toBe(onerous.total + gratuitous.total);
    expect(r.total).toBeLessThan(calcTakingTax('give', 1_200_000_000, 0, 0, 85, 0).total);
    expect(r.lawRef).toContain('지방세법 §7⑪·⑫(부담부증여 유상·무상 구분)');
  });

  it('채무가 0이면 전액 증여 취득세와 같다', async () => {
    const { calcBurdenedGiveTakingTax, calcTakingTax } = await import('../../src/core/acquisition-tax.js');
    const r = calcBurdenedGiveTakingTax(1_000_000_000, 0, 85, 0);
    expect(r.total).toBe(calcTakingTax('give', 1_000_000_000, 0, 0, 85, 0).total);
  });

  it('조정지역: 무상분 과세표준이 3억 미만이어도 취득 주택가액이 3억 이상이면 무상분 12% 중과', async () => {
    const { calcBurdenedGiveTakingTax } = await import('../../src/core/acquisition-tax.js');
    // 지분 시가 4.5억, 승계채무 1.75억 → 무상분 2.75억(<3억)이지만 취득 주택가액 4.5억(≥3억)
    const r = calcBurdenedGiveTakingTax(450_000_000, 175_000_000, 85, 1);
    expect(r.breakdown.gratuitous.takeRate).toBe(0.12); // 3.5% 아님
    expect(r.breakdown.onerous.takeRate).toBe(0.01);    // 유상분은 매매 1%
    // 무상분 2.75억 × 12.4%(취득세12%+교육세0.4%) + 유상분 1.75억 × 1.1%
    expect(Math.round(r.total)).toBe(36_025_000);
  });

  it('조정지역: 취득 주택가액이 3억 미만이면 무상분은 3.5% (중과 아님)', async () => {
    const { calcBurdenedGiveTakingTax } = await import('../../src/core/acquisition-tax.js');
    const r = calcBurdenedGiveTakingTax(250_000_000, 50_000_000, 85, 1); // 지분 2.5억 < 3억
    expect(r.breakdown.gratuitous.takeRate).toBe(0.035);
  });

  it('조정지역: 지분 시가는 3억 미만이어도 주택 전체가 3억 이상이면 12% 중과 (전체 기준)', async () => {
    const { calcBurdenedGiveTakingTax } = await import('../../src/core/acquisition-tax.js');
    // 지분 시가 2.5억(<3억), 채무 1억 → 무상분 1.5억. 그러나 주택 전체 15억 → 중과 판정 성립
    const r = calcBurdenedGiveTakingTax(250_000_000, 100_000_000, 85, 1, 'give', 1_500_000_000);
    expect(r.breakdown.gratuitous.takeRate).toBe(0.12);
    // 주택 전체를 안 넘기면(기본=지분 2.5억) 3.5% — 전체 기준 전달이 판정을 바꾼다
    const noBase = calcBurdenedGiveTakingTax(250_000_000, 100_000_000, 85, 1);
    expect(noBase.breakdown.gratuitous.takeRate).toBe(0.035);
  });
});

describe('calcGiveTakingEtcTax — 주택 전체 기준 중과 판정', () => {
  it('지분 증여액<3억이라도 주택 전체≥3억이면 12% (heavyBase 전달)', async () => {
    const { calcGiveTakingEtcTax } = await import('../../src/core/acquisition-tax.js');
    // 지분 1.26억(<3억), 주택 전체 12.6억
    expect(calcGiveTakingEtcTax(126_000_000, 85, 1, 1_260_000_000).breakdown.takeRate).toBe(0.12);
    expect(calcGiveTakingEtcTax(126_000_000, 85, 1).breakdown.takeRate).toBe(0.035); // 기본=지분액
  });
});
