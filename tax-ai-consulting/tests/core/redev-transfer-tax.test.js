import { describe, it, expect } from 'vitest';
import {
  calcRedevTransferTax, fullYears, filingDueDate, ltdTable1, ltdTable2, sumExpenses,
} from '../../src/core/redev-transfer-tax.js';

const E = 100_000_000;
const seg = (r, key) => r.ltdRows.find((x) => x.key === key);
const chk = (r, key) => r.checklist.find((x) => x.key === key);

// 공통: 2010 취득 3억 → 2018 관리처분(평가액 6억) → 2021 준공
const base = {
  memberType: 'original', acquireDate: '2010-01-01', acquirePrice: 3 * E,
  approvalDate: '2018-01-01', appraisal: 6 * E, completionDate: '2021-06-01',
};

describe('유틸', () => {
  it('만 보유연수', () => {
    expect(fullYears('2010-01-01', '2026-03-01')).toBe(16);
    expect(fullYears('2018-01-01', '2020-12-31')).toBe(2);
    expect(fullYears('2018-01-01', '2021-01-01')).toBe(3);
    expect(fullYears('2020-02-29', '2021-02-28')).toBe(1);
  });
  it('예정신고기한 = 양도월 말일부터 2개월', () => {
    expect(filingDueDate('2026-03-01')).toBe('2026-05-31');
    expect(filingDueDate('2025-12-15')).toBe('2026-02-28');
  });
  it('장특공 표1·표2', () => {
    expect(ltdTable1(2)).toBe(0);
    expect(ltdTable1(8)).toBe(0.16);
    expect(ltdTable1(20)).toBe(0.30);
    expect(ltdTable2(3, 2).total).toBeCloseTo(0.20);
    expect(ltdTable2(10, 10).total).toBeCloseTo(0.80);
    expect(ltdTable2(8, 1).total).toBeCloseTo(0.32);
    expect(ltdTable2(2, 2).total).toBe(0);
  });
  it('필요경비 단계별 합산', () => {
    const e = sumExpenses({ acqTax: 100, legalFee: 50, capexPost: 30, saleBrokerFee: 20 }, [{ name: '샷시', amount: 10, phase: 'pre' }]);
    expect(e.pre).toBe(160); expect(e.post).toBe(30); expect(e.sale).toBe(20); expect(e.total).toBe(210);
  });
});

describe('완공 신축주택 양도 — 원조합원 (소득령 §166②)', () => {
  it('청산금 납부 · 일반과세: 기존건물분/청산금납부분 안분과 장특공 기산일', () => {
    const r = calcRedevTransferTax({
      ...base, mode: 'newhouse', settle: 'paid', settleAmount: 2 * E,
      saleDate: '2026-03-01', salePrice: 15 * E, houseStatus: 'two',
    });
    expect(r.ok).toBe(true);
    expect(seg(r, 'old').gain).toBeCloseTo(8.25 * E);   // 7억×6/8 + 3억
    expect(seg(r, 'paid').gain).toBeCloseTo(1.75 * E);  // 7억×2/8
    expect(seg(r, 'old').holdYears).toBe(16);           // 기존주택 취득일부터
    expect(seg(r, 'paid').holdYears).toBe(8);           // 관리처분인가일부터
    expect(seg(r, 'old').amount).toBe(247_500_000);     // 30%
    expect(seg(r, 'paid').amount).toBe(28_000_000);     // 16%
    expect(r.taxBase).toBe(722_000_000);
    expect(r.transferTax).toBe(267_300_000);
    expect(r.localTax).toBe(26_730_000);
    expect(r.filingDue).toBe('2026-05-31');
  });

  it('청산금 납부 · 1세대1주택 고가(15억): 12억 초과분 + 표2', () => {
    const r = calcRedevTransferTax({
      ...base, mode: 'newhouse', settle: 'paid', settleAmount: 2 * E,
      saleDate: '2026-03-01', salePrice: 15 * E, houseStatus: 'single',
      livePrevYears: 5, liveNewYears: 3,
    });
    expect(r.verdict).toBe('partial');
    expect(r.highPrice.taxableRatio).toBeCloseTo(0.2);
    expect(seg(r, 'old').rate).toBeCloseTo(0.72);    // 보유 40% + 거주(5+3) 32%
    expect(seg(r, 'paid').rate).toBeCloseTo(0.44);   // 보유 8년 32% + 거주 3년 12%
    expect(r.ltdTotal).toBe(134_200_000);
    expect(r.transferTax).toBe(9_432_000);
  });

  it('1세대1주택 12억 이하 → 비과세(보유기간 통산)', () => {
    const r = calcRedevTransferTax({
      ...base, mode: 'newhouse', settle: 'paid', settleAmount: 2 * E,
      saleDate: '2021-12-31', salePrice: 11 * E, houseStatus: 'single',
    });
    expect(chk(r, 'hold').ok).toBe(true);   // 준공 후 6개월이지만 2010년부터 통산
    expect(r.verdict).toBe('exempt');
    expect(r.total).toBe(0);
  });

  it('조정지역 취득(2017.8.3 이후) 거주 2년 미달 → 과세', () => {
    const r = calcRedevTransferTax({
      ...base, acquireDate: '2017-09-01', mode: 'newhouse', saleDate: '2026-03-01', salePrice: 11 * E,
      houseStatus: 'single', adjAtAcquire: true, livePrevYears: 0, liveNewYears: 1,
    });
    expect(chk(r, 'live').ok).toBe(false);
    expect(r.verdict).toBe('taxable');
  });

  it('청산금 수령: 인가 전 차익 안분, 전체 장특공은 기존 취득일부터', () => {
    const r = calcRedevTransferTax({
      ...base, mode: 'newhouse', settle: 'received', settleAmount: 1 * E,
      saleDate: '2026-03-01', salePrice: 12 * E, houseStatus: 'two',
    });
    expect(seg(r, 'pre').gain).toBeCloseTo(2.5 * E);   // 3억 × 5/6
    expect(seg(r, 'post').gain).toBeCloseTo(7 * E);    // 12억 − (6억−1억)
    expect(seg(r, 'post').holdYears).toBe(16);
    expect(r.ltdTotal).toBe(285_000_000);
  });

  it('다주택 중과(조정지역 2주택, 2026.5.10 이후): +20%p·장특공 배제', () => {
    const r = calcRedevTransferTax({
      ...base, mode: 'newhouse', settle: 'paid', settleAmount: 2 * E,
      saleDate: '2026-06-01', salePrice: 15 * E, houseStatus: 'two', saleInAdj: true,
    });
    expect(r.heavy.applied).toBe(true);
    expect(r.ltdTotal).toBe(0);
    expect(r.taxBase).toBe(997_500_000);
    expect(r.transferTax).toBe(582_510_000);   // 62% − 3,594만
  });

  it('2026.5.9 이전 양도·중과 제외 주택은 중과 없음', () => {
    const a = calcRedevTransferTax({ ...base, mode: 'newhouse', saleDate: '2026-05-09', salePrice: 15 * E, houseStatus: 'three', saleInAdj: true });
    const b = calcRedevTransferTax({ ...base, mode: 'newhouse', saleDate: '2026-06-01', salePrice: 15 * E, houseStatus: 'three', saleInAdj: true, heavyExcluded: true });
    expect(a.heavy.applied).toBe(false);
    expect(b.heavy.applied).toBe(false);
  });

  it('필요경비: 인가 전 경비는 인가 전 차익에서, 양도비는 인가 후 차익에서 차감', () => {
    const r = calcRedevTransferTax({
      ...base, mode: 'newhouse', saleDate: '2026-03-01', salePrice: 15 * E, houseStatus: 'two',
      expenses: { acqTax: 6_000_000, legalFee: 1_000_000, acqBrokerFee: 2_000_000, capexPost: 10_000_000, saleBrokerFee: 7_000_000 },
    });
    expect(r.expenses.pre).toBe(9_000_000);
    expect(r.totalGain).toBeCloseTo(12 * E - 26_000_000);
  });
});

describe('승계조합원', () => {
  it('신축주택: 준공일부터 보유기간 → 2년 미만 60%', () => {
    const r = calcRedevTransferTax({
      mode: 'newhouse', memberType: 'successor', acquireDate: '2019-01-01', acquirePrice: 8 * E,
      settle: 'paid', settleAmount: 1 * E, completionDate: '2021-06-01',
      saleDate: '2022-12-01', salePrice: 12 * E, houseStatus: 'two',
    });
    expect(r.holdYearsRate).toBe(1);
    expect(r.totalGain).toBe(3 * E);
    expect(r.rateInfo.type).toBe('short');
    expect(r.transferTax).toBe(Math.floor((3 * E - 2_500_000) * 0.6));
  });
  it('입주권: 비과세·장특공 없음, 1년 이상 2년 미만 60%', () => {
    const r = calcRedevTransferTax({
      mode: 'inway', memberType: 'successor', acquireDate: '2023-01-01', acquirePrice: 8 * E,
      saleDate: '2024-06-01', salePrice: 9 * E, houseStatus: 'single',
    });
    expect(r.verdict).toBe('taxable');
    expect(r.ltdTotal).toBe(0);
    expect(r.transferTax).toBe(58_500_000);
  });
});

describe('조합원입주권 양도 — 원조합원 (소득령 §166①)', () => {
  it('청산금 납부: 인가 전 차익에만 장특공(취득일~인가일), 중과 없음', () => {
    const r = calcRedevTransferTax({
      ...base, completionDate: '', mode: 'inway', settle: 'paid', settleAmount: 1 * E,
      saleDate: '2026-06-01', salePrice: 10 * E, houseStatus: 'two', saleInAdj: true,
    });
    expect(seg(r, 'pre').gain).toBe(3 * E);
    expect(seg(r, 'post').gain).toBe(3 * E);
    expect(seg(r, 'pre').holdYears).toBe(8);
    expect(seg(r, 'pre').amount).toBe(48_000_000);
    expect(seg(r, 'post').amount).toBe(0);
    expect(r.heavy.applied).toBe(false);
    expect(r.transferTax).toBe(194_850_000);
  });
  it('§89①4 가목 충족 + 12억 이하 → 비과세', () => {
    const r = calcRedevTransferTax({ ...base, completionDate: '', mode: 'inway', saleDate: '2020-06-01', salePrice: 8.5 * E, houseStatus: 'single' });
    expect(r.verdict).toBe('exempt');
    expect(r.total).toBe(0);
  });
  it('§89①4 나목: 다른 주택 취득 후 3년 초과 → 과세', () => {
    const r = calcRedevTransferTax({
      ...base, completionDate: '', mode: 'inway', saleDate: '2024-06-01', salePrice: 10 * E,
      houseStatus: 'temp', otherHouseAcquireDate: '2020-01-01',
    });
    expect(r.verdict).toBe('taxable');
  });
  it('고가 입주권(1세대1주택): 인가 전 차익 표2', () => {
    const r = calcRedevTransferTax({
      ...base, completionDate: '', mode: 'inway', saleDate: '2024-06-01', salePrice: 15 * E,
      houseStatus: 'single', livePrevYears: 8,
    });
    expect(r.verdict).toBe('partial');
    expect(seg(r, 'pre').table).toBe('표2');
    expect(seg(r, 'pre').rate).toBeCloseTo(0.64);   // 보유 8년 32% + 거주 8년 32%
  });
  it('준공일 이후 양도는 오류', () => {
    const r = calcRedevTransferTax({ ...base, mode: 'inway', saleDate: '2024-06-01', salePrice: 10 * E });
    expect(r.ok).toBe(false);
  });
});

describe('청산금 수령분 양도', () => {
  const cash = { ...base, completionDate: '', mode: 'cash', acquirePrice: 4 * E, appraisal: 10 * E, settleAmount: 2 * E, saleDate: '2025-05-25' };
  it('양도차익 = 인가 전 차익 × 청산금/평가액', () => {
    const r = calcRedevTransferTax({ ...cash, houseStatus: 'two' });
    expect(r.totalGain).toBeCloseTo(1.2 * E);
    expect(r.ltdTotal).toBe(36_000_000);        // 15년 30%
    expect(r.transferTax).toBe(13_800_000);
  });
  it('1세대1주택: 평가액 12억 이하면 비과세, 초과면 평가액 기준 안분', () => {
    const a = calcRedevTransferTax({ ...cash, houseStatus: 'single' });
    expect(a.verdict).toBe('exempt');
    const b = calcRedevTransferTax({ ...cash, appraisal: 15 * E, houseStatus: 'single', livePrevYears: 10 });
    expect(b.verdict).toBe('partial');
    expect(b.highPrice.taxableRatio).toBeCloseTo(0.2);
    expect(b.ltdRows[0].rate).toBeCloseTo(0.8);
  });
  it('청산금이 평가액 초과면 오류', () => {
    expect(calcRedevTransferTax({ ...cash, settleAmount: 11 * E }).ok).toBe(false);
  });
});

describe('대체주택 양도 (소득령 §156의2⑤)', () => {
  const rep = {
    mode: 'replace', acquireDate: '2020-03-01', acquirePrice: 5 * E, saleDate: '2023-06-01', salePrice: 8 * E, houseStatus: 'two',
    replace: { oneHouseAtApproval: true, replacementAfterApproval: true, replacementLiveYears: 2, movedWithin3y: true, newHouseLiveYears: 1, soldWithin3y: true },
  };
  it('요건 충족 → 비과세', () => {
    const r = calcRedevTransferTax(rep);
    expect(r.verdict).toBe('exempt');
    expect(r.total).toBe(0);
  });
  it('요건 미충족 → 일반과세', () => {
    const r = calcRedevTransferTax({ ...rep, replace: { ...rep.replace, replacementLiveYears: 0.5 } });
    expect(r.verdict).toBe('taxable');
    expect(r.ltdTotal).toBe(Math.floor(3 * E * 0.06));
    expect(r.transferTax).toBeGreaterThan(0);
  });
});
