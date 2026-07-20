/**
 * 중대재해처벌법 점검 달력 엔진
 *
 * 사업장별 정기점검·수시점검 일정을 달력으로 관리하기 위한 순수 로직.
 * 저장(localStorage)·렌더는 페이지 계층에서 담당하고, 여기서는
 * 달력 격자 생성·반복일정 산출·집계 등 계산만 다룬다.
 *
 * 점검 항목(카테고리)
 *  - risk : 사업장 위험성 평가   (시행령 §4①3 · 산안법 §36)
 *  - perf : 성과평가             (안전보건관리책임자등 업무수행 평가, 시행령 §4①5나)
 *  - etc  : 기타 위험 평가        (공정·설비·수급인 등 그 밖의 위험 평가)
 * 점검 구분
 *  - regular : 정기점검 (반기·분기·월 등 주기적으로 실시)
 *  - spot    : 수시점검 (신규·변경·중대재해 발생 등 사유 발생 시)
 */

export const CATEGORIES = [
  { key: 'risk', label: '사업장 위험성 평가', short: '위험성', color: '#c0392b', bg: '#fdecea', basis: '시행령 §4①3 · 산안법 §36' },
  { key: 'perf', label: '성과평가', short: '성과', color: '#1e7a45', bg: '#eafaf1', basis: '시행령 §4①5나' },
  { key: 'etc', label: '기타 위험 평가', short: '기타', color: '#9c6512', bg: '#fdf2e3', basis: '공정·설비·수급인 등' },
];

export const KINDS = [
  { key: 'regular', label: '정기점검' },
  { key: 'spot', label: '수시점검' },
];

export const FREQUENCIES = [
  { key: 'once', label: '반복 없음', months: null },
  { key: 'week', label: '매주', months: 0 },
  { key: 'month', label: '매월', months: 1 },
  { key: 'quarter', label: '분기(3개월)', months: 3 },
  { key: 'half', label: '반기(6개월)', months: 6 },
  { key: 'year', label: '매년', months: 12 },
];

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const pad = (n) => String(n).padStart(2, '0');
export const isoOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

/** 월 말일(day) */
function lastDayOf(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * 6주 달력 격자 생성 (일요일 시작)
 * @param {number} year
 * @param {number} month 1~12
 * @returns {Array<Array<string|null>>} 주 배열, 각 칸은 'YYYY-MM-DD' 또는 null
 */
export function monthMatrix(year, month) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const startDow = first.getUTCDay();
  const days = lastDayOf(year, month - 1);
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(isoOf(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/**
 * 반복 일정의 발생일 목록
 * @param {string} startISO 시작일 'YYYY-MM-DD'
 * @param {string} freq FREQUENCIES 키
 * @param {number} count 발생 횟수(시작일 포함)
 * @returns {string[]}
 */
export function recurrences(startISO, freq, count) {
  const [y, m, d] = startISO.split('-').map(Number);
  const spec = FREQUENCIES.find((f) => f.key === freq);
  if (!spec || spec.months === null || count <= 1) return [startISO];
  const out = [];
  for (let i = 0; i < count; i++) {
    if (freq === 'week') {
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() + 7 * i);
      out.push(dt.toISOString().slice(0, 10));
    } else {
      const monthIndex = m - 1 + spec.months * i;
      const yy = y + Math.floor(monthIndex / 12);
      const mm = ((monthIndex % 12) + 12) % 12;
      const day = Math.min(d, lastDayOf(yy, mm));
      out.push(isoOf(yy, mm + 1, day));
    }
  }
  return out;
}

/** 특정 날짜의 항목들 */
export function entriesOn(entries, dateISO) {
  return entries.filter((e) => e.date === dateISO);
}

/** 특정 연·월의 항목들 */
export function entriesInMonth(entries, year, month) {
  const prefix = `${year}-${pad(month)}`;
  return entries.filter((e) => e.date.startsWith(prefix));
}

/** 집계: 항목·구분·완료 현황 */
export function summarize(entries) {
  const byCat = {};
  for (const c of CATEGORIES) byCat[c.key] = 0;
  let done = 0;
  for (const e of entries) {
    if (byCat[e.cat] !== undefined) byCat[e.cat] += 1;
    if (e.done) done += 1;
  }
  return { total: entries.length, done, pending: entries.length - done, byCat };
}

/** 오늘 이전 미완료(지연) 항목 */
export function overdue(entries, todayISO) {
  return entries.filter((e) => !e.done && e.date < todayISO);
}
