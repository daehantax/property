/**
 * 재건축 청산금(환급받은 청산금) 양도소득세 + 차수별 가산세 계산 모듈
 * 대상: 개포래미안(재건축) 조합원이 권리가액 중 일부를 청산금으로 받은 경우
 *
 * [전제 — 2019년 양도분 세법]
 *  - 양도일: 소유권 이전고시일 다음날 = 2019.05.26 (청산금 양도시기, 사용자 확정 기준)
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
 * [차수별 신고기한 — 사용자 확정 기준]
 *  - 최초분(계약금·1차·2차): 양도일 귀속, 확정신고기한 2020.06.01(5.31 일요일 → 순연)
 *      옵션: 예정신고기한 2019.07.31 기준
 *  - 3차: 변동금액 확정·통지 2026.04.30 → 신고기한 2026.06.30
 *  - 4차: 지급 2026.09.10 → 신고기한 2026.11.30
 *  ※ 사후 확정 청산금을 「확정일이 속하는 달 말일부터 2개월」 내 신고하는 것은
 *    사용자 지정 기준이며 법령상 근거는 별도 확인이 필요하다.
 *
 * [가산세 — 국세기본법]
 *  - 무신고 20%(§47의2), 과소신고 10%(§47의3)
 *    · 최초분을 신고하지 않았으면 이후 차수도 기한후신고 → 무신고 20%
 *    · 최초분을 신고했으면 이후 차수는 수정신고 → 과소신고 10%
 *  - 감면(§48②, 신고불성실가산세만): 법정신고기한 경과 후
 *    · 수정신고: 1개월 90%, 3개월 75%, 6개월 50%, 1년 30%, 1년6개월 20%, 2년 10%
 *    · 기한후신고: 1개월 50%, 3개월 30%, 6개월 20%
 *  - 납부지연(§47의4, 구 납부불성실): 미납세액 × 경과일수 × 1일 이자율
 *    · ~2019.02.11 0.03% / 2019.02.12~2022.02.14 0.025% / 2022.02.15~ 0.022%
 *    · 기간이 이율 개정일에 걸치면 구간별 이율 적용
 *  - 지방소득세(양도세의 10%)는 지방세기본법 기준 참고치
 *    · 납부지연 1일 0.025%(~2022.06.06) / 0.022%(2022.06.07~), 한도 미납세액의 75%
 */

export const TRANSFER_DATE = '2019-05-26';
export const HIGH_PRICE_LINE = 900_000_000;   // 2019년 1세대1주택 고가주택 기준
export const BASIC_DEDUCTION = 2_500_000;

/** 차수 기본 일정 (금액은 사람마다 입력) */
export const DEFAULT_SCHEDULE = {
  initial: {
    label: '최초분 (계약금·1차·2차)',
    items: [
      { key: 'deposit', label: '계약금 (관리처분인가 시 20%)', date: '2016-04-01' },
      { key: 'mid1', label: '1차 중도금', date: '2016-10-07' },
      { key: 'mid2', label: '2차 중도금', date: '2017-03-08' },
    ],
    dueFinal: '2020-06-01',      // 확정신고기한 (2020.5.31 일요일 → 6.1)
    duePrelim: '2019-07-31',     // 예정신고기한
  },
  third: { label: '3차 (변동금액)', fixDate: '2026-04-30', paidDate: '2021-03-26', due: '2026-06-30' },
  fourth: { label: '4차', fixDate: '2026-09-10', due: '2026-11-30' },
};

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

// ── 메인 ───────────────────────────────────────────────────────────
/**
 * @param {object} input
 * @param {string} input.acquireDate      종전부동산 취득일
 * @param {number} input.acquirePrice     종전부동산 취득가액
 * @param {number} [input.expenses]       필요경비
 * @param {number} input.rightsValue      권리가액(종전자산 평가액)
 * @param {object} input.amounts          { deposit, mid1, mid2, third, fourth } 청산금
 * @param {object} [input.dates]          { deposit, mid1, mid2 } 지급일(표시용)
 * @param {object} [input.filed]          { initial, third, fourth } 기한 내 신고·납부 여부
 * @param {'final'|'prelim'} [input.initialDueBasis]  최초분 가산세 기산 기준
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
  const filed = { initial: false, third: false, fourth: false, ...(input.filed || {}) };
  const singleHouse = !!input.singleHouse;
  const ltdTable = input.ltdTable || (singleHouse ? 'table2' : 'table1');
  const years = holdingYears(input.acquireDate, transferDate);
  const holdDays = daysBetween(input.acquireDate, transferDate);
  const payDate = input.payDate;
  const warnings = [];

  const initialItems = S.initial.items.map((it) => ({
    ...it, date: (input.dates && input.dates[it.key]) || it.date, amount: amt(it.key),
  }));
  const initialAmt = initialItems.reduce((s, x) => s + x.amount, 0);

  const initialDue = input.initialDueBasis === 'prelim' ? S.initial.duePrelim : S.initial.dueFinal;
  const tranches = [
    { key: 'initial', label: S.initial.label, amount: initialAmt, eventDate: transferDate, due: initialDue, items: initialItems },
    { key: 'third', label: S.third.label, amount: amt('third'), eventDate: S.third.fixDate, paidDate: S.third.paidDate, due: S.third.due },
    { key: 'fourth', label: S.fourth.label, amount: amt('fourth'), eventDate: S.fourth.fixDate, due: S.fourth.due },
  ];

  const common = {
    rightsValue: Number(input.rightsValue) || 0,
    acquirePrice: Number(input.acquirePrice) || 0,
    expenses: Number(input.expenses) || 0,
    years, ltdTable,
    singleHouseExempt: singleHouse,
    highPriceBase: Number(input.highPriceBase) || Number(input.rightsValue) || 0,
    basicDeductUsed: !!input.basicDeductUsed,
  };

  let cum = 0;
  let prevTax = 0, prevLocal = 0;
  const rows = [];
  for (const t of tranches) {
    cum += t.amount;
    const st = computeStage({ ...common, cumulative: cum });
    const addTax = Math.max(0, st.tax - prevTax);
    const addLocal = Math.max(0, st.localTax - prevLocal);
    prevTax = st.tax; prevLocal = st.localTax;

    // 신고 유형: 최초분 미신고 → 기한후신고(무신고), 최초분 신고 → 이후 차수 수정신고(과소)
    const kind = t.key === 'initial' || !filed.initial ? 'late' : 'amend';
    const isFiled = filed[t.key];
    const overdue = !isFiled && payDate > t.due && addTax > 0;

    let pen = { filingRate: 0, filingBase: 0, reduction: { rate: 0, label: '' }, filing: 0,
      late: { total: 0, days: 0, segments: [] }, total: 0 };
    let penLocal = { filing: 0, late: { total: 0, days: 0, segments: [] }, total: 0 };
    if (overdue) {
      const filingRate = kind === 'late' ? 0.20 : 0.10;
      const reduction = filingReduction(kind, t.due, payDate);
      const filingRaw = Math.floor(addTax * filingRate);
      const filing = filingRaw - Math.floor(filingRaw * reduction.rate);
      const late = latePaymentPenalty(addTax, t.due, payDate);
      pen = { filingRate, filingRaw, reduction, filing, late, total: filing + late.total };

      const lFilingRaw = Math.floor(addLocal * filingRate);
      const lFiling = lFilingRaw - Math.floor(lFilingRaw * reduction.rate);
      const lLate = latePaymentPenalty(addLocal, t.due, payDate, LOCAL_RATES);
      const cap = Math.floor(addLocal * 0.75);
      const lLateTotal = Math.min(lLate.total, cap);
      penLocal = { filing: lFiling, late: { ...lLate, total: lLateTotal, capped: lLate.total > cap }, total: lFiling + lLateTotal };
    }

    rows.push({
      ...t, kind, filed: isFiled, overdue, cumulative: cum, stage: st,
      addTax, addLocal, penalty: pen, penaltyLocal: penLocal,
      due_total: isFiled ? 0 : addTax + pen.total,
      due_totalLocal: isFiled ? 0 : addLocal + penLocal.total,
    });
  }

  if (common.rightsValue > 0 && cum > common.rightsValue) {
    warnings.push('누적 청산금이 권리가액을 초과합니다. 취득가액 안분 비율이 100%를 넘으니 입력을 확인하세요.');
  }
  if (common.rightsValue <= 0) warnings.push('권리가액을 입력해야 취득가액을 안분할 수 있습니다.');
  if (input.acquireDate > transferDate) warnings.push('취득일이 양도일(2019.05.26) 이후입니다.');

  const sum = (f) => rows.reduce((s, r) => s + f(r), 0);
  const totals = {
    tax: rows[rows.length - 1].stage.tax,
    localTax: rows[rows.length - 1].stage.localTax,
    unpaidTax: sum((r) => (r.filed ? 0 : r.addTax)),
    unpaidLocal: sum((r) => (r.filed ? 0 : r.addLocal)),
    filingPenalty: sum((r) => r.penalty.filing),
    latePenalty: sum((r) => r.penalty.late.total),
    penalty: sum((r) => r.penalty.total),
    penaltyLocal: sum((r) => r.penaltyLocal.total),
  };
  totals.payNational = totals.unpaidTax + totals.penalty;
  totals.payLocal = totals.unpaidLocal + totals.penaltyLocal;
  totals.payAll = totals.payNational + totals.payLocal;

  // 부과제척기간: 최초분 확정신고기한(2020.6.1) 다음날부터 무신고 7년 / 신고 시 5년
  const statute = {
    base: S.initial.dueFinal,
    years: filed.initial ? 5 : 7,
    expires: addDays(addYears(addDays(S.initial.dueFinal, 1), filed.initial ? 5 : 7), -1),
  };

  return { transferDate, years, holdDays, ltdTable, singleHouse, payDate, rows, totals, statute, warnings, lawRef: LAW_REF };
}
