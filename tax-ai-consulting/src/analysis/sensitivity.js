/**
 * 민감도·손익분기 분석 (장치 3)
 *
 * 하나의 시나리오에서 핵심 입력값(예: 대출 승계액, 보유기간, 수증자 나이)을
 * 범위로 바꿔가며 반복 계산하고, 두 선택지(케이스1 vs 케이스2)의 세부담이
 * 어느 지점에서 역전되는지(손익분기점)를 찾아 표로 제시한다.
 *
 * 순수 계산(엔진)만 사용하므로 AI·네트워크 없이 결정적으로 동작한다.
 */

import * as scenarios from '../scenario/index.js';

const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;

/** 'a.b.c' 경로로 객체 깊은 곳의 값을 설정한 새 객체를 반환 (원본 불변) */
function withPath(obj, path, value) {
  const clone = structuredClone(obj);
  const keys = path.split('.');
  let node = clone;
  for (let i = 0; i < keys.length - 1; i++) {
    if (node[keys[i]] == null || typeof node[keys[i]] !== 'object') node[keys[i]] = {};
    node = node[keys[i]];
  }
  node[keys[keys.length - 1]] = value;
  return clone;
}

/**
 * 시나리오 결과에서 비교 대상 두 선택지의 총 세부담과 라벨을 추출한다.
 * 시나리오마다 summary 키가 다르므로(GrandTotal/Total) 양쪽을 흡수한다.
 */
export function defaultCompare(result) {
  const s = result.summary ?? {};
  const aTotal = s.case1GrandTotal ?? s.case1Total ?? 0;
  const bTotal = s.case2GrandTotal ?? s.case2Total ?? 0;
  return {
    a: { label: result.case1?.label ?? '케이스1', total: aTotal },
    b: { label: result.case2?.label ?? '케이스2', total: bTotal },
  };
}

/**
 * 변수를 범위로 스윕하며 시나리오를 반복 실행한다.
 *
 * @param {object} spec
 * @param {number} spec.scenarioId          1~10
 * @param {object} spec.baseInputs          기준 입력값
 * @param {object} spec.variable            { path, label, values, unit }
 * @param {(r:object)=>object} [spec.compare] 비교 추출기 (기본 defaultCompare)
 * @returns {{ variable, points: Array }} points: [{ value, a, b, diff, winner }]
 */
export function sweep({ scenarioId, baseInputs, variable, compare = defaultCompare }) {
  const run = scenarios[`runScenario${scenarioId}`];
  if (typeof run !== 'function') {
    throw new Error(`알 수 없는 시나리오 ID: ${scenarioId} (1~10만 지원)`);
  }
  if (!variable || !Array.isArray(variable.values) || variable.values.length === 0) {
    throw new Error('variable.values 배열이 필요합니다.');
  }

  const points = variable.values.map((value) => {
    const inputs = withPath(baseInputs, variable.path, value);
    const result = run(inputs);
    const { a, b } = compare(result);
    const diff = a.total - b.total; // >0 이면 b(케이스2)가 유리
    return {
      value,
      a: a.total,
      b: b.total,
      aLabel: a.label,
      bLabel: b.label,
      diff,
      winner: diff === 0 ? 'tie' : diff > 0 ? 'b' : 'a',
    };
  });

  return { variable, points };
}

/**
 * 스윕 결과에서 승자가 뒤바뀌는 손익분기점을 찾는다.
 * 연속한 두 지점의 diff 부호가 바뀌면 선형보간으로 교차 지점을 추정한다.
 *
 * @returns {Array} [{ from, to, crossValue }] (없으면 빈 배열)
 */
export function findBreakEven({ points }) {
  const crossings = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    if (prev.diff === 0) continue;
    const signFlip = (prev.diff < 0 && cur.diff > 0) || (prev.diff > 0 && cur.diff < 0);
    if (!signFlip) continue;
    // 선형보간: diff가 0이 되는 value
    const t = prev.diff / (prev.diff - cur.diff);
    const crossValue = prev.value + t * (cur.value - prev.value);
    crossings.push({
      from: prev.value,
      to: cur.value,
      crossValue,
      beforeWinner: prev.winner,
      afterWinner: cur.winner,
    });
  }
  return crossings;
}

/**
 * 스윕 결과를 마크다운 표 + 손익분기 설명으로 렌더링한다.
 */
export function renderSensitivity(result, { heading = '### 민감도 분석' } = {}) {
  const { variable, points } = result;
  if (points.length === 0) return '';

  const aLabel = points[0].aLabel;
  const bLabel = points[0].bLabel;
  const unit = variable.unit ?? '';
  const fmtVal = (v) =>
    typeof v === 'number' && Math.abs(v) >= 10000 ? won(v) : `${v}${unit}`;

  const out = [
    heading,
    '',
    `**변수: ${variable.label}** — 값에 따라 「${aLabel}」과 「${bLabel}」의 세부담이 어떻게 달라지는지 비교합니다.`,
    '',
    `| ${variable.label} | ${aLabel} | ${bLabel} | 차이(${aLabel}−${bLabel}) | 유리한 쪽 |`,
    '|---|---:|---:|---:|:--:|',
  ];
  for (const p of points) {
    const winner = p.winner === 'tie' ? '동일' : p.winner === 'a' ? aLabel : bLabel;
    const sign = p.diff > 0 ? '+' : '';
    out.push(`| ${fmtVal(p.value)} | ${won(p.a)} | ${won(p.b)} | ${sign}${won(p.diff)} | ${winner} |`);
  }

  const crossings = findBreakEven(result);
  out.push('');
  if (crossings.length === 0) {
    // 부호 역전은 없으나 동점(tie)이 섞일 수 있으므로, 동점이 아닌 지점의
    // 우세한 쪽을 기준으로 설명한다.
    const decisive = points.filter((p) => p.winner !== 'tie');
    if (decisive.length === 0) {
      out.push('> 이 구간 전체에서 두 선택지의 세부담이 동일합니다.');
    } else {
      const w = decisive[decisive.length - 1].winner;
      out.push(`> 이 구간에서는 유불리 역전이 없습니다 — 항상 「${w === 'a' ? aLabel : bLabel}」이(가) 유리합니다.`);
    }
  } else {
    for (const c of crossings) {
      const before = c.beforeWinner === 'a' ? aLabel : bLabel;
      const after = c.afterWinner === 'a' ? aLabel : bLabel;
      out.push(
        `> **손익분기점 ≈ ${fmtVal(Math.round(c.crossValue))}** — 이 값을 경계로 ` +
        `「${before}」에서 「${after}」로 유리한 선택이 바뀝니다.`,
      );
    }
  }
  return out.join('\n');
}
