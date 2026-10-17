import { describe, it, expect } from 'vitest';
import { calcGiveTax } from '../../src/core/gift-tax.js';
import {
  CHILD, SPOUSE, PARENTS, EXT_REL, ETC,
  SKIP_T, SKIP_F,
  GIVE_DEDUCT, ADULT_AGE,
} from '../../src/core/constants.js';

describe('calcGiveTax — 증여세', () => {
  it('성년 자녀에게 1억 증여: 공제 5천만, 과세표준 5천만, 세율 10%', () => {
    const r = calcGiveTax(CHILD, SKIP_F, 100_000_000, 25);
    expect(r.breakdown.deduct).toBe(GIVE_DEDUCT.CHILD_ADULT);
    expect(r.breakdown.taxBase).toBe(50_000_000);
    expect(r.breakdown.taxRate).toBe(0.10);
    expect(r.breakdown.rawTax).toBe(5_000_000);
    // 세대생략 없음 + 신고세액공제 3%
    expect(r.tax).toBe(Math.floor(5_000_000 * 0.97));
  });

  it('미성년 자녀: 공제 2천만', () => {
    const r = calcGiveTax(CHILD, SKIP_F, 100_000_000, 15);
    expect(r.breakdown.deduct).toBe(GIVE_DEDUCT.CHILD_MINOR);
  });

  it('성년 기준 경계: 만 19세는 성년(민법 §4) → 5천만 공제, 만 18세는 미성년 2천만', () => {
    const r = calcGiveTax(CHILD, SKIP_F, 100_000_000, ADULT_AGE);
    expect(r.breakdown.deduct).toBe(GIVE_DEDUCT.CHILD_ADULT);
    const m = calcGiveTax(CHILD, SKIP_F, 100_000_000, ADULT_AGE - 1);
    expect(m.breakdown.deduct).toBe(GIVE_DEDUCT.CHILD_MINOR);
  });

  it('배우자: 6억 공제', () => {
    const r = calcGiveTax(SPOUSE, SKIP_F, 600_000_000, 40);
    expect(r.breakdown.deduct).toBe(GIVE_DEDUCT.SPOUSE);
    expect(r.breakdown.taxBase).toBe(0);
    expect(r.tax).toBe(0);
  });

  it('직계존속(부모): 5천만 공제', () => {
    const r = calcGiveTax(PARENTS, SKIP_F, 100_000_000, 60);
    expect(r.breakdown.deduct).toBe(GIVE_DEDUCT.PARENTS);
  });

  it('기타친족(EXT_REL): 1천만 공제', () => {
    const r = calcGiveTax(EXT_REL, SKIP_F, 50_000_000, 30);
    expect(r.breakdown.deduct).toBe(GIVE_DEDUCT.EXT_REL);
  });

  it('타인(ETC): 공제 없음', () => {
    const r = calcGiveTax(ETC, SKIP_F, 50_000_000, 30);
    expect(r.breakdown.deduct).toBe(0);
    expect(r.breakdown.taxBase).toBe(50_000_000);
  });

  it('누진세율 구간: 10억 증여 → 30% 구간', () => {
    const r = calcGiveTax(ETC, SKIP_F, 1_000_000_000, 40);
    expect(r.breakdown.taxRate).toBe(0.30);
    expect(r.breakdown.accDeduct).toBe(60_000_000);
  });

  it('30억 초과 증여: 최고세율 50%', () => {
    const r = calcGiveTax(ETC, SKIP_F, 4_000_000_000, 40);
    expect(r.breakdown.taxRate).toBe(0.50);
  });

  it('세대생략 할증: 20억 이하 → 30% 가산', () => {
    const r = calcGiveTax(CHILD, SKIP_T, 1_000_000_000, 10);
    expect(r.breakdown.skipRate).toBe(0.3);
  });

  it('세대생략 할증: 미성년 수증자 + 20억 초과 → 40% 가산', () => {
    const r = calcGiveTax(CHILD, SKIP_T, 2_500_000_000, 10);
    expect(r.breakdown.skipRate).toBe(0.4);
  });

  it('세대생략 할증: 성년 수증자는 20억 초과여도 30% (상증세법 §57①)', () => {
    const r = calcGiveTax(CHILD, SKIP_T, 2_500_000_000, 25);
    expect(r.breakdown.skipRate).toBe(0.3);
  });

  it('공제액 > 증여가액인 경우 과세표준 0, 세액 0', () => {
    const r = calcGiveTax(SPOUSE, SKIP_F, 100_000_000, 40);
    expect(r.breakdown.taxBase).toBe(0);
    expect(r.tax).toBe(0);
  });

  it('lawRef 포함', () => {
    const r = calcGiveTax(CHILD, SKIP_F, 100_000_000, 25);
    expect(Array.isArray(r.lawRef)).toBe(true);
    expect(r.lawRef.length).toBeGreaterThan(0);
  });
});
