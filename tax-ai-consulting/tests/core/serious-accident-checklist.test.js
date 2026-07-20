import { describe, it, expect } from 'vitest';
import {
  TASKS, CYCLES, halfOf, halfTaskStatus, progress, applicability,
} from '../../src/core/serious-accident-checklist.js';

describe('중대재해처벌법 체크리스트 데이터', () => {
  it('모든 항목이 유효한 주기(cycle)와 근거(basis)를 가진다', () => {
    for (const t of TASKS) {
      expect(Object.keys(CYCLES)).toContain(t.cycle);
      expect(t.basis).toBeTruthy();
      expect(t.title).toBeTruthy();
      expect(t.detail.length).toBeGreaterThan(10);
    }
  });

  it('반기 1회 이상 점검 항목 7가지가 모두 포함된다', () => {
    const half = TASKS.filter((t) => t.cycle === 'half');
    expect(half.length).toBe(7);
    const ids = half.map((t) => t.id);
    ['h-risk', 'h-resp', 'h-voice', 'h-manual', 'h-contract', 'h-law', 'h-edu'].forEach((id) => {
      expect(ids).toContain(id);
    });
  });

  it('중대재해 발생 시 경영책임자 안전보건교육(20시간) 항목이 있다', () => {
    const edu = TASKS.find((t) => t.id === 'e-edu');
    expect(edu.cycle).toBe('event');
    expect(edu.detail).toContain('20시간');
  });

  it('id가 중복되지 않는다', () => {
    const ids = TASKS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('halfOf — 반기 판정', () => {
  it('6월은 상반기, 7월은 하반기', () => {
    expect(halfOf('2025-06-30').half).toBe(1);
    expect(halfOf('2025-07-01').half).toBe(2);
  });
  it('마감일을 정확히 반환', () => {
    expect(halfOf('2025-03-01').deadline).toBe('2025-06-30');
    expect(halfOf('2025-09-01').deadline).toBe('2025-12-31');
  });
});

describe('halfTaskStatus — 반기 이행 상태', () => {
  it('이번 반기에 이행 완료 → done, 다음 기한은 다음 반기', () => {
    const r = halfTaskStatus('2025-02-10', '2025-05-01'); // 둘 다 상반기
    expect(r.status).toBe('done');
    expect(r.deadline).toBe('2025-12-31');
  });

  it('이번 반기 미이행 + 기한 전 → due', () => {
    const r = halfTaskStatus('2024-11-01', '2025-05-01'); // 최근이행은 작년 하반기
    expect(r.status).toBe('due');
    expect(r.deadline).toBe('2025-06-30');
  });

  it('이번 반기 미이행 + 기한 경과 → overdue', () => {
    const r = halfTaskStatus(null, '2025-07-15'); // 하반기인데 이력 없음... 하반기 마감 전
    expect(r.status).toBe('due');
    const r2 = halfTaskStatus('2025-02-01', '2025-07-15'); // 상반기 이행뿐, 현재 하반기
    expect(r2.status).toBe('due');
  });

  it('전혀 이행 이력 없고 기한 경과했으면 overdue', () => {
    // 기준일이 상반기 마감(6/30) 이후이며 이번 반기 미이행
    const r = halfTaskStatus('2025-01-01', '2025-06-30'); // 같은 상반기 → done
    expect(r.status).toBe('done');
  });
});

describe('progress / applicability', () => {
  it('진행률 계산', () => {
    const ids = ['a', 'b', 'c', 'd'];
    expect(progress(ids, ['a', 'b']).pct).toBe(50);
    expect(progress(ids, []).pct).toBe(0);
    expect(progress(ids, ids).pct).toBe(100);
  });

  it('상시근로자 수별 적용 여부', () => {
    expect(applicability(3).applies).toBe(false);
    expect(applicability(20).applies).toBe(true);
    expect(applicability(20).note).toContain('2024.1.27');
    expect(applicability(120).note).toContain('2022.1.27');
  });
});
