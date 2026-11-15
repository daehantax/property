/**
 * 재건축 청산금(환급받은 청산금) 양도소득세 + 차수별 가산세 계산 모듈
 * 대상: 개포래미안(재건축) 조합원이 권리가액 중 일부를 청산금으로 받은 경우
 *
 * [전제 — 2019년 양도분 세법]
 *  - 양도일(청산금 수령 의제일): 소유권 이전고시일 2019.05.24 (사용자 확정 기준)
 *  - 청산금 수령분 = 종전부동산의 일부 양도 (책 「2026 주택과 세금」 208~211쪽, 소득령 §166)
 *      양도가액 = 받은 청산금(누적)
 *      취득가액·필요경비 = 종전 취득가액·필요경비 × (청산금 ÷ 권리가액)
 *  - 장기보유특별공제(소득법 §95②, 2019.1.1 이후 양도분)
 *      표1(일반)        : 보유 3년 이상 연 2% (6%~30%, 15년)
 *      표2(1세대1주택)  : 보유 3년 이상 연 8% (24%~80%, 10년) — 2019년 양도분은 거주요건 없음
 *  - 1세대1주택 고가주택 기준 9억(2019년), 9억 초과분만 과세 (소득령 §160①)
 *  - 기본세율 6~42%(2018~2020 양도분), 1년 미만 보유 주택 40%, 중과 없음
 *  - 기본공제 250만(연 1회)
 *
 * [차수별 수령일·신고기한 — 사용자 확정 기준]
 *  - 최초 청산금: 실제 수령일은 실입주일이나 이전고시일 2019.05.24 수령으로 의제
 *  - 1차 청산금 : 실제 2019.04 수령이나 2019.05.24 수령으로 의제
 *      → 최초·1차 신고기한: 확정신고기한 2020.06.01(5.31 일요일 → 순연), 옵션 예정신고기한 2019.07.31
 *  - 2차 청산금 : 2019.08 말 수령 → 수정신고기한 2019.10.31
 *  - 3차·4차 청산금: 2026.09.10 수령 → 신고기한 2026.11.30 (기한 내 신고·납부하면 가산세 없음)
 *
 * [차수 선택]
 *  - 이번에 신고할 차수만 양도신고 대상(양도가액)에 넣는다. 선택하지 않은 차수는 과세표준에서 제외.
 *  - 이미 신고·납부한 차수는 과세표준에 포함하고(누적), 그 세액은 기납부로 본다.
 *  - 차수별 세액 = 대상 차수를 시간순으로 누적해 다시 계산한 세액 − 직전 누적세액(누진세율 반영)
 *  - 가산세도 선택한 차수의 미납세액에만 계산한다.
 *
 * [가산세 — 국세기본법]
 *  - 신고하지 않은 차수: 신고불성실 20%(무신고, §47의2) — 사용자 확정 기준
 *    이미 신고했으나 기납부세액이 부족한 차수: 과소신고 10%(§47의3)
 *  - 감면(§48②, 신고불성실가산세만): 법정신고기한 경과 후
 *    · 수정신고: 1개월 90%, 3개월 75%, 6개월 50%, 1년 30%, 1년6개월 20%, 2년 10%
 *    · 기한후신고: 1개월 50%, 3개월 30%, 6개월 20%
 *  - 납부지연(§47의4, 구 납부불성실): 미납세액 × 경과일수 × 1일 이자율 (신고기한 다음날 ~ 납부일)
 *    · ~2019.02.11 0.03% / 2019.02.12~2022.02.14 0.025% / 2022.02.15~ 0.022%
 *    · 기간이 이율 개정일에 걸치면 구간별 이율 적용
 *  - 지방소득세(양도세의 10%)는 지방세기본법 기준 참고치
 *    · 납부지연 1일 0.025%(~2022.06.06) / 0.022%(2022.06.07~), 한도 미납세액의 75%
 */

export const TRANSFER_DATE = '2019-05-24';   // 이전고시일 = 청산금 수령 의제일
export const HIGH_PRICE_LINE = 900_000_000;   // 2019년 1세대1주택 고가주택 기준
export const BASIC_DEDUCTION = 2_500_000;

/** 차수 일정 (금액은 사람마다 입력). 시간순으로 누적 계산한다. */
export const TRANCHE_KEYS = ['initial', 'first', 'second', 'third', 'fourth'];
export const DEFAULT_SCHEDULE = {
  initial: { label: '최초 청산금', actual: '실입주일', deemed: '2019-05-24', due: 'initialDue' },
  first: { label: '1차 청산금', actual: '2019.04', deemed: '2019-05-24', due: 'initialDue' },
  second: { label: '2차 청산금', actual: '2019.08 말', deemed: '2019-08-31', due: '2019-10-31' },
  third: { label: '3차 청산금', actual: '2026.09.10', deemed: '2026-09-10', due: '2026-11-30' },
  fourth: { label: '4차 청산금', actual: '2026.09.10', deemed: '2026-09-10', due: '2026-11-30' },
};
export const INITIAL_DUE = { final: '2020-06-01', prelim: '2019-07-31' };

const LAW_REF = [
  '소득세법 §88·§94 (양도의 정의·과세대상) / 소득세법시행령 §166 (재건축 청산금 양도차익)',
  '소득세법 §95② (장기보유특별공제 표1·표2, 2019.1.1 이후 양도분)',
  '소득세법 §89①3·시행령 §156·§160① (1세대1주택 비과세, 고가주택 9억 초과분 — 2019년 기준)',
  '소득세법 §103 (양도소득 기본공제 250만), §104① (기본세율 6~42%, 1년 미만 40%)',
  '소득세법 §105·§110 (예정신고·확정신고기한), 국세기본법 §5 (기한이 공휴일·토·일이면 다음날)',
  '국세기본법 §45 (수정신고), §45의3 (기한후신고)',
  '국세기본법 §47의2 (무신고가산세 20%), §47의3 (과소신고가산세 10%), §48② (가산세 감면)',
  '국세기본법 §47의4 + 시행령 §27의4 (납부지연가산세 1일 0.03%→0.025%(2019.2.12)→0.022%(2022.2.15))',
  '국세기본법 §26의2 (부과제척기간: 무신고 7년, 과소신고 5년)',
  '지방세법 §103의3 (양도소득 지방소득세), 지방세기본법 §53~§55 (지방세 가산세)',
];

// ── 날짜 유틸 (UTC 기준, 'YYYY-MM-DD') ───────────────────────────────
const toD = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const toS = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = toD(s); d.setUTCDate(d.getUTCDate() + n); return toS(d); };
const daysBetween = (a, b) => Math.round((toD(b) - toD(a)) / 86_400_000);   // b − a
/** 월 더하기: 말일 보정 (예: 1.31 + 1개월 = 2.28) */
function addMonths(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return toS(target);
}
const addYears = (s, n) => addMonths(s, n * 12);

/** 보유기간(만 년수): 취득일 + n년 ≤ 양도일 인 최대 n */
export function holdingYears(acquireDate, transferDate) {
  let n = 0;
  while (addYears(acquireDate, n + 1) <= transferDate) n++;
  return n;
}

// ── 세율·공제율 ─────────────────────────────────────────────────────
/** 2019년 양도소득 기본세율 (소득법 §55①, 2018.1.1~2020.12.31) */
export function basicRate2019(base) {
  const T = [
    [12_000_000, 0.06, 0],
    [46_000_000, 0.15, 1_080_000],
    [88_000_000, 0.24, 5_220_000],
    [150_000_000, 0.35, 14_900_000],
    [300_000_000, 0.38, 19_400_000],
    [500_000_000, 0.40, 25_400_000],
    [Infinity, 0.42, 35_400_000],
  ];
  const [, rate, dc] = T.find(([lim]) => base <= lim);
  return { rate, dc, tax: Math.max(0, Math.floor(base * rate - dc)) };
}

/** 장기보유특별공제율 (2019년 양도분) */
export function ltdRate2019(table, years) {
  if (years < 3) return 0;
  if (table === 'table2') return Math.min(years * 0.08, 0.80);
  return Math.min(years * 0.02, 0.30);
}

// ── 1단계: 누적 청산금 기준 세액 ─────────────────────────────────────
/**
 * @param {object} p
 * @param {number} p.cumulative   누적 청산금
 * @param {number} p.rightsValue  권리가액(종전자산 평가액)
 * @param {number} p.acquirePrice 종전 취득가액
 * @param {number} p.expenses     종전 필요경비(자본적지출·양도비 등)
 * @param {number} p.years        보유기간(년)
 * @param {'table1'|'table2'} p.ltdTable
 * @param {boolean} p.singleHouseExempt  1세대1주택 비과세 요건 충족
 * @param {number} p.highPriceBase       고가주택 판정가액(기본 권리가액)
 * @param {boolean} p.basicDeductUsed    같은 해 다른 양도로 기본공제를 이미 사용
 */
export function computeStage(p) {
  const ratio = p.rightsValue > 0 ? p.cumulative / p.rightsValue : 0;
  const salePrice = p.cumulative;
  const acq = Math.floor(p.acquirePrice * ratio);
  const exp = Math.floor(p.expenses * ratio);
  const gain = Math.max(0, salePrice - acq - exp);

  let taxableGain = gain;
  let exemptNote = null;
  if (p.singleHouseExempt) {
    if (p.highPriceBase <= HIGH_PRICE_LINE) {
      taxableGain = 0;
      exemptNote = `고가주택 판정가액 ${p.highPriceBase.toLocaleString('ko-KR')}원 ≤ 9억 → 전액 비과세`;
    } else {
      taxableGain = Math.floor(gain * (p.highPriceBase - HIGH_PRICE_LINE) / p.highPriceBase);
      exemptNote = `9억 초과분만 과세: 양도차익 × (${p.highPriceBase.toLocaleString('ko-KR')} − 9억) ÷ ${p.highPriceBase.toLocaleString('ko-KR')}`;
    }
  }

  const ltdR = ltdRate2019(p.ltdTable, p.years);
  const ltd = Math.floor(taxableGain * ltdR);
  const income = taxableGain - ltd;
  const basic = p.basicDeductUsed ? 0 : Math.min(BASIC_DEDUCTION, income);
  const base = Math.max(0, income - basic);

  let rate, dc, tax;
  if (p.years < 1) { rate = 0.40; dc = 0; tax = Math.floor(base * 0.40); }
  else ({ rate, dc, tax } = basicRate2019(base));
  const localTax = Math.floor(tax * 0.1);

  return { cumulative: p.cumulative, ratio, salePrice, acq, exp, gain, taxableGain, exemptNote,
    ltdRate: ltdR, ltd, income, basic, base, rate, dc, tax, localTax };
}

// ── 2단계: 가산세 ───────────────────────────────────────────────────
const NATIONAL_RATES = [   // [시작일, 1일 이자율]
  ['1900-01-01', 0.0003],
  ['2019-02-12', 0.00025],
  ['2022-02-15', 0.00022],
];
const LOCAL_RATES = [
  ['1900-01-01', 0.0003],
  ['2019-01-01', 0.00025],
  ['2022-06-07', 0.00022],
];

/**
 * 납부지연가산세: 법정납부기한 다음날 ~ 납부일, 이율 구간별 분할
 * @returns {{ total:number, segments:Array<{from,to,days,rate,amount}> }}
 */
export function latePaymentPenalty(unpaid, dueDate, payDate, rates = NATIONAL_RATES) {
  const start = addDays(dueDate, 1);
  if (unpaid <= 0 || payDate < start) return { total: 0, days: 0, segments: [] };
  const segments = [];
  for (let i = 0; i < rates.length; i++) {
    const segFrom = rates[i][0] > start ? rates[i][0] : start;
    const segTo = i + 1 < rates.length ? addDays(rates[i + 1][0], -1) : payDate;
    const to = segTo < payDate ? segTo : payDate;
    if (to < segFrom) continue;
    const days = daysBetween(segFrom, to) + 1;
    const amount = Math.floor(unpaid * days * rates[i][1]);
    segments.push({ from: segFrom, to, days, rate: rates[i][1], amount });
  }
  const total = segments.reduce((s, x) => s + x.amount, 0);
  return { total, days: daysBetween(start, payDate) + 1, segments };
}

/** 신고불성실가산세 감면율 (국기법 §48②, 법정신고기한 경과 후 신고 시점 기준) */
export function filingReduction(kind, dueDate, filingDate) {
  if (filingDate <= dueDate) return { rate: 0, label: '기한 내' };
  const steps = kind === 'amend'
    ? [[1, 0.9], [3, 0.75], [6, 0.5], [12, 0.3], [18, 0.2], [24, 0.1]]
    : [[1, 0.5], [3, 0.3], [6, 0.2]];
  for (const [m, r] of steps) {
    if (filingDate <= addMonths(dueDate, m)) return { rate: r, label: `${m}개월 이내 ${Math.round(r * 100)}% 감면` };
  }
  return { rate: 0, label: '감면 기간 경과' };
}


// ── 합계 ─────────────────────────────────────────────────────────
/** 차수 행들의 본세·가산세·지방소득세 합계 */
export function sumRows(rows) {
  const sum = (f) => rows.reduce((s, r) => s + f(r), 0);
  const t = {
    unpaidTax: sum((r) => r.unpaid),
    unpaidLocal: sum((r) => r.unpaidLocal),
    filingPenalty: sum((r) => r.penalty.filing),
    latePenalty: sum((r) => r.penalty.late.total),
    penalty: sum((r) => r.penalty.total),
    filingPenaltyLocal: sum((r) => r.penaltyLocal.filing),
    latePenaltyLocal: sum((r) => r.penaltyLocal.late.total),
    penaltyLocal: sum((r) => r.penaltyLocal.total),
  };
  t.payNational = t.unpaidTax + t.penalty;
  t.payLocal = t.unpaidLocal + t.penaltyLocal;
  t.payAll = t.payNational + t.payLocal;
  return t;
}

const ZERO_LATE = () => ({ total: 0, days: 0, segments: [] });
const has = (v) => v !== undefined && v !== null && v !== '';

// ── 메인 ───────────────────────────────────────────────────────────
/**
 * @param {object} input
 * @param {string} input.acquireDate      종전부동산 취득일
 * @param {number} input.acquirePrice     종전부동산 취득가액
 * @param {number} [input.expenses]       필요경비
 * @param {number} input.rightsValue      권리가액(종전자산 평가액)
 * @param {object} input.amounts          { initial, first, second, third, fourth } 청산금
 * @param {object} [input.selected]       { initial, first, second, third, fourth } 이번에 신고할 차수 (기본 전체)
 * @param {object} [input.filed]          { ... } 이미 신고·납부한 차수 (과세표준에 포함, 세액은 기납부)
 * @param {object} [input.prepaid]        { tax, local } 이미 신고한 차수의 기납부세액 합계.
 *                                        비우면 '정확히 신고·납부'로 보아 해당 차수 세액 전액을 기납부로 간주
 * @param {boolean} [input.excludeExpired]  2019년 신고분 부족세액을 제척기간(5년) 경과로 제외
 * @param {'final'|'prelim'} [input.initialDueBasis]  최초·1차 신고기한 기준
 * @param {boolean} [input.singleHouse]   1세대1주택 비과세 요건 충족
 * @param {number} [input.highPriceBase]  고가주택 판정가액 (기본 권리가액)
 * @param {'table1'|'table2'} [input.ltdTable]  장특공 표 (기본: 1세대1주택이면 표2)
 * @param {boolean} [input.basicDeductUsed]
 * @param {string} input.payDate          신고·납부(예정)일
 */
export function calcClearanceTransferTax(input) {
  const S = DEFAULT_SCHEDULE;
  const transferDate = input.transferDate || TRANSFER_DATE;
  const a = input.amounts || {};
  const amt = (k) => Math.max(0, Math.floor(Number(a[k]) || 0));
  const filed = Object.fromEntries(TRANCHE_KEYS.map((k) => [k, !!(input.filed || {})[k]]));
  const selected = Object.fromEntries(TRANCHE_KEYS.map((k) => [k, (input.selected || {})[k] ?? true]));
  const singleHouse = !!input.singleHouse;
  const ltdTable = input.ltdTable || (singleHouse ? 'table2' : 'table1');
  const years = holdingYears(input.acquireDate, transferDate);
  const holdDays = daysBetween(input.acquireDate, transferDate);
  const payDate = input.payDate;
  const initialDue = INITIAL_DUE[input.initialDueBasis === 'prelim' ? 'prelim' : 'final'];
  const warnings = [];

  const common = {
    rightsValue: Number(input.rightsValue) || 0,
    acquirePrice: Number(input.acquirePrice) || 0,
    expenses: Number(input.expenses) || 0,
    years, ltdTable,
    singleHouseExempt: singleHouse,
    highPriceBase: Number(input.highPriceBase) || Number(input.rightsValue) || 0,
    basicDeductUsed: !!input.basicDeductUsed,
  };

  // 부과제척기간: 2019년 귀속 확정신고기한(2020.6.1) 다음날부터 — 2019년 차수 중 하나라도 신고했으면 5년, 아니면 7년
  const filed2019 = filed.initial || filed.first || filed.second;
  const statute = {
    base: INITIAL_DUE.final,
    years: filed2019 ? 5 : 7,
    expires: addDays(addYears(addDays(INITIAL_DUE.final, 1), filed2019 ? 5 : 7), -1),
  };

  // 기납부세액: 입력하면 대상 차수 세액에 시간순으로 충당(남으면 환급), 비우면 신고한 차수 세액 = 기납부
  const prepaidIn = input.prepaid || {};
  const anyFiled = TRANCHE_KEYS.some((k) => filed[k]);
  const prepaidGiven = anyFiled && has(prepaidIn.tax);
  const prepaid = { given: prepaidGiven, tax: 0, local: 0 };
  if (prepaidGiven) {
    prepaid.tax = Math.max(0, Math.floor(Number(prepaidIn.tax) || 0));
    prepaid.local = has(prepaidIn.local) ? Math.max(0, Math.floor(Number(prepaidIn.local) || 0)) : Math.floor(prepaid.tax * 0.1);
  }
  let creditTax = prepaid.tax, creditLocal = prepaid.local;

  let cum = 0, prevTax = 0, prevLocal = 0, lastStage = null;
  const rows = [];
  for (const key of TRANCHE_KEYS) {
    const sc = S[key];
    const due = sc.due === 'initialDue' ? initialDue : sc.due;
    const amount = amt(key);
    const included = filed[key] || selected[key];
    const base = { key, label: sc.label, actual: sc.actual, deemed: sc.deemed, due, amount,
      included, filed: filed[key], selected: selected[key] };
    const zeroPen = { filingRate: 0, filingRaw: 0, reduction: { rate: 0, label: '' }, filing: 0, late: ZERO_LATE(), total: 0 };
    const zeroPenL = { filingRate: 0, filingRaw: 0, filing: 0, late: ZERO_LATE(), total: 0 };

    if (!included) {   // 미선택·미신고 → 양도신고 대상에서 제외
      rows.push({ ...base, status: 'excluded', cumulative: cum, stage: null, addTax: 0, addLocal: 0,
        usedTax: 0, usedLocal: 0, prepaidTax: 0, unpaid: 0, unpaidLocal: 0, overdue: false, kind: null,
        penalty: zeroPen, penaltyLocal: zeroPenL, due_total: 0, due_totalLocal: 0 });
      continue;
    }

    cum += amount;
    const st = computeStage({ ...common, cumulative: cum });
    lastStage = st;
    const addTax = Math.max(0, st.tax - prevTax);
    const addLocal = Math.max(0, st.localTax - prevLocal);
    prevTax = st.tax; prevLocal = st.localTax;

    let usedTax = 0, usedLocal = 0, unpaid = addTax, unpaidLocal = addLocal, prepaidTax = 0;
    if (filed[key] && !prepaidGiven) {          // 정확히 신고·납부했다고 봄
      prepaidTax = addTax; unpaid = 0; unpaidLocal = 0;
    } else if (prepaidGiven) {                   // 기납부세액 충당
      usedTax = Math.min(creditTax, addTax); creditTax -= usedTax;
      usedLocal = Math.min(creditLocal, addLocal); creditLocal -= usedLocal;
      unpaid = addTax - usedTax; unpaidLocal = addLocal - usedLocal;
    }

    let expired = false;
    if (filed[key] && unpaid > 0 && input.excludeExpired && due <= INITIAL_DUE.final) {
      expired = true; unpaid = 0; unpaidLocal = 0;   // 제척기간(5년) 경과로 부과 불가 처리
    }

    // 미신고 차수 → 무신고 20%(기한후신고), 신고했으나 부족 → 과소 10%(수정신고)
    const kind = filed[key] ? 'amend' : 'late';
    const overdue = !!payDate && payDate > due && unpaid > 0;

    let pen = zeroPen, penLocal = zeroPenL;
    if (overdue) {
      const filingRate = kind === 'late' ? 0.20 : 0.10;
      const reduction = filingReduction(kind, due, payDate);
      const filingRaw = Math.floor(unpaid * filingRate);
      const filing = filingRaw - Math.floor(filingRaw * reduction.rate);
      const late = latePaymentPenalty(unpaid, due, payDate);
      pen = { filingRate, filingRaw, reduction, filing, late, total: filing + late.total };

      const lFilingRaw = Math.floor(unpaidLocal * filingRate);
      const lFiling = lFilingRaw - Math.floor(lFilingRaw * reduction.rate);
      const lLate = latePaymentPenalty(unpaidLocal, due, payDate, LOCAL_RATES);
      const cap = Math.floor(unpaidLocal * 0.75);
      const lLateTotal = Math.min(lLate.total, cap);
      penLocal = { filingRate, filingRaw: lFilingRaw, filing: lFiling,
        late: { ...lLate, total: lLateTotal, raw: lLate.total, cap, capped: lLate.total > cap }, total: lFiling + lLateTotal };
    }

    const status = expired ? 'expired'
      : filed[key] && unpaid === 0 ? 'filed'
        : overdue ? (kind === 'late' ? 'lateFiling' : 'amend')
          : 'onTime';
    rows.push({ ...base, status, expired, kind, overdue, cumulative: cum, stage: st,
      addTax, addLocal, usedTax, usedLocal, prepaidTax, unpaid, unpaidLocal,
      penalty: pen, penaltyLocal: penLocal,
      due_total: unpaid + pen.total, due_totalLocal: unpaidLocal + penLocal.total });
  }
  prepaid.refundTax = creditTax;      // 기납부가 결정세액보다 많으면 환급 대상
  prepaid.refundLocal = creditLocal;
  if (!prepaidGiven) {
    prepaid.tax = rows.reduce((s, r) => s + r.prepaidTax, 0);
    prepaid.local = rows.reduce((s, r) => s + (r.filed && r.included ? r.addLocal : 0), 0);
  }

  // 합계: 이번에 신고하는 차수(선택 + 부족세액이 있는 신고 차수 중 선택분)
  const target = rows.filter((r) => r.included && r.selected);
  const totals = sumRows(target);
  totals.tax = lastStage ? lastStage.tax : 0;
  totals.localTax = lastStage ? lastStage.localTax : 0;
  totals.amount = rows.filter((r) => r.included).reduce((s, r) => s + r.amount, 0);
  totals.selectedAmount = rows.filter((r) => r.included && r.selected && !r.filed).reduce((s, r) => s + r.amount, 0);
  const notSelected = sumRows(rows.filter((r) => r.included && !r.selected));   // 신고 차수 중 미선택분의 부족세액

  // 미선택 차수까지 모두 신고하면 얼마가 되는지 (비교용)
  let allSelected = null;
  if (!input._noCompare && TRANCHE_KEYS.some((k) => !selected[k] && !filed[k] && amt(k) > 0)) {
    const full = calcClearanceTransferTax({ ...input, selected: Object.fromEntries(TRANCHE_KEYS.map((k) => [k, true])), _noCompare: true });
    allSelected = { totals: full.totals, extra: full.totals.payAll - totals.payAll };
  }

  if (common.rightsValue > 0 && cum > common.rightsValue) {
    warnings.push('누적 청산금이 권리가액을 초과합니다. 취득가액 안분 비율이 100%를 넘으니 입력을 확인하세요.');
  }
  if (common.rightsValue <= 0) warnings.push('권리가액을 입력해야 취득가액을 안분할 수 있습니다.');
  if (input.acquireDate > transferDate) warnings.push(`취득일이 양도일(${transferDate.replaceAll('-', '.')}) 이후입니다.`);
  if (!target.length) warnings.push('이번에 신고할 차수를 하나 이상 선택하세요.');

  const shortfall2019 = rows.some((r) => r.filed && r.due <= INITIAL_DUE.final && (r.unpaid > 0 || r.expired));
  if (filed2019 && payDate > statute.expires && shortfall2019) {
    warnings.push(`2019년 차수를 신고했으므로 부과제척기간이 5년(${statute.expires.replaceAll('-', '.')} 만료)입니다. `
      + '신고한 차수의 부족세액은 제척기간이 지나 과세관청이 부과할 수 없고 수정신고 대상도 아닐 수 있습니다'
      + (input.excludeExpired ? ' — 「제척기간 경과분 제외」에 따라 부족세액·가산세를 0으로 처리했습니다.' : ' — 「제척기간 경과분 제외」를 체크하면 제외하고 계산합니다.'));
  }

  return { transferDate, years, holdDays, ltdTable, singleHouse, payDate, initialDue, rows, totals, notSelected,
    allSelected, prepaid, statute, warnings, lawRef: LAW_REF };
}
