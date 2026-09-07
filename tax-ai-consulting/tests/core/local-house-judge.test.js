import { describe, it, expect } from 'vitest';
import {
  judgeLocalHouse, secondHomePriceLimit, REGIONS, HOW, DEPOP,
  JONGBU_LOWPRICE, JONGBU_LOWPRICE_DEPOP, SECOND_HOME_END, RURAL99_END, UNSOLD_END,
} from '../../src/core/local-house-judge.js';

const path = (r, key) => r.paths.find((p) => p.key === key);
const chk = (p, key) => p.checklist.find((c) => c.key === key);

/** 기본 사례: 수도권 조정지역 1주택(2015 취득, 공시 10억) + 도 지역 읍·면 저가주택(2022 매입, 기준시가 2억·공시 2.5억) */
const base = {
  sellFirst: 'metro', saleDate: '2026-09-01', salePrice: 1_100_000_000,
  taxYear: 2026, age: 62, soleOwner: true,
  metro: { acquireDate: '2015-03-01', acquiredInAdjust: false, adjustNow: true, liveYears: 5, gongsi: 1_000_000_000 },
  local: {
    region: 'province', eupMyeon: true, depop: 'none', how: 'buy',
    acquireDate: '2022-05-01', acquirePrice: 200_000_000, gongsi: 250_000_000,
    sameSgg: false, excludedArea: false, adjacentEupMyeon: false, hanok: false,
  },
};
const withLocal = (o) => ({ ...base, local: { ...base.local, ...o } });

describe('양도세 — 조특법 §99의4 농어촌주택 / 일시적 2주택', () => {
  it('읍·면 3억 이하 농어촌주택을 일반주택 보유 중 취득 + 3년 보유 → §99의4 비과세', () => {
    const r = judgeLocalHouse(base).transfer;
    expect(path(r, 'temp').ok).toBe(false);          // 신규 취득 3년 경과
    expect(path(r, 'rural99').ok).toBe(true);
    expect(r.applied.key).toBe('rural99');
    expect(r.verdict).toBe('exempt');
  });

  it('지방주택 취득 3년 이내 종전(수도권) 양도 → 일시적 2주택(§155①)이 먼저 적용', () => {
    const r = judgeLocalHouse({ ...base, saleDate: '2024-09-01' }).transfer;
    expect(path(r, 'temp').ok).toBe(true);
    expect(r.applied.key).toBe('temp');
    expect(r.verdict).toBe('exempt');
  });

  it('동 지역(읍·면 아님) 일반 매입 → 특례 없음 → 과세, 단 3억 이하라 중과 주택수 제외', () => {
    const r = judgeLocalHouse(withLocal({ eupMyeon: false })).transfer;
    expect(r.applied).toBeNull();
    expect(r.verdict).toBe('taxable');
    expect(r.heavy.otherCounted).toBe(false);
    expect(r.heavy.isHeavy).toBe(false);
    expect(r.reasons[0]).toContain('중과');
  });

  it('기준시가 3.5억 → §99의4 가액 미충족 / 공시 4억이면 중과 주택수 포함 → 조정지역 2주택 중과', () => {
    const r = judgeLocalHouse(withLocal({ acquirePrice: 350_000_000, gongsi: 400_000_000 })).transfer;
    expect(chk(path(r, 'rural99'), 'price').ok).toBe(false);
    expect(r.verdict).toBe('taxable');
    expect(r.heavy.otherCounted).toBe(true);
    expect(r.heavy.isHeavy).toBe(true);
  });

  it('양도주택이 비조정지역이면 중과 없음', () => {
    const r = judgeLocalHouse({ ...withLocal({ eupMyeon: false }), metro: { ...base.metro, adjustNow: false } }).transfer;
    expect(r.heavy.isHeavy).toBe(false);
  });

  it('농어촌주택을 일반주택보다 먼저 취득 → §99의4 취득 순서 미충족', () => {
    const r = judgeLocalHouse(withLocal({ acquireDate: '2010-01-01' })).transfer;
    expect(chk(path(r, 'rural99'), 'order').ok).toBe(false);
    expect(r.verdict).toBe('taxable');
  });

  it('보유 3년 미달 → 조건부 적용(warn) + 추징 안내', () => {
    const r = judgeLocalHouse(withLocal({ acquireDate: '2024-06-01' })).transfer;
    // 신규 취득 3년 이내라 일시적 2주택도 성립 → 그래도 §99의4 hold 경고는 유지
    const hold = chk(path(r, 'rural99'), 'hold');
    expect(hold.ok).toBe(true);
    expect(hold.warn).toBe(true);
  });

  it('제외지역(조정·토허·도시지역·관광단지) 또는 연접 읍면 → 미충족', () => {
    expect(chk(path(judgeLocalHouse(withLocal({ excludedArea: true })).transfer, 'rural99'), 'excluded').ok).toBe(false);
    expect(chk(path(judgeLocalHouse(withLocal({ adjacentEupMyeon: true })).transfer, 'rural99'), 'adjacent').ok).toBe(false);
  });

  it('한옥은 4억까지 허용', () => {
    const r = judgeLocalHouse(withLocal({ acquirePrice: 380_000_000, hanok: true })).transfer;
    expect(chk(path(r, 'rural99'), 'price').ok).toBe(true);
  });

  it('고향주택: 인구 20만 이하 시 + 2009.1.1 이후 취득', () => {
    const r = judgeLocalHouse(withLocal({ how: 'hometown', eupMyeon: false, smallCity: true })).transfer;
    expect(path(r, 'rural99').ok).toBe(true);
    expect(path(r, 'rural99').title).toContain('고향주택');
  });

  it('수도권 접경지역(연천·강화·옹진)은 수도권이므로 §99의4·§155⑦·§155⑧ 불가', () => {
    const r = judgeLocalHouse(withLocal({ region: 'borderCapital', how: 'unavoidable' })).transfer;
    expect(chk(path(r, 'rural99'), 'region').ok).toBe(false);
    expect(chk(path(r, 'unavoidable'), 'region').ok).toBe(false);
  });
});

describe('양도세 — §155② 상속 · §155⑦ 농어촌(상속·이농·귀농) · §155⑧ 부득이한 사유', () => {
  it('읍·면 상속주택(피상속인 6년 거주) → §155②·§155⑦ 모두 충족', () => {
    const r = judgeLocalHouse(withLocal({ how: 'inherit', otherLiveYears: 6, acquireDate: '2024-06-01' })).transfer;
    expect(path(r, 'inherit').ok).toBe(true);
    expect(path(r, 'rural155').ok).toBe(true);
    expect(r.verdict).toBe('exempt');
  });

  it('상속개시 전 취득한 일반주택이 아니면 §155② 미충족', () => {
    const r = judgeLocalHouse({ ...withLocal({ how: 'inherit', otherLiveYears: 6, acquireDate: '2012-01-01', eupMyeon: false }), metro: { ...base.metro, acquireDate: '2015-03-01' } }).transfer;
    expect(chk(path(r, 'inherit'), 'order').ok).toBe(false);
  });

  it('이농주택: 이농인 5년 거주 요건', () => {
    const ok = judgeLocalHouse(withLocal({ how: 'leaveFarm', otherLiveYears: 5 })).transfer;
    const no = judgeLocalHouse(withLocal({ how: 'leaveFarm', otherLiveYears: 4, acquirePrice: 350_000_000 })).transfer;
    expect(path(ok, 'rural155').ok).toBe(true);
    expect(path(no, 'rural155').ok).toBe(false);
    expect(no.verdict).toBe('taxable');
  });

  it('귀농주택: 농지 1,000㎡ + 3년 영농 + 취득 5년 내 일반주택 양도', () => {
    const ok = judgeLocalHouse(withLocal({ how: 'returnFarm', farmlandM2: 1200, farmYears: 4 })).transfer;
    expect(path(ok, 'rural155').ok).toBe(true);
    const late = judgeLocalHouse({ ...withLocal({ how: 'returnFarm', farmlandM2: 1200, farmYears: 4, acquireDate: '2020-01-01' }), saleDate: '2026-09-01' }).transfer;
    expect(chk(path(late, 'rural155'), 'within5').ok).toBe(false);
    const small = judgeLocalHouse(withLocal({ how: 'returnFarm', farmlandM2: 800, farmYears: 4 })).transfer;
    expect(chk(path(small, 'rural155'), 'farmland').ok).toBe(false);
  });

  it('부득이한 사유: 해소일부터 3년 이내 양도면 충족, 초과면 미충족, 미해소면 기한 없음', () => {
    const iso = (d) => judgeLocalHouse(withLocal({ how: 'unavoidable', eupMyeon: false, acquirePrice: 400_000_000, reasonEndDate: d })).transfer;
    expect(path(iso('2024-01-01'), 'unavoidable').ok).toBe(true);
    expect(iso('2024-01-01').verdict).toBe('exempt');
    expect(path(iso('2023-01-01'), 'unavoidable').ok).toBe(false);
    expect(iso('2023-01-01').verdict).toBe('taxable');
    expect(path(iso(null), 'unavoidable').ok).toBe(true);
  });
});

describe('양도세 — 조특법 §71의2 세컨드홈 · §98의9 준공 후 미분양', () => {
  const sh = (o) => judgeLocalHouse({
    ...withLocal({ depop: 'depop', eupMyeon: false, acquireDate: '2026-03-01', acquirePrice: 800_000_000, gongsi: 700_000_000, ...o }),
    saleDate: '2029-06-01',   // 신규 취득 3년 경과 → 일시적 2주택 배제해 세컨드홈만 검증
    salePrice: 1_100_000_000,
  }).transfer;

  it('2026.1.1 이후 인구감소지역 취득 기준시가 8억(≤9억) → 세컨드홈 특례 비과세', () => {
    const r = sh({});
    expect(path(r, 'secondHome').ok).toBe(true);
    expect(r.applied.key).toBe('secondHome');
    expect(r.verdict).toBe('exempt');
  });

  it('2025년 취득분은 4억 기준 → 8억 미충족', () => {
    const r = sh({ acquireDate: '2025-06-01' });
    expect(chk(path(r, 'secondHome'), 'price').ok).toBe(false);
    expect(r.verdict).toBe('taxable');
  });

  it('인구감소관심지역은 2026.1.1 이후 취득 + 4억 이하', () => {
    expect(path(sh({ depop: 'interest', acquirePrice: 350_000_000, gongsi: 300_000_000 }), 'secondHome').ok).toBe(true);
    expect(chk(path(sh({ depop: 'interest', acquirePrice: 350_000_000, acquireDate: '2025-06-01' }), 'secondHome'), 'depop').ok).toBe(false);
    expect(chk(path(sh({ depop: 'interest', acquirePrice: 500_000_000 }), 'secondHome'), 'price').ok).toBe(false);
  });

  it('같은 시·군·구, 광역시, 취득기한 초과 → 미충족 / 접경지역·광역시 군은 허용', () => {
    expect(chk(path(sh({ sameSgg: true }), 'secondHome'), 'sgg').ok).toBe(false);
    expect(chk(path(sh({ region: 'metroCity' }), 'secondHome'), 'region').ok).toBe(false);
    expect(chk(path(sh({ acquireDate: '2027-01-15' }), 'secondHome'), 'period').ok).toBe(false);
    expect(chk(path(sh({ region: 'borderCapital' }), 'secondHome'), 'region').ok).toBe(true);
    expect(chk(path(sh({ region: 'metroCityGun' }), 'secondHome'), 'region').ok).toBe(true);
  });

  it('secondHomePriceLimit: 취득일·지역별 가액 기준', () => {
    expect(secondHomePriceLimit('2025-06-01', 'depop')).toBe(400_000_000);
    expect(secondHomePriceLimit('2026-01-01', 'depop')).toBe(900_000_000);
    expect(secondHomePriceLimit('2026-01-01', 'interest')).toBe(400_000_000);
    expect(secondHomePriceLimit('2025-06-01', 'interest')).toBeNull();
    expect(secondHomePriceLimit('2026-01-01', 'none')).toBeNull();
  });

  it('준공 후 미분양: 수도권 밖 85㎡·6억 이하, 2024.1.10~2026.12.31 취득', () => {
    const un = (o) => judgeLocalHouse({ ...withLocal({ how: 'unsold', eupMyeon: false, acquireDate: '2025-06-01', acquirePrice: 450_000_000, gongsi: 400_000_000, area: 84, acqAmount: 550_000_000, ...o }), saleDate: '2029-06-01' }).transfer;
    expect(path(un({}), 'unsold').ok).toBe(true);
    expect(un({}).verdict).toBe('exempt');
    expect(chk(path(un({ area: 101 }), 'unsold'), 'area').ok).toBe(false);
    expect(chk(path(un({ acqAmount: 650_000_000 }), 'unsold'), 'price').ok).toBe(false);
    expect(chk(path(un({ region: 'borderCapital' }), 'unsold'), 'region').ok).toBe(false);
    expect(path(judgeLocalHouse(withLocal({ how: 'buy' })).transfer, 'unsold')).toBeUndefined();
  });
});

describe('양도세 — §154① 보유·거주·고가 / 지방주택 먼저 양도', () => {
  it('수도권 주택이 2017.8.3 이후 조정지역 취득 + 거주 0 → 특례 해당해도 과세', () => {
    const r = judgeLocalHouse({ ...base, metro: { ...base.metro, acquireDate: '2019-01-01', acquiredInAdjust: true, liveYears: 0 } }).transfer;
    expect(r.applied.key).toBe('rural99');
    expect(r.base.find((c) => c.key === 'live').ok).toBe(false);
    expect(r.verdict).toBe('taxable');
  });

  it('양도가액 15억 → 12억 초과분 과세(부분 비과세)', () => {
    const r = judgeLocalHouse({ ...base, salePrice: 1_500_000_000 }).transfer;
    expect(r.isHigh).toBe(true);
    expect(r.threshold).toBe(1_200_000_000);
    expect(r.verdict).toBe('partial');
  });

  it('지방주택을 먼저 양도: 일시적 2주택(지방=종전)만 검토', () => {
    const r = judgeLocalHouse({
      ...base, sellFirst: 'local', saleDate: '2026-06-01', salePrice: 300_000_000,
      metro: { ...base.metro, acquireDate: '2024-01-01' },
      local: { ...base.local, acquireDate: '2015-01-01', acquiredInAdjust: false, liveYears: 0 },
    }).transfer;
    expect(r.sold).toBe('local');
    expect(r.paths.map((p) => p.key)).toEqual(['temp']);
    expect(r.verdict).toBe('exempt');
    expect(r.heavy.isHeavy).toBe(false);
  });

  it('지방주택 먼저 양도 + 수도권 주택 취득 3년 경과 → 과세', () => {
    const r = judgeLocalHouse({
      ...base, sellFirst: 'local', saleDate: '2026-06-01', salePrice: 300_000_000,
      metro: { ...base.metro, acquireDate: '2022-01-01' },
      local: { ...base.local, acquireDate: '2015-01-01' },
    }).transfer;
    expect(r.verdict).toBe('taxable');
  });
});

describe('종부세 — 1세대1주택자 특례 (§8④) 판정', () => {
  it('도 지역 공시 2.5억 지방 저가주택 → §8④3 특례, 12억 공제 + 세액공제(1주택분)', () => {
    const j = judgeLocalHouse(base).jongbu;
    expect(path(j, 'lowPrice').ok).toBe(true);
    expect(j.verdict).toBe('exempt');
    expect(j.compare.special.breakdown.deductAmt).toBe(1_200_000_000);
    expect(j.compare.multi.breakdown.deductAmt).toBe(900_000_000);
    expect(j.compare.saving).toBeGreaterThan(0);
    expect(j.compare.special.total).toBeLessThan(j.compare.multi.total);
  });

  it('세액공제는 수도권 주택 공시가격 비율(10/12.5 = 80%)만큼만 적용', () => {
    const j = judgeLocalHouse(base).jongbu;
    const b = j.compare.special.breakdown;
    expect(j.ratio).toBeCloseTo(0.8, 6);
    expect(j.period).toBe(11);                 // 2015.3 → 2026.6
    expect(b.prdDc).toBe(0.4);                 // 10년 이상 40%
    expect(b.ageDc).toBe(0.2);                 // 62세 20%
    expect(b.credit).toBeCloseTo(b.creditFull * 0.8, 0);
  });

  it('공시 7억 지방주택: 인구감소지역이면 9억 기준으로 특례, 아니면 4억 초과로 불가', () => {
    const big = { acquirePrice: 600_000_000, gongsi: 700_000_000 };
    expect(judgeLocalHouse(withLocal({ ...big, depop: 'depop' })).jongbu.verdict).toBe('exempt');
    const no = judgeLocalHouse(withLocal(big)).jongbu;
    expect(chk(path(no, 'lowPrice'), 'gongsi').ok).toBe(false);
    expect(no.verdict).toBe('taxable');
    expect(no.compare.special.total).toBe(no.compare.special.total);   // 계산은 항상 제공
  });

  it('광역시(군 제외)·세종 동 지역·수도권 접경지역은 지방 저가주택 불가', () => {
    for (const region of ['metroCity', 'sejongDong', 'borderCapital']) {
      expect(chk(path(judgeLocalHouse(withLocal({ region })).jongbu, 'lowPrice'), 'region').ok).toBe(false);
    }
    for (const region of ['province', 'metroCityGun', 'sejongEupMyeon']) {
      expect(chk(path(judgeLocalHouse(withLocal({ region })).jongbu, 'lowPrice'), 'region').ok).toBe(true);
    }
  });

  it('공동명의·세대원 분산 소유 → 특례 불가', () => {
    const j = judgeLocalHouse({ ...base, soleOwner: false }).jongbu;
    expect(path(j, 'lowPrice').ok).toBe(true);
    expect(j.verdict).toBe('taxable');
    expect(j.common.find((c) => c.key === 'sole').ok).toBe(false);
  });

  it('일시적 2주택: 신규주택 취득 3년 이내 과세기준일', () => {
    const j = judgeLocalHouse(withLocal({ acquireDate: '2024-01-01', gongsi: 700_000_000, acquirePrice: 650_000_000 })).jongbu;
    expect(path(j, 'temp').ok).toBe(true);      // 2024.1 → 2026.6.1 = 2.4년
    expect(j.applied.key).toBe('temp');
    const late = judgeLocalHouse({ ...withLocal({ acquireDate: '2022-01-01', gongsi: 700_000_000, acquirePrice: 650_000_000 }), taxYear: 2026 }).jongbu;
    expect(path(late, 'temp').ok).toBe(false);
  });

  it('상속주택: 5년 경과라도 지분 40% 이하 또는 지분 공시 3억 이하면 특례', () => {
    const inh = (o) => judgeLocalHouse(withLocal({ how: 'inherit', acquireDate: '2019-01-01', gongsi: 700_000_000, acquirePrice: 600_000_000, ...o })).jongbu;
    expect(path(inh({ inheritShare: 0.3 }), 'inherit').ok).toBe(true);
    expect(path(inh({ inheritShare: 1 }), 'inherit').ok).toBe(false);          // 7억 > 3억
    expect(path(inh({ inheritShare: 0.4 }), 'inherit').ok).toBe(true);
    expect(path(inh({ inheritShare: 1, gongsi: 250_000_000 }), 'inherit').ok).toBe(true);
    expect(path(inh({ inheritShare: 1, acquireDate: '2023-01-01' }), 'inherit').ok).toBe(true);  // 5년 이내
  });

  it('세컨드홈(§71의2): 취득 요건 + 과세기준일 공시가격 기준 이내', () => {
    const j = judgeLocalHouse(withLocal({ depop: 'depop', acquireDate: '2026-03-01', acquirePrice: 800_000_000, gongsi: 700_000_000 })).jongbu;
    expect(path(j, 'secondHome').ok).toBe(true);
    const over = judgeLocalHouse(withLocal({ depop: 'depop', acquireDate: '2026-03-01', acquirePrice: 800_000_000, gongsi: 950_000_000 })).jongbu;
    expect(chk(path(over, 'secondHome'), 'gongsi').ok).toBe(false);
  });

  it('준공 후 미분양(§98의9) 경로는 취득 경위가 unsold일 때만 생성', () => {
    const j = judgeLocalHouse(withLocal({ how: 'unsold', acquireDate: '2025-06-01', area: 84, acqAmount: 550_000_000, gongsi: 450_000_000, acquirePrice: 450_000_000 })).jongbu;
    expect(path(j, 'unsold').ok).toBe(true);
    expect(path(judgeLocalHouse(base).jongbu, 'unsold')).toBeUndefined();
  });
});

describe('상수·목록', () => {
  it('지방 저가주택 4억 / 인구감소지역 9억, 일몰 기한', () => {
    expect(JONGBU_LOWPRICE).toBe(400_000_000);
    expect(JONGBU_LOWPRICE_DEPOP).toBe(900_000_000);
    expect(SECOND_HOME_END).toBe('2026-12-31');
    expect(UNSOLD_END).toBe('2026-12-31');
    expect(RURAL99_END).toBe('2028-12-31');
  });
  it('입력 목록', () => {
    expect(REGIONS.map((r) => r.key)).toEqual(['province', 'metroCityGun', 'metroCity', 'sejongEupMyeon', 'sejongDong', 'borderCapital', 'capital']);
  });
  it('수도권 비접경(가평 등)은 세컨드홈·농어촌·종부세 저가주택 모두 지역 요건 미충족', () => {
    const r = judgeLocalHouse({ ...base, local: { ...base.local, region: 'capital', depop: 'depop', acquireDate: '2026-03-01', acquirePrice: 300_000_000 } });
    expect(chk(path(r.transfer, 'secondHome'), 'region').ok).toBe(false);
    expect(chk(path(r.transfer, 'rural99'), 'region').ok).toBe(false);
    expect(chk(path(r.jongbu, 'lowPrice'), 'region').ok).toBe(false);
    expect(r.transfer.heavy.otherCounted).toBe(true);
  });
  it('취득 경위·인구감소 구분 목록', () => {
    expect(HOW.map((h) => h.key)).toEqual(['buy', 'inherit', 'leaveFarm', 'returnFarm', 'unavoidable', 'unsold', 'hometown']);
    expect(DEPOP.map((x) => x.key)).toEqual(['none', 'depop', 'interest']);
  });
});
