import { describe, it, expect } from 'vitest';
import { calcAcquisitionTax } from '../../src/core/acquisition-calc.js';

const other = (label, o = {}) => ({ label, region: 'adjust', metro: true, kind: 'house', price: 800_000_000, status: 'normal', ...o });
const buy = (o = {}) => calcAcquisitionTax({ cause: 'buy', fullPrice: 500_000_000, over85: true, region: 'adjust', ...o });

describe('취득세 계산기 — 국세청 「2026 주택과 세금」 예제', () => {
  it('책 30쪽: 6억5천만원 매매 → 세율 1.33%, 취득세 8,645,000원', () => {
    const r = buy({ fullPrice: 650_000_000, over85: false });
    expect(r.rates.take).toBeCloseTo(0.0133, 6);
    expect(r.takeTax).toBe(8_645_000);
  });
  it('책 59쪽: 100㎡ 아파트 5억 매매(1주택) → 500만 + 50만 + 100만 = 650만원', () => {
    const r = buy();
    expect([r.takeTax, r.eduTax, r.agTax, r.total]).toEqual([5_000_000, 500_000, 1_000_000, 6_500_000]);
    expect(r.heavy).toBe(false);
  });
  it('책 59쪽: 1주택 세대가 조정지역 100㎡ 5억 추가 취득(8%) → 4,000만 + 200만 + 300만 = 4,500만원', () => {
    const r = buy({ others: [other('기존')] });
    expect([r.takeTax, r.eduTax, r.agTax, r.total]).toEqual([40_000_000, 2_000_000, 3_000_000, 45_000_000]);
    expect(r.heavy).toBe(true);
    expect(r.heavyExtra.extra).toBe(45_000_000 - 6_500_000);
  });
});

describe('유상취득 중과 (책 31쪽 세율표)', () => {
  it('조정 3주택 12% → 합계세율 13.4% (85㎡ 초과)', () => {
    const r = buy({ others: [other('a'), other('b')] });
    expect(r.rates.take).toBe(0.12);
    expect(r.totalRate).toBeCloseTo(0.134, 6);
  });
  it('비조정 2주택은 표준세율, 3주택 8%, 4주택 12%', () => {
    expect(buy({ region: 'nonadjust', others: [other('a')] }).rates.take).toBe(0.01);
    expect(buy({ region: 'nonadjust', others: [other('a'), other('b')] }).rates.take).toBe(0.08);
    expect(buy({ region: 'nonadjust', others: [other('a'), other('b'), other('c')] }).rates.take).toBe(0.12);
  });
  it('85㎡ 이하는 농특세 없음 → 8% 중과 합계 8.4%', () => {
    const r = buy({ over85: false, others: [other('a')] });
    expect(r.agTax).toBe(0);
    expect(r.totalRate).toBeCloseTo(0.084, 6);
  });
  it('법인은 주택수 무관 12%', () => {
    expect(buy({ isLegalEntity: true }).rates.take).toBe(0.12);
  });
  it('일시적 2주택은 표준세율 + 추징 위험액(8% 기준) 제시', () => {
    const r = buy({ tempTwo: true, others: [other('종전')] });
    expect(r.rates.take).toBe(0.01);
    expect(r.tempTwoRisk.heavyAmounts.total).toBe(45_000_000);
    expect(r.tempTwoRisk.extra).toBe(38_500_000);
  });
  it('지정고시일 이전 계약은 비조정으로 적용', () => {
    const r = buy({ contractBeforeDesignation: true, others: [other('a')] });
    expect(r.heavy).toBe(false);
    expect(r.region).toBe('nonadjust');
  });
});

describe('중과제외주택·주택수 제외', () => {
  it('수도권 시가표준액 1억 이하 주택은 다주택이어도 표준세율', () => {
    const r = buy({ fullPrice: 150_000_000, officialPrice: 100_000_000, others: [other('a'), other('b')] });
    expect(r.heavy).toBe(false);
    expect(r.rates.take).toBe(0.01);
  });
  it('수도권 외 지역은 2억 이하까지 중과제외, 수도권은 1억 초과면 중과', () => {
    const o = { fullPrice: 250_000_000, officialPrice: 180_000_000, others: [other('a')] };
    expect(buy({ ...o, capital: false }).heavy).toBe(false);
    expect(buy({ ...o, capital: true }).heavy).toBe(true);
  });
  it('정비구역 소재 저가주택은 중과제외 불가', () => {
    const r = buy({ fullPrice: 150_000_000, officialPrice: 90_000_000, inRedevZone: true, others: [other('a')] });
    expect(r.rates.take).toBe(0.08);
  });
  it('보유 주택이 수도권 외 2억 이하(2025.1.2 이후 취득)면 주택수 제외', () => {
    const low = other('지방', { price: 150_000_000, lowLimit: 200_000_000 });
    expect(buy({ others: [low] }).houseCount).toBe(1);
    expect(buy({ others: [other('지방', { price: 150_000_000 })] }).houseCount).toBe(2);
  });
  it('상속 5년 이내 주택은 주택수 제외', () => {
    const r = buy({ others: [other('상속', { status: 'inherit' })] });
    expect(r.houseCount).toBe(1);
    expect(r.heavy).toBe(false);
  });
});

describe('증여·상속·신축 (책 30·48·59쪽)', () => {
  it('증여 85㎡ 초과 3.5% → 합계 4.0%', () => {
    const r = calcAcquisitionTax({ cause: 'gift', fullPrice: 500_000_000, over85: true, region: 'nonadjust' });
    expect(r.totalRate).toBeCloseTo(0.04, 6);
    expect(r.total).toBe(20_000_000);
  });
  it('조정지역 + 시가표준액 3억 이상 증여 → 12% (합계 13.4%)', () => {
    const r = calcAcquisitionTax({ cause: 'gift', fullPrice: 700_000_000, officialPrice: 500_000_000, over85: true, region: 'adjust' });
    expect(r.rates.take).toBe(0.12);
    expect(r.totalRate).toBeCloseTo(0.134, 6);
  });
  it('조정지역이라도 시가표준액 3억 미만 또는 1세대1주택자의 가족 증여는 3.5%', () => {
    const base = { cause: 'gift', fullPrice: 700_000_000, over85: false, region: 'adjust' };
    expect(calcAcquisitionTax({ ...base, officialPrice: 90_000_000 }).rates.take).toBe(0.035);
    expect(calcAcquisitionTax({ ...base, officialPrice: 500_000_000, donorOneHouseFamily: true }).rates.take).toBe(0.035);
  });
  it('상속 2.8% → 85㎡ 초과 합계 3.16%, 무주택 특례 0.8% → 합계 0.96%', () => {
    const a = calcAcquisitionTax({ cause: 'inherit', fullPrice: 500_000_000, over85: true });
    expect(a.totalRate).toBeCloseTo(0.0316, 6);
    const b = calcAcquisitionTax({ cause: 'inherit', fullPrice: 500_000_000, over85: true, heirHouseless: true });
    expect(b.totalRate).toBeCloseTo(0.0096, 6);
  });
  it('신축 85㎡ 이하 합계 2.96%', () => {
    const r = calcAcquisitionTax({ cause: 'build', fullPrice: 300_000_000, over85: false });
    expect(r.totalRate).toBeCloseTo(0.0296, 6);
  });
});

describe('고급주택·지분·오피스텔', () => {
  it('고급주택 유상취득 3% + 8%p = 11%, 중과 12% + 8%p = 20% (책 49쪽)', () => {
    expect(buy({ fullPrice: 3_000_000_000, luxury: true }).rates.take).toBeCloseTo(0.11, 6);
    expect(buy({ fullPrice: 3_000_000_000, luxury: true, others: [other('a'), other('b')] }).rates.take).toBeCloseTo(0.20, 6);
  });
  it('고급주택 신축 2.8% + 8%p = 10.8%', () => {
    expect(calcAcquisitionTax({ cause: 'build', fullPrice: 3_000_000_000, luxury: true }).rates.take).toBeCloseTo(0.108, 6);
  });
  it('지분 취득: 세율은 전체 가액, 과세표준은 지분가액', () => {
    const r = buy({ fullPrice: 1_000_000_000, share: 0.5, over85: false });
    expect(r.rates.take).toBe(0.03);
    expect(r.base).toBe(500_000_000);
    expect(r.takeTax).toBe(15_000_000);
  });
  it('오피스텔 매매 4% + 0.4% + 0.2% = 4.6% (주택수 무관)', () => {
    const r = buy({ kind: 'officetel', over85: false, others: [other('a'), other('b')] });
    expect(r.totalRate).toBeCloseTo(0.046, 6);
    expect(r.heavy).toBe(false);
  });
});
