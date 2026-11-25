import { describe, it, expect } from 'vitest';
import {
  calcJongbu, personTax, classifyJongbuHouse, standardPropertyTax, priceFromPropertyTaxBase,
} from '../../src/core/jongbu-calc.js';
import { calcAggrTax } from '../../src/core/comprehensive-tax.js';
import { calcPropertyTax } from '../../src/core/property-tax.js';

const E = 100_000_000;

describe('국세청 「2026 주택과 세금」 예제', () => {
  it('책 114쪽: 6억 + 10억 두 채 → 공제할 재산세액 810,160원', () => {
    const r = personTax({ items: [{ full: 6 * E }, { full: 10 * E }], deduct: 9 * E });
    expect(r.propTax).toBe(2_580_000);            // 810,000 + 1,770,000
    expect(r.base).toBe(420_000_000);             // (16억 − 9억) × 60%
    expect(r.propNumerator).toBeCloseTo(1_008_000, 3);
    expect(r.propDenominator).toBeCloseTo(3_210_000, 3);
    expect(r.propCredit).toBe(810_160);
  });
  it('책 108쪽: 공시 15억 → 과세표준 1세대1주택 1.8억, 개인 3.6억', () => {
    expect(calcJongbu({ mode: 'single', price: 15 * E }).main.base).toBe(180_000_000);
    expect(personTax({ items: [{ full: 15 * E }], deduct: 9 * E }).base).toBe(360_000_000);
  });
  it('책 110쪽 세율표: 과표 18.6억 3주택 이상 = 2% − 1,440만', () => {
    const r = personTax({ items: [{ full: 20 * E }, { full: 10 * E }, { full: 10 * E }], deduct: 9 * E, three: true });
    expect(r.base).toBe(1_860_000_000);
    expect(r.gross).toBe(1_860_000_000 * 0.02 - 14_400_000);
  });
});

describe('기존 엔진(calcAggrTax)과 일치 — 1세대 1주택 단독명의', () => {
  for (const [g, hold, age] of [[15 * E, 10, 60], [22.5 * E, 3, 50], [30 * E, 15, 70], [12 * E, 0, 40]]) {
    it(`공시 ${g / E}억 · 보유 ${hold}년 · ${age}세`, () => {
      const old = calcAggrTax('1세대1주택', '비조정지역', g, hold, age, calcPropertyTax('1세대1주택', g).propertyTax);
      const r = calcJongbu({ mode: 'single', price: g, age, holdYears: hold }).main;
      expect(Math.abs(r.jongbu - old.aggrTax)).toBeLessThanOrEqual(10);   // 공제할 재산세액 10원 절사 차이
      expect(Math.abs(r.total - old.total)).toBeLessThanOrEqual(12);
    });
  }
});

describe('부부 공동명의', () => {
  it('각자 9억 공제 방식과 1주택 특례(12억 + 세액공제)를 비교해 유리한 쪽을 알려준다', () => {
    const young = calcJongbu({ mode: 'couple', price: 30 * E, share: 0.5, age: 50, holdYears: 3 });
    expect(young.eligible).toBe(true);
    expect(young.better).toBe('each');
    const old = calcJongbu({ mode: 'couple', price: 22.5 * E, share: 0.5, age: 70, holdYears: 15 });
    expect(old.better).toBe('special');
    expect(old.special.creditRate).toBe(0.8);
  });
  it('공시 18억 이하 50:50 → 각자 9억 공제로 0원', () => {
    expect(calcJongbu({ mode: 'couple', price: 18 * E, share: 0.5 }).eachTotal).toBe(0);
  });
  it('부부 중 한 명이 일반 주택을 더 가지면 특례 불가', () => {
    const r = calcJongbu({ mode: 'couple', price: 22 * E, houses: [{ price: 5 * E, owner: 'spouse', kind: 'normal' }] });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('normal');
  });
  it('특례주택이 부부 양쪽에 나뉘어 있으면 특례 불가, 한쪽에만 있으면 그 사람이 납세의무자', () => {
    const split = calcJongbu({ mode: 'couple', price: 22 * E, houses: [
      { price: 3 * E, owner: 'me', kind: 'inherit' }, { price: 3 * E, owner: 'spouse', kind: 'rural' }] });
    expect(split.reason).toBe('split');
    const one = calcJongbu({ mode: 'couple', price: 22 * E, age: 65, holdYears: 10, houses: [{ price: 3 * E, owner: 'spouse', kind: 'inherit' }] });
    expect(one.special.payer).toBe('spouse');
    expect(one.special.taxpayer.creditShare).toBeCloseTo(22 / 25, 6);
  });
});

describe('다른 집이 더 있는 경우', () => {
  it('일반 주택 3채 → 3주택 이상 세율', () => {
    const r = calcJongbu({ mode: 'multi', price: 20 * E, houses: [{ price: 10 * E, kind: 'normal' }, { price: 10 * E, kind: 'normal' }] });
    expect(r.counted).toBe(3);
    expect(r.three).toBe(true);
  });
  it('합산배제 주택은 과세에서 빠지고, 이 집만 남으면 1주택자 방식 신청 가능', () => {
    const r = calcJongbu({ mode: 'multi', price: 22 * E, age: 60, holdYears: 5, houses: [{ price: 6 * E, kind: 'excl' }] });
    expect(r.main.pub).toBe(22 * E);
    expect(r.eligible).toBe(true);
    expect(r.oneHouse.deduct).toBe(12 * E);
    expect(r.diff).toBeGreaterThan(0);
  });
  it('상속주택은 과세표준에 합산하되 주택 수에서 제외, 세액공제는 이 집 몫에만', () => {
    const r = calcJongbu({ mode: 'multi', price: 22 * E, age: 65, holdYears: 10, houses: [{ price: 5 * E, kind: 'inherit' }] });
    expect(r.main.pub).toBe(27 * E);
    expect(r.counted).toBe(1);
    expect(r.oneHouse.creditShare).toBeCloseTo(22 / 27, 6);
  });
  it('일반 주택이 하나라도 더 있으면 1주택자 방식 불가', () => {
    const r = calcJongbu({ mode: 'multi', price: 22 * E, houses: [{ price: 5 * E, kind: 'normal' }, { price: 5 * E, kind: 'inherit' }] });
    expect(r.eligible).toBe(false);
  });
});

describe('재산세 입력·세부담상한', () => {
  it('실제 재산세 본세를 넣으면 그 금액으로 공제할 재산세액을 계산', () => {
    const a = calcJongbu({ mode: 'single', price: 22 * E }).main;
    const b = calcJongbu({ mode: 'single', price: 22 * E, assessedPropertyTax: a.propTax / 2 }).main;
    expect(b.propCredit).toBeLessThan(a.propCredit);
    expect(b.propTaxEntered).toBe(true);
  });
  it('전년도 보유세의 150%를 넘는 부분은 종부세에서 차감', () => {
    const free = calcJongbu({ mode: 'single', price: 30 * E }).main;
    const prev = Math.round((free.propTax + free.jongbu) / 2);
    const capped = calcJongbu({ mode: 'single', price: 30 * E, prevYearTotal: prev }).main;
    expect(capped.capLimit).toBe(prev * 1.5);
    expect(capped.propTax + capped.jongbu).toBeLessThanOrEqual(prev * 1.5 + 1);
    expect(capped.capReduction).toBeGreaterThan(0);
  });
});

describe('집 종류 판정 (책 111·119쪽)', () => {
  const local = (o) => classifyJongbuHouse({ pick: 'local', price: 3 * E, ...o });
  it('지방 저가주택: 비수도권 도 지역 4억 이하', () => {
    expect(local({ sido: '강원', name: '원주시' }).kind).toBe('rural');
    expect(local({ sido: '강원', name: '원주시', price: 5 * E }).kind).toBe('normal');
  });
  it('수도권은 강화·옹진·가평·연천군만 인정', () => {
    expect(local({ sido: '경기', name: '가평군' }).kind).toBe('rural');
    expect(local({ sido: '경기', name: '연천군' }).kind).toBe('rural');
    expect(local({ sido: '경기', name: '성남시' }).kind).toBe('normal');
  });
  it('광역시는 군 지역만, 세종은 읍·면만', () => {
    expect(local({ sido: '부산', name: '해운대구' }).kind).toBe('normal');
    expect(local({ sido: '부산', name: '기장군' }).kind).toBe('rural');
    expect(local({ sido: '세종', name: '세종특별자치시' }).kind).toBe('normal');
    expect(local({ sido: '세종', name: '세종특별자치시', sejongRural: true }).kind).toBe('rural');
  });
  it('비수도권 인구감소지역은 2024.1.4 이후 취득분 9억까지', () => {
    expect(local({ sido: '강원', name: '평창군', price: 8 * E, acquireDate: '2025-03-01' }).kind).toBe('rural');
    expect(local({ sido: '강원', name: '평창군', price: 8 * E, acquireDate: '2023-03-01' }).kind).toBe('normal');
    expect(local({ sido: '강원', name: '평창군', price: 10 * E, acquireDate: '2025-03-01' }).kind).toBe('normal');
  });
  it('상속주택: 5년 이내 / 지분 40% 이하 / 지분 공시가격 수도권 6억·그 밖 3억 이하', () => {
    const inh = (o) => classifyJongbuHouse({ pick: 'inherit', price: 10 * E, share: 1, sido: '서울', name: '강남구', ...o });
    expect(inh({ within5: true }).kind).toBe('inherit');
    expect(inh({ share: 0.4 }).kind).toBe('inherit');
    expect(inh({ share: 0.5 }).kind).toBe('inherit');            // 지분 공시가격 5억 ≤ 6억
    expect(inh({ share: 0.7 }).kind).toBe('normal');             // 7억 > 6억
    expect(inh({ share: 0.5, sido: '강원', name: '원주시' }).kind).toBe('normal');   // 5억 > 3억
  });
  it('합산배제는 종류를 골라야 인정', () => {
    expect(classifyJongbuHouse({ pick: 'excl', price: 5 * E }).kind).toBe('normal');
    expect(classifyJongbuHouse({ pick: 'excl', exclType: 'rent', price: 5 * E }).kind).toBe('excl');
  });
});

describe('보조 함수', () => {
  it('재산세 표준세율: 과표 3.6억 → 81만원', () => {
    expect(standardPropertyTax(360_000_000)).toBe(810_000);
  });
  it('재산세 과세표준 → 공시가격 추정 (÷60%, 1주택 ÷45%)', () => {
    expect(priceFromPropertyTaxBase(1_350_000_000)).toBe(2_250_000_000);
    expect(priceFromPropertyTaxBase(1_012_500_000, true)).toBe(2_250_000_000);
  });
});
