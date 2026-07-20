import { describe, it, expect } from 'vitest';
import {
  CATEGORIES, KINDS, FREQUENCIES, monthMatrix, recurrences,
  entriesOn, entriesInMonth, summarize, overdue, isoOf,
} from '../../src/core/inspection-calendar.js';

describe('상수', () => {
  it('3개 항목(위험성/성과/기타)과 2개 구분(정기/수시)', () => {
    expect(CATEGORIES.map((c) => c.key)).toEqual(['risk', 'perf', 'etc']);
    expect(KINDS.map((k) => k.key)).toEqual(['regular', 'spot']);
    expect(FREQUENCIES.find((f) => f.key === 'half').months).toBe(6);
  });
});

describe('monthMatrix — 달력 격자', () => {
  it('2026년 7월: 1일은 수요일, 31일 포함', () => {
    const w = monthMatrix(2026, 7);
    // 각 주는 7칸
    expect(w.every((week) => week.length === 7)).toBe(true);
    // 2026-07-01 은 수요일(dow=3) → 첫 주 index 3
    expect(w[0][3]).toBe('2026-07-01');
    expect(w[0][0]).toBe(null);
    // 31일이 격자에 존재
    const flat = w.flat();
    expect(flat).toContain('2026-07-31');
    expect(flat.filter(Boolean).length).toBe(31);
  });

  it('2월 윤년/평년 일수', () => {
    expect(monthMatrix(2024, 2).flat().filter(Boolean).length).toBe(29);
    expect(monthMatrix(2025, 2).flat().filter(Boolean).length).toBe(28);
  });
});

describe('recurrences — 반복 일정', () => {
  it('반기 2회 → 6개월 간격', () => {
    expect(recurrences('2026-01-15', 'half', 2)).toEqual(['2026-01-15', '2026-07-15']);
  });
  it('매월 3회', () => {
    expect(recurrences('2026-01-31', 'month', 3)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });
  it('분기 4회 → 연간', () => {
    expect(recurrences('2026-03-10', 'quarter', 4)).toEqual(['2026-03-10', '2026-06-10', '2026-09-10', '2026-12-10']);
  });
  it('매주 3회', () => {
    expect(recurrences('2026-07-01', 'week', 3)).toEqual(['2026-07-01', '2026-07-08', '2026-07-15']);
  });
  it('반복 없음(once) 또는 count 1 → 시작일만', () => {
    expect(recurrences('2026-07-01', 'once', 5)).toEqual(['2026-07-01']);
    expect(recurrences('2026-07-01', 'half', 1)).toEqual(['2026-07-01']);
  });
  it('연도 넘어가는 반기', () => {
    expect(recurrences('2026-09-01', 'half', 2)).toEqual(['2026-09-01', '2027-03-01']);
  });
});

describe('필터·집계', () => {
  const entries = [
    { id: 1, date: '2026-07-05', cat: 'risk', kind: 'regular', done: true },
    { id: 2, date: '2026-07-05', cat: 'perf', kind: 'regular', done: false },
    { id: 3, date: '2026-08-01', cat: 'etc', kind: 'spot', done: false },
    { id: 4, date: '2026-06-30', cat: 'risk', kind: 'regular', done: false },
  ];

  it('entriesOn / entriesInMonth', () => {
    expect(entriesOn(entries, '2026-07-05').map((e) => e.id)).toEqual([1, 2]);
    expect(entriesInMonth(entries, 2026, 7).map((e) => e.id)).toEqual([1, 2]);
  });

  it('summarize 집계', () => {
    const s = summarize(entries);
    expect(s.total).toBe(4);
    expect(s.done).toBe(1);
    expect(s.pending).toBe(3);
    expect(s.byCat).toEqual({ risk: 2, perf: 1, etc: 1 });
  });

  it('overdue: 오늘 이전 미완료', () => {
    const od = overdue(entries, '2026-07-10');
    expect(od.map((e) => e.id)).toEqual([2, 4]); // 07-05 미완료, 06-30 미완료 (07-05 완료건 제외)
  });

  it('isoOf 포맷', () => {
    expect(isoOf(2026, 7, 5)).toBe('2026-07-05');
  });
});
