import { describe, it, expect } from 'vitest';
import {
  calcClearanceTransferTax, computeStage, latePaymentPenalty, filingReduction,
  holdingYears, ltdRate2019, basicRate2019,
} from '../../src/core/clearance-transfer-tax.js';

const BASE = {
  acquireDate: '2003-05-01', acquirePrice: 300_000_000, expenses: 0, rightsValue: 1_500_000_000,
  amounts: { deposit: 100_000_000, mid1: 100_000_000, mid2: 100_000_000, third: 50_000_000, fourth: 50_000_000 },
  payDate: '2026-11-15',
};

describe('기초 함수', () => {
  it('보유기간: 취득일 + n년 ≤ 양도일', () => {
    expect(holdingYears('2009-05-26', '2019-05-26')).toBe(10);
    expect(holdingYears('2009-05-27', '2019-05-26')).toBe(9);
  });
  it('장특공 2019: 표1 연2% 최대30%, 표2 연8% 최대80%, 3년 미만 0', () => {
    expect(ltdRate2019('table1', 2)).toBe(0);
    expect(ltdRate2019('table1', 3)).toBeCloseTo(0.06);
    expect(ltdRate2019('table1', 20)).toBeCloseTo(0.30);
    expect(ltdRate2019('table2', 3)).toBeCloseTo(0.24);
    expect(ltdRate2019('table2', 12)).toBeCloseTo(0.80);
  });
  it('2019 기본세율: 5억 초과 42% 누진공제 3,540만', () => {
    expect(basicRate2019(12_000_000).tax).toBe(720_000);
    expect(basicRate2019(600_000_000).tax).toBe(600_000_000 * 0.42 - 35_400_000);
  });
  it('납부지연: 이율 개정일(2019.2.12, 2022.2.15)에서 구간 분할', () => {
    const r = latePaymentPenalty(10_000_000, '2019-02-10', '2022-02-16');
    expect(r.segments.map((s) => s.rate)).toEqual([0.0003, 0.00025, 0.00022]);
    expect(r.segments[0]).toMatchObject({ from: '2019-02-11', to: '2019-02-11', days: 1 });
    expect(r.segments[2]).toMatchObject({ from: '2022-02-15', to: '2022-02-16', days: 2 });
  });
  it('기한 전 납부면 납부지연 0', () => {
    expect(latePaymentPenalty(1_000_000, '2026-11-30', '2026-11-15').total).toBe(0);
  });
  it('감면율: 수정 6개월 이내 50%, 기한후 6개월 이내 20%, 기간 경과 0', () => {
    expect(filingReduction('amend', '2026-06-30', '2026-11-15').rate).toBe(0.5);
    expect(filingReduction('late', '2026-06-30', '2026-11-15').rate).toBe(0.2);
    expect(filingReduction('late', '2020-06-01', '2026-11-15').rate).toBe(0);
  });
});

describe('청산금 양도세 — 일반(표1), 전 차수 미신고', () => {
  const r = calcClearanceTransferTax(BASE);
  const [ini, third, fourth] = r.rows;

  it('최초분: 3억 수령 → 안분 20%, 장특공 30%, 세액 43,490,000', () => {
    expect(r.years).toBe(16);
    expect(ini.stage).toMatchObject({ acq: 60_000_000, gain: 240_000_000, ltd: 72_000_000, base: 165_500_000, tax: 43_490_000 });
    expect(ini.addTax).toBe(43_490_000);
  });
  it('최초분 가산세: 무신고 20%(감면 없음) + 납부지연 623일×0.025% + 1,735일×0.022%', () => {
    expect(ini.penalty.filing).toBe(8_698_000);
    expect(ini.penalty.late.segments.map((s) => s.days)).toEqual([623, 1735]);
    expect(ini.penalty.late.total).toBe(6_773_567 + 16_600_133);
  });
  it('3차: 누적 3.5억으로 다시 계산한 세액 − 최초분 세액, 기한후 20% 중 6개월 이내 20% 감면', () => {
    const st = computeStage({ cumulative: 350_000_000, rightsValue: 1_500_000_000, acquirePrice: 300_000_000,
      expenses: 0, years: 16, ltdTable: 'table1', singleHouseExempt: false, highPriceBase: 1_500_000_000 });
    expect(third.addTax).toBe(st.tax - 43_490_000);
    expect(third.kind).toBe('late');
    expect(third.penalty.reduction.rate).toBe(0.2);
    expect(third.penalty.late.days).toBe(138);   // 2026.7.1 ~ 11.15
  });
  it('4차: 신고기한(11.30) 전이면 가산세 없음', () => {
    expect(fourth.overdue).toBe(false);
    expect(fourth.penalty.total).toBe(0);
    expect(fourth.addTax).toBeGreaterThan(0);
  });
  it('제척기간: 무신고 7년 → 2027.06.01 만료', () => {
    expect(r.statute.expires).toBe('2027-06-01');
  });
});

describe('최초분을 기한 내 신고한 경우', () => {
  const r = calcClearanceTransferTax({ ...BASE, filed: { initial: true } });
  it('최초분은 납부할 세액·가산세 없음, 3차는 수정신고 과소 10%·50% 감면', () => {
    expect(r.rows[0].due_total).toBe(0);
    expect(r.rows[1].kind).toBe('amend');
    expect(r.rows[1].penalty.filingRate).toBe(0.1);
    expect(r.rows[1].penalty.reduction.rate).toBe(0.5);
    expect(r.statute.expires).toBe('2025-06-01');
  });
});

describe('예정신고기한(2019.7.31) 기준 옵션', () => {
  it('납부지연 기산일이 2019.8.1', () => {
    const r = calcClearanceTransferTax({ ...BASE, initialDueBasis: 'prelim' });
    expect(r.rows[0].due).toBe('2019-07-31');
    expect(r.rows[0].penalty.late.segments[0].from).toBe('2019-08-01');
  });
});

describe('1세대1주택 (2019년 고가주택 9억, 표2)', () => {
  it('권리가액 9억 이하 → 전액 비과세', () => {
    const r = calcClearanceTransferTax({ ...BASE, rightsValue: 900_000_000, singleHouse: true });
    expect(r.totals.payAll).toBe(0);
  });
  it('권리가액 15억 → 9억 초과분(40%)만 과세, 장특공 표2 80%', () => {
    const r = calcClearanceTransferTax({ ...BASE, singleHouse: true });
    const st = r.rows[0].stage;
    expect(r.ltdTable).toBe('table2');
    expect(st.taxableGain).toBe(96_000_000);   // 2.4억 × 6억/15억
    expect(st.ltd).toBe(76_800_000);
    expect(st.base).toBe(16_700_000);
  });
});

describe('최초분 신고자 — 기납부세액 공제', () => {
  it('기납부 3천만 < 결정 43,490,000 → 부족 13,490,000에 과소 10% + 납부지연', () => {
    const r = calcClearanceTransferTax({ ...BASE, filed: { initial: true }, prepaid: { initialTax: 30_000_000 } });
    const ini = r.rows[0];
    expect(r.prepaid).toMatchObject({ tax: 30_000_000, local: 3_000_000 });
    expect(ini.unpaid).toBe(13_490_000);
    expect(ini.unpaidLocal).toBe(1_349_000);
    expect(ini.kind).toBe('amend');
    expect(ini.penalty.filing).toBe(1_349_000);
    expect(ini.penalty.late.total).toBe(Math.floor(13_490_000 * 623 * 0.00025) + Math.floor(13_490_000 * 1735 * 0.00022));
    expect(r.warnings.some((w) => w.includes('제척기간'))).toBe(true);
  });
  it('제척기간 경과분 제외를 체크하면 최초분 부족세액·가산세 0', () => {
    const r = calcClearanceTransferTax({ ...BASE, filed: { initial: true }, prepaid: { initialTax: 30_000_000 }, excludeExpiredInitial: true });
    expect(r.rows[0].due_total).toBe(0);
    expect(r.rows[1].unpaid).toBe(10_640_000);
  });
  it('기납부가 더 많으면(5천만) 초과분 6,510,000을 3차에 충당, 가산세도 충당 후 금액 기준', () => {
    const r = calcClearanceTransferTax({ ...BASE, filed: { initial: true }, prepaid: { initialTax: 50_000_000, initialLocal: 5_000_000 } });
    expect(r.rows[0].unpaid).toBe(0);
    expect(r.rows[1].usedTax).toBe(6_510_000);
    expect(r.rows[1].unpaid).toBe(10_640_000 - 6_510_000);
    expect(r.rows[1].penalty.filingRaw).toBe(Math.floor(4_130_000 * 0.1));
    expect(r.prepaid.refundTax).toBe(0);
  });
  it('기납부가 전체 결정세액보다 많으면 환급 대상', () => {
    const r = calcClearanceTransferTax({ ...BASE, filed: { initial: true }, prepaid: { initialTax: 70_000_000 } });
    expect(r.totals.unpaidTax).toBe(0);
    expect(r.prepaid.refundTax).toBe(70_000_000 - 64_770_000);
  });
});

describe('차수 선택 신고', () => {
  const all = calcClearanceTransferTax(BASE);
  it('조합 7가지, 전체 조합 = 전체 합계', () => {
    expect(all.combos).toHaveLength(7);
    expect(all.combos.at(-1).payAll).toBe(all.totals.payAll);
  });
  it('3차만 선택 → 합계는 3차 행 금액, 나머지는 미선택분', () => {
    const r = calcClearanceTransferTax({ ...BASE, selected: { initial: false, third: true, fourth: false } });
    const third = r.rows[1];
    expect(r.totals.payAll).toBe(third.due_total + third.due_totalLocal);
    expect(r.totals.payAll + r.notSelected.payAll).toBe(all.totals.payAll);
    expect(r.combos.find((c) => c.keys.join() === 'third').payAll).toBe(r.totals.payAll);
  });
});
