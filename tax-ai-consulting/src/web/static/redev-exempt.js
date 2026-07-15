/**
 * 재건축·재개발 1세대 1주택 비과세 판정기 페이지
 * 판정 엔진(src/core/redev-exempt.js)을 브라우저에서 직접 실행.
 */

import { judgeInwayExempt, judgeReplacementHouse } from '../../core/redev-exempt.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n).toLocaleString('ko-KR');
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

let mode = 'inway';

const YN = (name, def) => `<select class="${name}"><option value="1" ${def ? 'selected' : ''}>예 (조정대상지역)</option><option value="0" ${def ? '' : 'selected'}>아니오 (비조정)</option></select>`;
const YESNO = (name, def) => `<select class="${name}"><option value="1" ${def ? 'selected' : ''}>예</option><option value="0" ${def ? '' : 'selected'}>아니오</option></select>`;
const money = (cls, val) => `<input class="${cls}" data-kind="money" inputmode="numeric" value="${fmt(val)}"><div class="money-hint"></div>`;
const date = (cls, val) => `<input type="date" class="${cls}" value="${val}">`;

const FLOW = {
  inway: `<div class="flow-note"><b>조합원입주권 양도</b> — 종전주택이 관리처분계획인가로 입주권이 된 <b>원조합원</b>이 그 입주권을 파는 경우입니다.
    인가일 현재 종전주택이 비과세 요건(보유 2년, 조정 취득분은 거주 2년)을 갖췄고, 양도일 현재 <b>다른 주택이 없거나(가목)</b>
    1주택을 취득한 지 <b>3년 이내(나목)</b>면 비과세됩니다.</div>`,
  replace: `<div class="flow-note"><b>대체주택 특례</b> — 1주택자가 그 주택의 재건축·재개발 기간에 거주 목적으로 <b>대체주택</b>을 취득했다가,
    신축주택 완공 후 요건을 갖추고 대체주택을 파는 경우입니다. 아래 요건을 모두 충족하면 <b>보유·거주기간과 무관하게</b> 비과세됩니다.</div>`,
};

function renderFields() {
  $('flowNote').innerHTML = FLOW[mode];
  if (mode === 'inway') {
    $('fields').innerHTML = `
      <div class="grid2">
        <div><label>종전주택 취득일</label>${date('i-acq', '2018-03-01')}</div>
        <div><label>관리처분계획인가일</label>${date('i-approval', '2022-03-01')}</div>
        <div><label>종전 취득 당시 조정지역</label>${YN('i-adj', false)}</div>
        <div><label>종전주택 실거주(년)</label><input class="i-live" inputmode="numeric" value="0"></div>
        <div><label>조합원입주권 양도일</label>${date('i-sale', '2024-06-01')}</div>
        <div><label>양도가액</label>${money('i-price', 1_000_000_000)}</div>
        <div class="full"><label>양도일 현재 다른 주택 보유</label>
          <select class="i-other">
            <option value="none" selected>다른 주택 없음 (§89①4 가목)</option>
            <option value="one-temp">1주택 보유 (§89①4 나목 · 일시적)</option>
            <option value="multi">2주택 이상 보유</option>
          </select>
        </div>
      </div>
      <div class="sub-new" id="newBox" style="display:none">
        <div class="grid2"><div class="full"><label>보유 중인 그 주택의 취득일</label>${date('i-newacq', '2023-01-01')}</div></div>
        <div class="req-note">나목: 그 주택 취득 후 3년 이내에 입주권을 양도해야 비과세됩니다.</div>
      </div>`;
  } else {
    $('fields').innerHTML = `
      <div class="grid2">
        <div><label>사업시행인가일 현재 1주택 세대</label>${YESNO('r-one', true)}</div>
        <div><label>대체주택을 인가일 이후 취득</label>${YESNO('r-after', true)}</div>
        <div><label>대체주택 실거주(년)</label><input class="r-replive" inputmode="numeric" value="1"></div>
        <div><label>완공 후 3년 내 세대전원 이사</label>${YESNO('r-move', true)}</div>
        <div><label>신축주택 실거주(년)</label><input class="r-newlive" inputmode="numeric" value="1"></div>
        <div><label>완공 후 3년 내 대체주택 양도</label>${YESNO('r-sold', true)}</div>
        <div><label>대체주택 양도일</label>${date('r-saledate', '2024-06-01')}</div>
        <div><label>대체주택 양도가액</label>${money('r-price', 800_000_000)}</div>
      </div>
      <div class="req-note">대체주택은 사업시행인가일 이후 취득해 1년 이상 거주해야 하고, 신축주택 완공 후 3년 이내에 세대전원이 이사(1년 이상 계속 거주)하고 대체주택을 양도해야 합니다.</div>`;
  }
  bindMoney($('fields'));
  const other = $('fields').querySelector('.i-other');
  if (other) {
    const sync = () => { $('newBox').style.display = other.value === 'one-temp' ? 'block' : 'none'; };
    other.addEventListener('change', sync); sync();
  }
  $('result').style.display = 'none';
  $('empty').style.display = 'block';
}

function bindMoney(scope) {
  scope.querySelectorAll('[data-kind="money"]').forEach((inp) => {
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

const num = (el) => Number(String(el?.value ?? '').replace(/[^\d.-]/g, '')) || 0;
const val = (cls) => $('fields').querySelector('.' + cls)?.value;

function checkRow(c) {
  const cls = c.warn ? 'warn' : (c.ok ? 'ok' : 'no');
  const ic = c.warn ? '!' : (c.ok ? '✓' : '✕');
  return `<div class="check ${cls}"><div class="ic">${ic}</div><div><div class="lbl">${c.label}</div><div class="det">${c.detail}</div></div></div>`;
}

function render(r) {
  const badge = { exempt: '비과세', partial: '부분 비과세', taxable: '과세' }[r.verdict];
  $('result').innerHTML = `
    <div class="verdict ${r.verdict}">
      <span class="tag">${badge}</span>
      <div class="head">${r.headline}</div>
    </div>
    <div>${r.checklist.map(checkRow).join('')}</div>
    ${r.reasons.length ? `<div class="reasons"><b style="font-size:12.5px;color:#7d6608">참고</b><ul style="padding-left:18px;margin:6px 0 0">${r.reasons.map((x) => `<li>${x}</li>`).join('')}</ul></div>` : ''}
    <div class="lawref">${r.lawRef.join(' · ')}</div>
    <div class="muted">※ 참고용 판정입니다. 승계취득 입주권·세대 판정·부득이한 사유·완공(준공) 시점 등 개별 사실관계는 반영되지 않을 수 있어, 실제 신고 전 세무 전문가 확인이 필요합니다.</div>
  `;
  $('empty').style.display = 'none';
  $('result').style.display = 'block';
}

function judge() {
  if (mode === 'inway') {
    const r = judgeInwayExempt({
      prevAcquireDate: val('i-acq'),
      prevAcquiredInAdjust: val('i-adj') === '1',
      prevLiveYears: num($('fields').querySelector('.i-live')),
      approvalDate: val('i-approval'),
      inwaySaleDate: val('i-sale'),
      otherHouse: val('i-other'),
      newHouseAcquireDate: val('i-newacq'),
      salePrice: num($('fields').querySelector('.i-price')),
    });
    render(r);
  } else {
    const r = judgeReplacementHouse({
      oneHouseAtApproval: val('r-one') === '1',
      replacementAfterApproval: val('r-after') === '1',
      replacementLiveYears: num($('fields').querySelector('.r-replive')),
      movedWithin3y: val('r-move') === '1',
      newHouseLiveYears: num($('fields').querySelector('.r-newlive')),
      soldWithin3y: val('r-sold') === '1',
      salePrice: num($('fields').querySelector('.r-price')),
      saleDate: val('r-saledate'),
    });
    render(r);
  }
}

$('modeSeg').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  mode = btn.dataset.mode;
  $('modeSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
  renderFields();
});
$('judgeBtn').addEventListener('click', judge);

renderFields();
