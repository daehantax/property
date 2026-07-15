import { describe, it, expect } from 'vitest';
import { judgeInwayExempt, judgeReplacementHouse } from '../../src/core/redev-exempt.js';

const get = (r, key) => r.checklist.find((c) => c.key === key);

describe('judgeInwayExempt — 조합원입주권 양도 비과세 (§89①4)', () => {
  it('가목: 인가일 보유 2년(비조정)·다른 주택 없음 → 비과세', () => {
    const r = judgeInwayExempt({
      prevAcquireDate: '2018-01-01', prevAcquiredInAdjust: false, prevLiveYears: 0,
      approvalDate: '2022-01-01', inwaySaleDate: '2024-06-01',
      otherHouse: 'none', salePrice: 800_000_000,
    });
    expect(get(r, 'hold').ok).toBe(true);
    expect(get(r, 'live').ok).toBe(true);
    expect(get(r, 'sale').ok).toBe(true);
    expect(r.verdict).toBe('exempt');
  });

  it('인가일 현재 종전주택 보유 2년 미달 → 과세', () => {
    const r = judgeInwayExempt({
      prevAcquireDate: '2021-06-01', prevAcquiredInAdjust: false,
      approvalDate: '2022-01-01', inwaySaleDate: '2024-06-01',
      otherHouse: 'none', salePrice: 700_000_000,
    });
    expect(get(r, 'hold').ok).toBe(false);
    expect(r.verdict).toBe('taxable');
  });

  it('조정지역 취득(2018)·거주 0 → 거주요건 미충족 과세', () => {
    const r = judgeInwayExempt({
      prevAcquireDate: '2018-06-01', prevAcquiredInAdjust: true, prevLiveYears: 0,
      approvalDate: '2022-01-01', inwaySaleDate: '2024-06-01',
      otherHouse: 'none', salePrice: 700_000_000,
    });
    expect(get(r, 'live').ok).toBe(false);
    expect(r.verdict).toBe('taxable');
  });

  it('조정지역 취득이라도 2017.8.2 이전이면 거주요건 없음 → 비과세', () => {
    const r = judgeInwayExempt({
      prevAcquireDate: '2016-06-01', prevAcquiredInAdjust: true, prevLiveYears: 0,
      approvalDate: '2022-01-01', inwaySaleDate: '2024-06-01',
      otherHouse: 'none', salePrice: 700_000_000,
    });
    expect(get(r, 'live').ok).toBe(true);
    expect(r.verdict).toBe('exempt');
  });

  it('나목: 1주택 취득 후 3년 이내 입주권 양도 → 비과세', () => {
    const r = judgeInwayExempt({
      prevAcquireDate: '2018-01-01', prevAcquiredInAdjust: false,
      approvalDate: '2022-01-01', inwaySaleDate: '2024-06-01',
      otherHouse: 'one-temp', newHouseAcquireDate: '2023-01-01', salePrice: 700_000_000,
    });
    expect(get(r, 'sale').ok).toBe(true);
    expect(r.verdict).toBe('exempt');
  });

  it('나목: 1주택 취득 후 3년 초과하여 입주권 양도 → 과세', () => {
    const r = judgeInwayExempt({
      prevAcquireDate: '2018-01-01', prevAcquiredInAdjust: false,
      approvalDate: '2022-01-01', inwaySaleDate: '2024-06-01',
      otherHouse: 'one-temp', newHouseAcquireDate: '2020-01-01', salePrice: 700_000_000,
    });
    expect(get(r, 'sale').ok).toBe(false);
    expect(r.verdict).toBe('taxable');
  });

  it('2주택 이상 보유 → 비과세 대상 아님', () => {
    const r = judgeInwayExempt({
      prevAcquireDate: '2018-01-01', prevAcquiredInAdjust: false,
      approvalDate: '2022-01-01', inwaySaleDate: '2024-06-01',
      otherHouse: 'multi', salePrice: 700_000_000,
    });
    expect(get(r, 'sale').ok).toBe(false);
    expect(r.verdict).toBe('taxable');
  });

  it('고가(12억 초과) → 부분 비과세', () => {
    const r = judgeInwayExempt({
      prevAcquireDate: '2018-01-01', prevAcquiredInAdjust: false,
      approvalDate: '2022-01-01', inwaySaleDate: '2024-06-01',
      otherHouse: 'none', salePrice: 1_500_000_000,
    });
    expect(r.isHigh).toBe(true);
    expect(r.threshold).toBe(1_200_000_000);
    expect(r.verdict).toBe('partial');
  });

  it('요건 미충족이면 고가 여부와 무관하게 과세', () => {
    const r = judgeInwayExempt({
      prevAcquireDate: '2021-06-01', prevAcquiredInAdjust: false,
      approvalDate: '2022-01-01', inwaySaleDate: '2024-06-01',
      otherHouse: 'none', salePrice: 1_500_000_000,
    });
    expect(r.verdict).toBe('taxable');
  });
});

describe('judgeReplacementHouse — 대체주택 비과세 특례 (§156의2⑤)', () => {
  const okInput = {
    oneHouseAtApproval: true, replacementAfterApproval: true, replacementLiveYears: 1,
    movedWithin3y: true, newHouseLiveYears: 1, soldWithin3y: true,
    salePrice: 800_000_000, saleDate: '2024-06-01',
  };

  it('모든 요건 충족 → 비과세 (보유·거주기간 무관)', () => {
    const r = judgeReplacementHouse(okInput);
    expect(r.verdict).toBe('exempt');
  });

  it('사업시행인가일 현재 1주택 아님 → 특례 대상 아님 과세', () => {
    const r = judgeReplacementHouse({ ...okInput, oneHouseAtApproval: false });
    expect(get(r, 'one').ok).toBe(false);
    expect(r.verdict).toBe('taxable');
  });

  it('인가 전 대체주택 취득 → 과세', () => {
    const r = judgeReplacementHouse({ ...okInput, replacementAfterApproval: false });
    expect(get(r, 'after').ok).toBe(false);
    expect(r.verdict).toBe('taxable');
  });

  it('대체주택 1년 거주 미달 → 과세', () => {
    const r = judgeReplacementHouse({ ...okInput, replacementLiveYears: 0 });
    expect(get(r, 'replive').ok).toBe(false);
    expect(r.verdict).toBe('taxable');
  });

  it('완공 3년 내 이사 안 함 → 과세', () => {
    const r = judgeReplacementHouse({ ...okInput, movedWithin3y: false });
    expect(get(r, 'move').ok).toBe(false);
    expect(r.verdict).toBe('taxable');
  });

  it('신축주택 1년 거주 미달 → 과세', () => {
    const r = judgeReplacementHouse({ ...okInput, newHouseLiveYears: 0 });
    expect(get(r, 'newlive').ok).toBe(false);
    expect(r.verdict).toBe('taxable');
  });

  it('완공 3년 내 대체주택 양도 안 함 → 과세', () => {
    const r = judgeReplacementHouse({ ...okInput, soldWithin3y: false });
    expect(get(r, 'sold').ok).toBe(false);
    expect(r.verdict).toBe('taxable');
  });

  it('요건 충족 + 고가(12억 초과) → 부분 비과세', () => {
    const r = judgeReplacementHouse({ ...okInput, salePrice: 1_500_000_000 });
    expect(r.isHigh).toBe(true);
    expect(r.verdict).toBe('partial');
  });
});
