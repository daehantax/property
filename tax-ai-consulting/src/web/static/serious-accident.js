/**
 * 중대재해처벌법 이행 체크리스트 페이지
 * 판정 엔진(src/core/serious-accident-checklist.js)을 브라우저에서 직접 실행.
 * 체크 상태·이행일은 localStorage에 저장(입력값은 서버로 전송되지 않음).
 */

import {
  TASKS, CYCLES, halfTaskStatus, progress, applicability,
} from '../../core/serious-accident-checklist.js';

const $ = (id) => document.getElementById(id);
const STORE = 'sa-checklist-v1';

const state = loadState();

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || '{}');
    return { checked: s.checked || {}, lastDone: s.lastDone || {}, citizen: !!s.citizen, workers: s.workers ?? 30 };
  } catch {
    return { checked: {}, lastDone: {}, citizen: false, workers: 30 };
  }
}
function saveState() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* ignore */ }
}

function todayISO() {
  const v = $('today').value;
  return v || new Date().toISOString().slice(0, 10);
}

const CYCLE_ORDER = ['base', 'half', 'spot', 'event', 'record'];
const CYCLE_NO = { base: '1', half: '2', spot: '3', event: '4', record: '5' };

function visibleTasks() {
  return TASKS.filter((t) => (t.citizen ? state.citizen : true));
}

function statusChip(t) {
  if (t.cycle !== 'half') return '';
  const r = halfTaskStatus(state.lastDone[t.id] || null, todayISO());
  const txt = { done: r.label, due: `${r.label} · 기한 ${r.deadline}`, overdue: `${r.label} (기한 ${r.deadline})` }[r.status];
  return `<span class="st ${r.status}">${txt}</span>`;
}

function itemRow(t) {
  const done = !!state.checked[t.id];
  const half = t.cycle === 'half'
    ? `<div class="half-ctl"><label>최근 이행일</label><input type="date" data-done="${t.id}" value="${state.lastDone[t.id] || ''}">${statusChip(t)}</div>`
    : '';
  return `
    <div class="item ${done ? 'done' : ''}" data-item="${t.id}">
      <input type="checkbox" class="cbx" data-check="${t.id}" ${done ? 'checked' : ''}>
      <div class="body">
        <div class="t">${t.title}<span class="basis">${t.basis}</span></div>
        <div class="d">${t.detail}</div>
        ${half}
      </div>
    </div>`;
}

function render() {
  // 적용 여부
  const ap = applicability(state.workers);
  const badge = $('applyBadge');
  badge.className = 'apply-badge ' + (ap.applies ? 'yes' : 'no');
  badge.textContent = ap.note;

  // 그룹별 렌더
  const tasks = visibleTasks();
  const html = CYCLE_ORDER.map((ck) => {
    const items = tasks.filter((t) => t.cycle === ck);
    if (!items.length) return '';
    const c = CYCLES[ck];
    return `
      <div class="cyc ${ck}">
        <h3><span class="n">${CYCLE_NO[ck]}</span> ${c.label} <span style="font-weight:400">(${items.length})</span><span class="hint">${c.hint}</span></h3>
        ${items.map(itemRow).join('')}
      </div>`;
  }).join('');
  $('list').innerHTML = html;

  // 진행률
  const ids = tasks.map((t) => t.id);
  const p = progress(ids, ids.filter((id) => state.checked[id]));
  $('pct').textContent = p.pct + '%';
  $('bar').style.width = p.pct + '%';
  const overdue = tasks.filter((t) => t.cycle === 'half' && halfTaskStatus(state.lastDone[t.id] || null, todayISO()).status === 'overdue').length;
  $('progSub').textContent = `완료 ${p.done} / 전체 ${p.total}건`
    + (overdue ? ` · ⚠ 반기 점검 지연 ${overdue}건` : ' · 반기 점검 지연 없음');

  bindItems();
}

function bindItems() {
  $('list').querySelectorAll('[data-check]').forEach((cb) => {
    cb.addEventListener('change', () => {
      state.checked[cb.dataset.check] = cb.checked;
      saveState(); render();
    });
  });
  $('list').querySelectorAll('[data-done]').forEach((inp) => {
    inp.addEventListener('change', () => {
      const id = inp.dataset.done;
      if (inp.value) state.lastDone[id] = inp.value; else delete state.lastDone[id];
      saveState(); render();
    });
  });
}

$('workers').addEventListener('input', () => {
  state.workers = Number(String($('workers').value).replace(/[^\d]/g, '')) || 0;
  saveState(); render();
});
$('today').addEventListener('change', render);
$('citizen').addEventListener('change', () => { state.citizen = $('citizen').checked; saveState(); render(); });
$('printBtn').addEventListener('click', () => window.print());

// 초기화
$('workers').value = state.workers;
$('citizen').checked = state.citizen;
$('today').value = new Date().toISOString().slice(0, 10);
render();
