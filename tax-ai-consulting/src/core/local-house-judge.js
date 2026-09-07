/**
 * 지방주택 + 수도권 주택 보유 1세대의 「1세대 1주택」 판정기 (소득세법 · 종부세법)
 * 기준: 2026.5.10 시행분 + 2026.1.1 시행 세컨드홈 개정(조특법 §71의2 9억/관심지역 4억)
 *
 * ─ 양도소득세 (수도권 일반주택을 먼저 양도할 때 1세대1주택으로 보는 특례) ─
 *  ① 시행령 §155①   일시적 2주택 (종전 취득 1년 후 신규 취득 + 신규 취득 3년 내 종전 양도)
 *  ② 시행령 §155②   상속주택 + 일반주택 (상속개시 당시 보유 일반주택 양도)
 *  ③ 시행령 §155⑦   농어촌주택(상속·이농·귀농) — 수도권 밖 읍(도시지역 밖)·면 지역
 *       · 상속: 피상속인 5년 이상 거주 / 이농: 이농인 5년 이상 거주
 *       · 귀농: 농지 1,000㎡ 이상 + 취득 후 3년 이상 영농 + 귀농주택 취득일부터 5년 내 일반주택 양도
 *  ④ 시행령 §155⑧   취학·근무·질병 등 부득이한 사유로 취득한 수도권 밖 주택 → 사유 해소일부터 3년 내 일반주택 양도
 *  ⑤ 조특법 §99의4  농어촌주택·고향주택 (2003.8.1~2028.12.31 취득, 기준시가 3억·한옥 4억, 3년 보유,
 *                   일반주택 취득 후 취득, 도시·토허·조정·관광단지 제외, 같은·연접 읍면 제외)
 *  ⑥ 조특법 §71의2  인구감소지역 주택(세컨드홈) — 1주택자가 2024.1.4~2026.12.31 취득,
 *                   취득 당시 기준시가 4억(2026.1.1 이후 취득분 인구감소지역 9억·관심지역 4억),
 *                   수도권(접경지역 제외)·광역시(군 제외) 제외, 기존 주택과 같은 시·군·구 제외
 *  ⑦ 조특법 §98의9  비수도권 준공 후 미분양주택 — 1주택자가 2024.1.10~2026.12.31 취득, 전용 85㎡·취득가액 6억 이하
 *  → 특례 충족 시 §154① 보유 2년·거주 2년(2017.8.3 이후 조정 취득)·고가 12억 초과분 과세 적용
 *  ※ 중과 주택수 제외(§167의3①8의2: 수도권·광역시·특별자치시 외 기준시가 3억 이하)는
 *    「중과」만 배제할 뿐 비과세 판정의 주택수에서는 빠지지 않는다 — 별도 표시
 *
 * ─ 종합부동산세 (1세대1주택자 특례, 종부세법 §8④ · 매년 9.16~9.30 신청) ─
 *  ① §8④1 일시적 2주택 (신규주택 취득일부터 3년)
 *  ② §8④2 상속주택 (상속개시 5년 이내 / 지분 40% 이하 / 지분 공시가격 수도권 6억·비수도권 3억 이하)
 *  ③ §8④3 지방 저가주택 (시행령 §4의2③: 공시가격 4억 이하 — 수도권 밖 인구감소지역 9억,
 *          수도권·광역시(군 제외)·특별자치시 동 지역 제외, 1채)
 *  ④ 조특법 §71의2 인구감소지역 주택 / ⑤ 조특법 §98의9 준공 후 미분양주택
 *  → 특례 적용 시: 기본공제 12억(미적용 9억) + 연령·보유 세액공제는 「1주택분 산출세액」
 *    (= 산출세액 × 수도권주택 공시가격 ÷ 합계)에만 적용. 특례주택 공시가격은 과세표준에 합산됨.
 *  → 두 주택 모두 같은 세대원 1인의 단독 소유여야 함 (대법원 2025두33779)
 */

import { calcAggrTax } from './comprehensive-tax.js';
import { calcPropertyTax } from './property-tax.js';
import { RURAL_TRANSFER_EXCLUDE } from './heavy-tax-judge.js';
import {
  RESIDENCE_REQ_START, HIGH_PRICE_12E_START, HIGH_PRICE_12E, HIGH_PRICE_9E, TEMP_TWO_DISPOSE_YEARS,
} from './single-house-exempt.js';

// ── 상수 (세법 개정 시 여기만 수정) ──────────────────────────────
export const JONGBU_LOWPRICE = 400_000_000;         // §8④3 지방 저가주택 공시가격 (2025.2.28~, 종전 3억)
export const JONGBU_LOWPRICE_DEPOP = 900_000_000;   // 수도권 밖 인구감소지역 9억
export const JONGBU_TEMP_YEARS = 3;                 // §8④1 신규주택 취득일부터 3년
export const JONGBU_INHERIT_YEARS = 5;              // §8④2 상속개시 5년
export const JONGBU_INHERIT_SHARE = 0.4;            // §8④2 지분 40% 이하
export const JONGBU_INHERIT_PRICE_METRO = 600_000_000;  // §8④2 지분 공시가격 수도권 6억
export const JONGBU_INHERIT_PRICE_LOCAL = 300_000_000;  // 비수도권 3억

export const SECOND_HOME_START = '2024-01-04';      // 조특법 §71의2 취득기간
export const SECOND_HOME_END = '2026-12-31';
export const SECOND_HOME_PRICE = 400_000_000;       // 취득 당시 기준시가 4억 (2025.12.31 이전 취득분)
export const SECOND_HOME_PRICE_DEPOP = 900_000_000; // 2026.1.1 이후 취득분: 인구감소지역 9억
export const SECOND_HOME_PRICE_INTEREST = 400_000_000; // 2026.1.1 이후 취득분: 인구감소관심지역 4억
export const SECOND_HOME_9E_START = '2026-01-01';

export const UNSOLD_START = '2024-01-10';           // 조특법 §98의9 준공 후 미분양 취득기간
export const UNSOLD_END = '2026-12-31';
export const UNSOLD_AREA = 85;                      // 전용면적 ㎡
export const UNSOLD_PRICE = 600_000_000;            // 취득가액 6억

export const RURAL99_START = '2003-08-01';          // 조특법 §99의4 농어촌주택 취득기간
export const RURAL99_HOMETOWN_START = '2009-01-01'; // 고향주택
export const RURAL99_END = '2028-12-31';
export const RURAL99_PRICE = 300_000_000;           // 취득 당시 기준시가 3억
export const RURAL99_PRICE_HANOK = 400_000_000;     // 한옥 4억
export const RURAL99_HOLD_YEARS = 3;

export const RURAL155_LIVE_YEARS = 5;               // §155⑦ 상속·이농: 5년 이상 거주
export const RURAL155_FARMLAND_M2 = 1000;           // 귀농: 농지 1,000㎡
export const RURAL155_FARM_YEARS = 3;               // 귀농: 3년 이상 영농
export const RURAL155_RETURN_SALE_YEARS = 5;        // 귀농주택 취득일부터 5년 내 일반주택 양도
export const UNAVOIDABLE_SALE_YEARS = 3;            // §155⑧ 사유 해소일부터 3년

/** 지방주택 소재지 유형 */
export const REGIONS = [
  { key: 'province', label: '도 지역 시·군 (수도권·광역시·세종 아님)', metroArea: false, metroCity: false, sejongDong: false },
  { key: 'metroCityGun', label: '광역시에 속한 군 (달성·군위·기장·울주·강화 아님)', metroArea: false, metroCity: false, sejongDong: false },
  { key: 'metroCity', label: '광역시 (군 제외 — 부산·대구·인천 제외·광주·대전·울산)', metroArea: false, metroCity: true, sejongDong: false },
  { key: 'sejongEupMyeon', label: '세종특별자치시 읍·면 지역', metroArea: false, metroCity: false, sejongDong: false },
  { key: 'sejongDong', label: '세종특별자치시 동 지역', metroArea: false, metroCity: false, sejongDong: true },
  { key: 'borderCapital', label: '수도권 접경지역 (강화·옹진·김포·파주·연천·고양·양주·동두천·포천)', metroArea: true, metroCity: false, sejongDong: false },
  { key: 'capital', label: '수도권 — 접경지역 아님 (특례 불가)', metroArea: true, metroCity: false, sejongDong: false },
];
const REGION = Object.fromEntries(REGIONS.map((r) => [r.key, r]));

/** 지방주택 취득 경위 */
export const HOW = [
  { key: 'buy', label: '일반 매입·신축 등' },
  { key: 'inherit', label: '상속' },
  { key: 'leaveFarm', label: '이농 (농·어업 종사하다 이주하며 남긴 주택)' },
  { key: 'returnFarm', label: '귀농 (영농·영어 목적 취득)' },
  { key: 'unavoidable', label: '취학·근무·질병 등 부득이한 사유로 취득' },
  { key: 'unsold', label: '준공 후 미분양주택 취득' },
  { key: 'hometown', label: '고향주택 취득 (조특법 §99의4)' },
];

/** 인구감소지역 구분 */
export const DEPOP = [
  { key: 'none', label: '해당 없음' },
  { key: 'depop', label: '인구감소지역 (89개 시·군·구)' },
  { key: 'interest', label: '인구감소관심지역 (2026.1.1~)' },
];

const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const eok = (n) => `${(n / 100_000_000).toLocaleString('ko-KR')}억원`;

const d = (s) => new Date(`${String(s)}T00:00:00Z`);
const addYears = (date, n) => { const x = new Date(date); x.setUTCFullYear(x.getUTCFullYear() + n); return x; };
const iso = (date) => date.toISOString().slice(0, 10);
const meetsYears = (startISO, endISO, n) => d(endISO).getTime() >= addYears(d(startISO), n).getTime();
const withinYears = (startISO, endISO, n) => d(endISO).getTime() <= addYears(d(startISO), n).getTime();
const yearsBetween = (aISO, bISO) => (d(bISO).getTime() - d(aISO).getTime()) / (365.2425 * 86400000);
const onOrAfter = (aISO, bISO) => d(aISO).getTime() >= d(bISO).getTime();
const before = (aISO, bISO) => d(aISO).getTime() < d(bISO).getTime();
const between = (aISO, s, e) => onOrAfter(aISO, s) && !before(e, aISO);
const fy = (aISO, bISO) => `${yearsBetween(aISO, bISO).toFixed(1)}년`;

// ── §154① 보유·거주·고가 ──
function residence(adjust, acquireDate, liveYears) {
  const need = adjust && onOrAfter(acquireDate, RESIDENCE_REQ_START);
  if (!need) return { need: false, ok: true, detail: adjust ? '취득일 2017.8.3 이전 → 거주요건 없음' : '취득 당시 비조정지역 → 거주요건 없음' };
  return { need: true, ok: liveYears >= 2, detail: `조정지역 취득(2017.8.3 이후) → 2년 거주 필요 (실거주 ${liveYears}년)` };
}
function highPrice(saleDate, salePrice) {
  const threshold = onOrAfter(saleDate, HIGH_PRICE_12E_START) ? HIGH_PRICE_12E : HIGH_PRICE_9E;
  return { threshold, isHigh: salePrice > threshold };
}
function base154(house, saleDate, salePrice) {
  const list = [];
  const holdOk = !!house.acquireDate && meetsYears(house.acquireDate, saleDate, 2);
  list.push({ key: 'hold', label: '양도주택 보유 2년 이상 (§154①)', ok: holdOk, detail: house.acquireDate ? `${fy(house.acquireDate, saleDate)} (취득 ${house.acquireDate} → 양도 ${saleDate})` : '취득일 미입력' });
  const live = residence(!!house.acquiredInAdjust, house.acquireDate, house.liveYears ?? 0);
  list.push({ key: 'live', label: live.need ? '양도주택 거주 2년 이상 (조정 취득, §154①)' : '거주요건 (해당 없음)', ok: live.ok, detail: live.detail });
  const hp = highPrice(saleDate, salePrice);
  list.push({ key: 'high', label: `고가 (양도가액 ${eok(hp.threshold)} 기준)`, ok: !hp.isHigh, warn: hp.isHigh, detail: hp.isHigh ? `${won(salePrice)} > ${eok(hp.threshold)} → 초과분 과세(부분 비과세)` : `${won(salePrice)} 이하 → 전액 비과세 가능` });
  return { list, ok: holdOk && live.ok, ...hp };
}

/** 지방주택의 §71의2 세컨드홈 가액 기준 — 취득일·지역 구분에 따라 결정 */
export function secondHomePriceLimit(acquireDate, depop) {
  if (!acquireDate || depop === 'none') return null;
  if (onOrAfter(acquireDate, SECOND_HOME_9E_START)) {
    return depop === 'depop' ? SECOND_HOME_PRICE_DEPOP : SECOND_HOME_PRICE_INTEREST;
  }
  return depop === 'depop' ? SECOND_HOME_PRICE : null;   // 관심지역은 2026.1.1 이후 취득분만
}

/**
 * 조특법 §71의2·§98의9·§99의4처럼 "양도세와 종부세에 공통"인 특례주택 요건 (취득 관련 부분)
 * — 양도 판정과 종부세 판정 양쪽에서 재사용
 */
function specialHouseChecks(metro, local) {
  const rg = REGION[local.region] ?? REGION.province;
  const orderOk = !!(metro.acquireDate && local.acquireDate && before(metro.acquireDate, local.acquireDate));
  const orderRow = (label) => ({
    key: 'order', label, ok: orderOk,
    detail: orderOk ? `수도권 주택 ${metro.acquireDate} 취득 → 지방주택 ${local.acquireDate} 취득` : `지방주택(${local.acquireDate || '미입력'})을 수도권 주택(${metro.acquireDate || '미입력'})보다 먼저 취득 → 미충족`,
  });

  // §71의2 인구감소지역 주택
  const sh = [];
  const shPeriodOk = !!local.acquireDate && between(local.acquireDate, SECOND_HOME_START, SECOND_HOME_END);
  sh.push({ key: 'period', label: `취득기간 ${SECOND_HOME_START} ~ ${SECOND_HOME_END}`, ok: shPeriodOk, detail: `취득 ${local.acquireDate || '미입력'}` });
  const depopOk = local.depop === 'depop' || (local.depop === 'interest' && !!local.acquireDate && onOrAfter(local.acquireDate, SECOND_HOME_9E_START));
  sh.push({
    key: 'depop', label: '인구감소지역(관심지역은 2026.1.1 이후 취득분) 소재', ok: depopOk,
    detail: local.depop === 'none' ? '인구감소지역 아님' : local.depop === 'depop' ? '인구감소지역' : (depopOk ? '인구감소관심지역 (2026.1.1 이후 취득)' : '관심지역은 2026.1.1 이후 취득분부터 적용'),
  });
  const shRegionOk = !rg.metroCity && (!rg.metroArea || local.region === 'borderCapital');
  sh.push({ key: 'region', label: '수도권(접경지역 제외)·광역시(군 제외) 아닐 것', ok: shRegionOk, detail: rg.label + (shRegionOk ? ' → 가능' : ' → 제외 지역') });
  const shLimit = secondHomePriceLimit(local.acquireDate, local.depop);
  const shPriceOk = shLimit != null && (local.acquirePrice ?? 0) <= shLimit;
  sh.push({
    key: 'price', label: `취득 당시 기준시가 ${shLimit ? eok(shLimit) : '기준'} 이하`, ok: shPriceOk,
    detail: shLimit ? `${won(local.acquirePrice ?? 0)} (${onOrAfter(local.acquireDate || '1900-01-01', SECOND_HOME_9E_START) ? '2026.1.1 이후 취득: 인구감소 9억·관심 4억' : '2025년 이전 취득: 4억'})` : '가액 기준 산정 불가',
  });
  sh.push({ key: 'sgg', label: '기존 수도권 주택과 같은 시·군·구 아닐 것', ok: !local.sameSgg, detail: local.sameSgg ? '같은 시·군·구 → 제외' : '다른 시·군·구' });
  sh.push(orderRow('1주택 보유 중 취득 (수도권 주택 → 지방주택 순)'));

  // §98의9 준공 후 미분양
  const un = [];
  un.push({ key: 'how', label: '준공 후 미분양주택으로 취득', ok: local.how === 'unsold', detail: local.how === 'unsold' ? '해당' : '취득 경위가 준공 후 미분양이 아님' });
  const unPeriodOk = !!local.acquireDate && between(local.acquireDate, UNSOLD_START, UNSOLD_END);
  un.push({ key: 'period', label: `취득기간 ${UNSOLD_START} ~ ${UNSOLD_END}`, ok: unPeriodOk, detail: `취득 ${local.acquireDate || '미입력'}` });
  un.push({ key: 'region', label: '수도권 밖 소재', ok: !rg.metroArea, detail: rg.label });
  un.push({ key: 'area', label: `전용면적 ${UNSOLD_AREA}㎡ 이하`, ok: (local.area ?? 0) > 0 && local.area <= UNSOLD_AREA, detail: `${local.area ?? 0}㎡` });
  un.push({ key: 'price', label: `취득가액 ${eok(UNSOLD_PRICE)} 이하`, ok: (local.acqAmount ?? 0) > 0 && local.acqAmount <= UNSOLD_PRICE, detail: won(local.acqAmount ?? 0) });
  un.push(orderRow('1주택 보유 중 취득 (수도권 주택 → 지방주택 순)'));

  return { rg, orderOk, secondHome: sh, unsold: un };
}

// ── 양도소득세 ─────────────────────────────────────────────────
const LAW_TRANSFER = [
  '소득세법 §89①3 · 시행령 §154① (1세대1주택 비과세 — 보유·거주)',
  '소득세법 시행령 §155①·②·⑦·⑧ (일시적 2주택·상속·농어촌·부득이한 사유 특례)',
  '조세특례제한법 §99의4 (농어촌주택·고향주택) · §71의2 (인구감소지역 주택) · §98의9 (비수도권 준공 후 미분양)',
  '소득세법 §104⑦ · 시행령 §167의3①8의2 (중과 주택수 — 비수도권 기준시가 3억 이하 제외)',
  '소득세법 §95② (고가주택 12억 초과분 과세)',
];

function judgeTransfer(input) {
  const { metro, local, sellFirst = 'metro', saleDate, salePrice = 0 } = input;
  const rg = REGION[local.region] ?? REGION.province;
  const reasons = [];
  const paths = [];
  const add = (key, law, title, list, extra = {}) => paths.push({ key, law, title, ok: list.every((c) => c.ok), checklist: list, ...extra });

  // ── 지방주택을 먼저 양도하는 경우: 특례는 일시적 2주택(지방=종전)만 검토 ──
  if (sellFirst === 'local') {
    const gapOk = !!(local.acquireDate && metro.acquireDate) && meetsYears(local.acquireDate, metro.acquireDate, 1);
    const dispOk = !!metro.acquireDate && withinYears(metro.acquireDate, saleDate, TEMP_TWO_DISPOSE_YEARS);
    add('temp', '시행령 §155①', '일시적 2주택 (지방주택 = 종전주택, 수도권 주택 = 신규주택)', [
      { key: 'gap', label: '지방주택(종전) 취득 1년 후 수도권 주택(신규) 취득', ok: gapOk, detail: local.acquireDate && metro.acquireDate ? `${fy(local.acquireDate, metro.acquireDate)} 경과` : '취득일 미입력' },
      { key: 'dispose', label: `수도권 주택 취득 ${TEMP_TWO_DISPOSE_YEARS}년 이내 지방주택 양도`, ok: dispOk, detail: metro.acquireDate ? `신규취득 ${metro.acquireDate} → 양도 ${saleDate} (${fy(metro.acquireDate, saleDate)})` : '취득일 미입력' },
    ]);
    reasons.push('지방주택(특례주택)을 먼저 양도하면 농어촌·세컨드홈·부득이한 사유 등 특례는 적용되지 않습니다 — 이들 특례는 「일반주택(수도권 주택)」을 양도할 때만 1세대1주택으로 봅니다.');
    const b = base154(local, saleDate, salePrice);
    const applied = paths.find((p) => p.ok) || null;
    const heavy = judgeHeavy(local, metro, !!local.adjustNow, rg, true, saleDate);
    return finish('local', paths, applied, b, heavy, reasons);
  }

  // ── 수도권 일반주택을 먼저 양도 ──
  const sp = specialHouseChecks(metro, local);

  // ① 일시적 2주택 §155①
  {
    const gapOk = sp.orderOk && meetsYears(metro.acquireDate, local.acquireDate, 1);
    const dispOk = !!local.acquireDate && withinYears(local.acquireDate, saleDate, TEMP_TWO_DISPOSE_YEARS);
    add('temp', '시행령 §155①', '일시적 2주택 (수도권 주택 = 종전주택, 지방주택 = 신규주택)', [
      { key: 'gap', label: '종전(수도권) 취득 1년 후 신규(지방) 취득', ok: gapOk, detail: metro.acquireDate && local.acquireDate ? `${fy(metro.acquireDate, local.acquireDate)} 경과` : '취득일 미입력' },
      { key: 'dispose', label: `신규(지방) 취득 ${TEMP_TWO_DISPOSE_YEARS}년 이내 종전(수도권) 양도`, ok: dispOk, detail: local.acquireDate ? `신규취득 ${local.acquireDate} → 양도 ${saleDate} (${fy(local.acquireDate, saleDate)})` : '취득일 미입력' },
    ]);
  }

  // ② 상속주택 §155② (일반 지역 상속) / ③ 농어촌주택 §155⑦ (읍·면 상속·이농·귀농)
  if (local.how === 'inherit') {
    add('inherit', '시행령 §155②', '상속주택 + 일반주택 (상속개시 당시 보유하던 일반주택 양도)', [
      { key: 'order', label: '상속개시 당시 이미 보유하던 일반주택(수도권) 양도', ok: sp.orderOk, detail: sp.orderOk ? `수도권 주택 ${metro.acquireDate} 취득 → 상속개시 ${local.acquireDate}` : '상속 후 취득한 일반주택은 특례 제외 (2013.2.15 이후 취득분)' },
      { key: 'one', label: '상속주택 1채 (공동상속은 최다지분자 등 우선순위)', ok: true, detail: '입력 전제' },
    ]);
  }
  if (['inherit', 'leaveFarm', 'returnFarm'].includes(local.how)) {
    const list = [
      { key: 'region', label: '수도권 밖 읍(도시지역 밖)·면 지역 소재', ok: !rg.metroArea && !!local.eupMyeon, detail: `${rg.label} · ${local.eupMyeon ? '읍·면 지역' : '동 지역 또는 도시지역 안 읍'}` },
    ];
    if (local.how === 'inherit') {
      list.push({ key: 'live', label: `피상속인이 취득 후 ${RURAL155_LIVE_YEARS}년 이상 거주`, ok: (local.otherLiveYears ?? 0) >= RURAL155_LIVE_YEARS, detail: `${local.otherLiveYears ?? 0}년` });
    } else if (local.how === 'leaveFarm') {
      list.push({ key: 'live', label: `이농인이 취득 후 ${RURAL155_LIVE_YEARS}년 이상 거주 후 이농`, ok: (local.otherLiveYears ?? 0) >= RURAL155_LIVE_YEARS, detail: `${local.otherLiveYears ?? 0}년` });
    } else {
      list.push({ key: 'farmland', label: `농지 ${RURAL155_FARMLAND_M2.toLocaleString()}㎡ 이상 소유 (대지 660㎡ 이내)`, ok: (local.farmlandM2 ?? 0) >= RURAL155_FARMLAND_M2, detail: `${(local.farmlandM2 ?? 0).toLocaleString()}㎡` });
      const farmOk = (local.farmYears ?? 0) >= RURAL155_FARM_YEARS;
      list.push({ key: 'farm', label: `취득 후 ${RURAL155_FARM_YEARS}년 이상 영농·영어 (미달 시 사후관리·추징)`, ok: farmOk, warn: !farmOk && (local.farmYears ?? 0) > 0, detail: `${local.farmYears ?? 0}년${farmOk ? '' : ' — 양도 후 계속 영농으로 3년 충족 시 인정, 미충족 시 추징'}` });
      list.push({ key: 'within5', label: `귀농주택 취득일부터 ${RURAL155_RETURN_SALE_YEARS}년 이내 일반주택 양도`, ok: !!local.acquireDate && withinYears(local.acquireDate, saleDate, RURAL155_RETURN_SALE_YEARS), detail: local.acquireDate ? `${fy(local.acquireDate, saleDate)} 경과` : '취득일 미입력' });
    }
    const name = { inherit: '상속 농어촌주택', leaveFarm: '이농주택', returnFarm: '귀농주택' }[local.how];
    add('rural155', '시행령 §155⑦', `농어촌주택(${name}) + 일반주택`, list);
  }

  // ④ 부득이한 사유 §155⑧
  if (local.how === 'unavoidable') {
    const ended = !!local.reasonEndDate;
    const okDeadline = !ended || withinYears(local.reasonEndDate, saleDate, UNAVOIDABLE_SALE_YEARS);
    add('unavoidable', '시행령 §155⑧', '취학·근무·질병 등 부득이한 사유로 취득한 수도권 밖 주택 + 일반주택', [
      { key: 'region', label: '수도권 밖 소재', ok: !rg.metroArea, detail: rg.label },
      { key: 'reason', label: '취학·근무상 형편·질병 요양 등 부득이한 사유로 취득 (1년 이상 거주 필요)', ok: true, detail: '입력 전제 — 재직증명·재학증명·진단서 등으로 입증' },
      { key: 'deadline', label: `사유 해소일부터 ${UNAVOIDABLE_SALE_YEARS}년 이내 일반주택 양도`, ok: okDeadline, detail: ended ? `해소 ${local.reasonEndDate} → 양도 ${saleDate} (${fy(local.reasonEndDate, saleDate)})` : '사유 지속 중 → 기한 제한 없음' },
    ]);
  }

  // ⑤ 조특법 §99의4 농어촌주택·고향주택 (취득 경위 무관 — 단, 일반주택 먼저 보유)
  {
    const isHome = local.how === 'hometown';
    const start = isHome ? RURAL99_HOMETOWN_START : RURAL99_START;
    const periodOk = !!local.acquireDate && between(local.acquireDate, start, RURAL99_END);
    const areaOk = !rg.metroArea && (isHome ? !!local.smallCity : !!local.eupMyeon);
    const limit = local.hanok ? RURAL99_PRICE_HANOK : RURAL99_PRICE;
    const priceOk = (local.acquirePrice ?? 0) > 0 && local.acquirePrice <= limit;
    const heldYears = local.acquireDate ? yearsBetween(local.acquireDate, saleDate) : 0;
    const holdOk = local.acquireDate ? meetsYears(local.acquireDate, saleDate, RURAL99_HOLD_YEARS) : false;
    add('rural99', '조특법 §99의4', isHome ? '고향주택 취득자 과세특례' : '농어촌주택 취득자 과세특례', [
      { key: 'period', label: `취득기간 ${start} ~ ${RURAL99_END}`, ok: periodOk, detail: `취득 ${local.acquireDate || '미입력'}` },
      { key: 'region', label: isHome ? '수도권 밖 인구 20만 이하 시 (10년 이상 거주한 고향)' : '수도권 밖 읍·면 지역 (인구 20만 이하 시의 동 포함)', ok: areaOk, detail: `${rg.label} · ${isHome ? (local.smallCity ? '인구 20만 이하 시' : '인구 20만 초과 시') : (local.eupMyeon ? '읍·면' : '동 지역')}` },
      { key: 'excluded', label: '제외지역 아님 (도시지역·토지거래허가구역·조정대상지역·관광단지)', ok: !local.excludedArea, detail: local.excludedArea ? '제외지역 해당' : '해당 없음' },
      { key: 'price', label: `취득 당시 기준시가(주택+부수토지) ${eok(limit)} 이하${local.hanok ? ' (한옥)' : ''}`, ok: priceOk, detail: won(local.acquirePrice ?? 0) },
      { key: 'order', label: '일반주택(수도권) 보유 중에 취득한 농어촌·고향주택', ok: sp.orderOk, detail: sp.orderOk ? `수도권 ${metro.acquireDate} → 지방 ${local.acquireDate}` : '농어촌주택을 먼저 취득 → 특례 제외' },
      { key: 'adjacent', label: '일반주택과 같은·연접 읍·면 아님', ok: !local.adjacentEupMyeon, detail: local.adjacentEupMyeon ? '같은·연접 읍면 → 제외' : '해당 없음' },
      { key: 'hold', label: `${RURAL99_HOLD_YEARS}년 이상 보유 (미달 시 양도 후 계속 보유해 충족, 미충족 시 추징)`, ok: holdOk || (local.acquireDate != null && periodOk), warn: !holdOk, detail: `${heldYears.toFixed(1)}년 보유${holdOk ? '' : ' — 양도 시점 3년 미달이면 사후 보유 3년 충족 조건부 적용'}` },
    ]);
  }

  // ⑥ 조특법 §71의2 세컨드홈
  add('secondHome', '조특법 §71의2', '인구감소지역 주택(세컨드홈) 취득자 과세특례', sp.secondHome);

  // ⑦ 조특법 §98의9 준공 후 미분양
  if (local.how === 'unsold') add('unsold', '조특법 §98의9', '비수도권 준공 후 미분양주택 취득자 과세특례', sp.unsold);

  const applied = paths.find((p) => p.ok) || null;
  const b = base154(metro, saleDate, salePrice);
  const heavy = judgeHeavy(metro, local, !!metro.adjustNow, rg, false, saleDate);

  const r99 = paths.find((p) => p.key === 'rural99');
  if (r99?.ok && r99.checklist.find((c) => c.key === 'hold')?.warn) {
    reasons.push('조특법 §99의4는 농어촌주택을 3년 이상 보유해야 합니다. 양도 시점에 3년 미달이면 일단 특례를 적용하되, 이후 3년을 채우지 못하면 양도세를 추징합니다.');
  }
  if (local.depop !== 'none' && applied?.key !== 'secondHome') {
    reasons.push('세컨드홈 특례(§71의2)는 「주택·입주권·분양권 1개 보유자」가 인구감소지역 주택 1채를 취득한 경우에만 적용되며, 2주택 이상자가 취득하면 적용되지 않습니다.');
  }
  reasons.push('2026.8.3 세제개편안(정부안): 세컨드홈 특례를 광역시 제외 비수도권 전체의 공시가격 4억 이하 주택으로 확대하고 취득기한을 2029.12.31로 연장, 다주택자도 해당 주택을 종부세 주택수·양도세 중과 주택수에서 제외 예정. 준공 후 미분양 특례는 2027.12.31·취득가액 7억으로 완화 예정 — 국회 통과 전이므로 본 판정에는 미반영.');
  return finish('metro', paths, applied, b, heavy, reasons);
}

/** 양도 대상 주택이 조정대상지역일 때 다주택 중과 여부 — 다른 주택이 중과 주택수에 포함되는지 */
function judgeHeavy(target, other, targetAdjust, otherRegion, otherIsMetro, saleDate) {
  // otherIsMetro: 다른 주택이 수도권 주택(항상 주택수 포함)
  let otherCounted = true;
  let why;
  if (otherIsMetro) {
    why = '수도권 주택 → 중과 주택수 포함';
  } else if (other.how === 'inherit' && other.acquireDate && !meetsYears(other.acquireDate, saleDate, 5)) {
    otherCounted = false; why = '상속개시 5년 이내 상속주택 → 중과 주택수 제외 (시행령 §167의3①7)';
  } else if (!otherRegion.metroArea && !otherRegion.metroCity && !otherRegion.sejongDong && (other.gongsi ?? 0) <= RURAL_TRANSFER_EXCLUDE) {
    otherCounted = false; why = `수도권·광역시·특별자치시 외 지역 + 기준시가 ${eok(RURAL_TRANSFER_EXCLUDE)} 이하 → 중과 주택수 제외 (시행령 §167의3①8의2)`;
  } else {
    why = (other.gongsi ?? 0) > RURAL_TRANSFER_EXCLUDE ? `기준시가 ${won(other.gongsi ?? 0)} > ${eok(RURAL_TRANSFER_EXCLUDE)} → 중과 주택수 포함` : `${otherRegion.label} → 3억 이하 제외 대상 지역 아님, 중과 주택수 포함`;
  }
  const houseCount = 1 + (otherCounted ? 1 : 0);
  let isHeavy = false, label;
  if (!targetAdjust) label = '양도주택이 비조정지역 → 다주택 중과 없음 (기본세율 + 장기보유특별공제)';
  else if (houseCount >= 2) { isHeavy = true; label = '조정대상지역 2주택 → 기본세율 +20%p 중과, 장기보유특별공제 배제 (2026.5.10 부활)'; }
  else label = '조정대상지역이나 중과 주택수 1주택 → 중과 없음';
  return { otherCounted, houseCount, isHeavy, label, why };
}

function finish(sold, paths, applied, b, heavy, reasons) {
  let verdict, headline;
  if (!applied) { verdict = 'taxable'; headline = '1세대1주택 비과세 불가 — 적용 가능한 특례 없음 (2주택 과세)'; }
  else if (!b.ok) { verdict = 'taxable'; headline = `${applied.law} 특례 해당이나 §154① 보유·거주요건 미충족 → 과세`; }
  else if (b.isHigh) { verdict = 'partial'; headline = `${applied.law} 1세대1주택 특례 — ${eok(b.threshold)} 이하 비과세 · 초과분 과세`; }
  else { verdict = 'exempt'; headline = `${applied.law} 1세대1주택 특례 — 비과세`; }
  if (verdict === 'taxable' && !applied) {
    reasons.unshift(heavy.otherCounted
      ? '비과세 특례가 없으므로 2주택 상태의 양도로 과세됩니다.'
      : '비과세는 불가하지만, 지방주택이 중과 주택수에서 제외되어 「중과」는 적용되지 않습니다 — 중과 제외(§167의3)와 비과세 주택수(§154)는 별개입니다.');
  }
  return {
    sold, verdict, headline, applied: applied ? { key: applied.key, law: applied.law, title: applied.title } : null,
    paths, base: b.list, threshold: b.threshold, isHigh: b.isHigh, heavy, reasons, lawRef: LAW_TRANSFER,
  };
}

// ── 종합부동산세 ───────────────────────────────────────────────
const LAW_JONGBU = [
  '종합부동산세법 §8④·⑤ (1세대1주택자 판단 시 주택수 산정 제외 — 일시적 2주택·상속·지방 저가주택, 9.16~9.30 신청)',
  '종합부동산세법 시행령 §4의2 (지방 저가주택 요건 — 공시가격 4억·인구감소지역 9억, 수도권·광역시 제외)',
  '조세특례제한법 §71의2 (인구감소지역 주택) · §98의9 (비수도권 준공 후 미분양)',
  '종합부동산세법 §8① (기본공제 1세대1주택 12억·기타 9억) · §9⑦~⑨ (연령·보유 세액공제 — 1주택분 산출세액에 한정)',
  '대법원 2025두33779 (지방 저가주택 특례 — 1주택과 특례주택 모두 동일인 단독 소유 요건)',
];

function judgeJongbu(input) {
  const { metro, local, taxYear = 2026, age = 0, soleOwner = true } = input;
  const taxDate = `${taxYear}-06-01`;
  const rg = REGION[local.region] ?? REGION.province;
  const sp = specialHouseChecks(metro, local);
  const paths = [];
  const add = (key, law, title, list) => paths.push({ key, law, title, ok: list.every((c) => c.ok), checklist: list });

  // ① §8④1 일시적 2주택 — 나중에 취득한 주택이 신규주택
  {
    const newer = sp.orderOk ? local : metro;
    const newerName = sp.orderOk ? '지방주택' : '수도권 주택';
    const ok = !!newer.acquireDate && withinYears(newer.acquireDate, taxDate, JONGBU_TEMP_YEARS);
    add('temp', '§8④1', '일시적 2주택 (신규주택 취득일부터 3년)', [
      { key: 'temp', label: `과세기준일(${taxDate}) 현재 신규주택(${newerName}) 취득 ${JONGBU_TEMP_YEARS}년 미경과`, ok, detail: newer.acquireDate ? `취득 ${newer.acquireDate} → ${fy(newer.acquireDate, taxDate)}` : '취득일 미입력' },
      { key: 'intent', label: '종전주택을 양도할 의사로 대체취득 (신규 취득 3년 내 종전 양도 — 미양도 시 특례 추징)', ok: true, detail: '입력 전제' },
    ]);
  }
  // ② §8④2 상속주택
  if (local.how === 'inherit') {
    const share = Math.min(Math.max(local.inheritShare ?? 1, 0), 1);
    const within5 = !!local.acquireDate && withinYears(local.acquireDate, taxDate, JONGBU_INHERIT_YEARS);
    const shareOk = share <= JONGBU_INHERIT_SHARE;
    const priceLimit = rg.metroArea ? JONGBU_INHERIT_PRICE_METRO : JONGBU_INHERIT_PRICE_LOCAL;
    const priceOk = (local.gongsi ?? 0) * share <= priceLimit;
    add('inherit', '§8④2', '상속주택 (5년 이내 / 지분 40% 이하 / 지분 공시가격 소액)', [
      { key: 'any', label: '상속개시 5년 이내 · 지분 40% 이하 · 지분 공시가격 수도권 6억/비수도권 3억 이하 중 하나', ok: within5 || shareOk || priceOk, detail: `상속개시 ${local.acquireDate || '미입력'} (${within5 ? '5년 이내' : '5년 경과'}) · 지분 ${(share * 100).toFixed(0)}% · 지분 공시가격 ${won((local.gongsi ?? 0) * share)} (기준 ${eok(priceLimit)})` },
    ]);
  }
  // ③ §8④3 지방 저가주택
  {
    const isDepop = local.depop === 'depop' && !rg.metroArea;
    const limit = isDepop ? JONGBU_LOWPRICE_DEPOP : JONGBU_LOWPRICE;
    const regionOk = !rg.metroArea && !rg.metroCity && !rg.sejongDong;
    add('lowPrice', '§8④3', `지방 저가주택 (공시가격 ${eok(limit)} 이하)`, [
      { key: 'region', label: '수도권·광역시(군 제외)·특별자치시 동 지역 외 소재', ok: regionOk, detail: rg.label + (regionOk ? ' → 가능' : ' → 제외 지역') + (rg.sejongDong ? ' (세종 동 지역: 종전 조문상 제외 — 최신 조문 확인)' : '') },
      { key: 'gongsi', label: `과세기준일 공시가격 ${eok(limit)} 이하${isDepop ? ' (수도권 밖 인구감소지역)' : ''}`, ok: (local.gongsi ?? 0) > 0 && local.gongsi <= limit, detail: won(local.gongsi ?? 0) },
      { key: 'acq', label: `취득일 현재 가액(기준시가) ${eok(limit)} 이하`, ok: (local.acquirePrice ?? 0) <= limit, detail: won(local.acquirePrice ?? 0) },
      { key: 'one', label: '지방 저가주택 1채 (2채 이상은 특례 불가)', ok: true, detail: '입력 전제' },
    ]);
  }
  // ④ 조특법 §71의2 세컨드홈 (종부세: 과세기준일 공시가격도 기준 이내)
  {
    const limit = secondHomePriceLimit(local.acquireDate, local.depop);
    const list = sp.secondHome.map((c) => ({ ...c }));
    list.push({ key: 'gongsi', label: `과세기준일 공시가격 ${limit ? eok(limit) : '기준'} 이하`, ok: limit != null && (local.gongsi ?? 0) > 0 && local.gongsi <= limit, detail: won(local.gongsi ?? 0) });
    add('secondHome', '조특법 §71의2', '인구감소지역 주택(세컨드홈) — 종부세 1세대1주택자 의제', list);
  }
  // ⑤ 조특법 §98의9 준공 후 미분양
  if (local.how === 'unsold') add('unsold', '조특법 §98의9', '비수도권 준공 후 미분양주택 — 종부세 1세대1주택자 의제', sp.unsold);

  const applied = paths.find((p) => p.ok) || null;
  const common = [
    { key: 'sole', label: '두 주택 모두 같은 세대원 1인의 단독 소유 (세대원 중 1명만 주택 소유)', ok: !!soleOwner, detail: soleOwner ? '단독 소유' : '공동명의·세대원 분산 소유 → 1세대1주택자 특례 불가 (대법원 2025두33779)' },
    { key: 'apply', label: `${taxYear}.9.16 ~ 9.30 관할 세무서에 「주택수 산정 제외 특례」 신청`, ok: true, warn: true, detail: '신청하지 않으면 다주택 방식(9억 공제·세액공제 없음)으로 고지 — 홈택스 신청 가능' },
  ];
  const specialOk = !!applied && !!soleOwner;

  // 세액 비교 — 재산세는 물건별(다주택 기준 표준세율)로 계산해 합산
  const gM = metro.gongsi ?? 0, gL = local.gongsi ?? 0, total = gM + gL;
  const ptM = calcPropertyTax('다주택', gM).propertyTax;
  const ptL = calcPropertyTax('다주택', gL).propertyTax;
  const pt = ptM + ptL;
  const period = metro.acquireDate ? Math.floor(yearsBetween(metro.acquireDate, taxDate)) : 0;
  const ratio = total > 0 ? gM / total : 0;

  const multi = calcAggrTax('다주택', '비조정지역', total, 0, 0, pt);
  const single = calcAggrTax('1세대1주택', '비조정지역', total, period, age, pt);
  // 세액공제는 1주택분(수도권 주택 비율)에만 적용 → 공제액을 비율로 축소해 재산정
  const sb = single.breakdown;
  const afterPt = Math.max(sb.aggrTaxBeforeDc - sb.propertyTaxDc, 0);
  const creditFull = afterPt * sb.combinedDc;
  const credit = creditFull * ratio;
  const aggrSpecial = Math.floor(afterPt - credit);
  const special = { aggrTax: aggrSpecial, ruralTax: Math.floor((afterPt - credit) * 0.2), total: aggrSpecial + Math.floor((afterPt - credit) * 0.2), breakdown: { ...sb, creditFull, credit, ratio, afterPt } };

  const chosen = specialOk ? special : multi;
  let headline;
  if (specialOk) headline = `${applied.law} 1세대1주택자 특례 — 기본공제 12억 + 세액공제(1주택분) → 종부세 ${won(chosen.total)}`;
  else headline = `1세대1주택자 특례 불가 — 다주택 방식 (기본공제 9억·세액공제 없음) → 종부세 ${won(chosen.total)}`;

  const reasons = [];
  reasons.push('특례를 적용받아도 특례주택(지방주택) 공시가격은 과세표준에 합산됩니다 — 주택수에서만 빠질 뿐 과표 합산 배제가 아닙니다.');
  reasons.push(`세액공제(연령 ${(sb.ageDc * 100).toFixed(0)}% + 보유 ${(sb.prdDc * 100).toFixed(0)}% = ${(sb.combinedDc * 100).toFixed(0)}%, 한도 80%)는 산출세액 중 수도권 주택 비율(공시가격 ${(ratio * 100).toFixed(1)}%)에 해당하는 부분에만 적용됩니다.`);
  reasons.push('재산세 공제액 계산용 재산세는 두 주택을 다주택 표준세율(공정시장가액비율 60%)로 계산했습니다. 1세대1주택 재산세 특례세율(공시 9억 이하)은 재산세법상 1주택자에게만 적용되어 여기서는 반영하지 않았습니다.');
  reasons.push('2026.8.3 세제개편안(정부안, 2027년분~): 1주택 기본공제 실거주 14억/비거주 9억, 공정시장가액비율 70%, 세액공제 한도 800만 — 확정 시 「보유세 계산기」의 개편안 모드로 재계산하세요.');

  return {
    verdict: specialOk ? 'exempt' : 'taxable', headline, applied: applied ? { key: applied.key, law: applied.law, title: applied.title } : null,
    paths, common, taxDate, ratio, period, age,
    compare: { special, multi, propertyTax: { metro: ptM, local: ptL, total: pt }, gongsi: { metro: gM, local: gL, total }, saving: multi.total - special.total },
    reasons, lawRef: LAW_JONGBU,
  };
}

/**
 * 지방주택 + 수도권 주택 1세대1주택 통합 판정
 * @param {object} input {
 *   sellFirst: 'metro'|'local', saleDate, salePrice, taxYear, age, soleOwner,
 *   metro: { acquireDate, acquiredInAdjust, adjustNow, liveYears, gongsi },
 *   local: { region, eupMyeon, depop, smallCity, hanok, excludedArea, sameSgg, adjacentEupMyeon,
 *            acquireDate, acquirePrice, gongsi, how, otherLiveYears, farmlandM2, farmYears,
 *            reasonEndDate, area, acqAmount, inheritShare, acquiredInAdjust, adjustNow, liveYears } }
 */
export function judgeLocalHouse(input) {
  const metro = { ...input.metro };
  const local = { region: 'province', depop: 'none', how: 'buy', ...input.local };
  const saleDate = input.saleDate || iso(new Date());
  const full = { ...input, metro, local, saleDate };
  return {
    mode: 'local-house',
    transfer: judgeTransfer(full),
    jongbu: judgeJongbu(full),
  };
}

export { won, eok };
