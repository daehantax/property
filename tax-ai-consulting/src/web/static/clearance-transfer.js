/**
 * 개포래미안 청산금 양도세 계산기 페이지
 * 계산 엔진(src/core/clearance-transfer-tax.js)을 브라우저에서 직접 실행하고
 * 계산명세서·가산세명세서·총괄표를 A4 인쇄(PDF 저장)용으로 그린다.
 */

import { calcClearanceTransferTax } from '../../core/clearance-transfer-tax.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('ko-KR');
const won = (n) => fmt(n) + '원';
const pct = (r, d = 0) => (r * 100).toFixed(d) + '%';
const dot = (s) => (s ? s.replaceAll('-', '.') : '');
const parseMoney = (v) => Number(String(v).replace(/[^0-9]/g, '')) || 0;
const KOREAN_UNIT = (n) => {
  if (!n) return '';
  const eok = Math.floor(n / 1e8), man = Math.round((n % 1e8) / 1e4);
  let s = '';
  if (eok) s += eok.toLocaleString('ko-KR') + '억';
  if (man) s += (s ? ' ' : '') + man.toLocaleString('ko-KR') + '만';
  return s ? s + '원' : '';
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// 금액 입력: 콤마 표시 + 억/만 힌트
document.querySelectorAll('input[data-kind="money"]').forEach((el) => {
  const hint = el.nextElementSibling;
  const keepHint = hint && hint.textContent;
  const upd = () => {
    const n = parseMoney(el.value);
    el.value = el.value === '' ? '' : n.toLocaleString('ko-KR');
    if (hint && hint.classList.contains('money-hint')) hint.textContent = KOREAN_UNIT(n) || keepHint || '';
  };
  el.addEventListener('input', upd);
  upd();
});

$('payDate').value = today();
const KEYS = ['initial', 'first', 'second', 'third', 'fourth'];
const togglePrepaid = () => {
  $('prepaidWrap').style.display = KEYS.some((k) => $('filed_' + k).checked) ? '' : 'none';
};
KEYS.forEach((k) => $('filed_' + k).addEventListener('change', togglePrepaid));
$('singleHouse').addEventListener('change', () => {
  const on = $('singleHouse').checked;
  $('hpWrap').style.display = on ? '' : 'none';
  $('ltdTable').value = on ? 'table2' : 'table1';
});

function readInput() {
  const anyFiled = KEYS.some((k) => $('filed_' + k).checked);
  return {
    acquireDate: $('acquireDate').value,
    acquirePrice: parseMoney($('acquirePrice').value),
    expenses: parseMoney($('expenses').value),
    rightsValue: parseMoney($('rightsValue').value),
    amounts: Object.fromEntries(KEYS.map((k) => [k, parseMoney($('amt_' + k).value)])),
    selected: Object.fromEntries(KEYS.map((k) => [k, $('sel_' + k).checked])),
    filed: Object.fromEntries(KEYS.map((k) => [k, $('filed_' + k).checked])),
    prepaid: anyFiled && $('prepaidTax').value !== ''
      ? { tax: parseMoney($('prepaidTax').value), local: $('prepaidLocal').value === '' ? undefined : parseMoney($('prepaidLocal').value) }
      : undefined,
    excludeExpired: $('excludeExpired').checked,
    singleHouse: $('singleHouse').checked,
    highPriceBase: parseMoney($('highPriceBase').value) || undefined,
    ltdTable: $('ltdTable').value,
    basicDeductUsed: $('basicDeductUsed').checked,
    initialDueBasis: $('initialDueBasis').value,
    payDate: $('payDate').value || today(),
  };
}

const short = (x) => x.label.replace(' 청산금', '');
const STATUS = {
  excluded: '<span class="tag off">제외(미선택)</span>',
  filed: '<span class="tag ok">기신고</span>',
  expired: '<span class="tag ok">제척기간 경과 제외</span>',
  lateFiling: '<span class="tag no">기한후신고 · 무신고 20%</span>',
  amend: '<span class="tag no">수정신고 · 과소 10%</span>',
  onTime: '<span class="tag wait">기한 내 신고</span>',
};
const rowTag = (x) => (x.included && !x.selected ? '<span class="tag off">미선택</span> ' : '');

// 0. 차수 개요
function overviewSheet(r) {
  return `
  <div class="scroll"><table class="sheet">
    <tr><th>차수</th><th>실제 수령</th><th>수령일(의제)</th><th>청산금</th><th>신고기한</th><th>이번 신고</th><th>상태</th></tr>
    ${r.rows.map((x) => `<tr class="${x.included ? '' : 'unsel'}">
      <td class="lbl">${x.label}</td><td>${x.actual}</td>
      <td class="num">${dot(x.deemed)}${x.key === 'initial' || x.key === 'first' ? ' <small>의제</small>' : ''}</td>
      <td class="num">${fmt(x.amount)}</td><td class="num">${dot(x.due)}</td>
      <td style="white-space:nowrap">${x.selected ? '✔ 대상' : x.filed ? '기신고(누적)' : '제외'}</td><td style="white-space:nowrap">${STATUS[x.status]}</td></tr>`).join('')}
    <tr class="total"><td class="lbl" colspan="3">양도신고 대상 청산금 (기신고분 포함 누적)</td><td class="num">${fmt(r.totals.amount)}</td><td colspan="3"></td></tr>
  </table></div>`;
}

// 1. 계산명세서 — 대상 차수만 시간순 누적
function calcSheet(r, inp) {
  const inc = r.rows.filter((x) => x.included);
  if (!inc.length) return '<p>대상 차수가 없습니다.</p>';
  const s = inc.map((x) => x.stage);
  const names = inc.map((x, i) => (i === 0 ? short(x) : '+ ' + short(x)) + '<br><small>누적</small>');
  const tbl = r.ltdTable === 'table2' ? '표2(1세대1주택, 연 8%)' : '표1(일반, 연 2%)';
  const line = (label, f, formula, cls = '') =>
    `<tr class="${cls}"><td class="lbl">${label}</td>${s.map((x) => `<td class="num">${f(x)}</td>`).join('')}<td class="formula">${formula}</td></tr>`;
  const rowLine = (label, f, formula, cls = '') =>
    `<tr class="${cls}"><td class="lbl">${label}</td>${inc.map((x) => `<td class="num">${f(x)}</td>`).join('')}<td class="formula">${formula}</td></tr>`;
  return `
  <div class="scroll"><table class="sheet">
    <tr><th>구분</th>${names.map((n) => `<th>${n}</th>`).join('')}<th>산식</th></tr>
    ${rowLine('이번 차수 청산금', (x) => fmt(x.amount), '차수별 수령액')}
    ${line('① 양도가액(누적 청산금)', (x) => fmt(x.salePrice), '대상 차수 청산금 누계')}
    ${line('안분비율', (x) => pct(x.ratio, 4), `① ÷ 권리가액 ${fmt(inp.rightsValue)}`)}
    ${line('② 취득가액', (x) => fmt(x.acq), `종전 취득가액 ${fmt(inp.acquirePrice)} × 안분비율`)}
    ${line('③ 필요경비', (x) => fmt(x.exp), `종전 필요경비 ${fmt(inp.expenses)} × 안분비율`)}
    ${line('④ 양도차익', (x) => fmt(x.gain), '① − ② − ③')}
    ${r.singleHouse ? line('⑤ 과세 양도차익(9억 초과분)', (x) => fmt(x.taxableGain), s[0].exemptNote || '') : ''}
    ${line('⑥ 장기보유특별공제', (x) => `${fmt(x.ltd)}<br><small>${pct(x.ltdRate)}</small>`, `${tbl} · 보유 ${r.years}년`)}
    ${line('⑦ 양도소득금액', (x) => fmt(x.income), (r.singleHouse ? '⑤' : '④') + ' − ⑥')}
    ${line('⑧ 기본공제', (x) => fmt(x.basic), '연 1회 250만')}
    ${line('⑨ 과세표준', (x) => fmt(x.base), '⑦ − ⑧')}
    ${line('⑩ 세율', (x) => `${pct(x.rate)}${x.dc ? `<br><small>누진공제 ${fmt(x.dc)}</small>` : ''}`, r.years < 1 ? '1년 미만 보유 40%' : '2019년 기본세율 6~42%')}
    ${line('⑪ 산출세액(누적)', (x) => fmt(x.tax), '⑨ × ⑩ − 누진공제', 'em')}
    ${rowLine('⑫ 차수별 세액', (x) => fmt(x.addTax), '이번 누적세액 − 직전 누적세액', 'em')}
    ${rowLine('⑬ 지방소득세(차수별)', (x) => fmt(x.addLocal), '⑪ × 10% 누적 차액')}
  </table></div>`;
}

// 2. 가산세 명세서 (요약표)
function penaltySheet(r) {
  const rows = r.rows.filter((x) => x.included).map((x) => {
    const p = x.penalty;
    return `<tr class="${x.selected ? '' : 'unsel'}">
      <td class="lbl">${rowTag(x)}${x.label}</td><td class="num">${dot(x.due)}</td><td>${STATUS[x.status]}</td>
      <td class="num">${fmt(x.unpaid)}</td>
      <td class="num">${x.overdue ? `${pct(p.filingRate)}${p.reduction.rate ? ` −${pct(p.reduction.rate)}` : ''}` : '—'}</td>
      <td class="num">${fmt(p.filing)}</td>
      <td class="num">${p.late.days ? fmt(p.late.days) + '일' : '—'}</td>
      <td class="num">${fmt(p.late.total)}</td>
      <td class="num">${fmt(p.total)}</td>
      <td class="num">${fmt(x.due_total)}</td></tr>`;
  }).join('');
  const t = r.totals;
  return `
  <div class="scroll"><table class="sheet">
    <tr><th>차수</th><th>신고기한</th><th>상태</th><th>미납 본세</th><th>신고불성실<br>세율·감면</th><th>신고불성실<br>가산세</th><th>납부지연<br>일수</th><th>납부지연<br>가산세</th><th>가산세 계</th><th>본세+가산세</th></tr>
    ${rows}
    <tr class="total"><td class="lbl" colspan="3">합계 (이번 신고 차수)</td><td class="num">${fmt(t.unpaidTax)}</td><td></td><td class="num">${fmt(t.filingPenalty)}</td><td></td><td class="num">${fmt(t.latePenalty)}</td><td class="num">${fmt(t.penalty)}</td><td class="num">${fmt(t.payNational)}</td></tr>
  </table></div>`;
}

// 3. 차수별 가산세 산정 내역 (상세)
function segLines(late, rateDigits = 3) {
  return late.segments.map((g) =>
    `<tr><td class="k"></td><td>${dot(g.from)} ~ ${dot(g.to)} : ${fmt(g.days)}일 × ${(g.rate * 100).toFixed(rateDigits)}%</td><td class="v">${fmt(g.amount)}</td></tr>`).join('');
}
function detailBox(x, r) {
  const p = x.penalty, L = x.penaltyLocal;
  const head = `<h4>${rowTag(x)}${x.label} — 신고기한 ${dot(x.due)} ${STATUS[x.status]}</h4>`;
  const base = `
    <tr><td class="k">차수별 세액</td><td>누적세액 ${fmt(x.stage.tax)} − 직전 누적세액 ${fmt(x.stage.tax - x.addTax)}</td><td class="v">${fmt(x.addTax)}</td></tr>
    ${x.usedTax ? `<tr><td class="k">기납부 충당</td><td>기납부세액에서 충당</td><td class="v">−${fmt(x.usedTax)}</td></tr>` : ''}
    ${x.prepaidTax ? `<tr><td class="k">기납부</td><td>이미 신고·납부한 세액</td><td class="v">−${fmt(x.prepaidTax)}</td></tr>` : ''}
    <tr><td class="k">미납 본세</td><td>${x.expired ? '제척기간 경과로 제외' : '이번에 납부할 양도소득세'}</td><td class="v">${fmt(x.unpaid)}</td></tr>`;
  if (!x.overdue) {
    const why = x.unpaid === 0 ? '미납세액 없음' : `신고·납부일 ${dot(r.payDate)} ≤ 신고기한 ${dot(x.due)}`;
    return `<div class="calc-box">${head}<table>${base}
      <tr><td class="k">가산세</td><td class="none">${why} → 신고불성실·납부지연 가산세 없음</td><td class="v">0</td></tr>
      <tr><td class="k">지방소득세</td><td>${fmt(x.addLocal)}${x.usedLocal ? ` − 충당 ${fmt(x.usedLocal)}` : ''}${x.prepaidTax ? ' (기납부)' : ''}</td><td class="v">${fmt(x.unpaidLocal)}</td></tr>
      <tr class="sum"><td class="k">차수 합계</td><td>양도세 ${fmt(x.due_total)} + 지방소득세 ${fmt(x.due_totalLocal)}</td><td class="v">${fmt(x.due_total + x.due_totalLocal)}</td></tr>
    </table></div>`;
  }
  const kindTxt = x.kind === 'late' ? '무신고(기한후신고) 20% — 국기법 §47의2' : '과소신고(수정신고) 10% — 국기법 §47의3';
  return `<div class="calc-box">${head}<table>${base}
    <tr><td class="k">① 신고불성실</td><td>${kindTxt}<br>${fmt(x.unpaid)} × ${pct(p.filingRate)}</td><td class="v">${fmt(p.filingRaw)}</td></tr>
    <tr><td class="k"></td><td>감면(§48②): ${p.reduction.label}${p.reduction.rate ? ` → −${fmt(p.filingRaw - p.filing)}` : ''}</td><td class="v">${fmt(p.filing)}</td></tr>
    <tr><td class="k">② 납부지연</td><td>기산 ${dot(p.late.segments[0]?.from)} (신고기한 다음날) ~ 납부일 ${dot(r.payDate)} = ${fmt(p.late.days)}일<br>미납세액 ${fmt(x.unpaid)} × 일수 × 1일 이자율 (이율 개정일 구간별)</td><td class="v"></td></tr>
    ${segLines(p.late)}
    <tr><td class="k"></td><td>납부지연가산세 계 — 국기법 §47의4</td><td class="v">${fmt(p.late.total)}</td></tr>
    <tr><td class="k">③ 양도세 가산세</td><td>① ${fmt(p.filing)} + ② ${fmt(p.late.total)}</td><td class="v">${fmt(p.total)}</td></tr>
    <tr><td class="k">④ 지방소득세</td><td>본세 ${fmt(x.unpaidLocal)} · 신고불성실 ${fmt(x.unpaidLocal)} × ${pct(L.filingRate)} = ${fmt(L.filingRaw)}${p.reduction.rate ? ` → 감면 후 ${fmt(L.filing)}` : ''}</td><td class="v">${fmt(L.filing)}</td></tr>
    ${segLines(L.late)}
    <tr><td class="k"></td><td>지방 납부지연 계${L.late.capped ? ` (계산액 ${fmt(L.late.raw)} → 한도 75% ${fmt(L.late.cap)} 적용)` : ''}</td><td class="v">${fmt(L.late.total)}</td></tr>
    <tr class="sum"><td class="k">차수 합계</td><td>양도세 ${fmt(x.unpaid)} + 가산세 ${fmt(p.total)} / 지방 ${fmt(x.unpaidLocal)} + 가산세 ${fmt(L.total)}</td><td class="v">${fmt(x.due_total + x.due_totalLocal)}</td></tr>
  </table></div>`;
}

const selLabel = (r) => {
  const s = r.rows.filter((x) => x.included && x.selected).map(short);
  return s.length === r.rows.length ? '전체 차수' : s.length ? s.join(' + ') : '선택 없음';
};

function summarySheet(r) {
  const t = r.totals;
  return `
  <table class="sheet">
    <tr><th>구분</th><th>본세</th><th>신고불성실</th><th>납부지연</th><th>합계</th></tr>
    ${r.prepaid.tax ? `<tr><td class="lbl">결정세액(누적)</td><td class="num">${fmt(t.tax)}</td><td colspan="3" class="formula">대상 청산금 ${fmt(t.amount)} 기준 양도세 / 지방소득세 ${fmt(t.localTax)}</td></tr>
    <tr><td class="lbl">기납부세액</td><td class="num">−${fmt(r.prepaid.tax)}</td><td colspan="3" class="formula">지방소득세 기납부 −${fmt(r.prepaid.local)}${r.prepaid.refundTax ? ` · <b>환급 대상 양도세 ${fmt(r.prepaid.refundTax)} / 지방 ${fmt(r.prepaid.refundLocal)}</b>` : ''}</td></tr>` : ''}
    <tr><td class="lbl">양도소득세</td><td class="num">${fmt(t.unpaidTax)}</td><td class="num">${fmt(t.filingPenalty)}</td><td class="num">${fmt(t.latePenalty)}</td><td class="num">${fmt(t.payNational)}</td></tr>
    <tr><td class="lbl">지방소득세 (참고)</td><td class="num">${fmt(t.unpaidLocal)}</td><td class="num">${fmt(t.filingPenaltyLocal)}</td><td class="num">${fmt(t.latePenaltyLocal)}</td><td class="num">${fmt(t.payLocal)}</td></tr>
    <tr class="total"><td class="lbl">총 납부할 세액<br><small>${selLabel(r)}</small></td><td class="num">${fmt(t.unpaidTax + t.unpaidLocal)}</td><td class="num" colspan="2">${fmt(t.penalty + t.penaltyLocal)}</td><td class="num">${fmt(t.payAll)}</td></tr>
    ${r.notSelected.payAll ? `<tr class="unsel"><td class="lbl">기신고 차수 중 미선택분 부족세액</td><td class="num">${fmt(r.notSelected.unpaidTax + r.notSelected.unpaidLocal)}</td><td class="num" colspan="2">${fmt(r.notSelected.penalty + r.notSelected.penaltyLocal)}</td><td class="num">${fmt(r.notSelected.payAll)}</td></tr>` : ''}
    ${r.allSelected ? `<tr class="unsel"><td class="lbl">(비교) 전 차수 신고 시</td><td colspan="3" class="formula">미선택 차수까지 모두 신고하면 ${won(r.allSelected.totals.payAll)} — 지금보다 ${won(r.allSelected.extra)} 많음 (누진세율로 차수 합산 시 세액 증가 포함)</td><td class="num">${fmt(r.allSelected.totals.payAll)}</td></tr>` : ''}
  </table>`;
}

function render(r, inp) {
  const t = r.totals;
  const warn = r.warnings.length ? `<div class="warn">⚠ ${r.warnings.join('<br>⚠ ')}</div>` : '';
  const targets = r.rows.filter((x) => x.included && x.selected);
  $('result').innerHTML = `
    <div class="report-actions"><button class="btn-print" id="printBtn" type="button">🖨 명세서 인쇄 / PDF 저장</button></div>
    <div class="report-head">
      <h1>개포래미안 재건축 청산금 양도소득세 계산·가산세 명세서</h1>
      <table>
        <tr><td>양도일(수령 의제일)</td><td>${dot(r.transferDate)} (이전고시일)</td><td>취득일</td><td>${dot(inp.acquireDate)} (보유 ${r.years}년)</td></tr>
        <tr><td>권리가액</td><td>${won(inp.rightsValue)}</td><td>신고·납부일</td><td>${dot(r.payDate)}</td></tr>
        <tr><td>신고 차수</td><td>${selLabel(r)}</td><td>작성일</td><td>${dot(today())}</td></tr>
        <tr><td>적용</td><td>${r.singleHouse ? '1세대1주택(9억 초과분 과세)' : '일반'} · 장특공 ${r.ltdTable === 'table2' ? '표2' : '표1'}</td><td></td><td></td></tr>
      </table>
    </div>
    ${warn}
    <div class="headline">
      <div>지금 납부할 세액 — ${selLabel(r)} (양도세 + 지방소득세, 가산세 포함)</div>
      <div class="big">${won(t.payAll)}</div>
      <div class="row">
        <span>양도세 본세 ${won(t.unpaidTax)}</span><span>양도세 가산세 ${won(t.penalty)}</span>
        <span>지방소득세 ${won(t.payLocal)}</span><span>대상 청산금 ${won(t.amount)}</span>
        ${r.prepaid.tax ? `<span>기납부세액 ${won(r.prepaid.tax)}</span>` : ''}${r.prepaid.refundTax ? `<span><b>환급 대상 ${won(r.prepaid.refundTax + r.prepaid.refundLocal)}</b></span>` : ''}
      </div>
    </div>

    <div class="sec-title">0. 차수별 수령일·신고기한</div>
    ${overviewSheet(r)}

    <div class="sec-title">1. 양도소득세 계산명세서 (대상 차수 누적 재계산)</div>
    ${calcSheet(r, inp)}

    <div class="sec-title">2. 가산세 명세서 (${dot(r.payDate)} 신고·납부 기준)</div>
    ${penaltySheet(r)}

    <div class="sec-title">3. 차수별 가산세 산정 내역</div>
    ${targets.length ? targets.map((x) => detailBox(x, r)).join('') : '<p>이번에 신고할 차수가 없습니다.</p>'}

    <div class="sec-title">4. 총괄표 (${selLabel(r)})</div>
    ${summarySheet(r)}

    <div class="notes"><ul>
      <li><b>선택한 차수만 양도신고 대상</b>입니다. 선택하지 않은 차수는 양도가액·과세표준에서 빼고, 가산세도 계산하지 않습니다. 이미 신고한 차수는 과세표준에 누적 포함합니다.</li>
      <li>차수별 세액은 대상 차수를 <b>시간순(최초 → 1차 → 2차 → 3차 → 4차)으로 누적</b>해 세액을 다시 계산한 뒤 직전 누적세액을 뺀 금액입니다(누진세율 반영).</li>
      <li>최초 청산금(실제 실입주일)과 1차 청산금(실제 2019.04)은 <b>이전고시일 2019.05.24 수령으로 의제</b>하고, 신고기한은 ${dot(r.initialDue)}${r.initialDue === '2019-07-31' ? '(예정신고기한)' : '(2019년 귀속 확정신고기한, 5.31 일요일 순연)'}을 적용했습니다.</li>
      <li>2차 청산금(2019.08 말 수령)은 수정신고기한 <b>2019.10.31</b>을 적용하여, 신고하지 않았으면 2019.11.01부터 납부일까지 <b>신고불성실 20% + 납부지연가산세</b>를 계산했습니다.</li>
      <li>3차·4차 청산금(2026.09.10 수령)은 신고기한 <b>2026.11.30</b> 이내 신고·납부하면 가산세가 없습니다. 납부일을 기한 뒤로 넣으면 그때부터 가산세가 생깁니다.</li>
      <li>신고하지 않은 차수는 무신고 20%(기한후신고), 이미 신고했으나 기납부세액이 모자란 차수는 과소신고 10%(수정신고)로 계산했습니다. 감면(국기법 §48②)은 신고불성실가산세에만 적용됩니다.</li>
      <li>납부지연가산세 1일 이자율: ~2019.02.11 0.03% / 2019.02.12~2022.02.14 0.025% / 2022.02.15~ 0.022% (구간별 분할 계산).</li>
      <li>부과제척기간: ${r.statute.years === 7 ? '무신고' : '신고'} ${r.statute.years}년 → <b>${dot(r.statute.expires)}</b> 만료 (2019년 귀속 확정신고기한 2020.06.01 다음날부터 기산).</li>
      ${r.singleHouse ? '<li>1세대1주택 고가주택 판정은 청산금이 아닌 <b>종전주택 전체 가액(권리가액)</b>을 기준으로 했습니다. 판정가액 기준은 예규를 확인하세요.</li>' : ''}
      <li>지방소득세 가산세는 지방세기본법 기준 참고치입니다(납부지연 1일 0.025%→0.022%(2022.06.07), 한도 75%). 실제 신고 전 관할 지자체 기준을 확인하세요.</li>
    </ul></div>

    <div class="lawref"><b>근거 법령</b><ul>${r.lawRef.map((l) => `<li>${l}</li>`).join('')}</ul>
    출처: 국세청 「2026 주택과 세금」 208~211쪽 (재건축 청산금 양도차익)</div>`;
  $('empty').style.display = 'none';
  $('result').style.display = '';
  $('printBtn').addEventListener('click', () => window.print());
}

$('calcBtn').addEventListener('click', () => {
  const inp = readInput();
  render(calcClearanceTransferTax(inp), inp);
});
