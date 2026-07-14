import { describe, it, expect } from 'vitest';
import {
  judgeSingleHouseExempt, judgeTempTwoExempt, judgeSaengsang,
} from '../../src/core/single-house-exempt.js';

const get = (r, key) => r.checklist.find((c) => c.key === key);

describe('judgeSingleHouseExempt — 기본 비과세', () => {
  it('비조정 취득·보유 3년·거주 0 → 비과세 (거주요건 없음)', () => {
    const r = judgeSingleHouseExempt({
      acquireDate: '2021-01-01', saleDate: '2024-03-01',
      acquiredInAdjust: false, liveYears: 0, isOneHousehold: true, salePrice: 800_000_000,
    });
    expect(r.verdict).toBe('exempt');
    expect(get(r, 'hold').ok).toBe(true);
    expect(get(r, 'live').ok).toBe(true);
  });

  it('조정 취득(2020)·보유 3년·거주 0·상생 없음 → 거주요건 미충족 과세', () => {
    const r = judgeSingleHouseExempt({
      acquireDate: '2020-06-01', saleDate: '2024-06-01',
      acquiredInAdjust: true, liveYears: 0, isOneHousehold: true, salePrice: 800_000_000,
    });
    expect(get(r, 'live').ok).toBe(false);
    expect(r.verdict).toBe('taxable');
  });

  it('조정 취득이라도 2017.8.2 이전이면 거주요건 없음 → 비과세', () => {
    const r = judgeSingleHouseExempt({
      acquireDate: '2017-05-01', saleDate: '2024-05-01',
      acquiredInAdjust: true, liveYears: 0, isOneHousehold: true, salePrice: 800_000_000,
    });
    expect(get(r, 'live').ok).toBe(true);
    expect(r.verdict).toBe('exempt');
  });

  it('보유 1년 → 보유요건 미충족 과세', () => {
    const r = judgeSingleHouseExempt({
      acquireDate: '2023-06-01', saleDate: '2024-06-01',
      acquiredInAdjust: false, isOneHousehold: true, salePrice: 500_000_000,
    });
    expect(get(r, 'hold').ok).toBe(false);
    expect(r.verdict).toBe('taxable');
  });

  it('고가주택 15억 → 부분 비과세(초과분 과세)', () => {
    const r = judgeSingleHouseExempt({
      acquireDate: '2019-01-01', saleDate: '2024-01-01',
      acquiredInAdjust: false, isOneHousehold: true, salePrice: 1_500_000_000,
    });
    expect(r.verdict).toBe('partial');
    expect(r.isHigh).toBe(true);
    expect(r.threshold).toBe(1_200_000_000);
  });

  it('고가주택 기준: 2021.12.8 이전 양도는 9억', () => {
    const r = judgeSingleHouseExempt({
      acquireDate: '2016-01-01', saleDate: '2021-06-01',
      acquiredInAdjust: false, isOneHousehold: true, salePrice: 1_000_000_000,
    });
    expect(r.threshold).toBe(900_000_000);
    expect(r.isHigh).toBe(true);
  });

  it('2주택이면 비과세 불가 (일시적 2주택 별도)', () => {
    const r = judgeSingleHouseExempt({
      acquireDate: '2019-01-01', saleDate: '2024-01-01',
      acquiredInAdjust: false, isOneHousehold: false, salePrice: 500_000_000,
    });
    expect(get(r, 'one').ok).toBe(false);
    expect(r.verdict).toBe('taxable');
  });

  it('과거 다주택→1주택 전환: 2022.5.10 이후 양도는 취득일 기산(리셋 폐지)', () => {
    const r = judgeSingleHouseExempt({
      acquireDate: '2018-01-01', saleDate: '2024-01-01',
      acquiredInAdjust: false, isOneHousehold: true, salePrice: 700_000_000,
      finalOneReset: true,
    });
    // 취득일(2018) 기산 → 보유 6년 → 충족
    expect(get(r, 'hold').ok).toBe(true);
    expect(r.reasons.some((x) => x.includes('2022.5.10 이후'))).toBe(true);
  });

  it('과거 다주택→1주택: 2021~2022.5.9 양도는 최종1주택일 기산(리셋)', () => {
    const r = judgeSingleHouseExempt({
      acquireDate: '2015-01-01', saleDate: '2022-03-01',
      acquiredInAdjust: false, isOneHousehold: true, salePrice: 700_000_000,
      finalOneReset: true, finalOneDate: '2021-06-01', // 최종1주택 후 9개월 → 2년 미충족
    });
    expect(get(r, 'hold').ok).toBe(false); // 리셋 기산으로 보유 2년 미달
  });
});

describe('상생임대주택 거주요건 면제', () => {
  it('상생임대 요건 충족 → 조정 취득이라도 거주요건 면제 비과세', () => {
    const r = judgeSingleHouseExempt({
      acquireDate: '2021-01-01', saleDate: '2024-06-01',
      acquiredInAdjust: true, liveYears: 0, isOneHousehold: true, salePrice: 800_000_000,
      saengsangOk: true,
    });
    expect(get(r, 'live').ok).toBe(true);
    expect(get(r, 'live').detail).toContain('상생임대');
    expect(r.verdict).toBe('exempt');
  });

  it('judgeSaengsang: 모든 요건 충족 시 ok', () => {
    const r = judgeSaengsang({ prevMonths: 20, sangMonths: 24, increasePct: 4.5, contractDate: '2023-03-01' });
    expect(r.ok).toBe(true);
  });

  it('judgeSaengsang: 인상률 6% 또는 계약기간 밖이면 실패', () => {
    expect(judgeSaengsang({ prevMonths: 20, sangMonths: 24, increasePct: 6, contractDate: '2023-03-01' }).ok).toBe(false);
    expect(judgeSaengsang({ prevMonths: 20, sangMonths: 24, increasePct: 4, contractDate: '2027-01-01' }).ok).toBe(false);
    expect(judgeSaengsang({ prevMonths: 12, sangMonths: 24, increasePct: 4, contractDate: '2023-03-01' }).ok).toBe(false);
  });
});

describe('일시적 2주택 비과세', () => {
  it('종전 취득 1년 후 신규 + 3년 내 양도 + 보유 2년 → 비과세', () => {
    const r = judgeTempTwoExempt({
      prevAcquireDate: '2019-01-01', newAcquireDate: '2022-01-01', prevSaleDate: '2024-06-01',
      prevAcquiredInAdjust: false, prevLiveYears: 0, salePrice: 900_000_000,
    });
    expect(r.verdict).toBe('exempt');
  });

  it('신규취득 3년 초과 후 양도 → 처분기한 미충족 과세', () => {
    const r = judgeTempTwoExempt({
      prevAcquireDate: '2018-01-01', newAcquireDate: '2020-01-01', prevSaleDate: '2024-06-01',
      prevAcquiredInAdjust: false, salePrice: 800_000_000,
    });
    expect(get(r, 'dispose').ok).toBe(false);
    expect(r.verdict).toBe('taxable');
  });

  it('종전주택 취득 1년 전에 신규 취득 → 요건 미충족', () => {
    const r = judgeTempTwoExempt({
      prevAcquireDate: '2021-06-01', newAcquireDate: '2021-09-01', prevSaleDate: '2023-01-01',
      prevAcquiredInAdjust: false, salePrice: 700_000_000,
    });
    expect(get(r, 'gap').ok).toBe(false);
  });

  it('종전주택 조정 취득 + 거주 0 + 상생 → 거주요건 면제 비과세', () => {
    const r = judgeTempTwoExempt({
      prevAcquireDate: '2020-01-01', newAcquireDate: '2022-01-01', prevSaleDate: '2024-06-01',
      prevAcquiredInAdjust: true, prevLiveYears: 0, salePrice: 900_000_000, saengsangOk: true,
    });
    expect(get(r, 'live').ok).toBe(true);
    expect(r.verdict).toBe('exempt');
  });
});
