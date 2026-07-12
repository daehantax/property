/**
 * 웹 입력폼 — 시나리오별 입력 필드 정의
 *
 * 각 시나리오(runScenarioN)가 요구하는 입력을 폼 필드 스펙으로 기술한다.
 * 프런트엔드는 이 스펙으로 폼을 동적으로 그리고, 서버는 같은 스펙으로
 * 입력값을 검증·형변환한다. 보고서의 "입력값" 표 라벨로도 쓰인다.
 *
 * 필드 타입:
 *   money  — 금액(원), 정수
 *   int    — 정수(년·세·채)
 *   rate   — 비율(0~1), 폼에는 %로 표시
 *   select — 보기 중 선택 { value, label }
 *   person — 수증자 묶음 { price(원), age(세) }
 */

const money = (name, label, def, help = '') => ({ name, label, type: 'money', default: def, help });
const int = (name, label, def, help = '') => ({ name, label, type: 'int', default: def, help });
const rate = (name, label, def, help = '') => ({ name, label, type: 'rate', default: def, help });
const person = (name, label, defPrice, defAge, help = '') => ({ name, label, type: 'person', default: { price: defPrice, age: defAge }, help });

const space = () => ({
  name: 'space', label: '전용면적', type: 'select', default: 85,
  options: [
    { value: 85, label: '85㎡ 이하 (국민주택규모)' },
    { value: 86, label: '85㎡ 초과' },
  ],
});
const heavy = () => ({
  name: 'heavy', label: '조정대상지역 (취득세 중과)', type: 'select', default: 1,
  options: [{ value: 1, label: '조정지역' }, { value: 0, label: '비조정지역' }],
});
const isAdj = () => ({
  name: 'isAdj', label: '조정대상지역 (양도세 중과)', type: 'select', default: 1,
  options: [{ value: 1, label: '조정지역' }, { value: 0, label: '비조정지역' }],
});

// 공통 기본값 (마포 사례 기준)
const MP = 1_800_000_000, OP = 1_260_000_000, BP = 900_000_000, LP = 600_000_000, HOP = 1_000_000_000;

const base = () => [
  money('marketPrice', '대상주택 시가', MP),
  money('officialPrice', '대상주택 공시가격(기준시가)', OP),
];
const holding = () => [
  money('holdOfficialPrice', '계속보유주택 공시가격', HOP),
  int('holdPeriod2', '계속보유주택 보유기간(년)', 8),
];
const periods = () => [
  int('holdPeriod', '대상주택 보유기간(년)', 10),
  int('stayPeriod', '대상주택 거주기간(년)', 0),
];

export const SCENARIO_FORMS = [
  {
    id: 1,
    title: '2주택자 — 자녀에게 증여할까? 타인에게 양도할까?',
    fields: [
      ...base(), money('basePrice', '취득가액', BP), ...periods(),
      space(), heavy(), isAdj(), int('ownCount', '보유 주택수', 2),
      ...holding(),
      int('ownerAge', '소유자 나이(만)', 62), int('childAge', '자녀 나이(만)', 32),
    ],
  },
  {
    id: 2,
    title: '2주택자 — 자녀에게 일반증여할까? 부담부증여할까?',
    fields: [
      ...base(), money('basePrice', '취득가액', BP),
      money('loanPrice', '승계 전세보증금·대출', LP),
      ...periods(), space(), heavy(), ...holding(),
      int('ownerAge', '소유자 나이(만)', 62), int('childAge', '자녀 나이(만)', 32),
    ],
  },
  {
    id: 3,
    title: '2주택자 — 자녀 1명에게 증여할까? 여러 명에게 분산증여할까?',
    fields: [
      ...base(), ...periods(), space(), heavy(), ...holding(),
      int('ownerAge', '소유자 나이(만)', 62),
      person('child', '자녀 (지분 가액·나이)', 600_000_000, 32),
      person('childSpouse', '자녀의 배우자 (0원이면 제외)', 600_000_000, 32),
      person('grand1', '손자녀1 (0원이면 제외)', 600_000_000, 5),
      person('grand2', '손자녀2 (0원이면 제외)', 0, 0),
      person('grand3', '손자녀3 (0원이면 제외)', 0, 0),
    ],
  },
  {
    id: 4,
    title: '2주택자 — 자녀 1명 부담부증여 vs 여러 명 부담부증여',
    fields: [
      ...base(), money('basePrice', '취득가액', BP),
      money('loanPrice', '전세·담보대출 전체액', LP),
      ...periods(), space(), heavy(), ...holding(),
      int('ownerAge', '소유자 나이(만)', 62),
      person('child', '자녀 (지분 가액·나이)', 600_000_000, 32),
      person('childSpouse', '자녀의 배우자 (0원이면 제외)', 600_000_000, 32),
      person('grand1', '손자녀1 (0원이면 제외)', 600_000_000, 5),
      person('grand2', '손자녀2 (0원이면 제외)', 0, 0),
      person('grand3', '손자녀3 (0원이면 제외)', 0, 0),
    ],
  },
  {
    id: 5,
    title: '2주택자 — 배우자에게 일반증여할까? 부담부증여할까?',
    fields: [
      ...base(), money('basePrice', '취득가액', BP),
      money('loanPrice', '승계 전세보증금·대출', LP),
      ...periods(), space(), heavy(), ...holding(),
      int('ownerAge', '소유자 나이(만)', 62), int('spouseAge', '배우자 나이(만)', 58),
    ],
  },
  {
    id: 6,
    title: '1주택자 — 일부 지분 배우자 일반증여 vs 부담부증여',
    fields: [
      ...base(), money('basePrice', '취득가액', BP),
      money('loanPrice', '전세·담보대출 전체액', LP),
      rate('partRate', '증여할 지분 비율(%)', 0.5),
      ...periods(), space(), heavy(),
      int('ownerAge', '소유자 나이(만)', 62), int('spouseAge', '배우자 나이(만)', 58),
    ],
  },
  {
    id: 7,
    title: '공동명의 1주택 — 배우자 단독명의로 전환',
    fields: [
      money('marketPrice', '주택 전체 시가', MP),
      money('officialPrice', '주택 전체 공시가격', OP),
      money('basePrice', '주택 전체 취득가액', BP),
      money('loanPrice', '전체 전세·담보대출', LP),
      rate('ownerRate', '소유자 지분(%)', 0.5), rate('spouseRate', '배우자 지분(%)', 0.5),
      ...periods(), space(), heavy(),
      int('ownerAge', '소유자 나이(만)', 62), int('spouseAge', '배우자 나이(만)', 58),
      int('spouseHoldPeriod', '배우자 보유기간(년)', 10),
    ],
  },
  {
    id: 8,
    title: '2주택자 — 배우자에게 증여할까? 타인에게 양도할까?',
    fields: [
      ...base(), money('basePrice', '취득가액', BP), ...periods(),
      space(), heavy(), isAdj(), int('ownCount', '보유 주택수', 2),
      ...holding(),
      int('ownerAge', '소유자 나이(만)', 62), int('spouseAge', '배우자 나이(만)', 58),
    ],
  },
  {
    id: 9,
    title: '2주택자 — 배우자에게만 증여할까? 배우자+자녀에게 분산증여할까?',
    fields: [
      ...base(), int('holdPeriod', '대상주택 보유기간(년)', 10),
      space(), heavy(), ...holding(),
      int('ownerAge', '소유자 나이(만)', 62),
      person('spouse', '배우자 (지분 가액·나이)', 900_000_000, 58),
      person('child1', '자녀1 (0원이면 제외)', 900_000_000, 32),
      person('child2', '자녀2 (0원이면 제외)', 0, 0),
      person('child3', '자녀3 (0원이면 제외)', 0, 0),
      person('child4', '자녀4 (0원이면 제외)', 0, 0),
    ],
  },
  {
    id: 10,
    title: '2주택자 — 배우자에게만 부담부증여 vs 여러 명에게 분산 부담부증여',
    fields: [
      ...base(), money('basePrice', '취득가액', BP),
      money('loanPrice', '전세·담보대출 전체액', LP),
      ...periods(), space(), heavy(), ...holding(),
      int('ownerAge', '소유자 나이(만)', 62),
      person('spouse', '배우자 (지분 가액·나이)', 900_000_000, 58),
      person('childSpouse', '자녀의 배우자 (0원이면 제외)', 450_000_000, 32),
      person('child2', '자녀2 (0원이면 제외)', 450_000_000, 30),
      person('child3', '자녀3 (0원이면 제외)', 0, 0),
      person('child4', '자녀4 (0원이면 제외)', 0, 0),
    ],
  },
];

/** 시나리오 폼 스펙 조회 */
export function getForm(scenarioId) {
  return SCENARIO_FORMS.find((f) => f.id === Number(scenarioId)) ?? null;
}

/** 스펙의 기본값으로 입력 객체 생성 */
export function buildDefaults(scenarioId) {
  const form = getForm(scenarioId);
  if (!form) return null;
  const inputs = {};
  for (const f of form.fields) {
    inputs[f.name] = f.type === 'person' ? { ...f.default } : f.default;
  }
  return inputs;
}

/**
 * 폼 제출값을 스펙에 따라 숫자로 강제 변환·검증한다.
 * 알 수 없는 필드는 버리고, 누락 필드는 기본값으로 채운다.
 * @returns {{ inputs, errors: string[] }}
 */
export function coerceInputs(scenarioId, raw = {}) {
  const form = getForm(scenarioId);
  if (!form) return { inputs: null, errors: [`알 수 없는 시나리오 ID: ${scenarioId}`] };

  const errors = [];
  const inputs = {};
  const num = (v, label) => {
    const n = Number(String(v ?? '').replace(/[,\s원%]/g, ''));
    if (!Number.isFinite(n)) { errors.push(`${label}: 숫자가 아닙니다`); return 0; }
    return n;
  };

  for (const f of form.fields) {
    const v = raw[f.name];
    if (f.type === 'person') {
      const p = v ?? f.default;
      inputs[f.name] = {
        price: num(p?.price ?? f.default.price, `${f.label} 가액`),
        age: num(p?.age ?? f.default.age, `${f.label} 나이`),
      };
    } else if (f.type === 'rate') {
      let r = v == null || v === '' ? f.default : num(v, f.label);
      if (r > 1) r = r / 100; // 폼에서 %로 들어온 경우
      if (r < 0 || r > 1) errors.push(`${f.label}: 0~100% 범위여야 합니다`);
      inputs[f.name] = r;
    } else {
      const n = v == null || v === '' ? f.default : num(v, f.label);
      if ((f.type === 'money' || f.type === 'int') && n < 0) errors.push(`${f.label}: 음수는 허용되지 않습니다`);
      inputs[f.name] = n;
    }
  }
  return { inputs, errors };
}
