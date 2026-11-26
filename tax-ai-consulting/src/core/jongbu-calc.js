/**
 * 종합부동산세 계산기 엔진 (주택 목록형) — 개인 · 2026년 귀속
 *
 * 대한세무법인 홈페이지 종부세 계산기(daehantax-com: assets/js/jongbu-calc.js, jongbu-regions.js)의
 * 계산 흐름(단독명의 / 부부 공동명의 특례 비교 / 다주택 · 합산배제 · 특례주택)을 옮기고,
 * 아래 두 가지를 국세청 「2026 주택과 세금」 기준으로 정밀화했다.
 *
 *   1) 공제할 재산세액 (책 114쪽, 종부령 §4의3)
 *        = 재산세 부과세액 × (종부세 과세표준 × 재산세 공정시장가액비율 × 재산세 표준세율 0.4%)
 *                          ÷ (주택을 합산하여 재산세 표준세율로 계산한 재산세 상당액)
 *      — 홈페이지 간이식(과세표준 × 60% × 0.4%)은 주택이 여러 채일 때 공제액이 실제보다 크게 나온다.
 *   2) 세부담상한 (책 115쪽, 종부세법 §10): 전년도 보유세 상당액을 넣으면 150% 한도를 적용한다.
 *
 * 기존 calcAggrTax(comprehensive-tax.js)는 시나리오·개편안 비교가 쓰므로 그대로 둔다.
 * 1세대 1주택 단독명의는 두 엔진의 결과가 같다(테스트로 고정).
 *
 * 미반영: 법인, 재산세 감면·과세표준상한, 준공 후 미분양·소형 신축주택 특례, 2027년 이후 개편안.
 */

import { calcPropertyTax } from './property-tax.js';
import { classifyArea, depopAt, jongbuLowPriceRegion, DEPOP_REDESIGNATED } from './regions-data.js';
import {
  JONGBU_LOWPRICE, JONGBU_LOWPRICE_DEPOP, JONGBU_INHERIT_YEARS, JONGBU_INHERIT_SHARE,
  JONGBU_INHERIT_PRICE_METRO, JONGBU_INHERIT_PRICE_LOCAL, SECOND_HOME_START, SECOND_HOME_END,
} from './local-house-judge.js';

const EOK = 100_000_000;

export const JONGBU_RULES = {
  year: 2026,
  fairRatio: 0.60,              // 종부세 공정시장가액비율 (책 108쪽)
  deductGeneral: 9 * EOK,       // 기본공제(개인)
  deductOneHouse: 12 * EOK,     // 기본공제(1세대 1주택자)
  propTopRate: 0.004,           // 재산세 표준세율 최고구간 — 공제할 재산세액 분자
  ruralRate: 0.20,              // 농어촌특별세 = 종부세 × 20% (책 116쪽)
  creditCap: 0.80,              // 고령자 + 장기보유 공제 합계 한도 (책 115쪽)
  capRate: 1.5,                 // 세부담상한 150%
  // [과세표준 상한, 세율] — 2주택 이하 (책 110쪽)
  brackets2: [[3 * EOK, 0.005], [6 * EOK, 0.007], [12 * EOK, 0.010], [25 * EOK, 0.013],
    [50 * EOK, 0.015], [94 * EOK, 0.020], [Infinity, 0.027]],
  // 3주택 이상 — 과세표준 12억 초과분부터 중과
  brackets3: [[3 * EOK, 0.005], [6 * EOK, 0.007], [12 * EOK, 0.010], [25 * EOK, 0.020],
    [50 * EOK, 0.030], [94 * EOK, 0.040], [Infinity, 0.050]],
  // 1세대 1주택자 특례 신청기간 (종부세법 §8⑤ — 해당 연도 9.16~9.30)
  applyFrom: '9월 16일', applyTo: '9월 30일',
  interestAreaFrom: '2026-01-01',   // 인구감소관심지역 주택은 2026.1.1 이후 취득분 (책 112쪽)
};

const LAW_REF = [
  '종합부동산세법 §7(납세의무자 — 인별 과세)',
  '종합부동산세법 §8(과세표준 · 1세대 1주택자 · 합산배제)',
  '종합부동산세법 §8④(1세대 1주택자로 보는 경우 — 1호 다른 주택의 부속토지 · 2호 일시적 2주택 · 3호 상속주택 · 4호 지방 저가주택)',
  '종합부동산세법 §8⑤(§8④ 2~4호는 해당 연도 9.16~9.30 관할세무서장에게 신청)',
  '종합부동산세법 시행령 §4의2③(지방 저가주택 — 공시가격 4억 이하 · 지역 요건 가~라목) · 시행규칙(라목: 경기 가평군·연천군, 인천 강화군·옹진군)',
  '종합부동산세법 §9(세율 · 세액공제 · 공제할 재산세액)',
  '종합부동산세법 §10(세부담의 상한 150%)',
  '종합부동산세법 §10의2(공동명의 1주택자 특례)',
  '종합부동산세법 시행령 §4의3(공제할 재산세액 · 세율 적용 주택 수)',
  '농어촌특별세법 §5(종부세분 20%)',
];

/** 누진세율 계산 — 구간별 초과분에 세율을 곱해 더한다 */
export function progressive(base, brackets) {
  let tax = 0, prev = 0;
  for (const [cap, rate] of brackets) {
    if (base <= prev) break;
    tax += (Math.min(base, cap) - prev) * rate;
    prev = cap;
  }
  return tax;
}

/** 재산세 표준세율 세액 (지방세법 §111) — 공제할 재산세액의 분모 */
export function standardPropertyTax(taxBase) {
  if (taxBase <= 60_000_000) return taxBase * 0.001;
  if (taxBase <= 150_000_000) return 60_000 + (taxBase - 60_000_000) * 0.0015;
  if (taxBase <= 300_000_000) return 195_000 + (taxBase - 150_000_000) * 0.0025;
  return 570_000 + (taxBase - 300_000_000) * 0.004;
}

/** 재산세 공정시장가액비율 — 1세대 1주택 43·44·45%, 그 외 60% */
function propRatio(fullPrice, oneHouse) {
  if (!oneHouse) return 0.6;
  if (fullPrice <= 300_000_000) return 0.43;
  if (fullPrice <= 600_000_000) return 0.44;
  return 0.45;
}

export function ageRate(age) { return age >= 70 ? 0.4 : age >= 65 ? 0.3 : age >= 60 ? 0.2 : 0; }
export function holdRate(years) { return years >= 15 ? 0.5 : years >= 10 ? 0.4 : years >= 5 ? 0.2 : 0; }

/**
 * 한 사람(납세의무자 1명)의 주택분 종부세
 *
 * @param {object} o
 * @param {Array<{label?:string, full:number, share?:number, oneHouse?:boolean}>} o.items
 *        과세 대상 주택. full=주택 전체 공시가격, share=이 사람 지분(0~1),
 *        oneHouse=재산세에서 1세대 1주택 공정시장가액비율(43~45%)을 적용받는 주택
 * @param {number} o.deduct 기본공제 (9억 | 12억)
 * @param {boolean} [o.three=false] 3주택 이상 세율표 적용
 * @param {number} [o.ageRate=0] @param {number} [o.holdRate=0] 1세대 1주택자 세액공제율
 * @param {number} [o.creditShare=1] 세액공제를 적용할 세액 비율 — 상속주택 등 특례로 1주택자가 된 경우
 *        그 추가 주택분 세액은 공제 대상이 아니다 (책 122쪽)
 * @param {number} [o.assessedPropertyTax] 실제 부과된 재산세 본세(이 사람 몫). 생략하면 공시가격으로 계산
 * @param {number} [o.prevYearTotal=0] 전년도 보유세 상당액(재산세 + 종부세). 0이면 세부담상한 미적용
 */
export function personTax(o) {
  const R = JONGBU_RULES;
  const items = (o.items || []).map((it) => {
    const share = it.share == null ? 1 : it.share;
    const ratio = propRatio(it.full, !!it.oneHouse);
    const fullTax = calcPropertyTax(it.oneHouse ? '1세대1주택' : '다주택', it.full).propertyTax;
    return { label: it.label || '주택', full: it.full, share, pub: Math.round(it.full * share), ratio, propTax: fullTax * share };
  });
  const pub = items.reduce((s, it) => s + it.pub, 0);
  const base = Math.max(0, pub - o.deduct) * R.fairRatio;
  const brackets = o.three ? R.brackets3 : R.brackets2;
  const gross = progressive(base, brackets);

  // 공제할 재산세액 (책 114쪽)
  const computedPropTax = items.reduce((s, it) => s + it.propTax, 0);
  const propTax = o.assessedPropertyTax > 0 ? o.assessedPropertyTax : computedPropTax;
  // 주택마다 재산세 공정시장가액비율이 다를 수 있어(1주택 45% + 그 외 60%) 공시가격 가중평균을 쓴다
  const ratio = pub > 0 ? items.reduce((s, it) => s + it.pub * it.ratio, 0) / pub : 0.6;
  const numerator = base * ratio * R.propTopRate;
  const denominator = standardPropertyTax(pub * ratio);
  let propCredit = denominator > 0 ? propTax * numerator / denominator : 0;
  propCredit = Math.min(propCredit, gross, propTax);
  propCredit = Math.floor(propCredit / 10) * 10;          // 10원 미만 절사 (책 사례 810,160원)

  const afterProp = gross - propCredit;
  const creditRate = Math.min(R.creditCap, (o.ageRate || 0) + (o.holdRate || 0));
  const creditShare = o.creditShare == null ? 1 : o.creditShare;
  const credit = afterProp * creditShare * creditRate;
  let final = afterProp - credit;

  // 세부담상한: (당해 재산세 + 종부세)가 전년도 상당액 × 150%를 넘으면 초과분을 종부세에서 뺀다
  const prevYearTotal = o.prevYearTotal || 0;
  let capLimit = 0, capReduction = 0;
  if (prevYearTotal > 0) {
    capLimit = prevYearTotal * R.capRate;
    const burden = propTax + final;
    if (burden > capLimit) { capReduction = Math.min(final, burden - capLimit); final -= capReduction; }
  }

  const jongbu = Math.floor(final);
  const rural = Math.floor(jongbu * R.ruralRate);
  return {
    items, pub, deduct: o.deduct, fairRatio: R.fairRatio, base, three: !!o.three,
    gross: Math.floor(gross),
    propTax: Math.round(propTax), propTaxEntered: o.assessedPropertyTax > 0,
    propRatio: ratio, propNumerator: numerator, propDenominator: denominator, propCredit,
    afterProp: Math.floor(afterProp),
    ageRate: o.ageRate || 0, holdRate: o.holdRate || 0, creditRate, creditShare, credit: Math.floor(credit),
    prevYearTotal, capLimit, capReduction: Math.floor(capReduction),
    jongbu, rural, total: jongbu + rural,
  };
}

// 과세표준에는 더하되 1세대 1주택자 판정의 주택 수에서는 빼는 집 (종부세법 §8④ 각 호)
const SPECIAL = new Set(['land', 'inherit', 'temp', 'rural']);
/** 집 종류별 근거 조문과 신청 필요 여부 (§8⑤: 2~4호만 신청 대상) */
export const SPECIAL_BASIS = {
  land: { clause: '§8④ 1호', name: '다른 주택의 부속토지', needApply: false },
  temp: { clause: '§8④ 2호', name: '일시적 2주택 (신규주택)', needApply: true },
  inherit: { clause: '§8④ 3호', name: '상속주택', needApply: true },
  rural: { clause: '§8④ 4호', name: '지방 저가주택', needApply: true },
};

/**
 * 종부세 계산 (소유 형태별)
 *
 * @param {object} inp
 * @param {'single'|'couple'|'multi'} inp.mode
 *        single = 1세대 1주택 단독명의 / couple = 부부 공동명의 1주택(+ 부부의 다른 집) / multi = 다른 집이 더 있음(본인 명의 기준)
 * @param {number} inp.price 이 집 전체 공시가격
 * @param {number} [inp.share] 이 집의 본인 지분 (couple 기본 0.5, multi 기본 1)
 * @param {Array<{label?, price, share?, owner?:'me'|'spouse', kind}>} [inp.houses] 다른 집
 *        kind = 'normal' 일반 / 'excl' 합산배제(과세 제외) /
 *               'land'·'inherit'·'temp'·'rural' 특례주택(과세표준에는 합산, 주택 수에서는 제외 — §8④ 1~4호)
 * @param {boolean} [inp.applied=true] §8⑤ 신청(9.16~9.30) 여부 — multi 에서 2~4호 특례주택이 있을 때만 의미가 있다.
 *        false 면 1세대 1주택자로 보지 않고 9억 공제 방식으로 계산한다(신청했을 때의 세액은 ifApplied 로 함께 돌려준다)
 * @param {number} [inp.age] 만 나이 @param {number} [inp.holdYears] 보유기간(년)
 * @param {number} [inp.assessedPropertyTax] 실제 부과된 재산세 본세 합계 (single·multi)
 * @param {number} [inp.prevYearTotal] 전년도 보유세 상당액 (single·multi)
 */
export function calcJongbu(inp) {
  const R = JONGBU_RULES;
  const aR = ageRate(inp.age || 0);
  const hR = holdRate(inp.holdYears || 0);
  const price = inp.price || 0;
  const houses = (inp.houses || []).map((h, i) => ({
    label: h.label || `다른 집 ${i + 1}`, price: h.price || 0, share: h.share == null ? 1 : h.share,
    owner: h.owner === 'spouse' ? 'spouse' : 'me', kind: h.kind || 'normal', basis: h.basis || '',
  }));
  const applied = inp.applied !== false;
  const extra = { assessedPropertyTax: inp.assessedPropertyTax, prevYearTotal: inp.prevYearTotal };
  const item = (h) => ({ label: h.label, full: h.price, share: h.share, oneHouse: false });

  if (inp.mode === 'single') {
    return {
      mode: 'single', lawRef: LAW_REF,
      main: personTax({ items: [{ label: '이 집', full: price, share: 1, oneHouse: true }], deduct: R.deductOneHouse, ageRate: aR, holdRate: hR, ...extra }),
    };
  }

  if (inp.mode === 'couple') {
    // 일반 주택이 하나라도 있으면 공동명의 특례 불가. 특례주택(상속·이사용 새집·지방 저가주택)은
    // 납세의무자가 가진 경우에만 특례가 유지되므로, 부부 양쪽에 나뉘어 있어도 불가.
    const share = inp.share == null ? 0.5 : inp.share;
    const own = { me: { items: [], counted: 1, sp: [] }, spouse: { items: [], counted: 1, sp: [] } };
    let anyNormal = false, excl = 0, specialN = 0;
    for (const h of houses) {
      if (h.kind === 'excl') { excl++; continue; }
      const o = own[h.owner];
      o.items.push(item(h));
      if (SPECIAL.has(h.kind)) { o.sp.push(h); specialN++; } else { o.counted++; anyNormal = true; }
    }
    // ① 각자 계산: 각자 9억 공제, 자기 명의 집을 모두 더한다
    const each = (who, sh) => personTax({
      items: [{ label: '이 집', full: price, share: sh, oneHouse: !anyNormal }, ...own[who].items],
      deduct: R.deductGeneral, three: own[who].counted >= 3,
    });
    const me = each('me', share);
    const spouse = each('spouse', 1 - share);
    const eachTotal = me.total + spouse.total;
    const split = own.me.sp.length > 0 && own.spouse.sp.length > 0;
    const res = {
      mode: 'couple', lawRef: LAW_REF, me, spouse, eachTotal, share,
      eligible: !anyNormal && !split, reason: anyNormal ? 'normal' : (split ? 'split' : ''),
      others: houses.length, excl, specialN, better: 'each', diff: 0,
    };
    if (!res.eligible) return res;
    // ② 공동명의 특례: 한 사람이 이 집 전체 + 본인 명의 특례주택을 합산, 12억 공제.
    //    고령·장기보유 공제는 이 집 몫의 세액에만 적용.
    const payer = own.spouse.sp.length > 0 ? 'spouse' : 'me';
    const spItems = own[payer].sp.map(item);
    const tPub = price + own[payer].sp.reduce((s, h) => s + Math.round(h.price * h.share), 0);
    const taxpayer = personTax({
      items: [{ label: '이 집', full: price, share: 1, oneHouse: true }, ...spItems],
      deduct: R.deductOneHouse, ageRate: aR, holdRate: hR, creditShare: tPub ? price / tPub : 1,
    });
    res.special = { taxpayer, total: taxpayer.total, creditRate: taxpayer.creditRate, payer };
    res.better = taxpayer.total < eachTotal ? 'special' : (taxpayer.total > eachTotal ? 'each' : 'same');
    res.diff = Math.abs(taxpayer.total - eachTotal);
    return res;
  }

  // ---- 다른 집이 더 있음 (본인 명의 기준) ----
  const mainShare = inp.share == null ? 1 : inp.share;
  const mainPub = Math.round(price * mainShare);
  const taxed = [];
  let excl = 0, exclPub = 0, special = 0, normalOthers = 0, needApplyN = 0;
  const rows = [];   // 1세대 1주택자 판정표 (§8④)
  for (const h of houses) {
    if (h.kind === 'excl') {
      excl++; exclPub += Math.round(h.price * h.share);                                    // 합산배제: 아예 빠진다
      rows.push({ label: h.label, kind: 'excl', clause: '§8② (합산배제)', name: '합산배제 주택', counts: false, needApply: false, note: '9.16~9.30 합산배제 신고분' });
      continue;
    }
    taxed.push(item(h));
    const sb = SPECIAL_BASIS[h.kind];
    if (sb) {
      special++;
      if (sb.needApply) needApplyN++;
      rows.push({ label: h.label, kind: h.kind, clause: h.basis || sb.clause, name: sb.name, counts: false, needApply: sb.needApply });
    } else {
      normalOthers++;
      rows.push({ label: h.label, kind: 'normal', clause: '—', name: '일반 주택', counts: true, needApply: false });
    }
  }
  // 구조상 1세대 1주택자가 될 수 있는가: 일반 주택이 이 집 하나뿐이고 나머지는 합산배제·특례주택
  const structureOk = normalOthers === 0 && (excl + special) > 0;
  // §8⑤: 2~4호 특례주택이 있으면 신청해야 1세대 1주택자로 본다
  const needApply = structureOk && needApplyN > 0;
  const notApplied = needApply && !applied;
  // 세율 적용 주택 수(시행령 §4의3③): 상속주택·부속토지는 언제나 제외, 신규주택·지방 저가주택은
  // 「1세대 1주택자로 보는 자」가 가진 경우에만 제외 → 1주택자로 인정되지 않으면 주택 수에 넣는다
  const oneHouseHolder = structureOk && !notApplied;
  let counted = 1;
  for (const h of houses) {
    if (h.kind === 'excl' || h.kind === 'inherit' || h.kind === 'land') continue;
    if ((h.kind === 'temp' || h.kind === 'rural') && oneHouseHolder) continue;
    counted++;
  }
  const three = counted >= 3;
  const normal = personTax({
    items: [{ label: '이 집', full: price, share: mainShare, oneHouse: false }, ...taxed],
    deduct: R.deductGeneral, three, ...extra,
  });
  const out = {
    mode: 'multi', lawRef: LAW_REF, total: 1 + houses.length, counted, excl, exclPub, special, three,
    main: normal, eligible: false,
    judge: {
      rows, structureOk, needApply, applied, notApplied, oneHouseHolder,
      reason: !structureOk
        ? (normalOthers > 0 ? '일반 주택이 더 있어 1세대 1주택자가 아닙니다.' : '다른 집이 없습니다.')
        : notApplied ? '요건은 갖췄지만 신청(9.16~9.30)을 하지 않아 1세대 1주택자로 보지 않습니다.'
          : needApply ? '요건을 갖췄고 신청했으므로 1세대 1주택자로 봅니다.'
            : '신청 없이 1세대 1주택자로 봅니다.',
    },
  };
  if (structureOk) {
    const pub = normal.pub;
    const oneHouse = personTax({
      items: [{ label: '이 집', full: price, share: mainShare, oneHouse: true }, ...taxed],
      deduct: R.deductOneHouse, ageRate: aR, holdRate: hR, creditShare: pub ? mainPub / pub : 1, ...extra,
    });
    if (notApplied) {
      // 신청하지 않음 → 9억 방식이 실제 세액. 신청했다면 얼마였을지 함께 보여 준다.
      out.ifApplied = oneHouse;
      out.diff = normal.total - oneHouse.total;
    } else {
      out.eligible = true;
      out.oneHouse = oneHouse;
      out.diff = normal.total - oneHouse.total;
    }
  }
  return out;
}

const eokText = (n) => {
  const e = Math.floor(n / EOK), m = Math.round((n % EOK) / 10000);
  return `${e ? `${e}억` : ''}${m ? `${e ? ' ' : ''}${m.toLocaleString('ko-KR')}만` : ''}원`;
};

/**
 * 다른 집 한 채의 입력 → 계산에 쓸 종류로 판정 (책 111·119쪽)
 *
 * @param {object} h
 * @param {'normal'|'excl'|'land'|'inherit'|'temp'|'local'} h.pick 사용자가 고른 집 종류
 * @param {string} [h.exclType] 합산배제 주택 종류 (pick='excl')
 * @param {string} [h.sido] @param {string} [h.name] 시·도, 시·군·구 (regions-data.js 표기: '경기', '가평군')
 * @param {boolean} [h.sejongRural] 세종시 읍·면 지역 여부
 * @param {number} h.price 주택 전체 공시가격 @param {number} [h.share=1] 지분
 * @param {boolean} [h.within5] 상속 후 5년 이내 (pick='inherit')
 * @param {string} [h.acquireDate] 취득일 YYYY-MM-DD (pick='local' — 인구감소지역 세컨드홈 판정)
 * @returns {{ kind:'normal'|'excl'|'land'|'inherit'|'temp'|'rural', ok:boolean, msg:string, basis?:string,
 *   checks?:Array<{label:string, ok:boolean|null, detail:string}> }}
 *   checks: 지방 주택(pick='local')의 요건별 점검표. ok=null 은 참고 정보(판정에 직접 쓰이지 않음)
 */
export function classifyJongbuHouse(h) {
  const share = h.share == null ? 1 : h.share;
  const mine = (h.price || 0) * share;
  const known = !!(h.sido && h.name);
  const area = known ? classifyArea(h.sido, h.name) : null;
  const where = area ? area.label : '';

  if (h.pick === 'excl') {
    if (!h.exclType) return { kind: 'normal', ok: false, msg: '합산배제 주택 종류를 고르지 않아 일반 주택으로 계산합니다.' };
    return { kind: 'excl', ok: true, msg: '합산배제 주택 — 종부세 계산에서 빠집니다. (9.16~9.30 합산배제 신고를 한 경우)' };
  }
  if (h.pick === 'land') {
    return { kind: 'land', ok: true, basis: '§8④ 1호', msg: '다른 주택의 부속토지(건물 소유자가 다른 땅) — 과세표준에는 더하고 주택 수에서는 뺍니다. 신청 없이 적용됩니다. (종부세법 §8④ 1호)' };
  }
  if (h.pick === 'temp') {
    return { kind: 'temp', ok: true, basis: '§8④ 2호', msg: '이사용 새집(일시적 2주택) — 과세표준에는 더하고 주택 수에서는 뺍니다. 취득 후 3년 이내여야 하고, 9.16~9.30 신청이 필요합니다. (§8④ 2호)' };
  }
  if (h.pick === 'inherit') {
    if (h.within5) return { kind: 'inherit', ok: true, basis: '§8④ 3호', msg: `상속주택 — 상속 후 ${JONGBU_INHERIT_YEARS}년 이내입니다.` };
    if (share <= JONGBU_INHERIT_SHARE) return { kind: 'inherit', ok: true, msg: '상속주택 — 지분이 40% 이하입니다. (기간 제한 없음)' };
    if (!known) return { kind: 'normal', ok: false, msg: '상속 5년이 지났고 지분이 40%를 넘습니다. 주소를 고르면 지분 공시가격 기준(수도권 6억·그 밖 3억)을 확인합니다. 지금은 일반 주택으로 계산합니다.' };
    const lim = area.capital ? JONGBU_INHERIT_PRICE_METRO : JONGBU_INHERIT_PRICE_LOCAL;
    if (mine <= lim) return { kind: 'inherit', ok: true, msg: `상속주택 — 지분 공시가격(${eokText(mine)})이 ${area.capital ? '수도권 6억' : '수도권 밖 3억'} 이하입니다. (기간 제한 없음)` };
    return { kind: 'normal', ok: false, msg: `상속 5년이 지났고 지분 40% 초과·지분 공시가격 한도(${eokText(lim)}) 초과라 상속주택 특례 대상이 아닙니다. 일반 주택으로 계산합니다.` };
  }
  if (h.pick === 'local') {
    if (!known) return { kind: 'normal', ok: false, msg: '주소(시·도, 시·군·구)를 고르면 인구감소지역·접경지역 여부를 확인해 자동으로 판정합니다. 지금은 일반 주택으로 계산합니다.' };
    // ── 종부세법 §8④ 4호 지방 저가주택 (시행령 §4의2③): ① 공시가격 4억 이하 ② 지역 요건 가~라목
    const rg = jongbuLowPriceRegion(area, !!h.sejongRural);
    const priceOk = h.price > 0 && h.price <= JONGBU_LOWPRICE;
    const d = h.acquireDate || '';
    const depopNow = area.depop;
    const depopThen = depopAt(area, d);             // 취득 당시 구분 (2026.10.7 재지정 반영)
    const depopLabel = depopNow === 'depop'
      ? `인구감소지역 ○${area.depopSince ? ` (${area.depopSince} 재지정으로 편입)` : ''}`
      : depopNow === 'interest' ? '인구감소지역 × (관심지역 — 지방 저가주택 판정과 무관)' : '인구감소지역 ×';
    const checks = [
      { label: '공시가격 4억원 이하 (시행령 §4의2③ 1호)', ok: priceOk, detail: `${eokText(h.price || 0)}` },
      { label: '소재지 요건 (시행령 §4의2③ 2호 가~라목)', ok: rg.ok, detail: rg.label },
      { label: '인구감소지역 여부 (행안부 2026.10.7 고시 92곳)', ok: area.capital ? depopNow === 'depop' : null, detail: depopLabel + (area.capital ? '' : ' — 수도권 밖은 판정에 영향 없음') },
      { label: '접경지역 여부 (접경지역 지원 특별법 17개 시·군)', ok: area.capital ? area.border : null, detail: (area.border ? '접경지역 ○' : '접경지역 ×') + (area.capital ? '' : ' — 수도권 밖은 판정에 영향 없음') },
    ];
    if (area.capital && area.sido !== '서울') {
      checks.push({ label: '시행규칙이 정한 지역 (경기 가평군·연천군, 인천 강화군·옹진군)', ok: area.lowPriceCapital, detail: area.lowPriceCapital ? '해당' : '해당 없음' });
    }
    if (rg.ok && priceOk) {
      return { kind: 'rural', ok: true, basis: '§8④ 4호', checks, msg: `지방 저가주택 — ${where}, ${rg.item}목 지역, 공시가격 4억 이하입니다. 9.16~9.30 신청이 필요합니다. (§8④ 4호)` };
    }
    // ── 조특법 §71의2 인구감소(관심)지역 주택 — 지방 저가주택(4억)과는 별개 규정 (책 119쪽, 이미지 확인):
    //    1주택자가 2024.1.4~2026.12.31 취득, 가액은 비수도권 인구감소지역 9억·그 외 4억. 관심지역은 비수도권만·2026.1.1 이후 취득분
    if (area.secondHomeOk) {
      const tag = depopThen === 'depop' ? '인구감소지역' : '인구감소관심지역';
      const lim = depopThen === 'depop' && !area.capital ? JONGBU_LOWPRICE_DEPOP : JONGBU_LOWPRICE;
      const from = depopThen === 'depop' ? SECOND_HOME_START : JONGBU_RULES.interestAreaFrom;
      const inPeriod = d >= from && d <= SECOND_HOME_END;
      const then = area.depopSince && d && d < DEPOP_REDESIGNATED ? ` (취득 당시 ${tag})` : '';
      checks.push(
        { label: `인구감소지역 주택 — 취득일 ${from} ~ ${SECOND_HOME_END} (조특법 §71의2)`, ok: inPeriod, detail: d || '취득일 미입력' },
        { label: `인구감소지역 주택 — 가액 ${eokText(lim)} 이하`, ok: h.price <= lim, detail: `${eokText(h.price || 0)}${then}` },
      );
      if (inPeriod && h.price <= lim) return { kind: 'rural', ok: true, basis: '조특법 §71의2', checks, msg: `${tag} 주택(세컨드홈) — ${where}, 가액 한도(${eokText(lim)}) 이내, ${from} 이후 취득입니다. 9.16~9.30 신청이 필요합니다.` };
      if (h.price > lim) return { kind: 'normal', ok: false, checks, msg: `${where} — ${tag}이지만 공시가격이 한도(${eokText(lim)})를 넘습니다. 일반 주택으로 계산합니다.` };
      return { kind: 'normal', ok: false, checks, msg: `${where} — ${tag}이지만 ${from} ~ ${SECOND_HOME_END} 사이에 취득한 집만 대상입니다. 취득일을 확인하세요. 일반 주택으로 계산합니다.` };
    }
    if (rg.ok) return { kind: 'normal', ok: false, checks, msg: `${where} — 대상 지역이지만 공시가격이 4억을 넘습니다. 일반 주택으로 계산합니다.` };
    return { kind: 'normal', ok: false, checks, msg: `${where} — 지방 저가주택 대상 지역이 아닙니다. ${rg.label}. 일반 주택으로 계산합니다.` };
  }
  return { kind: 'normal', ok: true, msg: '' };
}

/**
 * 재산세 과세표준 → 공시가격(지자체 산정가액) 환산
 * 과세표준 ÷ 재산세 공정시장가액비율, 만원 단위 반올림.
 * @param {number} taxBase 재산세 고지서의 과세표준
 * @param {number|boolean} [ratio=0.6] 공정시장가액비율 (1세대 1주택 0.45, 그 외 0.6). true 를 주면 0.45
 */
export function priceFromPropertyTaxBase(taxBase, ratio = 0.6) {
  const r = ratio === true ? 0.45 : (ratio === false ? 0.6 : ratio);
  return Math.round(taxBase / r / 10000) * 10000;
}

/** 재산세 본세(연간, 표준세율) → 과세표준 역산 — standardPropertyTax 의 역함수 */
export function propertyTaxBaseFromTax(tax) {
  if (tax <= 60_000) return tax / 0.001;
  if (tax <= 195_000) return 60_000_000 + (tax - 60_000) / 0.0015;
  if (tax <= 570_000) return 150_000_000 + (tax - 195_000) / 0.0025;
  return 300_000_000 + (tax - 570_000) / 0.004;
}

/** 재산세 본세(연간) → 공시가격(지자체 산정가액) 환산 */
export function priceFromPropertyTax(tax, ratio = 0.6) {
  return priceFromPropertyTaxBase(propertyTaxBaseFromTax(tax), ratio);
}
