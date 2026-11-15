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
$('filed_initial').addEventListener('change', () => {
  $('prepaidWrap').style.display = $('filed_initial').checked ? '' : 'none';
});
$('singleHouse').addEventListener('change', () => {
  const on = $('singleHouse').checked;
  $('hpWrap').style.display = on ? '' : 'none';
  $('ltdTable').value = on ? 'table2' : 'table1';
});

function readInput() {
  return {
    acquireDate: $('acquireDate').value,
    acquirePrice: parseMoney($('acquirePrice').value),
    expenses: parseMoney($('expenses').value),
    rightsValue: parseMoney($('rightsValue').value),
    amounts: {
      deposit: parseMoney($('amt_deposit').value),
      mid1: parseMoney($('amt_mid1').value),
      mid2: parseMoney($('amt_mid2').value),
      third: parseMoney($('amt_third').value),
      fourth: parseMoney($('amt_fourth').value),
    },
    dates: { deposit: $('date_deposit').value, mid1: $('date_mid1').value, mid2: $('date_mid2').value },
    singleHouse: $('singleHouse').checked,
    highPriceBase: parseMoney($('highPriceBase').value) || undefined,
    ltdTable: $('ltdTable').value,
    basicDeductUsed: $('basicDeductUsed').checked,
    filed: { initial: $('filed_initial').checked, third: $('filed_third').checked, fourth: $('filed_fourth').checked },
    prepaid: $('filed_initial').checked && $('prepaidTax').value !== ''
      ? { initialTax: parseMoney($('prepaidTax').value), initialLocal: $('prepaidLocal').value === '' ? undefined : parseMoney($('prepaidLocal').value) }
      : undefined,
    excludeExpiredInitial: $('excludeExpired').checked,
    initialDueBasis: $('initialDueBasis').value,
    selected: { initial: $('sel_initial').checked, third: $('sel_third').checked, fourth: $('sel_fourth').checked },
    payDate: $('payDate').value || today(),
  };
}

const STAGE_NAMES = ['최초분까지', '3차까지 누적', '4차까지 누적'];

function calcSheet(r, inp) {
  const s = r.rows.map((x) => x.stage);
  const tbl = r.ltdTable === 'table2' ? '표2(1세대1주택, 연 8%)' : '표1(일반, 연 2%)';
  const line = (label, f, formula, cls = '') =>
    `<tr class="${cls}"><td class="lbl">${label}</td>${s.map((x) => `<td class="num">${f(x)}</td>`).join('')}<td class="formula">${formula}</td></tr>`;
  return `
  <div class="scroll"><table class="sheet">
    <tr><th>구분</th>${STAGE_NAMES.map((n) => `<th>${n}</th>`).join('')}<th>산식</th></tr>
    ${line('① 양도가액(누적 청산금)', (x) => fmt(x.salePrice), '받은 청산금 누계')}
    ${line('안분비율', (x) => pct(x.ratio, 4), `청산금 ÷ 권리가액 ${fmt(inp.rightsValue)}`)}
    ${line('② 취득가액', (x) => fmt(x.acq), `종전 취득가액 ${fmt(inp.acquirePrice)} × 안분비율`)}
    ${line('③ 필요경비', (x) => fmt(x.exp), `종전 필요경비 ${fmt(inp.expenses)} × 안분비율`)}
    ${line('④ 양도차익', (x) => fmt(x.gain), '① − ② − ③')}
    ${r.singleHouse ? line('⑤ 과세 양도차익(9억 초과분)', (x) => fmt(x.taxableGain), s[0].exemptNote || '') : ''}
    ${line(`⑥ 장기보유특별공제`, (x) => `${fmt(x.ltd)}<br><small>${pct(x.ltdRate)}</small>`, `${tbl} · 보유 ${r.years}년`)}
    ${line('⑦ 양도소득금액', (x) => fmt(x.income), (r.singleHouse ? '⑤' : '④') + ' − ⑥')}
    ${line('⑧ 기본공제', (x) => fmt(x.basic), '연 1회 250만')}
    ${line('⑨ 과세표준', (x) => fmt(x.base), '⑦ − ⑧')}
    ${line('⑩ 세율', (x) => `${pct(x.rate)}${x.dc ? `<br><small>누진공제 ${fmt(x.dc)}</small>` : ''}`, r.years < 1 ? '1년 미만 보유 40%' : '2019년 기본세율 6~42%')}
    ${line('⑪ 산출세액(누적)', (x) => fmt(x.tax), '⑨ × ⑩ − 누진공제', 'em')}
    <tr class="em"><td class="lbl">⑫ 차수별 추가세액</td>${r.rows.map((x) => `<td class="num">${fmt(x.addTax)}</td>`).join('')}<td class="formula">이번 누적세액 − 직전 누적세액</td></tr>
    <tr><td class="lbl">⑬ 지방소득세(추가분)</td>${r.rows.map((x) => `<td class="num">${fmt(x.addLocal)}</td>`).join('')}<td class="formula">⑪ × 10% 누적 차액</td></tr>
  </table></div>`;
}

function penaltySheet(r) {
  const rows = r.rows.map((x) => {
    const p = x.penalty;
    const status = x.filed ? '<span class="tag ok">신고완료</span>'
      : x.overdue ? `<span class="tag no">${x.kind === 'late' ? '기한후신고' : '수정신고'}</span>`
        : x.unpaid === 0 && x.addTax > 0 && x.usedTax === 0 ? '<span class="tag ok">제외</span>'
        : '<span class="tag wait">기한 내</span>';
    const segs = p.late.segments.length
      ? p.late.segments.map((g) => `${dot(g.from)}~${dot(g.to)} ${fmt(g.days)}일 × ${(g.rate * 100).toFixed(3)}% = ${fmt(g.amount)}`).join('<br>')
      : '—';
    const filingTxt = x.overdue
      ? `${p.filingRate === 0.1 ? '과소' : '무신고'} ${fmt(x.unpaid)} × ${pct(p.filingRate)} = ${fmt(p.filingRaw)}${p.reduction.rate ? `<br>감면 ${pct(p.reduction.rate)} (${p.reduction.label}) → ${fmt(p.filing)}` : `<br><small>${p.reduction.label}</small>`}`
      : '—';
    return `<tr class="${x.selected ? '' : 'unsel'}">
      <td class="lbl">${x.selected ? '' : '<span class="tag off">미선택</span> '}${x.label}<br><small>${x.key === 'third' ? `수령 ${dot(x.paidDate)} / 확정 ${dot(x.eventDate)}` : x.key === 'fourth' ? `지급 ${dot(x.eventDate)}` : `양도일 ${dot(x.eventDate)}`}</small></td>
      <td class="num">${dot(x.due)}</td>
      <td>${status}</td>
      <td class="num">${x.usedTax ? `<small>추가 ${fmt(x.addTax)}<br>기납부 −${fmt(x.usedTax)}</small><br>` : ''}${fmt(x.unpaid)}</td>
      <td class="formula">${filingTxt}</td>
      <td class="formula">${segs}</td>
      <td class="num">${fmt(p.total)}</td>
    </tr>`;
  }).join('');
  const t = r.totals;
  return `
  <div class="scroll"><table class="sheet">
    <tr><th>차수</th><th>신고기한</th><th>상태</th><th>미납 본세<br><small>(기납부 공제 후)</small></th><th>신고불성실가산세</th><th>납부지연가산세 (구간별)</th><th>가산세 계</th></tr>
    ${rows}
    <tr class="total"><td class="lbl" colspan="3">합계 (선택 차수)</td><td class="num">${fmt(t.unpaidTax)}</td><td class="num">${fmt(t.filingPenalty)}</td><td class="num">${fmt(t.latePenalty)}</td><td class="num">${fmt(t.penalty)}</td></tr>
  </table></div>`;
}

const selLabel = (r) => {
  const s = r.rows.filter((x) => x.selected).map((x) => x.label.split(' ')[0]);
  return s.length === r.rows.length ? '전체 차수' : s.length ? s.join(' + ') : '선택 없음';
};

function comboSheet(r) {
  const cur = r.rows.filter((x) => x.selected).map((x) => x.key).join();
  return `
  <table class="sheet">
    <tr><th>신고하는 차수</th><th>양도세 본세</th><th>양도세 가산세</th><th>지방소득세<br><small>(가산세 포함)</small></th><th>합계</th></tr>
    ${r.combos.map((c) => `<tr class="${c.keys.join() === cur ? 'pick' : ''}">
      <td class="lbl">${c.keys.join() === cur ? '▶ ' : ''}${c.keys.length === r.rows.length ? '전체 (최초분 + 3차 + 4차)' : c.label}</td>
      <td class="num">${fmt(c.unpaidTax)}</td><td class="num">${fmt(c.penalty)}</td>
      <td class="num">${fmt(c.payLocal)}</td><td class="num">${fmt(c.payAll)}</td></tr>`).join('')}
  </table>`;
}

function summarySheet(r) {
  const t = r.totals;
  return `
  <table class="sheet">
    <tr><th>구분</th><th>본세</th><th>신고불성실</th><th>납부지연</th><th>합계</th></tr>
    ${r.prepaid.tax ? `<tr><td class="lbl">결정세액(누적)</td><td class="num">${fmt(t.tax)}</td><td colspan="3" class="formula">양도세 결정세액 / 지방소득세 ${fmt(t.localTax)}</td></tr>
    <tr><td class="lbl">기납부세액(최초분)</td><td class="num">−${fmt(r.prepaid.tax)}</td><td colspan="3" class="formula">지방소득세 기납부 −${fmt(r.prepaid.local)}${r.prepaid.refundTax ? ` · <b>환급 대상 양도세 ${fmt(r.prepaid.refundTax)} / 지방 ${fmt(r.prepaid.refundLocal)}</b>` : ''}</td></tr>` : ''}
    <tr><td class="lbl">양도소득세</td><td class="num">${fmt(t.unpaidTax)}</td><td class="num">${fmt(t.filingPenalty)}</td><td class="num">${fmt(t.latePenalty)}</td><td class="num">${fmt(t.payNational)}</td></tr>
    <tr><td class="lbl">지방소득세 (참고)</td><td class="num">${fmt(t.unpaidLocal)}</td><td class="num">${fmt(t.filingPenaltyLocal)}</td><td class="num">${fmt(t.latePenaltyLocal)}</td><td class="num">${fmt(t.payLocal)}</td></tr>
    <tr class="total"><td class="lbl">총 납부할 세액<br><small>${selLabel(r)}</small></td><td class="num">${fmt(t.unpaidTax + t.unpaidLocal)}</td><td class="num" colspan="2">${fmt(t.penalty + t.penaltyLocal)}</td><td class="num">${fmt(t.payAll)}</td></tr>
    ${r.notSelected.payAll ? `<tr class="unsel"><td class="lbl">미선택 차수 (${dot(r.payDate)} 납부 가정)</td><td class="num">${fmt(r.notSelected.unpaidTax + r.notSelected.unpaidLocal)}</td><td class="num" colspan="2">${fmt(r.notSelected.penalty + r.notSelected.penaltyLocal)}</td><td class="num">${fmt(r.notSelected.payAll)}</td></tr>` : ''}
  </table>`;
}

function render(r, inp) {
  const t = r.totals;
  const warn = r.warnings.length ? `<div class="warn">⚠ ${r.warnings.join('<br>⚠ ')}</div>` : '';
  $('result').innerHTML = `
    <div class="report-actions"><button class="btn-print" id="printBtn" type="button">🖨 명세서 인쇄 / PDF 저장</button></div>
    <div class="report-head">
      <h1>개포래미안 재건축 청산금 양도소득세 계산·가산세 명세서</h1>
      <table>
        <tr><td>양도일</td><td>${dot(r.transferDate)} (이전고시일 다음날)</td><td>취득일</td><td>${dot(inp.acquireDate)} (보유 ${r.years}년)</td></tr>
        <tr><td>권리가액</td><td>${won(inp.rightsValue)}</td><td>신고·납부일</td><td>${dot(r.payDate)}</td></tr>
        <tr><td>최초분 신고</td><td>${r.prepaid.tax ? `신고함 (기납부 ${won(r.prepaid.tax)})` : '미신고'}</td><td></td><td></td></tr>
        <tr><td>적용</td><td>${r.singleHouse ? '1세대1주택(9억 초과분 과세)' : '일반'} · 장특공 ${r.ltdTable === 'table2' ? '표2' : '표1'}</td><td>작성일</td><td>${dot(today())}</td></tr>
      </table>
    </div>
    ${warn}
    <div class="headline">
      <div>지금 납부할 세액 — ${selLabel(r)} (양도세 + 지방소득세, 가산세 포함)</div>
      <div class="big">${won(t.payAll)}</div>
      <div class="row">
        <span>양도세 본세 ${won(t.unpaidTax)}</span><span>가산세 ${won(t.penalty)}</span>
        <span>지방소득세 ${won(t.payLocal)}</span><span>총 결정세액(누적) ${won(t.tax)}</span>
        ${r.prepaid.tax ? `<span>기납부세액 ${won(r.prepaid.tax)}</span>` : ''}${r.prepaid.refundTax ? `<span><b>환급 대상 ${won(r.prepaid.refundTax + r.prepaid.refundLocal)}</b></span>` : ''}
      </div>
    </div>

    <div class="sec-title">1. 양도소득세 계산명세서 (누적 재계산)</div>
    ${calcSheet(r, inp)}

    <div class="sec-title">2. 가산세 명세서 (${dot(r.payDate)} 신고·납부 기준)</div>
    ${penaltySheet(r)}

    <div class="sec-title">3. 총괄표 (${selLabel(r)})</div>
    ${summarySheet(r)}

    <div class="sec-title">4. 차수 선택별 납부세액 비교 (${dot(r.payDate)} 신고·납부 기준)</div>
    ${comboSheet(r)}

    <div class="notes"><ul>
      <li>차수를 골라 신고해도 각 차수 세액은 <b>누적 청산금으로 다시 계산한 차액</b>이므로, 조합별 금액은 차수별 금액의 합입니다. 신고하지 않은 차수는 납부일까지 <b>납부지연가산세가 매일 늘어납니다</b>(4차는 2026.11.30을 넘기면 가산세 발생).</li>
      <li>차수별 추가세액은 누적 청산금으로 세액을 다시 계산한 뒤 직전 누적세액을 뺀 금액입니다(누진세율 반영).</li>
      ${r.prepaid.tax ? '<li>최초분 신고자: 결정세액에서 <b>기납부세액을 공제</b>하고, 부족분에만 과소신고가산세 10%와 납부지연가산세를 계산했습니다. 기납부가 더 많으면 초과분을 다음 차수 추가세액에 충당하고, 남으면 환급 대상으로 표시합니다. 당초 신고는 기한(2020.06.01) 내에 했다고 가정했습니다.</li>' : ''}
      <li>최초분을 신고하지 않았으면 이후 차수도 <b>기한후신고(무신고 20%)</b>, 최초분을 신고했으면 이후 차수는 <b>수정신고(과소신고 10%)</b>로 계산했습니다. 감면(국기법 §48②)은 신고불성실가산세에만 적용됩니다.</li>
      <li>3차는 실제 수령일(2021.03.26)이 아닌 <b>변동금액 확정·통지일(2026.04.30)</b>을 기준으로 신고기한 2026.06.30을 적용했습니다. 사후 확정 청산금을 「확정일이 속하는 달 말일부터 2개월」 안에 신고하는 기준은 <b>법령 근거를 별도로 확인</b>해야 합니다.</li>
      <li>최초분 가산세는 ${inp.initialDueBasis === 'prelim' ? '예정신고기한(2019.07.31)' : '확정신고기한(2020.06.01)'} 다음날부터 기산했습니다. 예정신고 무신고에도 가산세가 부과되므로(확정신고 때 중복 배제), 엄격하게 보면 2019.08.01부터 기산합니다.</li>
      <li>부과제척기간: ${r.statute.years === 7 ? '무신고' : '신고'} ${r.statute.years}년 → <b>${dot(r.statute.expires)}</b> 만료 (최초분 확정신고기한 다음날부터 기산).</li>
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
