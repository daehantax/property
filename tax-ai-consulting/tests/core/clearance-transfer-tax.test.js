import { describe, it, expect } from 'vitest';
import {
  calcClearanceTransferTax, computeStage, latePaymentPenalty, filingReduction,
  holdingYears, ltdRate2019, basicRate2019,
} from '../../src/core/clearance-transfer-tax.js';

const BASE = {
  acquireDate: '2003-05-01', acquirePrice: 300_000_000, expenses: 0, rightsValue: 1_500_000_000,
  amounts: { initial: 100_000_000, first: 100_000_000, second: 100_000_000, third: 50_000_000, fourth: 50_000_000 },
  payDate: '2026-11-15',
};
const ALL = ['initial', 'first', 'second', 'third', 'fourth'];
const only = (...keys) => Object.fromEntries(ALL.map((k) => [k, keys.includes(k)]));

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

describe('청산금 양도세 — 일반(표1), 전 차수 미신고·전체 신고', () => {
  const r = calcClearanceTransferTax(BASE);
  const [ini, first, second, third, fourth] = r.rows;

  it('양도일 = 이전고시일(2019.05.24) 다음날 2019.05.25, 보유 16년', () => {
    expect(r.transferDate).toBe('2019-05-25');
    expect(r.noticeDate).toBe('2019-05-24');
    expect(r.years).toBe(16);
  });
  it('최초+1차 누적 2억까지 세액 = 최초·1차 차수 세액 합', () => {
    expect(first.stage.tax).toBe(ini.addTax + first.addTax);
    expect(ini.due).toBe('2020-06-01');
    expect(first.due).toBe('2020-06-01');
  });
  it('최초~2차 누적 3억 세액 43,490,000 (기존 최초분과 동일)', () => {
    expect(second.stage).toMatchObject({ acq: 60_000_000, gain: 240_000_000, ltd: 72_000_000, base: 165_500_000, tax: 43_490_000 });
  });
  it('2차: 기한 2019.10.31 → 2019.11.01부터 무신고 20%(감면 10%) + 납부지연(837일×0.025% + 1,735일×0.022%)', () => {
    expect(second.due).toBe('2019-10-31');
    expect(second.kind).toBe('late');
    expect(second.penalty.filingRate).toBe(0.2);
    expect(second.penalty.reduction.rate).toBe(0.1);
    const raw = Math.floor(second.unpaid * 0.2);
    expect(second.penalty.filing).toBe(raw - Math.floor(raw * 0.1));
    expect(second.penalty.late.segments[0].from).toBe('2019-11-01');
    expect(second.penalty.late.segments.map((s) => s.days)).toEqual([837, 1735]);
  });
  it('최초·1차: 2020.06.01 다음날부터 무신고 20% + 납부지연 623일·1,735일', () => {
    expect(ini.penalty.filingRate).toBe(0.2);
    expect(ini.penalty.late.segments.map((s) => s.days)).toEqual([623, 1735]);
  });
  it('3차·4차: 2026.09.10 수령, 기한 2026.11.30 내 납부 → 가산세 없음', () => {
    for (const x of [third, fourth]) {
      expect(x.due).toBe('2026-11-30');
      expect(x.overdue).toBe(false);
      expect(x.penalty.total).toBe(0);
      expect(x.addTax).toBeGreaterThan(0);
    }
  });
  it('4차 기한 경과 후 납부하면 그때부터 가산세', () => {
    const late = calcClearanceTransferTax({ ...BASE, payDate: '2026-12-10' });
    expect(late.rows[4].overdue).toBe(true);
    expect(late.rows[4].penalty.late.days).toBe(10);
  });
  it('전체 결정세액 64,770,000 = 차수별 세액 합', () => {
    expect(r.totals.tax).toBe(64_770_000);
    expect(r.totals.unpaidTax).toBe(64_770_000);
  });
  it('제척기간: 무신고 7년 → 2027.06.01 만료', () => {
    expect(r.statute.expires).toBe('2027-06-01');
  });
});

describe('차수 선택 — 선택한 차수만 양도신고 대상·가산세', () => {
  it('3차·4차만 선택 → 1억만 양도가액, 가산세 0, 최초~2차는 제외', () => {
    const r = calcClearanceTransferTax({ ...BASE, selected: only('third', 'fourth') });
    expect(r.rows.slice(0, 3).every((x) => x.status === 'excluded' && x.unpaid === 0)).toBe(true);
    expect(r.totals.amount).toBe(100_000_000);
    const st = computeStage({ cumulative: 100_000_000, rightsValue: 1_500_000_000, acquirePrice: 300_000_000,
      expenses: 0, years: 16, ltdTable: 'table1', singleHouseExempt: false, highPriceBase: 1_500_000_000 });
    expect(r.totals.unpaidTax).toBe(st.tax);
    expect(r.totals.penalty).toBe(0);
    expect(r.allSelected.extra).toBeGreaterThan(0);
  });
  it('2차만 선택 → 2차 1억에만 무신고 20% + 납부지연', () => {
    const r = calcClearanceTransferTax({ ...BASE, selected: only('second') });
    const second = r.rows[2];
    expect(second.cumulative).toBe(100_000_000);
    expect(r.totals.unpaidTax).toBe(second.addTax);
    const raw = Math.floor(second.addTax * 0.2);
    expect(r.totals.filingPenalty).toBe(raw - Math.floor(raw * 0.1));
    expect(r.totals.payNational).toBe(second.due_total);
  });
  it('선택 없음 → 경고', () => {
    const r = calcClearanceTransferTax({ ...BASE, selected: only() });
    expect(r.totals.payAll).toBe(0);
    expect(r.warnings.some((w) => w.includes('선택'))).toBe(true);
  });
});

describe('예정신고기한(2019.7.31) 기준 옵션', () => {
  it('최초·1차 납부지연 기산일이 2019.8.1', () => {
    const r = calcClearanceTransferTax({ ...BASE, initialDueBasis: 'prelim' });
    expect(r.rows[0].due).toBe('2019-07-31');
    expect(r.rows[1].penalty.late.segments[0].from).toBe('2019-08-01');
    expect(r.rows[2].due).toBe('2019-10-31');
  });
});

describe('1세대1주택 (2019년 고가주택 9억, 표2)', () => {
  it('권리가액 9억 이하 → 전액 비과세', () => {
    const r = calcClearanceTransferTax({ ...BASE, rightsValue: 900_000_000, singleHouse: true });
    expect(r.totals.payAll).toBe(0);
  });
  it('권리가액 15억 → 3억 누적 시 9억 초과분(40%)만 과세, 장특공 표2 80%', () => {
    const r = calcClearanceTransferTax({ ...BASE, singleHouse: true });
    const st = r.rows[2].stage;
    expect(r.ltdTable).toBe('table2');
    expect(st.taxableGain).toBe(96_000_000);
    expect(st.ltd).toBe(76_800_000);
    expect(st.base).toBe(16_700_000);
  });
});

describe('이미 신고한 차수 — 기납부세액', () => {
  it('최초·1차 정확히 신고 → 과세표준에 누적 포함, 세액 0, 2차는 누적 차액으로 계산', () => {
    const all = calcClearanceTransferTax(BASE);
    const r = calcClearanceTransferTax({ ...BASE, filed: { initial: true, first: true }, selected: only('second', 'third', 'fourth') });
    expect(r.rows[0].status).toBe('filed');
    expect(r.rows[2].addTax).toBe(all.rows[2].addTax);
    expect(r.totals.unpaidTax).toBe(all.rows.slice(2).reduce((s, x) => s + x.addTax, 0));
    expect(r.statute.expires).toBe('2025-06-01');
  });
  it('기납부 2천만 입력 → 최초·1차 세액에 충당, 부족분은 과소 10%', () => {
    const r = calcClearanceTransferTax({ ...BASE, filed: { initial: true, first: true }, prepaid: { tax: 20_000_000 } });
    const [ini, first] = r.rows;
    expect(ini.unpaid).toBe(0);
    expect(first.usedTax).toBe(20_000_000 - ini.addTax);
    expect(first.unpaid).toBe(first.addTax - first.usedTax);
    expect(first.kind).toBe('amend');
    expect(first.penalty.filingRate).toBe(0.1);
    expect(r.prepaid.local).toBe(2_000_000);
  });
  it('제척기간 경과분 제외 → 신고 차수 부족세액 0', () => {
    const r = calcClearanceTransferTax({ ...BASE, filed: { initial: true, first: true }, prepaid: { tax: 20_000_000 }, excludeExpired: true });
    expect(r.rows[1].status).toBe('expired');
    expect(r.rows[1].due_total).toBe(0);
  });
  it('기납부가 전체 결정세액보다 많으면 환급 대상', () => {
    const r = calcClearanceTransferTax({ ...BASE, filed: { initial: true }, prepaid: { tax: 70_000_000 } });
    expect(r.totals.unpaidTax).toBe(0);
    expect(r.prepaid.refundTax).toBe(70_000_000 - 64_770_000);
  });
});

describe('최초 청산금 신고 후 덜 낸 차수 (1차·2차)', () => {
  const r = calcClearanceTransferTax({ ...BASE, filed: { initial: true }, selected: only('first', 'second') });
  const [ini, first, second] = r.rows;
  it('최초는 기신고, 1차·2차는 수정신고 과소 10% + 감면 10% + 납부지연', () => {
    expect(ini.status).toBe('filed');
    for (const x of [first, second]) {
      expect(x.kind).toBe('amend');
      expect(x.status).toBe('amend');
      expect(x.penalty.filingRate).toBe(0.1);
      const raw = Math.floor(x.unpaid * 0.1);
      expect(x.penalty.filing).toBe(raw - Math.floor(raw * 0.1));
      expect(x.penalty.late.total).toBeGreaterThan(0);
    }
    expect(first.penalty.late.segments[0].from).toBe('2020-06-02');
    expect(second.penalty.late.segments[0].from).toBe('2019-11-01');
  });
  it('1차 세액 = 최초 포함 누적 차액', () => {
    const all = calcClearanceTransferTax(BASE);
    expect(first.addTax).toBe(all.rows[1].addTax);
    expect(r.totals.unpaidTax).toBe(all.rows[1].addTax + all.rows[2].addTax);
  });
  it('제척기간 5년 경과 경고', () => {
    expect(r.warnings.some((w) => w.includes('제척기간'))).toBe(true);
  });
});

describe('신고불성실가산세 감면율 옵션', () => {
  it('감면 없음(0) → 원래 가산세 그대로', () => {
    const r = calcClearanceTransferTax({ ...BASE, reduction: 0 });
    expect(r.rows[2].penalty.filing).toBe(Math.floor(r.rows[2].unpaid * 0.2));
  });
  it("'auto' → §48② 경과기간별 (수년 경과 → 0%)", () => {
    const r = calcClearanceTransferTax({ ...BASE, reduction: 'auto' });
    expect(r.rows[2].penalty.reduction.rate).toBe(0);
  });
  it('납부지연가산세는 감면 없음', () => {
    const a = calcClearanceTransferTax(BASE), b = calcClearanceTransferTax({ ...BASE, reduction: 0 });
    expect(a.rows[2].penalty.late.total).toBe(b.rows[2].penalty.late.total);
  });
});
