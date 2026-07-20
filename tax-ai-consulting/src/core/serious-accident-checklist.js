/**
 * 중대재해처벌법 이행 체크리스트 엔진
 *
 * 「중대재해 처벌 등에 관한 법률」(중처법)과 시행령상 경영책임자등의
 * 안전보건확보의무를 주기별(상시·연간 / 반기 1회 이상 / 수시 / 중대재해 발생 시 등)로
 * 정리하고, 최근 이행일 기준 다음 기한·지연 여부를 계산한다.
 *
 * 근거
 *  - 법 §4(안전보건확보의무), §5(도급·용역·위탁), §6(처벌), §8(경영책임자 안전보건교육)
 *  - 시행령 §4(안전보건관리체계 구축·이행 9개 호), §5(안전·보건 관계 법령 의무이행 관리조치)
 *  - 「산업안전보건법」 §14(대표이사 안전·보건계획 이사회 보고), §36(위험성평가)
 *
 * 적용 범위: 상시근로자 5명 이상 사업장(개인사업주·법인). 5명 미만은 적용 제외.
 *            50명 미만(건설 공사금액 50억원 미만 포함)은 2024.1.27부터 적용.
 */

/** 주기 정의 */
export const CYCLES = {
  base: { key: 'base', label: '상시·연간 (체계 구축)', color: 'base', hint: '평상시 갖추고 매년 갱신·집행' },
  half: { key: 'half', label: '반기 1회 이상 (정기 점검)', color: 'half', hint: '매 반기(상·하반기) 내 최소 1회 점검·조치' },
  spot: { key: 'spot', label: '수시 (사유 발생 시)', color: 'spot', hint: '신규·변경·계약·위험 발생 등 그때그때' },
  event: { key: 'event', label: '중대재해 발생 시', color: 'event', hint: '발생 즉시 대응·사후 조치' },
  record: { key: 'record', label: '기록·보고 (상시)', color: 'record', hint: '점검·조치 결과 문서화·보존' },
};

/**
 * 체크리스트 항목
 * @typedef {{ id:string, cycle:string, title:string, basis:string, detail:string,
 *             citizen?:boolean }} Task
 */

/** @type {Task[]} */
export const TASKS = [
  // ── 상시·연간: 안전보건관리체계 구축 (시행령 §4 각 호 + 산안법) ──
  { id: 'goal', cycle: 'base', title: '안전·보건 목표와 경영방침 수립·게시', basis: '시행령 §4①1',
    detail: '사업장 특성에 맞는 안전·보건 목표와 경영방침을 문서로 정하고 종사자가 볼 수 있게 게시·공표한다. 매년 갱신 권장.' },
  { id: 'org', cycle: 'base', title: '안전·보건 전담조직 설치', basis: '시행령 §4①2',
    detail: '상시근로자 500명 이상이거나 시공능력 상위 200위 이내 건설사 등은 안전·보건 업무를 총괄·관리하는 전담 조직(2명 이상)을 둔다.' },
  { id: 'budget', cycle: 'base', title: '안전·보건 예산 편성·집행', basis: '시행령 §4①4',
    detail: '인력·시설·장비 구비, 유해·위험요인 개선 등에 필요한 예산을 편성하고 용도에 맞게 집행한다. 매년 편성.' },
  { id: 'manager', cycle: 'base', title: '안전관리자·보건관리자 등 배치', basis: '시행령 §4①6 · 산안법 §17~19·22',
    detail: '법정 수 이상의 안전관리자·보건관리자·안전보건관리담당자·산업보건의를 배치한다(겸직·위탁 요건 확인).' },
  { id: 'proc-risk', cycle: 'base', title: '유해·위험요인 확인·개선 업무절차 마련', basis: '시행령 §4①3',
    detail: '사업장 특성에 따른 유해·위험요인을 확인·개선하는 업무절차(또는 산안법 §36 위험성평가 절차)를 마련한다.' },
  { id: 'proc-voice', cycle: 'base', title: '종사자 의견청취 절차 마련', basis: '시행령 §4①7',
    detail: '안전·보건에 관한 종사자 의견을 듣는 절차를 마련한다(산업안전보건위원회·협의체로 갈음 가능).' },
  { id: 'proc-manual', cycle: 'base', title: '중대산업재해 대비 대응 매뉴얼 마련', basis: '시행령 §4①8',
    detail: '작업중지·대피·위험요인 제거 등 대응조치, 구호조치, 추가 피해방지 조치에 관한 매뉴얼을 마련한다.' },
  { id: 'proc-contract', cycle: 'base', title: '도급·용역·위탁 안전보건 기준·절차 마련', basis: '시행령 §4①9',
    detail: '수급인의 산재예방 조치능력·기술 평가기준, 안전보건 관리비용 기준, (건설·조선) 공사·건조기간 기준을 마련한다.' },
  { id: 'resp-power', cycle: 'base', title: '안전보건관리책임자등 권한·예산 부여 및 평가기준 마련', basis: '시행령 §4①5',
    detail: '안전보건관리책임자·관리감독자·안전보건총괄책임자에게 업무 수행에 필요한 권한과 예산을 주고, 업무수행 평가기준을 마련한다.' },
  { id: 'board-plan', cycle: 'base', title: '대표이사 안전·보건계획 수립·이사회 보고·승인', basis: '산안법 §14',
    detail: '상시근로자 500명 이상 회사·시공능력 상위 1000위 건설사 등은 매년 안전·보건계획을 수립해 이사회에 보고하고 승인받는다.' },

  // ── 반기 1회 이상: 정기 점검 (시행령 §4·§5의 "반기 1회 이상") ──
  { id: 'h-risk', cycle: 'half', title: '유해·위험요인 확인·개선 이행 점검', basis: '시행령 §4①3',
    detail: '마련한 절차에 따라 유해·위험요인 확인·개선이 이루어지는지 반기 1회 이상 점검 후 필요한 조치. 위험성평가를 실시·보고받으면 점검한 것으로 본다.' },
  { id: 'h-resp', cycle: 'half', title: '안전보건관리책임자등 업무수행 평가·관리', basis: '시행령 §4①5나',
    detail: '안전보건관리책임자등이 업무를 충실히 수행하는지 평가기준에 따라 반기 1회 이상 평가·관리한다.' },
  { id: 'h-voice', cycle: 'half', title: '종사자 의견청취·개선방안 이행 점검', basis: '시행령 §4①7',
    detail: '종사자 의견을 듣고 필요한 개선방안을 이행하는지 반기 1회 이상 점검 후 필요한 조치(산안위·협의체 청취로 갈음 가능).' },
  { id: 'h-manual', cycle: 'half', title: '중대재해 대응 매뉴얼 조치 이행 점검', basis: '시행령 §4①8',
    detail: '비상대응 매뉴얼에 따라 조치가 이루어지는지 반기 1회 이상 점검한다.' },
  { id: 'h-contract', cycle: 'half', title: '도급·용역·위탁 기준·절차 이행 점검', basis: '시행령 §4①9',
    detail: '수급인 선정·관리가 마련한 기준·절차에 따라 이루어지는지 반기 1회 이상 점검한다.' },
  { id: 'h-law', cycle: 'half', title: '안전·보건 관계 법령 의무이행 점검(+미이행 조치)', basis: '시행령 §5②1·2',
    detail: '적용되는 안전·보건 관계 법령상 의무 이행 여부를 반기 1회 이상 점검(위탁 점검 포함)하고, 미이행 확인 시 인력·예산 등 이행 조치를 한다. 직접 점검 안 하면 지체 없이 결과를 보고받는다.' },
  { id: 'h-edu', cycle: 'half', title: '유해·위험작업 안전·보건 교육 실시 점검(+미실시 조치)', basis: '시행령 §5②3·4',
    detail: '법령상 의무 안전·보건 교육이 실시되었는지 반기 1회 이상 점검하고, 미실시 시 지체 없이 이행 지시·예산 확보 등 조치한다.' },

  // ── 수시: 사유 발생 시 ──
  { id: 's-risk', cycle: 'spot', title: '위험성평가 수시평가', basis: '산안법 §36 · 시행령 §4①3',
    detail: '설비·물질·공정 신규 도입·변경, 중대산업재해·아차사고 발생 등 사유가 있을 때 수시로 위험성평가를 실시·개선한다.' },
  { id: 's-contract', cycle: 'spot', title: '도급·용역·위탁 계약 시 수급인 평가', basis: '시행령 §4①9',
    detail: '도급·용역·위탁 계약을 체결할 때마다 수급인의 산재예방 능력·기술을 기준에 따라 평가하고 선정한다.' },
  { id: 's-voice', cycle: 'spot', title: '종사자 의견 수시 청취·개선', basis: '시행령 §4①7',
    detail: '현장 위험 신고·건의 등 종사자 의견을 수시로 듣고 재해 예방에 필요하면 개선방안을 마련·이행한다.' },
  { id: 's-danger', cycle: 'spot', title: '급박한 위험 시 작업중지·대피', basis: '시행령 §4①8 · 산안법 §51·52',
    detail: '급박한 위험이 있으면 즉시 작업을 중지하고 근로자를 대피시키며 위험요인을 제거한다. 근로자의 작업중지권 보장.' },

  // ── 중대재해 발생 시 ──
  { id: 'e-immediate', cycle: 'event', title: '즉시 대응 — 작업중지·대피·구호·위험제거', basis: '시행령 §4①8',
    detail: '중대산업재해 발생 즉시 작업중지·근로자 대피, 재해자 구호조치, 추가 피해방지 조치를 매뉴얼에 따라 시행한다.' },
  { id: 'e-report', cycle: 'event', title: '중대재해 발생 보고·현장 보존', basis: '산안법 §54',
    detail: '중대재해 발생 시 지체 없이 관할 지방고용노동관서에 보고하고, 원인조사·수사에 대비해 현장을 보존한다.' },
  { id: 'e-recur', cycle: 'event', title: '재발방지대책 수립·이행', basis: '법 §4①2',
    detail: '재해 원인을 조사하고 재발방지대책을 수립·이행한다. 개선·시정명령이 있으면 이를 이행한다.' },
  { id: 'e-edu', cycle: 'event', title: '경영책임자 안전보건교육 이수(20시간)', basis: '법 §8 · 시행령 §6·7',
    detail: '중대산업재해가 발생한 법인·기관의 경영책임자등은 안전보건교육(총 20시간)을 이수해야 한다. 미이수 시 5천만원 이하 과태료.' },
  { id: 'e-coop', cycle: 'event', title: '정부 조사·수사 협조 및 개선명령 이행', basis: '법 §4·§6',
    detail: '고용노동부·수사기관의 조사에 협조하고, 안전보건 개선명령·시정조치를 이행한다.' },

  // ── 중대시민재해 (해당 사업만) ──
  { id: 'c-citizen', cycle: 'base', citizen: true, title: '중대시민재해 안전보건확보의무', basis: '법 §9 · 시행령 §8~11',
    detail: '원료·제조물, 공중이용시설·공중교통수단을 취급·운영·관리하는 경우 이용자 등의 안전을 위한 안전보건관리체계 구축·점검 의무가 별도로 적용된다(반기 1회 이상 점검 포함).' },

  // ── 기록·보고 (상시) ──
  { id: 'r-doc', cycle: 'record', title: '점검·평가·조치 결과 문서화·보존', basis: '입증책임 대비',
    detail: '반기 점검·평가·예산 집행·교육·개선조치 결과를 문서로 남긴다. 중처법에 보존기간 규정은 없으나 산안법(3년)·소송 대비상 5년 이상 보존 권장.' },
];

/** 날짜 헬퍼 (UTC) */
const d = (s) => new Date(`${String(s)}T00:00:00Z`);
const iso = (dt) => dt.toISOString().slice(0, 10);
const halfEnd = (year, half) => (half === 1 ? `${year}-06-30` : `${year}-12-31`);

/** 특정 날짜가 속한 반기 정보 */
export function halfOf(dateISO) {
  const dt = d(dateISO);
  const year = dt.getUTCFullYear();
  const half = dt.getUTCMonth() <= 5 ? 1 : 2; // 0~5월=상반기
  return { year, half, label: `${year}년 ${half === 1 ? '상반기' : '하반기'}`, deadline: halfEnd(year, half) };
}

/** 반기 다음 기한(해당 반기의 다음 반기 마감일) */
function nextHalfDeadline(year, half) {
  return half === 1 ? halfEnd(year, 2) : halfEnd(year + 1, 1);
}

/**
 * 반기 항목의 이행 상태 계산
 * @param {string} lastDoneISO 최근 이행일(없으면 null)
 * @param {string} todayISO 기준일
 * @returns {{ status:'done'|'due'|'overdue', label:string, deadline:string, period:string }}
 */
export function halfTaskStatus(lastDoneISO, todayISO) {
  const cur = halfOf(todayISO);
  const doneThisHalf = lastDoneISO && (() => {
    const h = halfOf(lastDoneISO);
    return h.year === cur.year && h.half === cur.half;
  })();

  if (doneThisHalf) {
    const nd = nextHalfDeadline(cur.year, cur.half);
    return { status: 'done', label: `${cur.label} 이행 완료`, deadline: nd, period: halfOf(nd).label };
  }
  const overdue = d(todayISO).getTime() > d(cur.deadline).getTime();
  return {
    status: overdue ? 'overdue' : 'due',
    label: overdue ? `${cur.label} 기한 경과 — 지연` : `${cur.label} 내 점검 필요`,
    deadline: cur.deadline,
    period: cur.label,
  };
}

/** 진행률 계산 */
export function progress(taskIds, checkedIds) {
  const total = taskIds.length;
  const done = taskIds.filter((id) => checkedIds.includes(id)).length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

/** 적용 대상 판정 */
export function applicability(workers) {
  const n = Number(workers) || 0;
  if (n < 5) return { applies: false, note: '상시근로자 5명 미만 → 중대재해처벌법 적용 제외' };
  if (n < 50) return { applies: true, note: '상시근로자 5~49명 → 2024.1.27부터 전면 적용' };
  return { applies: true, note: '상시근로자 50명 이상 → 2022.1.27부터 적용' };
}
