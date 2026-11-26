/**
 * 전국 시·군·구 지역 분류 데이터 — 지방주택 판정기용
 *
 * 출처
 *  - 인구감소지역 92곳: 행정안전부 2026.10.7 재지정 고시 (2021.10.19 최초 89곳 → 2024.2.27 군위군 대구 편입 반영
 *    → 2026.10.7 재지정: 부산 금정구·경기 동두천시·경남 통영시가 관심지역에서 편입돼 92곳).
 *    그중 전남 영광군·부산 동구·대구 서구는 여건이 나아진 「인구활력+지역」 — 5년간 인구감소지역에 준해 지원
 *  - 인구감소관심지역 18곳: 2026.10.7 재지정 (부산 북구·경북 예천군·칠곡군 신규, 9곳은 「인구활력+지역」)
 *  - 접경지역 17개 시·군: 접경지역 지원 특별법 §2 · 시행령 §2 (2025.3.11 가평군·속초시 추가)
 *  - 수도권: 수도권정비계획법 §2 (서울·인천·경기)
 *
 * 세법상 의미
 *  - 조특법 §71의2 세컨드홈: 인구감소지역(관심지역은 2026.1.1 이후 취득분) 중
 *    수도권(접경지역 제외)·광역시(군 제외) 제외
 *  - 종부세 지방 저가주택(종부세법 §8④4호, 시행령 §4의2③): 공시가격 4억 이하 +
 *    가목 수도권 밖 광역시·특별자치시 아닌 지역 / 나목 수도권 밖 광역시 소속 군 / 다목 세종 읍·면 /
 *    라목 서울 외 수도권 중 인구감소지역이면서 접경지역으로 시행규칙이 정한 곳(가평·연천·강화·옹진)
 *  - 양도세 중과 주택수 제외(§167의3①8의2): 수도권·광역시·특별자치시(군·읍면 제외) 외 3억 이하
 */

export const CAPITAL_SIDO = ['서울', '인천', '경기'];
export const METRO_CITY_SIDO = ['부산', '대구', '인천', '광주', '대전', '울산'];

/** 접경지역 지원 특별법 §2 · 시행령 §2 — 17개 시·군 (2025.3.11 가평군·속초시 추가) */
export const BORDER_AREAS = [
  ['인천', '강화군'], ['인천', '옹진군'],
  ['경기', '김포시'], ['경기', '파주시'], ['경기', '연천군'], ['경기', '고양시'], ['경기', '양주시'], ['경기', '동두천시'], ['경기', '포천시'], ['경기', '가평군'],
  ['강원', '철원군'], ['강원', '화천군'], ['강원', '양구군'], ['강원', '인제군'], ['강원', '고성군'], ['강원', '춘천시'], ['강원', '속초시'],
];

/** 인구감소지역 92곳 (행안부 2026.10.7 재지정 고시) */
export const DEPOP_AREAS = [
  ['부산', '동구'], ['부산', '서구'], ['부산', '영도구'], ['부산', '금정구'],
  ['대구', '남구'], ['대구', '서구'], ['대구', '군위군'],
  ['인천', '강화군'], ['인천', '옹진군'],
  ['경기', '가평군'], ['경기', '연천군'], ['경기', '동두천시'],
  ['강원', '고성군'], ['강원', '삼척시'], ['강원', '양구군'], ['강원', '양양군'], ['강원', '영월군'], ['강원', '정선군'],
  ['강원', '철원군'], ['강원', '태백시'], ['강원', '평창군'], ['강원', '홍천군'], ['강원', '화천군'], ['강원', '횡성군'],
  ['충북', '괴산군'], ['충북', '단양군'], ['충북', '보은군'], ['충북', '영동군'], ['충북', '옥천군'], ['충북', '제천시'],
  ['충남', '공주시'], ['충남', '금산군'], ['충남', '논산시'], ['충남', '보령시'], ['충남', '부여군'], ['충남', '서천군'],
  ['충남', '예산군'], ['충남', '청양군'], ['충남', '태안군'],
  ['전북', '고창군'], ['전북', '김제시'], ['전북', '남원시'], ['전북', '무주군'], ['전북', '부안군'], ['전북', '순창군'],
  ['전북', '임실군'], ['전북', '장수군'], ['전북', '정읍시'], ['전북', '진안군'],
  ['전남', '강진군'], ['전남', '고흥군'], ['전남', '곡성군'], ['전남', '구례군'], ['전남', '담양군'], ['전남', '보성군'],
  ['전남', '신안군'], ['전남', '영광군'], ['전남', '영암군'], ['전남', '완도군'], ['전남', '장성군'], ['전남', '장흥군'],
  ['전남', '진도군'], ['전남', '함평군'], ['전남', '해남군'], ['전남', '화순군'],
  ['경북', '고령군'], ['경북', '문경시'], ['경북', '봉화군'], ['경북', '상주시'], ['경북', '성주군'], ['경북', '안동시'],
  ['경북', '영덕군'], ['경북', '영양군'], ['경북', '영주시'], ['경북', '영천시'], ['경북', '울릉군'], ['경북', '울진군'],
  ['경북', '의성군'], ['경북', '청도군'], ['경북', '청송군'],
  ['경남', '거창군'], ['경남', '고성군'], ['경남', '남해군'], ['경남', '밀양시'], ['경남', '산청군'], ['경남', '의령군'],
  ['경남', '창녕군'], ['경남', '하동군'], ['경남', '함안군'], ['경남', '함양군'], ['경남', '합천군'], ['경남', '통영시'],
];

/** 2026.10.7 재지정으로 관심지역 → 인구감소지역이 된 3곳. 그 전 취득분은 「관심지역」 기준으로 본다 */
export const DEPOP_REDESIGNATED = '2026-10-07';
export const DEPOP_NEW_2026 = [['부산', '금정구'], ['경기', '동두천시'], ['경남', '통영시']];

/** 인구감소관심지역 18곳 (행안부 2026.10.7 재지정 — 부산 북구·경북 예천군·칠곡군 신규) */
export const INTEREST_AREAS = [
  ['부산', '중구'], ['부산', '북구'],
  ['인천', '동구'],
  ['광주', '동구'],
  ['대전', '동구'], ['대전', '중구'], ['대전', '대덕구'],
  ['경기', '포천시'],
  ['강원', '강릉시'], ['강원', '동해시'], ['강원', '속초시'], ['강원', '인제군'],
  ['전북', '익산시'],
  ['경북', '경주시'], ['경북', '김천시'], ['경북', '예천군'], ['경북', '칠곡군'],
  ['경남', '사천시'],
];

/**
 * 인구활력+지역 (2026.10.7) — 여건이 나아져 지정 기준에서는 벗어났지만 5년간 종전 지원을 이어받는 곳.
 * 위 명단(92곳·18곳)에 그대로 들어 있고, 화면에 「활력+」 표시만 덧붙인다.
 */
export const VITAL_PLUS_AREAS = [
  ['전남', '영광군'], ['부산', '동구'], ['대구', '서구'],                       // 인구감소지역 쪽 3곳
  ['광주', '동구'], ['인천', '동구'], ['대전', '동구'], ['대전', '중구'], ['대전', '대덕구'],
  ['강원', '강릉시'], ['강원', '속초시'], ['강원', '인제군'], ['경북', '경주시'],   // 관심지역 쪽 9곳
];

/**
 * 종부세 지방 저가주택 라목 — 서울 외 수도권 중 인구감소지역이면서 접경지역으로 시행규칙이 정한 곳
 * (종부세법 시행령 §4의2③2호 라목, 시행규칙: 경기 가평군·연천군 2025.3.21 개정 / 인천 강화군·옹진군 2023.3.20 신설)
 */
export const LOWPRICE_CAPITAL_AREAS = [['경기', '가평군'], ['경기', '연천군'], ['인천', '강화군'], ['인천', '옹진군']];

/** 전국 시·군·구 229곳 (2026 기준, 군위군은 대구) */
export const SIGUNGU = {
  서울: ['종로구', '중구', '용산구', '성동구', '광진구', '동대문구', '중랑구', '성북구', '강북구', '도봉구', '노원구', '은평구', '서대문구', '마포구', '양천구', '강서구', '구로구', '금천구', '영등포구', '동작구', '관악구', '서초구', '강남구', '송파구', '강동구'],
  부산: ['중구', '서구', '동구', '영도구', '부산진구', '동래구', '남구', '북구', '해운대구', '사하구', '금정구', '강서구', '연제구', '수영구', '사상구', '기장군'],
  대구: ['중구', '동구', '서구', '남구', '북구', '수성구', '달서구', '달성군', '군위군'],
  인천: ['중구', '동구', '미추홀구', '연수구', '남동구', '부평구', '계양구', '서구', '강화군', '옹진군'],
  광주: ['동구', '서구', '남구', '북구', '광산구'],
  대전: ['동구', '중구', '서구', '유성구', '대덕구'],
  울산: ['중구', '남구', '동구', '북구', '울주군'],
  세종: ['세종특별자치시'],
  경기: ['수원시', '성남시', '의정부시', '안양시', '부천시', '광명시', '평택시', '동두천시', '안산시', '고양시', '과천시', '구리시', '남양주시', '오산시', '시흥시', '군포시', '의왕시', '하남시', '용인시', '파주시', '이천시', '안성시', '김포시', '화성시', '광주시', '양주시', '포천시', '여주시', '연천군', '가평군', '양평군'],
  강원: ['춘천시', '원주시', '강릉시', '동해시', '태백시', '속초시', '삼척시', '홍천군', '횡성군', '영월군', '평창군', '정선군', '철원군', '화천군', '양구군', '인제군', '고성군', '양양군'],
  충북: ['청주시', '충주시', '제천시', '보은군', '옥천군', '영동군', '증평군', '진천군', '괴산군', '음성군', '단양군'],
  충남: ['천안시', '공주시', '보령시', '아산시', '서산시', '논산시', '계룡시', '당진시', '금산군', '부여군', '서천군', '청양군', '홍성군', '예산군', '태안군'],
  전북: ['전주시', '군산시', '익산시', '정읍시', '남원시', '김제시', '완주군', '진안군', '무주군', '장수군', '임실군', '순창군', '고창군', '부안군'],
  전남: ['목포시', '여수시', '순천시', '나주시', '광양시', '담양군', '곡성군', '구례군', '고흥군', '보성군', '화순군', '장흥군', '강진군', '해남군', '영암군', '무안군', '함평군', '영광군', '장성군', '완도군', '진도군', '신안군'],
  경북: ['포항시', '경주시', '김천시', '안동시', '구미시', '영주시', '영천시', '상주시', '문경시', '경산시', '의성군', '청송군', '영양군', '영덕군', '청도군', '고령군', '성주군', '칠곡군', '예천군', '봉화군', '울진군', '울릉군'],
  경남: ['창원시', '진주시', '통영시', '사천시', '김해시', '밀양시', '거제시', '양산시', '의령군', '함안군', '창녕군', '고성군', '남해군', '하동군', '산청군', '함양군', '거창군', '합천군'],
  제주: ['제주시', '서귀포시'],
};

export const SIDO_LABEL = {
  서울: '서울특별시', 부산: '부산광역시', 대구: '대구광역시', 인천: '인천광역시', 광주: '광주광역시', 대전: '대전광역시',
  울산: '울산광역시', 세종: '세종특별자치시', 경기: '경기도', 강원: '강원특별자치도', 충북: '충청북도', 충남: '충청남도',
  전북: '전북특별자치도', 전남: '전라남도', 경북: '경상북도', 경남: '경상남도', 제주: '제주특별자치도',
};

const key = (sido, name) => `${sido}|${name}`;
const DEPOP_SET = new Set(DEPOP_AREAS.map(([s, n]) => key(s, n)));
const INTEREST_SET = new Set(INTEREST_AREAS.map(([s, n]) => key(s, n)));
const BORDER_SET = new Set(BORDER_AREAS.map(([s, n]) => key(s, n)));
const VITAL_SET = new Set(VITAL_PLUS_AREAS.map(([s, n]) => key(s, n)));
const NEW_DEPOP_SET = new Set(DEPOP_NEW_2026.map(([s, n]) => key(s, n)));
const LOWPRICE_CAPITAL_SET = new Set(LOWPRICE_CAPITAL_AREAS.map(([s, n]) => key(s, n)));

/**
 * 취득일 당시의 인구감소 구분. 2026.10.7 재지정으로 편입된 3곳은 그 전 취득분이면 「관심지역」.
 * @param {{depop:string, depopSince:string|null}} area classifyArea 결과
 * @param {string} [date] 'YYYY-MM-DD' (없으면 현재 구분)
 */
export function depopAt(area, date) {
  if (area.depop === 'depop' && area.depopSince && date && date < area.depopSince) return 'interest';
  return area.depop;
}

/**
 * 종부세 지방 저가주택의 「지역 요건」 판정 (시행령 §4의2③2호 가~라목)
 * @param {object} area classifyArea 결과
 * @param {boolean} [sejongRural=false] 세종시 읍·면 지역 여부
 * @returns {{ ok:boolean, item:'가'|'나'|'다'|'라'|null, label:string }}
 */
export function jongbuLowPriceRegion(area, sejongRural = false) {
  if (area.sido === '서울') return { ok: false, item: null, label: '서울특별시 → 대상 지역 아님' };
  if (area.capital) {
    if (area.lowPriceCapital) return { ok: true, item: '라', label: '라목 — 수도권 중 인구감소지역이면서 접경지역으로 시행규칙이 정한 곳 (가평·연천·강화·옹진)' };
    if (area.depop === 'depop' && area.border) return { ok: false, item: null, label: '수도권 인구감소지역·접경지역이지만 시행규칙이 정한 곳(가평·연천·강화·옹진)이 아님' };
    return { ok: false, item: null, label: `수도권 → 라목은 인구감소지역이면서 접경지역이어야 함 (인구감소지역 ${area.depop === 'depop' ? '○' : '×'} · 접경지역 ${area.border ? '○' : '×'})` };
  }
  if (area.sido === '세종') {
    return sejongRural
      ? { ok: true, item: '다', label: '다목 — 세종특별자치시 읍·면' }
      : { ok: false, item: null, label: '세종특별자치시 동 지역 → 대상 아님 (읍·면만 해당)' };
  }
  if (area.metroCity) {
    return area.gun
      ? { ok: true, item: '나', label: '나목 — 수도권 밖 광역시에 소속된 군' }
      : { ok: false, item: null, label: '광역시의 구 → 대상 아님 (광역시는 군 지역만 해당)' };
  }
  return { ok: true, item: '가', label: '가목 — 수도권 밖의 지역 중 광역시·특별자치시가 아닌 지역' };
}

/**
 * 시·군·구 하나를 세법상 지역 유형으로 분류
 * @returns {{ sido, name, label, depop:'depop'|'interest'|'none', depopSince:string|null, vitalPlus:boolean,
 *   lowPriceCapital:boolean, border:boolean, capital:boolean,
 *   metroCity:boolean, gun:boolean, regionKey:string, regionLabel:string,
 *   secondHomeOk:boolean, jongbuLowPriceOk:boolean, notes:string[] }}
 *   regionKey: local-house-judge.js REGIONS의 key
 */
export function classifyArea(sido, name) {
  const k = key(sido, name);
  const depop = DEPOP_SET.has(k) ? 'depop' : (INTEREST_SET.has(k) ? 'interest' : 'none');
  const border = BORDER_SET.has(k);
  const capital = CAPITAL_SIDO.includes(sido);
  const metroCity = METRO_CITY_SIDO.includes(sido) && !capital;   // 인천은 수도권으로 취급
  const gun = name.endsWith('군');
  const sejong = sido === '세종';

  let regionKey;
  if (capital) regionKey = border ? 'borderCapital' : 'capital';
  else if (metroCity) regionKey = gun ? 'metroCityGun' : 'metroCity';
  else if (sejong) regionKey = 'sejongDong';
  else regionKey = 'province';

  const REGION_LABEL = {
    capital: '수도권 (접경지역 아님)', borderCapital: '수도권 접경지역', metroCity: '광역시(군 제외)',
    metroCityGun: '광역시 소속 군', sejongDong: '세종특별자치시 (동/읍·면 직접 선택)', province: '도 지역 시·군',
  };

  // 조특법 §71의2 세컨드홈 지역 요건: 인구감소(관심)지역 + 수도권(접경 제외)·광역시(군 제외) 아님
  const secondHomeOk = depop !== 'none' && (!capital || border) && !(metroCity && !gun);
  // 종부세 지방 저가주택 지역 요건(시행령 §4의2③2호): 가·나목 + 라목(수도권 4개 군). 세종은 읍·면(다목)만 → 여기서는 false
  const lowPriceCapital = LOWPRICE_CAPITAL_SET.has(k);
  const jongbuLowPriceOk = lowPriceCapital || (!capital && !(metroCity && !gun) && !sejong);
  const vitalPlus = VITAL_SET.has(k);
  const depopSince = NEW_DEPOP_SET.has(k) ? DEPOP_REDESIGNATED : null;

  const notes = [];
  if (depop === 'depop') notes.push(depopSince ? '인구감소지역 (2026.10.7 재지정으로 편입 — 그 전에는 관심지역)' : '인구감소지역 (행안부 2026.10.7 재지정 고시 92곳)');
  if (vitalPlus) notes.push('인구활력+지역 — 지정 기준에서는 벗어났지만 5년간 종전 지원 유지 (세제 특례 적용 여부는 개별 조문 확인)');
  if (depop === 'interest') notes.push('인구감소관심지역 (2026.10.7 재지정 18곳) — 세컨드홈은 2026.1.1 이후 취득분·4억 이하');
  if (border) notes.push(capital ? '수도권 접경지역 (접경지역 지원 특별법) — 수도권이지만 세컨드홈 특례 가능' : '접경지역 (수도권 아님)');
  if (lowPriceCapital) notes.push('종부세 지방 저가주택 가능 — 수도권이지만 인구감소지역·접경지역으로 시행규칙이 정한 곳 (공시가격 4억 이하)');
  if (capital && border && !lowPriceCapital) notes.push('종부세 지방 저가주택은 불가 — 시행규칙이 정한 곳(가평·연천·강화·옹진)이 아님');
  if (capital && !border) notes.push('수도권 → 세컨드홈·농어촌·종부세 지방 저가주택 특례 모두 불가');
  if (metroCity && !gun) notes.push('광역시 → 세컨드홈·종부세 지방 저가주택 특례 불가 (양도세 중과 주택수 3억 제외도 불가)');
  if (metroCity && gun) notes.push('광역시 소속 군 → 광역시 제외 규정의 예외, 특례 가능');
  if (sejong) notes.push('세종: 읍·면 지역이면 소재지 유형을 「세종 읍·면」으로 바꾸세요');
  if (depop === 'none' && !capital) notes.push('인구감소(관심)지역 아님 → 세컨드홈 불가, 종부세 지방 저가주택은 4억 기준');

  return {
    sido, name, label: `${SIDO_LABEL[sido] ?? sido} ${name}`, depop, depopSince, vitalPlus, lowPriceCapital, border, capital, metroCity, gun,
    regionKey, regionLabel: REGION_LABEL[regionKey], secondHomeOk, jongbuLowPriceOk, notes,
  };
}

/** 전체 시·군·구 목록(분류 포함) — 검색·명단 표시용 */
export function allAreas() {
  const out = [];
  for (const [sido, list] of Object.entries(SIGUNGU)) for (const name of list) out.push(classifyArea(sido, name));
  return out;
}

/**
 * 이름 검색 — "강릉", "강릉시", "강원 강릉", "부산 동구" 등. 부분 일치, 시·도 접두어 허용.
 * @returns {Array} classifyArea 결과 배열 (여러 곳 일치 시 모두 반환 — 예: 고성군은 강원·경남)
 */
export function searchAreas(query, limit = 12) {
  const q = String(query ?? '').replace(/\s+/g, ' ').trim();
  if (!q) return [];
  const parts = q.split(' ');
  let sidoFilter = null;
  let term = q;
  if (parts.length >= 2) {
    const s = Object.keys(SIDO_LABEL).find((k) => parts[0].startsWith(k) || SIDO_LABEL[k].startsWith(parts[0]));
    if (s) { sidoFilter = s; term = parts.slice(1).join(' '); }
  }
  const res = [];
  for (const [sido, list] of Object.entries(SIGUNGU)) {
    if (sidoFilter && sido !== sidoFilter) continue;
    for (const name of list) {
      if (name.includes(term) || name.replace(/(시|군|구)$/, '') === term) res.push(classifyArea(sido, name));
    }
  }
  // 정확 일치 우선
  res.sort((a, b) => (b.name === term || b.name.replace(/(시|군|구)$/, '') === term) - (a.name === term || a.name.replace(/(시|군|구)$/, '') === term));
  return res.slice(0, limit);
}
