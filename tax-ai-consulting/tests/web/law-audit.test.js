/**
 * 세법 동향 일지·엔진 검증표가 실제 엔진 값과 어긋나지 않는지 대조한다.
 * 검증표(ENGINE_AUDIT)에 적힌 핵심 숫자를 엔진으로 직접 계산해 확인한다.
 */
import { describe, it, expect } from 'vitest';
import { LAW_UPDATES, ENGINE_AUDIT, ENGINE_AUDIT_DATE } from '../../src/web/static/law-updates-data.js';
import { calcSaleIncomeTax } from '../../src/core/transfer-tax.js';
import { NONBIZ_LAND_SURCHARGE, UNREGISTERED_RATE, REFORM2026, SINGLE_HH_NONTAX_THRESHOLD } from '../../src/core/constants.js';

const row = (kw) => ENGINE_AUDIT.find((a) => a.rule.includes(kw));

describe('세법 동향 일지', () => {
  it('항목 형식: 날짜·구분·상태·출처', () => {
    for (const u of LAW_UPDATES) {
      expect(u.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(['반영완료', '검토중', '영향없음', '국회심의중']).toContain(u.engineStatus);
      expect(u.sources.length).toBeGreaterThan(0);
    }
  });
  it('검증일은 일지 최신 항목보다 늦거나 같다 (새 항목을 넣으면 검증표도 다시 볼 것)', () => {
    const latest = LAW_UPDATES.map((u) => u.date).sort().pop();
    expect(ENGINE_AUDIT_DATE >= latest).toBe(true);
  });
});

describe('엔진 검증표 ↔ 엔진 값', () => {
  it('상태 값', () => {
    for (const a of ENGINE_AUDIT) expect(['현행일치', '정부안', '미반영']).toContain(a.status);
  });
  it('비사업용 토지 +10%p / 정부안 +20%p', () => {
    expect(row('비사업용 토지 추가과세').engine).toContain('10%p');
    expect(NONBIZ_LAND_SURCHARGE).toBe(0.10);
    expect(row('비사업용 토지 과세 강화').engine).toContain('20%p');
    expect(REFORM2026.NONBIZ_LAND_SURCHARGE).toBe(0.20);
    expect(REFORM2026.NONBIZ_LAND_FROM).toBe(2028);
  });
  it('미등기 70%', () => {
    expect(row('미등기').engine).toContain('70%');
    expect(UNREGISTERED_RATE).toBe(0.7);
  });
  it('단기양도: 주택 70/60, 토지·건물 50/40', () => {
    const rate = (hold, type) => calcSaleIncomeTax(500_000_000, 300_000_000, hold, 0, '기타', type).breakdown.appliedR;
    expect([rate(0, '주택'), rate(1, '주택')]).toEqual([0.7, 0.6]);
    expect([rate(0, '토지'), rate(1, '건물')]).toEqual([0.5, 0.4]);
  });
  it('장특공 표1: 3년 6% ~ 15년 30%', () => {
    const d = (hold) => calcSaleIncomeTax(500_000_000, 300_000_000, hold, 0, '기타', '토지').breakdown.totalDeductRate;
    expect([d(2), d(3), d(10), d(15), d(30)]).toEqual([0, 6, 20, 30, 30]);
  });
  it('고가주택 12억, 다주택 중과 +20/+30%p', () => {
    expect(SINGLE_HH_NONTAX_THRESHOLD).toBe(1_200_000_000);
    expect(REFORM2026.HEAVY_SURCHARGE_DEFAULT).toEqual({ two: 0.20, threePlus: 0.30 });
  });
  it('기본세율 최고 45% (과세표준 10억 초과)', () => {
    const b = calcSaleIncomeTax(3_000_000_000, 500_000_000, 2, 0, '기타', '토지').breakdown;
    expect(b.baseR).toBe(0.45);
    expect(b.baseDc).toBe(65_940_000);
  });
});
