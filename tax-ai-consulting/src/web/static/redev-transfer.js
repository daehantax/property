/**
 * 재건축·재개발 양도소득세 계산기 페이지
 * 계산 엔진(src/core/redev-transfer-tax.js)을 브라우저에서 직접 실행한다.
 *
 * 화면 구성
 *  - 상단 4개 버튼(mode): 입주권 양도 / 신축주택 양도 / 청산금 수령분 / 대체주택 양도
 *  - 입력 칸은 mode·조합원 구분에 따라 보이기/숨기기 (data-show 속성)
 *  - 필요경비는 EXPENSE_ITEMS(엔진과 공유) 표 + 「항목 추가」 행
 */

import { calcRedevTransferTax, EXPENSE_ITEMS } from '../../core/redev-transfer-tax.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(Number(n)).toLocaleString('ko-KR');
const won = (n) => `${fmt(n)}원`;
const pct = (r) => `${Math.round(r * 1000) / 10}%`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const KOREAN_UNIT = (n) => {
  n = Number(n);
  if (!isFinite(n) || n === 0) return '';
  const eok = Math.floor(n / 100000000);
  const man = Math.round((n % 100000000) / 10000);
  let s = '';
  if (eok) s += eok.toLocaleString('ko-KR') + '억';
  if (man) s += (s ? ' ' : '') + man.toLocaleString('ko-KR') + '만';
  return s ? s + '원' : n.toLocaleString('ko-KR') + '원';
};

let mode = 'newhouse';

const FLOW = {
  inway: `<b>조합원입주권 양도</b> — 관리처분계획인가 후 준공 전에 입주권 상태로 파는 경우입니다.
    원조합원은 양도차익을 <b>인가 전·인가 후</b>로 나누고, 장기보유특별공제는 <b>인가 전 차익에만</b>(취득일~인가일) 적용됩니다.
    입주권에는 다주택 중과세율이 없습니다.`,
  newhouse: `<b>완공 신축주택 양도</b> — 준공(사용승인) 후 주택으로 파는 경우입니다.
    원조합원은 <b>기존주택 취득일부터 보유기간을 통산</b>하고, 청산금을 냈다면 그 부분의 장기보유특별공제는 <b>관리처분인가일부터</b> 셉니다.
    승계조합원은 <b>준공일이 취득일</b>입니다.`,
  cash: `<b>청산금 수령분</b> — 권리가액이 분양가보다 커서 돈으로 돌려받은 청산금은 <b>종전주택의 일부를 판 것</b>으로 보아 양도세를 냅니다.
    양도시기는 <b>소유권이전고시일의 다음 날</b>이고, 1세대1주택이면 비과세(평가액 12억 초과분은 과세)됩니다.`,
  replace: `<b>대체주택 양도</b> — 살던 집이 재건축·재개발에 들어가 공사 기간에 거주하려고 산 집을 파는 경우입니다.
    요건을 모두 갖추면 <b>보유·거주기간과 무관하게 비과세</b>(12억 초과분 과세)되고, 못 갖추면 일반 주택 양도로 과세됩니다.`,
};

// 입력 칸 생성 도우미 ──────────────────────────────────────────────────
// show: 이 칸을 보여 줄 조건 "mode" 또는 "mode:member" 를 공백으로 나열 (없으면 항상 표시)
const wrap = (show, cls, inner) => `<div class="${cls || ''}" ${show ? `data-show="${show}"` : ''}>${inner}</div>`;
const money = (id, label, val, show, hint = '', cls = '') => wrap(show, cls,
  `<label id="${id}-lbl">${label}</label><input id="${id}" data-kind="money" inputmode="numeric" value="${fmt(val)}"><div class="money-hint"></div>${hint ? `<div class="fhint">${hint}</div>` : ''}`);
const date = (id, label, val, show, hint = '', cls = '') => wrap(show, cls,
  `<label id="${id}-lbl">${label}</label><input type="date" id="${id}" value="${val}">${hint ? `<div class="fhint">${hint}</div>` : ''}`);
const num = (id, label, val, show, hint = '', cls = '') => wrap(show, cls,
  `<label id="${id}-lbl">${label}</label><input id="${id}" inputmode="decimal" value="${val}">${hint ? `<div class="fhint">${hint}</div>` : ''}`);
const sel = (id, label, opts, show, hint = '', cls = '') => wrap(show, cls,
  `<label id="${id}-lbl">${label}</label><select id="${id}">${opts.map(([v, t, on]) => `<option value="${v}" ${on ? 'selected' : ''}>${t}</option>`).join('')}</select>${hint ? `<div class="fhint">${hint}</div>` : ''}`);
const YN = (yes) => [['1', '예', yes], ['0', '아니오', !yes]];

const PHASE_LABEL = { pre: '관리처분인가 전 (기존주택 취득·보유)', post: '관리처분인가 후 (신축·입주)', sale: '양도 단계 (양도비)' };

function expenseTable() {
  let html = '<table class="exp"><thead><tr><th>항목</th><th>금액(원)</th><th></th></tr></thead><tbody id="expBody">';
  for (const phase of ['pre', 'post', 'sale']) {
    html += `<tr class="grp" data-phase="${phase}"><td colspan="3">${PHASE_LABEL[phase]}</td></tr>`;
    for (const it of EXPENSE_ITEMS.filter((x) => x.phase === phase)) {
      html += `<tr data-phase="${phase}"><td class="nm"><b>${it.label}</b><span>${it.hint}</span></td>
        <td class="amt"><input data-exp="${it.key}" data-kind="money" inputmode="numeric" value=""></td><td></td></tr>`;
    }
  }
  html += `</tbody></table>
    <button type="button" class="btn-add" id="addExp">＋ 항목 추가 (자본적지출 건별 입력 등)</button>
    <div class="exp-total"><span>필요경비 합계</span><span id="expTotal">0원</span></div>
    <div class="fhint">증빙(세금계산서·카드전표·현금영수증·계좌이체 내역)이 있는 금액만 입력하세요. 취득세는 영수증이 없어도 공제됩니다.</div>`;
  return html;
}

function renderFields() {
  $('fields').innerHTML = `
    <div class="sec" data-show="inway newhouse">
      <h3>① 조합원 구분 · 청산금</h3>
      <div class="grid2">
        ${sel('memberType', '조합원 구분', [['original', '원조합원 (인가일 현재 기존주택 보유)', true], ['successor', '승계조합원 (입주권을 매수)']], '', '', 'full')}
        ${sel('settle', '청산금(분담금)', [['paid', '납부함 (추가분담금)', true], ['received', '지급받음 (환급)'], ['none', '없음']], '')}
        ${money('settleAmount', '청산금 금액', 200_000_000, '')}
      </div>
    </div>

    <div class="sec">
      <h3>② 날짜</h3>
      <div class="grid2">
        ${date('acquireDate', '기존주택 취득일', '2010-03-02', '')}
        ${date('approvalDate', '관리처분계획인가일', '2018-06-01', 'inway:original newhouse:original cash', '소규모재건축 등은 사업시행계획인가일')}
        ${date('completionDate', '신축주택 사용승인일(준공일)', '2022-03-01', 'newhouse')}
        ${date('saleDate', '양도일(잔금일)', '2026-11-20', '')}
      </div>
    </div>

    <div class="sec">
      <h3>③ 금액</h3>
      <div class="grid2">
        ${money('salePrice', '양도가액 (실지거래가액)', 2_000_000_000, 'inway newhouse replace')}
        ${money('cashAmount', '지급받은 청산금 (누적 합계)', 200_000_000, 'cash')}
        ${money('appraisal', '기존건물·부수토지 평가액 (권리가액)', 900_000_000, 'inway:original newhouse:original cash', '관리처분계획에서 정한 가격')}
        ${money('acquirePrice', '기존주택 취득가액', 400_000_000, '')}
      </div>
    </div>

    <div class="sec" data-show="replace">
      <h3>④ 대체주택 특례 요건 <small>§156의2⑤ · 책 258~260쪽</small></h3>
      <div class="grid2">
        ${sel('r-one', '대체주택 취득일 현재 1주택 세대', YN(true), '', '재건축 대상 주택 1채만 보유')}
        ${sel('r-after', '사업시행인가일 이후 대체주택 취득', YN(true), '')}
        ${num('r-replive', '대체주택 세대전원 거주기간(년)', 2, '', '1년 이상 필요')}
        ${sel('r-move', '신축 완성 후 3년 내 세대전원 이사', YN(true), '')}
        ${num('r-newlive', '신축주택 계속 거주기간(년)', 1, '', '1년 이상 필요')}
        ${sel('r-sold', '완성 전 또는 완성 후 3년 내 양도', YN(true), '')}
      </div>
    </div>

    <div class="sec">
      <h3><span data-show="replace">⑤</span><span data-show="inway newhouse cash">④</span> 세대 · 주택 상황 <small>비과세·장특공·중과 판정</small></h3>
      <div class="grid2">
        ${sel('houseStatus', '양도일 현재 세대의 주택 보유', [
          ['single', '다른 주택·입주권·분양권 없음 (1세대1주택)', true],
          ['temp', '일시적 2주택 등 특례 충족 (1주택으로 봄)'],
          ['two', '2주택 (주택+입주권+분양권 합계)'],
          ['three', '3주택 이상'],
        ], '', '', 'full')}
        ${date('otherHouseAcquireDate', '보유 중인 다른 1주택의 취득일', '2025-01-10', 'inway:original', '§89①4 나목: 그 주택 취득 후 3년 이내 입주권 양도', 'full')}
        ${sel('adjAtAcquire', '취득 당시 조정대상지역', YN(false), 'inway newhouse cash', '2017.8.3 이후 조정지역 취득분은 2년 거주 필요')}
        ${num('livePrevYears', '기존주택 거주기간(년)', 5, 'inway:original newhouse:original cash')}
        ${num('liveNewYears', '신축주택 거주기간(년)', 2, 'newhouse')}
        ${sel('saleInAdj', '양도 당시 조정대상지역 소재', YN(false), 'newhouse cash replace', '다주택 중과 판정용')}
        ${sel('heavyExcluded', '중과 제외 주택 해당', YN(false), 'newhouse cash replace', '기준시가 3억 이하 지방주택 등')}
        ${sel('basicDeduct', '올해 기본공제(250만) 사용 가능', YN(true), '')}
      </div>
    </div>

    <div class="sec">
      <h3><span data-show="replace">⑥</span><span data-show="inway newhouse cash">⑤</span> 필요경비 상세 <small>취득세·법무사·중개수수료·자본적지출</small></h3>
      ${expenseTable()}
    </div>`;

  bindMoney($('fields'));
  $('fields').addEventListener('input', updateExpTotal);
  $('fields').addEventListener('change', syncVisibility);
  $('addExp').addEventListener('click', () => addExpRow());
  syncVisibility();
  updateExpTotal();
}

function addExpRow(name = '', amount = '', phase = 'post') {
  const tr = document.createElement('tr');
  tr.className = 'custom';
  tr.innerHTML = `<td class="nm"><input class="c-name" placeholder="내용 (예: 발코니 확장 공사)" style="text-align:left" value="${esc(name)}">
      <select class="c-phase" style="margin-top:4px">
        <option value="pre" ${phase === 'pre' ? 'selected' : ''}>인가 전 지출</option>
        <option value="post" ${phase === 'post' ? 'selected' : ''}>인가 후 지출</option>
        <option value="sale" ${phase === 'sale' ? 'selected' : ''}>양도비</option>
      </select></td>
    <td class="amt"><input class="c-amt" data-kind="money" inputmode="numeric" value="${amount}"></td>
    <td><button type="button" class="btn-del" title="삭제">✕</button></td>`;
  $('expBody').appendChild(tr);
  tr.querySelector('.btn-del').addEventListener('click', () => { tr.remove(); updateExpTotal(); });
  bindMoney(tr);
}

function bindMoney(scope) {
  scope.querySelectorAll('[data-kind="money"]').forEach((inp) => {
    if (inp.dataset.bound) return;
    inp.dataset.bound = '1';
    const hint = inp.nextElementSibling?.classList?.contains('money-hint') ? inp.nextElementSibling : null;
    const update = () => {
      const raw = inp.value.replace(/[^\d]/g, '');
      inp.value = raw ? fmt(raw) : '';
      if (hint) hint.textContent = raw ? KOREAN_UNIT(raw) : '';
    };
    inp.addEventListener('input', update);
    update();
  });
}

const n = (el) => Number(String(el?.value ?? '').replace(/[^\d.-]/g, '')) || 0;
const v = (id) => $(id)?.value ?? '';

/** mode·조합원 구분에 따라 칸 보이기/숨기기 + 라벨 바꾸기 */
function syncVisibility() {
  const member = (mode === 'inway' || mode === 'newhouse') ? v('memberType') : 'original';
  $('fields').querySelectorAll('[data-show]').forEach((el) => {
    const ok = el.dataset.show.split(' ').some((c) => {
      const [m, mem] = c.split(':');
      return m === mode && (!mem || mem === member);
    });
    el.style.display = ok ? '' : 'none';
  });
  const succ = member === 'successor';
  $('acquireDate-lbl').textContent = mode === 'replace' ? '대체주택 취득일' : succ ? '입주권 취득일(잔금일)' : '기존주택 취득일';
  $('acquirePrice-lbl').textContent = mode === 'replace' ? '대체주택 취득가액' : succ ? '입주권 매입가액 (프리미엄 포함)' : '기존주택 취득가액';
  $('saleDate-lbl').textContent = mode === 'cash' ? '양도일 (소유권이전고시일의 다음 날)' : '양도일(잔금일)';
  $('adjAtAcquire-lbl').textContent = succ && mode === 'newhouse' ? '준공일(취득일) 당시 조정대상지역' : '취득 당시 조정대상지역';
  // 승계조합원은 청산금 「지급받음」 선택지 없음
  const settle = $('settle');
  if (settle) {
    settle.querySelector('option[value="received"]').disabled = succ;
    if (succ && settle.value === 'received') settle.value = 'paid';
    $('settleAmount').closest('div').style.display = settle.value === 'none' ? 'none' : '';
    $('settleAmount-lbl').textContent = succ ? '승계 후 본인이 납부한 분담금' : settle.value === 'received' ? '지급받은 청산금' : '납부한 청산금';
  }
  // 다른 주택 취득일: 입주권 + 원조합원 + 「일시적」 선택일 때만
  const oh = $('otherHouseAcquireDate').closest('div');
  if (!(mode === 'inway' && member === 'original' && v('houseStatus') === 'temp')) oh.style.display = 'none';
  // 필요경비: 인가 전/후 구분이 의미 없는 유형은 그룹 제목만 단순화
  const split = member === 'original' && mode !== 'replace';
  $('expBody').querySelectorAll('tr.grp').forEach((tr) => {
    const p = tr.dataset.phase;
    tr.firstElementChild.textContent = split ? PHASE_LABEL[p]
      : { pre: '취득 단계', post: mode === 'replace' ? '보유 단계 (자본적지출)' : '신축·입주 단계', sale: '양도 단계 (양도비)' }[p];
  });
}

function collectExpenses() {
  const expenses = {};
  $('expBody').querySelectorAll('[data-exp]').forEach((inp) => { expenses[inp.dataset.exp] = n(inp); });
  const capexList = [...$('expBody').querySelectorAll('tr.custom')].map((tr) => ({
    name: tr.querySelector('.c-name').value.trim(),
    amount: n(tr.querySelector('.c-amt')),
    phase: tr.querySelector('.c-phase').value,
  }));
  return { expenses, capexList };
}

function updateExpTotal() {
  if (!$('expBody')) return;
  const { expenses, capexList } = collectExpenses();
  const total = Object.values(expenses).reduce((s, x) => s + x, 0) + capexList.reduce((s, x) => s + x.amount, 0);
  $('expTotal').textContent = `${won(total)}${total ? ` (${KOREAN_UNIT(total)})` : ''}`;
}

// ── 결과 렌더링 ───────────────────────────────────────────────────────
const amt = (x) => `<td class="n${x < 0 ? ' neg' : ''}">${x < 0 ? '△' : ''}${fmt(Math.abs(x))}</td>`;
function checkRow(c) {
  const cls = c.warn ? 'warn' : (c.ok ? 'ok' : 'no');
  const ic = c.warn ? '!' : (c.ok ? '✓' : '✕');
  return `<div class="check ${cls}"><div class="ic">${ic}</div><div><div class="lbl">${c.label}</div><div class="det">${c.detail}</div></div></div>`;
}

function render(r) {
  const box = $('result');
  if (!r.ok) {
    box.innerHTML = `<div class="err"><b>입력을 확인하세요</b><ul style="margin:6px 0 0;padding-left:18px">${r.errors.map((e) => `<li>${e}</li>`).join('')}</ul></div>`;
    $('empty').style.display = 'none'; box.style.display = 'block';
    return;
  }
  const badge = { exempt: '비과세', partial: '부분 비과세', taxable: '과세' }[r.verdict];
  const memberTxt = (r.mode === 'inway' || r.mode === 'newhouse') ? ` · ${r.memberType === 'original' ? '원조합원' : '승계조합원'}` : '';
  const settleTxt = r.settle === 'paid' ? ` · 청산금 납부 ${won(r.settleAmount)}` : r.settle === 'received' ? ` · 청산금 수령 ${won(r.settleAmount)}` : '';
  const PH = { pre: '인가 전', post: '인가 후', sale: '양도비' };

  const gainRows = r.gainSteps.map((s) => s.head
    ? `<tr class="head"><td colspan="2">${s.label}</td></tr>`
    : `<tr class="${s.sub ? 'sub' : ''}"><td>${s.label}</td>${amt(s.amount)}</tr>`).join('');

  const ltdRows = r.ltdRows.map((x) => `<tr>
      <td>${x.label}<small>${x.detail}</small></td>
      ${amt(x.gain)}${amt(x.taxable)}
      <td>${x.period}</td>
      <td class="n">${x.allowed ? `${x.table} ${pct(x.rate)}` : '-'}</td>
      ${amt(-x.amount)}</tr>`).join('');

  const cmp = r.compare;
  const cmpRows = [
    `<tr><td>기본세율<small>과세표준 × 세율 − 누진공제</small></td><td class="n">${fmt(cmp.basicTax)}</td></tr>`,
    cmp.shortRate ? `<tr><td>단기양도 ${pct(cmp.shortRate)}<small>보유 만 ${r.holdYearsRate}년 (기산일 ${r.rateStart.replace(/-/g, '.')})</small></td><td class="n">${fmt(cmp.shortTax)}</td></tr>` : '',
    r.heavy.applied ? `<tr><td>다주택 중과<small>${r.heavy.reason}</small></td><td class="n">${fmt(cmp.heavyTax)}</td></tr>` : '',
  ].join('');

  box.innerHTML = `
    <div class="verdict ${r.verdict}">
      <span class="tag">${badge}</span>
      <div class="head">${r.modeLabel}${memberTxt}${settleTxt} — ${r.headline}</div>
      <div class="amount">${won(r.total)}</div>
      <div class="sub">양도소득세 ${won(r.transferTax)} + 지방소득세 ${won(r.localTax)} · 예정신고·납부기한 ${r.filingDue.replace(/-/g, '.')}</div>
    </div>

    <div class="rsec"><h3>1. 1세대 1주택 비과세 판정</h3>${r.checklist.map(checkRow).join('')}</div>

    <div class="rsec"><h3>2. 양도차익 계산</h3>
      <table class="calc"><tbody>${gainRows}
        <tr class="tot"><td>양도차익 합계</td>${amt(r.totalGain)}</tr></tbody></table></div>

    <div class="rsec"><h3>3. 과세대상 양도차익 · 장기보유특별공제</h3>
      ${r.verdict !== 'taxable' ? `<p class="muted" style="margin-top:0">비과세 요건 충족 → 고가주택 기준 ${won(r.highPrice.threshold)} 초과 비율
        (${won(r.highPrice.base)} − ${won(r.highPrice.threshold)}) ÷ ${won(r.highPrice.base)} = <b>${pct(r.highPrice.taxableRatio)}</b>만 과세대상입니다.</p>` : ''}
      <table class="calc ltd"><thead><tr><th>구분</th><th class="n">양도차익</th><th class="n">과세대상</th><th>공제 보유기간</th><th class="n">공제율</th><th class="n">공제액</th></tr></thead>
        <tbody>${ltdRows}
        <tr class="tot"><td>합계</td>${amt(r.totalGain)}${amt(r.taxableGain)}<td></td><td></td>${amt(-r.ltdTotal)}</tr></tbody></table>
      ${!r.heavy.applied && r.heavy.reason ? `<p class="muted">※ ${r.heavy.reason}</p>` : ''}</div>

    <div class="rsec"><h3>4. 과세표준 · 세액</h3>
      <table class="calc"><tbody>
        <tr><td>과세대상 양도차익</td>${amt(r.taxableGain)}</tr>
        <tr><td>(−) 장기보유특별공제</td>${amt(-r.ltdTotal)}</tr>
        <tr class="sub"><td>= 양도소득금액</td>${amt(r.income)}</tr>
        <tr><td>(−) 양도소득 기본공제</td>${amt(-r.basicDeduct)}</tr>
        <tr class="sub"><td>= 과세표준</td>${amt(r.taxBase)}</tr>
        <tr class="head"><td colspan="2">세율 비교 (큰 세액 적용)</td></tr>
        ${cmpRows}
        <tr class="sub"><td>적용 세율: ${r.rateInfo.label}</td>${amt(r.transferTax)}</tr>
        <tr><td>(+) 지방소득세 (양도소득세의 10%)</td>${amt(r.localTax)}</tr>
        <tr class="tot"><td>총 납부세액</td>${amt(r.total)}</tr></tbody></table></div>

    <div class="rsec"><h3>5. 필요경비 명세</h3>
      ${r.expenses.rows.length ? `<table class="calc"><thead><tr><th>항목</th><th>귀속</th><th class="n">금액</th></tr></thead><tbody>
        ${r.expenses.rows.map((x) => `<tr><td>${esc(x.label)}</td><td>${PH[x.phase]}</td>${amt(x.amount)}</tr>`).join('')}
        <tr class="tot"><td>합계 (인가 전 ${fmt(r.expenses.pre)} · 인가 후 ${fmt(r.expenses.post)} · 양도비 ${fmt(r.expenses.sale)})</td><td></td>${amt(r.expenses.total)}</tr></tbody></table>`
    : '<p class="muted" style="margin-top:0">입력한 필요경비가 없습니다. 취득세·법무사·중개수수료·자본적지출을 넣으면 세액이 줄어듭니다.</p>'}</div>

    ${r.notes.length ? `<div class="notes"><b style="font-size:14px;color:#7d6608">확인할 점</b><ul style="padding-left:18px;margin:6px 0 0">${r.notes.map((x) => `<li>${x}</li>`).join('')}</ul></div>` : ''}
    <div class="lawref"><b>근거</b> (책 = 국세청 「2026 주택과 세금」)<br>${r.lawRef.join('<br>')}</div>
    <div class="muted">※ 참고용 계산입니다. 세대 판정, 일시적 2주택 등 특례 충족 여부, 평가액 변경, 1+1 분양, 감면, 세제개편안(2027년 이후 양도분) 등은 반영되지 않을 수 있어 실제 신고 전 세무 전문가 확인이 필요합니다.</div>
    <button class="btn-print" id="printBtn">🖨 계산 내역 인쇄 / PDF 저장</button>`;
  $('empty').style.display = 'none';
  box.style.display = 'block';
  $('printBtn').addEventListener('click', () => window.print());
}

function calc() {
  const { expenses, capexList } = collectExpenses();
  const yes = (id) => v(id) === '1';
  const r = calcRedevTransferTax({
    mode,
    memberType: v('memberType'),
    settle: v('settle'),
    settleAmount: mode === 'cash' ? n($('cashAmount')) : n($('settleAmount')),
    acquireDate: v('acquireDate'),
    approvalDate: v('approvalDate'),
    completionDate: mode === 'newhouse' ? v('completionDate') : '',
    saleDate: v('saleDate'),
    salePrice: n($('salePrice')),
    appraisal: n($('appraisal')),
    acquirePrice: n($('acquirePrice')),
    expenses, capexList,
    houseStatus: v('houseStatus'),
    otherHouseAcquireDate: v('otherHouseAcquireDate'),
    adjAtAcquire: yes('adjAtAcquire'),
    livePrevYears: n($('livePrevYears')),
    liveNewYears: n($('liveNewYears')),
    saleInAdj: yes('saleInAdj'),
    heavyExcluded: yes('heavyExcluded'),
    basicDeductAvailable: yes('basicDeduct'),
    replace: {
      oneHouseAtApproval: yes('r-one'),
      replacementAfterApproval: yes('r-after'),
      replacementLiveYears: n($('r-replive')),
      movedWithin3y: yes('r-move'),
      newHouseLiveYears: n($('r-newlive')),
      soldWithin3y: yes('r-sold'),
    },
  });
  render(r);
}

function setMode(m) {
  mode = m;
  $('modeSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
  $('flowNote').innerHTML = `<div class="flow-note">${FLOW[m]}</div>`;
  syncVisibility();
  $('result').style.display = 'none';
  $('empty').style.display = 'block';
}

$('modeSeg').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (btn) setMode(btn.dataset.mode);
});
$('calcBtn').addEventListener('click', calc);

renderFields();
setMode(mode);
