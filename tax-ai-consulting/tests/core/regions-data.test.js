import { describe, it, expect } from 'vitest';
import {
  DEPOP_AREAS, INTEREST_AREAS, BORDER_AREAS, SIGUNGU, classifyArea, searchAreas, allAreas,
} from '../../src/core/regions-data.js';

describe('지역 데이터 — 개수·정합성', () => {
  it('인구감소지역 89곳 · 관심지역 18곳 · 접경지역 15곳 · 시군구 229곳', () => {
    expect(DEPOP_AREAS).toHaveLength(89);
    expect(INTEREST_AREAS).toHaveLength(18);
    expect(BORDER_AREAS).toHaveLength(15);
    expect(allAreas()).toHaveLength(229);
  });

  it('명단의 모든 지역이 시군구 목록에 존재하고 중복이 없다', () => {
    const all = new Set(Object.entries(SIGUNGU).flatMap(([s, l]) => l.map((n) => `${s}|${n}`)));
    for (const [s, n] of [...DEPOP_AREAS, ...INTEREST_AREAS, ...BORDER_AREAS]) expect(all.has(`${s}|${n}`), `${s} ${n}`).toBe(true);
    const dup = (arr) => new Set(arr.map(([s, n]) => `${s}|${n}`)).size === arr.length;
    expect(dup(DEPOP_AREAS)).toBe(true);
    expect(dup(INTEREST_AREAS)).toBe(true);
    const both = DEPOP_AREAS.filter(([s, n]) => INTEREST_AREAS.some(([s2, n2]) => s === s2 && n === n2));
    expect(both).toHaveLength(0);
  });

  it('시·도별 인구감소지역 개수 (행안부 고시)', () => {
    const count = (sido) => DEPOP_AREAS.filter(([s]) => s === sido).length;
    expect(count('부산')).toBe(3); expect(count('대구')).toBe(3); expect(count('인천')).toBe(2); expect(count('경기')).toBe(2);
    expect(count('강원')).toBe(12); expect(count('충북')).toBe(6); expect(count('충남')).toBe(9); expect(count('전북')).toBe(10);
    expect(count('전남')).toBe(16); expect(count('경북')).toBe(15); expect(count('경남')).toBe(11);
  });
});

describe('classifyArea — 세법상 지역 분류', () => {
  it('강원 강릉시: 관심지역 · 도 지역 · 세컨드홈 가능(2026 취득분)', () => {
    const a = classifyArea('강원', '강릉시');
    expect(a.depop).toBe('interest');
    expect(a.regionKey).toBe('province');
    expect(a.secondHomeOk).toBe(true);
    expect(a.jongbuLowPriceOk).toBe(true);
  });

  it('대구 군위군: 인구감소지역 + 광역시 소속 군 → 특례 가능', () => {
    const a = classifyArea('대구', '군위군');
    expect(a.depop).toBe('depop');
    expect(a.regionKey).toBe('metroCityGun');
    expect(a.secondHomeOk).toBe(true);
    expect(a.jongbuLowPriceOk).toBe(true);
  });

  it('부산 동구: 인구감소지역이지만 광역시 → 세컨드홈·지방 저가주택 불가', () => {
    const a = classifyArea('부산', '동구');
    expect(a.depop).toBe('depop');
    expect(a.regionKey).toBe('metroCity');
    expect(a.secondHomeOk).toBe(false);
    expect(a.jongbuLowPriceOk).toBe(false);
  });

  it('경기 연천군: 인구감소 + 수도권 접경 → 세컨드홈 가능, 종부세 지방 저가주택 불가', () => {
    const a = classifyArea('경기', '연천군');
    expect(a.depop).toBe('depop');
    expect(a.border).toBe(true);
    expect(a.regionKey).toBe('borderCapital');
    expect(a.secondHomeOk).toBe(true);
    expect(a.jongbuLowPriceOk).toBe(false);
  });

  it('경기 가평군: 인구감소지역이나 수도권 비접경 → 모든 특례 불가', () => {
    const a = classifyArea('경기', '가평군');
    expect(a.depop).toBe('depop');
    expect(a.regionKey).toBe('capital');
    expect(a.secondHomeOk).toBe(false);
    expect(a.jongbuLowPriceOk).toBe(false);
  });

  it('경기 동두천시·포천시: 관심지역 + 접경 → 세컨드홈 가능 / 인천 동구: 관심지역이나 수도권 비접경 → 불가', () => {
    expect(classifyArea('경기', '동두천시').secondHomeOk).toBe(true);
    expect(classifyArea('경기', '포천시').regionKey).toBe('borderCapital');
    expect(classifyArea('인천', '동구').secondHomeOk).toBe(false);
    expect(classifyArea('인천', '강화군').regionKey).toBe('borderCapital');
  });

  it('충남 천안시: 인구감소 아님 · 도 지역', () => {
    const a = classifyArea('충남', '천안시');
    expect(a.depop).toBe('none');
    expect(a.regionKey).toBe('province');
    expect(a.secondHomeOk).toBe(false);
    expect(a.jongbuLowPriceOk).toBe(true);
  });

  it('세종·강원 철원(접경이지만 비수도권)', () => {
    expect(classifyArea('세종', '세종특별자치시').regionKey).toBe('sejongDong');
    const c = classifyArea('강원', '철원군');
    expect(c.border).toBe(true);
    expect(c.capital).toBe(false);
    expect(c.regionKey).toBe('province');
  });
});

describe('searchAreas — 이름 검색', () => {
  it('부분 일치·접미어 생략, 동명 지역은 모두 반환 (고성군: 강원·경남)', () => {
    const r = searchAreas('고성');
    expect(r.map((a) => a.sido).sort()).toEqual(['강원', '경남']);
    expect(searchAreas('강릉')[0].name).toBe('강릉시');
    expect(searchAreas('강릉시')[0].sido).toBe('강원');
  });

  it('시·도 접두어로 좁히기 ("부산 동구", "경기 광주")', () => {
    const r = searchAreas('부산 동구');
    expect(r).toHaveLength(1);
    expect(r[0].sido).toBe('부산');
    expect(searchAreas('경기 광주')[0].name).toBe('광주시');
    expect(searchAreas('동구').length).toBeGreaterThanOrEqual(5);
  });

  it('빈 문자열·없는 이름은 빈 배열', () => {
    expect(searchAreas('')).toEqual([]);
    expect(searchAreas('없는동네')).toEqual([]);
  });
});
